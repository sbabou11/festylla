/**
 * App.jsx — v5 responsive
 * Mobile : barre du bas (4 pages du rôle + « Plus » qui ouvre le menu complet)
 * Changement de page : transition douce via l'API View Transitions quand elle existe
 */
import React, { useState, useEffect, Suspense, lazy } from 'react'
import { flushSync } from 'react-dom'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { Sun, Moon, Palette, WifiOff, Search, X, HandHeart, ArrowLeft } from 'lucide-react'
import CommandPalette from './components/CommandPalette'
import './utils/pendingSales' // envoie au démarrage les encaissements restés en attente
import { ToastViewport, Skeleton } from './ui'
import shell from './App.module.css'
import NotifBell from './components/NotifBell'
import EventSelector from './components/EventSelector'
import AuditPanel from './components/AuditPanel'
import { useNotifications } from './hooks/useNotifications'
import { useFCM }           from './hooks/useFCM'
import Sidebar  from './components/Sidebar'
import BottomNav from './components/BottomNav'
import Studio   from './components/Studio'
import Avatar   from './components/Avatar'
import UpdateBanner from './components/UpdateBanner'
import { useTheme }      from './hooks/useTheme'
import { useOffline }    from './hooks/useOffline'
import { useFirestore }  from './hooks/useFirestore'
import { useBreakpoint } from './hooks/useBreakpoint'
import TeamChat from './components/TeamChat'
import useAuthStore, { ROLE_HOME } from './store/useAuthStore'
import useAppStore from './store/useAppStore'
import { setCurrentEvent } from './firebase/service'
import useEventStore from './store/useEventStore'

// Hubs : y arriver efface la page parente (pas de flèche retour)
const HUB_PAGES = ['accueil', 'operations', 'equipe-hub', 'spectateurs-hub', 'gestion-artistes', 'finances']

const PAGES = {
  evenements:           lazy(() => import('./pages/admin/Evenements')),
  accueil:              lazy(() => import('./pages/admin/Accueil')),
  dashboard:            lazy(() => import('./pages/admin/Dashboard')),
  benevoles:            lazy(() => import('./pages/admin/Benevoles')),
  'qr-entree':          lazy(() => import('./pages/admin/QrEntree')),
  analytics:            lazy(() => import('./pages/admin/Analytics')),
  cloture:              lazy(() => import('./pages/admin/Cloture')),
  alertes:              lazy(() => import('./pages/admin/Alertes')),
  comptabilite:         lazy(() => import('./pages/admin/Comptabilite')),
  operations:           lazy(() => import('./pages/admin/Operations')),
  'equipe-hub':         lazy(() => import('./pages/admin/EquipeHub')),
  'spectateurs-hub':    lazy(() => import('./pages/admin/SpectateursHub')),
  cachets:              lazy(() => import('./pages/admin/Cachets')),
  'gestion-artistes':   lazy(() => import('./pages/admin/GestionArtistes')),
  exposants:            lazy(() => import('./pages/admin/Exposants')),
  finances:             lazy(() => import('./pages/admin/Finances')),
  'editeur-template':   lazy(() => import('./pages/admin/InvoiceTemplateEditor')),
  planning:             lazy(() => import('./pages/admin/Planning')),
  'reservations-admin': lazy(() => import('./pages/admin/Reservations')),
  spectateurs:          lazy(() => import('./pages/admin/Spectateurs')),
  transactions:         lazy(() => import('./pages/admin/Transactions')),
  menu:                 lazy(() => import('./pages/admin/Menu')),
  staff:                lazy(() => import('./pages/admin/Staff')),
  settings:             lazy(() => import('./pages/admin/Settings')),
  credit:               lazy(() => import('./pages/billetterie/Credit')),
  nouveau:              lazy(() => import('./pages/billetterie/Nouveau')),
  remboursement:        lazy(() => import('./pages/billetterie/Remboursement')),
  retrait:              lazy(() => import('./pages/stand/Retrait')),
  debit:                lazy(() => import('./pages/stand/Debit')),
  'prendre-commande':   lazy(() => import('./pages/stand/PrendreCommande')),
  'retrait-commande':   lazy(() => import('./pages/stand/RetraitCommande')),
  cuisine:              lazy(() => import('./pages/stand/Cuisine')),
  'mon-qr':             lazy(() => import('./pages/spectateur/MonQr')),
  'mes-reservations':   lazy(() => import('./pages/spectateur/MesReservations')),
  solde:                lazy(() => import('./pages/spectateur/Solde')),
  carte:                lazy(() => import('./pages/spectateur/Carte')),
  'mon-profil':         lazy(() => import('./pages/shared/MonProfil')),
}

const PAGE_TITLES = {
  evenements: 'Événements', accueil: 'Accueil', dashboard: 'Tableau de bord', analytics: 'Analytics', 'qr-entree': 'QR code entrée', cloture: 'Clôture de caisse', benevoles: 'Bénévoles', alertes: 'Alertes financières',
  'reservations-admin': 'Réservations', spectateurs: 'Spectateurs', transactions: 'Transactions',
  cachets: 'Cachets artistes',
  comptabilite: 'Comptabilité',
  operations: 'Opérations',
  'equipe-hub': 'Équipe & Bénévoles',
  'spectateurs-hub': 'Spectateurs & Accès',
  'gestion-artistes': 'Gestion des artistes',
  exposants: 'Exposants',
  finances: 'Finances',
  'editeur-template': 'Éditeur template facture',
  menu: 'Carte & menu', staff: 'Équipe', settings: 'Paramètres', credit: 'Créditer',
  nouveau: 'Nouveau QR', retrait: 'Retrait réservation', debit: 'Encaisser',
  remboursement: 'Remboursement',
  'prendre-commande': 'Prendre commande',
  'retrait-commande': 'Retrait commande',
  cuisine: 'Cuisine',
  'mon-qr': 'Mon QR code', 'mes-reservations': 'Mes réservations', solde: 'Mon solde',
  carte: 'La carte', 'mon-profil': 'Mon profil',
}

const ROLE_COLOR = {
  super_admin: '#F07848', admin: '#F07848', billetterie: '#0E8D7A', stand: '#D89030', consultation: '#888780', directeur_artistique: '#5EB8E4',
}

// Loader avec message évolutif + bouton recharger si bloqué (>10s)
const Loader = ({ msg = 'Chargement…' }) => {
  const [phase, setPhase] = React.useState(0) // 0 = ok, 1 = lent, 2 = bloqué
  React.useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 3000)
    const t2 = setTimeout(() => setPhase(2), 10000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])
  const displayMsg = phase === 0 ? msg
    : phase === 1 ? 'Première connexion un peu lente…'
    : 'Le chargement semble bloqué.'
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 14, padding: 20, textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 48, height: 48 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,144,144,0.25)', overflow: 'hidden' }}>
          <img src="/logo.png" alt="Maison Ylla" style={{ width: 40, height: 40, objectFit: 'contain' }}
            onError={e => {
              // Fallback texte si le logo ne charge pas (mode dégradé)
              e.target.style.display = 'none'
              e.target.parentElement.innerHTML = '<span style="color:#fff;font-size:18px;font-weight:800;letter-spacing:-.02em">MY</span>'
            }}/>
        </div>
        <div style={{ position: 'absolute', inset: -6, border: '2px solid var(--brand)', borderTopColor: 'transparent', borderRadius: 14, animation: 'ycSpin 0.8s linear infinite' }}/>
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>{displayMsg}</div>
      {phase === 2 && (
        <button onClick={() => window.location.reload()}
          style={{ padding: '8px 16px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
          Recharger la page
        </button>
      )}
    </div>
  )
}


// Pendant le chargement d'une page : sa silhouette plutôt qu'un texte
const PageSkeleton = () => (
  <div className={shell.skeleton} aria-busy="true" aria-label="Chargement de la page">
    <div className={shell.skeletonStats}>
      {[0, 1, 2, 3].map(i => <Skeleton key={i} height={92} radius={12} />)}
    </div>
    <Skeleton height={18} width="30%" />
    <Skeleton lines={6} height={14} />
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
const EspaceSelector = lazy(() => import('./pages/auth/EspaceSelector'))
const BenevoleApp  = lazy(() => import('./pages/public/BenevoleApp'))
const SoldePage    = lazy(() => import('./pages/public/SoldePage'))
const Inscription  = lazy(() => import('./pages/public/Inscription'))
const DemoLogin    = lazy(() => import('./pages/auth/DemoLogin'))
const LivePlanning = lazy(() => import('./pages/public/LivePlanning'))
const EspaceArtiste = lazy(() => import('./pages/public/EspaceArtiste'))
const UiGallery     = import.meta.env.DEV ? lazy(() => import('./pages/dev/UiGallery')) : null
const DevDashboard  = import.meta.env.DEV ? lazy(() => import('./pages/dev/DevDashboard')) : null
const DevCaisse     = import.meta.env.DEV ? lazy(() => import('./pages/dev/DevCaisse')) : null
const DevSolde      = import.meta.env.DEV ? lazy(() => import('./pages/dev/DevSolde')) : null
const DevBenevole   = import.meta.env.DEV ? lazy(() => import('./pages/dev/DevBenevole')) : null
const DevLive       = import.meta.env.DEV ? lazy(() => import('./pages/dev/DevLive')) : null
const DevLogin      = import.meta.env.DEV ? lazy(() => import('./pages/dev/DevAuth').then(m => ({ default: m.DevLogin }))) : null
const DevEspace     = import.meta.env.DEV ? lazy(() => import('./pages/dev/DevAuth').then(m => ({ default: m.DevEspace }))) : null

const page = (el) => <Suspense fallback={<Loader />}>{el}</Suspense>
const Borne        = lazy(() => import('./pages/public/Borne'))
const EcranPublic  = lazy(() => import('./pages/public/EcranPublic'))

export default function App() {
  return (
    <>
    <Routes>
      {/* Pages publiques (sans connexion staff) */}
      <Route path="/live"        element={page(<LivePlanning />)} />
      <Route path="/artiste"     element={page(<EspaceArtiste />)} />
      <Route path="/demo"        element={page(<DemoLogin />)} />
      <Route path="/benevole"    element={page(<BenevoleApp />)} />
      {/* Borne self-service au stand : /borne?ev=<eventId>&stand=<numéro> */}
      <Route path="/borne"       element={page(<Borne />)} />
      {/* Écran TV des commandes prêtes : /ecran?ev=<eventId> */}
      <Route path="/ecran"       element={page(<EcranPublic />)} />
      <Route path="/inscription" element={page(<Inscription />)} />
      <Route path="/register"    element={page(<Inscription />)} />
      <Route path="/solde"       element={page(<SoldePage />)} />
      <Route path="/balance"     element={page(<SoldePage />)} />
      <Route path="/spectateur"  element={page(<SoldePage />)} />
      {UiGallery && <Route path="/ui" element={page(<UiGallery />)} />}
      {DevDashboard && <Route path="/ui/dashboard" element={page(<DevDashboard />)} />}
      {DevCaisse && <Route path="/ui/caisse" element={page(<DevCaisse />)} />}
      {DevSolde && <Route path="/ui/spectateur" element={page(<DevSolde />)} />}
      {DevBenevole && <Route path="/ui/benevole" element={page(<DevBenevole />)} />}
      {DevLive && <Route path="/ui/live" element={page(<DevLive />)} />}
      {DevLogin && <Route path="/ui/connexion" element={page(<DevLogin />)} />}
      {DevEspace && <Route path="/ui/espace" element={page(<DevEspace />)} />}
      {/* Toutes les autres URLs → app staff (affiche Login si non connecté).
          Chaque page staff a son adresse : /dashboard, /debit, /spectateurs… */}
      <Route path="*" element={<ErrorBoundary><StaffApp /></ErrorBoundary>} />
    </Routes>
    {/* Un seul conteneur de toasts pour toutes les pages, publiques comme staff */}
    <ToastViewport />
    <UpdateBanner />
    </>
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
  const { staff, spectateurs, logs, roles } = useAppStore()
  const { isMobile, isTablet }         = useBreakpoint()
  const { currentEventId: notifEventId } = useEventStore()
  const { notifications, nonLuCount, marquerToutLu } = useNotifications({ isStaff: true, staffId: user?.id, staffRole: user?.role, eventId: notifEventId })
  useFCM() // Push notifications natives

  // Hub depuis lequel on est arrivé : affiche la flèche retour dans la barre du haut
  const [parentPage, setParentPage]         = useState(null)
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
      <Suspense fallback={<Loader />}>
        <EspaceSelector
          user={user}
          onStaff={() => setEspaceChoisi('staff')}
          onBenev={() => setEspaceChoisi('benev')}
          onLogout={logout}
        />
      </Suspense>
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

  // 2e argument : une recherche d'URL ('?x=1') ou l'id du hub d'origine (flèche retour)
  const navigate = (pid, arg = '') => {
    if (!canAccessPage(pid)) return
    const search = typeof arg === 'string' && arg.startsWith('?') ? arg : ''
    const parent = arg && !search && !HUB_PAGES.includes(pid) ? arg : null
    const go = () => { routerNavigate(`/${pid}${search}`); setParentPage(parent); setStudioOpen(false); setMobileMenuOpen(false) }
    // Seul le contenu (view-transition-name: page) glisse ; rien si l'utilisateur réduit les animations
    const animate = pid !== currentPage && document.startViewTransition
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (animate) document.startViewTransition(() => flushSync(go)).ready.catch(() => {}) // onglet masqué : transition ignorée
    else go()
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
            {parentPage && (
              <button type="button" onClick={() => navigate(parentPage)} className={shell.iconBtn}
                title={`Retour à ${PAGE_TITLES[parentPage] || parentPage}`} aria-label={`Retour à ${PAGE_TITLES[parentPage] || parentPage}`}>
                <ArrowLeft size={18} />
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
            <Suspense fallback={<PageSkeleton />}>
              {PageComponent
                ? <PageComponent onNavigate={navigate} view={user.role} />
                : <div className={shell.pageLoading}>Page non disponible pour le rôle « {user.role} »</div>}
            </Suspense>
          </main>
        </div>

        {/* Téléphone : barre du bas ; « Plus » ouvre le menu complet (pages, thème, Studio, déconnexion) */}
        {isMobile && (
          <BottomNav
            role={user.role}
            customPages={roles?.find(r => r.id === user.role)?.pages}
            currentPage={currentPage}
            onNavigate={navigate}
            onMore={() => setMobileMenuOpen(true)}
            canAccess={canAccessPage}
            badges={{ alertes: alertCount }}
          />
        )}

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
    </div>
  )
}
