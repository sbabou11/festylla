/**
 * components/AuditPanel.jsx — v2
 * Journal d'audit complet — toutes actions, tous utilisateurs
 * Filtres : type utilisateur × type action × recherche texte
 */
import React, { useState, useEffect } from 'react'
import { X, ClipboardList, Search } from 'lucide-react'
import { db } from '../firebase/config'
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore'
import useAuthStore   from '../store/useAuthStore'
import useEventStore  from '../store/useEventStore'
import { useExport }  from '../hooks/useExport'
import { useBreakpoint } from '../hooks/useBreakpoint'

// ── Configuration des actions ───────────────────────────────────────
const ACTION_CFG = {
  // Financier
  CREDIT:              { icon:'💳', label:'Crédit',                color:'#065f46', bg:'#d1fae5', cat:'financier' },
  DEBIT:               { icon:'🛒', label:'Encaissement',          color:'#991b1b', bg:'#fee2e2', cat:'financier' },
  RETRAIT:             { icon:'📦', label:'Retrait résa',           color:'#4338ca', bg:'#ede9fe', cat:'financier' },
  RETRAIT_BENEV:       { icon:'🎁', label:'Retrait bénévole',       color:'#4338ca', bg:'#ede9fe', cat:'financier' },
  // Réservations
  RESERVATION:         { icon:'📋', label:'Réservation',           color:'#92400e', bg:'#fef3c7', cat:'reservation' },
  BENEV_RESERVATION:   { icon:'📋', label:'Résa bénévole',         color:'#92400e', bg:'#fef3c7', cat:'reservation' },
  RESA_PRISE_EN_CHARGE:{ icon:'👨‍🍳', label:'Prise en charge',       color:'#534AB7', bg:'#EDE9FE', cat:'reservation' },
  RESA_PRETE:          { icon:'✅', label:'Commande prête',         color:'#1a6b7a', bg:'#e0f4f7', cat:'reservation' },
  ANNULATION_RESA:     { icon:'❌', label:'Annulation résa',        color:'#dc2626', bg:'#fee2e2', cat:'reservation' },
  ANNULATION_RESA_SPEC:{ icon:'❌', label:'Annulation par client',  color:'#dc2626', bg:'#fee2e2', cat:'reservation' },
  BENEV_ANNULATION:    { icon:'❌', label:'Annulation bénévole',    color:'#dc2626', bg:'#fee2e2', cat:'reservation' },
  SUPPRESSION_RESA:    { icon:'🗑️', label:'Suppression résa',       color:'#991b1b', bg:'#fee2e2', cat:'reservation' },
  // Staff
  CONNEXION:           { icon:'🔑', label:'Connexion',             color:'#1a6b7a', bg:'#e0f4f7', cat:'session' },
  DECONNEXION:         { icon:'🚪', label:'Déconnexion',           color:'#475569', bg:'#f1f5f9', cat:'session' },
  CREATION_STAFF:      { icon:'👤', label:'Création staff',         color:'#065f46', bg:'#d1fae5', cat:'administration' },
  MODIF_STAFF:         { icon:'✏️', label:'Modification staff',     color:'#92400e', bg:'#fef3c7', cat:'administration' },
  SUPPRESSION_STAFF:   { icon:'🗑️', label:'Suppression staff',      color:'#991b1b', bg:'#fee2e2', cat:'administration' },
  RESET_PWD_STAFF:     { icon:'🔒', label:'Reset mot de passe',     color:'#92400e', bg:'#fef3c7', cat:'administration' },
  // Bénévoles
  CREATION_BENEV:      { icon:'🙋', label:'Création bénévole',      color:'#065f46', bg:'#d1fae5', cat:'benevole' },
  MODIF_BENEV:         { icon:'✏️', label:'Modification bénévole',  color:'#92400e', bg:'#fef3c7', cat:'benevole' },
  SUPPRESSION_BENEV:   { icon:'🗑️', label:'Suppression bénévole',   color:'#991b1b', bg:'#fee2e2', cat:'benevole' },
  CONSO_BENEV:         { icon:'🍽️', label:'Consommation bénévole',  color:'#534AB7', bg:'#EDE9FE', cat:'benevole' },
  RESET_CONSO_BENEV:   { icon:'🔄', label:'Reset conso bénévole',   color:'#475569', bg:'#f1f5f9', cat:'benevole' },
  CHANGEMENT_PWD_BENEV:{ icon:'🔒', label:'Changement mdp bénévole',color:'#92400e', bg:'#fef3c7', cat:'benevole' },
  // Spectateurs
  CREATION_SPECTATEUR: { icon:'👥', label:'Création spectateur',    color:'#065f46', bg:'#d1fae5', cat:'spectateur' },
  MODIF_SPECTATEUR:    { icon:'✏️', label:'Modification spectateur', color:'#92400e', bg:'#fef3c7', cat:'spectateur' },
  // Menu & Catégories
  CREATION_ARTICLE:    { icon:'🍽️', label:'Ajout article menu',     color:'#065f46', bg:'#d1fae5', cat:'menu' },
  MODIF_ARTICLE:       { icon:'✏️', label:'Modification article',    color:'#92400e', bg:'#fef3c7', cat:'menu' },
  SUPPRESSION_ARTICLE: { icon:'🗑️', label:'Suppression article',     color:'#991b1b', bg:'#fee2e2', cat:'menu' },
  CREATION_CATEGORIE:  { icon:'📂', label:'Création catégorie',      color:'#065f46', bg:'#d1fae5', cat:'menu' },
  MODIF_CATEGORIE:     { icon:'✏️', label:'Modification catégorie',  color:'#92400e', bg:'#fef3c7', cat:'menu' },
  SUPPRESSION_CATEGORIE:{ icon:'🗑️', label:'Suppression catégorie',  color:'#991b1b', bg:'#fee2e2', cat:'menu' },
  // Rôles
  CREATION_ROLE:       { icon:'🛡️', label:'Création rôle',           color:'#4338ca', bg:'#ede9fe', cat:'administration' },
  MODIF_ROLE:          { icon:'✏️', label:'Modification rôle',       color:'#92400e', bg:'#fef3c7', cat:'administration' },
  SUPPRESSION_ROLE:    { icon:'🗑️', label:'Suppression rôle',        color:'#991b1b', bg:'#fee2e2', cat:'administration' },
  // Paramètres
  MODIF_SETTINGS:      { icon:'⚙️', label:'Paramètres modifiés',     color:'#475569', bg:'#f1f5f9', cat:'administration' },
  // Autres
  OTHER:               { icon:'📝', label:'Action',                  color:'#475569', bg:'#f1f5f9', cat:'autre' },
}

// Filtres par type d'utilisateur
const USER_TYPES = [
  { value:'ALL',         label:'Tous les utilisateurs' },
  { value:'staff',       label:'Staff' },
  { value:'admin',       label:'Admins' },
  { value:'benevole',    label:'Bénévoles' },
  { value:'spectateur',  label:'Spectateurs' },
]

// Filtres par catégorie d'action
const ACTION_CATS = [
  { value:'ALL',           label:'Toutes les actions' },
  { value:'session',       label:'🔑 Connexion/Déconnexion' },
  { value:'financier',     label:'💰 Financier' },
  { value:'reservation',   label:'📋 Réservations' },
  { value:'benevole',      label:'🙋 Bénévoles' },
  { value:'spectateur',    label:'👥 Spectateurs' },
  { value:'menu',          label:'🍽️ Menu & Catégories' },
  { value:'administration',label:'⚙️ Administration' },
]

const fmtDate = (ts) => {
  if (!ts) return '—'
  try {
    const d    = new Date(ts)
    const diff = Math.floor((Date.now() - d) / 1000)
    if (diff < 60)    return 'À l\'instant'
    if (diff < 3600)  return `Il y a ${Math.floor(diff/60)} min`
    if (diff < 86400) return d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
    return d.toLocaleDateString('fr-FR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
  } catch { return ts }
}

export default function AuditPanel({ open, onClose }) {
  const { user }           = useAuthStore()
  const { isMobile }       = useBreakpoint()
  const isAdmin            = user?.role === 'admin' || user?.role === 'super_admin'
  const { currentEventId } = useEventStore()
  const { exportAuditCsv } = useExport()
  const [exporting, setExporting] = useState(false)
  const [logs, setLogs]    = useState([])
  const [search, setSrch]  = useState('')
  const [userType, setUserType] = useState('ALL')
  const [actionCat, setActionCat] = useState('ALL')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    const auditCollection = currentEventId
      ? collection(db, 'events', currentEventId, 'audit')
      : collection(db, 'audit')
    const q = query(auditCollection, orderBy('createdAt', 'desc'), limit(500))
    const unsub = onSnapshot(q, snap => {
      let all = snap.docs.map(d => ({ ...d.data(), id: d.id }))
      if (!isAdmin) {
        all = all.filter(l =>
          l.staffEmail === user?.email ||
          l.staff      === user?.email ||
          l.staff      === user?.nom   ||
          l.byStaff    === user?.email
        )
      }
      setLogs(all)
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [open, isAdmin, user, currentEventId])

  const filtered = logs.filter(l => {
    const cfg = ACTION_CFG[l.action] || ACTION_CFG.OTHER
    const matchSearch = !search ||
      (l.label||''  ).toLowerCase().includes(search.toLowerCase()) ||
      (l.staff||''  ).toLowerCase().includes(search.toLowerCase()) ||
      (l.specNom||''  ).toLowerCase().includes(search.toLowerCase()) ||
      (l.benevoleNom||''  ).toLowerCase().includes(search.toLowerCase()) ||
      (l.action||''  ).toLowerCase().includes(search.toLowerCase())
    const matchUser   = userType === 'ALL'  || l.userType === userType ||
      (userType === 'admin' && (l.role === 'admin' || l.role === 'super_admin'))
    const matchAction = actionCat === 'ALL' || cfg.cat === actionCat
    return matchSearch && matchUser && matchAction
  })

  const cfg = (action) => ACTION_CFG[action] || ACTION_CFG.OTHER

  if (!open) return null

  const sel = { height:34, padding:'0 8px', border:'1px solid var(--border2)', borderRadius:8, fontSize:11, fontFamily:'var(--font)', color:'var(--text)', background:'var(--bg2)', outline:'none', cursor:'pointer' }

  const Content = () => (
    <>
      {isMobile && <div style={{ width:40, height:4, borderRadius:2, background:'var(--border2)', margin:'12px auto 4px' }}/>}

      {/* Header */}
      <div style={{ padding:isMobile?'12px 16px 12px':'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <ClipboardList size={16} style={{ color:'var(--brand)' }}/>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>Journal d'audit</div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>{filtered.length} entrée{filtered.length>1?'s':''} sur {logs.length}</div>
          </div>
        </div>
        <button onClick={onClose} style={{ width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center', border:'none', borderRadius:8, background:'var(--bg2)', color:'var(--muted)', cursor:'pointer', minHeight:'auto' }}>
          <X size={15}/>
        </button>
      </div>

      {/* Recherche */}
      <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ position:'relative', marginBottom:8 }}>
          <Search size={12} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }}/>
          <input value={search} onChange={e => setSrch(e.target.value)} placeholder="Rechercher action, membre, montant…"
            style={{ width:'100%', height:34, paddingLeft:28, paddingRight:10, border:'1px solid var(--border2)', borderRadius:8, fontSize:12, fontFamily:'var(--font)', color:'var(--text)', background:'var(--bg2)', outline:'none', boxSizing:'border-box' }}/>
        </div>
        {/* Filtres */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <select value={userType} onChange={e => setUserType(e.target.value)} style={sel}>
            {USER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={actionCat} onChange={e => setActionCat(e.target.value)} style={sel}>
            {ACTION_CATS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Liste */}
      <div style={{ overflowY:'auto', flex:1, padding:'6px 0' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'var(--muted)', fontSize:14 }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:'40px 16px', textAlign:'center', color:'var(--muted)' }}>
            <ClipboardList size={32} style={{ opacity:.2, display:'block', margin:'0 auto 10px' }}/>
            <div style={{ fontSize:13, fontWeight:600 }}>Aucun résultat</div>
            <div style={{ fontSize:11, marginTop:4 }}>Modifiez vos filtres</div>
          </div>
        ) : filtered.map((l, i) => {
          const c = cfg(l.action)
          const who = l.benevoleNom || l.specNom || l.staff || '—'
          const typeLabel = { staff:'👤 Staff', admin:'🛡️ Admin', benevole:'🙋 Bénévole', spectateur:'👥 Spectateur' }
          return (
            <div key={l.id || i} style={{ display:'flex', gap:10, padding:'10px 14px', borderBottom:'1px solid var(--border)', alignItems:'flex-start' }}>
              <div style={{ width:34, height:34, borderRadius:9, background:c.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>
                {c.icon}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:2, flexWrap:'wrap' }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:8, background:c.bg, color:c.color }}>{c.label}</span>
                  {l.userType && (
                    <span style={{ fontSize:10, padding:'1px 6px', borderRadius:8, background:'var(--bg2)', color:'var(--muted)', fontWeight:600 }}>
                      {typeLabel[l.userType] || l.userType}
                    </span>
                  )}
                  {l.montant > 0 && (
                    <span style={{ fontSize:11, fontWeight:700, color:c.color }}>{(l.montant/100).toFixed(2)}€</span>
                  )}
                </div>
                <div style={{ fontSize:12, color:'var(--text)', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {l.label || '—'}
                </div>
                <div style={{ display:'flex', gap:8, fontSize:10, color:'var(--muted)', flexWrap:'wrap' }}>
                  {who !== '—' && <span>👤 {who}</span>}
                  <span>🕐 {fmtDate(l.timestamp || l.date)}</span>
                  {l.resaCode && <span style={{ fontFamily:'monospace' }}>#{l.resaCode}</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )

  if (isMobile) return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:210, background:'rgba(0,0,0,0.5)' }}>
      <div onClick={e=>e.stopPropagation()} style={{ position:'absolute', bottom:0, left:0, right:0, maxHeight:'92vh', background:'var(--bg)', borderRadius:'20px 20px 0 0', boxShadow:'0 -8px 40px rgba(0,0,0,.25)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <Content/>
      </div>
    </div>
  )

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:109, background:'rgba(0,0,0,0.3)' }}/>
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:440, maxWidth:'92vw', background:'var(--bg)', borderLeft:'1px solid var(--border)', boxShadow:'-8px 0 40px rgba(0,0,0,.15)', zIndex:110, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <Content/>
      </div>
    </>
  )
}
