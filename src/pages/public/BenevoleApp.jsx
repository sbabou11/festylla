/**
 * pages/public/BenevoleApp.jsx
 * Espace bénévole — URL : /benevole?id=DOC_ID&ev=EVENT_ID
 *
 * Quota par catégorie (repas/boisson/eau) au lieu d'un solde en euros, affiché en bocaux.
 * Le bénévole réserve des articles du menu (déduits du quota), voit son créneau
 * sur un ruban horaire et pointe son arrivée en scannant le QR du poste.
 *
 * demo : données d'exemple (route /ui/benevole en développement), aucune écriture Firestore.
 *
 * Nouveau style (23/11/2026, maquette validée) : classe `nv` (styles/nouveau.css), accueil sur
 * dégradé avec cartes de verre, barre d'onglets flottante. Logique inchangée.
 */
import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { remonter, garderPlace, remettrePlace } from '../../utils/placePage'
import QuoiDeNeuf from '../../components/QuoiDeNeuf'
import { db } from '../../firebase/config'
import {
  collection, query, where, getDoc,
  doc, onSnapshot, addDoc, updateDoc,
  serverTimestamp, increment,
} from 'firebase/firestore'
import { nowStr, makeResaCode, fmt } from '../../utils/helpers'
import { repartirPanier } from '../../utils/avantagesBenevole'
import { getSettings, watchVolunteerPosts, watchVolunteerShifts, assignBenevoleToPost, pointerArrivee, creerCodeBenevole, annulerCodeEnLigne } from '../../firebase/service'
import { watchCarte } from '../../menu/carte'
import { APP_VERSION_LABEL, APP_FULL_LABEL } from '../../utils/buildInfo'
import CheckUpdateButton from '../../components/CheckUpdateButton'
import { apiFetch } from '../../firebase/session'
import { friendlyError } from '../../utils/errors'
import {
  currentOrNext, myShifts, relativeLabel, canCheckIn, fmtHour,
  parsePostScan, postQrText, CHECKIN_EARLY_MIN,
} from '../../utils/shiftTime'
import BenevoleCommander, { MesCodes } from './BenevoleCommander'
import BenevoleResas     from './BenevoleResas'
import BenevoleProfil    from './BenevoleProfil'
import QRCode from 'qrcode'
import useQrEspace from '../../hooks/useQrEspace'
import {
  UtensilsCrossed, Coffee, Droplets, ShoppingCart, Home, User, LogOut, CalendarDays,
  ScanLine, QrCode, Ticket, CheckCircle2, AlertCircle, Store, ChevronRight, MapPin, BellRing, Lock,
} from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'
import NotifBell from '../../components/NotifBell'
import TeamChat from '../../components/TeamChat'
import ThemeToggle from '../../components/ThemeToggle'
import BenevolePlanning from '../../components/BenevolePlanning'
import QrScanner from '../../components/QrScanner'
import CommandeDetail from '../../components/CommandeDetail'
import DetailSheet from '../../components/DetailSheet'
import { parisNow } from '../../billets/entree'
import { festDay, quotasDuJour, isEmFiche, dayLabel, nextDay } from '../../em/jour'
import useAuthStore from '../../store/useAuthStore'
import { useTheme } from '../../hooks/useTheme'
import { Badge, Button, Dialog, Sheet, Jar, TimeRibbon, SuccessCheck, SessionBanner, toast } from '../../ui'
import s from './benevole/BenevoleApp.module.css'
import OngletRole, { useOngletRole, ROLE_ONGLET } from './benevole/OngletRole'
import { usePorteMonnaie, CarteSolde, RechargerSheet, useRetourStripe } from './benevole/PorteMonnaie'

const BRAND    = 'var(--brand)'
const AMBER    = 'var(--gold-dark)'
const AMBER_L  = 'var(--gold-light)'

const TYPE_CFG = {
  repas:   { label:'Repas',   icon:UtensilsCrossed, color:'var(--coral-dark)', bg:'var(--coral-light)', tone:'var(--coral)', emoji:'🍽️' },
  boisson: { label:'Boisson', icon:Coffee,          color:'var(--gold-dark)',  bg:'var(--gold-light)',  tone:'var(--gold)',  emoji:'☕' },
  eau:     { label:'Eau',     icon:Droplets,        color:'var(--brand-dark)', bg:'var(--brand-light)', tone:'var(--brand)', emoji:'💧' },
}

const HOUR = 3600000
const initialsOf = (b) => ((b?.prenom?.[0] || '') + (b?.nom?.[0] || '')).toUpperCase() || 'B'

export default function BenevoleApp({ docIdProp, eventIdProp, onSwitchToStaff = null, demo = null } = {}) {
  const params    = new URLSearchParams(window.location.search)
  const docId     = demo ? demo.benev._id : (docIdProp  || params.get('id')  || null)
  const eventId   = demo ? 'demo' : (eventIdProp || params.get('ev') || null)
  // Nouveau style (23/11/2026) : les feuilles et fenêtres s'affichent dans <body>, hors de la racine .nv
  useEffect(() => {
    document.body.classList.add('nv')
    return () => document.body.classList.remove('nv')
  }, [])

  const benevCol  = () => eventId
    ? collection(db, 'events', eventId, 'benevoles')
    : collection(db, 'benevoles')
  const menuCol   = () => eventId
    ? collection(db, 'events', eventId, 'menu')
    : collection(db, 'menu')
  const resaCol   = () => eventId
    ? collection(db, 'events', eventId, 'reservations')
    : collection(db, 'reservations')

  const [benev,       setBenev]       = useState(demo?.benev || null)
  useTheme() // Active le thème global (mode sombre/clair) sur cette page
  const { notifications, nonLuCount, marquerToutLu } = useNotifications({
    specId:  docId,  // benevoleId utilisé comme specId pour le filtre
    isStaff: false,
    eventId: demo ? null : eventId,
  })
  const [menu,        setMenu]        = useState(demo?.menu || [])
  // Parcours borne (19/11/2026) : carte en rayons et catégories, commande = code à taper sur la borne
  const [carte,       setCarte]       = useState(demo?.carte || { rayons: [], stands: [] })
  const [categories,  setCategories]  = useState(demo?.categories || [])
  const [codes,       setCodes]       = useState(demo?.codes || [])
  const [cancelCode,  setCancelCode]  = useState(null)
  const [resas,       setResas]       = useState(demo?.resas || [])
  const [eventMeta,   setEventMeta]   = useState(demo?.eventMeta || null)
  const [benevoles,   setBenevoles]   = useState(demo?.benevoles || [])  // pour afficher les noms dans le planning
  const [posts,       setPosts]       = useState(demo?.posts || [])
  const [shifts,      setShifts]      = useState(demo?.shifts || [])
  const { logout } = useAuthStore()
  const [tab,         setTabBrut]     = useState('accueil')
  // Écran 9 (23/11/2026) : « Résas » est rangé dans « Conso », vues « Commander » et « Mes commandes ».
  // Les anciens liens vers 'mes-resas' ouvrent « Conso › Mes commandes » ; vers 'commander', « Commander ».
  const [consoVue,    setConsoVue]    = useState('commander')
  const setTab = (t) => {
    if (t === 'mes-resas') { setConsoVue('resas'); setTabBrut('commander'); return }
    if (t === 'commander') setConsoVue('commander')
    setTabBrut(t)
  }
  // Barre du bas (24/11/2026) : l'onglet où l'on est déjà ramène en haut ; en revenant sur un
  // onglet, on retrouve sa place
  const changerOnglet = (t) => {
    if (t === tab) { remonter(); return }
    garderPlace('bv-' + tab); setTabBrut(t)
  }
  useLayoutEffect(() => { remettrePlace('bv-' + tab) }, [tab])
  const [qtys,        setQtys]        = useState({})
  const [resaLoading, setResaLoading] = useState(false)
  const [resaErr,     setResaErr]     = useState('')
  const [resaDone,    setResaDone]    = useState(null)
  const [qrDataUrl,   setQrDataUrl]   = useState(null)
  const [themeColor,  setThemeColor]  = useState('#009090')
  const [qrOpen,      setQrOpen]      = useState(false)
  const [pwdForm,     setPwdForm]     = useState({ current:'', new1:'', new2:'' })
  const [pwdLoading,  setPwdLoading]  = useState(false)
  const [pwdMsg,      setPwdMsg]      = useState(null) // { ok, text }
  const [cancelAsk,   setCancelAsk]   = useState(null) // { id, code }
  // Cartes de l'accueil cliquables (23/11/2026, maquette validée) : 'creneau' | 'sansCreneau' | 'quotas' | 'demain' | 'entree'
  const [carteOuverte, setCarteOuverte] = useState(null)
  const [cmdPrete,     setCmdPrete]     = useState(null) // commande prête ouverte en détail
  const [scanOpen,    setScanOpen]    = useState(false)
  const [pointage,    setPointage]    = useState({ state: 'idle' }) // idle | busy | done | error
  const [now,         setNow]         = useState(Date.now())
  // Session fermée (20/11/2026) : la base a refusé de répondre à une écoute de cet espace
  const [sessionFermee, setSessionFermee] = useState(false)
  // Une écoute refusée par la base (session absente ou remplacée par un autre lien) n'est plus
  // avalée : on le retient pour l'expliquer au bénévole. Les autres erreurs (réseau, index manquant)
  // gardent leur comportement d'avant. Jamais en démonstration, ni sans événement (aucune session
  // de lien n'est alors ouverte, « Réessayer » n'y changerait rien).
  const refusBase = (e) => {
    if (demo || !eventId) return
    if (e?.code === 'permission-denied' || e?.code === 'unauthenticated') setSessionFermee(true)
  }
  // « Réessayer » : la page est rechargée, et LinkGate rouvre la session à partir du lien personnel
  // (clé de l'adresse ou clé retenue par le téléphone). Aucun autre chemin d'ouverture n'est ajouté.
  const rouvrirEspace = () => window.location.reload()

  // Horloge : le ruban et les libellés « dans 20 min » restent à jour
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  // Charger le thème de l'événement
  useEffect(() => {
    if (!eventId || demo) return
    getSettings(eventId).then(s => {
      if (s?.theme?.brand) {
        setThemeColor(s.theme.brand)
        document.documentElement.style.setProperty('--brand', s.theme.brand)
        const hex = s.theme.brand.replace('#','')
        const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16)
        document.documentElement.style.setProperty('--brand-dark', '#'+[r,g,b].map(v=>Math.max(0,Math.round(v*.8)).toString(16).padStart(2,'0')).join(''))
      }
    }).catch(()=>{})
  }, [eventId])

  // Charger infos événement
  useEffect(() => {
    if (!eventId || demo) return
    getDoc(doc(db, 'events', eventId)).then(snap => {
      if (snap.exists()) setEventMeta(snap.data())
    }).catch(() => {})
  }, [eventId])

  // Charger le bénévole
  useEffect(() => {
    if (!docId || demo) return
    const ref = eventId
      ? doc(db, 'events', eventId, 'benevoles', docId)
      : doc(db, 'benevoles', docId)
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) setBenev({ ...snap.data(), _id: snap.id })
    }, refusBase)
    return unsub
  }, [docId, eventId])

  // Charger le menu en temps réel (articles éligibles bénévoles)
  useEffect(() => {
    if (!eventId || demo) return
    const unsub = onSnapshot(menuCol(), snap => {
      // Écran 13 (24/11/2026) : toute la carte (avantages + solde), comme un spectateur
      setMenu(snap.docs.map(d => ({ ...d.data(), id: d.id })).filter(m => m.actif !== false))
    }, refusBase)
    return () => unsub()
  }, [eventId])

  // Rayons, catégories et codes du bénévole (parcours borne)
  useEffect(() => {
    if (!eventId || demo) return
    // La carte (réglages de l'événement) est une lecture publique : elle ne peut pas être refusée
    // pour une question de session, son erreur reste donc ignorée (20/11/2026)
    const offCarte = watchCarte(eventId, setCarte, () => {})
    const offCats = onSnapshot(collection(db, 'events', eventId, 'categories'),
      snap => setCategories(snap.docs.map(d => ({ ...d.data(), id: d.id }))), refusBase)
    return () => { offCarte(); offCats() }
  }, [eventId])
  useEffect(() => {
    if (!eventId || !docId || demo) return
    return onSnapshot(query(collection(db, 'events', eventId, 'codes'), where('benevoleId', '==', docId)),
      snap => setCodes(snap.docs.map(d => d.data()).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))),
      refusBase)
  }, [eventId, docId])

  // Liste de tous les bénévoles (pour afficher les noms dans le planning d'auto-inscription)
  useEffect(() => {
    if (!eventId || demo) return
    // Sécurité, lot 3 : annuaire (prénom, nom, poste) tenu par l'équipe, jamais les fiches complètes
    const unsub = onSnapshot(collection(db, 'events', eventId, 'benevoles-annuaire'), snap => {
      setBenevoles(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, (e) => { setBenevoles([]); refusBase(e) })
    return () => unsub()
  }, [eventId])

  // Postes et créneaux (ruban horaire, pointage, onglet Planning)
  useEffect(() => {
    if (!eventId || demo) return
    const u1 = watchVolunteerPosts(setPosts, eventId)
    const u2 = watchVolunteerShifts(setShifts, eventId)
    return () => { u1?.(); u2?.() }
  }, [eventId])

  // Charger les réservations du bénévole
  useEffect(() => {
    if (!docId || !eventId || demo) return
    const unsub = onSnapshot(
      query(resaCol(), where('benevoleId', '==', docId)),
      snap => setResas(snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))),
      refusBase
    )
    return () => unsub()
  }, [docId, eventId])

  // QR code tournant (23/11/2026) : il change toutes les 30 s, une photo ne permet plus de commander
  // à la borne. Calculé avec la clé du lien personnel si l'appareil la connaît (ouverture par le
  // lien) ; sinon demandé au serveur avec la session (hooks/useQrEspace).
  const cleQr = (() => {
    if (demo) return 'demo'
    try { return (localStorage.getItem(`yllacash-lien-benevole-${eventId}-${docId}`) || '').toLowerCase() } catch { return '' }
  })()
  const qrEspace = useQrEspace({ kind: 'benevole', ev: demo ? 'demo' : eventId, id: docId, cle: cleQr })
  useEffect(() => {
    if (!qrEspace.texte) { setQrDataUrl(null); return }
    let vivant = true
    QRCode.toDataURL(qrEspace.texte, { width: 400, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#003048', light: '#fff' } })
      .then(u => { if (vivant) setQrDataUrl(u) }).catch(() => {})
    return () => { vivant = false }
  }, [qrEspace.texte])

  const openQr = useCallback(() => setQrOpen(true), [])
  const closeQr = useCallback(() => setQrOpen(false), [])

  const benevNom = `${benev?.prenom||''} ${benev?.nom||''}`.trim()
  const myId = benev?.id || docId
  // Écran 11 (24/11/2026) : onglet du rôle d'équipe, verrouillé hors créneau (vérifié par le serveur)
  const roleEquipe = ROLE_ONGLET[benev?.roleEquipe] ? benev.roleEquipe : ''
  const ongletRole = useOngletRole({ eventId, role: roleEquipe, actif: !demo && !!roleEquipe, demo: !!demo })
  useEffect(() => { if (!roleEquipe && tab === 'role') setTabBrut('accueil') }, [roleEquipe, tab])
  // Écran 13 (24/11/2026) : solde du bénévole (porte-monnaie de type spectateur), recharge en ligne
  const porteMonnaie = usePorteMonnaie({ eventId, actif: !demo && !!benev, demo: !!demo })
  const [rechargeOuverte, setRechargeOuverte] = useState(false)
  useRetourStripe()

  const changePwd = async () => {
    setPwdMsg(null)
    // Champs requis et longueur : contrôlés dans BenevoleProfil avant l'appel

    setPwdLoading(true)
    try {
      if (!demo) {
        // Vérification de l'ancien mot de passe et enregistrement : par le serveur (session du bénévole)
        await apiFetch('/api/mot-de-passe', { body: { mode: 'changer', ancien: pwdForm.current, nouveau: pwdForm.new1 } })
      }
      setPwdMsg({ ok:true, text:'Mot de passe modifié avec succès !' })
      setPwdForm({ current:'', new1:'', new2:'' })
    } catch (e) {
      setPwdMsg({ ok:false, text:friendlyError(e, "Le mot de passe n'a pas été modifié.") })
    } finally { setPwdLoading(false) }
  }

  // Panier
  const cartItems = Object.entries(qtys)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ ...menu.find(m => m.id === id), qty }))
    .filter(i => i.nom)

  // Vérifier quota disponible par type
  // Fiche venue d'Event Manager : droits du jour (journée finie à 6 h), sinon totaux de l'événement
  const em     = isEmFiche(benev)
  const jour   = festDay(now)
  const quotas = quotasDuJour(benev, jour)
  const quotaRestant = (type) => Math.max(0, (quotas.droits[type] || 0) - (quotas.conso[type] || 0))
  const quotaDroit = (type) => quotas.droits[type] || 0
  // Champ de consommation à faire évoluer pour une commande d'une journée donnée
  const consoPath = (type, j = jour) => em ? `consoJours.${j}.${type}` : `consommation.${type}`

  // Annuler une réservation (après confirmation dans la fenêtre)
  const annulerResa = async (resaId, code) => {
    try {
      const resa = resas.find(r => r.id === resaId)
      // Sommer les qty par type pour éviter les écrasements
      const grouped = {}
      ;(resa?.items||[]).forEach(item => {
        if (item.typeConsommation) {
          grouped[item.typeConsommation] = (grouped[item.typeConsommation] || 0) + (item.qty || 1)
        }
      })

      if (demo) {
        setResas(rs => rs.map(r => r.id === resaId ? { ...r, status: 'cancelled' } : r))
        setBenev(b => {
          const conso = { ...(b.consommation || {}) }
          Object.entries(grouped).forEach(([t, q]) => { conso[t] = Math.max(0, (conso[t] || 0) - q) })
          return { ...b, consommation: conso }
        })
        toast.success(`Réservation #${code} annulée`)
        return
      }

      const rRef = eventId
        ? doc(db, 'events', eventId, 'reservations', resaId)
        : doc(db, 'reservations', resaId)
      await updateDoc(rRef, {
        status:          'cancelled',
        cancelledBy:     benev?.prenom + ' ' + benev?.nom,
        cancelledByRole: 'spectateur', // traité comme annulation client
        cancelledAt:     new Date().toISOString(),
        motifAnnulation: 'Annulé par le bénévole',
      })
      // Rembourser le quota — regrouper par typeConsommation
      if (resa) {
        const bRef = eventId
          ? doc(db, 'events', eventId, 'benevoles', docId)
          : doc(db, 'benevoles', docId)
        if (Object.keys(grouped).length) {
          const updates = {}
          Object.entries(grouped).forEach(([type, qty]) => {
            updates[consoPath(type, resa.jourConso || festDay(resa.createdAt))] = increment(-qty)
          })
          // Sécurité (20/11/2026) : le bénévole ne modifie plus ses compteurs ; pour une ancienne
          // réservation, c'est l'équipe qui rend le droit (page Réservations)
          await updateDoc(bRef, updates).catch(() => {})
        }
        // Rembourser le stock menu pour chaque article
        for (const it of (resa.items || [])) {
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
      }
      // Log audit annulation
      const auditColAnnu = eventId ? collection(db, 'events', eventId, 'audit') : collection(db, 'audit')
      const nowAnnu = new Date()
      await addDoc(auditColAnnu, {
        action: 'BENEV_ANNULATION', benevoleId: docId,
        benevoleNom: benevNom,
        resaId, resaCode: code, userType: 'benevole',
        label: `Annulation réservation bénévole #${code}`,
        date: nowAnnu.toLocaleString('fr-FR'), timestamp: nowAnnu.toISOString(),
        createdAt: serverTimestamp(),
      })
      // Notif staff
      const notifCol = eventId
        ? collection(db, 'events', eventId, 'notifications')
        : collection(db, 'notifications')
      await addDoc(notifCol, {
        type: 'RESA_RETIREE', titre: '❌ Résa annulée par bénévole',
        message: `${benevNom} a annulé sa réservation #${code}`,
        specId: null, benevoleId: docId, resaCode: code,
        lu: false, timestamp: new Date().toISOString(), createdAt: serverTimestamp(),
      })
      toast.success(`Réservation #${code} annulée`)
    } catch (e) { toast.error(friendlyError(e, "La réservation n'a pas pu être annulée.")) } // pas de « Réessayer » : le quota pourrait être rendu deux fois
  }

  // Parcours borne (19/11/2026) : la commande donne un code à taper sur la borne. On vérifie
  // qu'il reste assez de droits, mais ils ne sont décomptés qu'à la borne (serveur, api/borne.js).
  const doCommande = async () => {
    if (!benev || !cartItems.length) return
    setResaLoading(true); setResaErr('')
    try {
      // Écran 13 : au-delà des avantages, la commande se paie sur le solde (vérifié de nouveau à la borne)
      const panier = repartirPanier(cartItems, Object.fromEntries(['repas', 'boisson', 'eau'].map(t => [t, quotaRestant(t)])))
      const solde = porteMonnaie.compte?.solde ?? 0
      if (panier.totalPaye > solde) throw new Error(`Solde insuffisant : il manque ${fmt(panier.totalPaye - solde)}. Rechargez votre solde.`)
      if (demo) {
        const code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0')
        setCodes(c => [{ code, origine: 'benevole', statut: 'en_attente', items: cartItems.map(i => ({ nom: i.nom, qty: i.qty })), timestamp: new Date().toISOString() }, ...c])
        setResaDone({ code }); setQtys({}); return
      }
      const r = await creerCodeBenevole({
        benevoleId: docId, benevoleNom: benevNom,
        items: cartItems.map(i => ({ id: i.id, nom: i.nom, qty: i.qty, typeConsommation: i.typeConsommation || '', prixUnit: Number(i.prix) || 0 })),
      }, eventId)
      setResaDone(r); setQtys({})
    } catch (e) { setResaErr(friendlyError(e, "La commande n'a pas été enregistrée.")) }
    finally { setResaLoading(false) }
  }

  // ── Créneau courant et pointage ─────────────────────────────────
  const postsById = useMemo(() => Object.fromEntries(posts.map(p => [p.id, p])), [posts])
  const postName = (pid) => pid === '__free__' ? 'Polyvalent' : (postsById[pid]?.nom || 'Poste')
  const slot = currentOrNext(shifts, myId, now)
  const presence = slot ? slot.shift.presences?.[myId] : null
  const checkInOpen = slot && canCheckIn(slot.range, now)

  // Ruban centré sur le créneau affiché (2 h avant, 1 h après) ; les créneaux voisins y apparaissent s'ils débordent dans la fenêtre
  const ribbon = useMemo(() => {
    if (!slot) return null
    const start = new Date(slot.range.start.getTime() - 2 * HOUR)
    const end   = new Date(slot.range.end.getTime() + HOUR)
    start.setMinutes(0, 0, 0)
    const mine = myShifts(shifts, myId).filter(x => x.range.end > start && x.range.start < end)
    return {
      start, end,
      items: mine.map(x => ({
        id: x.shift.id,
        start: x.range.start,
        end: x.range.end,
        label: `${postsById[x.postId]?.emoji ? postsById[x.postId].emoji + ' ' : ''}${postName(x.postId)}`,
        sub: `${fmtHour(x.range.start)}–${fmtHour(x.range.end)}`,
        color: postsById[x.postId]?.couleur || 'var(--brand)',
        active: x.shift.id === slot.shift.id,
        dim: x.range.end.getTime() <= now,
      })),
    }
  }, [slot?.shift.id, shifts, posts, now])

  const openScan = () => { setPointage({ state: 'idle' }); setScanOpen(true) }

  const handlePointageScan = async (text) => {
    if (pointage.state === 'busy' || pointage.state === 'done') return
    const { post, error } = parsePostScan(text, posts, demo ? null : eventId)
    if (error) { setPointage({ state: 'error', msg: error }); return }
    const t = Date.now()
    const candidates = myShifts(shifts, myId).filter(x => canCheckIn(x.range, t))
    if (!candidates.length) {
      setPointage({ state: 'error', msg: `Aucun de vos créneaux ne commence dans l'heure. Le pointage ouvre ${CHECKIN_EARLY_MIN} min avant le début.` })
      return
    }
    const match = candidates.find(x => x.postId === post.id) || candidates.find(x => x.postId === '__free__')
    if (!match) {
      setPointage({ state: 'error', msg: `Ce QR est celui du poste ${post.nom}. Votre poste sur ce créneau : ${postName(candidates[0].postId)}.` })
      return
    }
    const retardMin = Math.max(0, Math.round((t - match.range.start.getTime()) / 60000))
    setPointage({ state: 'busy' })
    try {
      let res
      if (demo) {
        const prev = match.shift.presences?.[myId]
        res = prev ? { already: true, at: prev.at } : { already: false, at: new Date().toISOString() }
        if (!prev) setShifts(list => list.map(sh => sh.id === match.shift.id
          ? { ...sh, presences: { ...(sh.presences || {}), [myId]: { at: res.at, postId: post.id, retardMin } } }
          : sh))
      } else {
        res = await pointerArrivee(match.shift.id, myId, { postId: post.id, benevoleNom: benevNom, retardMin }, eventId)
      }
      setPointage({ state: 'done', at: res.at, already: res.already, post })
    } catch (e) {
      setPointage({ state: 'error', msg: friendlyError(e, "Le pointage n'a pas été enregistré.") })
    }
  }

  // Affectation sur le planning en mode démo
  const demoAssign = async (shiftId, benevId, target) => {
    setShifts(list => list.map(sh => {
      if (sh.id !== shiftId) return sh
      const postes = Object.fromEntries(Object.entries(sh.postes || {}).map(([pid, p]) => [pid, { ...p, assignments: (p.assignments || []).filter(id => id !== benevId) }]))
      const libres = (sh.libres || []).filter(id => id !== benevId)
      if (target === '__free__') libres.push(benevId)
      else if (target !== '__remove__') postes[target] = { target: postes[target]?.target ?? 1, assignments: [...(postes[target]?.assignments || []), benevId] }
      return { ...sh, postes, libres }
    }))
  }

  if (!docId) return (
    <div className={s.invalid}>
      <div>
        <div style={{ fontSize:40, marginBottom:12 }}>🔗</div>
        <b>Lien invalide</b>
        <p>Scannez le QR code fourni par l'organisation.</p>
      </div>
    </div>
  )

  const readyResas = resas.filter(r => r.status === 'ready')
  const pendingResas = resas.filter(r => r.status === 'pending' || r.status === 'processing').length
  const rel = slot ? relativeLabel(slot.range, now) : null

  // Contrôle des billets : affecté aujourd'hui à un poste marqué « contrôle les billets »
  // Contrôle des billets : jours envoyés par Event Manager, sinon postes « contrôle les billets » du planning
  const canControl = !demo && (em
    ? (benev.controleBillets || []).includes(jour)
    : myShifts(shifts, myId).some(x => x.shift.date === parisNow().jour && postsById[x.postId]?.controleBillets))
  const demain = em ? quotasDuJour(benev, nextDay(jour)).droits : null

  // Session fermée (20/11/2026) : ce qui n'a pas pu être chargé est dit, au lieu de barres à zéro
  const fermee = sessionFermee && !demo
  const quotasNonCharges = (
    <div className={s.noSlot}>
      <b>Quotas non chargés</b>
      <p>Ils réapparaîtront dès que votre espace sera rouvert.</p>
    </div>
  )

  const NAV = [
    { id: 'accueil',   label: 'Accueil',  icon: Home },
    // 23/11/2026 (écran 8) : plus d'onglet « Entrée » ; le contrôle des billets passe au compte équipe « Contrôle entrée »
    ...(em ? [] : [{ id: 'planning',  label: 'Planning', icon: CalendarDays }]),   // planning dans Event Manager
    // Écran 9 : la pastille des commandes passe sur « Conso » (plus d'onglet « Résas »)
    { id: 'commander', label: 'Conso',    icon: ShoppingCart, badge: readyResas.length || pendingResas || 0 },
    // Écran 11 : onglet du rôle d'équipe (cadenas tant qu'il est verrouillé)
    ...(roleEquipe ? [{ id: 'role', label: ROLE_ONGLET[roleEquipe].label, icon: ROLE_ONGLET[roleEquipe].icon, verrou: !ongletRole.ouvert }] : []),
    ...(em ? [] : [{ id: 'profil',    label: 'Profil',   icon: User }]),           // entrée par lien, sans mot de passe
  ]
  // Nouveau style (23/11/2026) : la pastille de l'onglet actif glisse d'un onglet à l'autre
  // (transition sur transform, l'élément reste monté)
  const navIndex = NAV.findIndex(n => n.id === tab)
  const mesCommandes = tab === 'commander' && consoVue === 'resas'
  // Accueil sur dégradé ; les autres onglets sur le fond de liste (disposition inchangée)
  const surDegrade = tab === 'accueil'
  // Créneau : « Mon prochain créneau · dans 18 min » ou « Mon créneau · en cours · fin dans 1h10 »
  const slotKicker = slot
    ? `${slot.range.start.getTime() <= now ? 'Mon créneau' : 'Mon prochain créneau'}${rel?.text ? ' · ' + rel.text.charAt(0).toLowerCase() + rel.text.slice(1) : ''}`
    : ''
  const slotDate = slot
    ? (() => { const d = slot.range.start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); return d.charAt(0).toUpperCase() + d.slice(1) })()
    : ''

  // Compte (23/11/2026) : la bascule vers l'espace équipe et la déconnexion, auparavant dans
  // l'en-tête, sont en bas de l'Accueil (présent pour tous, fiche Event Manager comprise) pour
  // laisser la barre du haut à la cloche, au thème et au QR
  const compte = (onSwitchToStaff || !demo) ? (
    <section className={`nv-glass nv-pad ${s.card}`}>
      <div className={s.cardHead}>
        <h2>Mon compte</h2>
        <span className={s.muted}>BNV-{docId?.slice(-6)}</span>
      </div>
      {onSwitchToStaff && (
        <button type="button" className={`nv-btn-sec nv-press ${s.accountBtn}`} onClick={onSwitchToStaff}>
          <Store size={20}/> Basculer vers l'espace équipe
        </button>
      )}
      {!demo && (
        <button type="button" className={`nv-btn-sec nv-press ${s.accountBtn}`} onClick={logout}>
          <LogOut size={20}/> Se déconnecter
        </button>
      )}
    </section>
  ) : null

  return (
    <div className={`nv ${surDegrade ? 'nv-grad' : 'nv-list'} ${s.page}`}>
      {/* Barre du haut (nouveau style, 23/11/2026) : pastille aux initiales, salutation, cloche,
          bascule clair/sombre et bouton rond « Mon QR », présents sur tous les onglets */}
      <header className={`${s.top} ${surDegrade ? s.topGrad : ''}`}>
        <div className={s.topInner}>
          {benev ? (<>
            <span className={s.av} aria-hidden="true">{initialsOf(benev)}</span>
            {/* 23/11/2026 (option 1 validée) : sur téléphone, le texte laisse la place à la discussion et
                au talkie ; il reste lu par les lecteurs d'écran */}
            <div className={`${s.headWho} ${s.headWhoMasque}`}>
              <b>Bonjour {benev.prenom || benev.nom}</b>
              <span>Bénévole{eventMeta?.nom ? ` · ${eventMeta.nom}` : ''}</span>
            </div>
          </>) : (<>
            <div className={s.logo}><img src="/logo.png" alt="" onError={e => { e.currentTarget.style.display = 'none' }} /></div>
            <div className={s.headWho}>
              <b>YllaCash</b>
              {eventMeta?.nom && <span>{eventMeta.nom}</span>}
            </div>
          </>)}
          <div className={s.headActions}>
            <NotifBell notifications={notifications} nonLuCount={nonLuCount} onMarkAllRead={marquerToutLu}
              onOpenCommande={(n) => {
                const r = resas.find(x => (n.resaId && x.id === n.resaId) || (n.resaCode && String(x.code) === String(n.resaCode).replace(/^#/, '')))
                if (r) setCmdPrete(r); else setTab('mes-resas')
              }}/>
            {/* Discussion et talkie de l'équipe (23/11/2026, option A) : TeamChat y place ses deux boutons */}
            <span id="tc-entete-benev" style={{ display: 'contents' }} />
            <ThemeToggle style={{
              width: 44, height: 44, minHeight: 0, borderRadius: '50%',
              background: surDegrade ? 'var(--nv-glass)' : 'var(--nv-card2)',
              border: surDegrade ? '1px solid var(--nv-line)' : '1px solid transparent',
            }}/>
            {benev && (
              <button type="button" className="nv-round nv-press" onClick={openQr} aria-label="Mon QR" title="Mon QR">
                <QrCode size={20}/>
              </button>
            )}
          </div>
        </div>
        {/* Bandeau du talkie (« Vous parlez », « X parle ») sous la barre du haut */}
        <div id="tc-bandeau-benev" />
      </header>

      <main className={`nv-under-tabbar ${s.wrap}`}>
        {/* Session fermée (20/11/2026) : on le dit sur tous les onglets ; « Réessayer » recharge la
            page, ce qui rouvre l'espace à partir du lien personnel */}
        {fermee && (
          <SessionBanner className={s.sessionBan} title="Votre espace doit être rouvert" actionLabel="Réessayer"
            variant="secondary" onAction={rouvrirEspace}>
            Il a été fermé sur ce téléphone, par exemple parce qu'un autre lien YllaCash y a été ouvert. Réessayez, ou rouvrez votre lien personnel de bénévole.
          </SessionBanner>
        )}
        {/* Animation entre les onglets (23/11/2026) : .nv-in rejouée à chaque changement d'onglet */}
        <div key={tab} className={`nv-in ${s.pane}`}>
        {tab === 'accueil' && (
          benev ? (
            <div className={`nv-st ${s.stack}`}>
              {/* Écran 13 (24/11/2026) : mon solde, comme un spectateur ; les avantages s'y ajoutent */}
              <CarteSolde pm={porteMonnaie} onRecharger={() => setRechargeOuverte(true)} onCommander={() => setTab('commander')}/>
              {/* Quoi de neuf (24/11/2026) : une fois par mise en ligne et par téléphone */}
              <QuoiDeNeuf espace="benevole" />
              {!em && (
              /* Mon créneau : carte de verre principale (nouveau style, 23/11/2026) */
                slot && ribbon ? (
                  <section className={`nv-glass nv-pad ${s.slotCard}`}>
                    {/* Toucher le haut de la carte ouvre le détail du créneau ; frise et boutons restent dessous (23/11/2026) */}
                    <button type="button" className={`nv-press ${s.cardOpen}`} onClick={() => setCarteOuverte('creneau')}
                      aria-haspopup="dialog" aria-label={`${slotKicker} : ${postName(slot.postId)}, ${fmtHour(slot.range.start)} – ${fmtHour(slot.range.end)}. Voir le détail`}>
                      <span className={s.slotKicker}>{slotKicker}</span>
                      <span className={`nv-big ${s.slotTitle}`}>{postName(slot.postId)} · {fmtHour(slot.range.start)} – {fmtHour(slot.range.end)}</span>
                      <span className={s.slotDate}>{slotDate}{slot.shift.label ? ` · ${slot.shift.label}` : ''}</span>
                    </button>
                    {/* Frise horaire gardée dans la carte : en mode « tient dans la largeur », elle ne déborde pas */}
                    <div className={s.ribbon}>
                      <TimeRibbon start={ribbon.start} end={ribbon.end} items={ribbon.items} now={now}/>
                    </div>
                    {presence ? (<>
                      <div className={`nv-btn ${s.pointed}`} role="status">
                        <CheckCircle2 size={20}/> Arrivée pointée à {fmtHour(new Date(presence.at))}
                      </div>
                      {presence.retardMin > 0 && <p className={s.slotNote}>{presence.retardMin} min après le début du créneau</p>}
                    </>) : (<>
                      <button type="button" className={`nv-btn nv-press ${s.pointBtn}`} onClick={openScan} disabled={!checkInOpen}>
                        <ScanLine size={20}/> Pointer mon arrivée
                      </button>
                      <p className={s.slotNote}>{checkInOpen ? 'Scannez le QR affiché au poste' : `Ouvre ${CHECKIN_EARLY_MIN} min avant le début du créneau`}</p>
                    </>)}
                    <button type="button" className={`nv-press ${s.textLink}`} onClick={() => setTab('planning')}>
                      Voir tout mon planning <ChevronRight size={16}/>
                    </button>
                  </section>
                ) : (
                  <section className={`nv-glass nv-pad ${s.card}`}>
                    <button type="button" className={`nv-press ${s.cardOpen}`} onClick={() => setCarteOuverte('sansCreneau')} aria-haspopup="dialog">
                      <span className={s.cardHead}><span className={s.cardTitle}>Mon créneau</span><ChevronRight size={18} className={s.chev} aria-hidden="true"/></span>
                      <span className={s.muted}>{shifts.length ? 'Aucun créneau à venir pour vous.' : "L'organisation n'a pas encore publié les créneaux."}</span>
                    </button>
                  <div className={s.noSlot}>
                    {shifts.length > 0 && <Button variant="secondary" size="sm" icon={CalendarDays} onClick={() => setTab('planning')}>Choisir un créneau</Button>}
                    {/* Anciennes disponibilités déclarées à l'inscription */}
                    {benev.creneaux && ['Vendredi','Samedi','Dimanche'].map(j => {
                      const actifs = Object.entries(benev.creneaux?.[j] || {}).filter(([,v])=>v).map(([c])=>c)
                      if (!actifs.length) return null
                      return (
                        <div key={j} className={s.legacy}>
                          <b>{j}</b>
                          {actifs.map(a => <Badge key={a} tone="brand">{a}</Badge>)}
                        </div>
                      )
                    })}
                  </div>
                  </section>
                )
              )}

              {/* Commande prête */}
              {readyResas.length > 0 && (
                /* Une commande prête : son détail s'ouvre ; plusieurs : l'onglet Résas, qui les liste (23/11/2026) */
                <button type="button" className={`nv-glass nv-press ${s.notice}`} aria-haspopup={readyResas.length === 1 ? 'dialog' : undefined}
                  onClick={() => readyResas.length === 1 ? setCmdPrete(readyResas[0]) : setTab('mes-resas')}>
                  <span className={`nv-ic ${s.icReady}`}><BellRing size={20}/></span>
                  <span className={s.noticeText}>
                    <b>{readyResas.length > 1 ? `${readyResas.length} commandes prêtes` : 'Votre commande est prête'}</b>
                    <span>Code #{readyResas[0].code} · présentez-vous au stand</span>
                  </span>
                  <ChevronRight size={18} className={s.chev}/>
                </button>
              )}

              {/* Contrôle des billets aujourd'hui (Event Manager ou planning) : renvoie vers le compte
                  équipe « Contrôle entrée » (écran 8, 23/11/2026) */}
              {canControl && (
                <button type="button" className={`nv-glass nv-press ${s.notice}`} onClick={() => setCarteOuverte('entree')} aria-haspopup="dialog">
                  <span className={`nv-ic ${s.icBillets}`}><Ticket size={20}/></span>
                  <span className={s.noticeText}>
                    <b>Vous contrôlez les billets aujourd'hui</b>
                    <span>Avec l'appli équipe, compte « Contrôle entrée »</span>
                  </span>
                  <ChevronRight size={18} className={s.chev}/>
                </button>
              )}

              {/* Ce qu'il me reste : barres de quotas qui se remplissent (nouveau style, 23/11/2026) */}
              <section className={`nv-glass nv-pad ${s.card}`}>
                <div className={s.cardHead}>
                  <h2>Ce qu'il me reste</h2>
                  {em && <span className={s.muted}>{dayLabel(jour)}</span>}
                </div>
                {fermee ? quotasNonCharges : (<>
                {/* Toucher les barres ouvre le détail par type : droits, pris, restants (23/11/2026) */}
                <button type="button" className={`nv-press ${s.cardOpen} ${s.bars}`} onClick={() => setCarteOuverte('quotas')}
                  aria-haspopup="dialog" aria-label={`Ce qu'il me reste : ${Object.entries(TYPE_CFG).map(([t, c]) => `${c.label} ${quotaRestant(t)} sur ${quotas.droits[t] || 0}`).join(', ')}. Voir le détail`}>
                  {Object.entries(TYPE_CFG).map(([type, cfg]) => {
                    const max = quotas.droits[type] || 0
                    const v = quotaRestant(type)
                    return (
                      <span key={type} className={s.barRow}>
                        <span className={s.barName}>{cfg.label}</span>
                        <span className={s.barTrack}><i className="nv-grow-x" style={{ width: max ? `${Math.round(v / max * 100)}%` : 0 }}/></span>
                        <b className={v ? s.barVal : s.barOut}>{max ? (v ? `${v} sur ${max}` : 'Épuisé') : '—'}</b>
                      </span>
                    )
                  })}
                </button>
                {em && !(quotas.droits.repas || quotas.droits.boisson || quotas.droits.eau) && (
                  <p className={s.muted}>Pas de repas ni de boissons prévus aujourd'hui.</p>
                )}
                {em && <p className={s.muted}>Valables jusqu'à 6 h du matin. Ce qui n'est pas utilisé ne passe pas au lendemain.</p>}
                </>)}
                <button type="button" className={`nv-btn-sec nv-press ${s.orderBtn}`} onClick={() => setTab('commander')}>
                  <UtensilsCrossed size={20}/> Commander mon repas
                </button>
                <p className={s.hint}>Présentez votre QR code à la borne pour commander. Le bouton QR, en haut, l'agrandit.</p>
              </section>

              {em && (
                /* Carte « Demain » entière en bouton : ouvre le détail des droits du lendemain (23/11/2026) */
                <button type="button" className={`nv-glass nv-pad nv-press ${s.card} ${s.cardBtn}`} onClick={() => setCarteOuverte('demain')} aria-haspopup="dialog">
                  <span className={s.cardHead}>
                    <span className={s.cardTitle}>Demain</span>
                    <span className={s.muted}>{dayLabel(nextDay(jour))}</span>
                  </span>
                  <span className={s.muted}>
                    {demain && (demain.repas || demain.boisson || demain.eau)
                      ? `${demain.repas || 0} repas, ${demain.boisson || 0} boisson${(demain.boisson || 0) > 1 ? 's' : ''}, ${demain.eau || 0} eau${(benev.controleBillets || []).includes(nextDay(jour)) ? ' · contrôle des billets' : ''}`
                      : 'Rien de prévu.'}
                  </span>
                </button>
              )}

              <DernieresCommandes resas={resas} setTab={setTab}
                nonChargees={fermee ? 'Votre QR bénévole reste utilisable.' : ''}/>

              {compte}
            </div>
          ) : fermee ? (
            /* Session fermée avant que la fiche soit chargée (20/11/2026) : plus de « Chargement… » sans fin */
            <div className={`nv-st ${s.stack}`}>
              <section className={`nv-glass nv-pad ${s.card}`}>
                <div className={s.cardHead}><h2>Ce qu'il me reste</h2></div>
                {quotasNonCharges}
              </section>
              <DernieresCommandes resas={resas} setTab={setTab}
                nonChargees="Elles réapparaîtront dès que votre espace sera rouvert."/>
              {compte}
            </div>
          ) : (
            <div className={s.stack}>
              <div className={s.loading}>Chargement…</div>
              {compte}
            </div>
          )
        )}

        {tab === 'planning' && benev && (
          <BenevolePlanning benev={{ ...benev, id: myId }} eventId={eventId} benevoles={benevoles}
            posts={posts} shifts={shifts} onAssign={demo ? demoAssign : undefined}/>
        )}

          {tab === 'commander' && (
            <div className={s.consoSw} role="tablist" aria-label="Conso">
              <button type="button" role="tab" aria-selected={consoVue === 'commander'} className={`nv-press ${consoVue === 'commander' ? s.consoSwOn : ''}`}
                onClick={() => setConsoVue('commander')}>Commander</button>
              <button type="button" role="tab" aria-selected={consoVue === 'resas'} className={`nv-press ${consoVue === 'resas' ? s.consoSwOn : ''}`}
                onClick={() => setConsoVue('resas')}>
                Mes commandes
                {(readyResas.length || pendingResas) > 0 && <span className={s.consoSwBadge}>{readyResas.length || pendingResas}</span>}
              </button>
            </div>
          )}
          {tab === 'commander' && consoVue === 'commander' && (
            <BenevoleCommander
              menu={menu} categories={categories} carte={carte} cartItems={cartItems} quotaDroit={quotaDroit}
              qtys={qtys} setQtys={setQtys} resaDone={resaDone} setResaDone={setResaDone}
              resaLoading={resaLoading} resaErr={resaErr} doCommande={doCommande}
              quotaRestant={quotaRestant} TYPE_CFG={TYPE_CFG} BRAND={BRAND}
              setTab={setTab} benev={benev}
              solde={porteMonnaie.compte ? porteMonnaie.compte.solde || 0 : null} onRecharger={() => setRechargeOuverte(true)}
            />
          )}

        {mesCommandes && <MesCodes codes={codes} onCancel={setCancelCode}/>}
        {/* Session fermée (20/11/2026) : une liste vide n'est pas présentée comme « aucune réservation » */}
        {mesCommandes && fermee && resas.length === 0 && (
          <section className={`nv-card nv-pad ${s.card}`}>
            <div className={s.cardHead}><h2>Mes commandes</h2></div>
            <div className={s.noSlot}>
              <b>Réservations non chargées</b>
              <p>Elles réapparaîtront dès que votre espace sera rouvert.</p>
            </div>
          </section>
        )}
        {mesCommandes && !(fermee && resas.length === 0) && (
          <BenevoleResas
            resas={resas} BRAND={BRAND} AMBER={AMBER} AMBER_L={AMBER_L}
            cancelResa={(id, code) => setCancelAsk({ id, code })}
          />
        )}

        {/* Reste monté pendant l'ouverture (une vente en cours survit à un changement d'onglet) */}
        {roleEquipe && <OngletRole role={roleEquipe} onglet={ongletRole} visible={tab === 'role'}
          eventId={eventId} nom={benevNom} ficheId={myId}/>}

        {tab === 'profil' && roleEquipe && ongletRole.ouvert && (
          <button type="button" className="nv-btn-sec nv-press" style={{ width: '100%', marginBottom: 12 }}
            onClick={() => ongletRole.verrouiller().then(() => toast.info('Onglet verrouillé')).catch(() => {})}>
            <Lock size={18} aria-hidden="true"/> Verrouiller l'onglet « {ROLE_ONGLET[roleEquipe].label} »
          </button>
        )}
        {tab === 'profil' && benev && (
          <BenevoleProfil
            benev={benev} BRAND={BRAND}
            pwdForm={pwdForm} setPwdForm={setPwdForm}
            pwdMsg={pwdMsg} pwdLoading={pwdLoading} changePwd={changePwd}
          />
        )}
        </div>

        <footer className={s.footer}>
          <b>{APP_FULL_LABEL}</b>
          <span>Développée par <strong>Maison Ylla</strong></span>
          <span className={s.build}>Build {APP_VERSION_LABEL}</span>
          <CheckUpdateButton variant="compact"/>
        </footer>
      </main>

      {/* Barre d'onglets flottante (nouveau style, 23/11/2026) : la pastille glisse vers l'onglet choisi */}
      <nav className={`nv-tabbar ${s.tabbar}`} aria-label="Navigation">
        {navIndex >= 0 && (
          <span className="nv-tab-ind" aria-hidden="true"
            style={{ width: `calc((100% - 12px) / ${NAV.length})`, transform: `translateX(${navIndex * 100}%)` }}/>
        )}
        {NAV.map(item => {
          const Icon = item.icon
          const on = tab === item.id
          return (
            <button key={item.id} type="button" className="nv-press"
              onClick={() => changerOnglet(item.id)} aria-current={on ? 'page' : undefined}>
              <Icon size={22} aria-hidden="true"/>
              {item.badge > 0 && <span className="nv-tab-badge" aria-label={`${item.badge} en cours`}>{item.badge}</span>}
              {item.verrou && <span className={s.tabVerrou} aria-label="verrouillé"><Lock size={10} strokeWidth={3} aria-hidden="true"/></span>}
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* ── Détails des cartes de l'accueil (23/11/2026, maquette validée) : lecture seule, rien que des
          données déjà visibles par le bénévole (créneau, planning, droits, commandes) ── */}
      <DetailSheet open={carteOuverte === 'creneau' && !!slot} onClose={() => setCarteOuverte(null)}
        {...(slot ? (() => {
          // Autres bénévoles du même poste sur ce créneau : noms déjà montrés dans le planning
          const ids = slot.postId === '__free__' ? (slot.shift.libres || []) : (slot.shift.postes?.[slot.postId]?.assignments || [])
          const annuaire = Object.fromEntries(benevoles.map(b => [b.id, b]))
          const autres = ids.filter(id => id !== myId).map(id => annuaire[id]).filter(Boolean)
          return {
            title: slot.range.start.getTime() <= now ? 'Mon créneau' : 'Mon prochain créneau',
            icon: CalendarDays, color: postsById[slot.postId]?.couleur || 'var(--brand)',
            status: presence ? { label: 'Arrivée pointée', tone: 'success' } : checkInOpen ? { label: 'Pointage ouvert', tone: 'brand' } : { label: rel?.text || 'À venir', tone: 'neutral' },
            value: `${fmtHour(slot.range.start)} – ${fmtHour(slot.range.end)}`,
            sub: slotDate,
            sections: [
              { label: 'Poste', rows: [
                ['Poste', `${postsById[slot.postId]?.emoji ? postsById[slot.postId].emoji + ' ' : ''}${postName(slot.postId)}`],
                ['Créneau', slot.shift.label],
                ['Quand', rel?.text],
              ] },
              autres.length > 0 && { label: `Avec vous (${autres.length})`, content: (
                <ul className={s.detList}>{autres.map(b => <li key={b.id}><b>{[b.prenom, b.nom].filter(Boolean).join(' ')}</b>{b.poste && <span>{b.poste}</span>}</li>)}</ul>
              ) },
              { label: 'Pointage', rows: [
                ['Arrivée', presence ? `pointée à ${fmtHour(new Date(presence.at))}` : 'pas encore pointée'],
                ['Retard', presence?.retardMin > 0 ? `${presence.retardMin} min` : ''],
                ['Ouverture', presence ? '' : checkInOpen ? 'ouvert : scannez le QR du poste' : `${CHECKIN_EARLY_MIN} min avant le début`],
              ] },
            ],
            actions: (<>
              {!presence && (
                <button type="button" className="nv-btn nv-press" disabled={!checkInOpen} onClick={() => { setCarteOuverte(null); openScan() }}>
                  <ScanLine size={20}/> Pointer mon arrivée
                </button>
              )}
              <button type="button" className="nv-btn-sec nv-press" onClick={() => { setCarteOuverte(null); setTab('planning') }}>Voir tout mon planning</button>
            </>),
          }
        })() : {})} />

      <DetailSheet open={carteOuverte === 'sansCreneau'} onClose={() => setCarteOuverte(null)}
        title="Mon créneau" icon={CalendarDays} color="var(--brand)"
        status={{ label: shifts.length ? 'Aucun créneau à venir' : 'Créneaux pas encore publiés', tone: 'neutral' }}
        sub={shifts.length ? 'Choisissez un créneau dans le planning.' : "L'organisation n'a pas encore publié les créneaux."}
        sections={[(() => {
          const rows = ['Vendredi', 'Samedi', 'Dimanche']
            .map(j => [j, Object.entries(benev?.creneaux?.[j] || {}).filter(([, v]) => v).map(([c]) => c).join(', ')])
            .filter(r => r[1])
          return rows.length > 0 && { label: "Disponibilités déclarées à l'inscription", rows }
        })()]}
        actions={shifts.length > 0 && !em && (
          <button type="button" className="nv-btn nv-press" onClick={() => { setCarteOuverte(null); setTab('planning') }}>Choisir un créneau</button>
        )} />

      <DetailSheet open={carteOuverte === 'quotas' && !!benev} onClose={() => setCarteOuverte(null)}
        title="Ce qu'il me reste" icon={UtensilsCrossed} color="var(--brand)"
        sub={em ? dayLabel(jour) : ''}
        sections={[
          ...Object.entries(TYPE_CFG).map(([type, cfg]) => {
            const max = quotas.droits[type] || 0
            return { label: cfg.label, rows: max
              ? [['Droits', String(max)], ['Pris', String(quotas.conso[type] || 0)], ['Restants', quotaRestant(type) ? String(quotaRestant(type)) : 'Épuisé']]
              : [['Droits', 'non prévu']] }
          }),
          (() => {
            // Commandes du jour (hors annulées), déjà listées dans « Mes dernières commandes »
            const msDe = (r) => r.createdAt?.seconds != null ? r.createdAt.seconds * 1000 : r.createdAt ? r.createdAt : null
            const duJour = resas.filter(r => r.status !== 'cancelled' && msDe(r) != null && festDay(msDe(r)) === jour)
            return duJour.length > 0 && { label: "Commandes d'aujourd'hui", content: (
              <ul className={s.detList}>{duJour.map(r => (
                <li key={r.id}><b>{(r.items || []).map(i => `${i.qty > 1 ? `${i.qty} ` : ''}${i.nom}`).join(', ') || 'Commande'}</b><span>{fmtResaDate(r)}</span></li>
              ))}</ul>
            ) }
          })(),
          em && { label: 'Remise à zéro', content: <p className={s.muted}>Valables jusqu'à 6 h du matin. Ce qui n'est pas utilisé ne passe pas au lendemain.</p> },
        ]}
        actions={<button type="button" className="nv-btn nv-press" onClick={() => { setCarteOuverte(null); setTab('commander') }}><UtensilsCrossed size={20}/> Commander mon repas</button>} />

      <DetailSheet open={carteOuverte === 'demain' && em} onClose={() => setCarteOuverte(null)}
        title="Demain" icon={CalendarDays} color="var(--brand)"
        sub={em ? dayLabel(nextDay(jour)) : ''}
        status={demain && (demain.repas || demain.boisson || demain.eau) ? null : { label: 'Rien de prévu', tone: 'neutral' }}
        sections={em ? [
          { label: 'Mes droits', rows: [['Repas', String(demain?.repas || 0)], ['Boissons', String(demain?.boisson || 0)], ['Eau', String(demain?.eau || 0)]] },
          (benev?.controleBillets || []).includes(nextDay(jour)) && { label: 'Mission', rows: [['Contrôle des billets', 'oui']] },
          { label: 'Remise à zéro', content: <p className={s.muted}>Les droits de demain s'ouvrent à 6 h du matin.</p> },
        ] : []} />

      <DetailSheet open={carteOuverte === 'entree' && canControl} onClose={() => setCarteOuverte(null)}
        title="Contrôle des billets" icon={Ticket} color="var(--brand)"
        status={{ label: "Aujourd'hui", tone: 'brand' }}
        sub={em ? dayLabel(jour) : ''}
        sections={[
          { content: <p className={s.muted}>Vous êtes au contrôle des billets aujourd'hui. Le scanner n'est plus dans l'espace bénévole : ouvrez l'appli équipe avec le compte « Contrôle entrée » que l'organisation vous a remis (identifiant et mot de passe).</p> },
          { content: <p className={s.muted}>Pas de compte ? Demandez-le au responsable de l'entrée.</p> },
        ]}
        actions={<button type="button" className="nv-btn nv-press" onClick={() => setCarteOuverte(null)}>J'ai compris</button>} />

      <RechargerSheet open={rechargeOuverte} onClose={() => setRechargeOuverte(false)} pm={porteMonnaie} eventId={eventId} demo={!!demo}/>

      <CommandeDetail commande={cmdPrete} benevole onClose={() => setCmdPrete(null)}
        statut={cmdPrete ? (RESA_STATUTS[cmdPrete.status] || RESA_STATUTS.pending) : null}/>

      {/* Pointage : scan du QR du poste */}
      <Sheet open={scanOpen} onClose={() => setScanOpen(false)} title="Pointer mon arrivée">
        {pointage.state === 'done' ? (
          <div className={s.scanDone}>
            <SuccessCheck size={64} play={pointage.at}/>
            <b>{pointage.already ? 'Déjà pointé' : 'Arrivée enregistrée'}</b>
            <span>{pointage.post?.emoji} {pointage.post?.nom} · {fmtHour(new Date(pointage.at))}</span>
            <Button block onClick={() => setScanOpen(false)}>Terminer</Button>
          </div>
        ) : (
          <div className={s.scanBody}>
            <p className={s.muted}>Scannez le QR affiché au poste. Sans caméra, saisissez le code à 4 caractères écrit sous le QR.</p>
            {scanOpen && (
              <QrScanner
                onScan={handlePointageScan}
                parse={(t) => t.trim()}
                placeholder="Code du poste, écrit sous le QR"
                codeLength={4}
                codeStatus={pointage.state === 'error' ? 'error' : null}
                hint="Pointez la caméra vers le QR du poste"
                simulate={posts.length ? [postQrText(demo ? 'demo' : eventId, (posts.find(p => p.id === slot?.postId) || posts[0]).id)] : []}
              />
            )}
            {pointage.state === 'busy' && <p className={s.muted}>Enregistrement…</p>}
            {pointage.state === 'error' && (
              <div className={s.scanErr} role="alert"><AlertCircle size={16}/><span>{pointage.msg}</span></div>
            )}
          </div>
        )}
      </Sheet>

      {/* Annulation d'un code pas encore utilisé à la borne (rien n'a été décompté) */}
      <Dialog open={!!cancelCode} onClose={() => setCancelCode(null)} title="Annuler ce code ?"
        footer={<>
          <Button variant="secondary" onClick={() => setCancelCode(null)}>Garder</Button>
          <Button variant="danger" onClick={async () => {
            const c = cancelCode; setCancelCode(null)
            if (demo) { setCodes(cs => cs.map(x => x.code === c ? { ...x, statut: 'annule' } : x)); return }
            try { await annulerCodeEnLigne(c, eventId); toast.success('Code annulé') }
            catch (e) { toast.error(friendlyError(e, "L'annulation n'est pas passée.")) }
          }}>Annuler le code</Button>
        </>}>
        <p className={s.muted}>Rien n'a été décompté : le code ne pourra plus servir à la borne.</p>
      </Dialog>

      {/* Confirmation d'annulation */}
      <Dialog open={!!cancelAsk} onClose={() => setCancelAsk(null)} title="Annuler cette réservation ?"
        footer={<>
          <Button variant="secondary" onClick={() => setCancelAsk(null)}>Garder</Button>
          <Button variant="danger" onClick={() => { const c = cancelAsk; setCancelAsk(null); annulerResa(c.id, c.code) }}>Annuler la réservation</Button>
        </>}>
        <p className={s.muted}>La réservation #{cancelAsk?.code} sera annulée et votre quota vous sera rendu.</p>
      </Dialog>

      {/* QR plein écran : fond blanc pour la lecture */}
      {qrOpen && (
        <button type="button" className={s.qrFull} onClick={closeQr} aria-label="Fermer le QR code">
          <b>{benevNom}</b>
          <span>Bénévole · BNV-{docId?.slice(-6)}</span>
          {qrDataUrl ? (<>
            <img src={qrDataUrl} alt="Mon QR code bénévole"/>
            {/* QR tournant : barre de progression et compte à rebours */}
            <i aria-hidden="true" style={{ display: 'block', width: 'min(82vw, 380px)', height: 6, borderRadius: 3, background: 'rgba(0,48,72,.12)', overflow: 'hidden' }}>
              <i style={{ display: 'block', height: '100%', width: `${Math.round(qrEspace.reste / 30 * 100)}%`, background: '#009090', transition: 'width 1s linear' }}/>
            </i>
            <span>Nouveau QR dans {qrEspace.reste} s</span>
            <span>Il change toutes les 30 secondes : une photo ne fonctionne pas.</span>
          </>) : (
            <span style={{ maxWidth: 320, margin: '24px 0' }}>{qrEspace.erreur || 'Préparation de votre QR…'}</span>
          )}
          <span>Appuyez pour fermer</span>
        </button>
      )}

      {/* Chat équipe (v7) */}
      {eventId && benev && !demo && (
        <TeamChat
          eventId={eventId}
          currentUser={{ uid: docId, id: docId, nom: benevNom || benev.nom || 'Bénévole', role: 'benevole' }}
          brandColor={themeColor}
          isAdmin={false}
          entete="tc-entete-benev"
          bandeau="tc-bandeau-benev"
        />
      )}
    </div>
  )
}

// ── Accueil : les 3 dernières commandes ─────────────────────────────
const RESA_STATUTS = {
  collected:  { label: 'Retirée',        tone: 'success' },
  ready:      { label: 'Prête',          tone: 'warning' },
  cancelled:  { label: 'Annulée',        tone: 'danger' },
  processing: { label: 'En préparation', tone: 'brand' },
  pending:    { label: 'En attente',     tone: 'neutral' },
}

const fmtResaDate = (r) => {
  const ts = r.createdAt?.toDate ? r.createdAt.toDate() : (r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : null)
  if (!ts) return r.date || ''
  const heure = ts.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const now = new Date()
  const hier = new Date(now); hier.setDate(now.getDate() - 1)
  if (ts.toDateString() === now.toDateString()) return "Aujourd'hui " + heure
  if (ts.toDateString() === hier.toDateString()) return 'Hier ' + heure
  return ts.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' ' + heure
}

// nonChargees (20/11/2026) : session fermée, phrase affichée à la place de « Aucune commande »
function DernieresCommandes({ resas, setTab, nonChargees = '' }) {
  const dernieres = resas.slice(0, 3)
  const [ouverte, setOuverte] = useState(null)
  return (
    <section className={`nv-glass nv-pad ${s.card}`}>
      <div className={s.cardHead}>
        <h2>Mes dernières commandes</h2>
        {resas.length > 3 && (
          <button type="button" className={`nv-press ${s.textLink}`} onClick={() => setTab('mes-resas')}>
            Voir tout <ChevronRight size={16}/>
          </button>
        )}
      </div>
      {dernieres.length === 0 && nonChargees ? (
        <div className={s.noSlot}>
          <b>Commandes non chargées</b>
          <p>{nonChargees}</p>
        </div>
      ) : dernieres.length === 0 ? (
        <div className={s.noSlot}>
          <p>Aucune commande pour le moment.</p>
          <Button variant="secondary" size="sm" icon={ShoppingCart} onClick={() => setTab('commander')}>Faire ma première commande</Button>
        </div>
      ) : (
        <ul className={s.resaList}>
          {dernieres.map(r => {
            const statut = RESA_STATUTS[r.status] || RESA_STATUTS.pending
            const items = r.items || []
            const titre = items.length === 0 ? 'Commande'
              : items.length === 1 ? items[0].nom
              : `${items[0].nom} +${items.length - 1}`
            // Toute la ligne se touche et ouvre le détail (23/11/2026)
            return (
              <li key={r.id}>
                <button type="button" className={`nv-row nv-press ${s.resaBtn}`} onClick={() => setOuverte(r)}
                  aria-label={`Détail de la commande ${titre}, ${statut.label}`}>
                  <span className="nv-ic neutre" aria-hidden="true"><ShoppingCart size={20}/></span>
                  <span className="nv-rt">
                    <b>{titre}</b>
                    <span>{fmtResaDate(r)}</span>
                  </span>
                  <Badge tone={statut.tone}>{statut.label}</Badge>
                  <ChevronRight size={18} className={s.chev} aria-hidden="true"/>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <CommandeDetail commande={ouverte} benevole onClose={() => setOuverte(null)}
        statut={ouverte ? (RESA_STATUTS[ouverte.status] || RESA_STATUTS.pending) : null}/>
    </section>
  )
}
