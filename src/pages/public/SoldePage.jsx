/**
 * pages/public/SoldePage.jsx — v5 espace spectateur (lot 3)
 * Carte portefeuille (solde + QR), commande prête en tête, historique,
 * barre d'onglets en bas : Solde | Commander | Mes résas | Programme.
 * La logique Firestore (compte, transactions, réservations) est celle de la v4.
 *
 * Nouveau style (23/11/2026, maquette validée) : racine `.nv` (styles/nouveau.css), dégradé sur
 * l'accueil et le compte, fond de liste ailleurs, barre d'onglets flottante, gros montants,
 * détail d'une opération en lecture seule, recharge au clavier numérique. Logique inchangée.
 */
import { ensureSpectatorSession, soldeUrl, spectateurOuvert, oublierCompte, rememberedKey, ouvrirParJeton } from '../../firebase/publicSession'
import { jetonTournant, fenetreDe, resteSecondes } from '../../utils/qrTournant'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'qrcode'
import {
  Wallet, Clock, Bookmark, CalendarDays, UtensilsCrossed,
  Plus, Minus, Undo2, ShoppingBag, ChevronRight, ChevronLeft, Mic, KeyRound, CreditCard, Lock, CheckCircle2, ArrowLeft, Globe, Banknote, Heart, UserRound,
  QrCode, MoreHorizontal, Euro, X, Check, Delete, ArrowLeftRight, Moon,
} from 'lucide-react'
import clsx from 'clsx'
import { db } from '../../firebase/config'
import { watchProgramme } from '../../programme/watchProgramme'
import { getSettings, creerCodeEnLigne, annulerCodeEnLigne } from '../../firebase/service'
import { watchCarte } from '../../menu/carte'
import { apiFetch } from '../../firebase/session'
import ArticleInfoModal from '../../components/ArticleInfoModal'
import CommandeDetail from '../../components/CommandeDetail'
import DetailSheet from '../../components/DetailSheet'
import { organiserCarte } from '../../menu/organiser'
import { getIcon } from '../../menu/icons'
import {
  collection, query, where, getDocs, addDoc, onSnapshot,
  updateDoc, doc, getDoc, serverTimestamp, runTransaction, orderBy, increment
} from 'firebase/firestore'
import { fmt, nowStr, initials, makeResaCode as resaCode } from '../../utils/helpers'
import { useNotifications } from '../../hooks/useNotifications'
import NotifBell from '../../components/NotifBell'
import ThemeToggle from '../../components/ThemeToggle'
import { useTheme } from '../../hooks/useTheme'
import { friendlyError } from '../../utils/errors'
import { Button, Badge, Empty, Dialog, AnimatedNumber, HoldButton, SessionBanner } from '../../ui'
import { planRemboursement } from '../../utils/remboursementPlan'
import { effetSolde, signeDe, destinationRemboursement, totauxCompte } from '../../utils/historiqueSpec'
import { montantDon, limiteRemboursement, delaiDepasse, DON_MIN } from '../../utils/dons'
import PlanningSpec from './spectateur/PlanningSpec'
import SoldeChart from './spectateur/SoldeChart'
import sp from './spectateur/SoldePage.module.css'
import { APP_FULL_LABEL } from '../../utils/buildInfo'
import CheckUpdateButton from '../../components/CheckUpdateButton'

const PAGE_SIZE = 15


// Icône, ton et signe selon le type de transaction
const TX_LOOK = {
  credit:      { icon: Plus,        tone: 'success', sign: '+' },
  debit:       { icon: Minus,       tone: 'coral',   sign: '−' },
  reservation: { icon: Clock,       tone: 'warning', sign: ''  },
  annulation:  { icon: Undo2,       tone: 'success', sign: ''  },
  // Remboursements et corrections (20/11/2026) : le signe vient de l'effet sur le solde (utils/historiqueSpec)
  remboursement:     { icon: Undo2, tone: 'neutral', sign: '' },
  credit_correction: { icon: Plus,  tone: 'success', sign: '' },
  debit_correction:  { icon: Minus, tone: 'coral',   sign: '' },
  don:               { icon: Heart, tone: 'coral',   sign: '' },   // don à l'ONG Ylla (20/11/2026)
}
const txLook = (type) => TX_LOOK[type] || { icon: Wallet, tone: 'brand', sign: '' }

const RESA_STATUS = {
  ready:      { label: 'Prête',          tone: 'success' },
  processing: { label: 'En préparation', tone: 'brand'   },
  pending:    { label: 'En attente',     tone: 'warning' },
  collected:  { label: 'Retirée',        tone: 'neutral' },
  cancelled:  { label: 'Annulée',        tone: 'danger'  },
}

// Son de notification (Web Audio API)
function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4)
  } catch {}
}

// demo : données d'exemple injectées par l'aperçu de développement (/ui/spectateur).
// En mode démo, aucun compte n'est lu et rien n'est écrit dans Firestore.
// Codes de commande en ligne (lot 4)
const CODE_STATUS = {
  en_attente: { label: 'À taper sur la borne', tone: 'warning' },
  utilise:    { label: 'Tickets imprimés',     tone: 'success' },
  annule:     { label: 'Annulé',               tone: 'neutral' },
}

export default function SoldePage({ demo = null }) {
  useTheme()
  const params  = new URLSearchParams(window.location.search)
  const urlId   = (params.get('id') || '').toUpperCase()
  // Clé du billet ou du compte (mesure 3) : présente dans le lien et le QR, retenue par le téléphone
  const urlKey  = (params.get('k') || '').toLowerCase()
  const eventId = params.get('ev') || null
  const fromArtiste = params.get('from') === 'artiste'
  const artisteCreneauId = params.get('cr') || null

  const specCol  = (db) => eventId ? collection(db,'events',eventId,'spectateurs')  : collection(db,'spectateurs')
  const txCol    = (db) => eventId ? collection(db,'events',eventId,'transactions') : collection(db,'transactions')
  const resaCol  = (db) => eventId ? collection(db,'events',eventId,'reservations') : collection(db,'reservations')
  const menuCol  = (db) => eventId ? collection(db,'events',eventId,'menu')         : collection(db,'menu')

  const [inputId, setInputId]         = useState(urlId)
  const [spec, setSpec]               = useState(demo?.spec || null)
  const [specDocId, setSpecDocId]     = useState(null)
  const [txs, setTxs]                 = useState(demo?.txs || [])
  const [resas, setResas]             = useState(demo?.resas || [])
  const [menu, setMenu]               = useState(demo?.menu || [])
  const [loading, setLoading]         = useState(false)
  const [err, setErr]                 = useState('')
  // Session expirée (20/11/2026) : la base a refusé de répondre à une écoute du compte
  const [sessionExpiree, setSessionExpiree] = useState(false)
  const [codeTried, setCodeTried]     = useState(false)
  const [tab, setTab]                 = useState(() => (params.get('recharge') || params.get('annule') ? 'recharger' : 'accueil'))
  const [qtys, setQtys]               = useState({})
  const [resaLoading, setResaLoading] = useState(false)
  const [resaDone, setResaDone]       = useState(null)
  const [resaErr, setResaErr]         = useState('')
  const [qrDataUrl, setQrDataUrl]     = useState(null)
  // QR tournant (20/11/2026) : change toutes les 30 s ; code de secours si « Scanner en panne »
  const [qrReste, setQrReste]         = useState(30)
  const [scannerEnPanne, setScannerEnPanne] = useState(!!demo?.scannerEnPanne)
  const [secours, setSecours]         = useState(null)   // { code, expMs }
  const [qrOpen, setQrOpen]           = useState(false)
  const [chartMode, setChartMode]     = useState(false)   // false=liste true=graphe
  const [planningData, setPlanningData] = useState(() => {
    try {
      const cached = localStorage.getItem('yllacash-planning-' + eventId)
      if (cached) {
        const parsed = JSON.parse(cached)
        return parsed.map(cr => ({ ...cr, debut: cr.debut ? new Date(cr.debut) : null, fin: cr.fin ? new Date(cr.fin) : null }))
      }
    } catch {}
    return []
  })
  const [chartZoom, setChartZoom]     = useState(false)   // graphe plein écran
  const [hoverIdx, setHoverIdx]       = useState(null)    // index point survolé
  const [txPage, setTxPage]           = useState(1)       // pagination historique
  const [resaPage, setResaPage]       = useState(1)       // pagination mes résa
  const [eventMeta, setEventMeta]     = useState(demo?.eventMeta || null)
  const [themeColor, setThemeColor]   = useState('#1a6b7a')
  // Lot 4 : menu en rayons et catégories, commande en ligne = code à taper sur la borne
  const [carte, setCarte]             = useState(demo?.carte || { rayons: [], stands: [] })
  const [categories, setCategories]   = useState(demo?.categories || [])
  const [codes, setCodes]             = useState(demo?.codes || [])
  // Remboursement du solde demandé depuis l'espace (20/11/2026)
  const [demandes, setDemandes]       = useState(demo?.demandes || [])
  const [rembBusy, setRembBusy]       = useState(false)
  const [rembErr, setRembErr]         = useState('')
  // Don du solde à l'ONG Ylla (20/11/2026)
  const [donOpen, setDonOpen]         = useState(false)
  const [donChoix, setDonChoix]       = useState(null)     // montant d'une tuile, en centimes ; null = « Autre »
  const [donAutre, setDonAutre]       = useState('')
  const [donBusy, setDonBusy]         = useState(false)
  const [donErr, setDonErr]           = useState('')
  const [donFait, setDonFait]         = useState(null)     // { montant, solde } après un don
  const [rayonId, setRayonId]         = useState(null)
  const [catKey, setCatKey]           = useState(null)
  const [cancelCode, setCancelCode]   = useState(null)
  const [fiche, setFiche]             = useState(null)   // fiche article ouverte (20/11/2026)
  const [cmdOuverte, setCmdOuverte]   = useState(null)   // détail d'une commande au toucher (23/11/2026) : { c, statut }
  // Recharge en ligne par Stripe (19/11/2026) : retour de la page de paiement avec ?recharge=<session> ou ?annule=1
  const [montantRecharge, setMontantRecharge] = useState(2000)
  const [autreMontant, setAutreMontant]       = useState('')
  const [rechargeBusy, setRechargeBusy]       = useState(false)
  const [rechargeErr, setRechargeErr]         = useState('')
  const [retourStripe] = useState(() => ({ session: params.get('recharge') || null, annule: params.get('annule') === '1' }))
  const unsubsRef                     = useRef([])

  const { notifications, nonLuCount, marquerToutLu } = useNotifications({
    specId: spec?.id || null, isStaff: false, eventId,
  })

  useEffect(() => {
    if (demo) return
    getDocs(menuCol(db)).then(s => setMenu(s.docs.map(d => ({ ...d.data(), id: d.id })))).catch(() => {})
  }, [])

  // Rayons, stands et catégories de l'organisateur (lot 4)
  useEffect(() => {
    if (demo || !eventId) return
    const off = watchCarte(eventId, setCarte, () => {})
    getDocs(collection(db, 'events', eventId, 'categories'))
      .then(s => setCategories(s.docs.map(d => ({ ...d.data(), id: d.id })))).catch(() => {})
    return off
  }, [eventId])

  // Compteur de notifs planning non-lues (pour badge sur onglet Programme)
  const nonLuPlanning = notifications.filter(n => n.type === 'PLANNING_MODIF' && !n.lu).length

  // Son quand une notif planning arrive
  const prevNonLuRef = React.useRef(nonLuCount)
  useEffect(() => {
    if (nonLuCount > prevNonLuRef.current) {
      const hasPlanning = notifications.some(n => n.type === 'PLANNING_MODIF' && !n.lu)
      if (hasPlanning) playNotifSound()
    }
    prevNonLuRef.current = nonLuCount
  }, [nonLuCount, notifications])

  // Charger le planning en temps réel si eventId connu
  useEffect(() => {
    if (!eventId) return
    // Programme d'Event Manager si l'événement y est relié, sinon planning de YllaCash
    const unsub = watchProgramme(eventId, data => {
      setPlanningData(data)
      try { localStorage.setItem('yllacash-planning-' + eventId, JSON.stringify(data.map(cr => ({
        ...cr, debut: cr.debut?.toDate ? cr.debut.toDate().toISOString() : cr.debut,
        fin: cr.fin?.toDate ? cr.fin.toDate().toISOString() : cr.fin
      })))) } catch {}
    })
    return unsub
  }, [eventId])

  useEffect(() => {
    if (!eventId) return
    getDoc(doc(db,'events',eventId)).then(snap => { if (snap.exists()) setEventMeta(snap.data()) }).catch(() => {})
    // Charger le thème de l'événement
    getSettings(eventId).then(s => {
      if (s?.theme?.brand) {
        setThemeColor(s.theme.brand)
        document.documentElement.style.setProperty('--brand', s.theme.brand)
        const hex = s.theme.brand.replace('#','')
        const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16)
        const dk = '#'+[r,g,b].map(v=>Math.max(0,Math.round(v*.8)).toString(16).padStart(2,'0')).join('')
        const lt = '#'+[r,g,b].map(v=>Math.min(255,Math.round(v+(255-v)*.88)).toString(16).padStart(2,'0')).join('')
        document.documentElement.style.setProperty('--brand-dark', dk)
        document.documentElement.style.setProperty('--brand-light', lt+'33')
      }
    }).catch(() => {})
  }, [eventId])

  const clearListeners = () => { unsubsRef.current.forEach(u => u()); unsubsRef.current = [] }
  useEffect(() => () => clearListeners(), [])

  // Session expirée (20/11/2026) : une écoute refusée par la base (session absente ou plus valable)
  // n'est plus avalée ; on le retient pour l'expliquer au spectateur. Les autres erreurs (réseau,
  // index manquant) gardent leur comportement d'avant.
  const refusBase = (e) => {
    if (e?.code === 'permission-denied' || e?.code === 'unauthenticated') setSessionExpiree(true)
  }

  const findSpec = async (id = inputId.trim().toUpperCase()) => {
    if (!id) return
    setLoading(true); setErr(''); clearListeners()
    try {
      // Sécurité, lot 2 : le compte ne s'ouvre qu'après accord du serveur (clé, limite d'essais)
      if (!demo && eventId) {
        const s = await ensureSpectatorSession({ ev: eventId, id, cle: id === urlId ? urlKey : '' })
        if (!s.ok) { setErr(s.error); setLoading(false); return }
      }
      const snap = await getDocs(query(specCol(db), where('id','==',id)))
      if (snap.empty) { setErr('Aucun compte trouvé pour : ' + id); setLoading(false); return }
      const d = snap.docs[0]
      setSpec(d.data()); setSpecDocId(d.id); setLoading(false)
      setSessionExpiree(false)   // le compte s'est rouvert : le bandeau disparaît (20/11/2026)

      const unsubSpec = onSnapshot(query(specCol(db), where('id','==',id)),
        snap => { if (!snap.empty) setSpec(snap.docs[0].data()) }, refusBase)

      const unsubTx = onSnapshot(
        query(txCol(db), where('specId','==',id), orderBy('createdAt','desc')),
        snap => setTxs(snap.docs.map(x => x.data())),
        (e) => {
          refusBase(e)
          return onSnapshot(query(txCol(db), where('specId','==',id)),
            snap => setTxs(snap.docs.map(x => x.data())), refusBase)
        }
      )

      const unsubResa = onSnapshot(query(resaCol(db), where('specId','==',id)),
        snap => setResas(snap.docs.map(x => ({ ...x.data(), id: x.id }))), refusBase)

      const unsubCodes = eventId
        ? onSnapshot(query(collection(db, 'events', eventId, 'codes'), where('specId', '==', id)),
            snap => setCodes(snap.docs.map(x => x.data())), refusBase)
        : () => {}

      const unsubDemandes = eventId
        ? onSnapshot(query(collection(db, 'events', eventId, 'demandes-remboursement'), where('specId', '==', id)),
            snap => setDemandes(snap.docs.map(x => ({ ...x.data(), id: x.id }))
              .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))), refusBase)
        : () => {}

      unsubsRef.current = [unsubSpec, unsubTx, unsubResa, unsubCodes, unsubDemandes]
    } catch { setErr('Erreur de connexion.'); setLoading(false) }
  }

  useEffect(() => { if (urlId) findSpec(urlId) }, [urlId, eventId])
  // Sans numéro dans l'adresse (identifiant tapé à la main, retour de Stripe…) : on rouvre le compte
  // déjà ouvert sur ce téléphone plutôt que de redemander l'identifiant (20/11/2026)
  useEffect(() => {
    if (urlId || demo || !eventId) return
    let vivant = true
    // « Lien perdu » : QR à usage unique scanné à la billetterie (…/solde?ev=…&jeton=…)
    const jeton = params.get('jeton')
    if (jeton) {
      setLoading(true)
      ouvrirParJeton(eventId, jeton).then(r => {
        if (!vivant) return
        // Le jeton ne sert qu'une fois : on le retire de l'adresse, qui garde seulement le numéro
        try { window.history.replaceState(null, '', `/solde?ev=${encodeURIComponent(eventId)}${r.ok ? `&id=${r.id}` : ''}`) } catch {}
        if (r.ok) { setInputId(r.id); findSpec(r.id) }
        else { setErr(r.error); setLoading(false) }
      })
      return () => { vivant = false }
    }
    spectateurOuvert(eventId).then(id => { if (vivant && id) { setInputId(id); findSpec(id) } }).catch(() => {})
    return () => { vivant = false }
  }, [eventId])

  // QR tournant : calculé sur le téléphone avec la clé du lien personnel (aucun réseau nécessaire).
  // Sans clé retenue (espace ouvert autrement que par son lien), pas de QR : on ne peut pas payer.
  const cleCompte = spec?.id ? (demo ? 'demo' : (rememberedKey(eventId, spec.id) || (spec.id === urlId ? urlKey : ''))) : ''
  useEffect(() => {
    if (!spec?.id || !cleCompte) { setQrDataUrl(null); return }
    let vivant = true, fenetre = null
    const tick = async () => {
      const ms = Date.now()
      setQrReste(resteSecondes(ms))
      if (fenetreDe(ms) === fenetre) return
      fenetre = fenetreDe(ms)
      try {
        const j = await jetonTournant({ cle: cleCompte, ev: eventId || 'demo', specId: spec.id, ms })
        const u = await QRCode.toDataURL(j, { width: 400, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#003048', light: '#ffffff' } })
        if (vivant) setQrDataUrl(u)
      } catch { if (vivant) setQrDataUrl(null) }
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => { vivant = false; clearInterval(t) }
  }, [spec?.id, cleCompte, eventId])

  // Réglage « Scanner en panne » de l'organisateur : un code de secours s'affiche sous le QR
  useEffect(() => {
    if (demo || !eventId) return
    return onSnapshot(doc(db, 'events', eventId, 'settings', 'global'),
      snap => setScannerEnPanne(snap.data()?.scannerEnPanne === true), () => {})
  }, [eventId])
  useEffect(() => {
    if (!scannerEnPanne || !spec?.id) { setSecours(null); return }
    let vivant = true
    const demander = async () => {
      try {
        if (demo) {
          const L = 'ABCDEFGHJKLMNPRSTUVWXYZ'
          const c = L[Math.floor(Math.random() * L.length)] + L[Math.floor(Math.random() * L.length)] + '-' + String(Math.floor(Math.random() * 10000)).padStart(4, '0')
          if (vivant) setSecours({ code: c }); return
        }
        const r = await apiFetch('/api/qr', { body: { action: 'secours', ev: eventId } })
        if (vivant) setSecours({ code: r.code })
      } catch { if (vivant) setSecours(null) }
    }
    demander()
    const t = setInterval(demander, 60 * 1000)   // le code vaut 90 s : renouvelé chaque minute
    return () => { vivant = false; clearInterval(t) }
  }, [scannerEnPanne, spec?.id, eventId])

  const openQr  = useCallback(async () => { setQrOpen(true) }, [])
  const closeQr = useCallback(() => setQrOpen(false), [])

  const changeQty = (id, d) => setQtys(q => ({ ...q, [id]: Math.max(0,(q[id]||0)+d) }))
  const cartItems = Object.entries(qtys).filter(([,q])=>q>0).map(([id,qty])=>({ ...menu.find(x=>x.id===id), qty }))
  const cartTotal = cartItems.reduce((a,i) => a+(i.prix||0)*i.qty, 0)

  const org = organiserCarte({ menu, categories, rayons: carte.rayons, stands: carte.stands })
  const rayon = org.rayons.find(r => r.id === rayonId) || org.rayons[0] || null
  const cat = rayon ? (rayon.cats.find(c => c.key === catKey) || rayon.cats[0]) : null
  const showRayons = org.rayons.length > 1 || !!org.rayons[0]?.nom

  // Commande en ligne (lot 4) : donne un code à taper sur la borne. Rien n'est débité ici :
  // le solde l'est à la borne, au prix de la carte, quand les tickets sortent.
  const doResa = async () => {
    if (!spec || !cartItems.length) return
    if ((spec.solde || 0) < cartTotal) { setResaErr(`Solde insuffisant : il vous manque ${fmt(cartTotal - (spec.solde || 0))} (solde ${fmt(spec.solde || 0)}).`); return }
    if (demo) {
      const code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0')
      setCodes(c => [...c, { code, origine: 'en-ligne', statut: 'en_attente', items: cartItems.map(i => ({ nom: i.nom, qty: i.qty, prixUnit: i.prix })), total: cartTotal, timestamp: new Date().toISOString() }])
      setResaDone({ code, total: cartTotal }); setQtys({}); return
    }
    setResaLoading(true); setResaErr('')
    try {
      const r = await creerCodeEnLigne({
        specId: spec.id, specNom: spec.nom, specDocId,
        items: cartItems.map(i => ({ id: i.id, nom: i.nom, qty: i.qty, prixUnit: i.prix || 0, standId: i.standId })),
      }, eventId)
      setResaDone(r); setQtys({})
    } catch (e) { setResaErr(friendlyError(e, "La commande n'a pas été enregistrée.")) }
    finally { setResaLoading(false) }
  }

  // Montant choisi (centimes) : bouton rapide ou saisie libre, de 5 € à 200 €
  const montantChoisi = autreMontant !== '' ? Math.round((parseFloat(String(autreMontant).replace(',', '.')) || 0) * 100) : montantRecharge
  const montantOk = Number.isInteger(montantChoisi) && montantChoisi >= 500 && montantChoisi <= 20000
  const allerPayer = async () => {
    if (!montantOk) { setRechargeErr('Choisissez un montant entre 5 € et 200 €.'); return }
    if (demo) { setRechargeErr('Aperçu : le paiement Stripe ne s\'ouvre pas ici.'); return }
    setRechargeBusy(true); setRechargeErr('')
    try {
      const r = await apiFetch('/api/paiement', { body: { action: 'creer', ev: eventId, montant: montantChoisi, retour: soldeUrl(eventId, spec.id, '') } })   // numéro sans la clé : la clé ne part pas chez Stripe ; le téléphone la retient
      window.location.href = r.url
    } catch (e) { setRechargeErr(friendlyError(e, 'Le paiement en ligne est indisponible pour le moment.')); setRechargeBusy(false) }
  }
  const quitterRecharge = () => {
    // Retire ?recharge / ?annule de l'adresse pour ne pas réafficher la confirmation
    try {
      const u = new URL(window.location.href); u.searchParams.delete('recharge'); u.searchParams.delete('annule')
      window.history.replaceState(null, '', u.toString())
    } catch {}
    retourStripe.session = null; retourStripe.annule = false
    go('accueil')
  }
  const rechargeRecue = retourStripe.session ? txs.find(t => t.stripeSession === retourStripe.session) : null

  // ── Remboursement du solde (20/11/2026) ──
  const planRemb = spec ? planRemboursement({ solde: spec.solde || 0, txs }) : null
  const demandeEnCours = demandes.find(d => d.statut === 'en_attente') || null
  const demandeRecente = demandes.find(d => d.timestamp && Date.now() - Date.parse(d.timestamp) < 10 * 60 * 1000) || null
  const demandeVue = demandeEnCours || demandeRecente
  const demanderRemboursement = async () => {
    setRembErr(''); setRembBusy(true)
    try {
      if (demo) {
        const p = planRemb
        setDemandes(d => [{ id: 'demo', statut: p.sumup + p.especes > 0 ? 'en_attente' : 'rembourse', total: p.total, timestamp: new Date().toISOString(), date: nowStr(), heure: new Date().toLocaleTimeString('fr-FR'),
          stripe: { montant: p.stripeTotal, statut: p.stripeTotal ? 'rembourse' : 'sans', rendu: p.stripeTotal },
          sumup: { montant: p.sumup, statut: p.sumup ? 'a_traiter' : 'sans' }, especes: { montant: p.especes, statut: p.especes ? 'a_traiter' : 'sans' } }, ...d])
        return
      }
      await apiFetch('/api/paiement', { body: { action: 'rembourser', ev: eventId } })
    } catch (e) { setRembErr(friendlyError(e, 'La demande n\'a pas pu être envoyée. Réessayez.')) }
    finally { setRembBusy(false) }
  }
  // ── Date limite de remboursement et don à l'ONG Ylla (20/11/2026) ──
  const limiteRemb = limiteRemboursement(eventMeta)
  const limiteTxt = limiteRemb ? new Date(limiteRemb).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
  const rembClos = delaiDepasse(eventMeta)
  const soldeDon = spec?.solde || 0
  const donSaisi = donChoix != null ? donChoix : Math.round((parseFloat(String(donAutre).replace(',', '.')) || 0) * 100)
  const donMontant = montantDon(donSaisi, soldeDon)
  const ouvrirDon = () => {
    setDonErr(''); setDonAutre('')
    setDonChoix(soldeDon >= 1000 ? 1000 : soldeDon)
    setDonOpen(true)
  }
  const donner = async () => {
    if (!donMontant) return
    setDonErr(''); setDonBusy(true)
    try {
      let r
      if (demo) {
        r = { montant: donMontant, solde: soldeDon - donMontant }
        setSpec(x => ({ ...x, solde: r.solde }))
        setTxs(l => [{ type: 'don', label: "Don à l'ONG Ylla", montant: donMontant, date: nowStr(), heure: new Date().toLocaleTimeString('fr-FR'), createdAt: { seconds: Math.floor(Date.now() / 1000) } }, ...l])
      } else {
        r = await apiFetch('/api/paiement', { body: { action: 'don', ev: eventId, montant: donMontant } })
      }
      setDonOpen(false); setDonFait(r); window.scrollTo(0, 0)
    } catch (e) { setDonErr(friendlyError(e, "Le don n'a pas été enregistré. Réessayez.")) }
    finally { setDonBusy(false) }
  }

  const annulerDemande = async () => {
    if (!demandeEnCours) return
    setRembErr('')
    try {
      if (demo) { setDemandes(d => d.map(x => x.id === demandeEnCours.id ? { ...x, statut: 'annule', sumup: { ...x.sumup, statut: x.sumup.statut === 'a_traiter' ? 'annule' : x.sumup.statut }, especes: { ...x.especes, statut: x.especes.statut === 'a_traiter' ? 'annule' : x.especes.statut } } : x)); return }
      await apiFetch('/api/paiement', { body: { action: 'annulerDemande', ev: eventId, id: demandeEnCours.id } })
    } catch (e) { setRembErr(friendlyError(e, 'L\'annulation n\'a pas pu être faite.')) }
  }

  // Solde insuffisant pour le panier : ce qui manque, et recharge préremplie (au moins 5 €)
  const manque = spec ? Math.max(0, cartTotal - (spec.solde || 0)) : 0
  const rechargerLeManque = () => {
    const euros = Math.max(5, Math.ceil(manque / 100))
    setAutreMontant(String(euros)); setRechargeErr(''); go('recharger')
  }
  // Billet annulé (20/11/2026) : le compte ne paie plus et ne se recharge plus ; le solde reste remboursable
  const billetAnnule = !!spec?.billet?.annule

  const annulerCode = async (code) => {
    if (demo) { setCodes(cs => cs.map(c => c.code === code ? { ...c, statut: 'annule' } : c)); return }
    await annulerCodeEnLigne(code, eventId)
  }

  const annuler = async (resaId) => {
    if (demo) { setResas(r => r.map(x => x.id === resaId ? { ...x, status: 'cancelled' } : x)); return }
    const resaRef2 = eventId ? doc(db,'events',eventId,'reservations',resaId) : doc(db,'reservations',resaId)
    // Récupérer la résa avant annulation pour rembourser le stock
    let resaItems = []
    try {
      const resaSnap = await getDoc(resaRef2)
      if (resaSnap.exists() && resaSnap.data().status !== 'cancelled' && resaSnap.data().status !== 'collected') {
        resaItems = resaSnap.data().items || []
      }
    } catch {}
    await updateDoc(resaRef2, {
      status:'cancelled', cancelledBy:spec?.nom||'Spectateur',
      cancelledByRole:'spectateur', cancelledAt:new Date().toISOString(), motifAnnulation:'Annulé par le client',
    })
    // Rembourser le stock menu pour chaque article
    for (const it of resaItems) {
      if (!it.id) continue
      try {
        const menuRef = eventId
          ? doc(db, 'events', eventId, 'menu', it.id)
          : doc(db, 'menu', it.id)
        await updateDoc(menuRef, { stock: increment(it.qty || 1) })
      } catch (e) {
        console.warn('Refund stock error for ' + it.id + ':', e)
      }
    }
    try {
      const auditCol = eventId ? collection(db,'events',eventId,'audit') : collection(db,'audit')
      await addDoc(auditCol, {
        action:'ANNULATION_RESA_SPEC', specId:spec?.id, specNom:spec?.nom, resaId,
        userType:'spectateur', label:`Annulation réservation par ${spec?.nom||'spectateur'}`,
        date:new Date().toLocaleString('fr-FR'), timestamp:new Date().toISOString(), createdAt:serverTimestamp(),
      })
    } catch {}
    await addDoc(txCol(db), {
      specId:spec.id, type:'annulation', label:'Annulation',
      montant:0, staff:'—', date:nowStr(), createdAt:serverTimestamp()
    })
  }

  // ── Calculs dérivés ────────────────────────────────────────────
  const { recharge: totalRecharge, depense: totalDepense, rembourse: totalRembourse, donne: totalDonne } = totauxCompte(txs)
  const nbResas        = resas.length
  const activeResas    = resas.filter(r=>r.status!=='collected'&&r.status!=='cancelled')
  const codesEnLigne   = codes.filter(c => c.origine === 'en-ligne')
    .sort((x, y) => (y.timestamp || '').localeCompare(x.timestamp || ''))
  const codesAttente   = codesEnLigne.filter(c => c.statut === 'en_attente')
  // Tri explicite du plus récent au plus ancien (createdAt.seconds ou date string)
  const txTriees = [...txs].sort((a, b) => {
    const ta = a.createdAt?.seconds ?? a.createdAt?.toMillis?.() ?? (a.date ? new Date(a.date.split('/').reverse().join('-')).getTime()/1000 : 0)
    const tb = b.createdAt?.seconds ?? b.createdAt?.toMillis?.() ?? (b.date ? new Date(b.date.split('/').reverse().join('-')).getTime()/1000 : 0)
    return tb - ta
  })
  const resasTriees    = [...resas].sort((a,b)=>(b.date||'').localeCompare(a.date||''))

  // Pagination historique transactions
  const txTotal  = txTriees.length
  const txPages  = Math.max(1, Math.ceil(txTotal / PAGE_SIZE))
  const txSlice  = txTriees.slice((txPage-1)*PAGE_SIZE, txPage*PAGE_SIZE)

  // Pagination mes résa
  const resaTotal = resasTriees.length
  const resaPages = Math.max(1, Math.ceil(resaTotal / PAGE_SIZE))
  const resaSlice = resasTriees.slice((resaPage-1)*PAGE_SIZE, resaPage*PAGE_SIZE)

  // Timeline pour graphe — reconstitution à partir du solde actuel (centimes)
  const timeline = (() => {
    if (!txTriees.length) return []
    // Partir du solde actuel et remonter à rebours pour trouver le solde après chaque tx
    const currentSolde = spec?.solde || 0  // solde actuel en centimes
    let bal = currentSolde
    // Calculer soldeAprès en remontant du plus récent au plus ancien
    const withBalance = txTriees.map(t => {
      const soldeApres = bal
      // Annuler la transaction pour trouver le solde avant
      bal -= effetSolde(t)   // remboursements, tickets remboursés et corrections compris
      return { ...t, balanceAfter: soldeApres }
    })
    // Remettre dans l'ordre chronologique (plus ancien en premier)
    return withBalance.reverse()
  })()
  const maxBal = Math.max(...timeline.map(t=>t.balanceAfter), 0, 1)
  const minBal = Math.min(...timeline.map(t=>t.balanceAfter), 0)

  // ── Affichage (v5) ────────────────────────────────────────────
  const [cancelId, setCancelId]   = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const readyResas = activeResas.filter(r => r.status === 'ready')

  // Écran allumé tant que le QR agrandi est affiché (si le navigateur le permet)
  useEffect(() => {
    if (!qrOpen || !('wakeLock' in navigator)) return
    let lock = null
    navigator.wakeLock.request('screen').then(l => { lock = l }).catch(() => {})
    return () => { lock?.release?.().catch?.(() => {}) }
  }, [qrOpen])

  const go = (t) => { setTab(t); setDonFait(null); window.scrollTo(0, 0) }
  // Sécurité (20/11/2026) : changer de compte oublie vraiment celui-ci sur ce téléphone (clé, session,
  // numéro dans l'adresse) ; il se rouvrira seulement avec son lien
  const logoutSpec = () => {
    const id = spec?.id
    clearListeners(); setSessionExpiree(false)
    setSpec(null); setInputId(''); setTxs([]); setResas([]); setQtys({}); setCodes([]); setDemandes([]); go('accueil')
    if (!demo && eventId && id) {
      oublierCompte(eventId, id)
      try {
        const u = new URL(window.location.href); u.searchParams.delete('id'); u.searchParams.delete('k')
        window.history.replaceState(null, '', u.toString())
      } catch {}
    }
  }

  const confirmCancel = async () => {
    setCancelling(true)
    try { await annuler(cancelId) } finally { setCancelling(false); setCancelId(null) }
  }

  // ── Nouveau style (23/11/2026, maquette validée) : détail d'une opération, feuille « Plus »,
  //    montant de l'accueil qui se floute au défilement. Aucune donnée nouvelle, aucune action nouvelle.
  const [detail, setDetail]     = useState(null)    // opération ouverte en lecture seule
  const [plusOpen, setPlusOpen] = useState(false)   // feuille « Plus » de l'accueil
  // Cartes de résumé cliquables (23/11/2026, maquette validée) : 'solde' | 'demande', ouvertes en DetailSheet
  const [carteOuverte, setCarteOuverte] = useState(null)
  const heroRef        = useRef(null)
  const plusCloseRef   = useRef(null)

  // Recharge au clavier numérique (23/11/2026) : la saisie remplit « autreMontant » comme l'ancien
  // champ « Autre » ; les montants rapides gardent « montantRecharge ». Bornes et paiement inchangés.
  const saisieRecharge = autreMontant !== '' ? autreMontant : String(montantRecharge / 100)
  const toucheRecharge = (k) => {
    setRechargeErr('')
    if (k === 'del') { const n = saisieRecharge.slice(0, -1); setAutreMontant(n === '' ? '0' : n); return }
    setAutreMontant((saisieRecharge === '0' ? k : saisieRecharge + k).slice(0, 3))
  }

  // Les fenêtres de src/ui (Dialog, Sheet) et la fiche article s'affichent dans document.body par un
  // portail, hors de la racine `.nv` : on pose `.nv` sur body tant que l'espace est ouvert (23/11/2026)
  useEffect(() => {
    document.body.classList.add('nv')
    return () => document.body.classList.remove('nv')
  }, [])

  // Montant de l'accueil : perd en opacité, se floute et rétrécit quand on fait défiler (23/11/2026)
  useEffect(() => {
    if (tab !== 'accueil' || !spec) return
    const el = heroRef.current
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const maj = () => {
      raf = 0
      const k = Math.min(1, Math.max(0, window.scrollY / 170))
      el.style.opacity = String(1 - k)
      el.style.filter = k ? `blur(${(k * 8).toFixed(1)}px)` : ''
      el.style.transform = k ? `scale(${(1 - k * 0.08).toFixed(3)})` : ''
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(maj) }
    window.addEventListener('scroll', onScroll, { passive: true })
    maj()
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
      el.style.opacity = ''; el.style.filter = ''; el.style.transform = ''
    }
  }, [tab, !!spec])

  // Feuille « Plus » : Échap ferme, le fond ne défile plus, le focus revient où il était (23/11/2026).
  // Le détail d'une opération est une DetailSheet (ui/Sheet gère Échap et le focus).
  useEffect(() => {
    if (!plusOpen) return
    const avant = document.activeElement
    const onKey = (e) => { if (e.key === 'Escape') setPlusOpen(false) }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    plusCloseRef.current?.focus?.()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      avant?.focus?.()
    }
  }, [plusOpen])

  const Pagination = ({ page, pages, onChange }) => pages <= 1 ? null : (
    <div className={sp.pager}>
      <button type="button" className="nv-round nv-press" onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1} aria-label="Page précédente"><ChevronLeft size={20} aria-hidden="true" /></button>
      <span>Page {page} sur {pages}</span>
      <button type="button" className="nv-round nv-press" onClick={() => onChange(Math.min(pages, page + 1))} disabled={page === pages} aria-label="Page suivante"><ChevronRight size={20} aria-hidden="true" /></button>
    </div>
  )

  // Une ligne d'opération (accueil, historique) : toucher ouvre le détail en lecture seule
  const ligneOp = (t, i, avecJour) => {
    const look = txLook(t.type)
    const Icon = look.icon
    const [titre, ...reste] = String(t.label || t.type || '').split(' · ')
    const dest = destinationRemboursement(t)
    const heure = heureDe(t)
    const quand = avecJour ? [jourDe(t).label, heure].filter(Boolean).join(', ') : heure
    const sous = [quand, reste.join(' · '), dest].filter(Boolean).join(' · ')
    return (
      <button key={i} type="button" className={clsx('nv-row nv-press', sp.opRow)} onClick={() => setDetail(t)}>
        <span className={clsx('nv-ic', sp.opBg, sp[opClasse(t.type)])}><Icon size={20} aria-hidden="true" /></span>
        <span className="nv-rt"><b>{titre}</b>{sous && <span>{sous}</span>}</span>
        <span className={clsx('nv-amt', sp.opAmt, effetSolde(t) > 0 && 'nv-pos')}>{montantSigne(t)}</span>
      </button>
    )
  }

  // Historique groupé par jour (page courante), avec le total du jour sur toutes les opérations du jour
  const joursHisto = (() => {
    const out = [], idx = {}
    for (const t of txSlice) {
      const j = jourDe(t)
      if (!(j.key in idx)) { idx[j.key] = out.length; out.push({ ...j, txs: [] }) }
      out[idx[j.key]].txs.push(t)
    }
    return out
  })()
  const totalJour = (key) => txTriees.filter(t => jourDe(t).key === key).reduce((a, t) => a + effetSolde(t), 0)

  const NAV = [
    { id: 'accueil',      label: 'Solde',     icon: Wallet,          match: ['accueil', 'historique', 'recharger', 'rembourser'] },
    { id: 'reserver',     label: 'Commander', icon: UtensilsCrossed, match: ['reserver'] },
    { id: 'reservations', label: 'Résas',     icon: Bookmark,        match: ['reservations'], badge: activeResas.length + codesAttente.length },
    { id: 'programme',    label: 'Programme', icon: CalendarDays,    match: ['programme'], badge: nonLuPlanning },
    { id: 'compte',       label: 'Compte',    icon: UserRound,       match: ['compte'] },
  ]
  const navIdx = Math.max(0, NAV.findIndex(n => n.match.includes(tab)))

  // Fond de l'écran : dégradé pour l'accueil et le compte, fond de liste ailleurs (maquette)
  const fondGrad = !spec || tab === 'accueil' || tab === 'compte'
  const ecranPousse = ['historique', 'recharger', 'rembourser'].includes(tab)
  const prenom = String(spec?.nom || '').split(' ')[0]
  const initialesSpec = initials(spec?.nom || '') || '?'
  const peutRembourser = !!spec && (!!demandeEnCours || (spec.solde || 0) > 0)
  const peutDonner = !!spec && !rembClos && !demandeEnCours && soldeDon >= DON_MIN

  // Bascule clair / sombre en bouton rond de 44 px, comme la cloche (demande du 23/11/2026)
  const rond = {
    width: 44, height: 44, minHeight: 0, borderRadius: '50%',
    background: fondGrad ? 'var(--nv-glass)' : 'var(--nv-card2)',
    border: fondGrad ? '1px solid var(--nv-line)' : '1px solid transparent',
    color: 'var(--nv-fg)',
  }
  const boutonsHaut = (avecCloche = true) => (
    <div className={sp.topBtns}>
      {fromArtiste && artisteCreneauId && eventId && (
        <button type="button" className="nv-round nv-press" title="Retour à mon espace artiste" aria-label="Retour à mon espace artiste"
          onClick={() => { window.location.href = '/artiste?ev=' + eventId + '&cr=' + artisteCreneauId }}>
          <Mic size={20} aria-hidden="true" />
        </button>
      )}
      {spec && avecCloche && (
        <span className={sp.bellSlot}><NotifBell notifications={notifications} nonLuCount={nonLuCount} onMarkAllRead={marquerToutLu}
          onOpenCommande={(n) => {
            // Notification liée à une commande : son détail si elle est dans la liste, sinon l'onglet des commandes
            const r = resas.find(x => (n.resaId && x.id === n.resaId) || (n.resaCode && String(x.code) === String(n.resaCode).replace(/^#/, '')))
            if (r) setCmdOuverte({ c: r, statut: RESA_STATUS[r.status] || RESA_STATUS.pending })
            else go('reservations')
          }} /></span>
      )}
      <ThemeToggle style={rond} />
    </div>
  )
  // Barre du haut d'un écran poussé : retour rond, titre centré, bascule du thème
  const barrePoussee = (titre, sousTitre, onBack) => (
    <header className={sp.top}>
      <button type="button" className="nv-round nv-press" onClick={onBack} aria-label="Retour"><ArrowLeft size={20} aria-hidden="true" /></button>
      <div className={sp.topCenter}>
        {titre && <b>{titre}</b>}
        {sousTitre && <span>{sousTitre}</span>}
      </div>
      {boutonsHaut(false)}
    </header>
  )
  const barreOnglet = (titre) => (
    <header className={sp.top}>
      <h1 className={clsx('nv-title', sp.topTitle)}>{titre}</h1>
      {boutonsHaut()}
    </header>
  )

  return (
    <div className={clsx('nv', sp.page, fondGrad ? 'nv-grad' : 'nv-list')} style={{ '--brand': themeColor }}>
      <main className={clsx(sp.wrap, spec && 'nv-under-tabbar', spec && tab === 'reserver' && cartItems.length > 0 && !resaDone && sp.avecPanier)}>
        {/* ── Identification ── */}
        {!spec && (<>
          <header className={sp.top}>
            <span className={sp.logo}><img src="/logo.png" alt="" onError={e => { e.currentTarget.style.display = 'none' }} /></span>
            <div className={sp.topWho}>
              <b>YllaCash</b>
              {eventMeta?.nom && <span>{eventMeta.nom}</span>}
            </div>
            {boutonsHaut(false)}
          </header>
          <section className={clsx(sp.login, 'nv-in')}>
            <h1 className="nv-title">Mon portefeuille festival</h1>
            {loading
              ? <p className="nv-mu">Ouverture de votre espace…</p>
              : <p className="nv-mu">Ouvrez votre espace avec le lien reçu par e-mail avec votre billet. Plus besoin de code : votre QR s'affiche ici et change tout seul.</p>}
            {err && <p className={sp.error} role="alert">{err}</p>}
          </section>
        </>)}

        {spec && (<>
          {/* Session expirée (20/11/2026) : on le dit, et « Réessayer » relance l'ouverture du compte */}
          {sessionExpiree && !demo && (
            <SessionBanner className={sp.sessionBan} title="Votre espace doit être rouvert" actionLabel="Réessayer"
              variant="secondary" loading={loading} onAction={() => findSpec(spec.id)}>
              Votre session a expiré. Rouvrez votre espace avec le lien reçu par e-mail avec votre billet, ou réessayez.
            </SessionBanner>
          )}
          {/* « Réessayer » n'a pas abouti : la raison donnée par l'ouverture du compte (20/11/2026) */}
          {sessionExpiree && !demo && err && <p className={clsx(sp.error, sp.sessionBan)} role="alert">{err}</p>}

          {/* Contenu : onglet en « nv-in », écran poussé en « nv-push » (23/11/2026) */}
          <div key={tab} className={clsx(sp.screen, ecranPousse ? 'nv-push' : 'nv-in')}>

          {/* ── SOLDE (accueil) ── */}
          {tab === 'accueil' && (<>
            <header className={sp.top}>
              <span className={sp.avatar} aria-hidden="true">{initialesSpec}</span>
              <div className={sp.topWho}>
                <b>Salut {prenom || 'à toi'}</b>
                <span>{eventMeta?.nom || 'Festival'}</span>
              </div>
              {boutonsHaut()}
            </header>

            <section ref={heroRef} className={sp.hero} aria-label="Mon solde">
              {/* Toucher le solde ouvre son détail (23/11/2026, maquette validée) */}
              <button type="button" className={clsx(sp.heroBtn, 'nv-press')} onClick={() => setCarteOuverte('solde')}
                aria-label={`Mon solde : ${fmt(spec.solde || 0)}. Voir le détail`} aria-haspopup="dialog">
                <span className={sp.heroLab}>Mon solde</span>
                <span className={clsx('nv-big', sp.heroBig)}><AnimatedNumber value={spec.solde || 0} format={montantGros} /></span>
                <span className={sp.chip}><Wallet size={16} aria-hidden="true" />{eventMeta?.nom ? `${eventMeta.nom} · ` : ''}Compte {spec.id}</span>
              </button>
            </section>

            <div className={clsx('nv-acts', sp.acts)}>
              {!billetAnnule && (
                <button type="button" className="nv-act nv-press" onClick={() => { setRechargeErr(''); go('recharger') }}>
                  <i><Plus size={24} aria-hidden="true" /></i>Recharger
                </button>
              )}
              {qrDataUrl && !billetAnnule && (
                <button type="button" className="nv-act nv-press" onClick={openQr}>
                  <i><QrCode size={24} aria-hidden="true" /></i>Payer
                </button>
              )}
              <button type="button" className="nv-act nv-press" onClick={() => go('reserver')}>
                <i><UtensilsCrossed size={24} aria-hidden="true" /></i>Commander
              </button>
              <button type="button" className="nv-act nv-press" onClick={() => setPlusOpen(true)} aria-haspopup="dialog">
                <i><MoreHorizontal size={24} aria-hidden="true" /></i>Plus
              </button>
            </div>

            <div className={clsx(sp.stack, 'nv-st')}>
              {/* QR de paiement tournant (20/11/2026) dans une carte de verre */}
              <section className={clsx('nv-glass nv-pad', sp.qrCard)} aria-label="Mon QR de paiement">
                {billetAnnule ? (
                  <p className={sp.qrTxt}><b>Billet annulé</b><span>Ce compte ne permet plus de payer.</span></p>
                ) : qrDataUrl ? (<>
                  <div className={sp.qrRow}>
                    <button type="button" className={clsx(sp.qrBox, 'nv-press')} onClick={openQr} aria-label="Agrandir mon QR code de paiement">
                      <img src={qrDataUrl} alt="" />
                    </button>
                    <p className={sp.qrTxt}>
                      <b>Mon QR de paiement</b>
                      <span>Montrez-le au stand pour payer · nouveau dans {qrReste} s</span>
                    </p>
                  </div>
                  <span className={sp.bar} aria-hidden="true"><i style={{ width: `${Math.round(qrReste / 30 * 100)}%` }} /></span>
                </>) : (
                  <p className={sp.qrTxt}><b>Mon QR de paiement</b><span>Pour afficher votre QR de paiement, rouvrez votre espace avec le lien reçu par e-mail.</span></p>
                )}
                {secours && !billetAnnule && (
                  <span className={sp.secours}>Scanner en panne ? Tapez ce code à la borne : <b>{secours.code}</b></span>
                )}
              </section>

              {readyResas.map(r => (
                <section key={r.id} className="nv-glass nv-pad">
                  {/* Toucher la carte ouvre le détail de la commande ; « Voir ma commande » reste (23/11/2026) */}
                  <button type="button" className={clsx(sp.readyHead, sp.rowBtn, 'nv-press')} onClick={() => setCmdOuverte({ c: r, statut: RESA_STATUS.ready })}
                    aria-label={`Détail de la commande ${r.code}, prête`} aria-haspopup="dialog">
                    <span className={clsx('nv-ic', sp.opBg, sp.op_credit)}><ShoppingBag size={20} aria-hidden="true" /></span>
                    <span className={sp.qrTxt}>
                      <b>Votre commande est prête</b>
                      <span>#{r.code}{(r.items || []).length ? ` · ${(r.items || []).map(i => `${i.qty > 1 ? `${i.qty} ` : ''}${i.nom}`).join(', ')}` : ''} · {fmt(r.total || 0)} · à retirer au stand</span>
                    </span>
                    <ChevronRight size={20} className={sp.chev} aria-hidden="true" />
                  </button>
                  <button type="button" className={clsx('nv-btn nv-press', sp.mt16)} onClick={() => go('reservations')}>Voir ma commande</button>
                </section>
              ))}

              {billetAnnule && (
                <p className={sp.info}>Votre billet a été annulé. Ce compte ne peut plus être rechargé ni servir à payer.{(spec.solde || 0) > 0 ? ' Votre solde vous reste dû : demandez-en le remboursement.' : ''}</p>
              )}

              <section className="nv-glass nv-padx" aria-label="Dernières opérations">
                {txs.length === 0 ? (
                  sessionExpiree && !demo
                    ? <Empty icon={Wallet} title="Opérations non chargées">Elles réapparaîtront dès que votre espace sera rouvert.</Empty>
                    : <Empty icon={Wallet} title="Aucune opération pour l'instant">Vos recharges et achats apparaîtront ici.</Empty>
                ) : (<>
                  {txTriees.slice(0, 3).map((t, i) => ligneOp(t, i, true))}
                  {txTotal > 0 && <button type="button" className={clsx(sp.seeAll, 'nv-press')} onClick={() => go('historique')}>Tout voir</button>}
                </>)}
              </section>

              {/* Remboursement : gardé sur l'accueil à la demande de l'organisateur (20/11/2026) */}
              {peutRembourser && (
                <section className="nv-glass nv-padx">
                  <button type="button" className="nv-row nv-press" onClick={() => { setRembErr(''); go('rembourser') }}>
                    <span className="nv-ic neutre"><Euro size={20} aria-hidden="true" /></span>
                    <span className="nv-rt">
                      <b>{demandeEnCours ? 'Suivre ma demande de remboursement' : 'Me faire rembourser mon solde'}</b>
                      {limiteTxt && !rembClos && <span>Possible jusqu'au {limiteTxt}</span>}
                    </span>
                    <ChevronRight size={20} className={sp.chev} aria-hidden="true" />
                  </button>
                </section>
              )}
            </div>
          </>)}

          {/* ── COMPTE ── */}
          {tab === 'compte' && (<>
            <header className={clsx(sp.top, sp.topEnd)}>{boutonsHaut()}</header>
            <div className={sp.profil}>
              <span className={clsx(sp.avatar, sp.avatarXl)} aria-hidden="true">{initialesSpec}</span>
              <h1 className={sp.profilNom}>{spec.nom || 'Mon compte'}</h1>
              <p className="nv-mu">Compte {spec.id}{eventMeta?.nom ? ` · ${eventMeta.nom}` : ''}</p>
            </div>
            <div className={clsx(sp.stack, 'nv-st')}>
              <section className="nv-glass nv-padx" aria-label="Mon argent">
                <button type="button" className="nv-row nv-press" onClick={() => go('historique')}>
                  <span className="nv-ic neutre"><Clock size={20} aria-hidden="true" /></span>
                  <span className="nv-rt"><b>Tout l'historique</b><span>{txTotal} opération{txTotal > 1 ? 's' : ''}</span></span>
                  <ChevronRight size={20} className={sp.chev} aria-hidden="true" />
                </button>
                {peutRembourser && (
                  <button type="button" className="nv-row nv-press" onClick={() => { setRembErr(''); go('rembourser') }}>
                    <span className="nv-ic neutre"><Euro size={20} aria-hidden="true" /></span>
                    <span className="nv-rt">
                      <b>{demandeEnCours ? 'Suivre ma demande de remboursement' : 'Me faire rembourser'}</b>
                      {limiteTxt && !rembClos && <span>Possible jusqu'au {limiteTxt}</span>}
                    </span>
                    <ChevronRight size={20} className={sp.chev} aria-hidden="true" />
                  </button>
                )}
                {peutDonner && (
                  <button type="button" className="nv-row nv-press" onClick={() => { setRembErr(''); go('rembourser') }}>
                    <span className={clsx('nv-ic', sp.opBg, sp.op_don)}><Heart size={20} aria-hidden="true" /></span>
                    <span className="nv-rt"><b>Donner à l'ONG Ylla</b><span>Lutte contre le cancer du sein</span></span>
                    <ChevronRight size={20} className={sp.chev} aria-hidden="true" />
                  </button>
                )}
              </section>
              <section className="nv-glass nv-padx" aria-label="Mon compte">
                <button type="button" className="nv-row nv-press" onClick={logoutSpec}>
                  <span className="nv-ic neutre"><ArrowLeftRight size={20} aria-hidden="true" /></span>
                  <span className="nv-rt"><b>Changer de compte</b><span>Ce compte se rouvrira avec son lien</span></span>
                  <ChevronRight size={20} className={sp.chev} aria-hidden="true" />
                </button>
                <div className="nv-row">
                  <span className="nv-ic neutre"><Moon size={20} aria-hidden="true" /></span>
                  <span className="nv-rt"><b>Thème clair ou sombre</b><span>Touchez le bouton pour changer</span></span>
                  <ThemeToggle style={rond} />
                </div>
              </section>
            </div>
          </>)}

          {/* ── HISTORIQUE ── */}
          {tab === 'historique' && (<>
            {barrePoussee('Historique', null, () => go('accueil'))}
            <div className={sp.histHead}>
              <div className={clsx('nv-big', sp.histBig)}><AnimatedNumber value={spec.solde || 0} format={montantGros} /></div>
              <div className="nv-mu">Solde actuel</div>
            </div>
            {/* Totaux : toucher ouvre le détail du solde (23/11/2026) */}
            <button type="button" className={clsx('nv-card nv-pad nv-press', sp.cardBtn, sp.totals)} onClick={() => setCarteOuverte('solde')}
              aria-label="Totaux depuis l'ouverture. Voir le détail du solde" aria-haspopup="dialog">
              <span>Rechargé<b className="nv-pos">{fmt(totalRecharge)}</b></span>
              <span>Dépensé<b>{fmt(totalDepense)}</b></span>
              {totalRembourse > 0 && <span>Remboursé<b>{fmt(totalRembourse)}</b></span>}
              {totalDonne > 0 && <span>Donné<b>{fmt(totalDonne)}</b></span>}
            </button>
            <div className={clsx('nv-pills', sp.pillsTop)} role="group" aria-label="Affichage">
              <button type="button" className="nv-pill nv-press" aria-pressed={!chartMode} onClick={() => setChartMode(false)}>Liste</button>
              <button type="button" className="nv-pill nv-press" aria-pressed={chartMode} onClick={() => setChartMode(true)}>Graphe</button>
            </div>
            {txTotal === 0 ? (
              <div className="nv-card nv-pad">
                {sessionExpiree && !demo
                  ? <Empty icon={Clock} title="Opérations non chargées">Elles réapparaîtront dès que votre espace sera rouvert.</Empty>
                  : <Empty icon={Clock} title="Aucune opération pour l'instant">Vos recharges et achats apparaîtront ici.</Empty>}
              </div>
            ) : chartMode ? (
              <div className="nv-card nv-pad">
                <SoldeChart timeline={timeline} maxBal={maxBal} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx}
                  zoom={chartZoom} setZoom={setChartZoom} fmt={fmt} />
              </div>
            ) : (
              <div className="nv-st">
                {joursHisto.map(j => (
                  <section key={j.key} aria-label={j.label}>
                    <div className="nv-sec"><h2>{j.label}</h2><span>{montantJour(totalJour(j.key))}</span></div>
                    <div className="nv-card nv-padx">{j.txs.map((t, i) => ligneOp(t, i, false))}</div>
                  </section>
                ))}
                <Pagination page={txPage} pages={txPages} onChange={p => { setTxPage(p); window.scrollTo(0, 0) }} />
              </div>
            )}
          </>)}

          {/* ── REMBOURSER LE SOLDE (20/11/2026) ── */}
          {tab === 'rembourser' && (<>
            {barrePoussee(donFait ? 'Merci' : 'Remboursement', `Solde : ${fmt(spec.solde || 0)}`, () => go('accueil'))}
            <div className={clsx(sp.stack, 'nv-st')}>
              {donFait ? (
                <section className={clsx('nv-card nv-pad', sp.done)}>
                  <span className={clsx(sp.doneIcon, sp.opBg, sp.op_don)}><Heart size={28} aria-hidden="true" /></span>
                  <h2>Merci {prenom} !</h2>
                  <b className={clsx('nv-big', sp.montantDone)}>{fmt(donFait.montant)}</b>
                  <p>donnés à l'ONG Ylla pour la lutte contre le cancer du sein.</p>
                  <p>Solde restant : <b>{fmt(spec.solde || 0)}</b></p>
                  <p className="nv-mu">Le don apparaît dans votre historique.</p>
                  <button type="button" className="nv-btn nv-press" onClick={() => go('accueil')}>Retour au solde</button>
                </section>
              ) : rembClos ? (
                <section className="nv-card nv-pad">
                  <h2 className={sp.cardTitle}>Remboursement</h2>
                  <p className={sp.info}>Le remboursement était possible jusqu'au {limiteTxt}. Passé cette date, les soldes non réclamés sont reversés à l'ONG Ylla, pour la lutte contre le cancer du sein.</p>
                </section>
              ) : demandeVue ? (
                <section className={clsx('nv-card nv-pad', sp.cardStack)}>
                  {/* Toucher l'en-tête ouvre le détail de la demande (23/11/2026) ; les actions restent dessous */}
                  <button type="button" className={clsx(sp.rowBtn, sp.cardStack, 'nv-press')} onClick={() => setCarteOuverte('demande')}
                    aria-label="Voir le détail de ma demande de remboursement" aria-haspopup="dialog">
                    <span className={sp.rembHead}>
                      <span className={sp.cardTitle} role="heading" aria-level={2}>Ma demande</span>
                      <Badge tone={DEMANDE_STATUT[demandeVue.statut]?.tone || 'neutral'}>{DEMANDE_STATUT[demandeVue.statut]?.label || '—'}</Badge>
                    </span>
                    <span className="nv-mu">{fmt(demandeVue.total || 0)} · demandée le {String(demandeVue.date || '').slice(0, 5)} à {String(demandeVue.heure || '').slice(0, 5)}</span>
                  </button>
                  <div className={sp.rembLines}>
                    {demandeVue.stripe?.statut !== 'sans' && (
                      <RembLigne kind="enligne" titre="Carte du paiement en ligne" montant={demandeVue.stripe.rendu ?? demandeVue.stripe.montant}
                        etat={{ rembourse: ['success', 'Remboursé · 5 à 10 jours'], partiel: ['warning', 'Remboursé en partie'], echec: ['danger', 'Refusé par la banque'], en_cours: ['warning', 'En cours'] }[demandeVue.stripe.statut]} />
                    )}
                    {demandeVue.sumup?.statut !== 'sans' && (
                      <RembLigne kind="sumup" titre="Carte utilisée à la billetterie" montant={demandeVue.sumup.rendu ?? demandeVue.sumup.montant} etat={ETAT_PART[demandeVue.sumup.statut]} />
                    )}
                    {demandeVue.especes?.statut !== 'sans' && (
                      <RembLigne kind="especes" titre="Espèces" montant={demandeVue.especes.rendu ?? demandeVue.especes.montant} etat={ETAT_PART[demandeVue.especes.statut]} />
                    )}
                  </div>
                  {demandeVue.statut === 'en_attente' && (
                    <p className={sp.rembInfo}><b>Solde restant : {fmt(spec.solde || 0)}.</b> Présentez votre QR à la billetterie pour la suite. Vous pouvez encore dépenser votre solde d'ici là.</p>
                  )}
                  {demandeVue.stripe?.statut === 'echec' && (
                    <p className={sp.error} role="alert">La banque a refusé le remboursement sur la carte : le montant est revenu sur votre solde. Présentez-vous à la billetterie.</p>
                  )}
                  {rembErr && <p className={sp.error} role="alert">{rembErr}</p>}
                  {demandeVue.statut === 'en_attente'
                    ? <button type="button" className="nv-btn-sec nv-press" onClick={annulerDemande}>Annuler la partie billetterie</button>
                    : (spec.solde || 0) > 0 && <button type="button" className="nv-btn-sec nv-press" onClick={() => setDemandes(d => d.map(x => x.id === demandeVue.id ? { ...x, timestamp: '' } : x))}>Nouvelle demande</button>}
                </section>
              ) : planRemb && planRemb.total > 0 ? (
                <section className={clsx('nv-card nv-pad', sp.cardStack)}>
                  <span className="nv-mu">Solde restant</span>
                  <b className={clsx('nv-big', sp.rembBig)}>{montantGros(planRemb.total)}</b>
                  <div className={sp.rembLines}>
                    {planRemb.stripeTotal > 0 && <RembLigne kind="enligne" titre="Rechargé en ligne" sous="remboursé tout de suite sur votre carte" montant={planRemb.stripeTotal} />}
                    {planRemb.sumup > 0 && <RembLigne kind="sumup" titre="Carte à la billetterie" sous="remboursé par la billetterie" montant={planRemb.sumup} />}
                    {planRemb.especes > 0 && <RembLigne kind="especes" titre="Espèces" sous="à reprendre à la billetterie" montant={planRemb.especes} />}
                  </div>
                  {rembErr && <p className={sp.error} role="alert">{rembErr}</p>}
                  <HoldButton tone="coral" block duration={3000} disabled={rembBusy} onConfirm={demanderRemboursement}
                    fillingLabel="Gardez appuyé…" doneLabel="Demande envoyée" hint="Gardez le doigt appuyé 3 secondes pour confirmer">
                    Me faire rembourser {fmt(planRemb.total)}
                  </HoldButton>
                  <p className={clsx('nv-mu', sp.center)}>Gardez le doigt appuyé 3 secondes pour confirmer</p>
                  <p className={clsx('nv-mu', sp.center)}>Aucun frais. Relâcher avant la fin n'envoie rien.</p>
                  {limiteTxt && <p className={clsx('nv-mu', sp.center)}>Remboursement possible jusqu'au {limiteTxt}.</p>}
                </section>
              ) : (
                <div className="nv-card nv-pad"><Empty icon={Wallet} title="Rien à rembourser">Votre solde est à zéro.</Empty></div>
              )}
              {/* Don à l'ONG Ylla : proposé tant qu'aucune demande n'attend la billetterie */}
              {!donFait && peutDonner && (
                <section className={clsx('nv-card nv-pad', sp.cardStack)}>
                  <div className={sp.readyHead}>
                    <span className={clsx('nv-ic', sp.opBg, sp.op_don)}><Heart size={20} aria-hidden="true" /></span>
                    <p className={sp.qrTxt}><b>Faire un don</b><span>Offrez tout ou partie de votre solde à l'ONG Ylla, engagée contre le cancer du sein.</span></p>
                  </div>
                  <button type="button" className="nv-btn-sec nv-press" onClick={ouvrirDon}><Heart size={18} aria-hidden="true" /> Donner à l'ONG Ylla</button>
                  {limiteTxt && <p className={clsx('nv-mu', sp.center)}>Après le {limiteTxt}, un solde non réclamé est reversé à l'ONG Ylla.</p>}
                </section>
              )}
            </div>
          </>)}

          {/* ── RECHARGER (Stripe) ── */}
          {tab === 'recharger' && (
            retourStripe.session ? (<>
              {barrePoussee('Recharge', null, quitterRecharge)}
              <section className={clsx('nv-card nv-pad', sp.done)}>
                {rechargeRecue ? (<>
                  <span className={clsx(sp.doneIcon, sp.opBg, sp.op_credit)}><CheckCircle2 size={28} aria-hidden="true" /></span>
                  <h2>Solde rechargé</h2>
                  <b className={clsx('nv-big nv-pos', sp.montantDone)}>+{fmt(rechargeRecue.montant || 0)}</b>
                  <p>Nouveau solde : <b>{fmt(spec.solde || 0)}</b></p>
                  <p className="nv-mu">Stripe vous envoie le reçu à l'adresse e-mail saisie lors du paiement.</p>
                </>) : (<>
                  <span className={clsx(sp.doneIcon, sp.opBg, sp.op_resa)}><Clock size={28} aria-hidden="true" /></span>
                  <h2>Paiement en cours de vérification</h2>
                  <p>Votre solde sera crédité dès que Stripe confirme le paiement, même si vous fermez cette page.</p>
                </>)}
                <div className={sp.doneActions}>
                  <button type="button" className="nv-btn nv-press" onClick={() => { quitterRecharge(); go('reserver') }}>Commander</button>
                  <button type="button" className="nv-btn-sec nv-press" onClick={quitterRecharge}>Retour au solde</button>
                </div>
              </section>
            </>) : (<>
              {barrePoussee('Recharger', `Solde : ${fmt(spec.solde || 0)}`, quitterRecharge)}
              {retourStripe.annule && <p className={sp.info}>Paiement annulé : rien n'a été débité.</p>}
              <div className={sp.amtIn} aria-live="polite">
                <span className={clsx('nv-big', sp.amtBig)}>{saisieRecharge || '0'} €</span><span className={sp.cur} aria-hidden="true" />
              </div>
              {rechargeErr && <p className={sp.amtErr} role="alert">{rechargeErr}</p>}
              <p className={clsx('nv-mu', sp.center)}>
                {montantOk ? `Sans frais · nouveau solde ${fmt((spec.solde || 0) + montantChoisi)}` : 'Sans frais · de 5 € à 200 €'}
              </p>
              <div className={sp.payChipRow}><span className={sp.chip}><Lock size={16} aria-hidden="true" /> Paiement sécurisé par Stripe</span></div>
              <div className={clsx('nv-pills', sp.pillsCenter)} role="group" aria-label="Montants rapides">
                {[1000, 2000, 5000].map(m => (
                  <button key={m} type="button" className="nv-pill nv-press" aria-pressed={montantChoisi === m}
                    onClick={() => { setMontantRecharge(m); setAutreMontant(''); setRechargeErr('') }}>{m / 100} €</button>
                ))}
              </div>
              <button type="button" className={clsx('nv-btn nv-press', sp.mt16)} onClick={allerPayer} disabled={rechargeBusy} aria-busy={rechargeBusy}>
                {rechargeBusy ? 'Ouverture du paiement…' : <><Lock size={18} aria-hidden="true" /> Payer {montantChoisi > 0 ? fmt(montantChoisi) : '0 €'} en sécurité</>}
              </button>
              <div className={sp.keys} role="group" aria-label="Clavier du montant">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) => k ? (
                  <button key={k} type="button" className={clsx(sp.key, 'nv-press')} onClick={() => toucheRecharge(k)} aria-label={k === 'del' ? 'Effacer' : undefined}>
                    {k === 'del' ? <Delete size={26} aria-hidden="true" /> : k}
                  </button>
                ) : <span key={'v' + i} />)}
              </div>
            </>)
          )}

          {/* ── COMMANDER ── */}
          {tab === 'reserver' && (<>
            {barreOnglet('Commander')}
            {resaDone ? (
              <section className={clsx('nv-card nv-pad', sp.done)}>
                <span className={clsx(sp.doneIcon, sp.opBg, sp.op_credit)}><KeyRound size={28} aria-hidden="true" /></span>
                <h2>Votre code</h2>
                <b className={clsx('nv-big', sp.codeBig)} aria-label={`Code ${String(resaDone.code).split('').join(' ')}`}>
                  {String(resaDone.code).slice(0, 3)} {String(resaDone.code).slice(3)}
                </b>
                <p>Tapez ce code sur la borne, touche « J'ai un code ». Elle imprime vos tickets.</p>
                <p className="nv-mu">
                  {fmt(resaDone.total)} seront débités de votre solde à la borne, au prix affiché ce jour-là.
                  Annulable sans frais avant, depuis « Mes résas ».
                </p>
                <div className={sp.doneActions}>
                  <button type="button" className="nv-btn nv-press" onClick={() => { setResaDone(null); go('reservations') }}>Voir mes codes</button>
                  <button type="button" className="nv-btn-sec nv-press" onClick={() => setResaDone(null)}>Commander autre chose</button>
                </div>
              </section>
            ) : (<>
              <p className={clsx('nv-mu', sp.lead)}>Commandez ici, puis tapez votre code sur la borne : elle imprime vos tickets et débite votre solde.</p>
              {showRayons && (
                <div className={clsx('nv-pills', sp.pillsWrap)} role="tablist" aria-label="Rayons">
                  {org.rayons.map(r => {
                    const Icon = getIcon(r.icon)
                    const on = r.id === rayon?.id
                    return (
                      <button key={r.id || 'autres'} type="button" role="tab" aria-selected={on}
                        className={clsx('nv-pill nv-press', sp.pillIc, on && 'on')} onClick={() => { setRayonId(r.id); setCatKey(null) }}>
                        <Icon size={18} aria-hidden="true" /> {r.nom}
                      </button>
                    )
                  })}
                </div>
              )}
              {rayon && rayon.cats.length > 1 && (
                <div className={clsx('nv-pills', sp.pillsWrap)} role="group" aria-label="Catégories">
                  {rayon.cats.map(c => {
                    const Icon = getIcon(c.icon)
                    const on = c.key === cat?.key
                    return (
                      <button key={c.key} type="button" aria-pressed={on} className={clsx('nv-pill nv-press', sp.pillIc, sp.catPill)}
                        style={{ '--c': c.couleur || 'var(--brand)' }} onClick={() => setCatKey(c.key)}>
                        <Icon size={18} aria-hidden="true" /> {c.nom}
                      </button>
                    )
                  })}
                </div>
              )}
              {cat ? (
                /* Cartes cliquables comme à la borne (23/11/2026, maquette validée) : toucher la carte
                   ouvre la fiche, « + » ajoute, puis « − » et la quantité apparaissent */
                <section className={clsx(sp.menuGrid, sp.mt12, 'nv-st')} aria-label={cat.nom}>
                  {cat.items.map(m => {
                    const stock = m.stock || 0
                    const q = qtys[m.id] || 0
                    const photo = m.photoUrl || m.image
                    const teinte = (m.nom || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360
                    return (
                      <div key={m.id} className={clsx(sp.mCard, q > 0 && sp.mCardOn, stock === 0 && sp.mCardOut)}>
                        <button type="button" className={clsx(sp.mOpen, 'nv-press')} onClick={() => setFiche(m)}
                          aria-label={`Fiche de ${m.nom}, ${fmt(m.prix || 0)}${q ? `, ${q} au panier` : ''}${stock === 0 ? ', en rupture' : ''}`}>
                          {photo ? (<>
                            <span className={sp.mBlur} style={{ backgroundImage: `url(${photo})` }} aria-hidden="true" />
                            <img className={sp.mImg} src={photo} alt="" />
                          </>) : (
                            <span className={sp.mPh} aria-hidden="true"
                              style={{ background: `linear-gradient(135deg, hsl(${teinte},35%,55%), hsl(${(teinte + 30) % 360},45%,30%))` }}>
                              {(m.nom || '?').charAt(0).toUpperCase()}
                            </span>
                          )}
                          <span className={sp.mShade} aria-hidden="true" />
                          {stock === 0 && <span className={sp.mTag}>Rupture</span>}
                          {stock > 0 && stock <= 10 && <span className={clsx(sp.mTag, sp.mTagLow)}>{stock} restant{stock > 1 ? 's' : ''}</span>}
                          {q > 0 && <span className={clsx(sp.mQty, 'nv-pop')} key={q}>{q}</span>}
                          <span className={sp.mName}>{m.nom}</span>
                          <span className={sp.mPrice}>{fmt(m.prix || 0)}</span>
                        </button>
                        <div className={sp.mActs}>
                          {q > 0 && <>
                            <button type="button" className={clsx(sp.mBtn, sp.mBtnMoins, 'nv-press')} onClick={() => changeQty(m.id, -1)} aria-label={`Retirer un ${m.nom}`}><Minus size={18} aria-hidden="true" /></button>
                            <b className={sp.mQ} aria-live="polite">{q}</b>
                          </>}
                          <button type="button" className={clsx(sp.mBtn, 'nv-press')} onClick={() => changeQty(m.id, 1)} disabled={stock === 0 || q >= stock} aria-label={`Ajouter un ${m.nom}`}><Plus size={18} aria-hidden="true" /></button>
                        </div>
                      </div>
                    )
                  })}
                </section>
              ) : (
                <div className="nv-card nv-pad">
                  <Empty icon={UtensilsCrossed} title="La carte n'est pas encore disponible">Les plats et boissons apparaîtront ici dès leur mise en ligne.</Empty>
                </div>
              )}
            </>)}
          </>)}

          {/* ── MES RÉSAS ── */}
          {tab === 'reservations' && (<>
            {barreOnglet('Mes commandes')}
            <p className={clsx('nv-mu', sp.lead)}>{codesEnLigne.length + resaTotal} au total</p>
            {resaTotal === 0 && codesEnLigne.length === 0 ? (
              <div className="nv-card nv-pad">
                <Empty icon={Bookmark} title="Aucune réservation" action={<button type="button" className="nv-btn nv-press" onClick={() => go('reserver')}>Commander</button>}>
                  Vos commandes apparaîtront ici : commandez depuis la carte, récupérez quand c'est prêt.
                </Empty>
              </div>
            ) : (
              <div className={clsx(sp.stack, 'nv-st')}>
                {/* Codes à taper sur la borne : mis en avant (maquette) */}
                {codesAttente.map(c => (
                  <section key={c.code} className={clsx('nv-card nv-pad', sp.codeCard)}>
                    {/* Toucher la carte ouvre le détail ; « Annuler » reste à côté, hors du bouton (23/11/2026) */}
                    <button type="button" className={clsx(sp.rowBtn, sp.codeCard, 'nv-press')} onClick={() => setCmdOuverte({ c, statut: CODE_STATUS.en_attente })}
                      aria-label={`Détail du code ${String(c.code).split('').join(' ')}, à taper sur la borne`} aria-haspopup="dialog">
                      <span className="nv-mu">À taper sur la borne « J'ai un code »</span>
                      <b className={clsx('nv-big', sp.codeMid)}>{String(c.code).slice(0, 3)} {String(c.code).slice(3)}</b>
                      <span className="nv-mu">{(c.items || []).map(i => `${i.qty > 1 ? `${i.qty} ` : ''}${i.nom}`).join(', ')} · {fmt(c.total || 0)} débités à la borne</span>
                      {c.timestamp && <span className="nv-mu">Commandé le {new Date(c.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                    </button>
                    <button type="button" className={clsx('nv-btn-sec nv-press', sp.mt12)} onClick={() => setCancelCode(c.code)}>Annuler (sans frais)</button>
                  </section>
                ))}
                {(codesEnLigne.length > codesAttente.length || resaTotal > 0) && (
                  <section aria-label="Autres commandes">
                    <div className="nv-sec"><h2>{codesAttente.length ? 'Autres commandes' : 'Commandes'}</h2><span>{codesEnLigne.length - codesAttente.length + resaTotal}</span></div>
                    <div className="nv-card nv-padx">
                      {codesEnLigne.filter(c => c.statut !== 'en_attente').map(c => {
                        const st = CODE_STATUS[c.statut] || CODE_STATUS.en_attente
                        const look = ETAT_LOOK[c.statut] || ETAT_LOOK.pending
                        const Icon = look.icon
                        return (
                          <button type="button" key={c.code} className={clsx('nv-row nv-press', sp.resaRow, sp.rowBtn)} onClick={() => setCmdOuverte({ c, statut: st })}
                            aria-label={`Détail de la commande ${c.code}, ${st.label}`}>
                            <span className={clsx('nv-ic', sp.opBg, sp[look.cls])}><Icon size={20} aria-hidden="true" /></span>
                            <span className="nv-rt">
                              <b>{String(c.code).slice(0, 3)} {String(c.code).slice(3)} · {(c.items || []).map(i => `${i.qty > 1 ? `${i.qty} ` : ''}${i.nom}`).join(', ')}</b>
                              <span>{st.label}{c.statut === 'utilise' && c.commandeNumero ? ` · commande n° ${c.commandeNumero}` : ''}{c.timestamp ? ` · ${new Date(c.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
                            </span>
                            <span className={clsx('nv-amt', sp.opAmt)}>{fmt(c.total || 0)}</span>
                          </button>
                        )
                      })}
                      {resaSlice.map(r => {
                        const st = RESA_STATUS[r.status] || RESA_STATUS.pending
                        const look = ETAT_LOOK[r.status] || ETAT_LOOK.pending
                        const Icon = look.icon
                        return (
                          <div key={r.id} className={sp.resaBlock}>
                            <button type="button" className={clsx('nv-row nv-press', sp.resaRow, sp.rowBtn)} onClick={() => setCmdOuverte({ c: r, statut: st })}
                              aria-label={`Détail de la commande ${r.code}, ${st.label}`}>
                              <span className={clsx('nv-ic', sp.opBg, sp[look.cls])}><Icon size={20} aria-hidden="true" /></span>
                              <span className="nv-rt">
                                <b>#{r.code} · {(r.items || []).map(i => `${i.qty > 1 ? `${i.qty} ` : ''}${i.nom}`).join(', ')}</b>
                                <span>{st.label}{r.status === 'ready' ? ' · présentez-vous au stand' : ''}{r.date ? ` · ${r.date}` : ''}</span>
                              </span>
                              <span className={clsx('nv-amt', sp.opAmt)}>{fmt(r.total || 0)}</span>
                            </button>
                            {r.status === 'pending' && (
                              <button type="button" className={clsx('nv-btn-sec nv-press', sp.resaCancel)} onClick={() => setCancelId(r.id)}>Annuler la commande</button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <Pagination page={resaPage} pages={resaPages} onChange={p => { setResaPage(p); window.scrollTo(0, 0) }} />
                  </section>
                )}
                {resaErr && !cartItems.length && <p className={sp.error} role="alert">{resaErr}</p>}
              </div>
            )}
          </>)}

          {/* ── PROGRAMME ── */}
          {tab === 'programme' && (<>
            {barreOnglet('Programme')}
            <PlanningSpec planning={planningData} eventId={eventId} specId={spec?.id} themeColor={themeColor} />
          </>)}
          </div>
        </>)}

        <footer className={sp.footer}>
          <div>{APP_FULL_LABEL} · Maison Ylla</div>
          <CheckUpdateButton variant="compact"/>
        </footer>
      </main>

      {/* Détail d'une commande (23/11/2026) */}
      <CommandeDetail commande={cmdOuverte?.c || null} statut={cmdOuverte?.statut || null} onClose={() => setCmdOuverte(null)}
        actions={cmdOuverte?.c?.statut === 'en_attente' ? (
          <button type="button" className="nv-btn-sec nv-press" onClick={() => { const code = cmdOuverte.c.code; setCmdOuverte(null); setCancelCode(code) }}>Annuler (sans frais)</button>
        ) : null} />

      {/* Fiche article (20/11/2026), hors de la liste animée */}
      {fiche && (
        <ArticleInfoModal item={fiche} qty={qtys[fiche.id] || 0} onClose={() => setFiche(null)}
          maxAdd={Math.max(0, (fiche.stock || 0) - (qtys[fiche.id] || 0))}
          raisonBloque={(fiche.stock || 0) === 0 ? 'Épuisé' : 'Stock atteint'}
          onAddQty={(n) => changeQty(fiche.id, n)} />
      )}

      {/* Panier de commande : pilule pleine flottante au-dessus des onglets */}
      {spec && tab === 'reserver' && !resaDone && cartItems.length > 0 && (
        <div className={clsx(sp.cartFloat, 'nv-up')}>
          {resaErr && (
            <div className={clsx('nv-card nv-pad', sp.cartErrCard)}>
              <p className={sp.cartErr} role="alert">{resaErr}</p>
              {/* Solde insuffisant (20/11/2026) : recharge en un geste, le panier est conservé */}
              {manque > 0 && !billetAnnule && (<>
                <button type="button" className="nv-btn nv-press" onClick={rechargerLeManque}><CreditCard size={18} aria-hidden="true" /> Recharger mon solde</button>
                <span className="nv-mu">Votre panier est conservé. Vous pouvez aussi recharger à la billetterie.</span>
              </>)}
            </div>
          )}
          <button type="button" className={clsx('nv-btn nv-press', sp.cartBtn)} onClick={doResa} disabled={resaLoading} aria-busy={resaLoading}
            aria-label={`Obtenir mon code, ${cartItems.reduce((a, i) => a + i.qty, 0)} article(s), ${fmt(cartTotal)}`}>
            {resaLoading ? 'Création du code…' : <>Obtenir mon code · {fmt(cartTotal)}</>}
          </button>
        </div>
      )}

      {/* Barre d'onglets flottante : la pastille active glisse d'un onglet à l'autre (23/11/2026) */}
      {spec && (
        <nav className={clsx('nv-tabbar', sp.tabbar)} aria-label="Navigation">
          <span className="nv-tab-ind" aria-hidden="true"
            style={{ width: `calc((100% - 12px) / ${NAV.length})`, transform: `translateX(${navIdx * 100}%)` }} />
          {NAV.map((n, i) => {
            const Icon = n.icon
            const on = i === navIdx
            return (
              <button key={n.id} type="button" className="nv-press" aria-current={on ? 'page' : undefined}
                onClick={() => { go(n.id); if (n.id === 'programme' && nonLuPlanning > 0) marquerToutLu() }}>
                <Icon size={22} aria-hidden="true" />
                {n.badge > 0 && <span className="nv-tab-badge">{n.badge}</span>}
                {n.label}
              </button>
            )
          })}
        </nav>
      )}

      {/* Feuille « Plus » de l'accueil : historique, remboursement, don */}
      {plusOpen && spec && (
        <div className={sp.scrim} onMouseDown={e => { if (e.target === e.currentTarget) setPlusOpen(false) }}>
          <div className={clsx(sp.sheet, 'nv-up')} role="dialog" aria-modal="true" aria-labelledby="sp-plus-titre">
            <span className={sp.grab} aria-hidden="true" />
            <h2 id="sp-plus-titre" className={sp.sheetTitle}>Plus</h2>
            <button type="button" className="nv-row nv-press" onClick={() => { setPlusOpen(false); go('historique') }}>
              <span className="nv-ic neutre"><Clock size={20} aria-hidden="true" /></span>
              <span className="nv-rt"><b>Tout l'historique</b><span>{txTotal} opération{txTotal > 1 ? 's' : ''}</span></span>
              <ChevronRight size={20} className={sp.chev} aria-hidden="true" />
            </button>
            {peutRembourser && (
              <button type="button" className="nv-row nv-press" onClick={() => { setPlusOpen(false); setRembErr(''); go('rembourser') }}>
                <span className="nv-ic neutre"><Euro size={20} aria-hidden="true" /></span>
                <span className="nv-rt"><b>{demandeEnCours ? 'Suivre ma demande de remboursement' : 'Me faire rembourser'}</b>{limiteTxt && !rembClos && <span>Possible jusqu'au {limiteTxt}</span>}</span>
                <ChevronRight size={20} className={sp.chev} aria-hidden="true" />
              </button>
            )}
            {peutDonner && (
              <button type="button" className="nv-row nv-press" onClick={() => { setPlusOpen(false); setRembErr(''); go('rembourser') }}>
                <span className={clsx('nv-ic', sp.opBg, sp.op_don)}><Heart size={20} aria-hidden="true" /></span>
                <span className="nv-rt"><b>Donner à l'ONG Ylla</b><span>Lutte contre le cancer du sein</span></span>
                <ChevronRight size={20} className={sp.chev} aria-hidden="true" />
              </button>
            )}
            <button ref={plusCloseRef} type="button" className={clsx('nv-btn-sec nv-press', sp.mt12)} onClick={() => setPlusOpen(false)}>Fermer</button>
          </div>
        </div>
      )}

      {/* Détail d'une opération (validé le 23/11/2026) : gabarit commun DetailSheet, lecture seule */}
      <DetailSheet open={!!detail && !!spec} onClose={() => setDetail(null)} {...(detail && spec ? (() => {
        const t = detail
        const [titre, ...reste] = String(t.label || t.type || '').split(' · ')
        const articles = (t.items || []).length
          ? t.items.map(i => `${i.qty > 1 ? `${i.qty} × ` : ''}${i.nom}`).join(', ')
          : reste.join(' · ')
        const moyen = moyenLibelle(t.moyen) || (t.stripeSession ? 'Paiement en ligne sécurisé' : '')
        const parQui = t.staff && t.staff !== '—' ? t.staff : ''
        const effet = effetSolde(t)
        return {
          title: titre || 'Opération',
          icon: txLook(t.type).icon,
          color: OP_COULEUR[opClasse(t.type)],
          status: { label: statutOp(t), tone: t.type === 'reservation' ? 'warning' : effet > 0 ? 'success' : 'neutral' },
          value: montantSigne(t),
          sub: [jourDe(t).label, heureDe(t)].filter(Boolean).join(', '),
          sections: [{ label: 'Détail', rows: [
            [(t.items || []).length ? 'Articles' : 'Détail', articles],
            ['Moyen', moyen],
            ['Enregistré par', parQui],
            ['Commande', t.commandeNumero ? `n° ${t.commandeNumero}` : ''],
            ['Compte', spec.id],
          ] }],
        }
      })() : {})} />

      {/* Détail du solde (toucher le solde de l'accueil ou les totaux de l'historique, 23/11/2026) */}
      <DetailSheet open={carteOuverte === 'solde' && !!spec} onClose={() => setCarteOuverte(null)}
        title="Mon solde" icon={Wallet} color="var(--brand)"
        status={billetAnnule ? { label: 'Billet annulé', tone: 'danger' } : null}
        value={fmt(spec?.solde || 0)}
        sub={spec ? `Compte ${spec.id}${eventMeta?.nom ? ` · ${eventMeta.nom}` : ''}` : ''}
        sections={[
          { label: "Depuis l'ouverture", rows: [
            ['Rechargé', fmt(totalRecharge)],
            ['Dépensé', fmt(totalDepense)],
            ['Remboursé', totalRembourse > 0 ? fmt(totalRembourse) : ''],
            ['Donné', totalDonne > 0 ? fmt(totalDonne) : ''],
          ] },
          (limiteTxt || demandeEnCours) && { label: 'Remboursement', rows: [
            [rembClos ? 'Était possible jusqu’au' : 'Possible jusqu’au', limiteTxt],
            ['Demande', demandeEnCours ? `En cours · ${fmt(demandeEnCours.total || 0)}` : ''],
          ] },
        ]}
        actions={tab !== 'historique' && (
          <button type="button" className="nv-btn nv-press" onClick={() => { setCarteOuverte(null); go('historique') }}>Voir tout l'historique</button>
        )} />

      {/* Détail de la demande de remboursement (23/11/2026) : mêmes informations que la carte */}
      <DetailSheet open={carteOuverte === 'demande' && !!demandeVue} onClose={() => setCarteOuverte(null)}
        title="Ma demande de remboursement" icon={Euro} color={OP_COULEUR.op_remb}
        status={demandeVue ? DEMANDE_STATUT[demandeVue.statut] || null : null}
        value={demandeVue ? fmt(demandeVue.total || 0) : ''}
        sub={demandeVue ? `Demandée le ${String(demandeVue.date || '').slice(0, 5)} à ${String(demandeVue.heure || '').slice(0, 5)}` : ''}
        sections={demandeVue ? [
          { label: 'Répartition', rows: [
            demandeVue.stripe?.statut !== 'sans' && demandeVue.stripe ? ['Carte du paiement en ligne', partRemb(demandeVue.stripe, { rembourse: 'Remboursé · 5 à 10 jours', partiel: 'Remboursé en partie', echec: 'Refusé par la banque', en_cours: 'En cours' }[demandeVue.stripe.statut])] : null,
            demandeVue.sumup?.statut !== 'sans' && demandeVue.sumup ? ['Carte utilisée à la billetterie', partRemb(demandeVue.sumup, ETAT_PART[demandeVue.sumup.statut]?.[1])] : null,
            demandeVue.especes?.statut !== 'sans' && demandeVue.especes ? ['Espèces', partRemb(demandeVue.especes, ETAT_PART[demandeVue.especes.statut]?.[1])] : null,
          ] },
          { label: 'Mon compte', rows: [
            ['Solde restant', demandeVue.statut === 'en_attente' ? fmt(spec?.solde || 0) : ''],
            ['Date limite', limiteTxt],
            ['Compte', spec?.id],
          ] },
        ] : []} />


      {/* QR agrandi, sur fond blanc pour le scan */}
      {qrOpen && qrDataUrl && (
        <div className={sp.qrFull} onClick={closeQr} role="dialog" aria-modal="true" aria-label="Mon QR code">
          <b>{spec?.nom}</b>
          <img src={qrDataUrl} alt="QR code de paiement" />
          <span className={sp.qrBar}><i style={{ width: `${(qrReste / 30) * 100}%` }} /></span>
          <span>Se renouvelle dans {qrReste} s · une capture d'écran ne fonctionne pas</span>
          {secours && <span className={sp.secoursFull}>Scanner en panne ? Tapez ce code<b>{secours.code}</b></span>}
          <p>Présentez ce QR à la borne. Touchez l'écran pour fermer.</p>
          <button type="button" className={sp.qrClose} onClick={closeQr}>Fermer</button>
        </div>
      )}

      <Dialog open={donOpen} onClose={() => { if (!donBusy) setDonOpen(false) }} title="Donner à l'ONG Ylla"
        footer={<Button variant="ghost" disabled={donBusy} onClick={() => setDonOpen(false)}>Annuler</Button>}>
        <div className={clsx('nv', sp.donBody)}>
          <span className={sp.catTitle}>L'ONG Ylla</span>
          <p>L'ONG Ylla œuvre en France et en Afrique pour la lutte contre le cancer du sein, l'accompagnement des populations et la promotion du vivre-ensemble. Elle agit en mémoire de Yolande Ylla Seri Bah.</p>
          <span className={sp.catTitle}>À quoi sert votre don</span>
          <div className={sp.rembLines}>
            <div className={sp.rembLine}><span className={sp.rembText}><b>Prévenir et sensibiliser</b><span className="nv-mu">informer pour réduire les risques</span></span></div>
            <div className={sp.rembLine}><span className={sp.rembText}><b>Dépister</b><span className="nv-mu">détecter tôt pour sauver des vies</span></span></div>
            <div className={sp.rembLine}><span className={sp.rembText}><b>Accompagner</b><span className="nv-mu">soutenir les femmes touchées par la maladie</span></span></div>
          </div>
          <p className="nv-mu">Déjà plus de 1 000 femmes et hommes sensibilisés, dans 3 pays. <a className={sp.donLink} href="https://ongylla.org" target="_blank" rel="noopener noreferrer">Découvrir l'ONG sur ongylla.org</a></p>
          <span className={sp.catTitle}>Montant du don</span>
          <div className={clsx('nv-pills', sp.pillsWrap)} role="group" aria-label="Montant du don">
            {[200, 500, 1000, 2000].filter(m => m < soldeDon).map(m => (
              <button key={m} type="button" aria-pressed={donChoix === m} className="nv-pill nv-press"
                onClick={() => { setDonChoix(m); setDonAutre(''); setDonErr('') }}>{m / 100} €</button>
            ))}
            <button type="button" aria-pressed={donChoix === soldeDon} className="nv-pill nv-press"
              onClick={() => { setDonChoix(soldeDon); setDonAutre(''); setDonErr('') }}>Tout</button>
            <input className={clsx(sp.pillInput, donChoix == null && sp.pillInputOn)} inputMode="decimal"
              placeholder="Autre" aria-label="Autre montant en euros" value={donAutre}
              onFocus={() => setDonChoix(null)}
              onChange={e => { setDonChoix(null); setDonAutre(e.target.value.replace(/[^\d.,]/g, '').slice(0, 6)); setDonErr('') }} />
          </div>
          <div className={sp.nouveauSolde}><span>Solde après le don</span><b>{donMontant ? fmt(soldeDon - donMontant) : '—'}</b></div>
          {!donMontant && donSaisi > 0 && (
            <p className={sp.error} role="alert">{donSaisi > soldeDon ? `Le don ne peut pas dépasser votre solde de ${fmt(soldeDon)}.` : 'Le don minimum est de 1 €.'}</p>
          )}
          {donErr && <p className={sp.error} role="alert">{donErr}</p>}
          <p className={sp.rembInfo}>La totalité de votre don est reversée à l'ONG Ylla. Un don est définitif : il ne peut pas être remboursé.</p>
          <HoldButton tone="brand" block duration={3000} disabled={donBusy || !donMontant} onConfirm={donner}
            fillingLabel="Gardez appuyé…" doneLabel="Merci !" hint="Gardez le doigt appuyé 3 secondes pour confirmer">
            {donMontant ? `Donner ${fmt(donMontant)} à l'ONG Ylla` : 'Choisissez un montant'}
          </HoldButton>
          <p className={clsx('nv-mu', sp.center)}>Gardez le doigt appuyé 3 secondes pour confirmer</p>
        </div>
      </Dialog>

      <Dialog open={!!cancelCode} onClose={() => setCancelCode(null)} title="Annuler ce code ?"
        footer={<>
          <Button variant="secondary" onClick={() => setCancelCode(null)}>Garder</Button>
          <Button variant="danger" loading={cancelling} onClick={async () => {
            setCancelling(true)
            try { await annulerCode(cancelCode) } catch (e) { setResaErr(friendlyError(e, "L'annulation n'est pas passée.")) }
            finally { setCancelling(false); setCancelCode(null) }
          }}>Annuler le code</Button>
        </>}>
        Rien n'a été débité : le code ne pourra plus servir à la borne.
      </Dialog>

      <Dialog open={!!cancelId} onClose={() => setCancelId(null)} title="Annuler cette commande ?"
        footer={<>
          <Button variant="secondary" onClick={() => setCancelId(null)}>Garder</Button>
          <Button variant="danger" loading={cancelling} onClick={confirmCancel}>Annuler la commande</Button>
        </>}>
        Le stand ne la préparera pas. Vous pourrez repasser commande à tout moment.
      </Dialog>
    </div>
  )
}

// ── Nouveau style (23/11/2026) : aides d'affichage, sans calcul de montant nouveau ──

// Gros montant : euros en grand, centimes plus petits (maquette)
function montantGros(c) {
  const n = Math.round(Number(c) || 0)
  const a = Math.abs(n)
  return <>{n < 0 ? '−' : ''}{Math.floor(a / 100).toLocaleString('fr-FR')}<small>,{String(a % 100).padStart(2, '0')} €</small></>
}

// Montant signé d'une opération : même règle qu'avant (signe de l'effet sur le solde)
function montantSigne(t) {
  const sansEffet = effetSolde(t) === 0 && t.type !== 'reservation'
  return sansEffet ? '—' : `${signeDe(t) || txLook(t.type).sign}${fmt(t.montant || 0)}`
}
const montantJour = (e) => e > 0 ? `+${fmt(e)}` : e < 0 ? `−${fmt(-e)}` : fmt(0)

// Pastille de couleur selon le type d'opération (table de couleurs du module CSS)
const OP_CLASSE = {
  credit: 'op_credit', credit_correction: 'op_credit', debit: 'op_debit', debit_correction: 'op_debit',
  reservation: 'op_resa', annulation: 'op_annul', remboursement: 'op_remb', don: 'op_don',
}
const opClasse = (type) => OP_CLASSE[type] || 'op_autre'
// Mêmes couleurs que les pastilles du module CSS (.op_*), pour la pastille des fenêtres de détail
const OP_COULEUR = {
  op_credit: '#1E8F62', op_debit: '#6C5CE7', op_resa: '#C9711A', op_annul: '#6B7785',
  op_remb: '#2F74D0', op_don: '#D63B72', op_autre: 'var(--brand)',
}
// Statut d'une demande de remboursement (carte « Ma demande » et son détail)
const DEMANDE_STATUT = {
  en_attente: { label: 'En cours',   tone: 'warning' },
  rembourse:  { label: 'Remboursé',  tone: 'success' },
  annule:     { label: 'Annulée',    tone: 'neutral' },
  refuse:     { label: 'Refusée',    tone: 'danger' },
  echec:      { label: 'Échec',      tone: 'danger' },
}
// Une part du remboursement : montant (rendu s'il est connu) et son état
const partRemb = (p, etat) => [fmt((p.rendu ?? p.montant) || 0), etat].filter(Boolean).join(' · ')

// États des commandes et codes : couleur et icône de la pastille
const ETAT_LOOK = {
  ready:      { cls: 'op_credit', icon: Check },
  utilise:    { cls: 'op_credit', icon: Check },
  processing: { cls: 'op_autre',  icon: Clock },
  pending:    { cls: 'op_resa',   icon: Clock },
  en_attente: { cls: 'op_resa',   icon: Clock },
  collected:  { cls: 'op_annul',  icon: Check },
  cancelled:  { cls: 'op_annul',  icon: X },
  annule:     { cls: 'op_annul',  icon: X },
}

// Date d'une opération (horodatage de la base, sinon date écrite)
function msDe(t) {
  if (t?.createdAt?.seconds != null) return t.createdAt.seconds * 1000
  if (typeof t?.createdAt?.toMillis === 'function') return t.createdAt.toMillis()
  if (t?.timestamp) { const v = Date.parse(t.timestamp); if (!isNaN(v)) return v }
  return null
}
function jourDe(t) {
  const ms = msDe(t)
  if (ms == null) return { key: 'd-' + (t?.date || '?'), label: t?.date ? String(t.date) : 'Date inconnue' }
  const d = new Date(ms)
  const auj = new Date(); auj.setHours(0, 0, 0, 0)
  const jour = new Date(d); jour.setHours(0, 0, 0, 0)
  const ecart = Math.round((auj - jour) / 86400000)
  let label
  if (ecart === 0) label = "Aujourd'hui"
  else if (ecart === 1) label = 'Hier'
  else { const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); label = s.charAt(0).toUpperCase() + s.slice(1) }
  return { key: d.toDateString(), label }
}
function heureDe(t) {
  if (t?.heure) return String(t.heure).slice(0, 5)
  const ms = msDe(t)
  return ms != null ? new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''
}

// Statut lisible d'une opération (écran de détail), d'après son type
function statutOp(t) {
  switch (t?.type) {
    case 'credit':            return 'Crédité sur votre solde'
    case 'credit_correction': return 'Correction : ajouté à votre solde'
    case 'debit':             return 'Payé avec votre solde YllaCash'
    case 'debit_correction':  return 'Correction : retiré de votre solde'
    case 'reservation':       return 'Réservation payée avec votre solde'
    case 'annulation':        return effetSolde(t) > 0 ? 'Recrédité sur votre solde' : 'Annulation enregistrée'
    case 'remboursement':     { const d = destinationRemboursement(t); return 'Remboursé' + (d ? ' ' + d : '') }
    case 'don':               return "Donné à l'ONG Ylla"
    default:                  return 'Opération enregistrée'
  }
}
function moyenLibelle(m) {
  const x = String(m || '').toLowerCase()
  if (!x) return ''
  if (x === 'en-ligne') return 'Paiement en ligne'
  if (x.startsWith('esp')) return 'Espèces'
  if (x === 'cb' || x.startsWith('carte')) return 'Carte bancaire'
  return String(m)
}

// ── Remboursement du solde : une ligne par chemin (carte en ligne, carte billetterie, espèces) ──
const ETAT_PART = {
  a_traiter: ['warning', 'À la billetterie'],
  rembourse: ['success', 'Remboursé'],
  annule:    ['neutral', 'Annulé'],
  refuse:    ['danger', 'Refusé'],
}
const REMB_ICON = { enligne: Globe, sumup: CreditCard, especes: Banknote }
function RembLigne({ kind, titre, sous, montant, etat }) {
  const Icon = REMB_ICON[kind]
  return (
    <div className={sp.rembLine}>
      <span className={clsx(sp.rembIcon, sp['remb_' + kind])}><Icon size={18} aria-hidden="true" /></span>
      <span className={sp.rembText}>
        <span>{titre}</span>
        {sous && <span className="nv-mu">{sous}</span>}
        {etat && <Badge tone={etat[0]}>{etat[1]}</Badge>}
      </span>
      <b>{fmt(montant || 0)}</b>
    </div>
  )
}
