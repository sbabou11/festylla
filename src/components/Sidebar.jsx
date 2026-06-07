import React, { useState } from 'react'
import {
  LayoutDashboard, Home, Bookmark, Users, List, UtensilsCrossed, BadgeCheck, Calendar, CalendarDays,
  Settings, PlusCircle, QrCode, Package, ShoppingCart, Wallet, User,
  Music, Music2, BarChart3, AlertTriangle, ChevronLeft, ChevronRight, X, LogOut,
  Sun, Moon, Palette, WifiOff, Wifi, ClipboardList, ArrowLeftRight, Banknote, Briefcase, ChefHat, Building2,
} from 'lucide-react'
import useAppStore   from '../store/useAppStore'
import useEventStore from '../store/useEventStore'
import { ROLE_PAGES } from '../store/useAuthStore'
import { APP_VERSION_LABEL, APP_FULL_LABEL } from '../utils/buildInfo'
import { useBreakpoint }   from '../hooks/useBreakpoint'
import { useOfflineQueue } from '../hooks/useOfflineQueue'

const ALL_PAGES = {
  evenements:           { icon: Calendar,        label: 'Événements' },
  accueil:              { icon: Home, label: 'Accueil' },
  analytics:            { icon: BarChart3,       label: 'Analytics',             badge: false },
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

// Couleurs de rôle Maison Ylla — alignées sur la nouvelle palette
const ROLE_COLOR = {
  super_admin:          '#F07848',  // Coral — pouvoir max
  admin:                '#F07848',  // Coral aussi
  billetterie:          '#0E8D7A',  // Vert teal foncé
  stand:                '#D89030',  // Or
  consultation:         '#888780',  // Gris chaud
  directeur_artistique: '#5EB8E4',  // Bleu clair
}

// Couleurs catégoriques par page — pour les pancartes mobile (Style C)
// Cohérent avec les Actions rapides du Dashboard
const PAGE_CATEGORY = {
  // Actions argent
  credit:               { color: '#2E8B57', bg: 'rgba(46,139,87,0.12)' },   // Vert — argent entrant
  nouveau:              { color: '#2E8B57', bg: 'rgba(46,139,87,0.12)' },
  remboursement:        { color: '#D89030', bg: 'rgba(216,144,48,0.12)' },  // Gold — opération de correction
  debit:                { color: '#F07848', bg: 'rgba(240,120,72,0.12)' },  // Coral — argent sortant
  retrait:              { color: '#F07848', bg: 'rgba(240,120,72,0.12)' },
  'prendre-commande':   { color: '#F07848', bg: 'rgba(240,120,72,0.12)' },
  'retrait-commande':   { color: '#F07848', bg: 'rgba(240,120,72,0.12)' },
  cuisine:              { color: '#F07848', bg: 'rgba(240,120,72,0.12)' },
  // Données spectateurs
  spectateurs:          { color: '#14B5B5', bg: 'rgba(20,181,181,0.15)' }, // Teal
  'qr-entree':          { color: '#14B5B5', bg: 'rgba(20,181,181,0.15)' },
  // Analyse / accueil
  accueil:              { color: '#5EB8E4', bg: 'rgba(94,184,228,0.15)' }, // Bleu marine clair
  analytics:            { color: '#5EB8E4', bg: 'rgba(94,184,228,0.15)' },
  transactions:         { color: '#5EB8E4', bg: 'rgba(94,184,228,0.15)' },
  comptabilite:         { color: '#1F2D5F', bg: 'rgba(31,45,95,0.15)' },   // Marine — formel/compta
  operations:           { color: '#1F2D5F', bg: 'rgba(31,45,95,0.15)' },   // Marine — hub central
  'equipe-hub':         { color: '#1A8050', bg: 'rgba(26,128,80,0.15)' },  // Vert — humain
  'spectateurs-hub':    { color: '#14B5B5', bg: 'rgba(20,181,181,0.15)' }, // Teal — accès
  // Urgent
  alertes:              { color: '#FF5050', bg: 'rgba(255,80,80,0.15)' },  // Rouge
  // Cachets artistes — argent sortant spécifique
  cachets:              { color: '#D89030', bg: 'rgba(216,144,48,0.15)' }, // Gold
  // Catalogue
  menu:                 { color: '#D89030', bg: 'rgba(216,144,48,0.15)' }, // Or
  // Réservations
  'reservations-admin': { color: '#9468C0', bg: 'rgba(148,104,192,0.18)' }, // Violet
  // Équipe
  staff:                { color: '#80CEF0', bg: 'rgba(128,206,240,0.18)' }, // Bleu très clair
  benevoles:            { color: '#80CEF0', bg: 'rgba(128,206,240,0.18)' },
  // Programmation
  planning:             { color: '#F8B055', bg: 'rgba(248,176,85,0.18)' }, // Gold clair
  'gestion-artistes':   { color: '#5EB8E4', bg: 'rgba(94,184,228,0.15)' }, // Bleu clair (hub)
  exposants:            { color: '#534AB7', bg: 'rgba(83,74,183,0.12)' },  // Violet — entité tierce
  finances:             { color: '#0F6E56', bg: 'rgba(15,110,86,0.12)' },  // Teal foncé — trésorerie
  // Settings et divers
  settings:             { color: '#888780', bg: 'rgba(136,135,128,0.18)' },
  evenements:           { color: '#5EB8E4', bg: 'rgba(94,184,228,0.15)' },
  // Pages spectateurs
  'mon-qr':             { color: '#14B5B5', bg: 'rgba(20,181,181,0.15)' },
  'mes-reservations':   { color: '#9468C0', bg: 'rgba(148,104,192,0.18)' },
  solde:                { color: '#2E8B57', bg: 'rgba(46,139,87,0.12)' },
  carte:                { color: '#D89030', bg: 'rgba(216,144,48,0.15)' },
  'mon-profil':         { color: '#888780', bg: 'rgba(136,135,128,0.18)' },
}
function categoryFor(pageId) {
  return PAGE_CATEGORY[pageId] || { color: '#5EB8E4', bg: 'rgba(94,184,228,0.15)' }
}

const LS_KEY = 'yllatok-sidebar-v2'

try {
  const saved = localStorage.getItem(LS_KEY)
  if (saved !== 'true' && saved !== 'false') {
    localStorage.removeItem(LS_KEY)
    localStorage.removeItem('yllatok-sidebar-collapsed')
  }
} catch {}

export default function Sidebar({
  view, currentPage, onNavigate,
  alertCount = 0, mobileOpen = false,
  onMobileClose, onLogout,
  isDark, onToggleDark, isOffline, onToggleOffline, isAdmin,
  onStudio, studioOpen,
  onAudit, auditOpen,
}) {
  const { reservations, theme, roles } = useAppStore()
  const { online, queueSize, syncing }  = useOfflineQueue()
  const { isMobile, isTablet }  = useBreakpoint()
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => {
    try { return localStorage.getItem(LS_KEY) === 'true' } catch { return false }
  })

  const collapsed = isMobile ? false : isTablet ? true : desktopCollapsed

  const toggle = () => {
    if (isMobile || isTablet) return
    const next = !desktopCollapsed
    setDesktopCollapsed(next)
    try { localStorage.setItem(LS_KEY, String(next)) } catch {}
  }

  const handleNavigate = (pid) => {
    onNavigate(pid)
    if (isMobile && onMobileClose) onMobileClose()
  }

  const { events, currentEventId, selectEvent } = useEventStore()

  const currentEvent = events.find(e => e.id === currentEventId && !e.deleted)

  const customRole   = (roles || []).find(r => r.id === view)
  const allowed      = ROLE_PAGES[view] || customRole?.pages || ['mon-profil']
  // Pour les rôles qui ont accès aux hubs, on masque ces entrées du menu pour ne garder que les hubs.
  // (Elles restent accessibles via les pancartes des hubs.)
  const HUB_HIDDEN_FROM_SIDEBAR = [
    // Hub Opérations
    'credit', 'debit', 'retrait', 'prendre-commande', 'retrait-commande', 'cuisine', 'remboursement', 'transactions', 'reservations-admin', 'nouveau', 'alertes',
    // Hub Équipe & Bénévoles
    'benevoles', 'staff',
    // Hub Spectateurs & Accès
    'spectateurs', 'qr-entree',
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
  const pages        = visibleIds.map(id => ({ id, ...ALL_PAGES[id] })).filter(p => p.label)
  const pendingCount = reservations.filter(r => r.status === 'pending' || r.status === 'ready').length
  const roleName     = BUILTIN_NAMES[view] || customRole?.nom || view
  const roleColor    = ROLE_COLOR[view] || '#888'

  const isCollapsed = isMobile ? false : collapsed
  const w           = isMobile ? 280 : isCollapsed ? 56 : 220

  // Couleurs sidebar — marine profond toujours, en light comme en dark
  const sidebarBg     = isDark ? '#000812' : '#003048'
  const sidebarBorder = isDark ? 'rgba(255,248,242,0.08)' : 'rgba(255,248,242,0.10)'
  const navTextColor  = 'rgba(255,248,242,0.70)'
  const navTextActive = isDark ? '#002438' : '#fff'
  const navBgActive   = isDark ? '#14B5B5' : '#009090'
  const dividerColor  = 'rgba(255,248,242,0.10)'

  const navBtn = (isActive, isAlert) => ({
    display: 'flex', alignItems: 'center',
    gap: isCollapsed ? 0 : 8,
    width: '100%',
    padding: isCollapsed ? '9px 0' : '9px 12px',
    justifyContent: isCollapsed ? 'center' : 'flex-start',
    borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 13, fontFamily: 'var(--font)',
    fontWeight: isActive ? 700 : 500,
    color: isActive ? navTextActive : (isAlert ? '#FFB89B' : navTextColor),
    background: isActive ? navBgActive : 'transparent',
    transition: 'background .12s, color .12s',
    marginBottom: 2, minHeight: 40,
    boxShadow: isActive
      ? (isDark ? '0 2px 8px rgba(20,181,181,0.30)' : '0 2px 8px rgba(0,144,144,0.30)')
      : 'none',
  })

  const label = (text) => (
    <span style={{
      flex: 1,
      opacity: isCollapsed ? 0 : 1,
      maxWidth: isCollapsed ? 0 : 170,
      overflow: 'hidden', whiteSpace: 'nowrap',
      transition: 'opacity .15s, max-width .22s',
      textAlign: 'left',
    }}>
      {text}
    </span>
  )

  return (
    <>
      {isMobile && mobileOpen && (
        <div onClick={onMobileClose} style={{
          position: 'fixed', inset: 0, zIndex: 99,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
        }}/>
      )}

      <aside style={{
        width: w, flexShrink: 0,
        background: sidebarBg,
        borderRight: `1px solid ${sidebarBorder}`,
        display: 'flex', flexDirection: 'column',
        transition: 'width .22s cubic-bezier(.4,0,.2,1), transform .25s cubic-bezier(.4,0,.2,1)',
        overflow: 'hidden',
        ...(isMobile ? {
          // Mode mobile : drawer en overlay, position fixed
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100,
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          boxShadow: mobileOpen ? '4px 0 24px rgba(0,0,0,0.30)' : 'none',
        } : {
          // Mode desktop : sticky pour rester visible au scroll de la page.
          // height: 100vh + alignSelf flex-start = colle au haut de la viewport.
          // Le contenu interne (la <nav>) gère son propre scroll si besoin.
          position: 'sticky', top: 0,
          height: '100vh', alignSelf: 'flex-start',
        }),
      }}>

        {/* Header */}
        <div style={{
          padding: isCollapsed ? '12px 0' : '12px 14px',
          borderBottom: `0.5px solid ${dividerColor}`,
          display: 'flex', alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          gap: 8, minHeight: 60, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden', minWidth: 0 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: navBgActive,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
            }}>
              {/*
                Priorité d'affichage :
                  1. Logo de l'événement actif (currentEvent.logoSrc) — contexte de travail
                  2. Logo Maison Ylla (/logo.png) — fallback générique
                  3. Initiales du nom d'événement (ou "MY" pour Maison Ylla) — fallback texte si l'image échoue
              */}
              <img
                src={currentEvent?.logoSrc || '/logo.png'}
                alt={currentEvent?.nom || 'Maison Ylla'}
                style={{ width: 28, height: 28, objectFit: 'contain' }}
                onError={e => {
                  // Fallback texte : initiales (2 lettres)
                  const initials = currentEvent?.nom
                    ? currentEvent.nom.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
                    : 'MY'
                  e.target.style.display = 'none'
                  e.target.parentElement.innerHTML = `<span style="color:#fff;font-weight:800;font-size:13px;letter-spacing:-.02em">${initials}</span>`
                }}
              />
            </div>
            {!isCollapsed && (
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#FFF8F2' }}>YllaCash</span>
                  {!online && (
                    <span style={{ fontSize:9, background:'rgba(255,80,80,0.20)', color:'#FFB89B', borderRadius:4, padding:'1px 5px', fontWeight:700 }}>
                      HORS LIGNE
                    </span>
                  )}
                  {syncing && (
                    <span style={{ fontSize:9, background:'rgba(240,176,64,0.20)', color:'#F5C870', borderRadius:4, padding:'1px 5px', fontWeight:700 }}>
                      SYNC…
                    </span>
                  )}
                  {online && queueSize > 0 && (
                    <span style={{ fontSize:9, background:'rgba(184,154,230,0.20)', color:'#D4C5F0', borderRadius:4, padding:'1px 5px', fontWeight:700 }}>
                      {queueSize} en attente
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,248,242,0.55)', marginTop: 2 }}>{roleName}</div>
                {/* Indication événement courant */}
                {currentEvent && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 5, marginTop: 4,
                    padding: '3px 7px', borderRadius: 6,
                    background: roleColor + '30',
                    border: `1px solid ${roleColor}60`,
                    maxWidth: '100%',
                  }}>
                    {currentEvent.logoSrc
                      ? <img src={currentEvent.logoSrc} alt="" style={{ width: 12, height: 12, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }}/>
                      : <span style={{ fontSize: 10, flexShrink: 0 }}>{currentEvent.emoji || '🎵'}</span>
                    }
                    <span style={{ fontSize: 10, fontWeight: 700, color: roleColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', filter: 'brightness(1.4)' }}>
                      {currentEvent.nom}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          {!isCollapsed && (
            <button onClick={isMobile ? onMobileClose : toggle} style={{
              width: 26, height: 26, borderRadius: 6,
              border: `0.5px solid ${sidebarBorder}`,
              background: 'rgba(255,248,242,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0, color: 'rgba(255,248,242,0.75)',
            }}>
              {isMobile ? <X size={13}/> : <ChevronLeft size={13}/>}
            </button>
          )}
        </div>

        {/* Nav */}
        <nav style={{
          padding: isCollapsed ? '6px 4px' : isMobile ? '10px 8px' : 8,
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          ...(isMobile ? {
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            // gridAutoRows: '1fr' → chaque ligne de la grille fait la hauteur du plus grand item
            // ça évite les pancartes alignées en bas mais avec des hauteurs différentes
            gridAutoRows: '1fr',
            gap: 8,
            alignContent: 'start',
            alignItems: 'stretch',
          } : {}),
        }}>
          {pages.map(page => {
            const Icon       = page.icon
            const isActive   = currentPage === page.id
            const badgeCount = page.badge === 'alertes' ? alertCount : page.badge ? pendingCount : 0
            const isAlert    = page.badge === 'alertes' && badgeCount > 0

            // ── MOBILE : pancarte Style C (responsive) ─────────────────
            if (isMobile) {
              const cat = categoryFor(page.id)
              return (
                <button key={page.id} onClick={() => handleNavigate(page.id)}
                  style={{
                    position: 'relative',
                    // Hauteur minimum au lieu d'aspect-ratio rigide :
                    // la pancarte s'agrandit si le libellé est long, plutôt que de tronquer.
                    // 100px = padding (14+10) + icône (30) + gap (6) + 2 lignes de texte respirantes.
                    minHeight: 100,
                    padding: '10px 10px 10px 10px',
                    paddingTop: 14, // un peu plus pour la bande couleur
                    borderRadius: 12,
                    background: isActive ? cat.bg : 'rgba(255,248,242,0.06)',
                    border: isActive ? `1.5px solid ${cat.color}` : '1px solid rgba(255,248,242,0.10)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6, // espace fixe entre icône et libellé (réduit de 8 → 6 pour donner plus de place au texte)
                    overflow: 'hidden',
                    WebkitTapHighlightColor: 'transparent',
                    transition: 'transform .12s, background .15s',
                    // Empêche le bouton de rétrécir sous son contenu minimum
                    minWidth: 0,
                    boxSizing: 'border-box',
                  }}>
                  {/* Bande couleur en haut */}
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0,
                    height: 3, background: cat.color,
                  }}/>

                  {/* Badge dynamique (alertes / résa pending) */}
                  {badgeCount > 0 && (
                    <span style={{
                      position: 'absolute', top: 6, right: 6,
                      background: isAlert ? 'var(--red)' : 'var(--coral)',
                      color: '#fff',
                      fontSize: 9, fontWeight: 800,
                      padding: '1px 6px', borderRadius: 9,
                      minWidth: 16, textAlign: 'center', lineHeight: 1.4,
                    }}>{badgeCount}</span>
                  )}

                  {/* Icône colorée */}
                  {Icon && (
                    <div style={{
                      width: 30, height: 30, borderRadius: 7,
                      background: cat.bg,
                      color: cat.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      filter: 'brightness(1.3)',
                      flexShrink: 0,
                    }}>
                      <Icon size={16}/>
                    </div>
                  )}

                  {/* Libellé — jusqu'à 3 lignes, ellipsis si trop long */}
                  <div style={{
                    fontSize: 12, fontWeight: 700,
                    color: '#FFF8F2',
                    lineHeight: 1.3, // un peu plus de respiration (avant 1.25)
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    wordBreak: 'break-word',
                    // hyphens permet à des mots très longs de se couper proprement
                    hyphens: 'auto',
                  }}>
                    {page.label}
                  </div>
                </button>
              )
            }

            // ── DESKTOP : liste verticale classique ────────────────────
            return (
              <button key={page.id} onClick={() => handleNavigate(page.id)}
                title={isCollapsed ? page.label : undefined}
                style={navBtn(isActive, isAlert)}>
                {Icon && (
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <Icon size={16} style={{ color: 'inherit' }}/>
                    {isCollapsed && badgeCount > 0 && (
                      <span style={{
                        position: 'absolute', top: -4, right: -4,
                        width: 8, height: 8, borderRadius: '50%',
                        background: isAlert ? 'var(--red)' : 'var(--coral)',
                        border: `1px solid ${sidebarBg}`,
                      }}/>
                    )}
                  </div>
                )}
                {label(page.label)}
                {!isCollapsed && badgeCount > 0 && (
                  <span style={{
                    background: isAlert ? 'var(--red)' : 'var(--coral)',
                    color: isAlert ? '#fff' : (isDark ? '#2A1810' : '#fff'),
                    borderRadius: 4,
                    fontSize: 10, padding: '2px 6px', fontWeight: 700, flexShrink: 0,
                  }}>
                    {badgeCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Section mobile : rôle + actions */}
        {isMobile && (
          <div style={{ borderTop: `0.5px solid ${dividerColor}`, padding: '6px 8px', flexShrink: 0 }}>
            <div style={{ padding: '6px 10px', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 4, background: roleColor + '30', color: roleColor, filter: 'brightness(1.3)' }}>
                {roleName}
              </span>
            </div>
            {[
              { icon: isDark ? <Sun size={16}/> : <Moon size={16}/>, label: isDark ? 'Mode clair' : 'Mode sombre', onClick: onToggleDark },
              ...(isAdmin ? [{ icon: <Palette size={16}/>, label: 'Studio', onClick: () => { onMobileClose?.(); setTimeout(() => onStudio?.(), 50) }, active: studioOpen }] : []),
            ].map((item, i) => (
              <button key={i} onClick={item.onClick} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font)', fontSize: 13,
                color: item.active ? navTextActive : navTextColor,
                background: item.active ? navBgActive : 'transparent',
                minHeight: 36,
              }}>
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Bouton journal d'audit */}
        <div style={{ padding: isCollapsed ? '4px' : '4px 8px', flexShrink: 0, borderTop: `0.5px solid ${dividerColor}` }}>
          <button
            onClick={onAudit}
            title="Journal d'audit"
            style={{
              display: 'flex', alignItems: 'center',
              gap: isCollapsed ? 0 : 8,
              width: '100%',
              padding: isCollapsed ? '9px 0' : '9px 12px',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              borderRadius: 8, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 13,
              color: auditOpen ? navTextActive : navTextColor,
              background: auditOpen ? navBgActive : 'transparent',
              transition: 'background .15s', minHeight: 40,
            }}
          >
            <ClipboardList size={16} style={{ flexShrink: 0 }}/>
            {label("Journal d'audit")}
          </button>
        </div>

        {/* À propos — visible déployé */}
        {!isCollapsed && (
          <div style={{ padding: '8px 14px 6px', flexShrink: 0 }}>
            <div style={{ borderTop: `0.5px solid ${dividerColor}`, paddingTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,248,242,0.65)', marginBottom: 2 }}>{APP_FULL_LABEL}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,248,242,0.45)', marginBottom: 4 }}>Développée par <strong style={{ color: 'rgba(255,248,242,0.65)' }}>Maison Ylla</strong></div>
              {/* Numéro de build — change à chaque déploiement Vercel */}
              <div
                title="Numéro de build (change à chaque déploiement)"
                style={{
                  fontSize: 9, color: 'rgba(255,248,242,0.40)',
                  fontFamily: 'monospace', letterSpacing: '0.02em',
                }}>
                Build {APP_VERSION_LABEL}
              </div>
            </div>
          </div>
        )}

        {/* Bouton déconnexion */}
        <div style={{ borderTop: `0.5px solid ${dividerColor}`, padding: isCollapsed ? '8px 4px' : '8px', flexShrink: 0 }}>
          <button onClick={onLogout} title="Se déconnecter" style={{
            display: 'flex', alignItems: 'center',
            gap: isCollapsed ? 0 : 8,
            width: '100%', padding: isCollapsed ? '9px 0' : '9px 12px',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            borderRadius: 8, border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 13,
            color: '#FFB89B', background: 'transparent', transition: 'background .15s', minHeight: 36,
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,80,80,0.15)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <LogOut size={16} style={{ flexShrink: 0 }}/>
            {label('Se déconnecter')}
          </button>
        </div>
      </aside>

      {/* Bouton flottant externe pour redéployer la sidebar quand collapsée
          (PC uniquement). Positionné à la jonction sidebar/contenu. */}
      {!isMobile && isCollapsed && (
        <button onClick={toggle}
          title="Déployer le menu"
          aria-label="Déployer le menu"
          style={{
            position: 'fixed',
            top: 80,
            left: 56 - 14, // sidebar collapsée fait 56px, on dépasse de 14
            width: 28, height: 36,
            borderRadius: '0 8px 8px 0',
            background: 'var(--marine, #003048)',
            border: 'none',
            color: '#FFF8F2',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 50,
            boxShadow: '2px 0 8px rgba(0,0,0,0.20)',
            transition: 'background .15s, transform .15s',
            WebkitTapHighlightColor: 'transparent',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#004060'
            e.currentTarget.style.transform = 'translateX(2px)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--marine, #003048)'
            e.currentTarget.style.transform = 'translateX(0)'
          }}>
          <ChevronRight size={16}/>
        </button>
      )}
    </>
  )
}
