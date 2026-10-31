import React, { useState } from 'react'
import {
  LayoutDashboard, Bookmark, Users, List, UtensilsCrossed, BadgeCheck, Calendar, CalendarDays,
  Settings, PlusCircle, QrCode, Package, ShoppingCart, Wallet, User,
  Music, BarChart3, AlertTriangle, ChevronLeft, ChevronRight, X, LogOut,
  Sun, Moon, Palette, WifiOff, Wifi, ClipboardList, ArrowLeftRight,
} from 'lucide-react'
import useAppStore   from '../store/useAppStore'
import useEventStore from '../store/useEventStore'
import { setCurrentEvent } from '../firebase/service'
import { ROLE_PAGES } from '../store/useAuthStore'
import { useBreakpoint }   from '../hooks/useBreakpoint'
import { useOfflineQueue } from '../hooks/useOfflineQueue'

const ALL_PAGES = {
  evenements:           { icon: Calendar,        label: 'Événements' },
  dashboard:            { icon: LayoutDashboard, label: 'Tableau de bord' },
  analytics:            { icon: BarChart3,       label: 'Analytics',             badge: false },
  alertes:              { icon: AlertTriangle,   label: 'Alertes financières',   badge: 'alertes' },
  planning:             { icon: CalendarDays,     label: 'Planning Festival' },
  'qr-entree':          { icon: QrCode,          label: 'QR code entrée' },
  benevoles:            { icon: Users,           label: 'Bénévoles' },
  'reservations-admin': { icon: Bookmark,        label: 'Réservations',          badge: true },
  spectateurs:          { icon: Users,           label: 'Spectateurs' },
  transactions:         { icon: List,            label: 'Transactions' },
  menu:                 { icon: UtensilsCrossed, label: 'Carte & menu' },
  staff:                { icon: BadgeCheck,      label: 'Équipe' },
  settings:             { icon: Settings,        label: 'Paramètres' },
  credit:               { icon: PlusCircle,      label: 'Créditer' },
  nouveau:              { icon: QrCode,          label: 'Nouveau QR' },
  retrait:              { icon: Package,         label: 'Retrait réservation',   badge: true },
  debit:                { icon: ShoppingCart,    label: 'Encaisser' },
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
  const pages        = allowed.map(id => ({ id, ...ALL_PAGES[id] })).filter(p => p.label)
  const pendingCount = reservations.filter(r => r.status === 'pending' || r.status === 'ready').length
  const roleName     = BUILTIN_NAMES[view] || customRole?.nom || view
  const roleColor    = ROLE_COLOR[view] || '#888'

  const isCollapsed = isMobile ? false : collapsed
  const w           = isMobile ? 260 : isCollapsed ? 56 : 220

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
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100,
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          boxShadow: mobileOpen ? '4px 0 24px rgba(0,0,0,0.30)' : 'none',
        } : {}),
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
              <img src="/logo.png" alt="Y" style={{ width: 28, height: 28, objectFit: 'contain' }} onError={e => {
                e.target.style.display = 'none'
                e.target.parentElement.innerHTML = '<span style="color:#fff;font-weight:800;font-size:15px">Y</span>'
              }}/>
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
          {isCollapsed && !isMobile && (
            <button onClick={toggle} title="Déplier" style={{
              position: 'absolute', top: 18, right: 6,
              width: 18, height: 18, borderRadius: 4,
              border: 'none', background: 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'rgba(255,248,242,0.55)',
            }}>
              <ChevronRight size={11}/>
            </button>
          )}
        </div>

        {/* Nav */}
        <nav style={{ padding: isCollapsed ? '6px 4px' : 8, flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {pages.map(page => {
            const Icon       = page.icon
            const isActive   = currentPage === page.id
            const badgeCount = page.badge === 'alertes' ? alertCount : page.badge ? pendingCount : 0
            const isAlert    = page.badge === 'alertes' && badgeCount > 0

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
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,248,242,0.65)', marginBottom: 2 }}>YllaCash v1.0 · 05/2026</div>
              <div style={{ fontSize: 10, color: 'rgba(255,248,242,0.45)' }}>Développée par <strong style={{ color: 'rgba(255,248,242,0.65)' }}>Maison Ylla</strong></div>
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
    </>
  )
}
