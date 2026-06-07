/**
 * pages/admin/Staff.jsx — v6
 * Design unifié : ajout membre + rôles avec interface moderne
 */
import React, { useState, useEffect } from 'react'
import useAppStore   from '../../store/useAppStore'
import useAuthStore, { genUsername } from '../../store/useAuthStore'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import useEventStore from '../../store/useEventStore'
import { addAuditLog } from '../../firebase/service'
import { db } from '../../firebase/config'
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import Avatar       from '../../components/Avatar'
import {
  Trash2, KeyRound, ShieldCheck, Plus, Pencil,
  X, Save, User, Lock, Eye, EyeOff, MailQuestion, Check,
} from 'lucide-react'

// ── Pages assignables ──────────────────────────────────────────────
const ALL_PAGES = [
  { id:'credit',             label:'Créditer',             group:'Billetterie' },
  { id:'nouveau',            label:'Nouveau QR',            group:'Billetterie' },
  { id:'retrait',            label:'Retrait réservation',   group:'Stand' },
  { id:'debit',              label:'Encaisser',             group:'Stand' },
  { id:'reservations-admin', label:'Réservations',          group:'Commun' },
  { id:'transactions',       label:'Transactions',          group:'Commun' },
  { id:'menu',               label:'Carte & menu',          group:'Admin' },
  { id:'mon-profil',         label:'Mon profil',            group:'Commun' },
]

const ALL_PERMISSIONS = [
  { id:'credit',       label:'Créditer des comptes',   icon:'💳' },
  { id:'debit',        label:'Encaisser au stand',      icon:'🛒' },
  { id:'retrait',      label:'Valider les retraits',    icon:'📦' },
  { id:'reservations', label:'Gérer les réservations',  icon:'📋' },
  { id:'rapports',     label:'Voir les rapports',       icon:'📊' },
  { id:'menu',         label:'Modifier la carte',       icon:'🍽️' },
]

const ROLE_COLORS = [
  { hex:'#1a6b7a', name:'Teal'    },
  { hex:'#534AB7', name:'Violet'  },
  { hex:'#BA7517', name:'Ambre'   },
  { hex:'#0F6E56', name:'Vert'    },
  { hex:'#A32D2D', name:'Rouge'   },
  { hex:'#2563EB', name:'Bleu'    },
  { hex:'#7C3AED', name:'Pourpre' },
  { hex:'#D97706', name:'Orange'  },
  { hex:'#059669', name:'Émeraude'},
  { hex:'#6b6b6b', name:'Gris'    },
]

const MEMBER_COLORS = [
  { hex:'#1a6b7a', name:'Teal'   },
  { hex:'#534AB7', name:'Violet' },
  { hex:'#BA7517', name:'Ambre'  },
  { hex:'#0F6E56', name:'Vert'   },
  { hex:'#E11D48', name:'Rose'   },
  { hex:'#2563EB', name:'Bleu'   },
  { hex:'#7C3AED', name:'Pourpre'},
  { hex:'#6b6b6b', name:'Gris'   },
]

const DEFAULT_ROLES = {
  super_admin:  { nom:'Super Admin',  couleur:'#DC2626' },
  admin:        { nom:'Admin',        couleur:'#534AB7' },
  directeur_artistique: { nom:'Directeur artistique', couleur:'#0891b2' },
  billetterie:  { nom:'Billetterie',  couleur:'#0F6E56' },
  stand:        { nom:'Stand',        couleur:'#BA7517' },
  consultation: { nom:'Consultation', couleur:'#6b6b6b' },
}

// ── Composant badge aperçu ─────────────────────────────────────────
const RoleBadge = ({ nom, couleur }) => (
  <span style={{ fontSize:12, fontWeight:600, padding:'4px 14px', borderRadius:20, background:couleur+'22', color:couleur, border:`1px solid ${couleur}44` }}>
    {nom || 'Aperçu'}
  </span>
)

// ── Composant sélecteur de couleur ─────────────────────────────────
const ColorPicker = ({ colors, value, onChange, label='Couleur' }) => (
  <div style={{ marginBottom:14 }}>
    <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:8, fontWeight:500 }}>{label}</label>
    <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
      {colors.map(c => (
        <button key={c.hex} onClick={() => onChange(c.hex)} title={c.name}
          style={{ width:30, height:30, borderRadius:'50%', background:c.hex, border:value===c.hex?'3px solid var(--text)':'2px solid transparent', cursor:'pointer', transition:'border .12s, transform .12s', transform:value===c.hex?'scale(1.15)':'scale(1)', outline:'none' }}/>
      ))}
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          style={{ width:30, height:30, borderRadius:'50%', border:'2px solid var(--border2)', cursor:'pointer', padding:2, background:'none' }}/>
        <span style={{ fontSize:11, color:'var(--muted)' }}>Personnalisée</span>
      </div>
    </div>
  </div>
)

// ── Composant toggle case à cocher moderne ─────────────────────────
const CheckCard = ({ checked, onChange, label, sub, icon, color='var(--brand)' }) => (
  <label style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:9, border:`1px solid ${checked?color:' var(--border)'}`, background:checked?color+'11':'var(--bg2)', cursor:'pointer', marginBottom:6, transition:'all .12s' }}>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
      style={{ width:15, height:15, accentColor:color, cursor:'pointer', flexShrink:0 }}/>
    {icon && <span style={{ fontSize:16 }}>{icon}</span>}
    <div>
      <div style={{ fontSize:12, fontWeight:600, color:checked?color:'var(--text)' }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>{sub}</div>}
    </div>
  </label>
)

export default function Staff() {
  const { staff, updateStaffRole, addStaff, deleteStaff,
          roles, createRole, updateRole, deleteRole, updateStaffEvents } = useAppStore()
  const { events, currentEventId } = useEventStore()
  const { user, resetStaffPassword } = useAuthStore()
  const isSuperAdmin = user?.role === 'super_admin'
  const { isMobile } = useBreakpoint()

  // Admin simple → voit uniquement son événement
  // Super admin → voit tous les événements
  const visibleEvents = (events || []).filter(e => !e.deleted && (
    isSuperAdmin || e.id === currentEventId
  ))

  const [section, setSection]         = useState('equipe')
  const [resetState, setResetState]   = useState({})
  const [promotingId, setPromotingId] = useState(null)

  // ── Ajout/édition membre ──────────────────────────────────────────
  const [memberForm, setMemberForm] = useState(null) // null | { nom, email, role, couleur, _docId? }
  const [showPwd, setShowPwd]       = useState(false)
  const [savingMember, setSavingMember] = useState(false)

  // ── Rôles ──────────────────────────────────────────────────────────
  const [editingRole, setEditingRole] = useState(null)
  const [roleForm, setRoleForm]       = useState({ nom:'', couleur:ROLE_COLORS[0].hex, pages:[], permissions:{} })
  const [savingRole, setSavingRole]   = useState(false)

  // ── Demandes de réinitialisation de mot de passe ───────────────────
  const [pwdRequests, setPwdRequests] = useState([])
  const [resolvingRequest, setResolvingRequest] = useState(null) // { id, identifier, ... }
  const [newPwdValue, setNewPwdValue] = useState('')
  useEffect(() => {
    if (!isSuperAdmin && user?.role !== 'admin') return
    const q = query(collection(db, 'password-reset-requests'), where('status', '==', 'pending'))
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setPwdRequests(list)
    }, () => setPwdRequests([]))
    return () => unsub()
  }, [isSuperAdmin, user?.role])

  const allRoles = [
    ...Object.entries(DEFAULT_ROLES).map(([id, r]) => ({ id, ...r, builtin:true })),
    ...(roles||[]).map(r => ({ ...r, builtin:false })),
  ]
  const roleInfo = (id) => allRoles.find(r => r.id === id) || { nom:id, couleur:'#888' }

  // ── Handlers membre ───────────────────────────────────────────────
  const openNewMember = () => setMemberForm({ nom:'', username:'', role:'stand', couleur:'#1a6b7a', pwd:'', eventIds:[] })
  const openEditMember = (s) => setMemberForm({ ...s, email: undefined, pwd:'', username: s.username || genUsername(s.nom), eventIds: s.eventIds || [] })

  const saveMember = async () => {
    if (!memberForm.nom.trim()) { alert('Le nom est requis'); return }
    if (!memberForm.username?.trim() && !memberForm.nom.trim()) { alert('Le nom est requis'); return }
    setSavingMember(true)
    try {
      const docId = memberForm._docId || memberForm.id
      // Calculer forcedEventIds une seule fois pour les deux branches
      const forcedEventIds = isSuperAdmin
        ? (memberForm.eventIds || [])
        : [currentEventId].filter(Boolean)

      if (docId) {
        // Mise à jour complète du membre
        const autoUsername = memberForm.username?.trim() || genUsername(memberForm.nom)
        const { updateDoc: ud, doc: dc } = await import('firebase/firestore')
        const { db: fdb } = await import('../../firebase/config')
        const staffRef = currentEventId
          ? dc(fdb, 'events', currentEventId, 'staff', docId)
          : dc(fdb, 'staff', docId)
        await ud(staffRef, {
          nom:      memberForm.nom.trim(),
          username: autoUsername.toLowerCase(),
          role:     memberForm.role,
          couleur:  memberForm.couleur,
          eventIds: forcedEventIds,
          eventId:  forcedEventIds[0] || null,
        })
        if (memberForm.pwd?.length >= 6) await resetStaffPassword(docId, memberForm.pwd, currentEventId)
        await addAuditLog('MODIF_STAFF', { staffId: docId, staffNom: memberForm.nom.trim(), role: memberForm.role, userType: 'admin', label: `Modification staff : ${memberForm.nom.trim()}` })
      } else {
        const autoUsername = memberForm.username?.trim() || genUsername(memberForm.nom)
        await addStaff({
          nom:      memberForm.nom.trim(),
          username: autoUsername.toLowerCase(),
          role:     memberForm.role,
          couleur:  memberForm.couleur,
          avatar:   null,
          eventIds: forcedEventIds,
          eventId:  forcedEventIds[0] || currentEventId || null,
          password: memberForm.pwd?.length >= 6 ? memberForm.pwd : null,
        })
        await addAuditLog('CREATION_STAFF', { staffNom: memberForm.nom.trim(), role: memberForm.role, username: autoUsername, userType: 'admin', label: `Création staff : ${memberForm.nom.trim()} (${memberForm.role})` })
      }
      setMemberForm(null)
    } catch (e) { alert('Erreur : ' + e.message) }
    finally { setSavingMember(false) }
  }

  const handleDelete = async (s) => {
    if (!window.confirm(`Supprimer ${s.nom} du staff ?`)) return
    if (s.id === user?.id) { alert('Impossible de se supprimer soi-même.'); return }
    await addAuditLog('SUPPRESSION_STAFF', { staffId: s.id, staffNom: s.nom, role: s.role, userType: 'admin', label: `Suppression staff : ${s.nom}` })
    await deleteStaff(s.id)
  }

  const handleResetPwd = async (s) => {
    const pwd = prompt(`Nouveau mot de passe pour ${s.nom} (min. 6 caractères) :`)
    if (!pwd || pwd.length < 6) { alert('Mot de passe trop court'); return }
    const ok = await resetStaffPassword(s.id, pwd)
    setResetState(p => ({ ...p, [s.id]: ok ? 'success' : 'error' }))
    setTimeout(() => setResetState(p => { const n={...p}; delete n[s.id]; return n }), 2500)
  }

  const handlePromote = async (s) => {
    if (!window.confirm(`Promouvoir ${s.nom} en super admin ?`)) return
    setPromotingId(s.id)
    try { await updateStaffRole(s.id, 'admin') }
    finally { setPromotingId(null) }
  }

  // ── Handlers rôle ─────────────────────────────────────────────────
  const openNewRole = () => {
    setRoleForm({ nom:'', couleur:ROLE_COLORS[0].hex, pages:['mon-profil'], permissions:{} })
    setEditingRole('new')
  }
  const openEditRole = (r) => {
    setRoleForm({ nom:r.nom, couleur:r.couleur, pages:r.pages||[], permissions:r.permissions||{} })
    setEditingRole(r.id)
  }

  const saveRole = async () => {
    if (!roleForm.nom.trim()) { alert('Nom requis'); return }
    setSavingRole(true)
    const data = {
      nom:         roleForm.nom.trim(),
      couleur:     roleForm.couleur,
      pages:       [...new Set([...roleForm.pages, 'mon-profil'])],
      permissions: roleForm.permissions,
    }
    try {
      if (editingRole === 'new') {
        const id = roleForm.nom.trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')
        await createRole({ ...data, id })
      } else {
        await updateRole(editingRole, data)
      }
      setEditingRole(null)
    } catch (e) { alert('Erreur : ' + e.message) }
    finally { setSavingRole(false) }
  }

  const handleDeleteRole = async (r) => {
    if (staff.some(s => s.role === r.id)) { alert(`Des membres utilisent encore le rôle "${r.nom}".`); return }
    if (!window.confirm(`Supprimer le rôle "${r.nom}" ?`)) return
    await deleteRole(r.id)
  }

  // ── Styles réutilisables ──────────────────────────────────────────
  const card  = { background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-lg)', padding: isMobile ? '14px' : '16px 18px', marginBottom:12 }
  const inp   = { width:'100%', padding:'10px 12px', border:'0.5px solid var(--border2)', borderRadius:9, fontSize:13, background:'var(--bg2)', color:'var(--text)', fontFamily:'var(--font)', outline:'none', transition:'border-color .15s' }
  const tabBtn = (s) => ({ padding:'7px 18px', border:'none', borderRadius:8, cursor:'pointer', fontFamily:'var(--font)', fontSize:13, fontWeight:section===s?600:400, background:section===s?'var(--brand)':'var(--bg2)', color:section===s?'#fff':'var(--muted)' })
  const actionBtn = (variant='default') => ({
    display:'inline-flex', alignItems:'center', gap:6, padding:'8px 14px',
    border: variant==='primary'?'none': variant==='danger'?'0.5px solid #F09595':'0.5px solid var(--border2)',
    borderRadius:8, fontSize:13, cursor:'pointer', fontFamily:'var(--font)',
    background: variant==='primary'?'var(--brand)': variant==='danger'?'var(--red-light)':'var(--bg2)',
    color: variant==='primary'?'#fff': variant==='danger'?'var(--red)':'var(--text)',
  })

  const pageGroups = [...new Set(ALL_PAGES.map(p => p.group))]

  // Résoudre une demande : choisir un nouveau mdp et l'appliquer
  const handleResolveRequest = async () => {
    if (!resolvingRequest || newPwdValue.length < 6) return
    const r = resolvingRequest
    if (r.staffId) {
      const ok = await resetStaffPassword(r.staffId, newPwdValue, r.eventId || null)
      if (!ok) { alert("La réinitialisation a échoué (compte introuvable)."); return }
    }
    // Marque la demande comme résolue
    try {
      await updateDoc(doc(db, 'password-reset-requests', r.id), {
        status: 'resolved',
        resolvedBy: user?.nom || 'admin',
        resolvedAt: new Date(),
        newPassword: newPwdValue, // L'admin doit communiquer ce mdp à l'utilisateur
      })
    } catch {}
    setResolvingRequest(null)
    setNewPwdValue('')
  }
  const handleDismissRequest = async (req) => {
    try {
      await updateDoc(doc(db, 'password-reset-requests', req.id), {
        status: 'dismissed',
        resolvedBy: user?.nom || 'admin',
        resolvedAt: new Date(),
      })
    } catch {}
  }

  return (
    <div>
      {/* Panneau demandes de réinitialisation */}
      {pwdRequests.length > 0 && (
        <div style={{ background:'var(--gold-light)', border:'1px solid var(--gold)', borderRadius:'var(--radius-lg)', padding:14, marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, color:'var(--gold-dark)' }}>
            <MailQuestion size={18}/>
            <div style={{ fontSize:14, fontWeight:700 }}>
              {pwdRequests.length} demande{pwdRequests.length > 1 ? 's' : ''} de réinitialisation en attente
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {pwdRequests.map(r => {
              const dateStr = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : ''
              return (
                <div key={r.id} style={{ background:'var(--bg)', borderRadius:'var(--radius)', padding:'10px 12px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', minHeight:60 }}>
                  <div style={{ flex:'1 1 200px', minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{r.staffNom || r.identifier}</span>
                      {r.staffRole && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:4, background:'var(--bg2)', color:'var(--muted)', fontWeight:600, flexShrink:0 }}>{r.staffRole}</span>}
                    </div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {r.staffId ? `Compte trouvé · ${r.identifier}` : `⚠ Aucun compte trouvé pour « ${r.identifier} »`}
                      {dateStr && ' · ' + dateStr}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6, flexShrink:0, flexWrap:'wrap' }}>
                    {r.staffId && (
                      <button onClick={() => { setResolvingRequest(r); setNewPwdValue('') }} className="btn-primary" style={{ minHeight:40, padding:'0 14px', fontSize:13 }}>
                        Réinitialiser
                      </button>
                    )}
                    <button onClick={() => handleDismissRequest(r)} className="btn-secondary" style={{ minHeight:40, padding:'0 12px', fontSize:13 }}>
                      Ignorer
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modale résolution demande */}
      {resolvingRequest && (
        <div onClick={() => setResolvingRequest(null)}
          style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{
              background:'var(--bg)', borderRadius:'var(--radius-xl) var(--radius-xl) 0 0',
              padding:'10px 20px max(env(safe-area-inset-bottom), 20px)',
              width:'100%', maxWidth:420,
              border:'1px solid var(--border)', borderBottom:'none',
              boxShadow:'0 -8px 32px rgba(0,0,0,0.20)',
              animation:'ycSlideUp .22s cubic-bezier(.2,.8,.2,1)',
            }}>
            <div style={{ width:36, height:4, borderRadius:2, background:'var(--border2)', margin:'0 auto 14px' }}/>

            <div style={{ fontSize:16, fontWeight:700, color:'var(--text)', marginBottom:4 }}>Réinitialiser le mot de passe</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:14 }}>
              de <strong style={{ color:'var(--text)' }}>{resolvingRequest.staffNom || resolvingRequest.identifier}</strong>
            </div>
            <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:5 }}>
              Nouveau mot de passe
            </label>
            <input type="text" value={newPwdValue} onChange={e => setNewPwdValue(e.target.value)} autoFocus
              placeholder="Minimum 6 caractères"
              style={{ width:'100%', boxSizing:'border-box', minHeight:44, padding:'0 14px', border:'1.5px solid var(--border2)', borderRadius:8, fontSize:15, color:'var(--text)', background:'var(--bg2)', fontFamily:'var(--font)', outline:'none', marginBottom:8 }}/>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:14, lineHeight:1.5 }}>
              Communiquez ce mot de passe à l'utilisateur de manière sécurisée. Il pourra le changer lui-même dans son profil.
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setResolvingRequest(null)} className="btn-secondary" style={{ flex:1, minHeight:44 }}>Annuler</button>
              <button onClick={handleResolveRequest} disabled={newPwdValue.length < 6} className="btn-primary" style={{ flex:1, minHeight:44 }}>
                <Check size={14}/> Appliquer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        <button onClick={() => setSection('equipe')} style={tabBtn('equipe')}>Équipe</button>
        <button onClick={() => setSection('roles')}  style={tabBtn('roles')}>Rôles & permissions</button>
      </div>

      {/* ══════════════════════════════════════════════════════
          SECTION ÉQUIPE
      ══════════════════════════════════════════════════════ */}
      {section === 'equipe' && (
        <>
          {/* Formulaire membre */}
          {memberForm ? (
            <div style={{ ...(isMobile ? { position:'fixed', inset:0, zIndex:200, overflowY:'auto', background:'var(--bg)', padding:16 } : { ...card, border:'1px solid var(--brand)', marginBottom:16 }) }}>
              <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:18, display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:9, background:memberForm.couleur||'var(--brand)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <User size={18} color="#fff"/>
                </div>
                {memberForm._docId || memberForm.id ? 'Modifier un membre' : 'Nouveau membre du staff'}
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:12, marginBottom:14 }}>
                {/* Nom */}
                <div>
                  <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:5, fontWeight:500 }}>Nom complet</label>
                  <div style={{ position:'relative' }}>
                    <User size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }}/>
                    <input value={memberForm.nom} onChange={e => setMemberForm(f => ({...f, nom:e.target.value}))}
                      placeholder="Prénom Nom" style={{ ...inp, paddingLeft:32 }}/>
                  </div>
                </div>

              </div>

              {/* Nom d'utilisateur */}
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:5, fontWeight:500 }}>
                  Nom d'utilisateur <span style={{ color:'var(--brand)', fontSize:11 }}>(utilisé pour se connecter)</span>
                </label>
                <div style={{ display:'flex', gap:8 }}>
                  <input
                    value={memberForm.username || ''}
                    onChange={e => setMemberForm(f => ({...f, username: e.target.value.toLowerCase().replace(/\s/g,'')}))}
                    placeholder={genUsername(memberForm.nom) || 'ex: sbabou'}
                    autoCapitalize="none"
                    style={{ ...inp, flex:1 }}
                  />
                  <button type="button"
                    onClick={() => setMemberForm(f => ({...f, username: genUsername(f.nom)}))}
                    style={{ padding:'0 14px', border:'0.5px solid var(--border2)', borderRadius:8, background:'var(--bg2)', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:'var(--font)', whiteSpace:'nowrap', flexShrink:0 }}>
                    Générer
                  </button>
                </div>
                {memberForm.nom && !memberForm.username && (
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:3 }}>
                    Suggestion : <strong>{genUsername(memberForm.nom)}</strong> — cliquez "Générer" pour l'appliquer
                  </div>
                )}
              </div>

              {/* Rôle — liste déroulante moderne */}
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:5, fontWeight:500 }}>Rôle</label>
                <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(auto-fill,minmax(140px,1fr))', gap:8 }}>
                  {allRoles.filter(r => (isSuperAdmin || r.id !== 'admin') && (isSuperAdmin || r.id !== 'super_admin')).map(r => (
                    <button key={r.id} onClick={() => setMemberForm(f => ({...f, role:r.id}))}
                      style={{ padding:'10px 12px', borderRadius:9, border:`1.5px solid ${memberForm.role===r.id?r.couleur:'var(--border)'}`, background:memberForm.role===r.id?r.couleur+'18':'var(--bg2)', cursor:'pointer', textAlign:'left', transition:'all .12s', fontFamily:'var(--font)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:10, height:10, borderRadius:'50%', background:r.couleur, flexShrink:0 }}/>
                        <span style={{ fontSize:13, fontWeight:memberForm.role===r.id?700:400, color:memberForm.role===r.id?r.couleur:'var(--text)' }}>{r.nom}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Couleur avatar */}
              <ColorPicker colors={MEMBER_COLORS} value={memberForm.couleur||'#1a6b7a'} onChange={c => setMemberForm(f => ({...f, couleur:c}))} label="Couleur de l'avatar"/>

              {/* Mot de passe */}
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:5, fontWeight:500 }}>
                  Mot de passe {memberForm._docId || memberForm.id ? '(laisser vide pour ne pas modifier)' : ''}
                </label>
                <div style={{ position:'relative' }}>
                  <Lock size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }}/>
                  <input type={showPwd?'text':'password'} value={memberForm.pwd||''}
                    onChange={e => setMemberForm(f => ({...f, pwd:e.target.value}))}
                    placeholder="minimum 6 caractères" style={{ ...inp, paddingLeft:32, paddingRight:36 }}/>
                  <button onClick={() => setShowPwd(v=>!v)} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--muted)', display:'flex' }}>
                    {showPwd?<EyeOff size={14}/>:<Eye size={14}/>}
                  </button>
                </div>
              </div>

              {/* Événements accessibles */}
              {visibleEvents.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <label style={{ fontSize:12, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:8 }}>
                    Événements accessibles
                  </label>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {visibleEvents.map(ev => {
                      const checked = (memberForm.eventIds||[]).includes(ev.id)
                      const c = ev.couleur || '#1a6b7a'
                      return (
                        <label key={ev.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:9, border:`1px solid ${checked?c:'var(--border)'}`, background:checked?c+'11':'var(--bg2)', cursor:'pointer', transition:'all .12s' }}>
                          <input type="checkbox" checked={checked}
                            onChange={e => setMemberForm(f => ({
                              ...f,
                              eventIds: e.target.checked
                                ? [...(f.eventIds||[]), ev.id]
                                : (f.eventIds||[]).filter(id => id !== ev.id)
                            }))}
                            style={{ width:15, height:15, accentColor:c, cursor:'pointer', flexShrink:0 }}/>
                          {ev.logoSrc
                            ? <img src={ev.logoSrc} alt={ev.nom} style={{ width:18, height:18, borderRadius:4, objectFit:'cover' }}/>
                            : <span style={{ fontSize:14 }}>{ev.emoji || '🎵'}</span>
                          }
                          <span style={{ fontSize:13, fontWeight:checked?700:400, color:checked?c:'var(--text)' }}>{ev.nom}</span>
                        </label>
                      )
                    })}
                  </div>
                  {(memberForm.eventIds||[]).length === 0 && (
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:6 }}>
                      Aucun événement sélectionné — le membre n'aura accès à aucune donnée.
                    </div>
                  )}
                </div>
              )}

              {/* Aperçu */}
              <div style={{ padding:'10px 14px', background:'var(--bg2)', borderRadius:9, marginBottom:14, display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:memberForm.couleur||'var(--brand)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#fff', flexShrink:0 }}>
                  {(memberForm.nom||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{memberForm.nom||'Nom du membre'}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>{memberForm.email||'email@festival.fr'}</div>
                </div>
                <RoleBadge nom={roleInfo(memberForm.role).nom} couleur={roleInfo(memberForm.role).couleur}/>
              </div>

              <div style={{ display:'flex', gap:8, ...(isMobile ? { position:'sticky', bottom:0, background:'var(--bg)', paddingTop:12, paddingBottom:8, borderTop:'1px solid var(--border)' } : {}) }}>
                <button onClick={saveMember} disabled={savingMember} style={{ ...actionBtn('primary'), flex:1, justifyContent:'center', minHeight:46 }}>
                  <Save size={14}/> {savingMember ? 'Sauvegarde…' : memberForm._docId||memberForm.id ? 'Enregistrer' : 'Créer le membre'}
                </button>
                <button onClick={() => setMemberForm(null)} style={{ ...actionBtn(), minHeight:46, padding:'0 20px' }}>
                  <X size={14}/> Annuler
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
              <button onClick={openNewMember} style={actionBtn('primary')}>
                <Plus size={14}/> Ajouter un membre
              </button>
            </div>
          )}

          {/* Liste membres */}
          <div style={card}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:12 }}>
              {staff.length} membre{staff.length>1?'s':''} dans l'équipe
            </div>
            {staff.filter(s => isSuperAdmin || s.role !== 'super_admin').map(s => {
              const ri  = roleInfo(s.role)
              const rs  = resetState[s.id]
              const isMe = s.id === user?.id
              return (
                <div key={s.id} style={{ padding:'12px 0', borderBottom:'0.5px solid var(--border)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    {/* Avatar */}
                    <div style={{ width:42, height:42, borderRadius:'50%', background:s.couleur||ri.couleur||'var(--brand)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#fff', flexShrink:0, overflow:'hidden' }}>
                      {s.avatar ? <img src={s.avatar} alt={s.nom} style={{width:'100%',height:'100%',objectFit:'cover'}}/> : (s.nom||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                    </div>

                    {/* Infos */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                        {s.nom}
                        {isMe && <span style={{ fontSize:9, background:'var(--brand-light)', color:'var(--brand-dark)', borderRadius:10, padding:'1px 6px', fontWeight:700 }}>Vous</span>}
                      </div>
                      <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>{s.username ? `@${s.username}` : '—'}</div>
                      <RoleBadge nom={ri.nom||s.role} couleur={ri.couleur}/>
                      {(s.eventIds||[]).length > 0 && (
                        <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:6 }}>
                          {(s.eventIds||[]).slice(0,3).map(eid => {
                            const ev = visibleEvents.find(e => e.id === eid)
                            if (!ev) return null
                            return <span key={eid} style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:(ev.couleur||'#1a6b7a')+'22', color:ev.couleur||'#1a6b7a', fontWeight:700, display:'inline-flex', alignItems:'center', gap:4 }}>
                              {ev.logoSrc ? <img src={ev.logoSrc} alt="" style={{ width:12, height:12, borderRadius:2, objectFit:'cover' }}/> : ev.emoji} {ev.nom}
                            </span>
                          })}
                          {(s.eventIds||[]).length > 3 && <span style={{ fontSize:10, color:'var(--muted)' }}>+{(s.eventIds||[]).length-3}</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions — toujours visibles, bien espacées */}
                  <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                    <button onClick={() => openEditMember(s)}
                      style={{ ...actionBtn(), padding:'7px 14px', fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
                      <Pencil size={13}/> Modifier
                    </button>
                    <button onClick={() => handleResetPwd(s)}
                      style={{ ...actionBtn(), padding:'7px 14px', fontSize:12, display:'flex', alignItems:'center', gap:6, color:rs==='success'?'var(--brand-dark)':rs==='error'?'var(--red)':'var(--text)' }}>
                      <KeyRound size={13}/> {rs==='success'?'Changé ✓':rs==='error'?'Erreur !':'Mot de passe'}
                    </button>
                    {s.role !== 'admin' && s.role !== 'super_admin' && isSuperAdmin && (
                      <button onClick={() => handlePromote(s)} disabled={promotingId===s.id}
                        style={{ ...actionBtn(), padding:'7px 14px', fontSize:12, display:'flex', alignItems:'center', gap:6, borderColor:'#AFA9EC', color:'var(--purple)' }}>
                        <ShieldCheck size={13}/> Promouvoir
                      </button>
                    )}
                    {!isMe && (
                      <button onClick={() => handleDelete(s)}
                        style={{ ...actionBtn('danger'), padding:'7px 14px', fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
                        <Trash2 size={13}/> Supprimer
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════
          SECTION RÔLES
      ══════════════════════════════════════════════════════ */}
      {section === 'roles' && (
        <>
          {/* Rôles intégrés */}
          <div style={card}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:10 }}>Rôles intégrés</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:8 }}>
              {Object.entries(DEFAULT_ROLES).map(([id, r]) => (
                <div key={id} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', background:'var(--bg2)', borderRadius:9, border:'0.5px solid var(--border)' }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:r.couleur, flexShrink:0 }}/>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{r.nom}</div>
                    <div style={{ fontSize:10, color:'var(--muted)', fontFamily:'monospace' }}>{id}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Formulaire rôle */}
          {editingRole !== null ? (
            <div style={{ ...card, border:'1px solid var(--brand)', marginBottom:16 }}>
              <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:18 }}>
                {editingRole==='new' ? 'Créer un rôle personnalisé' : 'Modifier le rôle'}
              </div>

              {/* Nom */}
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:5, fontWeight:500 }}>Nom du rôle</label>
                <input value={roleForm.nom} onChange={e => setRoleForm(f=>({...f,nom:e.target.value}))}
                  placeholder="ex : Sécurité, Photographe…" style={inp}/>
              </div>

              {/* Couleur */}
              <ColorPicker colors={ROLE_COLORS} value={roleForm.couleur} onChange={c => setRoleForm(f=>({...f,couleur:c}))} label="Couleur du badge"/>

              {/* Pages */}
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:8, fontWeight:500 }}>Pages accessibles</label>
                {pageGroups.map(group => (
                  <div key={group} style={{ marginBottom:10 }}>
                    <div style={{ fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>{group}</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                      {ALL_PAGES.filter(p => p.group===group).map(p => (
                        <CheckCard key={p.id} checked={roleForm.pages.includes(p.id)}
                          onChange={v => setRoleForm(f => ({...f, pages:v?[...f.pages,p.id]:f.pages.filter(x=>x!==p.id)}))}
                          label={p.label} color={roleForm.couleur}/>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Permissions */}
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:8, fontWeight:500 }}>Permissions</label>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                  {ALL_PERMISSIONS.map(p => (
                    <CheckCard key={p.id} checked={!!roleForm.permissions[p.id]}
                      onChange={v => setRoleForm(f=>({...f,permissions:{...f.permissions,[p.id]:v}}))}
                      label={p.label} icon={p.icon} color='#BA7517'/>
                  ))}
                </div>
              </div>

              {/* Aperçu */}
              <div style={{ padding:'12px 14px', background:'var(--bg2)', borderRadius:9, marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:12, color:'var(--muted)' }}>Aperçu :</span>
                <RoleBadge nom={roleForm.nom||'Nom du rôle'} couleur={roleForm.couleur}/>
                <span style={{ fontSize:11, color:'var(--muted)' }}>{roleForm.pages.length} page{roleForm.pages.length>1?'s':''} · {Object.values(roleForm.permissions).filter(Boolean).length} permission{Object.values(roleForm.permissions).filter(Boolean).length>1?'s':''}</span>
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button onClick={saveRole} disabled={savingRole} style={actionBtn('primary')}>
                  <Save size={13}/> {savingRole?'Sauvegarde…':editingRole==='new'?'Créer le rôle':'Enregistrer'}
                </button>
                <button onClick={() => setEditingRole(null)} style={actionBtn()}>
                  <X size={13}/> Annuler
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
              <button onClick={openNewRole} style={actionBtn('primary')}>
                <Plus size={14}/> Nouveau rôle
              </button>
            </div>
          )}

          {/* Liste rôles personnalisés */}
          {(roles||[]).length === 0 && editingRole === null && (
            <div style={{ padding:'24px 16px', textAlign:'center', color:'var(--muted)', fontSize:13, background:'var(--bg2)', borderRadius:10 }}>
              Aucun rôle personnalisé. Cliquez sur "Nouveau rôle" pour en créer un.
            </div>
          )}
          {(roles||[]).map(role => (
            <div key={role.id} style={card}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:38, height:38, borderRadius:9, background:role.couleur+'22', border:`1px solid ${role.couleur}44`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <div style={{ width:14, height:14, borderRadius:'50%', background:role.couleur }}/>
                  </div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', display:'flex', alignItems:'center', gap:8 }}>
                      {role.nom}
                      <RoleBadge nom={role.nom} couleur={role.couleur}/>
                    </div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                      {(role.pages||[]).length} pages · {staff.filter(s=>s.role===role.id).length} membre(s)
                    </div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => openEditRole(role)} style={{ ...actionBtn(), padding:'6px 10px' }}>
                    <Pencil size={12}/> Modifier
                  </button>
                  <button onClick={() => handleDeleteRole(role)} style={{ ...actionBtn('danger'), padding:'6px 10px' }}>
                    <Trash2 size={12}/>
                  </button>
                </div>
              </div>
              {role.pages?.length > 0 && (
                <div style={{ marginTop:10, display:'flex', gap:5, flexWrap:'wrap' }}>
                  {role.pages.map(p => (
                    <span key={p} style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:'var(--bg2)', color:'var(--muted)', border:'0.5px solid var(--border)' }}>
                      {ALL_PAGES.find(x=>x.id===p)?.label||p}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
