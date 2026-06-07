/**
 * pages/public/BenevoleApp.jsx
 * Espace bénévole — identique à l'espace spectateur
 * URL : /benevole?id=DOC_ID&ev=EVENT_ID
 *
 * Quota par catégorie (repas/boisson/eau) au lieu d'un solde en euros
 * Le bénévole peut réserver des articles du menu (déduit du quota)
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { db } from '../../firebase/config'
import {
  collection, query, where, getDocs, getDoc,
  doc, onSnapshot, addDoc, updateDoc,
  serverTimestamp, orderBy, increment, runTransaction,
} from 'firebase/firestore'
import { nowStr } from '../../utils/helpers'
import { APP_VERSION_LABEL, APP_FULL_LABEL } from '../../utils/buildInfo'
import CheckUpdateButton from '../../components/CheckUpdateButton'
import PageTransition from '../../components/PageTransition'
import { getSettings } from '../../firebase/service'
import { hashPassword } from '../../utils/kpis'
import BenevoleCommander from './BenevoleCommander'
import BenevoleResas     from './BenevoleResas'
import BenevoleProfil    from './BenevoleProfil'
import QRCode from 'qrcode'
import { UtensilsCrossed, Coffee, Droplets, ShoppingCart, Clock, Bookmark, User, LogOut, CalendarDays, MapPin, ChevronRight, CheckCircle, AlertCircle, Sparkles } from 'lucide-react'
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

      // Numéro séquentiel partagé avec les commandes et résas spectateurs (Lot 1 Cuisine unifiée).
      // Permet à la cuisine d'afficher #42 plutôt que le code interne BNV-XXXX.
      const { getNextCommandeNumero } = await import('../../firebase/service')
      const numero = await getNextCommandeNumero(eventId)

      await addDoc(resaCol(), {
        benevoleId:  docId,
        benevoleNom: benev.nom + ' ' + benev.prenom,
        items:  itemsWithPrice,
        total,
        // Status 'processing' direct (= "pris en charge automatiquement") pour que la
        // cuisine puisse marquer prête sans étape "prendre en charge" préalable.
        // Aligné avec creerReservation (spectateurs) post-Lot 1.
        status: 'processing',
        code, numero,
        assignedStaffId: '__auto__',
        assignedStaff: 'Auto (bénévole)',
        date:       nowStr(),
        isBenev:    true,
        createdAt:  serverTimestamp(),
        processingAt: serverTimestamp(),
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

  const tabBtn = (id, label, icon) => {
    const active = tab === id
    return (
      <button onClick={() => setTab(id)} style={{
        flex: 1, padding: '10px 4px',
        border: 'none', background: 'transparent',
        cursor: 'pointer', fontFamily: 'var(--font)',
        fontSize: 11, fontWeight: active ? 800 : 600,
        color: active ? BRAND : 'var(--muted)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0,
        WebkitTapHighlightColor: 'transparent', minHeight: 56,
        position: 'relative',
        transition: 'color .15s',
      }}>
        {/* Pastille active arrière-plan derrière l'icône */}
        <div style={{
          width: 40, height: 28, borderRadius: 14,
          background: active ? BRAND + '22' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background .15s',
        }}>
          {React.cloneElement(icon, { size: 18, strokeWidth: active ? 2.5 : 2 })}
        </div>
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%',
        }}>{label}</span>
      </button>
    )
  }

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

        {/* Carte bénévole — modernisée v8 debug : QR mis en valeur, plus d'arrondis,
            quotas supprimés ici car réaffichés (étoffés) dans l'accueil BenevoleHome */}
        <div style={{
          background: 'var(--bg)',
          borderRadius: 18,
          boxShadow: '0 6px 24px rgba(0,48,72,.10)',
          margin: '12px 0',
          padding: '16px',
          border: '0.5px solid var(--border)',
        }}>
          {benev ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {/* QR plus grand, plus cliquable */}
              {qrDataUrl && (
                <img src={qrDataUrl} alt="QR" onClick={openQr}
                  style={{
                    width: 72, height: 72, borderRadius: 12,
                    cursor: 'pointer', flexShrink: 0,
                    border: `2px solid ${BRAND}33`,
                    boxShadow: `0 2px 8px ${BRAND}22`,
                  }}/>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 17, fontWeight: 800, color: 'var(--text)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  lineHeight: 1.15,
                }}>
                  {benev.prenom} {benev.nom}
                </div>
                <div style={{
                  fontSize: 12, fontWeight: 600, color: BRAND, marginTop: 4,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 12,
                  background: BRAND + '14',
                }}>
                  🎫 Bénévole
                </div>
                <div style={{
                  fontSize: 10, fontFamily: 'monospace',
                  color: 'var(--muted)', marginTop: 4,
                }}>
                  BNV-{docId?.slice(-6)}
                </div>
              </div>
              {/* Cloche + Thème — colonne droite, boutons 44px (HIG) */}
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 6, flexShrink: 0,
              }}>
                <NotifBell notifications={notifications} nonLuCount={nonLuCount} onMarkAllRead={marquerToutLu}/>
                <ThemeToggle/>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)' }}>Chargement…</div>
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

        {/* Contenu — animation entre les onglets */}
        <PageTransition pageKey={tab}>
          {tab === 'accueil' && benev && (
            <BenevoleHome
              benev={benev}
              docId={docId}
              eventId={eventId}
              resas={resas}
              setTab={setTab}
              BRAND={BRAND}
              BRAND_L={BRAND_L}
              AMBER={AMBER}
              AMBER_L={AMBER_L}
            />
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
        </PageTransition>
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
        <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)' }}>{APP_FULL_LABEL}</div>
        <div style={{ fontSize:11, color:'var(--muted)', opacity:.7, marginTop:2 }}>
          Développée par <strong>Maison Ylla</strong>
        </div>
        <div style={{
          fontSize:9, color:'var(--muted)', opacity:.55, marginTop:4,
          fontFamily:'monospace', letterSpacing:'0.02em',
        }}>
          Build {APP_VERSION_LABEL}
        </div>
        <div style={{ marginTop: 8 }}>
          <CheckUpdateButton variant="compact"/>
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
// ═══════════════════════════════════════════════════════════════════════
// Composant BenevoleHome — Accueil modernisé v8 debug
// ═══════════════════════════════════════════════════════════════════════
//
// Design inspiré de EspaceArtiste (palette Maison Ylla, arrondis, ombres).
// Blocs visibles :
//   1. Bienvenue avec prénom
//   2. Avantages restants (3 quotas avec barres de progression)
//   3. Mon poste (carte dédiée)
//   4. 3 dernières commandes
//   5. Lien rapide vers le planning bénévole
//   6. CTA "Aller commander"

function BenevoleHome({ benev, docId, eventId, resas, setTab, BRAND, BRAND_L, AMBER, AMBER_L }) {
  // Charge les shifts du planning bénévole pour identifier le prochain créneau
  const [shifts, setShifts] = useState([])

  useEffect(() => {
    if (!eventId) return
    // Import dynamique pour ne pas alourdir le bundle
    let unsub = null
    ;(async () => {
      const { watchVolunteerShifts } = await import('../../firebase/service')
      unsub = watchVolunteerShifts(setShifts, eventId)
    })()
    return () => { if (unsub) unsub() }
  }, [eventId])

  // ID du bénévole pour identifier ses assignations
  const myId = benev?._id || benev?.id || docId || null

  // Calcul du prochain créneau du bénévole
  const prochainCreneau = useMemo(() => {
    if (!myId || !shifts.length) return null
    const now = Date.now()
    // Trouve les shifts où le bénévole est assigné (dans postes ou libres)
    const mesShifts = shifts.filter(s => {
      const dansPoste = Object.values(s.postes || {}).some(p =>
        (p.assignments || []).includes(myId))
      const dansLibre = (s.libres || []).includes(myId)
      return dansPoste || dansLibre
    })
    // Pour chaque, calcule le timestamp de début (date + heure)
    const avecTs = mesShifts.map(s => {
      const dateStr = s.date || ''
      const heureStr = s.debut || '00:00'
      const ts = new Date(`${dateStr}T${heureStr}:00`).getTime()
      // Identifier sur quel poste le bénévole est positionné
      const posteEntry = Object.entries(s.postes || {}).find(([, p]) =>
        (p.assignments || []).includes(myId))
      const posteId = posteEntry ? posteEntry[0] : null
      // estPolyvalent = inscrit dans s.libres (pas dans un poste précis)
      const estPolyvalent = !posteId && (s.libres || []).includes(myId)
      return { ...s, ts, posteId, estPolyvalent }
    }).filter(s => !isNaN(s.ts))
    // Trie et garde le prochain (ts > maintenant) ou en cours (debut <= now <= fin)
    const futurs = avecTs.filter(s => {
      const tsFin = new Date(`${s.date}T${s.fin || s.debut}:00`).getTime()
      return tsFin >= now // pas encore terminé
    }).sort((a, b) => a.ts - b.ts)
    return futurs[0] || null
  }, [shifts, myId])

  // Charge les postes pour le nom (optionnel — si non chargé, on affichera juste l'heure)
  const [posts, setPosts] = useState([])
  useEffect(() => {
    if (!eventId) return
    let unsub = null
    ;(async () => {
      const { watchVolunteerPosts } = await import('../../firebase/service')
      unsub = watchVolunteerPosts(setPosts, eventId)
    })()
    return () => { if (unsub) unsub() }
  }, [eventId])

  const posteName = useMemo(() => {
    if (!prochainCreneau?.posteId) return null
    const p = posts.find(p => p.id === prochainCreneau.posteId)
    return p?.nom || p?.label || null
  }, [prochainCreneau, posts])

  // Calculs sur le créneau : en cours ou à venir, dans combien de temps
  const creneauInfo = useMemo(() => {
    if (!prochainCreneau) return null
    const now = Date.now()
    const tsFin = new Date(`${prochainCreneau.date}T${prochainCreneau.fin || prochainCreneau.debut}:00`).getTime()
    const enCours = prochainCreneau.ts <= now && now <= tsFin
    if (enCours) {
      return { enCours: true, label: '🟢 En cours' }
    }
    // À venir : calcul du délai
    const diff = prochainCreneau.ts - now
    const diffHours = Math.floor(diff / 3_600_000)
    const diffDays = Math.floor(diff / 86_400_000)
    let delai = ''
    if (diffDays > 1) delai = `Dans ${diffDays} jours`
    else if (diffDays === 1) delai = 'Demain'
    else if (diffHours > 1) delai = `Dans ${diffHours} h`
    else if (diffHours >= 0) delai = 'Dans moins d\'1 h'
    else delai = 'Bientôt'
    return { enCours: false, label: delai }
  }, [prochainCreneau])

  // Formatage de la date du créneau pour affichage
  const fmtCreneauDate = (s) => {
    if (!s?.date) return ''
    const d = new Date(s.date + 'T12:00:00')
    if (isNaN(d)) return s.date
    const dateStr = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
    return dateStr.charAt(0).toUpperCase() + dateStr.slice(1)
  }
  // Calcul des quotas avec barres
  const quotas = [
    {
      key: 'repas',
      label: 'Repas',
      icon: <UtensilsCrossed size={20}/>,
      color: '#D17030',  // coral marqué
      bg: '#FFE6D8',
      droits: benev.droits?.repas || 0,
      conso:  benev.consommation?.repas || 0,
    },
    {
      key: 'boisson',
      label: 'Boissons',
      icon: <Coffee size={20}/>,
      color: '#A87020',  // gold
      bg: '#FCEFD8',
      droits: benev.droits?.boisson || 0,
      conso:  benev.consommation?.boisson || 0,
    },
    {
      key: 'eau',
      label: 'Snacks',
      icon: <Droplets size={20}/>,
      color: '#1A8080',  // teal
      bg: '#D5EFEF',
      droits: benev.droits?.eau || 0,
      conso:  benev.consommation?.eau || 0,
    },
  ]

  // 3 dernières commandes (déjà triées du + récent au + ancien)
  const lastResas = resas.slice(0, 3)

  // Format d'une date pour les commandes
  const fmtResaDate = (r) => {
    const ts = r.createdAt?.toDate ? r.createdAt.toDate() : (r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : null)
    if (!ts) return ''
    const now = new Date()
    const isToday = ts.toDateString() === now.toDateString()
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
    const isYesterday = ts.toDateString() === yesterday.toDateString()
    if (isToday) return 'Aujourd\'hui ' + ts.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    if (isYesterday) return 'Hier ' + ts.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    return ts.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' ' +
           ts.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  // Libellé du statut d'une résa
  const statutInfo = (r) => {
    if (r.statut === 'retiree') return { label: 'Retirée', color: '#1A8050', bg: '#D5EFE0', icon: <CheckCircle size={12}/> }
    if (r.statut === 'prete')   return { label: 'Prête',    color: '#A87020', bg: '#FCEFD8', icon: <AlertCircle size={12}/> }
    if (r.statut === 'annulee') return { label: 'Annulée',  color: '#C03030', bg: '#FBE0E0', icon: null }
    return { label: 'En attente', color: '#5070A0', bg: '#E0EAF5', icon: <Clock size={12}/> }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ─── 1. Mes avantages restants (étoffé) ──────────────────────── */}
      <div style={{
        background: 'var(--bg)', borderRadius: 14, padding: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,.06)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 14,
        }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
            🎁 Mes avantages
          </div>
          <button onClick={() => setTab('commander')}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, color: BRAND,
              display: 'flex', alignItems: 'center', gap: 2,
              padding: 4, WebkitTapHighlightColor: 'transparent',
            }}>
            Commander <ChevronRight size={14}/>
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {quotas.map(q => {
            const restant = Math.max(0, q.droits - q.conso)
            const pct = q.droits > 0 ? Math.min(100, (q.conso / q.droits) * 100) : 0
            const isEmpty = q.droits === 0
            const isFull = q.droits > 0 && restant === 0
            return (
              <div key={q.key} style={{
                background: q.bg,
                borderRadius: 12, padding: '12px 14px',
                opacity: isEmpty ? 0.5 : 1,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: isEmpty ? 0 : 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 9,
                      background: q.color, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {q.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: q.color }}>
                        {q.label}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {isEmpty
                          ? 'Aucun droit'
                          : `${restant} / ${q.droits} restant${restant > 1 ? 's' : ''}`}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    fontSize: 20, fontWeight: 800,
                    color: isFull ? '#C03030' : q.color,
                  }}>
                    {restant}
                  </div>
                </div>
                {/* Barre de progression */}
                {!isEmpty && (
                  <div style={{
                    width: '100%', height: 6, background: 'rgba(0,0,0,0.08)',
                    borderRadius: 3, overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', width: `${100 - pct}%`,
                      background: q.color,
                      transition: 'width 0.3s ease',
                    }}/>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── 2. Prochain créneau (style ruban balance artiste) ─────── */}
      {prochainCreneau ? (
        <div onClick={() => setTab('planning')}
          style={{
            background: creneauInfo?.enCours
              ? 'linear-gradient(135deg, #1A8050 0%, #2DAA70 100%)'
              : 'linear-gradient(135deg, ' + BRAND + ' 0%, ' + BRAND + 'DD 100%)',
            borderRadius: 14,
            padding: 16,
            color: '#fff',
            boxShadow: '0 6px 20px ' + (creneauInfo?.enCours ? 'rgba(26,128,80,.30)' : BRAND + '40'),
            cursor: 'pointer',
            position: 'relative', overflow: 'hidden',
            WebkitTapHighlightColor: 'transparent',
          }}>
          {/* Effet décoratif */}
          <div style={{
            position: 'absolute', top: '-30%', right: '-15%',
            width: '50%', height: '160%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}/>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 50, height: 50, borderRadius: 12,
              background: 'rgba(255,255,255,0.20)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              backdropFilter: 'blur(8px)',
            }}>
              <CalendarDays size={26}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, opacity: 0.9,
                textTransform: 'uppercase', letterSpacing: '0.05em',
                marginBottom: 2,
              }}>
                {creneauInfo?.enCours ? 'Créneau en cours' : 'Prochain créneau'}
              </div>
              <div style={{
                fontSize: 15, fontWeight: 800,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {posteName || (prochainCreneau.estPolyvalent ? 'Polyvalent · tous postes' : 'Bénévole')}
              </div>
              <div style={{
                fontSize: 12, opacity: 0.95, marginTop: 2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                <Clock size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}/>
                {fmtCreneauDate(prochainCreneau)} · {prochainCreneau.debut}–{prochainCreneau.fin}
              </div>
            </div>
            <div style={{
              padding: '5px 10px', borderRadius: 6,
              background: 'rgba(255,255,255,0.20)',
              fontSize: 11, fontWeight: 800,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {creneauInfo?.label}
            </div>
          </div>
        </div>
      ) : (
        // Aucun créneau à venir : invitation à s'inscrire au planning
        <div onClick={() => setTab('planning')}
          style={{
            background: 'var(--bg)', borderRadius: 14, padding: 16,
            boxShadow: '0 2px 8px rgba(0,0,0,.06)',
            display: 'flex', alignItems: 'center', gap: 14,
            border: '1px dashed var(--border2)',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}>
          <div style={{
            width: 44, height: 44, borderRadius: 11,
            background: 'var(--brand-light)', color: 'var(--brand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <CalendarDays size={20}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              Mon planning
            </div>
            <div style={{
              fontSize: 14, fontWeight: 700, color: 'var(--text)', marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              Aucun créneau prévu
            </div>
            <div style={{ fontSize: 11, color: 'var(--brand)', marginTop: 2, fontWeight: 600 }}>
              Cliquez pour vous inscrire au planning →
            </div>
          </div>
          <ChevronRight size={20} style={{ color: 'var(--brand)', flexShrink: 0 }}/>
        </div>
      )}

      {/* ─── 3. Mes 3 dernières commandes ───────────────────────────── */}
      <div style={{
        background: 'var(--bg)', borderRadius: 14, padding: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,.06)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
            📦 Mes dernières commandes
          </div>
          {resas.length > 3 && (
            <button onClick={() => setTab('mes-resas')}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, color: BRAND,
                display: 'flex', alignItems: 'center', gap: 2,
                padding: 4, WebkitTapHighlightColor: 'transparent',
              }}>
              Voir tout <ChevronRight size={14}/>
            </button>
          )}
        </div>
        {lastResas.length === 0 ? (
          <div style={{
            padding: '20px 12px', textAlign: 'center',
            fontSize: 12, color: 'var(--muted)',
            background: 'var(--bg2)', borderRadius: 10,
          }}>
            Aucune commande pour le moment.
            <br/>
            <button onClick={() => setTab('commander')}
              style={{
                marginTop: 10, padding: '8px 16px',
                background: BRAND, color: '#fff', border: 'none',
                borderRadius: 8, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                WebkitTapHighlightColor: 'transparent',
              }}>
              Faire ma première commande
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lastResas.map(r => {
              const st = statutInfo(r)
              const items = r.items || []
              const itemsTxt = items.length === 0 ? 'Commande'
                : items.length === 1 ? items[0].nom
                : `${items[0].nom} +${items.length - 1}`
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px',
                  background: 'var(--bg2)',
                  borderRadius: 10,
                  borderLeft: `3px solid ${st.color}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: 'var(--text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {itemsTxt}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
                      {fmtResaDate(r)}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    padding: '3px 8px', borderRadius: 5,
                    background: st.bg, color: st.color,
                    display: 'flex', alignItems: 'center', gap: 3,
                    flexShrink: 0,
                  }}>
                    {st.icon} {st.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ─── 4. Astuce ─────────────────────────────────────────────── */}
      <div style={{
        // var(--brand-light) s'adapte : crème en clair, marine clair en sombre
        background: 'var(--brand-light)',
        border: '1px solid var(--border)',
        borderRadius: 12, padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        {/* var(--brand) s'adapte : teal foncé en clair, teal clair en sombre */}
        <Sparkles size={18} style={{ color: 'var(--brand)', flexShrink: 0 }}/>
        <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.45 }}>
          <strong style={{ color: 'var(--brand)' }}>Astuce :</strong> présentez votre QR code au stand
          pour valider votre commande. Cliquez sur le QR en haut de la page pour l'agrandir.
        </div>
      </div>

      {/* ─── 5. CTA Commander en gros ─────────────────────────────── */}
      <button onClick={() => setTab('commander')}
        style={{
          padding: '14px 20px',
          background: 'linear-gradient(135deg, ' + BRAND + ' 0%, ' + BRAND + 'DD 100%)',
          color: '#fff', border: 'none',
          borderRadius: 14,
          fontSize: 14, fontWeight: 800,
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: '0 6px 20px ' + BRAND + '40',
          minHeight: 52,
          WebkitTapHighlightColor: 'transparent',
        }}>
        <ShoppingCart size={20}/> Aller commander
      </button>
    </div>
  )
}
