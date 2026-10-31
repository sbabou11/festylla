/**
 * pages/public/BenevoleApp.jsx
 * Espace bénévole — identique à l'espace spectateur
 * URL : /benevole?id=DOC_ID&ev=EVENT_ID
 *
 * Quota par catégorie (repas/boisson/eau) au lieu d'un solde en euros
 * Le bénévole peut réserver des articles du menu (déduit du quota)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { db } from '../../firebase/config'
import {
  collection, query, where, getDocs, getDoc,
  doc, onSnapshot, addDoc, updateDoc,
  serverTimestamp, orderBy, increment, runTransaction,
} from 'firebase/firestore'
import { fmt, nowStr } from '../../utils/helpers'
import { getSettings } from '../../firebase/service'
import { hashPassword } from '../../utils/kpis'
import BenevoleCommander from './BenevoleCommander'
import BenevoleResas     from './BenevoleResas'
import BenevoleProfil    from './BenevoleProfil'
import QRCode from 'qrcode'
import { UtensilsCrossed, Coffee, Droplets, ShoppingCart, Clock, Bookmark, User, LogOut, CalendarDays } from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'
import NotifBell from '../../components/NotifBell'
import TeamChat from '../../components/TeamChat'
import ThemeToggle from '../../components/ThemeToggle'
import BenevolePlanning from '../../components/BenevolePlanning'
import useAuthStore from '../../store/useAuthStore'
import { useTheme } from '../../hooks/useTheme'

const BRAND    = '#1a6b7a'
const BRAND_L  = '#f0f8f9'
const AMBER    = '#BA7517'
const AMBER_L  = '#FEF3C7'

const TYPE_CFG = {
  repas:   { label:'Repas',   icon:UtensilsCrossed, color:'#065f46', bg:'#d1fae5', emoji:'🍽️' },
  boisson: { label:'Boisson', icon:Coffee,          color:'#92400e', bg:'#fef3c7', emoji:'☕' },
  eau:     { label:'Eau',     icon:Droplets,        color:'#1e40af', bg:'#dbeafe', emoji:'💧' },
}

const resaCode = () => 'BNV-' + Date.now().toString(36).slice(-4).toUpperCase() + Math.random().toString(36).slice(2,4).toUpperCase()

export default function BenevoleApp({ docIdProp, eventIdProp, onSwitchToStaff = null } = {}) {
  const params    = new URLSearchParams(window.location.search)
  const docId     = docIdProp  || params.get('id')  || null
  const eventId   = eventIdProp || params.get('ev') || null

  const benevCol  = () => eventId
    ? collection(db, 'events', eventId, 'benevoles')
    : collection(db, 'benevoles')
  const menuCol   = () => eventId
    ? collection(db, 'events', eventId, 'menu')
    : collection(db, 'menu')
  const resaCol   = () => eventId
    ? collection(db, 'events', eventId, 'reservations')
    : collection(db, 'reservations')

  const [benev,       setBenev]       = useState(null)
  useTheme() // Active le thème global (mode sombre/clair) sur cette page
  const { notifications, nonLuCount, marquerToutLu } = useNotifications({
    specId:  docId,  // benevoleId utilisé comme specId pour le filtre
    isStaff: false,
    eventId: eventId,
  })
  const [menu,        setMenu]        = useState([])
  const [resas,       setResas]       = useState([])
  const [eventMeta,   setEventMeta]   = useState(null)
  const [benevoles,   setBenevoles]   = useState([])  // pour afficher les noms dans le planning
  const { logout } = useAuthStore()
  const [tab,         setTab]         = useState('accueil')
  const [qtys,        setQtys]        = useState({})
  const [resaLoading, setResaLoading] = useState(false)
  const [resaErr,     setResaErr]     = useState('')
  const [resaDone,    setResaDone]    = useState(null)
  const [qrDataUrl,   setQrDataUrl]   = useState(null)
  const [themeColor,  setThemeColor]  = useState('#1a6b7a')
  const [qrOpen,      setQrOpen]      = useState(false)
  const [pwdForm,     setPwdForm]     = useState({ current:'', new1:'', new2:'' })
  const [pwdLoading,  setPwdLoading]  = useState(false)
  const [pwdMsg,      setPwdMsg]      = useState(null) // { ok, text }
  // Charger infos événement
  // Charger le thème de l'événement
  useEffect(() => {
    if (!eventId) return
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

  useEffect(() => {
    if (!eventId) return
    getDoc(doc(db, 'events', eventId)).then(snap => {
      if (snap.exists()) setEventMeta(snap.data())
    }).catch(() => {})
  }, [eventId])

  // Charger le bénévole
  useEffect(() => {
    if (!docId) return
    const ref = eventId
      ? doc(db, 'events', eventId, 'benevoles', docId)
      : doc(db, 'benevoles', docId)
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) setBenev({ ...snap.data(), _id: snap.id })
    })
    return unsub
  }, [docId, eventId])

  // Charger le menu en temps réel (articles éligibles bénévoles)
  // Charger le thème de l'événement
  useEffect(() => {
    if (!eventId) return
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

  useEffect(() => {
    if (!eventId) return
    const unsub = onSnapshot(menuCol(), snap => {
      setMenu(snap.docs.map(d => ({ ...d.data(), id: d.id })).filter(m => m.typeConsommation))
    })
    return () => unsub()
  }, [eventId])

  // Liste de tous les bénévoles (pour afficher les noms dans le planning d'auto-inscription)
  useEffect(() => {
    if (!eventId) return
    const unsub = onSnapshot(collection(db, 'events', eventId, 'benevoles'), snap => {
      setBenevoles(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, () => setBenevoles([]))
    return () => unsub()
  }, [eventId])

  // Charger les réservations du bénévole
  useEffect(() => {
    if (!docId || !eventId) return
    const unsub = onSnapshot(
      query(resaCol(), where('benevoleId', '==', docId)),
      snap => setResas(snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)))
    )
    return () => unsub()
  }, [docId, eventId])

  // QR code
  useEffect(() => {
    if (!docId) return
    const url = `${window.location.origin}/benevole?id=${docId}${eventId ? '&ev=' + eventId : ''}`
    QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: BRAND, light: '#fff' } })
      .then(setQrDataUrl).catch(() => {})
  }, [docId])

  const openQr = useCallback(() => setQrOpen(true), [])
  const closeQr = useCallback(() => setQrOpen(false), [])

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
      const bRef = eventId
        ? doc(db, 'events', eventId, 'benevoles', docId)
        : doc(db, 'benevoles', docId)
      const newHash = await hashPassword(pwdForm.new1)
      await updateDoc(bRef, { password: pwdForm.new1, passwordHash: newHash })
      const auditColPwd = eventId ? collection(db, 'events', eventId, 'audit') : collection(db, 'audit')
      const nowPwd = new Date()
      await addDoc(auditColPwd, {
        action: 'CHANGEMENT_PWD_BENEV', benevoleId: docId,
        benevoleNom: `${benev?.prenom||''} ${benev?.nom||''}`.trim(),
        userType: 'benevole',
        label: `Changement mot de passe bénévole`,
        date: nowPwd.toLocaleString('fr-FR'), timestamp: nowPwd.toISOString(),
        createdAt: serverTimestamp(),
      })
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

  const canAddToCart = (item) => {
    const type = item.typeConsommation
    if (!type) return false
    const inCart = cartItems.filter(i => i.typeConsommation === type).reduce((a, i) => a + i.qty, 0)
    return inCart < quotaRestant(type)
  }

  // Commander
  const annulerResa = async (resaId, code) => {
    if (!window.confirm('Annuler cette réservation ?')) return
    try {
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
      const resa = resas.find(r => r.id === resaId)
      if (resa) {
        const bRef = eventId
          ? doc(db, 'events', eventId, 'benevoles', docId)
          : doc(db, 'benevoles', docId)
        // Sommer les qty par type pour éviter les écrasements
        const grouped = {}
        ;(resa.items||[]).forEach(item => {
          if (item.typeConsommation) {
            grouped[item.typeConsommation] = (grouped[item.typeConsommation] || 0) + (item.qty || 1)
          }
        })
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
        benevoleNom: `${benev?.prenom||''} ${benev?.nom||''}`.trim(),
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
        message: `${benev?.prenom||''} ${benev?.nom||''} a annulé sa réservation #${code}`,
        specId: null, benevoleId: docId, resaCode: code,
        lu: false, timestamp: new Date().toISOString(), createdAt: serverTimestamp(),
      })
    } catch (e) { alert('Erreur : ' + e.message) }
  }

  const doCommande = async () => {
    if (!benev || !cartItems.length) return
    setResaLoading(true); setResaErr('')
    try {
      const code = resaCode()

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
        benevoleNom: `${benev.prenom||''} ${benev.nom||''}`.trim() || '—',
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
        message:   `${benev.prenom||''} ${benev.nom||''} a réservé : ${itemsLabel}`,
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
        benevoleNom: `${benev.prenom||''} ${benev.nom||''}`.trim(),
        resaCode: code, montant: total, items: itemsLabel,
        userType: 'benevole',
        label: `Réservation bénévole #${code} : ${itemsLabel}`,
        date: nowAudit.toLocaleString('fr-FR'), timestamp: nowAudit.toISOString(),
        createdAt: serverTimestamp(),
      })
    } catch (e) { setResaErr(e.message || 'Erreur') }
    finally { setResaLoading(false) }
  }

  if (!docId) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg2)', fontFamily:'var(--font)' }}>
      <div style={{ textAlign:'center', padding:24, color:'var(--muted)' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🔗</div>
        <div style={{ fontSize:16, fontWeight:600 }}>Lien invalide</div>
        <div style={{ fontSize:13, marginTop:4 }}>Scannez le QR code fourni par l'organisation.</div>
      </div>
    </div>
  )

  const tabBtn = (id, label, icon) => (
    <button onClick={() => setTab(id)} style={{
      flex:1, padding:'10px 2px', border:'none', borderBottom: tab===id ? `2px solid ${BRAND}` : '2px solid transparent',
      background:'var(--bg2)', cursor:'pointer', fontFamily:'var(--font)',
      fontSize:11, fontWeight:tab===id?700:500, color:tab===id?BRAND:'var(--muted)',
      display:'flex', flexDirection:'column', alignItems:'center', gap:4, minWidth:0,
      WebkitTapHighlightColor:'transparent', minHeight:54,
    }}>
      {icon}
      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'100%' }}>{label}</span>
    </button>
  )

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg2)', fontFamily:'var(--font)' }}>

      {/* Header dégradé marine→teal (distinct des espaces spectateur/artiste) */}
      <div style={{ background:'var(--grad-marine-teal)', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'relative' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:28, height:28, borderRadius:7, background:'rgba(255,255,255,.20)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <img src="/logo.png" alt="YllaCash" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e=>e.target.style.display='none'}/>
          </div>
          <span style={{ fontSize:16, fontWeight:800, color:'#fff' }}>YllaCash</span>
          {eventMeta && (
            <div style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:6, background:'rgba(255,255,255,.18)', maxWidth:'clamp(80px, 30vw, 160px)', overflow:'hidden' }}>
              {eventMeta.logoSrc
                ? <img src={eventMeta.logoSrc} alt="" style={{ width:12, height:12, borderRadius:2, objectFit:'cover', flexShrink:0 }}/>
                : <span style={{ fontSize:10, flexShrink:0 }}>{eventMeta.emoji || '🎵'}</span>
              }
              <span style={{ fontSize:11, fontWeight:700, color:'#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{eventMeta.nom}</span>
            </div>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {onSwitchToStaff && (
            <button onClick={onSwitchToStaff}
              title="Basculer vers l'espace staff"
              aria-label="Espace staff"
              style={{ background:'rgba(255,255,255,.15)', border:'none', borderRadius:8, padding:'7px', cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:16 }}>
              🎪
            </button>
          )}
          <button onClick={logout}
            title="Se déconnecter"
            aria-label="Se déconnecter"
            style={{ background:'rgba(255,255,255,.15)', border:'none', borderRadius:8, padding:'7px', cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <LogOut size={16}/>
          </button>
        </div>
      </div>

      <div style={{ maxWidth:480, margin:'0 auto', padding:'0 12px' }}>

        {/* Carte bénévole — responsive */}
        <div style={{ background:'var(--bg)', borderRadius:16, boxShadow:'0 4px 20px rgba(0,0,0,.1)', margin:'12px 0', padding:'16px' }}>
          {benev ? (
            <>
              {/* Ligne principale : QR + infos + actions */}
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                {/* QR cliquable */}
                {qrDataUrl && (
                  <img src={qrDataUrl} alt="QR" onClick={openQr}
                    style={{ width:64, height:64, borderRadius:10, cursor:'pointer', flexShrink:0, border:`2px solid ${BRAND}22` }}/>
                )}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {benev.prenom} {benev.nom}
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{benev.poste || 'Bénévole'}</div>
                  <div style={{ fontSize:10, fontFamily:'monospace', color:BRAND, marginTop:2 }}>BNV-{docId?.slice(-6)}</div>
                </div>
                {/* Cloche + Thème — déplacés ici pour libérer le header */}
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, flexShrink:0 }}>
                  <NotifBell notifications={notifications} nonLuCount={nonLuCount} onMarkAllRead={marquerToutLu}/>
                  <ThemeToggle/>
                </div>
              </div>

              {/* Quotas — 3 colonnes compactes */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
                {Object.entries(TYPE_CFG).map(([type, cfg]) => {
                  const droits  = benev.droits?.[type] || 0
                  const conso   = benev.consommation?.[type] || 0
                  const restant = Math.max(0, droits - conso)
                  const epuise  = restant === 0
                  const Icon = cfg.icon
                  return (
                    <div key={type} style={{ background: epuise ? '#f1f5f9' : cfg.bg, borderRadius:10, padding:'8px 6px', textAlign:'center', border:`1px solid ${epuise?'#e2e8f0':cfg.color+'33'}` }}>
                      <Icon size={16} style={{ color: epuise ? '#94a3b8' : cfg.color, marginBottom:2 }}/>
                      <div style={{ fontSize:20, fontWeight:800, color: epuise ? '#94a3b8' : cfg.color, lineHeight:1 }}>{restant}</div>
                      <div style={{ fontSize:9, color: epuise ? '#94a3b8' : cfg.color, fontWeight:600, marginTop:2 }}>{cfg.label}</div>
                      <div style={{ fontSize:9, color: epuise ? '#94a3b8' : cfg.color, opacity:.6 }}>/ {droits}</div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div style={{ textAlign:'center', padding:'20px 0', color:'var(--muted)' }}>Chargement…</div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', background:'var(--bg)', borderRadius:14, marginBottom:12, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,.06)' }}>
          {tabBtn('accueil',   'Accueil',  <Clock size={14}/>)}
          {tabBtn('planning',  'Planning', <CalendarDays size={14}/>)}
          {tabBtn('commander', 'Conso',    <ShoppingCart size={14}/>)}
          {tabBtn('mes-resas', 'Résa',     <Bookmark size={14}/>)}
          {tabBtn('profil',    'Profil',   <User size={14}/>)}
        </div>

        {/* Contenu */}
        {tab === 'accueil' && benev && (
          <div style={{ background:'var(--bg)', borderRadius:14, padding:16, boxShadow:'0 2px 8px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:12 }}>Bienvenue {benev.prenom} 👋</div>
            <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6 }}>
              Votre espace bénévole vous permet de commander vos repas et boissons dans la limite de votre quota.
              Présentez votre QR code au stand pour valider votre commande.
            </div>
            {benev.creneaux && (
              <div style={{ marginTop:14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', marginBottom:8 }}>Vos créneaux</div>
                {['Vendredi','Samedi','Dimanche'].map(j => {
                  const cr = benev.creneaux?.[j] || {}
                  const actifs = Object.entries(cr).filter(([,v])=>v).map(([c])=>c)
                  if (!actifs.length) return null
                  return (
                    <div key={j} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:'var(--text)', minWidth:60 }}>{j}</span>
                      {actifs.map(a => (
                        <span key={a} style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:BRAND+'18', color:BRAND, fontWeight:600 }}>{a}</span>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'planning' && benev && (
          <BenevolePlanning benev={benev} eventId={eventId} benevoles={benevoles}/>
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
            cancelResa={annulerResa}
          />
        )}

        {tab === 'profil' && benev && (
          <BenevoleProfil
            benev={benev} BRAND={BRAND}
            pwdForm={pwdForm} setPwdForm={setPwdForm}
            pwdMsg={pwdMsg} pwdLoading={pwdLoading} changePwd={changePwd}
          />
        )}
      </div>

      {/* Modale QR plein écran */}
      {qrOpen && qrDataUrl && (
        <div onClick={closeQr} style={{ position:'fixed', inset:0, zIndex:300, background:'var(--bg)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:4 }}>{benev?.nom} {benev?.prenom}</div>
          <div style={{ fontSize:12, fontFamily:'monospace', color:'var(--muted)', marginBottom:20 }}>Bénévole</div>
          <img src={qrDataUrl} alt="QR" style={{ width:'min(85vw,380px)', height:'min(85vw,380px)', borderRadius:16 }}/>
          <div style={{ marginTop:24, fontSize:13, color:'var(--muted)' }}>Appuyez pour fermer</div>
        </div>
      )}
      {/* Footer À propos */}
      <div style={{ textAlign:'center', padding:'20px 16px 32px', fontFamily:'var(--font)' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)' }}>YllaCash v1.0 · 05/2026</div>
        <div style={{ fontSize:11, color:'var(--muted)', opacity:.7, marginTop:2 }}>
          Développée par <strong>Maison Ylla</strong>
        </div>
        <div style={{ fontSize:10, color:'var(--muted)', opacity:.5, marginTop:6, fontStyle:'italic', maxWidth:280, margin:'6px auto 0' }}>
          "Toute la gestion financière de votre événement en un seul endroit, et bien plus encore"
        </div>
      </div>

      {/* Chat équipe (v7) */}
      {eventId && benev && (
        <TeamChat
          eventId={eventId}
          currentUser={{ uid: docId, id: docId, nom: ((benev.prenom || '') + ' ' + (benev.nom || '')).trim() || benev.nom || 'Bénévole', role: 'benevole' }}
          brandColor={themeColor}
          isAdmin={false}
        />
      )}
    </div>
  )
}