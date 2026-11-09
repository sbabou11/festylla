/**
 * pages/admin/settings/rapportSections.js
 * Sections du rapport de clôture et leurs filtres (clés alignées sur api/rapport-pdf.py).
 */

// ─── Configuration du rapport de clôture (Lot 2 — filtres par section) ──
// Permet au super_admin de choisir quelles sections inclure ET de configurer
// des filtres par section (période, statuts, types, montants, etc.).
// Stocké dans events/{eventId}/settings/global.rapportSections.
// Clés sémantiques alignées avec le backend Python (cf. api/rapport-pdf.py).
// La couverture est toujours incluse.
//
// Structure : { recap: { enabled: bool, periodFrom: 'YYYY-MM-DD'|'', periodTo: '' },
//               transactions: { enabled: bool, periodFrom, periodTo, types: [], minEur: '', maxEur: '' },
//               ... }
//
// Migration Lot 1 → Lot 2 : si une section est un booléen (ancien format),
// on la convertit automatiquement en { enabled: bool } sans filtres.
export const RAPPORT_SECTIONS_KEYS = [
  { key: 'resultat',     label: 'Compte de résultat consolidé',     desc: 'Bilan financier : recettes (cashless + expo) − dépenses (cachets + bénévoles)',
    filters: [] },
  { key: 'finances',     label: "Dépenses & recettes d'organisation", desc: 'Détail des mouvements financiers manuels (courses, subventions, sponsors…)',
    filters: [] },
  { key: 'recap',        label: 'Récapitulatif financier',         desc: 'KPIs principaux + répartition par type de transaction',
    filters: ['period', 'fields'],
    availableFields: [
      { key: 'kpi_ventes',   label: 'KPI · CA Total ventes' },
      { key: 'kpi_credits',  label: 'KPI · Total rechargé' },
      { key: 'kpi_soldes',   label: 'KPI · Soldes restants' },
      { key: 'kpi_ecart',    label: 'KPI · Écart comptable' },
      { key: 'kpi_benev',    label: 'KPI · Coût bénévoles' },
      { key: 'kpi_ca_net',   label: 'KPI · CA Net événement' },
      { key: 'tab_repartition', label: 'Table : Répartition par type' },
    ] },
  { key: 'graphics',     label: 'Analyse graphique',                desc: 'Graphique en barres des transactions par type + KPIs de performance',
    filters: ['period', 'fields'],
    availableFields: [
      { key: 'bar_chart',    label: 'Graphique : volume par type' },
      { key: 'pie_chart',    label: 'Graphique : répartition (camembert)' },
      { key: 'kpi_taux',     label: 'KPI · Taux retrait réservations' },
      { key: 'kpi_ticket',   label: 'KPI · Ticket moyen' },
      { key: 'kpi_solde_moy',label: 'KPI · Solde moyen par spectateur' },
      { key: 'kpi_nb_spec',  label: 'KPI · Nb spectateurs avec solde' },
    ] },
  { key: 'articles',     label: 'Top articles vendus',              desc: 'Classement des articles les plus vendus + statistiques menu',
    filters: ['period', 'topN', 'articleSelection', 'categorieSelection', 'totalRow', 'fields'],
    availableFields: [
      { key: 'charts',  label: 'Graphiques (CA + quantités)' },
      { key: 'rank',    label: 'Colonne : Rang #' },
      { key: 'nom',     label: 'Colonne : Article' },
      { key: 'qty',     label: 'Colonne : Unités vendues' },
      { key: 'ca',      label: 'Colonne : CA généré' },
      { key: 'pct',     label: 'Colonne : % du CA total' },
      { key: 'stock',   label: 'Colonne : Stock restant' },
    ] },
  { key: 'stats',        label: 'Statistiques par staff',           desc: 'Volume et nombre de transactions par membre du staff',
    filters: ['period', 'staffSelection', 'staffExclude', 'totalRow', 'fields'],
    availableFields: [
      { key: 'charts',  label: 'Graphiques (bar + camembert)' },
      { key: 'email',   label: 'Colonne : Staff (email)' },
      { key: 'nb',      label: 'Colonne : Nb transactions' },
      { key: 'volume',  label: 'Colonne : Volume total' },
      { key: 'credits', label: 'Colonne : Nb crédits' },
      { key: 'debits',  label: 'Colonne : Nb débits' },
    ] },
  { key: 'transactions', label: 'Détail des transactions',          desc: 'Liste complète et chronologique de toutes les transactions',
    filters: ['period', 'txTypes', 'amountRange', 'totalRow', 'fields'],
    availableFields: [
      { key: 'date',    label: 'Colonne : Date' },
      { key: 'heure',   label: 'Colonne : Heure' },
      { key: 'type',    label: 'Colonne : Type' },
      { key: 'who',     label: 'Colonne : Bénéficiaire' },
      { key: 'label',   label: 'Colonne : Libellé' },
      { key: 'montant', label: 'Colonne : Montant' },
      { key: 'staff',   label: 'Colonne : Staff' },
    ] },
  { key: 'spectateurs',  label: 'Spectateurs & soldes',             desc: 'Liste des spectateurs et leurs soldes non consommés',
    filters: ['soldeRange', 'sortBy', 'spectateurSelection', 'totalRow', 'fields'],
    availableFields: [
      { key: 'id',      label: 'Colonne : ID QR' },
      { key: 'nom',     label: 'Colonne : Nom' },
      { key: 'solde',   label: 'Colonne : Solde restant' },
      { key: 'nb_tx',   label: 'Colonne : Nb transactions' },
      { key: 'recharge',label: 'Colonne : Total rechargé' },
      { key: 'depense', label: 'Colonne : Total dépensé' },
    ] },
  { key: 'reservations', label: 'Réservations',                     desc: 'Toutes les réservations, tous statuts confondus',
    filters: ['resaStatuses', 'resaType', 'totalRow', 'fields'],
    availableFields: [
      { key: 'kpis',    label: 'KPIs en haut (total, retirées, en attente, annulées)' },
      { key: 'code',    label: 'Colonne : Code résa' },
      { key: 'who',     label: 'Colonne : Bénéficiaire' },
      { key: 'type',    label: 'Colonne : Type (spec/benev)' },
      { key: 'items',   label: 'Colonne : Articles' },
      { key: 'total',   label: 'Colonne : Total' },
      { key: 'status',  label: 'Colonne : Statut' },
      { key: 'date',    label: 'Colonne : Date' },
    ] },
  { key: 'benevoles',    label: 'Bénévoles & consommations',        desc: 'Consommations prises en charge par festival pour les bénévoles',
    filters: ['period', 'benevoleSelection', 'totalRow', 'fields'],
    availableFields: [
      { key: 'kpis',    label: 'KPIs (actifs, retirées, coût total)' },
      { key: 'nom',     label: 'Colonne : Bénévole' },
      { key: 'code',    label: 'Colonne : Code résa' },
      { key: 'type',    label: 'Colonne : Type' },
      { key: 'total',   label: 'Colonne : Total' },
      { key: 'items',   label: 'Colonne : Articles' },
      { key: 'date',    label: 'Colonne : Date' },
    ] },
  { key: 'audit',        label: "Journal d'audit",                  desc: "Trace complète des actions admin/staff (création, modification, etc.)",
    filters: ['period', 'auditActions', 'auditUserTypes', 'fields'],
    availableFields: [
      { key: 'date',     label: 'Colonne : Date' },
      { key: 'heure',    label: 'Colonne : Heure' },
      { key: 'action',   label: 'Colonne : Action' },
      { key: 'userType', label: 'Colonne : Type user' },
      { key: 'label',    label: 'Colonne : Libellé' },
      { key: 'staff',    label: 'Colonne : Staff' },
    ] },
]
// Construit l'état par défaut : enabled: true + filtres vides
// fields: null par défaut = toutes les colonnes activées (rétro-compat).
// Si l'admin coche/décoche → on stocke la liste explicite.
export const buildDefaultSections = () => Object.fromEntries(
  RAPPORT_SECTIONS_KEYS.map(s => [s.key, {
    enabled: true,
    periodFrom: '', periodTo: '',
    topN: 20,
    staffExclude: [],
    txTypes: [],          // [] = tous types
    minEur: '', maxEur: '',
    soldeMinEur: '', soldeMaxEur: '',
    sortBy: 'solde',      // solde | nom | tx
    resaStatuses: [],     // [] = tous statuts
    resaType: 'all',      // all | spec | benev
    auditActions: [],     // [] = toutes
    auditUserTypes: [],   // [] = tous
    fields: null,         // null = toutes les colonnes (Lot 3)
    // Lot Custom A : sélection précise d'items (null = pas de filtre, [] = aucun, [ids] = explicite)
    articleSelection: null,
    // Lot Custom A2 : sélection précise par catégorie d'articles (null/[]/array de noms catégories)
    categorieSelection: null,
    // Lot Custom A2 : sélection précise de spectateurs (par id FY-XXXX)
    spectateurSelection: null,
    // Lot Custom A2 : sélection précise de bénévoles (par benevoleId)
    benevoleSelection: null,
    // Lot Custom A3 : sélection précise de staff (par email)
    staffSelection: null,
    // Lot Custom A : configuration de la ligne de total (par défaut désactivée)
    totalRow: {
      enabled: false,
      label: 'Total',
      position: 'bottom',   // bottom | top
      columns: [],          // colonnes à sommer (ex: ['qty', 'ca'])
      // Lot Custom A2 : sous-totaux par groupe
      groupBy: null,        // null = pas de regroupement, 'categorie' pour articles
      subtotalLabel: 'Sous-total', // label des lignes de sous-total
    },
  }])
)
// Convertit l'ancien format (Lot 1 : juste booléens) vers le nouveau.
// Si déjà au bon format, retourne tel quel en gérant les clés manquantes.
export const normalizeSections = (raw) => {
  if (!raw || typeof raw !== 'object') return buildDefaultSections()
  const result = buildDefaultSections()
  for (const key of Object.keys(result)) {
    const incoming = raw[key]
    if (typeof incoming === 'boolean') {
      // Ancien format Lot 1 : juste un booléen
      result[key] = { ...result[key], enabled: incoming }
    } else if (incoming && typeof incoming === 'object') {
      // Nouveau format Lot 2 : merge avec les défauts pour rétro-compat
      result[key] = { ...result[key], ...incoming }
    }
    // Sinon laisse les défauts
  }
  return result
}
