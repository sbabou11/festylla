/**
 * pages/public/SoldePage.jsx — v5 espace spectateur (lot 3)
 * Carte portefeuille (solde + QR), commande prête en tête, historique,
 * barre d'onglets en bas : Solde | Commander | Mes résas | Programme.
 * La logique Firestore (compte, transactions, réservations) est celle de la v4.
 */
import { ensureSpectatorSession, soldeUrl, spectateurOuvert, oublierCompte, rememberedKey, ouvrirParJeton } from '../../firebase/publicSession'
import { jetonTournant, fenetreDe, resteSecondes } from '../../utils/qrTournant'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'qrcode'
import {
  Search, Wallet, Clock, Bookmark, LayoutList, BarChart2, CalendarDays, UtensilsCrossed,
  Plus, Minus, Undo2, ShoppingBag, ChevronRight, Maximize2, Mic, Ticket, KeyRound, CreditCard, Lock, CheckCircle2, ArrowLeft, Globe, Banknote, Heart, UserRound,
} from 'lucide-react'
import clsx from 'clsx'
import { db } from '../../firebase/config'
import { watchProgramme } from '../../programme/watchProgramme'
import { getSettings, creerCodeEnLigne, annulerCodeEnLigne } from '../../firebase/service'
import { watchCarte } from '../../menu/carte'
import { apiFetch } from '../../firebase/session'
import ArticleInfoModal from '../../components/ArticleInfoModal'
import { organiserCarte } from '../../menu/organiser'
import { getIcon } from '../../menu/icons'
import {
  collection, query, where, getDocs, addDoc, onSnapshot,
  updateDoc, doc, getDoc, serverTimestamp, runTransaction, orderBy, increment
} from 'firebase/firestore'
import { fmt, nowStr, makeResaCode as resaCode } from '../../utils/helpers'
import { useNotifications } from '../../hooks/useNotifications'
import NotifBell from '../../components/NotifBell'
import ThemeToggle from '../../components/ThemeToggle'
import { useTheme } from '../../hooks/useTheme'
import { friendlyError } from '../../utils/errors'
import { Button, Badge, Empty, Field, Tabs, Dialog, AnimatedNumber, HoldButton, SessionBanner, focusFirstInvalid } from '../../ui'
import { planRemboursement } from '../../utils/remboursementPlan'
import { effetSolde, signeDe, destinationRemboursement, totauxCompte } from '../../utils/historiqueSpec'
import { montantDon, limiteRemboursement, delaiDepasse, DON_MIN } from '../../utils/dons'
import PlanningSpec from './spectateur/PlanningSpec'
import SoldeChart from './spectateur/SoldeChart'
import sp from './spectateur/SoldePage.module.css'
import { APP_FULL_LABEL } from '../../utils/buildInfo'
import CheckUpdateButton from '../../components/CheckUpdateButton'
import PageTransition from '../../components/PageTransition'

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

  const Pagination = ({ page, pages, onChange }) => pages <= 1 ? null : (
    <div className={sp.pager}>
      <button type="button" onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1} aria-label="Page précédente">‹</button>
      <span>{page} / {pages}</span>
      <button type="button" onClick={() => onChange(Math.min(pages, page + 1))} disabled={page === pages} aria-label="Page suivante">›</button>
    </div>
  )

  const TxRow = ({ t }) => {
    const look = txLook(t.type)
    const Icon = look.icon
    const sansEffet = effetSolde(t) === 0 && t.type !== 'reservation'
    const dest = destinationRemboursement(t)
    return (
      <li className={sp.tx}>
        <span className={clsx(sp.txIcon, sp[look.tone])}><Icon size={15} aria-hidden="true" /></span>
        <span className={sp.txText}>
          <b>{t.label || t.type}</b>
          <span>{t.date}{t.heure ? ` · ${t.heure}` : ''}{dest ? ` · ${dest}` : ''}</span>
        </span>
        <span className={clsx(sp.txAmount, sp[`${look.tone}Text`])}>
          {sansEffet ? '—' : `${signeDe(t) || look.sign}${fmt(t.montant || 0)}`}
        </span>
      </li>
    )
  }

  const NAV = [
    { id: 'accueil',      label: 'Solde',     icon: Wallet,          match: ['accueil', 'historique', 'recharger', 'rembourser'] },
    { id: 'reserver',     label: 'Commander', icon: UtensilsCrossed, match: ['reserver'] },
    { id: 'reservations', label: 'Résas',     icon: Bookmark,        match: ['reservations'], badge: activeResas.length + codesAttente.length },
    { id: 'programme',    label: 'Programme', icon: CalendarDays,    match: ['programme'], badge: nonLuPlanning },
    { id: 'compte',       label: 'Compte',    icon: UserRound,       match: ['compte'] },
  ]

  return (
    <div className={sp.page} style={{ '--brand': themeColor }}>
      {/* En-tête */}
      <header className={sp.head}>
        <div className={sp.headInner}>
          <div className={sp.logo}><img src="/logo.png" alt="" onError={e => { e.currentTarget.style.display = 'none' }} /></div>
          {/* Refonte téléphone (20/11/2026) : une fois le compte ouvert, l'en-tête salue le spectateur */}
          {spec ? (
            <div className={sp.headWho}>
              <b>Salut {(spec.nom || '').split(' ')[0] || 'à toi'}</b>
              <span>{eventMeta?.nom || 'Festival'}</span>
            </div>
          ) : (<>
            <span className={sp.brandName}>YllaCash</span>
            {eventMeta && (
              <span className={sp.event}>
                {eventMeta.logoSrc && <img src={eventMeta.logoSrc} alt="" />}
                {eventMeta.nom}
              </span>
            )}
          </>)}
          <div className={sp.headActions}>
            {fromArtiste && artisteCreneauId && eventId && (
              <button type="button" className={sp.headBtn} title="Retour à mon espace artiste" aria-label="Retour à mon espace artiste"
                onClick={() => { window.location.href = '/artiste?ev=' + eventId + '&cr=' + artisteCreneauId }}>
                <Mic size={16} />
              </button>
            )}
            {spec && <NotifBell notifications={notifications} nonLuCount={nonLuCount} onMarkAllRead={marquerToutLu} />}
            {!spec && <ThemeToggle variant="light" style={{ width: 36, height: 36, minHeight: 0 }} />}
          </div>
        </div>
      </header>

      <main className={clsx(sp.wrap, spec && sp.withNav)}>
        {/* ── Identification ── */}
        {!spec && (
          <section className={sp.login}>
            <h1>Mon portefeuille festival</h1>
            {loading
              ? <p className={sp.loading}>Ouverture de votre espace…</p>
              : <p>Ouvrez votre espace avec le lien reçu par e-mail avec votre billet. Plus besoin de code : votre QR s'affiche ici et change tout seul.</p>}
            {err && <p className={sp.error} role="alert">{err}</p>}
          </section>
        )}

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
          {/* Contenu : animation entre les onglets */}
          <PageTransition pageKey={tab}>
          {/* ── SOLDE ── */}
          {tab === 'accueil' && (
            <div className={sp.stack}>
              {/* Refonte téléphone (20/11/2026) : le QR de paiement est l'élément central de l'accueil */}
              <section className={sp.wallet} aria-label="Mon solde">
                <span className={sp.walletLabel}>Mon solde</span>
                <b className={sp.walletValue}><AnimatedNumber value={spec.solde || 0} format={fmt} /></b>
                {qrDataUrl && !billetAnnule && (
                  <button type="button" className={sp.walletQr} onClick={openQr} aria-label="Agrandir mon QR code de paiement">
                    <img src={qrDataUrl} alt="" />
                  </button>
                )}
                <span className={sp.walletId}>
                  {billetAnnule
                    ? 'Billet annulé : ce compte ne permet plus de payer.'
                    : qrDataUrl
                      ? `Montrez ce QR pour payer · nouveau dans ${qrReste} s`
                      : 'Pour afficher votre QR de paiement, rouvrez votre espace avec le lien reçu par e-mail.'}
                </span>
                {qrDataUrl && !billetAnnule && (
                  <span className={sp.walletBar} aria-hidden="true"><i style={{ width: `${Math.round(qrReste / 30 * 100)}%` }} /></span>
                )}
                {secours && !billetAnnule && (
                  <span className={sp.secours}>Scanner en panne ? Tapez ce code à la borne : <b>{secours.code}</b></span>
                )}
                {!billetAnnule && (
                  <div className={sp.walletBtns}>
                    <button type="button" className={sp.walletBtn} onClick={() => { setRechargeErr(''); go('recharger') }}><Plus size={16} aria-hidden="true" /> Recharger</button>
                    {qrDataUrl && <button type="button" className={clsx(sp.walletBtn, sp.walletBtnGhost)} onClick={openQr}><Maximize2 size={16} aria-hidden="true" /> Agrandir le QR</button>}
                  </div>
                )}
              </section>

              {readyResas.map(r => (
                <button key={r.id} type="button" className={sp.ready} onClick={() => go('reservations')}>
                  <span className={sp.readyCode}>#{r.code}</span>
                  <span className={sp.readyText}>
                    <b>Votre commande est prête</b>
                    <span>Présentez-vous au stand pour la retirer · {fmt(r.total || 0)}</span>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              ))}

              {billetAnnule && (
                <p className={sp.info}>Votre billet a été annulé. Ce compte ne peut plus être rechargé ni servir à payer.{(spec.solde || 0) > 0 ? ' Votre solde vous reste dû : demandez-en le remboursement.' : ''}</p>
              )}

              <section className={sp.ops}>
                <header className={sp.cardHead}>
                  <h2>Dernières opérations</h2>
                  {txTotal > 0 && <button type="button" className={sp.more} onClick={() => go('historique')}>Tout voir</button>}
                </header>
                {txs.length === 0 ? (
                  sessionExpiree && !demo
                    ? <Empty icon={Wallet} title="Opérations non chargées">Elles réapparaîtront dès que votre espace sera rouvert.</Empty>
                    : <Empty icon={Wallet} title="Aucune opération pour l'instant">Vos recharges et achats apparaîtront ici.</Empty>
                ) : (
                  <ul className={sp.txList}>{txTriees.slice(0, 3).map((t, i) => <TxRow key={i} t={t} />)}</ul>
                )}
              </section>

              {/* Remboursement : gardé sur l'accueil à la demande de l'organisateur (20/11/2026) */}
              {(demandeEnCours || (spec.solde || 0) > 0) && (
                <button type="button" className={sp.rowBtn} onClick={() => { setRembErr(''); go('rembourser') }}>
                  <span className={clsx(sp.rowIcon, sp.coral)}><Undo2 size={17} aria-hidden="true" /></span>
                  <span className={sp.rowText}>
                    <b>{demandeEnCours ? 'Suivre ma demande de remboursement' : 'Me faire rembourser mon solde'}</b>
                    {limiteTxt && !rembClos && <span>Possible jusqu'au {limiteTxt}</span>}
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          {/* ── COMPTE (refonte téléphone, 20/11/2026) ── */}
          {tab === 'compte' && (
            <div className={sp.stack}>
              <section>
                <h2 className={sp.groupTitle}>Mon argent</h2>
                <button type="button" className={sp.rowLine} onClick={() => go('historique')}>
                  <span className={clsx(sp.rowIcon, sp.brand)}><Clock size={17} aria-hidden="true" /></span>
                  <span className={sp.rowText}><b>Tout l'historique</b><span>{txTotal} opération{txTotal > 1 ? 's' : ''}</span></span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
                {!rembClos && !demandeEnCours && soldeDon >= DON_MIN && (
                  <button type="button" className={sp.rowLine} onClick={() => { setRembErr(''); go('rembourser') }}>
                    <span className={clsx(sp.rowIcon, sp.coral)}><Heart size={17} aria-hidden="true" /></span>
                    <span className={sp.rowText}><b>Donner à l'ONG Ylla</b><span>Lutte contre le cancer du sein</span></span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                )}
              </section>
              <section>
                <h2 className={sp.groupTitle}>Mon compte</h2>
                <button type="button" className={sp.rowLine} onClick={logoutSpec}>
                  <span className={clsx(sp.rowIcon, sp.brand)}><KeyRound size={17} aria-hidden="true" /></span>
                  <span className={sp.rowText}><b>Changer de compte</b><span>Ce compte se rouvrira avec son lien</span></span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
                <div className={sp.rowLine}>
                  <span className={sp.rowText}><b>Thème clair ou sombre</b></span>
                  <ThemeToggle variant="light" style={{ width: 44, height: 44, minHeight: 0 }} />
                </div>
              </section>
            </div>
          )}

          {/* ── HISTORIQUE ── */}
          {tab === 'historique' && (
            <section className={sp.card}>
              <header className={sp.cardHead}>
                <h2>Historique</h2>
                <Tabs size="sm" label="Affichage" value={chartMode ? 'graph' : 'list'} onChange={v => setChartMode(v === 'graph')}
                  items={[{ value: 'list', label: 'Liste' }, { value: 'graph', label: 'Graphe' }]} />
              </header>
              <div className={sp.totals}>
                <span>Rechargé <b className={sp.successText}>{fmt(totalRecharge)}</b></span>
                <span>Dépensé <b className={sp.coralText}>{fmt(totalDepense)}</b></span>
                {totalRembourse > 0 && <span>Remboursé <b>{fmt(totalRembourse)}</b></span>}
                {totalDonne > 0 && <span>Donné <b>{fmt(totalDonne)}</b></span>}
              </div>
              {txTotal === 0 ? (
                sessionExpiree && !demo
                  ? <Empty icon={Clock} title="Opérations non chargées">Elles réapparaîtront dès que votre espace sera rouvert.</Empty>
                  : <Empty icon={Clock} title="Aucune opération pour l'instant">Vos recharges et achats apparaîtront ici.</Empty>
              ) : chartMode ? (
                <SoldeChart timeline={timeline} maxBal={maxBal} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx}
                  zoom={chartZoom} setZoom={setChartZoom} fmt={fmt} />
              ) : (
                <>
                  <ul className={sp.txList}>{txSlice.map((t, i) => <TxRow key={i} t={t} />)}</ul>
                  <Pagination page={txPage} pages={txPages} onChange={p => { setTxPage(p); window.scrollTo(0, 0) }} />
                </>
              )}
              <Button variant="ghost" block onClick={() => go('accueil')}>Retour au solde</Button>
            </section>
          )}

          {/* ── REMBOURSER LE SOLDE (20/11/2026) ── */}
          {tab === 'rembourser' && (
            <div className={sp.stack}>
              <button type="button" className={sp.back} onClick={() => go('accueil')}><ArrowLeft size={16} /> Mon solde</button>
              {donFait ? (
                <section className={clsx(sp.card, sp.done)}>
                  <span className={sp.doneIcon}><Heart size={28} /></span>
                  <h2>Merci {String(spec.nom || '').split(' ')[0]} !</h2>
                  <b className={sp.rechargeMontant}>{fmt(donFait.montant)}</b>
                  <p>donnés à l'ONG Ylla pour la lutte contre le cancer du sein.</p>
                  <p>Solde restant : <b>{fmt(spec.solde || 0)}</b></p>
                  <p className={sp.muted}>Le don apparaît dans votre historique.</p>
                  <div className={sp.doneActions}>
                    <Button block onClick={() => go('accueil')}>Retour au solde</Button>
                  </div>
                </section>
              ) : rembClos ? (
                <section className={sp.card}>
                  <h2>Remboursement</h2>
                  <p className={sp.info}>Le remboursement était possible jusqu'au {limiteTxt}. Passé cette date, les soldes non réclamés sont reversés à l'ONG Ylla, pour la lutte contre le cancer du sein.</p>
                </section>
              ) : demandeVue ? (
                <section className={sp.card}>
                  <div className={sp.rembHead}>
                    <h2>Ma demande</h2>
                    <Badge tone={{ en_attente: 'warning', rembourse: 'success', annule: 'neutral', refuse: 'danger', echec: 'danger' }[demandeVue.statut] || 'neutral'}>
                      {{ en_attente: 'En cours', rembourse: 'Remboursé', annule: 'Annulée', refuse: 'Refusée', echec: 'Échec' }[demandeVue.statut] || '—'}
                    </Badge>
                  </div>
                  <p className={sp.muted}>{fmt(demandeVue.total || 0)} · demandée le {String(demandeVue.date || '').slice(0, 5)} à {String(demandeVue.heure || '').slice(0, 5)}</p>
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
                    ? <Button variant="secondary" block onClick={annulerDemande}>Annuler la partie billetterie</Button>
                    : (spec.solde || 0) > 0 && <Button variant="secondary" block onClick={() => setDemandes(d => d.map(x => x.id === demandeVue.id ? { ...x, timestamp: '' } : x))}>Nouvelle demande</Button>}
                </section>
              ) : planRemb && planRemb.total > 0 ? (
                <section className={sp.card}>
                  <h2>Remboursement</h2>
                  <span className={sp.catTitle}>Solde restant</span>
                  <b className={sp.rechargeMontant} style={{ color: 'var(--text)' }}>{fmt(planRemb.total)}</b>
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
                  <p className={clsx(sp.muted, sp.center)}>Gardez le doigt appuyé 3 secondes pour confirmer</p>
                  <p className={clsx(sp.muted, sp.center)}>Aucun frais. Relâcher avant la fin n'envoie rien.</p>
                  {limiteTxt && <p className={clsx(sp.muted, sp.center)}>Remboursement possible jusqu'au {limiteTxt}.</p>}
                </section>
              ) : (
                <Empty icon={Wallet} title="Rien à rembourser">Votre solde est à zéro.</Empty>
              )}
              {/* Don à l'ONG Ylla : proposé tant qu'aucune demande n'attend la billetterie */}
              {!donFait && !rembClos && !demandeEnCours && soldeDon >= DON_MIN && (
                <section className={sp.card}>
                  <h2>Faire un don</h2>
                  <p className={sp.muted}>Offrez tout ou partie de votre solde à l'ONG Ylla, engagée contre le cancer du sein.</p>
                  <Button variant="secondary" block icon={Heart} onClick={ouvrirDon}>Donner à l'ONG Ylla</Button>
                  {limiteTxt && <p className={clsx(sp.muted, sp.center)}>Après le {limiteTxt}, un solde non réclamé est reversé à l'ONG Ylla.</p>}
                </section>
              )}
            </div>
          )}

          {/* ── RECHARGER (Stripe) ── */}
          {tab === 'recharger' && (
            <div className={sp.stack}>
              {retourStripe.session ? (
                <section className={clsx(sp.card, sp.done)}>
                  {rechargeRecue ? (<>
                    <span className={sp.doneIcon}><CheckCircle2 size={28} /></span>
                    <h2>Solde rechargé</h2>
                    <b className={sp.rechargeMontant}>+{fmt(rechargeRecue.montant || 0)}</b>
                    <p>Nouveau solde : <b>{fmt(spec.solde || 0)}</b></p>
                    <p className={sp.muted}>Stripe vous envoie le reçu à l'adresse e-mail saisie lors du paiement.</p>
                  </>) : (<>
                    <span className={sp.doneIcon}><Clock size={28} /></span>
                    <h2>Paiement en cours de vérification</h2>
                    <p>Votre solde sera crédité dès que Stripe confirme le paiement, même si vous fermez cette page.</p>
                  </>)}
                  <div className={sp.doneActions}>
                    <Button block onClick={() => { quitterRecharge(); go('reserver') }}>Commander</Button>
                    <Button variant="secondary" block onClick={quitterRecharge}>Retour au solde</Button>
                  </div>
                </section>
              ) : (
                <section className={sp.card}>
                  <button type="button" className={sp.back} onClick={quitterRecharge}><ArrowLeft size={16} /> Retour</button>
                  <h2>Recharger mon solde</h2>
                  <p className={sp.muted}>Solde actuel : {fmt(spec.solde || 0)}</p>
                  {retourStripe.annule && <p className={sp.info}>Paiement annulé : rien n'a été débité.</p>}
                  <span className={sp.catTitle}>Montant</span>
                  <div className={sp.montants}>
                    {[1000, 2000, 3000, 5000, 10000].map(m => (
                      <button key={m} type="button" aria-pressed={autreMontant === '' && montantRecharge === m}
                        className={clsx(sp.montant, autreMontant === '' && montantRecharge === m && sp.montantOn)}
                        onClick={() => { setMontantRecharge(m); setAutreMontant(''); setRechargeErr('') }}>{m / 100} €</button>
                    ))}
                    <input className={clsx(sp.montant, sp.montantAutre, autreMontant !== '' && sp.montantOn)} inputMode="decimal"
                      placeholder="Autre" aria-label="Autre montant en euros" value={autreMontant}
                      onChange={e => { setAutreMontant(e.target.value.replace(/[^\d.,]/g, '').slice(0, 6)); setRechargeErr('') }} />
                  </div>
                  <p className={sp.muted}>De 5 € à 200 €. Aucun frais pour vous.</p>
                  <div className={sp.nouveauSolde}><span>Nouveau solde</span><b>{montantOk ? fmt((spec.solde || 0) + montantChoisi) : '—'}</b></div>
                  {rechargeErr && <p className={sp.error} role="alert">{rechargeErr}</p>}
                  <Button size="lg" block loading={rechargeBusy} onClick={allerPayer}>
                    {montantOk ? `Payer ${fmt(montantChoisi)}` : 'Payer'}
                  </Button>
                  <p className={clsx(sp.muted, sp.center)}><Lock size={12} aria-hidden="true" /> Vous passez sur la page de paiement sécurisée Stripe</p>
                </section>
              )}
            </div>
          )}

          {/* ── COMMANDER ── */}
          {tab === 'reserver' && (
            <div className={sp.stack}>
              {resaDone ? (
                <section className={clsx(sp.card, sp.done)}>
                  <span className={sp.doneIcon}><KeyRound size={28} /></span>
                  <h2>Votre code</h2>
                  <b className={sp.codeBig} aria-label={`Code ${String(resaDone.code).split('').join(' ')}`}>
                    {String(resaDone.code).slice(0, 3)} {String(resaDone.code).slice(3)}
                  </b>
                  <p>Tapez ce code sur la borne, touche « J'ai un code ». Elle imprime vos tickets.</p>
                  <p className={sp.muted}>
                    {fmt(resaDone.total)} seront débités de votre solde à la borne, au prix affiché ce jour-là.
                    Annulable sans frais avant, depuis « Mes résas ».
                  </p>
                  <div className={sp.doneActions}>
                    <Button variant="secondary" block onClick={() => { setResaDone(null); go('reservations') }}>Voir mes codes</Button>
                    <Button block onClick={() => setResaDone(null)}>Commander autre chose</Button>
                  </div>
                </section>
              ) : (
                <>
                  <p className={sp.info}>Commandez ici, puis tapez votre code sur la borne : elle imprime vos tickets et débite votre solde.</p>
                  {showRayons && (
                    <div className={sp.rayons} role="tablist" aria-label="Rayons">
                      {org.rayons.map(r => {
                        const Icon = getIcon(r.icon)
                        const on = r.id === rayon?.id
                        return (
                          <button key={r.id || 'autres'} type="button" role="tab" aria-selected={on}
                            className={clsx(sp.rayon, on && sp.rayonOn)} onClick={() => { setRayonId(r.id); setCatKey(null) }}>
                            <Icon size={18} aria-hidden="true" /> {r.nom}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {rayon && rayon.cats.length > 1 && (
                    <div className={sp.cats}>
                      {rayon.cats.map(c => {
                        const Icon = getIcon(c.icon)
                        const on = c.key === cat?.key
                        return (
                          <button key={c.key} type="button" aria-pressed={on} className={clsx(sp.catTile, on && sp.catTileOn)}
                            style={{ '--c': c.couleur || 'var(--brand)' }} onClick={() => setCatKey(c.key)}>
                            <span className={sp.catTileIcon}><Icon size={20} aria-hidden="true" /></span>
                            <span className={sp.catTileName}>{c.nom}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {cat ? (
                    <section className={sp.card}>
                      <h2 className={sp.catTitle}>{cat.nom}</h2>
                      <div className={sp.items}>
                        {cat.items.map(m => {
                          const stock = m.stock || 0
                          const q = qtys[m.id] || 0
                          return (
                            <div key={m.id} className={clsx(sp.item, sp.itemClick, q > 0 && sp.itemOn, stock === 0 && sp.menuOut)} onClick={() => setFiche(m)}>
                              <div className={sp.itemPhoto}>
                                {m.photoUrl ? <img src={m.photoUrl} alt="" /> : <span>{(m.nom || '?').charAt(0)}</span>}
                              </div>
                              <b className={sp.itemName}>{m.nom}</b>
                              <span className={sp.itemPrice}>
                                <span className={sp.price}>{fmt(m.prix || 0)}</span>
                                {stock === 0 ? <Badge tone="danger">Rupture</Badge> : stock <= 10 ? <Badge tone="warning">{stock} restant{stock > 1 ? 's' : ''}</Badge> : null}
                              </span>
                              <span className={sp.stepper} onClick={e => e.stopPropagation()}>
                                <button type="button" onClick={() => changeQty(m.id, -1)} disabled={q === 0} aria-label={`Retirer un ${m.nom}`}><Minus size={16} /></button>
                                <b aria-live="polite">{q}</b>
                                <button type="button" className={sp.plus} onClick={() => changeQty(m.id, 1)} disabled={stock === 0 || q >= stock} aria-label={`Ajouter un ${m.nom}`}><Plus size={16} /></button>
                              </span>
                            </div>
                          )
                        })}
                      </div>
                      {fiche && (
                        <ArticleInfoModal item={fiche} qty={qtys[fiche.id] || 0} onClose={() => setFiche(null)}
                          maxAdd={Math.max(0, (fiche.stock || 0) - (qtys[fiche.id] || 0))}
                          raisonBloque={(fiche.stock || 0) === 0 ? 'Épuisé' : 'Stock atteint'}
                          onAddQty={(n) => changeQty(fiche.id, n)} />
                      )}
                    </section>
                  ) : (
                    <Empty icon={UtensilsCrossed} title="La carte n'est pas encore disponible">Les plats et boissons apparaîtront ici dès leur mise en ligne.</Empty>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── MES RÉSAS ── */}
          {tab === 'reservations' && (
            <section className={sp.card}>
              <header className={sp.cardHead}>
                <h2>Mes commandes</h2>
                <span className={sp.muted}>{codesEnLigne.length + resaTotal} au total</span>
              </header>
              {codesEnLigne.length > 0 && (
                <ul className={sp.resas}>
                  {codesEnLigne.map(c => {
                    const st = CODE_STATUS[c.statut] || CODE_STATUS.en_attente
                    return (
                      <li key={c.code} className={clsx(sp.resa, c.statut === 'en_attente' && sp.resaReady)}>
                        <div className={sp.resaTop}>
                          <b className={sp.codeSmall}>{String(c.code).slice(0, 3)} {String(c.code).slice(3)}</b>
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </div>
                        <p className={sp.resaItems}>{(c.items || []).map(i => `${i.qty > 1 ? `${i.qty} ` : ''}${i.nom}`).join(' · ')}</p>
                        <div className={sp.resaBottom}>
                          <span className={sp.muted}>{c.timestamp ? new Date(c.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          <b>{fmt(c.total || 0)}</b>
                        </div>
                        {c.statut === 'en_attente' && <>
                          <p className={sp.resaHint}>Tapez ce code sur la borne « J'ai un code ». Votre solde sera débité à ce moment-là.</p>
                          <Button size="sm" variant="danger" onClick={() => setCancelCode(c.code)}>Annuler (sans frais)</Button>
                        </>}
                        {c.statut === 'utilise' && c.commandeNumero && <p className={sp.muted}>Tickets imprimés · commande n° {c.commandeNumero}</p>}
                      </li>
                    )
                  })}
                </ul>
              )}
              {resaTotal === 0 && codesEnLigne.length > 0 ? null : resaTotal === 0 ? (
                <Empty icon={Bookmark} title="Aucune réservation" action={<Button size="sm" onClick={() => go('reserver')}>Commander</Button>}>
                  Vos commandes apparaîtront ici : commandez depuis la carte, récupérez quand c'est prêt.
                </Empty>
              ) : (
                <>
                  <ul className={sp.resas}>
                    {resaSlice.map(r => {
                      const st = RESA_STATUS[r.status] || RESA_STATUS.pending
                      return (
                        <li key={r.id} className={clsx(sp.resa, r.status === 'ready' && sp.resaReady)}>
                          <div className={sp.resaTop}>
                            <b>#{r.code}</b>
                            <Badge tone={st.tone}>{st.label}</Badge>
                          </div>
                          <p className={sp.resaItems}>{(r.items || []).map(i => `${i.qty > 1 ? `${i.qty} ` : ''}${i.nom}`).join(' · ')}</p>
                          <div className={sp.resaBottom}>
                            <span className={sp.muted}>{r.date}</span>
                            <b>{fmt(r.total || 0)}</b>
                          </div>
                          {r.status === 'ready' && <p className={sp.resaHint}>Présentez-vous au stand pour la retirer.</p>}
                          {r.status === 'pending' && (
                            <Button size="sm" variant="danger" onClick={() => setCancelId(r.id)}>Annuler la commande</Button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  <Pagination page={resaPage} pages={resaPages} onChange={p => { setResaPage(p); window.scrollTo(0, 0) }} />
                </>
              )}
            </section>
          )}

          {/* ── PROGRAMME ── */}
          {tab === 'programme' && (
            <PlanningSpec planning={planningData} eventId={eventId} specId={spec?.id} themeColor={themeColor} />
          )}
          </PageTransition>
        </>)}

        <footer className={sp.footer}>
          <div>{APP_FULL_LABEL} · Maison Ylla</div>
          <CheckUpdateButton variant="compact"/>
        </footer>
      </main>

      {/* Panier de commande : toujours visible au-dessus des onglets */}
      {spec && tab === 'reserver' && !resaDone && cartItems.length > 0 && (
        <div className={sp.cartBar}>
          <div className={sp.cartInfo}>
            <span>{cartItems.reduce((a, i) => a + i.qty, 0)} article(s)</span>
            <b>{fmt(cartTotal)}</b>
          </div>
          <Button variant="coral" size="lg" loading={resaLoading} onClick={doResa}>Obtenir mon code</Button>
          {resaErr && <p className={sp.cartErr} role="alert">{resaErr}</p>}
          {/* Solde insuffisant (20/11/2026) : recharge en un geste, le panier est conservé */}
          {resaErr && manque > 0 && !billetAnnule && (
            <div className={sp.cartRecharge}>
              <Button block icon={CreditCard} onClick={rechargerLeManque}>Recharger mon solde</Button>
              <span className={sp.muted}>Votre panier est conservé. Vous pouvez aussi recharger à la billetterie.</span>
            </div>
          )}
        </div>
      )}

      {/* Barre d'onglets */}
      {spec && (
        <nav className={sp.nav} aria-label="Navigation">
          {NAV.map(n => {
            const Icon = n.icon
            const on = n.match.includes(tab)
            return (
              <button key={n.id} type="button" className={clsx(sp.navItem, on && sp.navOn)} aria-current={on ? 'page' : undefined}
                onClick={() => { go(n.id); if (n.id === 'programme' && nonLuPlanning > 0) marquerToutLu() }}>
                <span className={sp.navIcon}>
                  <Icon size={20} aria-hidden="true" />
                  {n.badge > 0 && <span className={sp.navBadge}>{n.badge}</span>}
                </span>
                {n.label}
              </button>
            )
          })}
        </nav>
      )}

      {/* QR agrandi, sur fond blanc pour le scan */}
      {qrOpen && qrDataUrl && (
        <div className={sp.qrFull} onClick={closeQr} role="dialog" aria-modal="true" aria-label="Mon QR code">
          <b>{spec?.nom}</b>
          <img src={qrDataUrl} alt="QR code de paiement" />
          <span className={sp.qrBar}><i style={{ width: `${(qrReste / 30) * 100}%` }} /></span>
          <span>Se renouvelle dans {qrReste} s · une capture d'écran ne fonctionne pas</span>
          {secours && <span className={sp.secoursFull}>Scanner en panne ? Tapez ce code<b>{secours.code}</b></span>}
          <p>Présentez ce QR à la borne. Touchez l'écran pour fermer.</p>
          <Button variant="secondary" onClick={closeQr}>Fermer</Button>
        </div>
      )}

      <Dialog open={donOpen} onClose={() => { if (!donBusy) setDonOpen(false) }} title="Donner à l'ONG Ylla"
        footer={<Button variant="ghost" disabled={donBusy} onClick={() => setDonOpen(false)}>Annuler</Button>}>
        <div className={sp.donBody}>
          <span className={sp.catTitle}>L'ONG Ylla</span>
          <p>L'ONG Ylla œuvre en France et en Afrique pour la lutte contre le cancer du sein, l'accompagnement des populations et la promotion du vivre-ensemble. Elle agit en mémoire de Yolande Ylla Seri Bah.</p>
          <span className={sp.catTitle}>À quoi sert votre don</span>
          <div className={sp.rembLines}>
            <div className={sp.rembLine}><span className={sp.rembText}><b>Prévenir et sensibiliser</b><span className={sp.muted}>informer pour réduire les risques</span></span></div>
            <div className={sp.rembLine}><span className={sp.rembText}><b>Dépister</b><span className={sp.muted}>détecter tôt pour sauver des vies</span></span></div>
            <div className={sp.rembLine}><span className={sp.rembText}><b>Accompagner</b><span className={sp.muted}>soutenir les femmes touchées par la maladie</span></span></div>
          </div>
          <p className={sp.muted}>Déjà plus de 1 000 femmes et hommes sensibilisés, dans 3 pays. <a className={sp.donLink} href="https://ongylla.org" target="_blank" rel="noopener noreferrer">Découvrir l'ONG sur ongylla.org</a></p>
          <span className={sp.catTitle}>Montant du don</span>
          <div className={sp.montants}>
            {[200, 500, 1000, 2000].filter(m => m < soldeDon).map(m => (
              <button key={m} type="button" aria-pressed={donChoix === m} className={clsx(sp.montant, donChoix === m && sp.montantOn)}
                onClick={() => { setDonChoix(m); setDonAutre(''); setDonErr('') }}>{m / 100} €</button>
            ))}
            <button type="button" aria-pressed={donChoix === soldeDon} className={clsx(sp.montant, donChoix === soldeDon && sp.montantOn)}
              onClick={() => { setDonChoix(soldeDon); setDonAutre(''); setDonErr('') }}>Tout</button>
            <input className={clsx(sp.montant, sp.montantAutre, donChoix == null && sp.montantOn)} inputMode="decimal"
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
          <p className={clsx(sp.muted, sp.center)}>Gardez le doigt appuyé 3 secondes pour confirmer</p>
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
      <span className={clsx(sp.rembIcon, sp['remb_' + kind])}><Icon size={16} aria-hidden="true" /></span>
      <span className={sp.rembText}>
        <span>{titre}</span>
        {sous && <span className={sp.muted}>{sous}</span>}
        {etat && <Badge tone={etat[0]}>{etat[1]}</Badge>}
      </span>
      <b>{fmt(montant || 0)}</b>
    </div>
  )
}
