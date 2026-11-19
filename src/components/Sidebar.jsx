/**
 * components/Sidebar.jsx — v3 rail d'icônes (lot 1)
 * Ordinateur : rail de 64px (libellé au survol), dépliable à 232px — préférence mémorisée.
 * Tablette   : toujours en rail.
 * Mobile     : tiroir qui glisse depuis la gauche.
 */
import React, { useState } from 'react'
import {
  LayoutDashboard, Home, Bookmark, Users, List, UtensilsCrossed, BadgeCheck, Calendar, CalendarDays,
  Settings, PlusCircle, QrCode, Ticket, Package, ShoppingCart, ShoppingBag, Wallet, User,
  BarChart3, AlertTriangle, PanelLeftClose, PanelLeftOpen, X, LogOut,
  Sun, Moon, Palette, ClipboardList, Calculator,
  Music2, ChevronDown, ArrowLeftRight, Banknote, Briefcase, ChefHat, Building2,
} from 'lucide-react'
import clsx from 'clsx'
import useAppStore   from '../store/useAppStore'
import useEventStore from '../store/useEventStore'
import { ROLE_PAGES } from '../store/useAuthStore'
import { APP_FULL_LABEL } from '../utils/buildInfo'
import { useBreakpoint }   from '../hooks/useBreakpoint'
import { useOfflineQueue } from '../hooks/useOfflineQueue'
import s from './Sidebar.module.css'
import { isEmLinked, PAGES_RETIREES_EM } from '../em/pages'

export const ALL_PAGES = {
  evenements:           { icon: Calendar,        label: 'Événements' },
  accueil:              { icon: Home,            label: 'Accueil' },
  dashboard:            { icon: LayoutDashboard, label: 'Tableau de bord' },
  analytics:            { icon: BarChart3,       label: 'Analytics' },
  cloture:              { icon: Calculator,      label: 'Clôture de caisse' },
  alertes:              { icon: AlertTriangle,   label: 'Alertes financières',   badge: 'alertes' },
  comptabilite:         { icon: Briefcase,        label: 'Comptabilité' },
  'gestion-artistes':   { icon: Music2,           label: 'Gestion artistes' },
  exposants:            { icon: Building2,        label: 'Exposants' },
  finances:             { icon: Wallet,           label: 'Finances' },
  // Note : 'cachets' n'apparaît plus dans le menu latéral.
  // La page reste accessible via le hub "Gestion artistes" et via le bouton
  // "Gérer le cachet" dans le formulaire d'édition d'un créneau planning.
  planning:             { icon: CalendarDays,     label: 'Planning Festival' },
  'qr-entree':          { icon: QrCode,          label: 'QR code entrée' },
  entree:               { icon: Ticket,          label: 'Entrée (billets)' },
  'spectateurs-hub':    { icon: Users,           label: 'Spectateurs & Accès' },
  'equipe-hub':         { icon: Users,           label: 'Équipe & Bénévoles' },
  operations:           { icon: ArrowLeftRight,   label: 'Opérations' },
  benevoles:            { icon: Users,           label: 'Bénévoles' },
  'reservations-admin': { icon: Bookmark,        label: 'Réservations',          badge: true },
  spectateurs:          { icon: Users,           label: 'Spectateurs' },
  transactions:         { icon: List,            label: 'Transactions' },
  menu:                 { icon: UtensilsCrossed, label: 'Carte & menu' },
  staff:                { icon: BadgeCheck,      label: 'Équipe' },
  settings:             { icon: Settings,        label: 'Paramètres' },
  credit:               { icon: PlusCircle,      label: 'Créditer' },
  'commande-sur-place': { icon: ShoppingBag,     label: 'Commande sur place' },
  nouveau:              { icon: QrCode,          label: 'Nouveau QR' },
  remboursement:        { icon: Banknote,        label: 'Remboursement' },
  retrait:              { icon: Package,         label: 'Retrait réservation',   badge: true },
  debit:                { icon: ShoppingCart,    label: 'Encaisser' },
  'prendre-commande':   { icon: ClipboardList,   label: 'Prendre commande' },
  'retrait-commande':   { icon: Package,         label: 'Retrait commande' },
  cuisine:              { icon: ChefHat,         label: 'Cuisine' },
  'mon-qr':             { icon: QrCode,          label: 'Mon QR code' },
  'mes-reservations':   { icon: Bookmark,        label: 'Mes réservations',      badge: true },
  solde:                { icon: Wallet,          label: 'Mon solde' },
  carte:                { icon: UtensilsCrossed, label: 'La carte' },
  'mon-profil':         { icon: User,            label: 'Mon profil' },
}

const BUILTIN_NAMES = {
  admin: 'Admin', billetterie: 'Billetterie',
  stand: 'Stand', consultation: 'Consultation', spectateur: 'Spectateur',
  super_admin: 'Super Admin', directeur_artistique: 'Directeur artistique',
}

const LS_KEY = 'yllacash-sidebar-v2' // 'true' = rail replié
const LS_OPEN = 'yllacash-sidebar-rubriques' // rubriques dépliées

// Pages rangées sous chaque rubrique : elles se déplient sur place dans le menu
const HUB_CHILDREN = {
  operations:         ['debit', 'credit', 'commande-sur-place', 'nouveau', 'retrait', 'prendre-commande', 'retrait-commande', 'cuisine', 'remboursement', 'transactions', 'reservations-admin', 'alertes'],
  'equipe-hub':       ['staff', 'benevoles'],
  'spectateurs-hub':  ['entree', 'spectateurs', 'qr-entree'],
  finances:           ['exposants', 'cachets'],
  'gestion-artistes': ['planning', 'cachets'],
}
// « cachets » n'a pas d'entrée propre dans le menu : libellé pour les sous-pages
const CHILD_PAGES = { cachets: { icon: Banknote, label: 'Cachets' } }

export default function Sidebar({
  view, currentPage, onNavigate,
  alertCount = 0, mobileOpen = false,
  onMobileClose, onLogout,
  isDark, onToggleDark, isAdmin,
  onStudio, studioOpen,
  onAudit, auditOpen,
}) {
  const { reservations, roles } = useAppStore()
  const { online, queueSize, syncing } = useOfflineQueue()
  const { isMobile, isTablet } = useBreakpoint()
  const { events, currentEventId } = useEventStore()

  // Replié par défaut : le rail laisse toute la place au contenu
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => {
    try { return localStorage.getItem(LS_KEY) !== 'false' } catch { return true }
  })
  const collapsed = isMobile ? false : isTablet ? true : desktopCollapsed

  const toggle = () => {
    const next = !desktopCollapsed
    setDesktopCollapsed(next)
    try { localStorage.setItem(LS_KEY, String(next)) } catch {}
  }

  const go = (pid) => {
    onNavigate(pid)
    if (isMobile) onMobileClose?.()
  }

  const currentEvent = events.find(e => e.id === currentEventId && !e.deleted)
  const customRole   = (roles || []).find(r => r.id === view)
  const emLinked     = isEmLinked(currentEvent)
  // Lot D : pages passées dans Event Manager, masquées pour un événement qui y est relié
  const allowed      = (ROLE_PAGES[view] || customRole?.pages || ['mon-profil']).filter(id => !(emLinked && PAGES_RETIREES_EM.includes(id)))
  // Pour les rôles qui ont accès aux hubs, on masque ces entrées du menu pour ne garder que les hubs.
  // (Elles restent accessibles via les pancartes des hubs.)
  const HUB_HIDDEN_FROM_SIDEBAR = [
    // Hub Opérations
    'credit', 'commande-sur-place', 'debit', 'retrait', 'prendre-commande', 'retrait-commande', 'cuisine', 'remboursement', 'transactions', 'reservations-admin', 'nouveau', 'alertes',
    // Hub Équipe & Bénévoles
    'benevoles', 'staff',
    // Hub Spectateurs & Accès
    'entree', 'spectateurs', 'qr-entree',
    // Hub Finances (exposants + cachets accessibles via la page Finances)
    'exposants',
  ]
  // Hub Gestion artistes : planning et cachets ne sont masqués QUE si l'utilisateur
  // accède à gestion-artistes (admin/super_admin). Les autres rôles (ex: directeur_artistique)
  // gardent un accès direct via la sidebar.
  const HIDDEN_IF_GESTION_ARTISTES = ['planning', 'cachets']

  const showsHubs = allowed.includes('operations') || allowed.includes('equipe-hub') || allowed.includes('spectateurs-hub')
  const hasGestionArtistes = allowed.includes('gestion-artistes')
  const hasFinancesHub = allowed.includes('finances')

  let visibleIds = allowed
  if (showsHubs) {
    visibleIds = visibleIds.filter(id => !HUB_HIDDEN_FROM_SIDEBAR.includes(id))
  }
  // Hub Finances : exposants et cachets accessibles via la page Finances
  if (hasFinancesHub) {
    visibleIds = visibleIds.filter(id => !['exposants', 'cachets'].includes(id))
  }
  if (hasGestionArtistes) {
    visibleIds = visibleIds.filter(id => !HIDDEN_IF_GESTION_ARTISTES.includes(id))
  }
  // Le tableau de bord est fusionné dans l'Accueil : une seule entrée
  if (allowed.includes('accueil')) visibleIds = visibleIds.filter(id => id !== 'dashboard')
  const pages        = visibleIds.map(id => ({ id, ...ALL_PAGES[id], ...(emLinked && id === 'gestion-artistes' ? { label: 'Artistes' } : {}) })).filter(p => p.label)
  const childrenOf   = (hub) => (HUB_CHILDREN[hub] || [])
    .filter(id => allowed.includes(id) && !visibleIds.includes(id))
    .map(id => ({ id, ...(ALL_PAGES[id]?.label ? ALL_PAGES[id] : CHILD_PAGES[id]) }))
    .filter(p => p.label)
  const pendingCount = reservations.filter(r => r.status === 'pending' || r.status === 'ready').length
  const roleName     = BUILTIN_NAMES[view] || customRole?.nom || view

  // Rubriques dépliées : celle de la page affichée l'est toujours
  const [openHubs, setOpenHubs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_OPEN) || '[]') } catch { return [] }
  })
  const toggleHub = (hub, force) => setOpenHubs(list => {
    const isOpen = list.includes(hub)
    const next = (force ?? !isOpen) ? [...new Set([...list, hub])] : list.filter(h => h !== hub)
    try { localStorage.setItem(LS_OPEN, JSON.stringify(next)) } catch {}
    return next
  })

  // Bouton du rail : icône + libellé (masqué replié, affiché en infobulle au survol)
  const Item = ({ icon: Icon, label, active, onClick, count = 0, alert = false, danger = false }) => (
    <button
      type="button"
      onClick={onClick}
      className={clsx(s.item, active && s.active, danger && s.danger)}
      data-tip={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
    >
      <span className={s.icon}>
        <Icon size={18} aria-hidden="true" />
        {collapsed && count > 0 && <span className={clsx(s.dot, alert && s.dotAlert)} />}
      </span>
      {!collapsed && <span className={s.label}>{label}</span>}
      {!collapsed && count > 0 && <span className={clsx(s.count, alert && s.countAlert)}>{count}</span>}
    </button>
  )

  return (
    <>
      {isMobile && mobileOpen && <div className={s.scrim} onClick={onMobileClose} />}

      <aside className={clsx(s.side, collapsed && s.collapsed, isMobile && s.mobile, isMobile && mobileOpen && s.open)}>
        <div className={s.head}>
          <div className={s.logo}>
            <img src="/logo.png" alt="" onError={e => { e.currentTarget.style.display = 'none' }} />
          </div>
          {!collapsed && (
            <div className={s.brand}>
              <div className={s.brandRow}>
                <span className={s.name}>YllaCash</span>
                {!online && <span className={clsx(s.pill, s.pillRed)}>Hors ligne</span>}
                {syncing && <span className={clsx(s.pill, s.pillGold)}>Sync…</span>}
                {online && queueSize > 0 && <span className={clsx(s.pill, s.pillGold)}>{queueSize} en attente</span>}
              </div>
              <span className={s.role}>{roleName}{currentEvent ? ` · ${currentEvent.nom}` : ''}</span>
            </div>
          )}
          {isMobile && (
            <button type="button" className={s.close} onClick={onMobileClose} aria-label="Fermer le menu"><X size={16} /></button>
          )}
        </div>

        {collapsed && !online && <span className={s.offlineDot} data-tip="Hors ligne" />}

        <nav className={s.nav} aria-label="Navigation">
          {pages.map(p => {
            const count = p.badge === 'alertes' ? alertCount : p.badge ? pendingCount : 0
            const kids = collapsed ? [] : childrenOf(p.id)
            const item = (
              <Item
                key={p.id}
                icon={p.icon}
                label={p.label}
                active={currentPage === p.id}
                onClick={() => { if (kids.length) toggleHub(p.id, true); go(p.id) }}
                count={count}
                alert={p.badge === 'alertes' && count > 0}
              />
            )
            if (!kids.length) return item
            const childActive = kids.some(k => k.id === currentPage)
            const open = openHubs.includes(p.id) || childActive
            return (
              <div key={p.id} className={clsx(s.hub, childActive && s.hubActive)}>
                <div className={s.hubRow}>
                  {item}
                  <button type="button" className={clsx(s.chevron, open && s.chevronOpen)} onClick={() => toggleHub(p.id)}
                    aria-expanded={open} aria-controls={`sub-${p.id}`} aria-label={`${open ? 'Replier' : 'Déplier'} ${p.label}`}>
                    <ChevronDown size={15} aria-hidden="true" />
                  </button>
                </div>
                <div id={`sub-${p.id}`} className={clsx(s.sub, open && s.subOpen)}>
                  <div className={s.subInner}>
                    {kids.map(k => {
                      const kc = k.badge === 'alertes' ? alertCount : k.badge ? pendingCount : 0
                      return (
                        <button key={k.id} type="button" tabIndex={open ? 0 : -1} onClick={() => go(k.id)}
                          className={clsx(s.subItem, currentPage === k.id && s.subActive)} aria-current={currentPage === k.id ? 'page' : undefined}>
                          <k.icon size={15} aria-hidden="true" />
                          <span className={s.label}>{k.label}</span>
                          {kc > 0 && <span className={clsx(s.count, k.badge === 'alertes' && s.countAlert)}>{kc}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </nav>

        <div className={s.foot}>
          {isMobile && <Item icon={isDark ? Sun : Moon} label={isDark ? 'Mode clair' : 'Mode sombre'} onClick={onToggleDark} />}
          {isMobile && isAdmin && (
            <Item icon={Palette} label="Studio" active={studioOpen} onClick={() => { onMobileClose?.(); setTimeout(() => onStudio?.(), 50) }} />
          )}
          <Item icon={ClipboardList} label="Journal d'audit" active={auditOpen} onClick={onAudit} />
          {!isMobile && !isTablet && (
            <Item icon={collapsed ? PanelLeftOpen : PanelLeftClose} label={collapsed ? 'Déplier le menu' : 'Replier le menu'} onClick={toggle} />
          )}
          <Item icon={LogOut} label="Se déconnecter" onClick={onLogout} danger />
          {!collapsed && <p className={s.about}>{APP_FULL_LABEL} · Maison Ylla</p>}
        </div>
      </aside>
    </>
  )
}
