/**
 * pages/admin/Staff.jsx — v7
 * Équipe (membres, mots de passe, événements accessibles) + rôles personnalisés
 * Design system : composants ui/ + staff/staff.module.css
 */
import React, { useState, useEffect, useRef } from 'react'
import clsx from 'clsx'
import useAppStore   from '../../store/useAppStore'
import useAuthStore, { genUsername } from '../../store/useAuthStore'
import useEventStore from '../../store/useEventStore'
import { addAuditLog } from '../../firebase/service'
import { friendlyError } from '../../utils/errors'
import { db } from '../../firebase/config'
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import {
  Trash2, KeyRound, ShieldCheck, Plus, Pencil,
  X, Save, Lock, Eye, EyeOff, MailQuestion, Check, Tags, ChevronRight, SearchX,
} from 'lucide-react'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { Button, Card, Badge, Tabs, Empty, Dialog, Sheet, PasswordStrength, Field, focusFirstInvalid, toast } from '../../ui'
import DetailSheet from '../../components/DetailSheet'
import s from './staff/staff.module.css'

import { cleanEmail, emailOk } from '../../utils/msAccount'

// ── Pages assignables ──────────────────────────────────────────────
const ALL_PAGES = [
  { id:'credit',             label:'Créditer',             group:'Billetterie' },
  { id:'commande-sur-place', label:'Commande sur place',    group:'Billetterie' },
  { id:'nouveau',            label:'Compte pour un billet', group:'Billetterie' },
  { id:'lien-perdu',         label:'Lien perdu',            group:'Billetterie' },
  { id:'bracelets',          label:'Bracelets',             group:'Billetterie' },
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

// Palettes proposées (couleurs DATA enregistrées dans Firestore)
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
  // 23/11/2026 (refonte des rôles validée) : nouveau rôle, écran « Entrée » seulement
  controle_entree: { nom:'Contrôle entrée', couleur:'#5B6CF0' },
  consultation: { nom:'Consultation', couleur:'#6b6b6b' },
}
// Rôles retirés : plus proposés ; les fiches qui les portent sont désactivées (connexion refusée)
const ROLES_RETIRES = { stand: 'Stand' }
const estDesactive = (m) => !m.role || !!ROLES_RETIRES[m.role]

const initials = (nom) => (nom || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

// 20/11/2026 — recherche de l'équipe sur téléphone : sans majuscules ni accents
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// ── Badge de rôle (couleur DATA via --c) ───────────────────────────
const RoleBadge = ({ nom, couleur }) => (
  <span className={s.roleBadge} style={{ '--c': couleur }}>{nom || 'Aperçu'}</span>
)

// ── Sélecteur de couleur ───────────────────────────────────────────
const ColorPicker = ({ colors, value, onChange, label = 'Couleur' }) => (
  <div className={s.field}>
    <span className={s.label}>{label}</span>
    <div className={s.swatches}>
      {colors.map(c => (
        <button key={c.hex} type="button" onClick={() => onChange(c.hex)} title={c.name} aria-label={c.name}
          aria-pressed={value === c.hex}
          className={clsx(s.swatch, value === c.hex && s.swatchOn)} style={{ '--c': c.hex }}/>
      ))}
      <label className={s.custom}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)}/>
        Personnalisée
      </label>
    </div>
  </div>
)

// ── Case à cocher en carte ─────────────────────────────────────────
const CheckCard = ({ checked, onChange, label, sub, icon, color = 'var(--brand)' }) => (
  <label className={clsx(s.check, checked && s.checkOn)} style={{ '--c': color }}>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}/>
    {icon && <span className={s.checkIcon}>{icon}</span>}
    <div className={s.checkText}>
      {label}
      {sub && <div className={s.checkSub}>{sub}</div>}
    </div>
  </label>
)

export default function Staff() {
  const { staff, updateStaffRole, addStaff, deleteStaff,
          roles, createRole, updateRole, deleteRole, updateStaffEvents } = useAppStore()
  const { events, currentEventId } = useEventStore()
  const { user, resetStaffPassword } = useAuthStore()
  const isSuperAdmin = user?.role === 'super_admin'

  // Admin simple → voit uniquement son événement
  // Super admin → voit tous les événements
  const visibleEvents = (events || []).filter(e => !e.deleted && (
    isSuperAdmin || e.id === currentEventId
  ))

  const [section, setSection]         = useState('equipe')
  const [resetState, setResetState]   = useState({})
  const [promotingId, setPromotingId] = useState(null)

  // 20/11/2026 — téléphone (moins de 641 px) : une ligne par membre, recherche, feuille d'actions
  const { isMobile } = useBreakpoint()
  const [memberQuery, setMemberQuery] = useState('')
  const [sheetId, setSheetId]         = useState(null) // id du membre dont la feuille d'actions est ouverte

  // ── Ajout/édition membre ──────────────────────────────────────────
  const [memberForm, setMemberForm] = useState(null) // null | { nom, email, role, couleur, _docId? }
  const [showPwd, setShowPwd]       = useState(false)
  const [savingMember, setSavingMember] = useState(false)
  const [memberTried, setMemberTried]   = useState(false)
  const memberFormRef = useRef(null)

  // ── Rôles ──────────────────────────────────────────────────────────
  const [editingRole, setEditingRole] = useState(null)
  const [roleForm, setRoleForm]       = useState({ nom:'', couleur:ROLE_COLORS[0].hex, pages:[], permissions:{} })
  const [savingRole, setSavingRole]   = useState(false)
  const [roleTried, setRoleTried]     = useState(false)
  const roleFormRef = useRef(null)

  // ── Confirmations et saisie du nouveau mot de passe (remplacent confirm/prompt) ──
  const [pending, setPending]     = useState(null) // { title, message, label, run }
  const [confirming, setConfirming] = useState(false)
  const [pwdTarget, setPwdTarget] = useState(null) // membre dont on change le mot de passe
  const [pwdValue, setPwdValue]   = useState('')
  const [pwdTried, setPwdTried]   = useState(false)
  const pwdFormRef = useRef(null)

  // ── Demandes de réinitialisation de mot de passe ───────────────────
  const [pwdRequests, setPwdRequests] = useState([])
  const [resolvingRequest, setResolvingRequest] = useState(null) // { id, identifier, ... }
  const [reqDetailId, setReqDetailId] = useState(null) // demande ouverte en détail (23/11/2026)
  const [newPwdValue, setNewPwdValue] = useState('')
  const [reqTried, setReqTried] = useState(false)
  const reqFormRef = useRef(null)
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
  const roleInfo = (id) => allRoles.find(r => r.id === id) || (ROLES_RETIRES[id] ? { nom: ROLES_RETIRES[id], couleur:'#888' } : { nom:id || 'Aucun rôle', couleur:'#888' })

  // ── Handlers membre ───────────────────────────────────────────────
  // Aucun rôle choisi d'avance (23/11/2026) : l'admin doit en choisir un
  const openNewMember = () => { setMemberTried(false); setMemberForm({ nom:'', username:'', email:'', role:'', couleur:'#1a6b7a', pwd:'', eventIds:[] }) }
  const openEditMember = (s) => { setMemberTried(false); setMemberForm({ ...s, email: s.email || '', pwd:'', username: s.username || genUsername(s.nom), eventIds: s.eventIds || [] }) }

  const saveMember = async () => {
    if (!memberForm.nom.trim() || !emailOk(memberForm.email) || !memberForm.role || ROLES_RETIRES[memberForm.role]) { setMemberTried(true); focusFirstInvalid(memberFormRef.current); return }
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
          email:    cleanEmail(memberForm.email),
          role:     memberForm.role,
          couleur:  memberForm.couleur,
          eventIds: forcedEventIds,
          eventId:  forcedEventIds[0] || null,
        })
        if (memberForm.pwd?.length >= 6) await resetStaffPassword(docId, memberForm.pwd, currentEventId)
        await addAuditLog('MODIF_STAFF', { staffId: docId, staffNom: memberForm.nom.trim(), role: memberForm.role, userType: 'admin', label: `Modification staff : ${memberForm.nom.trim()}` })
      } else {
        const autoUsername = memberForm.username?.trim() || genUsername(memberForm.nom)
        const created = await addStaff({
          nom:      memberForm.nom.trim(),
          username: autoUsername.toLowerCase(),
          email:    cleanEmail(memberForm.email),
          role:     memberForm.role,
          couleur:  memberForm.couleur,
          avatar:   null,
          eventIds: forcedEventIds,
          eventId:  forcedEventIds[0] || currentEventId || null,
        })
        // Le mot de passe est enregistré par le serveur, en empreinte (jamais en clair dans la base)
        // 23/11/2026 : le membre est créé dans l'événement courant ; son mot de passe y est cherché
        // (avant, seul le dossier racine était essayé : le mot de passe n'était pas enregistré)
        if (memberForm.pwd?.length >= 6) {
          const ok = await resetStaffPassword(created.id, memberForm.pwd, currentEventId)
          if (!ok) toast.error("Le membre est créé, mais son mot de passe n'a pas été enregistré : changez-le depuis sa fiche.")
        }
        await addAuditLog('CREATION_STAFF', { staffNom: memberForm.nom.trim(), role: memberForm.role, username: autoUsername, userType: 'admin', label: `Création staff : ${memberForm.nom.trim()} (${memberForm.role})` })
      }
      setMemberForm(null)
    } catch (e) {
      toast.error(friendlyError(e, "Le membre n'a pas été enregistré."), { action: { label: 'Réessayer', onClick: () => saveMember() } })
    }
    finally { setSavingMember(false) }
  }

  // Exécute l'action en attente uniquement après confirmation
  const runPending = async () => {
    if (!pending) return
    setConfirming(true)
    try { await pending.run() }
    finally { setConfirming(false); setPending(null) }
  }

  const handleDelete = (s) => setPending({
    title: 'Supprimer ce membre ?',
    message: `Supprimer ${s.nom} du staff ?`,
    label: 'Supprimer',
    run: async () => {
      if (s.id === user?.id) { toast.error('Impossible de se supprimer soi-même.'); return }
      await addAuditLog('SUPPRESSION_STAFF', { staffId: s.id, staffNom: s.nom, role: s.role, userType: 'admin', label: `Suppression staff : ${s.nom}` })
      await deleteStaff(s.id)
    },
  })

  const handleResetPwd = (s) => { setPwdTried(false); setPwdTarget(s); setPwdValue('') }
  const submitResetPwd = async () => {
    const s = pwdTarget
    const pwd = pwdValue
    if (!s) return
    if (!pwd || pwd.length < 6) { setPwdTried(true); focusFirstInvalid(pwdFormRef.current); return }
    setPwdTarget(null)
    setPwdValue('')
    const ok = await resetStaffPassword(s.id, pwd, currentEventId)
    setResetState(p => ({ ...p, [s.id]: ok ? 'success' : 'error' }))
    setTimeout(() => setResetState(p => { const n={...p}; delete n[s.id]; return n }), 2500)
  }

  const handlePromote = (s) => setPending({
    title: 'Promouvoir ce membre ?',
    message: `Promouvoir ${s.nom} au rôle Admin ? Ce rôle donne accès à la gestion complète de l'événement.`,
    label: 'Promouvoir',
    variant: 'primary',
    run: async () => {
      setPromotingId(s.id)
      try { await updateStaffRole(s.id, 'admin') }
      finally { setPromotingId(null) }
    },
  })

  // ── Handlers rôle ─────────────────────────────────────────────────
  const openNewRole = () => {
    setRoleForm({ nom:'', couleur:ROLE_COLORS[0].hex, pages:['mon-profil'], permissions:{} })
    setRoleTried(false)
    setEditingRole('new')
  }
  const openEditRole = (r) => {
    setRoleForm({ nom:r.nom, couleur:r.couleur, pages:r.pages||[], permissions:r.permissions||{} })
    setRoleTried(false)
    setEditingRole(r.id)
  }

  const saveRole = async () => {
    if (!roleForm.nom.trim()) { setRoleTried(true); focusFirstInvalid(roleFormRef.current); return }
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
    } catch (e) {
      toast.error(friendlyError(e, "Le rôle n'a pas été enregistré."), { action: { label: 'Réessayer', onClick: () => saveRole() } })
    }
    finally { setSavingRole(false) }
  }

  const handleDeleteRole = (r) => {
    if (staff.some(s => s.role === r.id)) { toast.error(`Des membres utilisent encore le rôle "${r.nom}".`); return }
    setPending({
      title: 'Supprimer ce rôle ?',
      message: `Supprimer le rôle "${r.nom}" ?`,
      label: 'Supprimer',
      run: () => deleteRole(r.id),
    })
  }

  const pageGroups = [...new Set(ALL_PAGES.map(p => p.group))]

  // Résoudre une demande : choisir un nouveau mdp et l'appliquer
  const handleResolveRequest = async () => {
    if (!resolvingRequest) return
    if (newPwdValue.length < 6) { setReqTried(true); focusFirstInvalid(reqFormRef.current); return }
    const r = resolvingRequest
    if (r.staffId) {
      const ok = await resetStaffPassword(r.staffId, newPwdValue, r.eventId || null)
      if (!ok) { toast.error('La réinitialisation a échoué (compte introuvable).'); return }
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

  // 20/11/2026 — téléphone : liste filtrée et membre de la feuille d'actions
  const visibleStaff = staff.filter(m => isSuperAdmin || m.role !== 'super_admin')
  const q = norm(memberQuery.trim())
  const shownStaff = q
    ? visibleStaff.filter(m => norm(`${m.nom} ${m.username || ''} ${roleInfo(m.role).nom || m.role}`).includes(q))
    : visibleStaff
  const sheetMember = isMobile && section === 'equipe' ? visibleStaff.find(m => m.id === sheetId) || null : null
  const sheetEvents = sheetMember
    ? (sheetMember.eventIds || []).map(eid => visibleEvents.find(e => e.id === eid)?.nom).filter(Boolean)
    : []
  // Ferme la feuille puis lance l'action existante, inchangée
  const fromSheet = (action) => { const m = sheetMember; setSheetId(null); if (m) action(m) }

  const isEditMember = !!(memberForm && (memberForm._docId || memberForm.id))
  const permCount = Object.values(roleForm.permissions).filter(Boolean).length

  return (
    <div className={s.page}>
      {/* Panneau demandes de réinitialisation */}
      {pwdRequests.length > 0 && (
        <section className={s.requests}>
          <p className={s.requestsHead}>
            <MailQuestion size={18} aria-hidden="true"/>
            {pwdRequests.length} demande{pwdRequests.length > 1 ? 's' : ''} de réinitialisation en attente
          </p>
          <div className={s.reqList}>
            {pwdRequests.map(r => {
              const dateStr = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : ''
              return (
                <div key={r.id} className={s.req}>
                  {/* 23/11/2026 : le nom ouvre le détail de la demande ; les boutons restent à côté */}
                  <button type="button" className={clsx(s.reqInfo, s.reqOpen)} aria-haspopup="dialog" onClick={() => setReqDetailId(r.id)}>
                    <span className={s.reqName}>
                      <span>{r.staffNom || r.identifier}</span>
                      {r.staffRole && <Badge>{r.staffRole}</Badge>}
                    </span>
                    <span className={s.reqMeta}>
                      {r.staffId ? `Compte trouvé · ${r.identifier}` : `⚠ Aucun compte trouvé pour « ${r.identifier} »`}
                      {dateStr && ' · ' + dateStr}
                    </span>
                  </button>
                  <div className={s.reqActions}>
                    {r.staffId && (
                      <Button size="sm" onClick={() => { setReqTried(false); setResolvingRequest(r); setNewPwdValue('') }}>
                        Réinitialiser
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => handleDismissRequest(r)}>
                      Ignorer
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Détail d'une demande (23/11/2026) : mêmes actions que la ligne */}
      {(() => {
        const r = reqDetailId ? pwdRequests.find(x => x.id === reqDetailId) : null
        const dateStr = r?.createdAt?.toDate ? r.createdAt.toDate().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null
        return (
          <DetailSheet open={!!r} onClose={() => setReqDetailId(null)} title="Demande de réinitialisation" icon={MailQuestion}
            status={r ? (r.staffId ? { label: 'Compte trouvé', tone: 'success' } : { label: 'Aucun compte trouvé', tone: 'warning' }) : null}
            value={r ? (r.staffNom || r.identifier) : null}
            sections={r ? [{ label: 'Demande', rows: [
              ['Identifiant saisi', r.identifier || null],
              ['Rôle', r.staffRole || null],
              ['Reçue le', dateStr],
            ] }] : []}
            actions={r && (<>
              {r.staffId && <Button block onClick={() => { setReqDetailId(null); setReqTried(false); setResolvingRequest(r); setNewPwdValue('') }}>Réinitialiser</Button>}
              <Button block variant="secondary" onClick={() => { setReqDetailId(null); handleDismissRequest(r) }}>Ignorer</Button>
            </>)}/>
        )
      })()}

      {/* Résolution d'une demande */}
      <Sheet open={!!resolvingRequest} onClose={() => setResolvingRequest(null)} title="Réinitialiser le mot de passe"
        footer={
          <div className={s.sheetFoot}>
            <Button variant="secondary" onClick={() => setResolvingRequest(null)}>Annuler</Button>
            <Button icon={Check} onClick={handleResolveRequest}>Appliquer</Button>
          </div>
        }>
        {resolvingRequest && (
          <div ref={reqFormRef} className={s.form}>
            <p className={s.muted}>
              Pour <strong>{resolvingRequest.staffNom || resolvingRequest.identifier}</strong>
            </p>
            <div className={s.field}>
              <Field label={<span className={s.label}>Nouveau mot de passe</span>}
                error={newPwdValue.length >= 6 ? null : 'Choisis un mot de passe de 6 caractères minimum'} valid={newPwdValue.length >= 6} showError={reqTried}>
                <input id="staff-req-pwd" type="text" value={newPwdValue}
                  onChange={e => setNewPwdValue(e.target.value)} autoFocus placeholder="Minimum 6 caractères"/>
              </Field>
              <PasswordStrength value={newPwdValue}/>
            </div>
            <p className={s.hint}>
              Communiquez ce mot de passe à l'utilisateur de manière sécurisée. Il pourra le changer lui-même dans son profil.
            </p>
          </div>
        )}
      </Sheet>

      {/* Onglets + action principale */}
      <div className={s.toolbar}>
        <Tabs label="Sections du staff" value={section} onChange={setSection} items={[
          { value:'equipe', label:'Équipe' },
          { value:'roles',  label:'Rôles & permissions' },
        ]}/>
        {/* 20/11/2026 — sur téléphone, ce bouton passe sous la liste, en pleine largeur */}
        {section === 'equipe' && !isMobile && (
          <Button icon={Plus} onClick={openNewMember}>Ajouter un membre</Button>
        )}
        {section === 'roles' && editingRole === null && (
          <Button icon={Plus} onClick={openNewRole}>Nouveau rôle</Button>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          SECTION ÉQUIPE
      ══════════════════════════════════════════════════════ */}
      {/* 20/11/2026 — téléphone : recherche, une ligne par membre, bouton d'ajout en pleine largeur */}
      {section === 'equipe' && isMobile && (
        <>
          <input type="search" className={s.mSearch} value={memberQuery}
            onChange={e => setMemberQuery(e.target.value)}
            placeholder="Nom ou rôle" aria-label="Chercher un membre"
            autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="search"/>
          <Card title={`${staff.length} membre${staff.length>1?'s':''} dans l'équipe`} flush>
            {shownStaff.length === 0 && q ? (
              <Empty icon={SearchX} title="Aucun membre ne correspond"
                action={<Button variant="secondary" onClick={() => setMemberQuery('')}>Effacer la recherche</Button>}>
                Aucun nom ni rôle ne contient « {memberQuery.trim()} ».
              </Empty>
            ) : (
              <div className={s.mList}>
                {shownStaff.map(m => {
                  const ri = roleInfo(m.role)
                  const rs = resetState[m.id]
                  return (
                    <button key={m.id} type="button" className={s.mRow} aria-haspopup="dialog"
                      onClick={() => setSheetId(m.id)}>
                      <span className={s.mAvatar}>
                        {m.avatar ? <img src={m.avatar} alt=""/> : initials(m.nom)}
                      </span>
                      <span className={s.mText}>
                        <span className={s.mName}>
                          <span className={s.mNameText}>{m.nom}</span>
                          {m.id === user?.id && <Badge tone="brand">Vous</Badge>}
                          {estDesactive(m) && <Badge tone="danger">désactivé</Badge>}
                        </span>
                        <span className={s.mSub}>{m.username ? `@${m.username}` : '—'} · {ri.nom || m.role}</span>
                        {rs === 'success' && <span className={clsx(s.mNote, s.mNoteOk)}>Mot de passe changé ✓</span>}
                        {rs === 'error' && <span className={clsx(s.mNote, s.mNoteErr)}>Le mot de passe n'a pas été changé</span>}
                      </span>
                      <ChevronRight size={20} className={s.mChev} aria-hidden="true"/>
                    </button>
                  )
                })}
              </div>
            )}
          </Card>
          <Button icon={Plus} block onClick={openNewMember}>Ajouter un membre</Button>
        </>
      )}

      {/* 20/11/2026 — téléphone : feuille d'actions d'un membre (mêmes fonctions que les boutons de la liste) */}
      <Sheet open={!!sheetMember} onClose={() => setSheetId(null)} title={sheetMember?.nom}>
        {sheetMember && (
          <div className={s.mSheet}>
            <p className={s.mSheetMeta}>
              {sheetMember.username ? `@${sheetMember.username}` : '—'}
              {' · '}{roleInfo(sheetMember.role).nom || sheetMember.role}
              {' · '}{sheetEvents.length ? sheetEvents.join(', ') : 'Aucun événement'}
            </p>
            {estDesactive(sheetMember) && (
              <div className={s.desactiveMsg} role="alert">
                Compte désactivé : le rôle « {ROLES_RETIRES[sheetMember.role] || 'Stand'} » n'existe plus. Touchez « Modifier », choisissez un autre rôle et enregistrez pour le réactiver.
              </div>
            )}
            <Button block variant="secondary" icon={Pencil} onClick={() => fromSheet(openEditMember)}>Modifier</Button>
            <Button block variant="secondary" icon={KeyRound} onClick={() => fromSheet(handleResetPwd)}>Changer le mot de passe</Button>
            {sheetMember.role !== 'admin' && sheetMember.role !== 'super_admin' && isSuperAdmin && (
              <Button block variant="secondary" icon={ShieldCheck} className={s.promote}
                onClick={() => fromSheet(handlePromote)}>Promouvoir</Button>
            )}
            {sheetMember.id !== user?.id && (
              <Button block variant="danger" icon={Trash2} onClick={() => fromSheet(handleDelete)}>Supprimer ce membre</Button>
            )}
            <Button block variant="ghost" onClick={() => setSheetId(null)}>Fermer</Button>
          </div>
        )}
      </Sheet>

      {section === 'equipe' && !isMobile && (
        <Card title={`${staff.length} membre${staff.length>1?'s':''} dans l'équipe`} flush>
          <div className={s.members}>
            {staff.filter(m => isSuperAdmin || m.role !== 'super_admin').map(m => {
              const ri  = roleInfo(m.role)
              const rs  = resetState[m.id]
              const isMe = m.id === user?.id
              return (
                <div key={m.id} className={s.member}>
                  <div className={s.memberTop}>
                    <div className={s.avatar} style={{ '--c': m.couleur || ri.couleur }}>
                      {m.avatar ? <img src={m.avatar} alt={m.nom}/> : initials(m.nom)}
                    </div>
                    <div className={s.memberInfo}>
                      <div className={s.memberName}>
                        {m.nom}
                        {isMe && <Badge tone="brand">Vous</Badge>}
                        {estDesactive(m) && <Badge tone="danger">désactivé</Badge>}
                      </div>
                      <div className={s.memberUser}>{m.username ? `@${m.username}` : '—'}</div>
                      <RoleBadge nom={ri.nom||m.role} couleur={ri.couleur}/>
                      {(m.eventIds||[]).length > 0 && (
                        <div className={s.events}>
                          {(m.eventIds||[]).slice(0,3).map(eid => {
                            const ev = visibleEvents.find(e => e.id === eid)
                            if (!ev) return null
                            return (
                              <span key={eid} className={s.evChip} style={{ '--c': ev.couleur || '#1a6b7a' }}>
                                {ev.logoSrc ? <img src={ev.logoSrc} alt=""/> : ev.emoji} {ev.nom}
                              </span>
                            )
                          })}
                          {(m.eventIds||[]).length > 3 && <span className={s.more}>+{(m.eventIds||[]).length-3}</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions — toujours visibles */}
                  <div className={s.memberActions}>
                    <Button size="sm" variant="secondary" icon={Pencil} onClick={() => openEditMember(m)}>Modifier</Button>
                    <Button size="sm" variant="secondary" icon={KeyRound} onClick={() => handleResetPwd(m)}
                      className={clsx(rs==='success' && s.pwdOk, rs==='error' && s.pwdErr)}>
                      {rs==='success'?'Changé ✓':rs==='error'?'Erreur !':'Mot de passe'}
                    </Button>
                    {m.role !== 'admin' && m.role !== 'super_admin' && isSuperAdmin && (
                      <Button size="sm" variant="secondary" icon={ShieldCheck} className={s.promote}
                        onClick={() => handlePromote(m)} loading={promotingId===m.id}>
                        Promouvoir
                      </Button>
                    )}
                    {!isMe && (
                      <Button size="sm" variant="danger" icon={Trash2} onClick={() => handleDelete(m)}>Supprimer</Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Formulaire membre (ajout / édition) */}
      <Sheet open={!!memberForm} onClose={() => setMemberForm(null)}
        title={isEditMember ? 'Modifier un membre' : 'Nouveau membre du staff'}
        footer={
          <div className={s.sheetFoot}>
            <Button variant="secondary" icon={X} onClick={() => setMemberForm(null)}>Annuler</Button>
            <Button icon={Save} onClick={saveMember} loading={savingMember}>
              {savingMember ? 'Sauvegarde…' : isEditMember ? 'Enregistrer' : 'Créer le membre'}
            </Button>
          </div>
        }>
        {memberForm && (
          <div ref={memberFormRef} className={s.form}>
            {/* Nom */}
            <Field label={<span className={s.label}>Nom complet</span>}
              error={memberForm.nom.trim() ? null : 'Indique le nom du membre'} valid={!!memberForm.nom.trim()} showError={memberTried}>
              <input id="staff-nom" value={memberForm.nom}
                onChange={e => setMemberForm(f => ({...f, nom:e.target.value}))} placeholder="Prénom Nom"/>
            </Field>

            {/* Nom d'utilisateur */}
            <div className={s.field}>
              <label className={s.label} htmlFor="staff-username">
                Nom d'utilisateur <span className={s.labelHint}>(utilisé pour se connecter)</span>
              </label>
              <div className={s.inline}>
                <input id="staff-username" className={s.input}
                  value={memberForm.username || ''}
                  onChange={e => setMemberForm(f => ({...f, username: e.target.value.toLowerCase().replace(/\s/g,'')}))}
                  placeholder={genUsername(memberForm.nom) || 'ex: sbabou'}
                  autoCapitalize="none"/>
                <Button variant="secondary" onClick={() => setMemberForm(f => ({...f, username: genUsername(f.nom)}))}>
                  Générer
                </Button>
              </div>
              {memberForm.nom && !memberForm.username && (
                <p className={s.hint}>
                  Suggestion : <strong>{genUsername(memberForm.nom)}</strong> — cliquez « Générer » pour l'appliquer
                </p>
              )}
            </div>

            {/* Adresse Microsoft : relie le bouton « Se connecter avec Microsoft » à ce membre */}
            <Field label={<span className={s.label}>Adresse e-mail Microsoft <span className={s.labelHint}>(pour « Se connecter avec Microsoft », facultatif)</span></span>}
              error={emailOk(memberForm.email) ? null : 'Adresse e-mail incomplète'} valid={emailOk(memberForm.email)} showError={memberTried}>
              <input id="staff-email" type="email" value={memberForm.email || ''}
                onChange={e => setMemberForm(f => ({...f, email: e.target.value}))}
                placeholder="prenom.nom@maisonyllastrasbourg.onmicrosoft.com"
                autoCapitalize="none" autoComplete="off" spellCheck={false}/>
            </Field>

            {/* Rôle */}
            <div className={s.field}>
              {/* Fiche au rôle retiré (23/11/2026) : le dire, et réactiver en choisissant un autre rôle */}
              {isEditMember && estDesactive(memberForm) && (
                <div className={s.desactiveMsg} role="alert">
                  Compte désactivé : le rôle « {ROLES_RETIRES[memberForm.role] || 'Stand'} » n'existe plus. Choisissez un autre rôle et enregistrez pour le réactiver.
                </div>
              )}
              <span className={s.label} id="staff-role-label">Rôle</span>
              <div className={s.roleChoices} role="group" aria-labelledby="staff-role-label">
                {allRoles.filter(r => (isSuperAdmin || r.id !== 'admin') && (isSuperAdmin || r.id !== 'super_admin')).map(r => (
                  <button key={r.id} type="button" onClick={() => setMemberForm(f => ({...f, role:r.id}))}
                    aria-pressed={memberForm.role===r.id}
                    className={clsx(s.roleChoice, memberForm.role===r.id && s.roleChoiceOn)} style={{ '--c': r.couleur }}>
                    <span className={s.dot}/>
                    <span>{r.nom}</span>
                  </button>
                ))}
              </div>
              {memberTried && (!memberForm.role || ROLES_RETIRES[memberForm.role]) && (
                <p className={s.roleErr} role="alert">Choisissez un rôle.</p>
              )}
            </div>

            {/* Couleur avatar */}
            <ColorPicker colors={MEMBER_COLORS} value={memberForm.couleur||'#1a6b7a'} onChange={c => setMemberForm(f => ({...f, couleur:c}))} label="Couleur de l'avatar"/>

            {/* Mot de passe */}
            <div className={s.field}>
              <label className={s.label} htmlFor="staff-pwd">
                Mot de passe {isEditMember && <span className={s.labelHint}>(laisser vide pour ne pas modifier)</span>}
              </label>
              <div className={s.inputWrap}>
                <Lock size={16} className={s.inputIcon} aria-hidden="true"/>
                <input id="staff-pwd" className={clsx(s.input, s.withIcon, s.withEye)} type={showPwd?'text':'password'}
                  value={memberForm.pwd||''} onChange={e => setMemberForm(f => ({...f, pwd:e.target.value}))}
                  placeholder="minimum 6 caractères"/>
                <button type="button" className={s.eye} onClick={() => setShowPwd(v=>!v)}
                  aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                  {showPwd?<EyeOff size={16}/>:<Eye size={16}/>}
                </button>
              </div>
              <PasswordStrength value={memberForm.pwd||''}/>
            </div>

            {/* Événements accessibles */}
            {visibleEvents.length > 0 && (
              <div className={s.field}>
                <span className={s.label}>Événements accessibles</span>
                <div className={s.checkList}>
                  {visibleEvents.map(ev => {
                    const checked = (memberForm.eventIds||[]).includes(ev.id)
                    return (
                      <label key={ev.id} className={clsx(s.check, checked && s.checkOn)} style={{ '--c': ev.couleur || '#1a6b7a' }}>
                        <input type="checkbox" checked={checked}
                          onChange={e => setMemberForm(f => ({
                            ...f,
                            eventIds: e.target.checked
                              ? [...(f.eventIds||[]), ev.id]
                              : (f.eventIds||[]).filter(id => id !== ev.id)
                          }))}/>
                        {ev.logoSrc
                          ? <img src={ev.logoSrc} alt={ev.nom}/>
                          : <span className={s.checkIcon}>{ev.emoji || '🎵'}</span>
                        }
                        <span className={s.checkText}>{ev.nom}</span>
                      </label>
                    )
                  })}
                </div>
                {(memberForm.eventIds||[]).length === 0 && (
                  <p className={s.hint}>Aucun événement sélectionné — le membre n'aura accès à aucune donnée.</p>
                )}
              </div>
            )}

            {/* Aperçu */}
            <div className={s.preview}>
              <div className={clsx(s.avatar, s.avatarSm)} style={{ '--c': memberForm.couleur || 'var(--brand)' }}>
                {initials(memberForm.nom)}
              </div>
              <div className={s.previewText}>
                <div className={s.previewName}>{memberForm.nom||'Nom du membre'}</div>
                <div className={s.previewSub}>{memberForm.email||'email@festival.fr'}</div>
              </div>
              <RoleBadge nom={roleInfo(memberForm.role).nom} couleur={roleInfo(memberForm.role).couleur}/>
            </div>
          </div>
        )}
      </Sheet>

      {/* ══════════════════════════════════════════════════════
          SECTION RÔLES
      ══════════════════════════════════════════════════════ */}
      {section === 'roles' && (
        <>
          {/* Rôles intégrés */}
          <Card title="Rôles intégrés">
            <div className={s.builtins}>
              {Object.entries(DEFAULT_ROLES).map(([id, r]) => (
                <div key={id} className={s.builtin} style={{ '--c': r.couleur }}>
                  <span className={s.dot}/>
                  <div>
                    <div className={s.builtinName}>{r.nom}</div>
                    <div className={s.builtinId}>{id}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Formulaire rôle */}
          {editingRole !== null && (
            <Card className={s.formCard} title={editingRole==='new' ? 'Créer un rôle personnalisé' : 'Modifier le rôle'}>
              <div ref={roleFormRef} className={s.form}>
                {/* Nom */}
                <Field label={<span className={s.label}>Nom du rôle</span>}
                  error={roleForm.nom.trim() ? null : 'Indique un nom pour ce rôle'} valid={!!roleForm.nom.trim()} showError={roleTried}>
                  <input id="role-nom" value={roleForm.nom}
                    onChange={e => setRoleForm(f=>({...f,nom:e.target.value}))} placeholder="ex : Sécurité, Photographe…"/>
                </Field>

                {/* Couleur */}
                <ColorPicker colors={ROLE_COLORS} value={roleForm.couleur} onChange={c => setRoleForm(f=>({...f,couleur:c}))} label="Couleur du badge"/>

                {/* Pages */}
                <div className={s.field}>
                  <span className={s.label}>Pages accessibles</span>
                  {pageGroups.map(group => (
                    <div key={group} className={s.group}>
                      <div className={s.groupLabel}>{group}</div>
                      <div className={s.checkGrid}>
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
                <div className={s.field}>
                  <span className={s.label}>Permissions</span>
                  <div className={s.checkGrid}>
                    {ALL_PERMISSIONS.map(p => (
                      <CheckCard key={p.id} checked={!!roleForm.permissions[p.id]}
                        onChange={v => setRoleForm(f=>({...f,permissions:{...f.permissions,[p.id]:v}}))}
                        label={p.label} icon={p.icon} color="var(--gold)"/>
                    ))}
                  </div>
                </div>

                {/* Aperçu */}
                <div className={s.preview}>
                  <span className={s.previewSub}>Aperçu :</span>
                  <RoleBadge nom={roleForm.nom||'Nom du rôle'} couleur={roleForm.couleur}/>
                  <span className={s.previewSub}>
                    {roleForm.pages.length} page{roleForm.pages.length>1?'s':''} · {permCount} permission{permCount>1?'s':''}
                  </span>
                </div>

                <div className={s.formActions}>
                  <Button icon={Save} onClick={saveRole} loading={savingRole}>
                    {savingRole?'Sauvegarde…':editingRole==='new'?'Créer le rôle':'Enregistrer'}
                  </Button>
                  <Button variant="secondary" icon={X} onClick={() => setEditingRole(null)}>Annuler</Button>
                </div>
              </div>
            </Card>
          )}

          {/* Liste rôles personnalisés */}
          {(roles||[]).length === 0 && editingRole === null && (
            <Empty icon={Tags} title="Aucun rôle personnalisé"
              action={<Button icon={Plus} onClick={openNewRole}>Créer un rôle</Button>}>
              Les rôles que tu crées, avec leurs pages et permissions, apparaîtront ici.
            </Empty>
          )}
          {(roles||[]).length > 0 && (
            <div className={s.roleList}>
              {(roles||[]).map(role => (
                <Card key={role.id}>
                  <div className={s.roleHead} style={{ '--c': role.couleur }}>
                    <div className={s.roleId}>
                      <div className={s.roleIcon}><span className={s.dot}/></div>
                      <div className={s.roleText}>
                        <div className={s.roleName}>
                          {role.nom}
                          <RoleBadge nom={role.nom} couleur={role.couleur}/>
                        </div>
                        <div className={s.roleMeta}>
                          {(role.pages||[]).length} pages · {staff.filter(m=>m.role===role.id).length} membre(s)
                        </div>
                      </div>
                    </div>
                    <div className={s.roleActions}>
                      <Button size="sm" variant="secondary" icon={Pencil} onClick={() => openEditRole(role)}>Modifier</Button>
                      <Button size="sm" variant="danger" icon={Trash2} iconOnly aria-label={`Supprimer le rôle ${role.nom}`}
                        title="Supprimer" onClick={() => handleDeleteRole(role)}/>
                    </div>
                  </div>
                  {role.pages?.length > 0 && (
                    <div className={s.pageChips}>
                      {role.pages.map(p => (
                        <span key={p} className={s.pageChip}>{ALL_PAGES.find(x=>x.id===p)?.label||p}</span>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Nouveau mot de passe d'un membre (remplace prompt) */}
      <Dialog open={!!pwdTarget} onClose={() => setPwdTarget(null)} title="Nouveau mot de passe"
        footer={<>
          <Button variant="secondary" onClick={() => setPwdTarget(null)}>Annuler</Button>
          <Button icon={Check} onClick={submitResetPwd}>Appliquer</Button>
        </>}>
        {pwdTarget && (
          <div ref={pwdFormRef} className={s.form}>
            <p className={s.muted}>Pour <strong>{pwdTarget.nom}</strong> (min. 6 caractères)</p>
            <div className={s.field}>
              <Field label={<span className={s.label}>Nouveau mot de passe</span>}
                error={pwdValue.length >= 6 ? null : 'Choisis un mot de passe de 6 caractères minimum'} valid={pwdValue.length >= 6} showError={pwdTried}>
                <input id="staff-reset-pwd" type="text" value={pwdValue} autoFocus
                  onChange={e => setPwdValue(e.target.value)} placeholder="Minimum 6 caractères"
                  onKeyDown={e => { if (e.key === 'Enter') submitResetPwd() }}/>
              </Field>
              <PasswordStrength value={pwdValue}/>
            </div>
          </div>
        )}
      </Dialog>

      {/* Confirmation (remplace window.confirm) */}
      <Dialog open={!!pending} onClose={() => { if (!confirming) setPending(null) }} title={pending?.title}
        footer={<>
          <Button variant="secondary" onClick={() => setPending(null)} disabled={confirming}>Annuler</Button>
          <Button variant={pending?.variant || 'danger'} onClick={runPending} loading={confirming}>{pending?.label}</Button>
        </>}>
        <p className={s.dialogText}>{pending?.message}</p>
      </Dialog>
    </div>
  )
}
