/**
 * components/dashboard/widgetRegistry.js
 *
 * Registry central des widgets disponibles dans le dashboard composable.
 *
 * Pour ajouter un nouveau widget :
 *   1. Créer le composant dans components/dashboard/widgets/MonWidget.jsx
 *   2. L'enregistrer ici avec son metadata (label, icon, defaultSize, etc.)
 *
 * Chaque widget reçoit en props :
 *   - id (string)        : identifiant unique du widget dans le layout
 *   - widget (object)    : entrée widget complète (type, options...)
 *   - editMode (boolean) : si le mode édition est actif (affichage différent éventuel)
 *
 * Les données (spectateurs, logs, etc.) sont récupérées via useAppStore
 * dans chaque widget (pas de prop drilling).
 */
import { lazy } from 'react'
import { Receipt, AlertTriangle, List, Users, TrendingUp, Package, Calendar, Wallet, Mic, ShoppingCart } from 'lucide-react'

// Widgets — lazy load pour ne pas tout charger d'un coup
const WRecettesJour    = lazy(() => import('./widgets/WRecettesJour'))
const WAlertes         = lazy(() => import('./widgets/WAlertes'))
const WTransactions    = lazy(() => import('./widgets/WTransactions'))
const WSpectateurs     = lazy(() => import('./widgets/WSpectateurs'))
const WTopArticles     = lazy(() => import('./widgets/WTopArticles'))
const WStocks          = lazy(() => import('./widgets/WStocks'))
const WDepenses        = lazy(() => import('./widgets/WDepenses'))
const WReservations    = lazy(() => import('./widgets/WReservations'))
const WBenevoles       = lazy(() => import('./widgets/WBenevoles'))
const WCachets         = lazy(() => import('./widgets/WCachets'))
const WPlanning        = lazy(() => import('./widgets/WPlanning'))

export const WIDGET_REGISTRY = {
  'recettes-jour': {
    Component: WRecettesJour,
    label: 'Recettes du jour',
    description: 'CA, panier moyen, ticket',
    icon: Receipt,
    iconBg: 'var(--brand-light)',
    iconColor: 'var(--brand)',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
  },
  'alertes': {
    Component: WAlertes,
    label: 'Alertes',
    description: 'Anomalies financières',
    icon: AlertTriangle,
    iconBg: 'var(--amber-light)',
    iconColor: 'var(--amber-dark, #854F0B)',
    defaultSize: { w: 6, h: 2 },
    minSize: { w: 3, h: 2 },
  },
  'transactions': {
    Component: WTransactions,
    label: 'Transactions',
    description: 'Total et du jour',
    icon: List,
    iconBg: 'var(--bg2)',
    iconColor: 'var(--text)',
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 3, h: 2 },
  },
  'spectateurs': {
    Component: WSpectateurs,
    label: 'Spectateurs',
    description: 'Inscrits, actifs',
    icon: Users,
    iconBg: 'var(--bg2)',
    iconColor: 'var(--text)',
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 3, h: 2 },
  },
  // ─── Session B ─────────────────────────────────────────────────────
  'top-articles': {
    Component: WTopArticles,
    label: 'Top articles',
    description: 'Best-sellers du jour',
    icon: TrendingUp,
    iconBg: 'var(--bg2)',
    iconColor: 'var(--text)',
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
  },
  'stocks': {
    Component: WStocks,
    label: 'Stocks',
    description: 'Ruptures et stocks bas',
    icon: Package,
    iconBg: 'var(--amber-light)',
    iconColor: 'var(--amber-dark, #854F0B)',
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 2 },
  },
  'depenses': {
    Component: WDepenses,
    label: 'Dépenses récentes',
    description: 'Derniers mouvements',
    icon: Wallet,
    iconBg: 'var(--bg2)',
    iconColor: 'var(--text)',
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 2 },
  },
  'reservations': {
    Component: WReservations,
    label: 'Réservations',
    description: 'En attente / à retirer',
    icon: Calendar,
    iconBg: 'var(--bg2)',
    iconColor: 'var(--text)',
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 3, h: 2 },
  },
  'benevoles': {
    Component: WBenevoles,
    label: 'Bénévoles',
    description: 'Inscrits et actifs',
    icon: Users,
    iconBg: 'var(--bg2)',
    iconColor: 'var(--text)',
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 3, h: 2 },
  },
  // ─── Session C ─────────────────────────────────────────────────────
  'cachets': {
    Component: WCachets,
    label: 'Cachets',
    description: 'À payer et payés',
    icon: Mic,
    iconBg: 'var(--amber-light)',
    iconColor: 'var(--amber-dark, #854F0B)',
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 2 },
  },
  'planning': {
    Component: WPlanning,
    label: 'Planning',
    description: 'Prochains créneaux',
    icon: Calendar,
    iconBg: 'var(--bg2)',
    iconColor: 'var(--text)',
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
  },
}

// Retourne la liste pour le panneau de bibliothèque
export const getAvailableWidgets = () =>
  Object.entries(WIDGET_REGISTRY).map(([type, def]) => ({
    type,
    label: def.label,
    description: def.description,
    icon: def.icon,
    iconBg: def.iconBg,
    iconColor: def.iconColor,
  }))

export const getWidgetDef = (type) => WIDGET_REGISTRY[type] || null
