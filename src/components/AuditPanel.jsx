/**
 * components/AuditPanel.jsx — v2
 * Journal d'audit complet — toutes actions, tous utilisateurs
 * Filtres : type utilisateur × type action × recherche texte
 * Panneau ui/Sheet : latéral sur ordinateur, feuille du bas sur mobile. Styles : AuditPanel.module.css
 */
import React, { useState, useEffect } from 'react'
import { ClipboardList, Search, User, Clock } from 'lucide-react'
import { db } from '../firebase/config'
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore'
import useAuthStore   from '../store/useAuthStore'
import useEventStore  from '../store/useEventStore'
import { useExport }  from '../hooks/useExport'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { fmt } from '../utils/helpers'
import clsx from 'clsx'
import { Sheet, Badge, Empty, Skeleton } from '../ui'
import s from './AuditPanel.module.css'

// ── Configuration des actions (tone = couleur de pastille ui/Badge) ─────
const ACTION_CFG = {
  // Financier
  CREDIT:              { icon:'💳', label:'Crédit',                tone:'success', cat:'financier' },
  DEBIT:               { icon:'🛒', label:'Encaissement',          tone:'coral',  cat:'financier' },
  RETRAIT:             { icon:'📦', label:'Retrait résa',           tone:'brand', cat:'financier' },
  RETRAIT_BENEV:       { icon:'🎁', label:'Retrait bénévole',       tone:'brand', cat:'financier' },
  // Réservations
  RESERVATION:         { icon:'📋', label:'Réservation',           tone:'warning', cat:'reservation' },
  BENEV_RESERVATION:   { icon:'📋', label:'Résa bénévole',         tone:'warning', cat:'reservation' },
  RESA_PRISE_EN_CHARGE:{ icon:'👨‍🍳', label:'Prise en charge',       tone:'brand', cat:'reservation' },
  RESA_PRETE:          { icon:'✅', label:'Commande prête',         tone:'brand', cat:'reservation' },
  ANNULATION_RESA:     { icon:'❌', label:'Annulation résa',        tone:'danger', cat:'reservation' },
  ANNULATION_RESA_SPEC:{ icon:'❌', label:'Annulation par client',  tone:'danger', cat:'reservation' },
  BENEV_ANNULATION:    { icon:'❌', label:'Annulation bénévole',    tone:'danger', cat:'reservation' },
  SUPPRESSION_RESA:    { icon:'🗑️', label:'Suppression résa',       tone:'danger', cat:'reservation' },
  // Staff
  CONNEXION:           { icon:'🔑', label:'Connexion',             tone:'brand', cat:'session' },
  DECONNEXION:         { icon:'🚪', label:'Déconnexion',           tone:'neutral', cat:'session' },
  CREATION_STAFF:      { icon:'👤', label:'Création staff',         tone:'success', cat:'administration' },
  MODIF_STAFF:         { icon:'✏️', label:'Modification staff',     tone:'warning', cat:'administration' },
  SUPPRESSION_STAFF:   { icon:'🗑️', label:'Suppression staff',      tone:'danger', cat:'administration' },
  RESET_PWD_STAFF:     { icon:'🔒', label:'Reset mot de passe',     tone:'warning', cat:'administration' },
  // Bénévoles
  CREATION_BENEV:      { icon:'🙋', label:'Création bénévole',      tone:'success', cat:'benevole' },
  MODIF_BENEV:         { icon:'✏️', label:'Modification bénévole',  tone:'warning', cat:'benevole' },
  SUPPRESSION_BENEV:   { icon:'🗑️', label:'Suppression bénévole',   tone:'danger', cat:'benevole' },
  CONSO_BENEV:         { icon:'🍽️', label:'Consommation bénévole',  tone:'brand', cat:'benevole' },
  RESET_CONSO_BENEV:   { icon:'🔄', label:'Reset conso bénévole',   tone:'neutral', cat:'benevole' },
  CHANGEMENT_PWD_BENEV:{ icon:'🔒', label:'Changement mdp bénévole',tone:'warning', cat:'benevole' },
  // Spectateurs
  CREATION_SPECTATEUR: { icon:'👥', label:'Création spectateur',    tone:'success', cat:'spectateur' },
  MODIF_SPECTATEUR:    { icon:'✏️', label:'Modification spectateur', tone:'warning', cat:'spectateur' },
  // Menu & Catégories
  CREATION_ARTICLE:    { icon:'🍽️', label:'Ajout article menu',     tone:'success', cat:'menu' },
  MODIF_ARTICLE:       { icon:'✏️', label:'Modification article',    tone:'warning', cat:'menu' },
  SUPPRESSION_ARTICLE: { icon:'🗑️', label:'Suppression article',     tone:'danger', cat:'menu' },
  CREATION_CATEGORIE:  { icon:'📂', label:'Création catégorie',      tone:'success', cat:'menu' },
  MODIF_CATEGORIE:     { icon:'✏️', label:'Modification catégorie',  tone:'warning', cat:'menu' },
  SUPPRESSION_CATEGORIE:{ icon:'🗑️', label:'Suppression catégorie',  tone:'danger', cat:'menu' },
  // Rôles
  CREATION_ROLE:       { icon:'🛡️', label:'Création rôle',           tone:'brand', cat:'administration' },
  MODIF_ROLE:          { icon:'✏️', label:'Modification rôle',       tone:'warning', cat:'administration' },
  SUPPRESSION_ROLE:    { icon:'🗑️', label:'Suppression rôle',        tone:'danger', cat:'administration' },
  // Paramètres
  MODIF_SETTINGS:      { icon:'⚙️', label:'Paramètres modifiés',     tone:'neutral', cat:'administration' },
  // Autres
  OTHER:               { icon:'📝', label:'Action',                  tone:'neutral', cat:'autre' },
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

  const typeLabel = { staff:'Staff', admin:'Admin', benevole:'Bénévole', spectateur:'Spectateur' }

  return (
    <Sheet open={open} onClose={onClose} title="Journal d'audit" className={s.sheet}>
      {/* Recherche + filtres (restent visibles pendant le défilement) */}
      <div className={s.toolbar}>
        <p className={s.count} aria-live="polite">
          {loading ? 'Chargement…' : `${filtered.length} entrée${filtered.length>1?'s':''} sur ${logs.length}`}
        </p>
        <label className={s.search}>
          <Search size={14} aria-hidden="true"/>
          <input value={search} onChange={e => setSrch(e.target.value)} placeholder="Rechercher action, membre, montant…"
            aria-label="Rechercher dans le journal" type="search"/>
        </label>
        <div className={s.filters}>
          <select value={userType} onChange={e => setUserType(e.target.value)} className={s.select} aria-label="Type d'utilisateur">
            {USER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={actionCat} onChange={e => setActionCat(e.target.value)} className={s.select} aria-label="Type d'action">
            {ACTION_CATS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className={s.list} aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={s.item}>
              <Skeleton width={34} height={34} radius={9}/>
              <div className={s.itemBody}><Skeleton lines={2} height={12}/></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Empty icon={ClipboardList} title="Aucun résultat" className={s.empty}>Modifiez vos filtres ou votre recherche.</Empty>
      ) : (
        <ul className={s.list}>
          {filtered.map((l, i) => {
            const c = cfg(l.action)
            const who = l.benevoleNom || l.specNom || l.staff || '—'
            return (
              <li key={l.id || i} className={s.item}>
                <span className={clsx(s.icon, s[c.tone])} aria-hidden="true">{c.icon}</span>
                <div className={s.itemBody}>
                  <div className={s.tags}>
                    <Badge tone={c.tone}>{c.label}</Badge>
                    {l.userType && <Badge>{typeLabel[l.userType] || l.userType}</Badge>}
                    {l.montant > 0 && <b className={s.amount}>{fmt(l.montant)}</b>}
                  </div>
                  <p className={s.label} title={l.label || undefined}>{l.label || '—'}</p>
                  <div className={s.meta}>
                    {who !== '—' && <span><User size={11} aria-hidden="true"/> {who}</span>}
                    <span><Clock size={11} aria-hidden="true"/> {fmtDate(l.timestamp || l.date)}</span>
                    {l.resaCode && <span className={s.mono}>#{l.resaCode}</span>}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}
