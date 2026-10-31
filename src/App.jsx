/**
 * App.jsx — v5 responsive
 * Mobile : boutons studio/offline/rôle déplacés dans la sidebar
 */
import React, { useState, useEffect, Suspense, lazy } from 'react'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { Sun, Moon, Palette, WifiOff, Menu, Search, X, HandHeart } from 'lucide-react'
import CommandPalette from './components/CommandPalette'
import './utils/pendingSales' // envoie au démarrage les encaissements restés en attente
import { ToastViewport } from './ui'
import shell from './App.module.css'
import NotifBell from './components/NotifBell'
import EventSelector from './components/EventSelector'
import AuditPanel from './components/AuditPanel'
import { useNotifications } from './hooks/useNotifications'
import { useFCM }           from './hooks/useFCM'
import Sidebar  from './components/Sidebar'
import Studio   from './components/Studio'
import Avatar   from './components/Avatar'
import { useTheme }      from './hooks/useTheme'
import { useOffline }    from './hooks/useOffline'
import { useFirestore }  from './hooks/useFirestore'
import { useBreakpoint } from './hooks/useBreakpoint'
import TeamChat from './components/TeamChat'
import useAuthStore, { ROLE_HOME } from './store/useAuthStore'
import useAppStore from './store/useAppStore'
import { setCurrentEvent } from './firebase/service'
import useEventStore from './store/useEventStore'

const PAGES = {
  evenements:           lazy(() => import('./pages/admin/Evenements')),
  dashboard:            lazy(() => import('./pages/admin/Dashboard')),
  benevoles:            lazy(() => import('./pages/admin/Benevoles')),
  'qr-entree':          lazy(() => import('./pages/admin/QrEntree')),
  analytics:            lazy(() => import('./pages/admin/Analytics')),
  alertes:              lazy(() => import('./pages/admin/Alertes')),
  planning:             lazy(() => import('./pages/admin/Planning')),
  'reservations-admin': lazy(() => import('./pages/admin/Reservations')),
  spectateurs:          lazy(() => import('./pages/admin/Spectateurs')),
  transactions:         lazy(() => import('./pages/admin/Transactions')),
  menu:                 lazy(() => import('./pages/admin/Menu')),
  staff:                lazy(() => import('./pages/admin/Staff')),
  settings:             lazy(() => import('./pages/admin/Settings')),
  credit:               lazy(() => import('./pages/billetterie/Credit')),
  nouveau:              lazy(() => import('./pages/billetterie/Nouveau')),
  retrait:              lazy(() => import('./pages/stand/Retrait')),
  debit:                lazy(() => import('./pages/stand/Debit')),
  'mon-qr':             lazy(() => import('./pages/spectateur/MonQr')),
  'mes-reservations':   lazy(() => import('./pages/spectateur/MesReservations')),
  solde:                lazy(() => import('./pages/spectateur/Solde')),
  carte:                lazy(() => import('./pages/spectateur/Carte')),
  'mon-profil':         lazy(() => import('./pages/shared/MonProfil')),
}

const PAGE_TITLES = {
  evenements: 'Événements', dashboard: 'Tableau de bord', analytics: 'Analytics', 'qr-entree': 'QR code entrée', benevoles: 'Bénévoles', alertes: 'Alertes financières',
  'reservations-admin': 'Réservations', spectateurs: 'Spectateurs', transactions: 'Transactions',
  menu: 'Carte & menu', staff: 'Équipe', settings: 'Paramètres', credit: 'Créditer',
  nouveau: 'Nouveau QR', retrait: 'Retrait réservation', debit: 'Encaisser',
  'mon-qr': 'Mon QR code', 'mes-reservations': 'Mes réservations', solde: 'Mon solde',
  carte: 'La carte', 'mon-profil': 'Mon profil',
}

const ROLE_COLOR = {
  super_admin: '#F07848', admin: '#F07848', billetterie: '#0E8D7A', stand: '#D89030', consultation: '#888780', directeur_artistique: '#5EB8E4',
}

const Loader = ({ msg = 'Chargement…' }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: 14, color: 'var(--muted)', flexDirection: 'column', gap: 12 }}>
    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>Y</span>
    </div>
    {msg}
  </div>
)


// Préchargement des librairies lourdes en background au démarrage
const preloadLibs = () => {
  setTimeout(() => {
    if (!window.jspdf) {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
      s.onload = () => {
        const s2 = document.createElement('script')
        s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
        document.head.appendChild(s2)
      }
      document.head.appendChild(s)
    }
  }, 3000)
}


// ── Sélecteur d'espace : staff avec profil bénévole ───────────────
function EspaceSelector({ user, onStaff, onBenev, onLogout }) {
  const BRAND = '#1a6b7a'
  const roleLabels = {
    stand:        'Stand',
    billetterie:  'Billetterie',
    admin:        'Admin',
    super_admin:  'Super Admin',
    consultation: 'Consultation',
    directeur_artistique: 'Directeur Artistique',
  }
  const roleSubtitles = {
    stand:        'Caisse, encaissements',
    billetterie:  'Recharges, nouveaux comptes',
    admin:        'Caisse, encaissements',
    super_admin:  'Gestion complète',
    consultation: 'Consultation',
    directeur_artistique: 'Gestion du planning festival',
  }
  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0d3d47 0%,#1a6b7a 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:'system-ui,sans-serif' }}>
      <div style={{ width:'100%', maxWidth:400 }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:64, height:64, borderRadius:18, background:'rgba(255,255,255,.15)', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
            <img src="/logo.png" alt="YllaCash" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e=>e.target.style.display='none'}/>
          </div>
          <div style={{ fontSize:26, fontWeight:800, color:'#fff', letterSpacing:'-.01em' }}>YllaCash</div>
          <div style={{ fontSize:14, color:'rgba(255,255,255,.7)', marginTop:6 }}>
            Bonjour <strong>{user.nom}</strong> 👋
          </div>
        </div>

        {/* Carte sélecteur */}
        <div style={{ background:'#fff', borderRadius:20, padding:28, boxShadow:'0 20px 60px rgba(0,0,0,.25)' }}>
          <div style={{ fontSize:16, fontWeight:700, color:'#0d2d33', marginBottom:6, textAlign:'center' }}>
            Dans quel espace souhaitez-vous entrer ?
          </div>
          <div style={{ fontSize:13, color:'#64748b', marginBottom:24, textAlign:'center' }}>
            Votre compte est associé à deux espaces.
          </div>

          {/* Espace staff */}
          <button onClick={onStaff} style={{ width:'100%', padding:'18px 20px', borderRadius:14, border:'2px solid #e2e8f0', background:'#f8fafc', cursor:'pointer', textAlign:'left', marginBottom:12, transition:'border-color .15s', fontFamily:'system-ui' }}
            onMouseEnter={e=>e.currentTarget.style.borderColor=BRAND}
            onMouseLeave={e=>e.currentTarget.style.borderColor='#e2e8f0'}>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:44, height:44, borderRadius:12, background:'#e1f5ee', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>🎪</div>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:'#0d2d33', marginBottom:2 }}>Espace staff</div>
                <div style={{ fontSize:12, color:'#64748b' }}>{roleLabels[user.role] || user.role} · {roleSubtitles[user.role] || 'Espace personnel'}</div>
              </div>
              <div style={{ marginLeft:'auto', fontSize:18, color:'#cbd5e1' }}>›</div>
            </div>
          </button>

          {/* Espace bénévole */}
          <button onClick={onBenev} style={{ width:'100%', padding:'18px 20px', borderRadius:14, border:'2px solid #e2e8f0', background:'#f8fafc', cursor:'pointer', textAlign:'left', transition:'border-color .15s', fontFamily:'system-ui' }}
            onMouseEnter={e=>e.currentTarget.style.borderColor='#534AB7'}
            onMouseLeave={e=>e.currentTarget.style.borderColor='#e2e8f0'}>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:44, height:44, borderRadius:12, background:'#ede9fe', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>🙋</div>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:'#0d2d33', marginBottom:2 }}>Mon espace bénévole</div>
                <div style={{ fontSize:12, color:'#64748b' }}>Réservations, quotas repas &amp; boissons</div>
              </div>
              <div style={{ marginLeft:'auto', fontSize:18, color:'#cbd5e1' }}>›</div>
            </div>
          </button>

          {/* Déconnexion */}
          <button onClick={onLogout} style={{ width:'100%', marginTop:20, padding:'10px', border:'none', background:'none', color:'#94a3b8', fontSize:13, cursor:'pointer', fontFamily:'system-ui' }}>
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  )
}


class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('💥 App crash:', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'system-ui', color: '#a32d2d', background: '#fff' }}>
          <h2>Erreur de chargement</h2>
          <pre style={{ fontSize: 12, background: '#fef2f2', padding: 16, borderRadius: 8, overflow: 'auto' }}>
            {this.state.error?.message}\n{this.state.error?.stack}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '8px 20px', background: '#1a6b7a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Recharger
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const LoginPage    = lazy(() => import('./pages/auth/Login'))
const BenevoleApp  = lazy(() => import('./pages/public/BenevoleApp'))
const SoldePage    = lazy(() => import('./pages/public/SoldePage'))
const Inscription  = lazy(() => import('./pages/public/Inscription'))
const DemoLogin    = lazy(() => import('./pages/auth/DemoLogin'))
const LivePlanning = lazy(() => import('./pages/public/LivePlanning'))
const EspaceArtiste = lazy(() => import('./pages/public/EspaceArtiste'))
const UiGallery     = import.meta.env.DEV ? lazy(() => import('./pages/dev/UiGallery')) : null
const DevDashboard  = import.meta.env.DEV ? lazy(() => import('./pages/dev/DevDashboard')) : null
const DevCaisse     = import.meta.env.DEV ? lazy(() => import('./pages/dev/DevCaisse')) : null

const page = (el) => <Suspense fallback={<Loader />}>{el}</Suspense>

export default function App() {
  return (
    <Routes>
      {/* Pages publiques (sans connexion staff) */}
      <Route path="/live"        element={page(<LivePlanning />)} />
      <Route path="/artiste"     element={page(<EspaceArtiste />)} />
      <Route path="/demo"        element={page(<DemoLogin />)} />
      <Route path="/benevole"    element={page(<BenevoleApp />)} />
      <Route path="/inscription" element={page(<Inscription />)} />
      <Route path="/register"    element={page(<Inscription />)} />
      <Route path="/solde"       element={page(<SoldePage />)} />
      <Route path="/balance"     element={page(<SoldePage />)} />
      <Route path="/spectateur"  element={page(<SoldePage />)} />
      {UiGallery && <Route path="/ui" element={page(<UiGallery />)} />}
      {DevDashboard && <Route path="/ui/dashboard" element={page(<DevDashboard />)} />}
      {DevCaisse && <Route path="/ui/caisse" element={page(<DevCaisse />)} />}
      {/* Toutes les autres URLs → app staff (affiche Login si non connecté).
          Chaque page staff a son adresse : /dashboard, /debit, /spectateurs… */}
      <Route path="*" element={<ErrorBoundary><StaffApp /></ErrorBoundary>} />
    </Routes>
  )
}

// Remet l'URL en accord avec la page affichée (adresse inconnue, page non autorisée, "/")
function UrlSync({ pageId }) {
  const location = useLocation()
  const routerNavigate = useNavigate()
  useEffect(() => {
    if (location.pathname !== `/${pageId}`) {
      routerNavigate({ pathname: `/${pageId}`, search: location.search }, { replace: true })
    }
  }, [pageId, location.pathname])
  return null
}

function StaffApp() {
  const { user, logout, checkSession, espaceChoisi, setEspaceChoisi: setEspaceStore, canAccessPage } = useAuthStore()
  const location       = useLocation()
  const routerNavigate = useNavigate()
  const { theme, toggleDark }          = useTheme()
  const { isOffline, syncNow, toggleSimulate } = useOffline()
  const { loading, error }             = useFirestore()
  React.useEffect(() => { preloadLibs() }, []) // Préchargement PDF/XLS en background
  const { staff, spectateurs, logs }   = useAppStore()
  const { isMobile, isTablet }         = useBreakpoint()
  const { currentEventId: notifEventId } = useEventStore()
  const { notifications, nonLuCount, marquerToutLu } = useNotifications({ isStaff: true, staffId: user?.id, staffRole: user?.role, eventId: notifEventId })
  useFCM() // Push notifications natives

  const [studioOpen, setStudioOpen]         = useState(false)
  const [auditOpen, setAuditOpen]           = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  // espaceChoisi vient du store (reset automatique au login/logout)
  const setEspaceChoisi = (val) => setEspaceStore(val)

  useEffect(() => { if (user) checkSession() }, [])

  // Synchroniser l'eventId dans service.js — immédiatement + à chaque changement
  const { currentEventId: evId } = useEventStore()

  useEffect(() => {
    if (evId) setCurrentEvent(evId)
  }, [evId])
  useEffect(() => { if (!isMobile) setMobileMenuOpen(false) }, [isMobile])

  // Recherche globale : Ctrl K (Windows) ou ⌘ K (Mac)
  const [paletteOpen, setPaletteOpen] = useState(false)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!user) {
    return <Suspense fallback={<Loader />}><LoginPage /></Suspense>
  }

  // Bénévole pur → espace bénévole directement
  if (user.isBenevole || user.role === 'benevole') {
    const evId = user.eventId || ''
    return <Suspense fallback={<Loader />}><BenevoleApp docIdProp={user.id} eventIdProp={evId} /></Suspense>
  }

  // Staff avec profil bénévole → sélecteur d'espace (si pas encore choisi)
  if (user.benevoleDocId && !espaceChoisi) {
    return (
      <EspaceSelector
        user={user}
        onStaff={() => setEspaceChoisi('staff')}
        onBenev={() => setEspaceChoisi('benev')}
        onLogout={logout}
      />
    )
  }

  // Staff avec profil bénévole ayant choisi l'espace bénévole
  if (user.benevoleDocId && espaceChoisi === 'benev') {
    return <Suspense fallback={<Loader />}><BenevoleApp docIdProp={user.benevoleDocId} eventIdProp={user.benevoleEventId || ''} onSwitchToStaff={() => setEspaceChoisi('staff')} /></Suspense>
  }

  // Super admin : sélection d'événement si aucun actif
  const evStore = useEventStore.getState()
  const needsEvent = (user.role === 'admin' || user.role === 'super_admin' || user.role === 'directeur_artistique') && !evStore.currentEventId && evStore.events?.length !== 0
  if (error)   return <div style={{ padding: 40, textAlign: 'center', fontSize: 14, color: 'var(--red)' }}>{error}</div>
  if (needsEvent) return <EventSelector onSelect={() => window.location.reload()}/>
  if (loading) return <Loader msg="Connexion à Firebase…" />

  // La page affichée vient de l'URL (/dashboard, /debit…) ; sinon page d'accueil du rôle
  const homePage = ROLE_HOME[user.role] || 'dashboard'
  const urlPage  = decodeURIComponent(location.pathname.split('/')[1] || '')
  const currentPage = (PAGES[urlPage] && canAccessPage(urlPage)) ? urlPage : homePage

  const navigate = (pid, search = '') => {
    if (!canAccessPage(pid)) return
    routerNavigate(`/${pid}${search}`)
    setStudioOpen(false)
  }

  const PageComponent = PAGES[currentPage]
  const staffPerson   = staff.find(s => s.id === user.id)
  const roleColor     = ROLE_COLOR[user.role] || '#888'

  const alertCount = (user.role === 'admin' || user.role === 'super_admin') ? (() => {
    // Récupérer les alertes acquittées depuis localStorage (IDs définis dans Alertes.jsx)
    let acquittees = new Set()
    try {
      const stored = localStorage.getItem('yllacash-alertes-acquittees')
      if (stored) acquittees = new Set(JSON.parse(stored))
    } catch {}

    let n = 0
    // Soldes négatifs — id: neg-${s.id}
    spectateurs.forEach(s => {
      if ((s.solde || 0) < 0 && !acquittees.has(`neg-${s.id}`)) n++
    })
    // Écart global — id: ecart-global
    const tc = (logs || []).filter(t => t.type === 'credit').reduce((a, t) => a + (t.montant || 0), 0)
    const td = (logs || []).filter(t => t.type === 'debit').reduce((a, t) => a + (t.montant || 0), 0)
    const ts = spectateurs.reduce((a, s) => a + (s.solde || 0), 0)
    if (Math.abs(tc - td - ts) > 200 && tc > 0 && !acquittees.has('ecart-global')) n++
    return n
  })() : 0

  const isAdmin     = user.role === 'admin' || user.role === 'super_admin'
  const currentEv   = evStore.events?.find(e => e.id === evStore.currentEventId)

  return (
    <div className={shell.app}>
      <UrlSync pageId={currentPage} />

      {/* Bandeau hors-ligne */}
      {isOffline && (
        <div className={shell.offline} role="status">
          <WifiOff size={14} aria-hidden="true" /> Hors ligne : les opérations sont gardées et seront envoyées au retour du réseau.
          <button type="button" onClick={syncNow} className={shell.offlineBtn}>Forcer la synchro</button>
        </div>
      )}

      <div className={shell.shell}>
        <Sidebar
          view={user.role}
          currentPage={currentPage}
          onNavigate={navigate}
          alertCount={alertCount}
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
          onLogout={logout}
          isDark={theme.isDark}
          onToggleDark={toggleDark}
          isAdmin={isAdmin}
          onStudio={() => setStudioOpen(o => !o)}
          studioOpen={studioOpen}
          onAudit={() => setAuditOpen(true)}
          auditOpen={auditOpen}
        />

        <div className={shell.main}>
          {/* Barre du haut : titre, événement, état, recherche, actions */}
          <header className={shell.bar}>
            {isMobile && (
              <button type="button" onClick={() => setMobileMenuOpen(true)} className={shell.iconBtn} aria-label="Ouvrir le menu">
                <Menu size={18} />
              </button>
            )}
            <h1 className={shell.title}>{PAGE_TITLES[currentPage] || currentPage}</h1>
            {currentEv && !isMobile && (
              <span className={shell.event}>
                {currentEv.logoSrc && <img src={currentEv.logoSrc} alt="" />}
                {currentEv.nom}
              </span>
            )}
            {!isMobile && (
              <span className={isOffline ? shell.stateOff : shell.stateOn}>
                {isOffline ? 'Hors ligne' : 'En direct'}
              </span>
            )}

            <button type="button" className={isMobile ? `${shell.iconBtn} ${shell.pushRight}` : shell.search} onClick={() => setPaletteOpen(true)} aria-label="Rechercher (Ctrl K)">
              <Search size={16} aria-hidden="true" />
              {!isMobile && <span className={shell.searchText}>Chercher un spectateur, un article…</span>}
              {!isMobile && <kbd className={shell.kbd}>Ctrl K</kbd>}
            </button>

            <div className={shell.actions}>
              <NotifBell notifications={notifications} nonLuCount={nonLuCount} onMarkAllRead={marquerToutLu} />
              {!isMobile && (
                <button type="button" onClick={toggleDark} className={shell.iconBtn} title={theme.isDark ? 'Mode clair' : 'Mode sombre'} aria-label={theme.isDark ? 'Mode clair' : 'Mode sombre'}>
                  {theme.isDark ? <Sun size={16} /> : <Moon size={16} />}
                </button>
              )}
              {isAdmin && !isMobile && (
                <button type="button" onClick={() => setStudioOpen(o => !o)} className={studioOpen ? shell.iconBtnOn : shell.iconBtn} title="Studio" aria-label="Studio" aria-pressed={studioOpen}>
                  <Palette size={16} />
                </button>
              )}
              {user.benevoleDocId && (
                <button type="button" onClick={() => setEspaceChoisi('benev')} className={shell.iconBtn} title="Basculer vers mon espace bénévole" aria-label="Basculer vers mon espace bénévole">
                  <HandHeart size={16} />
                </button>
              )}
              <button type="button" onClick={() => navigate('mon-profil')} className={shell.avatarBtn} aria-label="Mon profil">
                <Avatar nom={user.nom} src={staffPerson?.avatar || user.avatar} size={32} />
              </button>
            </div>
          </header>

          {/* Contenu de la page */}
          <main className={shell.content}>
            <Suspense fallback={<div className={shell.pageLoading}>Chargement…</div>}>
              {PageComponent
                ? <PageComponent onNavigate={navigate} view={user.role} />
                : <div className={shell.pageLoading}>Page non disponible pour le rôle « {user.role} »</div>}
            </Suspense>
          </main>
        </div>

        {/* Journal d'audit */}
        <AuditPanel open={auditOpen} onClose={() => setAuditOpen(false)} />

        {/* Chat équipe — pour tous les staff connectés avec un événement actif */}
        {evStore.currentEventId && (
          <TeamChat
            eventId={evStore.currentEventId}
            currentUser={{ uid: user.id, id: user.id, nom: user.nom, role: user.role }}
            brandColor={roleColor}
            isAdmin={isAdmin}
          />
        )}

        {/* Studio — ordinateur : panneau dans le shell | mobile : plein écran */}
        {studioOpen && isAdmin && !isMobile && (
          <Studio onClose={() => setStudioOpen(false)} />
        )}
        {studioOpen && isAdmin && isMobile && (
          <div className={shell.studioMobile}>
            <div className={shell.studioHead}>
              <button type="button" onClick={() => setStudioOpen(false)} className={shell.iconBtn} aria-label="Fermer le Studio">
                <X size={18} />
              </button>
              <span>Studio</span>
            </div>
            <div className={shell.studioBody}>
              <Studio onClose={() => setStudioOpen(false)} />
            </div>
          </div>
        )}
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={navigate}
        canAccessPage={canAccessPage}
      />
      <ToastViewport />
    </div>
  )
}
