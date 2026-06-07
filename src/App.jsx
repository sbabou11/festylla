/**
 * App.jsx — v5 responsive
 * Mobile : boutons studio/offline/rôle déplacés dans la sidebar
 */
import React, { useState, useEffect, useRef, Suspense, lazy } from 'react'
import { Sun, Moon, Palette, WifiOff, Menu, ArrowLeft } from 'lucide-react'
import NotifBell from './components/NotifBell'
import EventSelector from './components/EventSelector'
import AuditPanel from './components/AuditPanel'
import { useNotifications } from './hooks/useNotifications'
import { useFCM }           from './hooks/useFCM'
import Sidebar  from './components/Sidebar'
import Studio   from './components/Studio'
import Avatar   from './components/Avatar'
import UpdateBanner from './components/UpdateBanner'
import PageTransition from './components/PageTransition'
import { useTheme }      from './hooks/useTheme'
import { useOffline }    from './hooks/useOffline'
import { useFirestore }  from './hooks/useFirestore'
import { useBreakpoint } from './hooks/useBreakpoint'
import TeamChat from './components/TeamChat'
import useAuthStore, { ROLE_HOME, ROLE_PAGES } from './store/useAuthStore'
import useAppStore from './store/useAppStore'
import { setCurrentEvent } from './firebase/service'
import useEventStore from './store/useEventStore'

const PAGES = {
  evenements:           lazy(() => import('./pages/admin/Evenements')),
  accueil:              lazy(() => import('./pages/admin/Accueil')),
  benevoles:            lazy(() => import('./pages/admin/Benevoles')),
  'qr-entree':          lazy(() => import('./pages/admin/QrEntree')),
  analytics:            lazy(() => import('./pages/admin/Analytics')),
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
  evenements: 'Événements', accueil: 'Accueil', analytics: 'Analytics', 'qr-entree': 'QR code entrée', benevoles: 'Bénévoles', alertes: 'Alertes financières',
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
const Borne        = lazy(() => import('./pages/public/Borne'))
const EcranPublic  = lazy(() => import('./pages/public/EcranPublic'))

export default function App() {
  const path = window.location.pathname
  // Détermine le contenu de la route
  const content = (() => {
    if (path === '/live') {
      return <Suspense fallback={<Loader />}><LivePlanning /></Suspense>
    }
    if (path === '/artiste') {
      return <Suspense fallback={<Loader />}><EspaceArtiste /></Suspense>
    }
    if (path === '/demo') {
      return <Suspense fallback={<Loader />}><DemoLogin /></Suspense>
    }
    if (path === '/benevole') {
      return <Suspense fallback={<Loader />}><BenevoleApp /></Suspense>
    }
    // Borne self-service pour spectateurs au stand (Lot 1 borne)
    // Usage : /borne?ev=<eventId>&stand=<numéro-optionnel>
    if (path === '/borne') {
      return <Suspense fallback={<Loader />}><Borne /></Suspense>
    }
    // Écran public d'affichage des commandes prêtes (pour TV/grand écran au stand)
    // Usage : /ecran?ev=<eventId>
    if (path === '/ecran') {
      return <Suspense fallback={<Loader />}><EcranPublic /></Suspense>
    }
    if (path === '/inscription' || path === '/register') {
      return <Suspense fallback={<Loader />}><Inscription /></Suspense>
    }
    if (path === '/solde' || path === '/balance' || path === '/spectateur') {
      return <Suspense fallback={<Loader />}><SoldePage /></Suspense>
    }
    // Toutes les autres URLs → app staff (affiche Login si non connecté)
    return <ErrorBoundary><StaffApp /></ErrorBoundary>
  })()

  return (
    <>
      {content}
      <UpdateBanner/>
    </>
  )
}

function StaffApp() {
  const { user, logout, checkSession, espaceChoisi, setEspaceChoisi: setEspaceStore } = useAuthStore()
  const { theme, toggleDark }          = useTheme()
  const { isOffline, syncNow, toggleSimulate } = useOffline()
  const { loading, error }             = useFirestore()
  React.useEffect(() => { preloadLibs() }, []) // Préchargement PDF/XLS en background
  const { staff, spectateurs, logs }   = useAppStore()
  const { isMobile, isTablet }         = useBreakpoint()
  const { currentEventId: notifEventId } = useEventStore()
  const { notifications, nonLuCount, marquerToutLu } = useNotifications({ isStaff: true, staffId: user?.id, staffRole: user?.role, eventId: notifEventId })
  useFCM() // Push notifications natives

  const [page, setPage]                     = useState(null)
  // Page parente (hub depuis lequel on est arrivé) — sert à afficher la flèche retour
  // dans le header. Set quand un hub appelle navigate(pageId, hubId), reset au reset
  // espace ou navigation manuelle via sidebar.
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

  // Initialisation de la page au login
  useEffect(() => { if (user && !page) setPage(ROLE_HOME[user.role] || 'accueil') }, [user])

  // Reset à la page d'accueil du rôle à chaque changement d'espace (staff ↔ bénévole).
  // Évite qu'un utilisateur revienne sur une page "interne" qu'il avait laissée
  // avant de switcher (ex : transactions → switch bénévole → retour → tomberait
  // sur transactions au lieu du dashboard).
  // Voir la conversation de la session pour le contexte.
  const prevEspaceRef = useRef(null)
  useEffect(() => {
    if (!user) return
    // Premier rendu : on ne touche pas (l'init au login est déjà gérée plus haut)
    if (prevEspaceRef.current === null) {
      prevEspaceRef.current = espaceChoisi
      return
    }
    // Changement effectif d'espace → toujours retour à la home du rôle
    // (Accueil pour staff, Mon profil pour bénévole — défini dans ROLE_HOME).
    // Comportement cohérent avec ce qui se passe à la connexion.
    if (prevEspaceRef.current !== espaceChoisi) {
      prevEspaceRef.current = espaceChoisi
      setPage(ROLE_HOME[user.role] || 'accueil')
      setParentPage(null)
      setStudioOpen(false)
      setAuditOpen(false)
      setMobileMenuOpen(false)
    }
  }, [espaceChoisi, user])

  useEffect(() => { if (!isMobile) setMobileMenuOpen(false) }, [isMobile])

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

  /**
   * Navigation entre pages.
   * @param {string} pid    - ID de la page cible
   * @param {string} [parentId] - Optionnel : ID du hub depuis lequel on vient.
   *                              Si fourni, affichera une flèche retour dans le header.
   */
  const navigate = (pid, parentId = null) => {
    if (!ROLE_PAGES[user.role]?.includes(pid)) return
    setPage(pid)
    // Si on navigue VERS un hub ou la page d'accueil, on reset le parent
    // pour partir d'un état propre.
    const HUB_PAGES = ['accueil', 'operations', 'equipe-hub', 'spectateurs-hub', 'gestion-artistes', 'finances']
    if (HUB_PAGES.includes(pid)) {
      setParentPage(null)
    } else {
      setParentPage(parentId || null)
    }
    setStudioOpen(false)
  }

  /** Retour à la page parente (hub) depuis une page cible — déclenché par la flèche. */
  const goBackToParent = () => {
    if (parentPage) {
      setPage(parentPage)
      setParentPage(null)
      setStudioOpen(false)
    }
  }

  const currentPage   = page || ROLE_HOME[user.role]
  const PageComponent = PAGES[currentPage]
  const staffPerson   = staff.find(s => s.id === user.id)
  const roleColor     = ROLE_COLOR[user.role] || '#888'

  const alertCount = (user.role === 'admin' || user.role === 'super_admin') ? (() => {
    // Récupérer les alertes acquittées depuis localStorage (IDs définis dans Alertes.jsx)
    let acquittees = new Set()
    try {
      const stored = localStorage.getItem('yllatok-alertes-acquittees')
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

  const btn = (extra = {}) => ({
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '5px 9px',
    border: '0.5px solid var(--border2)',
    borderRadius: 8,
    background: 'var(--bg2)',
    color: 'var(--muted)',
    fontSize: 12, cursor: 'pointer',
    fontFamily: 'var(--font)',
    ...extra,
  })

  return (
    <div style={{ fontFamily: 'var(--font)', minHeight: '100vh' }}>

      {/* Offline bar */}
      {isOffline && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: '#FAEEDA', borderBottom: '0.5px solid #EF9F27', fontSize: 12, color: '#854F0B' }}>
          <WifiOff size={13} /> Hors-ligne — synchronisation au retour du réseau
          <button onClick={syncNow} style={{ marginLeft: 'auto', padding: '3px 8px', border: '0.5px solid #EF9F27', borderRadius: 6, background: '#fff', color: '#854F0B', fontSize: 11, cursor: 'pointer' }}>
            Forcer sync
          </button>
        </div>
      )}

      {/* Shell */}
      <div style={{
        display: 'flex',
        border: isMobile ? 'none' : '0.5px solid var(--border2)',
        borderRadius: isMobile ? 0 : 16,
        minHeight: '100vh',
        position: 'relative',
      }}>

        {/* Sidebar — reçoit toutes les props nécessaires pour le mode mobile */}
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
          isOffline={isOffline}
          onToggleOffline={toggleSimulate}
          isAdmin={user.role === 'admin' || user.role === 'super_admin'}
          onStudio={() => setStudioOpen(o => !o)}
          studioOpen={studioOpen}
          onAudit={() => setAuditOpen(true)}
          auditOpen={auditOpen}
        />

        {/* Main */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          minWidth: 0, background: 'var(--bg)', transition: 'background .25s',
        }}>

          {/* Topbar — épurée, essentiel uniquement */}
          <div style={{
            height: 56,
            padding: '0 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--bg)',
            gap: 8, flexShrink: 0,
          }}>
            {/* Gauche : hamburger (mobile) + flèche retour (si page parente) + titre page */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {isMobile && (
                <button onClick={() => setMobileMenuOpen(true)}
                  className="btn-icon nav-btn" style={{ width: 36, height: 36 }}>
                  <Menu size={18}/>
                </button>
              )}
              {/* Flèche retour : visible quand on est dans une sous-page accédée
                  depuis un hub (operations / equipe-hub / etc.) */}
              {parentPage && (
                <button onClick={goBackToParent}
                  title={`Retour à ${PAGE_TITLES[parentPage] || parentPage}`}
                  aria-label={`Retour à ${PAGE_TITLES[parentPage] || parentPage}`}
                  style={{
                    width: 36, height: 36,
                    borderRadius: 8,
                    border: '0.5px solid var(--border)',
                    background: 'var(--bg2)',
                    color: 'var(--text)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0,
                    transition: 'background .15s, transform .15s',
                    WebkitTapHighlightColor: 'transparent',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--bg3, var(--bg2))'
                    e.currentTarget.style.transform = 'translateX(-2px)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'var(--bg2)'
                    e.currentTarget.style.transform = 'translateX(0)'
                  }}>
                  <ArrowLeft size={18}/>
                </button>
              )}
              <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                <span style={{
                  fontSize: 16, fontWeight: 700, color: 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {PAGE_TITLES[currentPage] || currentPage}
                </span>
                {/* Badge événement actif */}
                {(() => {
                  const evStore = useEventStore.getState()
                  const ev = evStore.events?.find(e => e.id === evStore.currentEventId)
                  if (!ev) return null
                  const c = ev.couleur || '#1a6b7a'
                  return (
                    <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:c+'22', color:c, border:`1px solid ${c}44`, whiteSpace:'nowrap', flexShrink:0, display: isMobile ? 'none' : 'inline-flex', alignItems:'center', gap:5 }}>
                      {ev.logoSrc
                        ? <img src={ev.logoSrc} alt="" style={{ width:14, height:14, borderRadius:3, objectFit:'cover' }}/>
                        : ev.emoji
                      } {ev.nom}
                    </span>
                  )
                })()}
              </div>
            </div>

            {/* Droite — 3 boutons max */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>

              {/* Cloche notifications */}
              <NotifBell
                notifications={notifications}
                nonLuCount={nonLuCount}
                onMarkAllRead={marquerToutLu}
              />

              {/* Dark mode — desktop uniquement (mobile : dans le menu gauche) */}
              {!isMobile && (
                <button onClick={toggleDark} className="btn-icon nav-btn"
                  style={{ width: 36, height: 36 }} title={theme.isDark ? 'Mode clair' : 'Mode sombre'}>
                  {theme.isDark ? <Sun size={16}/> : <Moon size={16}/>}
                </button>
              )}

              {/* Studio — admin desktop uniquement (mobile : dans la sidebar) */}
              {(user.role === 'admin' || user.role === 'super_admin') && !isMobile && (
                <button onClick={() => setStudioOpen(o => !o)}
                  className="btn-icon nav-btn"
                  style={{ width: 36, height: 36,
                    background: studioOpen ? 'var(--brand)' : undefined,
                    color: studioOpen ? '#fff' : undefined,
                    borderColor: studioOpen ? 'var(--brand)' : undefined,
                  }} title="Studio">
                  <Palette size={16}/>
                </button>
              )}

              {/* Switch espace bénévole — si double profil */}
              {user.benevoleDocId && (
                <button onClick={() => setEspaceChoisi('benev')}
                  title="Basculer vers mon espace bénévole"
                  className="btn-icon nav-btn"
                  style={{ width:36, height:36, fontSize:18 }}>
                  🙋
                </button>
              )}

              {/* Avatar → Mon profil */}
              <button onClick={() => navigate('mon-profil')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  display: 'flex', minHeight: 'auto' }}>
                <Avatar nom={user.nom} src={staffPerson?.avatar || user.avatar} size={32}/>
              </button>

            </div>
          </div>

          {/* Contenu page — animation à chaque changement de page */}
          <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? 10 : 16 }}>
            <PageTransition pageKey={currentPage}>
              <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Chargement…</div>}>
                {PageComponent
                  ? <PageComponent onNavigate={navigate} view={user.role} />
                  : <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>
                      Page non disponible pour le rôle «{user.role}»
                    </div>
                }
              </Suspense>
            </PageTransition>
          </div>
        </div>

        {/* Journal d'audit */}
        <AuditPanel open={auditOpen} onClose={() => setAuditOpen(false)} />

        {/* Studio panel — desktop : dans le shell | mobile : overlay plein écran */}
        {/* Chat équipe (v7) — pour tous les staff connectés avec un événement actif */}
        {evStore.currentEventId && (
          <TeamChat
            eventId={evStore.currentEventId}
            currentUser={{ uid: user.id, id: user.id, nom: user.nom, role: user.role }}
            brandColor={roleColor}
            isAdmin={user.role === 'admin' || user.role === 'super_admin'}
          />
        )}

        {studioOpen && (user.role === 'admin' || user.role === 'super_admin') && !isMobile && (
          <Studio onClose={() => setStudioOpen(false)} />
        )}
        {studioOpen && (user.role === 'admin' || user.role === 'super_admin') && isMobile && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 110,
            background: 'var(--bg)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
              <button onClick={() => setStudioOpen(false)}
                style={{ border:'none', background:'none', cursor:'pointer', color:'var(--text)', fontSize:18, lineHeight:1, padding:'2px 6px' }}>
                ✕
              </button>
              <span style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>Studio</span>
            </div>
            <div style={{ flex:1, overflowY:'auto' }}>
              <Studio onClose={() => setStudioOpen(false)} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
