/**
 * pages/public/BenevoleApp.jsx
 * Espace bénévole — URL : /benevole?id=DOC_ID&ev=EVENT_ID
 *
 * Quota par catégorie (repas/boisson/eau) au lieu d'un solde en euros, affiché en bocaux.
 * Le bénévole réserve des articles du menu (déduits du quota), voit son créneau
 * sur un ruban horaire et pointe son arrivée en scannant le QR du poste.
 *
 * demo : données d'exemple (route /ui/benevole en développement), aucune écriture Firestore.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { db } from '../../firebase/config'
import {
  collection, query, where, getDoc,
  doc, onSnapshot, addDoc, updateDoc,
  serverTimestamp, increment,
} from 'firebase/firestore'
import { nowStr, makeResaCode } from '../../utils/helpers'
import { getSettings, watchVolunteerPosts, watchVolunteerShifts, assignBenevoleToPost, pointerArrivee } from '../../firebase/service'
import { hashPassword } from '../../utils/kpis'
import {
  currentOrNext, myShifts, relativeLabel, canCheckIn, fmtHour,
  parsePostScan, postQrText, CHECKIN_EARLY_MIN,
} from '../../utils/shiftTime'
import BenevoleCommander from './BenevoleCommander'
import BenevoleResas     from './BenevoleResas'
import BenevoleProfil    from './BenevoleProfil'
import QRCode from 'qrcode'
import {
  UtensilsCrossed, Coffee, Droplets, ShoppingCart, Home, Bookmark, User, LogOut, CalendarDays,
  ScanLine, QrCode, CheckCircle2, AlertCircle, Store, ChevronRight, MapPin, BellRing,
} from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'
import NotifBell from '../../components/NotifBell'
import TeamChat from '../../components/TeamChat'
import ThemeToggle from '../../components/ThemeToggle'
import BenevolePlanning from '../../components/BenevolePlanning'
import QrScanner from '../../components/QrScanner'
import useAuthStore from '../../store/useAuthStore'
import { useTheme } from '../../hooks/useTheme'
import { Badge, Button, Dialog, Sheet, Jar, TimeRibbon, SuccessCheck, toast } from '../../ui'
import s from './benevole/BenevoleApp.module.css'

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
  const [resas,       setResas]       = useState(demo?.resas || [])
  const [eventMeta,   setEventMeta]   = useState(demo?.eventMeta || null)
  const [benevoles,   setBenevoles]   = useState(demo?.benevoles || [])  // pour afficher les noms dans le planning
  const [posts,       setPosts]       = useState(demo?.posts || [])
  const [shifts,      setShifts]      = useState(demo?.shifts || [])
  const { logout } = useAuthStore()
  const [tab,         setTab]         = useState('accueil')
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
  const [scanOpen,    setScanOpen]    = useState(false)
  const [pointage,    setPointage]    = useState({ state: 'idle' }) // idle | busy | done | error
  const [now,         setNow]         = useState(Date.now())

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
    })
    return unsub
  }, [docId, eventId])

  // Charger le menu en temps réel (articles éligibles bénévoles)
  useEffect(() => {
    if (!eventId || demo) return
    const unsub = onSnapshot(menuCol(), snap => {
      setMenu(snap.docs.map(d => ({ ...d.data(), id: d.id })).filter(m => m.typeConsommation))
    })
    return () => unsub()
  }, [eventId])

  // Liste de tous les bénévoles (pour afficher les noms dans le planning d'auto-inscription)
  useEffect(() => {
    if (!eventId || demo) return
    const unsub = onSnapshot(benevCol(), snap => {
      setBenevoles(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, () => setBenevoles([]))
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
      snap => setResas(snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)))
    )
    return () => unsub()
  }, [docId, eventId])

  // QR code
  useEffect(() => {
    if (!docId) return
    const url = `${window.location.origin}/benevole?id=${docId}${eventId && !demo ? '&ev=' + eventId : ''}`
    QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: '#003048', light: '#fff' } })
      .then(setQrDataUrl).catch(() => {})
  }, [docId])

  const openQr = useCallback(() => setQrOpen(true), [])
  const closeQr = useCallback(() => setQrOpen(false), [])

  const benevNom = `${benev?.prenom||''} ${benev?.nom||''}`.trim()
  const myId = benev?.id || docId

  const changePwd = async () => {
    setPwdMsg(null)
    if (!pwdForm.current) { setPwdMsg({ ok:false, text:'Veuillez saisir votre mot de passe actuel.' }); return }
    if (pwdForm.new1.length < 6) { setPwdMsg({ ok:false, text:'Le nouveau mot de passe doit faire au moins 6 caractères.' }); return }
    if (pwdForm.new1 !== pwdForm.new2) { setPwdMsg({ ok:false, text:'Les mots de passe ne correspondent pas.' }); return }

    // Vérifier le mot de passe actuel
    const currentPwd = benev?.password || (benev?.username + '123')
    if (pwdForm.current !== currentPwd) {
      setPwdMsg({ ok:false, text:'Mot de passe actuel incorrect.' }); return
    }

    setPwdLoading(true)
    try {
      if (demo) {
        setBenev(b => ({ ...b, password: pwdForm.new1 }))
      } else {
        const bRef = eventId
          ? doc(db, 'events', eventId, 'benevoles', docId)
          : doc(db, 'benevoles', docId)
        const newHash = await hashPassword(pwdForm.new1)
        await updateDoc(bRef, { password: pwdForm.new1, passwordHash: newHash })
        const auditColPwd = eventId ? collection(db, 'events', eventId, 'audit') : collection(db, 'audit')
        const nowPwd = new Date()
        await addDoc(auditColPwd, {
          action: 'CHANGEMENT_PWD_BENEV', benevoleId: docId,
          benevoleNom,
          userType: 'benevole',
          label: `Changement mot de passe bénévole`,
          date: nowPwd.toLocaleString('fr-FR'), timestamp: nowPwd.toISOString(),
          createdAt: serverTimestamp(),
        })
      }
      setPwdMsg({ ok:true, text:'Mot de passe modifié avec succès !' })
      setPwdForm({ current:'', new1:'', new2:'' })
    } catch (e) {
      setPwdMsg({ ok:false, text:'Erreur : ' + e.message })
    } finally { setPwdLoading(false) }
  }

  // Panier
  const cartItems = Object.entries(qtys)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ ...menu.find(m => m.id === id), qty }))
    .filter(i => i.nom)

  // Vérifier quota disponible par type
  const quotaRestant = (type) => {
    const droits = benev?.droits || {}
    const conso  = benev?.consommation || {}
    return Math.max(0, (droits[type] || 0) - (conso[type] || 0))
  }

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
            updates[`consommation.${type}`] = increment(-qty)
          })
          await updateDoc(bRef, updates)
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
        benevoleNom,
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
    } catch (e) { toast.error('Annulation impossible : ' + e.message) }
  }

  const doCommande = async () => {
    if (!benev || !cartItems.length) return
    setResaLoading(true); setResaErr('')
    try {
      const code = 'BNV-' + makeResaCode()

      // Vérifier quota avant
      const grouped = {}
      cartItems.forEach(i => {
        const t = i.typeConsommation
        grouped[t] = (grouped[t] || 0) + i.qty
      })

      for (const [type, qty] of Object.entries(grouped)) {
        const restant = quotaRestant(type)
        if (qty > restant) {
          throw new Error(`Quota insuffisant pour ${TYPE_CFG[type]?.label || type} (restant: ${restant})`)
        }
      }

      // Créer la réservation bénévole
      const itemsWithPrice = cartItems.map(i => ({
        id: i.id, nom: i.nom,
        prix: i.prix || 0,
        typeConsommation: i.typeConsommation,
        qty: i.qty
      }))
      const total = itemsWithPrice.reduce((acc, i) => acc + (i.prix * i.qty), 0)

      if (demo) {
        setResas(rs => [{ id: 'd' + Date.now(), code, items: itemsWithPrice, total, status: 'pending', date: nowStr() }, ...rs])
        setBenev(b => {
          const conso = { ...(b.consommation || {}) }
          Object.entries(grouped).forEach(([t, q]) => { conso[t] = (conso[t] || 0) + q })
          return { ...b, consommation: conso }
        })
        setResaDone({ code, items: cartItems })
        setQtys({})
        return
      }

      await addDoc(resaCol(), {
        benevoleId:  docId,
        benevoleNom: benev.nom + ' ' + benev.prenom,
        items:  itemsWithPrice,
        total,
        status: 'pending',
        code,
        date:       nowStr(),
        isBenev:    true,
        createdAt:  serverTimestamp(),
      })

      // Décrémenter le stock du menu pour chaque article
      for (const it of itemsWithPrice) {
        if (!it.id) continue
        try {
          const menuRef = eventId
            ? doc(db, 'events', eventId, 'menu', it.id)
            : doc(db, 'menu', it.id)
          await updateDoc(menuRef, { stock: increment(-(it.qty || 1)) })
        } catch (e) {
          console.warn('Stock decrement error for ' + it.id + ':', e)
        }
      }

      // Décrémenter le quota
      const bRef = eventId
        ? doc(db, 'events', eventId, 'benevoles', docId)
        : doc(db, 'benevoles', docId)
      const updates = {}
      Object.entries(grouped).forEach(([type, qty]) => {
        updates[`consommation.${type}`] = increment(qty)
      })
      await updateDoc(bRef, updates)

      setResaDone({ code, items: cartItems })
      setQtys({})

      // Transaction bénévole reservation
      const txCol = eventId
        ? collection(db, 'events', eventId, 'transactions')
        : collection(db, 'transactions')
      const itemsLabel = cartItems.map(i => i.nom + (i.qty>1?` x${i.qty}`:'')).join(', ')
      const nowTx = new Date()
      await addDoc(txCol, {
        benevoleId:  docId,
        benevoleNom: benevNom || '—',
        specId:      null,
        specNom:     null,
        type:        'benev-reservation',
        label:       `Résa bénévole #${code} : ${itemsLabel}`,
        items:       itemsWithPrice,
        montant:     total,
        resaCode:    code,
        date:        nowStr(),
        timestamp:   nowTx.toISOString(),
        heure:       nowTx.toLocaleTimeString('fr-FR'),
        createdAt:   serverTimestamp(),
      })

      // Notif staff : nouvelle réservation bénévole
      const notifCol = eventId
        ? collection(db, 'events', eventId, 'notifications')
        : collection(db, 'notifications')
      await addDoc(notifCol, {
        type:      'RESA_CREEE',
        titre:     '🛒 Nouvelle réservation bénévole',
        message:   `${benevNom} a réservé : ${itemsLabel}`,
        specId:    null,
        benevoleId: docId,
        resaCode:  code,
        lu:        false,
        timestamp: new Date().toISOString(),
        createdAt: serverTimestamp(),
      })
      // Log audit
      const auditCol = eventId ? collection(db, 'events', eventId, 'audit') : collection(db, 'audit')
      const nowAudit = new Date()
      await addDoc(auditCol, {
        action: 'BENEV_RESERVATION', benevoleId: docId,
        benevoleNom,
        resaCode: code, montant: total, items: itemsLabel,
        userType: 'benevole',
        label: `Réservation bénévole #${code} : ${itemsLabel}`,
        date: nowAudit.toLocaleString('fr-FR'), timestamp: nowAudit.toISOString(),
        createdAt: serverTimestamp(),
      })
    } catch (e) { setResaErr(e.message || 'Erreur') }
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
      setPointage({ state: 'error', msg: 'Pointage impossible : ' + (e.message || 'erreur réseau') })
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

  const NAV = [
    { id: 'accueil',   label: 'Accueil',  icon: Home },
    { id: 'planning',  label: 'Planning', icon: CalendarDays },
    { id: 'commander', label: 'Conso',    icon: ShoppingCart },
    { id: 'mes-resas', label: 'Résas',    icon: Bookmark, badge: readyResas.length || pendingResas || 0 },
    { id: 'profil',    label: 'Profil',   icon: User },
  ]

  return (
    <div className={s.page}>
      {/* En-tête */}
      <header className={s.head}>
        <div className={s.headInner}>
          <div className={s.logo}><img src="/logo.png" alt="" onError={e => { e.currentTarget.style.display = 'none' }} /></div>
          <span className={s.brandName}>YllaCash</span>
          {eventMeta?.nom && (
            <span className={s.event}>
              {eventMeta.logoSrc ? <img src={eventMeta.logoSrc} alt="" /> : <span>{eventMeta.emoji || '🎵'}</span>}
              {eventMeta.nom}
            </span>
          )}
          <div className={s.headActions}>
            <NotifBell notifications={notifications} nonLuCount={nonLuCount} onMarkAllRead={marquerToutLu}/>
            <ThemeToggle variant="light" style={{ width: 36, height: 36, minHeight: 0 }}/>
            {onSwitchToStaff && (
              <button type="button" className={s.headBtn} onClick={onSwitchToStaff} title="Basculer vers l'espace staff" aria-label="Basculer vers l'espace staff">
                <Store size={16}/>
              </button>
            )}
            {!demo && (
              <button type="button" className={s.headBtn} onClick={logout} title="Se déconnecter" aria-label="Se déconnecter">
                <LogOut size={16}/>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={s.wrap}>
        {tab === 'accueil' && (
          benev ? (
            <>
              {/* Bonjour + QR */}
              <section className={s.hello}>
                <div className={s.helloText}>
                  <span>Bénévole{benev.poste ? ` · ${benev.poste}` : ''}</span>
                  <h1>Bonjour {benev.prenom || benev.nom}</h1>
                </div>
                <button type="button" className={s.avatar} onClick={openQr} aria-label="Afficher mon QR code">
                  {initialsOf(benev)}
                  <span className={s.avatarQr}><QrCode size={12}/></span>
                </button>
              </section>

              {/* Commande prête */}
              {readyResas.length > 0 && (
                <button type="button" className={s.ready} onClick={() => setTab('mes-resas')}>
                  <BellRing size={18}/>
                  <span>
                    <b>{readyResas.length > 1 ? `${readyResas.length} commandes prêtes` : 'Votre commande est prête'}</b>
                    <span>Code #{readyResas[0].code} · présentez votre QR au stand</span>
                  </span>
                  <ChevronRight size={18}/>
                </button>
              )}

              {/* Quotas en bocaux */}
              <section className={s.card}>
                <div className={s.cardHead}>
                  <h2>Mes quotas</h2>
                  <span className={s.muted}>Ce qu'il vous reste</span>
                </div>
                <div className={s.jars}>
                  {Object.entries(TYPE_CFG).map(([type, cfg]) => (
                    <Jar key={type}
                      value={quotaRestant(type)}
                      max={benev.droits?.[type] || 0}
                      label={cfg.label} color={cfg.tone} icon={cfg.icon}/>
                  ))}
                </div>
              </section>

              {/* Mon créneau sur le ruban horaire */}
              <section className={s.card}>
                <div className={s.cardHead}>
                  <h2>Mon créneau</h2>
                  {rel?.text && <Badge tone={presence ? 'success' : rel.tone}>{presence ? 'Arrivée pointée' : rel.text}</Badge>}
                </div>
                {slot && ribbon ? (
                  <>
                    <TimeRibbon start={ribbon.start} end={ribbon.end} items={ribbon.items} now={now}/>
                    <div className={s.slotInfo}>
                      <MapPin size={14}/>
                      <span>
                        <b>{postName(slot.postId)}</b> · {slot.shift.label ? slot.shift.label + ' · ' : ''}
                        {slot.range.start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}, {fmtHour(slot.range.start)}–{fmtHour(slot.range.end)}
                      </span>
                    </div>
                    {presence ? (
                      <div className={s.checked}>
                        <CheckCircle2 size={18}/>
                        <span>Arrivée enregistrée à {fmtHour(new Date(presence.at))}{presence.retardMin > 0 ? ` · ${presence.retardMin} min après le début` : ''}</span>
                      </div>
                    ) : (
                      <button type="button" className={s.scanAction} onClick={openScan} disabled={!checkInOpen}>
                        <span className={s.scanIcon}><ScanLine size={20}/></span>
                        <span>
                          <b>Pointer mon arrivée</b>
                          <span>{checkInOpen ? 'Scanner le QR du poste' : `Ouvre ${CHECKIN_EARLY_MIN} min avant le début du créneau`}</span>
                        </span>
                        <ChevronRight size={18} className={s.chev}/>
                      </button>
                    )}
                  </>
                ) : (
                  <div className={s.noSlot}>
                    <p>{shifts.length ? 'Aucun créneau à venir pour vous.' : "L'organisation n'a pas encore publié les créneaux."}</p>
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
                )}
              </section>

              <Button size="lg" block icon={UtensilsCrossed} onClick={() => setTab('commander')}>Commander mon repas</Button>
              <p className={s.hint}>Présentez votre QR code au stand pour retirer votre commande.</p>
            </>
          ) : (
            <div className={s.loading}>Chargement…</div>
          )
        )}

        {tab === 'planning' && benev && (
          <BenevolePlanning benev={{ ...benev, id: myId }} eventId={eventId} benevoles={benevoles}
            posts={posts} shifts={shifts} onAssign={demo ? demoAssign : undefined}/>
        )}

        {tab === 'commander' && (
          <BenevoleCommander
            menu={menu} cartItems={cartItems}
            qtys={qtys} setQtys={setQtys} resaDone={resaDone} setResaDone={setResaDone}
            resaLoading={resaLoading} resaErr={resaErr} doCommande={doCommande}
            quotaRestant={quotaRestant} TYPE_CFG={TYPE_CFG} BRAND={BRAND}
            setTab={setTab} benev={benev}
          />
        )}

        {tab === 'mes-resas' && (
          <BenevoleResas
            resas={resas} BRAND={BRAND} AMBER={AMBER} AMBER_L={AMBER_L}
            cancelResa={(id, code) => setCancelAsk({ id, code })}
          />
        )}

        {tab === 'profil' && benev && (
          <BenevoleProfil
            benev={benev} BRAND={BRAND}
            pwdForm={pwdForm} setPwdForm={setPwdForm}
            pwdMsg={pwdMsg} pwdLoading={pwdLoading} changePwd={changePwd}
          />
        )}

        <footer className={s.footer}>
          <b>YllaCash v1.0 · 05/2026</b>
          <span>Développée par <strong>Maison Ylla</strong></span>
        </footer>
      </main>

      {/* Barre d'onglets */}
      <nav className={s.nav} aria-label="Navigation">
        {NAV.map(item => {
          const Icon = item.icon
          const on = tab === item.id
          return (
            <button key={item.id} type="button" className={`${s.navItem} ${on ? s.navOn : ''}`}
              onClick={() => setTab(item.id)} aria-current={on ? 'page' : undefined}>
              <span className={s.navIcon}>
                <Icon size={20}/>
                {item.badge > 0 && <span className={s.navBadge}>{item.badge}</span>}
              </span>
              {item.label}
            </button>
          )
        })}
      </nav>

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

      {/* Confirmation d'annulation */}
      <Dialog open={!!cancelAsk} onClose={() => setCancelAsk(null)} title="Annuler cette réservation ?"
        footer={<>
          <Button variant="secondary" onClick={() => setCancelAsk(null)}>Garder</Button>
          <Button variant="danger" onClick={() => { const c = cancelAsk; setCancelAsk(null); annulerResa(c.id, c.code) }}>Annuler la réservation</Button>
        </>}>
        <p className={s.muted}>La réservation #{cancelAsk?.code} sera annulée et votre quota vous sera rendu.</p>
      </Dialog>

      {/* QR plein écran : fond blanc pour la lecture */}
      {qrOpen && qrDataUrl && (
        <button type="button" className={s.qrFull} onClick={closeQr} aria-label="Fermer le QR code">
          <b>{benevNom}</b>
          <span>Bénévole · BNV-{docId?.slice(-6)}</span>
          <img src={qrDataUrl} alt="Mon QR code bénévole"/>
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
        />
      )}
    </div>
  )
}
