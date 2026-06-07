/**
 * pages/admin/Settings.jsx — v3
 * Super admin : paramètres + exports + réinitialisation complète événement
 */
import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Download, Upload, FileSpreadsheet, Wand2, Save, AlertTriangle, ShieldAlert, Eye, EyeOff, FileText, Plus, Trash2, Building2, Tag, Palette, Receipt } from 'lucide-react'
import TransferList from '../../components/TransferList'
import DiagnosticTransactions from '../../components/DiagnosticTransactions'
import CustomPagesEditor from '../../components/CustomPagesEditor'
import { useExport }             from '../../hooks/useExport'
import { migrerVersV2 }          from '../../utils/migrationV2'
import { migrerVersEvenement }   from '../../utils/migrationRacineVersEvent'
import useEventStore             from '../../store/useEventStore'
import { useRapportCloture } from '../../hooks/useRapportCloture'
import useAppStore   from '../../store/useAppStore'
import useAuthStore from '../../store/useAuthStore'
import PushDiagnostic from '../../components/PushDiagnostic'
import UpdateDiagnostic from '../../components/UpdateDiagnostic'
import { db } from '../../firebase/config'
import {
  collection, getDocs, deleteDoc, doc,
  writeBatch, addDoc, serverTimestamp,
} from 'firebase/firestore'
import { getSettings, saveSettings } from '../../firebase/service'
import {
  getRememberedTemplateId, clearRememberedTemplateId,
} from '../../components/expo/InvoiceTemplatePicker'

// ── Réinitialisation complète Firebase ──────────────────────────────────────
// Toutes les collections dans events/{id} qui peuvent être réinitialisées
// Le champ `group` permet de regrouper visuellement dans l'UI
const EVENT_COLS = {
  // Argent & opérations
  spectateurs:    { label: 'Comptes spectateurs & soldes', group: 'argent',  racine: false },
  transactions:   { label: 'Transactions financières',     group: 'argent',  racine: false },
  reservations:   { label: 'Réservations spectateurs',     group: 'argent',  racine: false },
  cachets:        { label: 'Cachets artistes & décharges', group: 'argent',  racine: false },
  // Programmation
  planning:       { label: "Créneaux du planning (artistes)", group: 'progra', racine: false },
  'artist-consumptions': { label: 'Consommations artistes (droits)', group: 'progra', racine: false },
  'artist-reservations': { label: 'Réservations artistes',          group: 'progra', racine: false },
  'scheduled-reminders': { label: 'Rappels planifiés (balance/prestation)', group: 'progra', racine: false },
  // Bénévoles
  benevoles:      { label: 'Bénévoles (comptes)',           group: 'beneve',  racine: false },
  'volunteer-posts':  { label: 'Postes de bénévoles',       group: 'beneve',  racine: false },
  'volunteer-shifts': { label: 'Créneaux & affectations bénévoles', group: 'beneve', racine: false },
  // Catalogue
  menu:           { label: 'Carte & menu',                  group: 'cat', racine: false },
  categories:     { label: 'Catégories de menu',            group: 'cat', racine: false, withRoot: true },
  // Communication
  notifications:  { label: 'Notifications',                 group: 'comm', racine: false },
  'team-chat':    { label: 'Messages chat équipe',          group: 'comm', racine: false },
  'team-chat-typing': { label: 'Indicateurs "est en train d\'écrire"', group: 'comm', racine: false },
  'walkie-chunks':{ label: 'Talkie-walkie (extraits audio)',group: 'comm', racine: false },
  // Administration
  staff:          { label: 'Équipe / staff (comptes)',      group: 'admin', racine: false, withRoot: true },
  roles:          { label: 'Rôles personnalisés',           group: 'admin', racine: false },
  audit:          { label: "Journal d'audit",               group: 'admin', racine: false },
  settings:       { label: "Paramètres et thème de l'événement", group: 'admin', racine: false, settingsDoc: true },
}

// Libellés des groupes (affichage seulement)
const EVENT_COL_GROUPS = {
  argent: { label: '💳 Argent & opérations', desc: 'Soldes, achats, réservations' },
  progra: { label: '🎤 Programmation',        desc: 'Créneaux artistes et leurs droits' },
  beneve: { label: '🦺 Bénévoles',            desc: 'Comptes, postes, planning' },
  cat:    { label: '🍔 Catalogue',            desc: 'Carte et catégories' },
  comm:   { label: '💬 Communication',        desc: 'Notifications, chat, walkie' },
  admin:  { label: '🔧 Administration',       desc: 'Équipe, rôles, audit, paramètres' },
}

async function resetEventData(eventId, toDelete = []) {
  if (!eventId) throw new Error('Aucun événement sélectionné')
  if (!toDelete.length) throw new Error('Aucun élément sélectionné')

  const deleteAll = async (docs) => {
    for (let i = 0; i < docs.length; i += 499) {
      const batch = writeBatch(db)
      docs.slice(i, i + 499).forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
  }

  for (const col of toDelete) {
    const cfg = EVENT_COLS[col]
    if (!cfg) continue

    if (cfg.settingsDoc) {
      // Document unique events/{id}/settings/global
      const { deleteDoc, doc: docRef } = await import('firebase/firestore')
      await deleteDoc(docRef(db, 'events', eventId, 'settings', 'global')).catch(() => {})

    } else if (cfg.racine) {
      // Collection globale en racine uniquement
      const snap = await getDocs(collection(db, col))
      await deleteAll(snap.docs)

    } else {
      // Collection dans l'événement
      const snapEvent = await getDocs(collection(db, 'events', eventId, col))
      await deleteAll(snapEvent.docs)

      if (cfg.withRoot) {
        // Supprimer aussi le fallback racine (ex: /staff avant migration)
        const snapRoot = await getDocs(collection(db, col))
        await deleteAll(snapRoot.docs)
      }
    }
  }

  // Log (sauf si on supprime l'audit lui-même)
  if (!toDelete.includes('audit')) {
    await addDoc(collection(db, 'events', eventId, 'audit'), {
      action: 'RESET_EVENT',
      elements: toDelete,
      date: new Date().toISOString(),
      createdAt: serverTimestamp(),
    })
  }
}

export default function Settings({ onNavigate }) {
  const { theme, updateTheme } = useAppStore()
  // Liste du staff pour les filtres du rapport (Lot 2 — staffExclude)
  const staff = useAppStore(s => s.staff)
  // Liste du menu pour la sélection précise des articles (Lot Custom A)
  const menu = useAppStore(s => s.menu)
  // Listes pour Lot Custom A2 — sélections précises supplémentaires
  const categories = useAppStore(s => s.categories)
  const spectateurs = useAppStore(s => s.spectateurs)
  const reservations = useAppStore(s => s.reservations)
  // Transactions (logs) pour l'aperçu temps réel des tableaux custom (Lot Custom B)
  const logs = useAppStore(s => s.logs)
  const { user }               = useAuthStore()
  const { currentEventId }     = useEventStore()
  const { exportTransactionsCsv, exportRapportExcel, exportAuditCsv } = useExport()
  const { generer: genererRapportCloture } = useRapportCloture()
  const [generatingPdf, setGeneratingPdf] = useState(false)
  // Lot 2b — État d'ouverture de la modale de génération avec override
  const [showGenerateModal, setShowGenerateModal] = useState(false)

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
  const RAPPORT_SECTIONS_KEYS = [
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
  const buildDefaultSections = () => Object.fromEntries(
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
  const normalizeSections = (raw) => {
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
  const [rapportSections, setRapportSections] = useState(() => buildDefaultSections())
  // Lot Custom B — Pages personnalisées du rapport
  // Stocké dans settings.rapportCustomPages : [{ id, titre, sousTitre, position, tables: [] }]
  const [rapportCustomPages, setRapportCustomPages] = useState([])
  // Sauvegarde (debounce léger via simple persist immédiat — les pages changent rarement)
  const saveCustomPages = async (next) => {
    setRapportCustomPages(next)
    try {
      await saveSettings({ rapportCustomPages: next }, currentEventId)
    } catch (e) { console.error('saveCustomPages:', e) }
  }
  // Panneau de config replié par défaut (pour ne pas encombrer la vue)
  const [rapportConfigOpen, setRapportConfigOpen] = useState(false)
  // Quelle section est dépliée pour montrer ses filtres (null = aucune)
  const [expandedSection, setExpandedSection] = useState(null)
  const [migratingV2,   setMigratingV2]   = useState(false)
  const [migrV2Log,     setMigrV2Log]     = useState([])
  const [migrV2Done,    setMigrV2Done]    = useState(false)
  const [migrating,     setMigrating]     = useState(false)
  const [migrLog,       setMigrLog]       = useState([])
  const [migrDone,      setMigrDone]      = useState(false)

  const [festName, setFestName]     = useState(theme?.festName || 'YllaCash')
  const [saved, setSaved]           = useState(false)
  const [exporting, setExporting]   = useState(null)

  // ─── Module Exposants (Lot 1) ────────────────────────────────────
  // Thématiques d'exposition prédéfinies : [{ id, label, tarif (centimes) }]
  // Coordonnées de l'organisateur : pour génération factures/décharges PDF (Lot 4)
  // Chargées depuis events/{eventId}/settings/global au montage du composant.
  const [expoThematiques, setExpoThematiques] = useState([])
  const [organisateur, setOrganisateur] = useState({
    raisonSociale: '', adresse: '', codePostal: '', ville: '',
    pays: 'France', siret: '', tva: '',
    iban: '', bic: '', banque: '',
    email: '', telephone: '', siteWeb: '',
  })
  const [expoSaved, setExpoSaved] = useState(false)
  const [orgSaved, setOrgSaved] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  // ─── Identité visuelle (logo + couleur principale) pour les PDF ──
  // logoDataUrl : base64 PNG/JPEG (stocké directement dans settings, pas Storage,
  // car limité à ~200 Ko après compression côté navigateur ; suffit pour un logo de PDF).
  const [logoDataUrl, setLogoDataUrl] = useState('')
  const [brandColor, setBrandColor]   = useState('#1a6b7a')
  const [identiteVisSaved, setIdentiteVisSaved] = useState(false)

  // ─── Templates de décharge ───────────────────────────────────────
  // Un template définit un texte de décharge réutilisable (intro, mentions, pied).
  // Liste éditable côté UI + persistée dans settings.dechargeTemplates.
  const [templates, setTemplates] = useState([])
  const [editingTpl, setEditingTpl] = useState(null) // template en cours d'édition (objet ou null)
  const [tplSaved, setTplSaved]   = useState(false)

  // ─── Templates de facture (Lot B3) ────────────────────────────────
  // Liste des templates de facture personnalisés, créés depuis l'éditeur visuel.
  // Affichés ici en lecture seule + actions (éditer/dupliquer/supprimer/défaut).
  const [invoiceTemplates, setInvoiceTemplates] = useState([])

  // ─── TVA (Lot C3) ────────────────────────────────────────────────
  // Configuration TVA au niveau de l'événement :
  //  - tvaActive : si false, aucun calcul TVA, mention 293 B affichée
  //  - tvaDefaultTaux : taux par défaut appliqué aux lignes sans override
  //  - tvaMentionExoneration : texte affiché en bas si pas de TVA
  //  - tvaNumero : N° de TVA intracom de l'organisateur (déjà dans settings.organisateur.tva,
  //                on l'expose ici pour le rappeler dans le contexte TVA)
  const [tvaActive, setTvaActive]                 = useState(false)
  const [tvaDefaultTaux, setTvaDefaultTaux]       = useState(20)
  const [tvaMentionExoneration, setTvaMentionExoneration] = useState('TVA non applicable, art. 293 B du CGI')
  const [tvaSaved, setTvaSaved]                   = useState(false)

  // Charge les settings de l'événement au montage (ou changement d'event)
  useEffect(() => {
    let cancelled = false
    if (!currentEventId) { setSettingsLoaded(true); return }
    getSettings(currentEventId).then(s => {
      if (cancelled) return
      if (Array.isArray(s?.expoThematiques)) setExpoThematiques(s.expoThematiques)
      if (s?.organisateur && typeof s.organisateur === 'object') {
        setOrganisateur(prev => ({ ...prev, ...s.organisateur }))
      }
      // Identité visuelle (Livraison signature)
      if (typeof s?.logoDataUrl === 'string') setLogoDataUrl(s.logoDataUrl)
      if (typeof s?.brandColor === 'string')  setBrandColor(s.brandColor)
      // Templates de décharge
      if (Array.isArray(s?.dechargeTemplates)) setTemplates(s.dechargeTemplates)
      // Templates de facture personnalisés (Lot B3)
      if (Array.isArray(s?.invoiceTemplates)) setInvoiceTemplates(s.invoiceTemplates)
      // Config TVA (Lot C3)
      if (typeof s?.tvaActive === 'boolean')         setTvaActive(s.tvaActive)
      if (Number.isFinite(Number(s?.tvaDefaultTaux))) setTvaDefaultTaux(Number(s.tvaDefaultTaux))
      if (typeof s?.tvaMentionExoneration === 'string') {
        setTvaMentionExoneration(s.tvaMentionExoneration)
      }
      // Config rapport de clôture (Lot 2 — sections + filtres)
      // normalizeSections gère la rétro-compat avec le format Lot 1 (booléens)
      // et fournit les valeurs par défaut pour les clés manquantes.
      if (s?.rapportSections && typeof s.rapportSections === 'object') {
        setRapportSections(normalizeSections(s.rapportSections))
      }
      // Lot Custom B — pages personnalisées
      if (Array.isArray(s?.rapportCustomPages)) {
        setRapportCustomPages(s.rapportCustomPages)
      }
      setSettingsLoaded(true)
    }).catch(() => setSettingsLoaded(true))
    return () => { cancelled = true }
  }, [currentEventId])

  // Ajoute une thématique vide à éditer
  const addThematique = () => {
    setExpoThematiques(prev => [
      ...prev,
      { id: 'thm-' + Date.now().toString(36), label: '', tarif: 0 },
    ])
  }
  // Modifie un champ d'une thématique
  const updateThematique = (idx, key, value) => {
    setExpoThematiques(prev => prev.map((t, i) => i === idx ? { ...t, [key]: value } : t))
  }
  const removeThematique = (idx) => {
    if (!confirm('Supprimer cette thématique ?\nLes exposants déjà créés avec cette thématique conservent leur libellé mais ne pourront plus être réassociés.')) return
    setExpoThematiques(prev => prev.filter((_, i) => i !== idx))
  }
  // Sauvegarde thématiques
  const saveThematiques = async () => {
    if (!currentEventId) return
    // Validation : ids uniques, label non vide
    const seen = new Set()
    for (const t of expoThematiques) {
      if (!t.label || !t.label.trim()) { alert('Toutes les thématiques doivent avoir un libellé.'); return }
      if (seen.has(t.id)) { alert('IDs en double détectés. Veuillez recharger la page.'); return }
      seen.add(t.id)
    }
    // Normalise : tarifs en entiers (centimes), labels trim
    const cleaned = expoThematiques.map(t => ({
      id: t.id,
      label: t.label.trim(),
      tarif: Math.round(Number(t.tarif) || 0),
    }))
    await saveSettings({ expoThematiques: cleaned }, currentEventId)
    setExpoThematiques(cleaned)
    setExpoSaved(true)
    setTimeout(() => setExpoSaved(false), 1500)
  }
  // Sauvegarde coords organisateur
  const saveOrganisateur = async () => {
    if (!currentEventId) return
    // Trim toutes les valeurs string
    const cleaned = Object.fromEntries(
      Object.entries(organisateur).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
    )
    await saveSettings({ organisateur: cleaned }, currentEventId)
    setOrganisateur(cleaned)
    setOrgSaved(true)
    setTimeout(() => setOrgSaved(false), 1500)
  }

  // ─── Identité visuelle : upload logo + couleur principale ────────
  // Le logo est lu côté navigateur, redimensionné si nécessaire pour limiter la taille,
  // puis converti en base64 pour stockage dans settings (lecture instantanée par les PDF).
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!/^image\//.test(file.type)) { alert('Veuillez sélectionner une image'); return }
    if (file.size > 2 * 1024 * 1024) { alert('Image trop volumineuse (max 2 Mo)'); return }

    const reader = new FileReader()
    reader.onload = (ev) => {
      // Redimensionnement via canvas : largeur max 400px (suffisant pour PDF, économise la place)
      const img = new Image()
      img.onload = () => {
        const MAX_W = 400
        const ratio = Math.min(1, MAX_W / img.width)
        const w = Math.round(img.width * ratio)
        const h = Math.round(img.height * ratio)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        // Format PNG pour préserver la transparence du logo
        const dataUrl = canvas.toDataURL('image/png')
        setLogoDataUrl(dataUrl)
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
    // Reset le champ pour pouvoir uploader le même fichier
    e.target.value = ''
  }
  const removeLogo = () => setLogoDataUrl('')

  const saveIdentiteVisuelle = async () => {
    if (!currentEventId) return
    await saveSettings({ logoDataUrl, brandColor }, currentEventId)
    setIdentiteVisSaved(true)
    setTimeout(() => setIdentiteVisSaved(false), 1500)
  }

  // ─── Sauvegarde de la config TVA (Lot C3) ────────────────────────
  // Sauvegarde l'état global TVA + taux par défaut + mention exonération
  // dans les settings de l'événement.
  const saveTvaConfig = async () => {
    if (!currentEventId) return
    // Validation : si TVA active, le taux par défaut doit être ≥ 0
    const taux = Number(tvaDefaultTaux)
    if (tvaActive && (!Number.isFinite(taux) || taux < 0)) {
      alert('Le taux de TVA par défaut doit être un nombre positif ou nul.')
      return
    }
    await saveSettings({
      tvaActive,
      tvaDefaultTaux: Number.isFinite(taux) ? taux : 20,
      tvaMentionExoneration: (tvaMentionExoneration || '').trim(),
    }, currentEventId)
    setTvaSaved(true)
    setTimeout(() => setTvaSaved(false), 1500)
  }

  // ─── Templates de décharge : CRUD ─────────────────────────────────
  // Création : ouvre l'éditeur sur un template vierge.
  // Édition : ouvre l'éditeur sur un template existant.
  // Sauvegarde : appelle le endpoint puis recharge la liste.
  const addTemplate = () => {
    setEditingTpl({
      id: null,
      nom: '',
      intro: `Je soussigné(e), représentant de l'organisateur,
reconnais avoir reçu de :

{{exposant}}

la somme de {{montant}}
({{montantLettres}})

au titre des frais d'exposition,
pour un montant total facturé de {{montantTotal}}.`,
      mentions: '',
      piedDePage: 'Document généré électroniquement. Conserver pour vos archives.',
    })
  }
  const editTemplate = (tpl) => setEditingTpl({ ...tpl })

  const saveTemplate = async () => {
    if (!editingTpl) return
    if (!editingTpl.nom.trim()) { alert('Donnez un nom au template'); return }
    try {
      const { saveDechargeTemplate } = await import('../../firebase/service')
      const saved = await saveDechargeTemplate(editingTpl, currentEventId)
      // Recharger la liste localement
      setTemplates(prev => {
        const idx = prev.findIndex(t => t.id === saved.id)
        return idx >= 0
          ? [...prev.slice(0, idx), saved, ...prev.slice(idx + 1)]
          : [...prev, saved]
      })
      setEditingTpl(null)
      setTplSaved(true)
      setTimeout(() => setTplSaved(false), 1500)
    } catch (e) { alert('Erreur : ' + e.message) }
  }

  const removeTemplate = async (id) => {
    if (!confirm('Supprimer ce template ?')) return
    try {
      const { deleteDechargeTemplate } = await import('../../firebase/service')
      await deleteDechargeTemplate(id, currentEventId)
      setTemplates(prev => prev.filter(t => t.id !== id))
    } catch (e) { alert('Erreur : ' + e.message) }
  }

  // Préférence locale de template facture (Lot B3 raffinement)
  // Lue au montage + après chaque oubli pour rafraîchir l'UI.
  const [rememberedTplId, setRememberedTplId] = useState(() => getRememberedTemplateId())
  const handleForgetTplPreference = () => {
    clearRememberedTemplateId()
    setRememberedTplId(null)
  }

  // ─── Templates de facture : actions (Lot B3) ─────────────────────
  // Éditer = navigation vers l'éditeur visuel avec le templateId en cours
  const editInvoiceTemplate = (id) => {
    useAppStore.getState().setEditingTemplateId(id)
    onNavigate?.('editeur-template')
  }
  const newInvoiceTemplate = () => {
    useAppStore.getState().setEditingTemplateId('new')
    onNavigate?.('editeur-template')
  }
  // Duplication : appel endpoint backend qui crée un clone "(copie)"
  const duplicateInvoiceTpl = async (id) => {
    try {
      const { duplicateInvoiceTemplate } = await import('../../firebase/service')
      const copy = await duplicateInvoiceTemplate(id, currentEventId)
      setInvoiceTemplates(prev => [...prev, copy])
    } catch (e) { alert('Erreur : ' + e.message) }
  }
  // Suppression
  const removeInvoiceTpl = async (id) => {
    if (!confirm('Supprimer ce template de facture ? Cette action est irréversible.')) return
    try {
      const { deleteInvoiceTemplate } = await import('../../firebase/service')
      await deleteInvoiceTemplate(id, currentEventId)
      setInvoiceTemplates(prev => prev.filter(t => t.id !== id))
    } catch (e) { alert('Erreur : ' + e.message) }
  }
  // Définir comme défaut : appelle save avec isDefault=true (l'endpoint retire le flag des autres)
  const setDefaultInvoiceTpl = async (id) => {
    try {
      const target = invoiceTemplates.find(t => t.id === id)
      if (!target) return
      const { saveInvoiceTemplate } = await import('../../firebase/service')
      const updated = await saveInvoiceTemplate({ ...target, isDefault: true }, currentEventId)
      // Mise à jour locale : retire défaut des autres, applique sur celui-ci
      setInvoiceTemplates(prev => prev.map(t =>
        t.id === id ? updated : { ...t, isDefault: false }
      ))
    } catch (e) { alert('Erreur : ' + e.message) }
  }

  // ─── Export / Import de template (raffinement Lot B3) ────────────
  // Export : sérialise un template en JSON et déclenche un download navigateur.
  // Format de fichier : .yllatpl.json (identifiant simple pour reconnaissance).
  // Le fichier est enrichi avec :
  //   - métadonnées de version et provenance
  //   - schéma documenté (types d'éléments + variables disponibles)
  //   - section _documentation lisible par un humain
  // C'est un format propriétaire, mais auto-documenté pour qu'un développeur
  // tiers puisse l'utiliser sans la doc YllaCash.
  const exportInvoiceTpl = (tpl) => {
    try {
      const payload = {
        // ─── Métadonnées du format ───
        $schema: 'https://yllacash.local/schemas/invoice-template-v1.json',
        __format: 'yllatpl-v1',
        __formatVersion: 1,
        __generator: 'YllaCash v7.2',
        __exportedAt: new Date().toISOString(),

        // ─── Documentation embarquée ───
        // Section lisible par un humain ou un dev qui découvre le fichier.
        // Ignorée par l'import (qui ne valide que nom + elements).
        _documentation: {
          description: "Template de mise en page pour la génération de factures PDF dans YllaCash. Format auto-documenté basé sur JSON.",
          unitSystem: "Toutes les positions et dimensions sont exprimées en MILLIMÈTRES (mm). Format A4 : 210 × 297 mm.",
          elementTypes: {
            text:      "Texte court sur 1 ligne. Props: content, fontSize, color, align, bold, italic.",
            paragraph: "Texte long multi-lignes avec wrap automatique. Props: content, fontSize, color, align, lineHeight.",
            field:     "Comme 'text' mais conçu pour contenir des variables {{...}} remplacées au rendu.",
            image:     "Image bitmap (PNG/JPG) stockée en base64 dans 'src'. Max 400px de large recommandé.",
            table:     "Tableau itérant sur les lignes de l'exposant. Props: columns[{label,field,width,align,isCurrency}], showTotal.",
            line:      "Trait horizontal. Props: color, strokeWidth.",
            rect:      "Rectangle plein ou bordé. Props: fillColor, borderColor, borderWidth.",
          },
          variables: {
            description: "Les éléments text/field/paragraph peuvent contenir des variables {{namespace.cle}} remplacées au rendu.",
            namespaces: {
              "exposant.*":     "Données de l'exposant (nom, raisonSociale, siret, tva, email, téléphone, adresse, codePostal, ville, adresseComplete, dirigeant)",
              "organisateur.*": "Données de l'organisateur depuis settings (raisonSociale, adresse, codePostal, ville, siret, tva, iban, bic, banque, email, téléphone, siteWeb, adresseComplete)",
              "facture.*":      "Métadonnées de la facture (numero auto-généré, date au format FR)",
              "total":          "Montant total TTC formaté en € (ex: '120,50 €')",
              "totalBrut":      "Montant total numérique sans symbole",
              "acompte":        "Acompte versé formaté en € (ou '—' si aucun)",
              "solde":          "Solde versé formaté en €",
              "paye":           "Total déjà payé (acompte + solde)",
              "restant":        "Restant dû",
            },
          },
          elementSchema: {
            // Structure type d'un élément (champs communs + spécifiques)
            common: { id: "string (unique)", type: "string (un des elementTypes)", x: "number (mm)", y: "number (mm)", w: "number (mm)", h: "number (mm)" },
            text_field: { content: "string", fontSize: "number (pt)", color: "string (hex)", align: "left|center|right", bold: "boolean", italic: "boolean" },
            paragraph: { content: "string", fontSize: "number", color: "string", align: "left|center|right", lineHeight: "number (1.0-3.0)" },
            image: { src: "string (data URL base64)" },
            table: { headerBg: "hex", headerColor: "hex", fontSize: "number", columns: "[{label, field, width, align, isCurrency}]", showTotal: "boolean" },
            line: { color: "hex", strokeWidth: "number (mm)" },
            rect: { fillColor: "hex", borderColor: "hex", borderWidth: "number (mm)" },
          },
          documentation: "https://github.com/YllaCash — voir le fichier src/utils/factureTemplate.js dans le code source pour le schéma de référence à jour.",
        },

        // ─── Données du template (la VRAIE charge utile) ───
        nom: tpl.nom,
        format: tpl.format || 'A4',
        elements: tpl.elements || [],
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const safeNom = (tpl.nom || 'template').replace(/[^\w]+/g, '_')
      a.download = `${safeNom}.yllatpl.json`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) { alert('Erreur export : ' + e.message) }
  }

  // Import : ouvre un picker fichier, parse le JSON, valide, et sauvegarde.
  const importInvoiceTplRef = React.useRef(null)
  const handleImportInvoiceTpl = () => importInvoiceTplRef.current?.click()
  const onImportInvoiceTplFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      // Vérif minimaliste du format (sera revalidé côté service.js)
      if (!parsed.nom || !Array.isArray(parsed.elements)) {
        throw new Error('Le fichier ne ressemble pas à un template (champs nom/elements manquants)')
      }
      const { importInvoiceTemplate } = await import('../../firebase/service')
      const imported = await importInvoiceTemplate(parsed, currentEventId)
      setInvoiceTemplates(prev => [...prev, imported])
      alert(`Template "${imported.nom}" importé avec succès.`)
    } catch (err) {
      alert('Erreur import : ' + err.message)
    } finally {
      if (importInvoiceTplRef.current) importInvoiceTplRef.current.value = ''
    }
  }

  // Reset event
  const [resetOpen, setResetOpen]   = useState(false)
  const [resetPwd, setResetPwd]     = useState('')
  const [showPwd, setShowPwd]       = useState(false)
  const [toDelete, setToDelete]     = useState([])
  const [resetStep, setResetStep]   = useState('confirm') // confirm | running | done | error
  const [resetError, setResetError] = useState('')

  const handleSave = () => {
    updateTheme({ festName })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const handleCsv   = () => { setExporting('csv');   try { exportTransactionsCsv() }   finally { setTimeout(() => setExporting(null), 800)  } }
  const handleAudit = async () => { setExporting('audit'); try { await exportAuditCsv() } finally { setTimeout(() => setExporting(null), 1000) } }
  const handleExcel = async () => { setExporting('excel'); try { await exportRapportExcel() } finally { setTimeout(() => setExporting(null), 1200) } }

  const handleReset = async () => {
    if (!resetPwd.trim())   { setResetError('Mot de passe requis.'); return }
    if (!currentEventId)    { setResetError('Aucun événement sélectionné.'); return }
    if (!toDelete.length)   { setResetError('Sélectionnez au moins un élément à supprimer.'); return }
    setResetStep('running')
    setResetError('')
    try {
      await resetEventData(currentEventId, toDelete)
      setResetStep('done')
    } catch (e) {
      setResetError('Erreur : ' + e.message)
      setResetStep('error')
    }
  }

  const closeReset = () => {
    setResetOpen(false)
    setResetPwd('')
    setResetStep('confirm')
    setResetError('')
  }

  const card = {
    background: 'var(--bg)', border: '0.5px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '16px 18px', marginBottom: 14,
  }
  const inp = {
    width: '100%', padding: '8px 10px',
    border: '0.5px solid var(--border2)', borderRadius: 8,
    fontSize: 13, background: 'var(--bg2)', color: 'var(--text)',
    fontFamily: 'var(--font)',
  }
  const checkRow = (label, checked, onChange) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }}/>
      {label}
    </label>
  )

  return (
    <div className="yc-settings-grid" style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* Diagnostic notifications push */}
      <PushDiagnostic/>

      {/* Diagnostic mises à jour de l'app */}
      <UpdateDiagnostic/>

      {/* Paramètres généraux */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Save size={15} style={{ color: 'var(--muted)' }}/> Paramètres généraux
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Nom du festival</label>
          <input value={festName} onChange={e => setFestName(e.target.value)} style={inp}/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>1€ = X points</label>
            <input type="number" defaultValue={100} style={inp}/>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Solde max (centimes)</label>
            <input type="number" defaultValue={10000} style={inp}/>
          </div>
        </div>
        <button onClick={handleSave} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
          <Save size={13}/> {saved ? '✓ Sauvegardé' : 'Sauvegarder'}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          MODULE EXPOSANTS (Lot 1)
          Configuration des thématiques d'exposition + coordonnées
          de l'organisateur pour les factures.
          ═══════════════════════════════════════════════════════════ */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag size={15} style={{ color: 'var(--muted)' }}/> Thématiques d'exposition
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          Définissez les types de stands et leurs tarifs. Les exposants sélectionneront une thématique pour un calcul automatique du montant.
        </div>

        {!settingsLoaded ? (
          <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>Chargement…</div>
        ) : expoThematiques.length === 0 ? (
          <div style={{
            fontSize: 12, color: 'var(--muted)', textAlign: 'center',
            padding: '20px 12px', background: 'var(--bg2)', borderRadius: 8, marginBottom: 12,
          }}>
            Aucune thématique définie. Ajoutez-en une ci-dessous.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            {expoThematiques.map((t, i) => (
              <div key={t.id} style={{
                /* Layout responsive :
                   - Mobile (< 520px) : label sur 1 ligne complète, puis tarif + bouton en dessous
                   - Desktop : tout sur 1 ligne (label flexible, tarif fixe, bouton fixe)
                   Le CSS Grid auto-fit + minmax permet le wrap naturel. */
                display: 'grid',
                gridTemplateColumns: 'minmax(180px, 1fr) 150px 36px',
                gap: 6, alignItems: 'center',
              }}
              className="yc-thematique-row">
                <input
                  type="text"
                  placeholder="Nom de la thématique"
                  value={t.label}
                  onChange={e => updateThematique(i, 'label', e.target.value)}
                  style={{
                    minWidth: 0, // permet à l'input de se rétrécir dans la grille
                    padding: '9px 10px', fontSize: 13, fontFamily: 'inherit',
                    background: 'var(--bg)', color: 'var(--text)',
                    border: '0.5px solid var(--border)', borderRadius: 6,
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    /* Tarif saisi en EUROS pour l'utilisateur, stocké en CENTIMES dans Firestore.
                       Conversion automatique à la saisie / au chargement. */
                    value={t.tarifEur ?? ((Number(t.tarif) || 0) / 100).toFixed(2)}
                    onChange={e => {
                      const v = e.target.value.replace(/[^0-9.,]/g, '')
                      updateThematique(i, 'tarifEur', v)
                      // Conversion immédiate en centimes pour le champ tarif (source de vérité)
                      const cts = Math.round((parseFloat(v.replace(',', '.')) || 0) * 100)
                      updateThematique(i, 'tarif', cts)
                    }}
                    style={{
                      flex: 1, minWidth: 0,
                      padding: '9px 10px', fontSize: 13, fontFamily: 'inherit',
                      background: 'var(--bg)', color: 'var(--text)',
                      border: '0.5px solid var(--border)', borderRadius: 6,
                      outline: 'none', boxSizing: 'border-box', textAlign: 'right',
                    }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>€</span>
                </div>
                <button
                  onClick={() => removeThematique(i)}
                  title="Supprimer cette thématique"
                  aria-label="Supprimer"
                  style={{
                    width: 36, height: 36, padding: 0,
                    background: 'transparent', color: 'var(--red-dark)',
                    border: '0.5px solid var(--border)', borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Trash2 size={14}/>
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={addThematique}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', background: 'var(--bg)', color: 'var(--text)',
              border: '0.5px solid var(--border2)', borderRadius: 8,
              fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)',
            }}>
            <Plus size={13}/> Ajouter une thématique
          </button>
          <button onClick={saveThematiques}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', background: 'var(--brand)', color: '#fff',
              border: 'none', borderRadius: 8,
              fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)',
            }}>
            <Save size={13}/> {expoSaved ? '✓ Sauvegardé' : 'Sauvegarder'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, fontStyle: 'italic' }}>
          Tarif en euros (ex: <code>250.00</code> pour 250 €). Calcul automatique appliqué lors de la création d'un exposant.
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Building2 size={15} style={{ color: 'var(--muted)' }}/> Coordonnées de l'organisateur
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          Informations utilisées pour générer les factures et décharges (en-tête des PDF).
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <OrgInput label="Raison sociale" placeholder="Ex: Association Festylla"
            value={organisateur.raisonSociale}
            onChange={v => setOrganisateur(o => ({ ...o, raisonSociale: v }))}/>
          <OrgInput label="Adresse" placeholder="N° et nom de rue"
            value={organisateur.adresse}
            onChange={v => setOrganisateur(o => ({ ...o, adresse: v }))}/>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8 }}>
            <OrgInput label="CP" placeholder="75000"
              value={organisateur.codePostal}
              onChange={v => setOrganisateur(o => ({ ...o, codePostal: v }))}/>
            <OrgInput label="Ville" placeholder="Paris"
              value={organisateur.ville}
              onChange={v => setOrganisateur(o => ({ ...o, ville: v }))}/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <OrgInput label="SIRET" placeholder="123 456 789 00012"
              value={organisateur.siret}
              onChange={v => setOrganisateur(o => ({ ...o, siret: v }))}/>
            <OrgInput label="N° TVA (optionnel)" placeholder="FR12345678901"
              value={organisateur.tva}
              onChange={v => setOrganisateur(o => ({ ...o, tva: v }))}/>
          </div>
          <div style={{ marginTop: 6, paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Coordonnées bancaires (facture)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <OrgInput label="Nom de la banque" placeholder="Crédit Agricole"
                value={organisateur.banque}
                onChange={v => setOrganisateur(o => ({ ...o, banque: v }))}/>
              <OrgInput label="IBAN" placeholder="FR76 1234 5678 9012 3456 7890 123"
                value={organisateur.iban}
                onChange={v => setOrganisateur(o => ({ ...o, iban: v }))}/>
              <OrgInput label="BIC / SWIFT" placeholder="AGRIFRPP123"
                value={organisateur.bic}
                onChange={v => setOrganisateur(o => ({ ...o, bic: v }))}/>
            </div>
          </div>
          <div style={{ marginTop: 6, paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Contact
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <OrgInput label="Email" placeholder="contact@festylla.com"
                value={organisateur.email}
                onChange={v => setOrganisateur(o => ({ ...o, email: v }))}/>
              <OrgInput label="Téléphone" placeholder="01 23 45 67 89"
                value={organisateur.telephone}
                onChange={v => setOrganisateur(o => ({ ...o, telephone: v }))}/>
              <OrgInput label="Site web (optionnel)" placeholder="https://festylla.com"
                value={organisateur.siteWeb}
                onChange={v => setOrganisateur(o => ({ ...o, siteWeb: v }))}/>
            </div>
          </div>
        </div>

        <button onClick={saveOrganisateur}
          style={{
            marginTop: 14,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', background: 'var(--brand)', color: '#fff',
            border: 'none', borderRadius: 8,
            fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)',
          }}>
          <Save size={13}/> {orgSaved ? '✓ Sauvegardé' : 'Sauvegarder'}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          IDENTITÉ VISUELLE (signature électronique de décharge)
          Logo + couleur principale, réutilisés dans tous les PDF.
          ═══════════════════════════════════════════════════════════ */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Palette size={15} style={{ color: 'var(--muted)' }}/> Identité visuelle des PDF
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          Logo et couleur appliqués automatiquement sur les factures et décharges générées.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
          {/* Logo upload */}
          <div>
            <label style={{
              fontSize: 11, color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.04em',
              display: 'block', marginBottom: 6,
            }}>Logo</label>
            {logoDataUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  padding: 8, background: 'var(--bg2)', borderRadius: 8,
                  border: '0.5px solid var(--border)', display: 'inline-flex',
                }}>
                  <img src={logoDataUrl} alt="Logo" style={{ maxWidth: 120, maxHeight: 80, display: 'block' }}/>
                </div>
                <button onClick={removeLogo}
                  style={{
                    padding: '8px 12px', background: 'transparent', color: 'var(--red-dark)',
                    border: '0.5px solid var(--red)', borderRadius: 6, fontSize: 12,
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}>
                  <Trash2 size={12}/> Retirer
                </button>
              </div>
            ) : (
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 14px', background: 'var(--bg)', color: 'var(--text)',
                border: '0.5px dashed var(--border2)', borderRadius: 8,
                fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <FileText size={13}/> Choisir une image…
                <input type="file" accept="image/*" onChange={handleLogoUpload}
                  style={{ display: 'none' }}/>
              </label>
            )}
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, fontStyle: 'italic' }}>
              PNG, JPG ou SVG. Redimensionné automatiquement à 400 px max. Max 2 Mo.
            </div>
          </div>

          {/* Couleur principale */}
          <div>
            <label style={{
              fontSize: 11, color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.04em',
              display: 'block', marginBottom: 6,
            }}>Couleur principale</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="color" value={brandColor}
                onChange={e => setBrandColor(e.target.value)}
                style={{
                  width: 50, height: 38, padding: 2,
                  background: 'var(--bg)',
                  border: '0.5px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                }}/>
              <input type="text" value={brandColor}
                onChange={e => setBrandColor(e.target.value)}
                placeholder="#1a6b7a"
                style={{
                  flex: 1, maxWidth: 140, padding: '8px 10px', fontSize: 13,
                  background: 'var(--bg)', color: 'var(--text)',
                  border: '0.5px solid var(--border)', borderRadius: 6,
                  outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box',
                }}/>
              <div style={{
                width: 38, height: 38, background: brandColor,
                border: '0.5px solid var(--border)', borderRadius: 6,
              }}/>
            </div>
          </div>
        </div>

        <button onClick={saveIdentiteVisuelle}
          style={{
            marginTop: 14,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', background: 'var(--brand)', color: '#fff',
            border: 'none', borderRadius: 8,
            fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)',
          }}>
          <Save size={13}/> {identiteVisSaved ? '✓ Sauvegardé' : 'Sauvegarder'}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          TVA (Lot C3)
          Configuration de la TVA pour les factures de cet événement.
          ═══════════════════════════════════════════════════════════ */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Receipt size={15} style={{ color: 'var(--muted)' }}/> TVA
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          Activez la TVA si votre structure y est assujettie. Le taux par défaut s'applique
          à toutes les lignes facturables, sauf override individuel. Si désactivée, la mention
          d'exonération apparaît automatiquement sur les factures.
        </div>

        {/* Toggle global */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: 12, background: 'var(--bg2)', borderRadius: 8,
          cursor: 'pointer', marginBottom: 12,
        }}>
          <input type="checkbox" checked={tvaActive}
            onChange={e => setTvaActive(e.target.checked)}
            style={{ cursor: 'pointer', transform: 'scale(1.1)' }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              Cet événement utilise la TVA
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {tvaActive
                ? 'TVA activée : les factures séparent HT, TVA et TTC.'
                : 'TVA désactivée : la mention "TVA non applicable" apparaît sur les factures.'}
            </div>
          </div>
        </label>

        {/* Taux par défaut (seulement si TVA active) */}
        {tvaActive && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{
                fontSize: 11, color: 'var(--muted)',
                textTransform: 'uppercase', letterSpacing: '0.04em',
                display: 'block', marginBottom: 4,
              }}>Taux de TVA par défaut (%)</label>
              <input type="number" step="0.1" min="0" max="100"
                value={tvaDefaultTaux}
                onChange={e => setTvaDefaultTaux(parseFloat(e.target.value) || 0)}
                style={{
                  width: 120, padding: '9px 12px', fontSize: 14,
                  background: 'var(--bg)', color: 'var(--text)',
                  border: '0.5px solid var(--border)', borderRadius: 6,
                  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                }}/>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>
                Taux libre. Standards français : 0, 5.5, 10, 20.
                Chaque ligne facturable peut avoir un taux différent.
              </div>
            </div>

            {/* Numéro TVA intracom : info reportée des coordonnées organisateur */}
            <div style={{
              padding: '8px 10px', background: 'var(--bg2)', borderRadius: 6,
              fontSize: 11, color: 'var(--muted)',
            }}>
              <strong>Rappel :</strong> votre N° de TVA intracommunautaire{' '}
              <code style={{ background: 'var(--bg)', padding: '1px 4px', borderRadius: 3 }}>
                {organisateur.tva || '(non renseigné)'}
              </code>
              {' '}provient des coordonnées de l'organisateur ci-dessus. Mention légale obligatoire sur les factures avec TVA.
            </div>
          </>
        )}

        {/* Mention exonération (seulement si TVA inactive) */}
        {!tvaActive && (
          <div style={{ marginBottom: 8 }}>
            <label style={{
              fontSize: 11, color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.04em',
              display: 'block', marginBottom: 4,
            }}>Mention d'exonération affichée sur les factures</label>
            <input type="text"
              value={tvaMentionExoneration}
              onChange={e => setTvaMentionExoneration(e.target.value)}
              maxLength={120}
              style={{
                width: '100%', padding: '9px 12px', fontSize: 13,
                background: 'var(--bg)', color: 'var(--text)',
                border: '0.5px solid var(--border)', borderRadius: 6,
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
              }}/>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>
              Modifiez si vous relevez d'un autre régime d'exonération (ex: art. 261 du CGI pour associations).
            </div>
          </div>
        )}

        <button onClick={saveTvaConfig}
          style={{
            marginTop: 10,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', background: 'var(--brand)', color: '#fff',
            border: 'none', borderRadius: 8,
            fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)',
          }}>
          <Save size={13}/> {tvaSaved ? '✓ Sauvegardé' : 'Sauvegarder'}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          TEMPLATES DE DÉCHARGE
          Modèles de texte réutilisables. Variables disponibles :
          {{exposant}}, {{montant}}, {{montantLettres}}, {{montantTotal}}
          ═══════════════════════════════════════════════════════════ */}
      <div className="yc-settings-wide" style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={15} style={{ color: 'var(--muted)' }}/> Templates de décharge
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          Modèles de texte réutilisables pour les décharges signées. Variables disponibles dans le texte :
          {' '}<code style={{ background: 'var(--bg2)', padding: '1px 4px', borderRadius: 3, fontSize: 11 }}>{'{{exposant}}'}</code>
          {' '}<code style={{ background: 'var(--bg2)', padding: '1px 4px', borderRadius: 3, fontSize: 11 }}>{'{{montant}}'}</code>
          {' '}<code style={{ background: 'var(--bg2)', padding: '1px 4px', borderRadius: 3, fontSize: 11 }}>{'{{montantLettres}}'}</code>
          {' '}<code style={{ background: 'var(--bg2)', padding: '1px 4px', borderRadius: 3, fontSize: 11 }}>{'{{montantTotal}}'}</code>
        </div>

        {/* Liste des templates */}
        {templates.length === 0 ? (
          <div style={{
            fontSize: 12, color: 'var(--muted)', textAlign: 'center',
            padding: '20px 12px', background: 'var(--bg2)', borderRadius: 8, marginBottom: 12,
            fontStyle: 'italic',
          }}>
            Aucun template défini. Si vous n'en créez pas, le texte par défaut sera utilisé.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {templates.map(tpl => (
              <div key={tpl.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px', background: 'var(--bg2)', borderRadius: 8,
              }}>
                <FileText size={14} style={{ color: 'var(--muted)', flexShrink: 0 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tpl.nom}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tpl.intro?.slice(0, 80) || 'Sans intro'}{tpl.intro?.length > 80 ? '…' : ''}
                  </div>
                </div>
                <button onClick={() => editTemplate(tpl)} title="Modifier"
                  style={{
                    width: 32, height: 32, padding: 0,
                    background: 'transparent', color: 'var(--brand-dark)',
                    border: '0.5px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  <FileText size={13}/>
                </button>
                <button onClick={() => removeTemplate(tpl.id)} title="Supprimer"
                  style={{
                    width: 32, height: 32, padding: 0,
                    background: 'transparent', color: 'var(--red-dark)',
                    border: '0.5px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  <Trash2 size={13}/>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Éditeur inline (si template en cours d'édition) */}
        {editingTpl && (
          <div style={{
            padding: 14, background: 'var(--bg2)', borderRadius: 10,
            border: '0.5px solid var(--brand)', marginBottom: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>
              {editingTpl.id ? 'Modifier le template' : 'Nouveau template'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{
                  fontSize: 11, color: 'var(--muted)',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  display: 'block', marginBottom: 4, fontWeight: 600,
                }}>Nom du template *</label>
                <input type="text" value={editingTpl.nom}
                  onChange={e => setEditingTpl(t => ({ ...t, nom: e.target.value }))}
                  placeholder="Ex: Décharge espèces — Édition 2025"
                  maxLength={80}
                  style={{
                    width: '100%', padding: '9px 12px', fontSize: 13,
                    background: 'var(--bg)', color: 'var(--text)',
                    border: '0.5px solid var(--border)', borderRadius: 6,
                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                  }}/>
              </div>
              <div>
                <label style={{
                  fontSize: 11, color: 'var(--muted)',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  display: 'block', marginBottom: 4, fontWeight: 600,
                }}>Texte d'introduction</label>
                <textarea value={editingTpl.intro}
                  onChange={e => setEditingTpl(t => ({ ...t, intro: e.target.value }))}
                  placeholder="Texte principal de la décharge…"
                  rows={8}
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: 13,
                    background: 'var(--bg)', color: 'var(--text)',
                    border: '0.5px solid var(--border)', borderRadius: 6,
                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                    resize: 'vertical', minHeight: 120, lineHeight: 1.5,
                  }}/>
              </div>
              <div>
                <label style={{
                  fontSize: 11, color: 'var(--muted)',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  display: 'block', marginBottom: 4, fontWeight: 600,
                }}>Mentions complémentaires (optionnel)</label>
                <textarea value={editingTpl.mentions}
                  onChange={e => setEditingTpl(t => ({ ...t, mentions: e.target.value }))}
                  placeholder="Ex: Conformément à l'article…"
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: 13,
                    background: 'var(--bg)', color: 'var(--text)',
                    border: '0.5px solid var(--border)', borderRadius: 6,
                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                    resize: 'vertical', minHeight: 60, lineHeight: 1.5,
                  }}/>
              </div>
              <div>
                <label style={{
                  fontSize: 11, color: 'var(--muted)',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  display: 'block', marginBottom: 4, fontWeight: 600,
                }}>Pied de page</label>
                <input type="text" value={editingTpl.piedDePage}
                  onChange={e => setEditingTpl(t => ({ ...t, piedDePage: e.target.value }))}
                  placeholder="Ex: Document généré électroniquement"
                  maxLength={200}
                  style={{
                    width: '100%', padding: '9px 12px', fontSize: 13,
                    background: 'var(--bg)', color: 'var(--text)',
                    border: '0.5px solid var(--border)', borderRadius: 6,
                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                  }}/>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => setEditingTpl(null)}
                  style={{
                    flex: 1, padding: '10px', background: 'transparent',
                    color: 'var(--text)', border: '0.5px solid var(--border)',
                    borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                  }}>Annuler</button>
                <button onClick={saveTemplate}
                  style={{
                    flex: 1, padding: '10px', background: 'var(--brand)',
                    color: '#fff', border: 'none', borderRadius: 8,
                    fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}>Enregistrer</button>
              </div>
            </div>
          </div>
        )}

        {!editingTpl && (
          <button onClick={addTemplate}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', background: 'var(--bg)', color: 'var(--text)',
              border: '0.5px solid var(--border2)', borderRadius: 8,
              fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)',
            }}>
            <Plus size={13}/> Nouveau template
          </button>
        )}
        {tplSaved && (
          <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--green-dark)' }}>
            ✓ Template enregistré
          </span>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          TEMPLATES DE FACTURE (Lot B1 + B2 + B3)
          Liste avec actions : éditer, dupliquer, supprimer, définir par défaut.
          ═══════════════════════════════════════════════════════════ */}
      <div className="yc-settings-wide" style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={15} style={{ color: 'var(--muted)' }}/> Templates de facture
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          Personnalisez la mise en page de vos factures via l'éditeur visuel
          drag-and-drop. Plusieurs templates peuvent coexister (facture standard, devis, relance…).
          Le template marqué <strong>défaut</strong> est utilisé automatiquement lors de la génération.
        </div>

        {/* Liste des templates personnalisés */}
        {invoiceTemplates.length === 0 ? (
          <div style={{
            fontSize: 12, color: 'var(--muted)', textAlign: 'center',
            padding: '20px 12px', background: 'var(--bg2)', borderRadius: 8, marginBottom: 12,
            fontStyle: 'italic',
          }}>
            Aucun template personnalisé. La facture utilisera le template standard par défaut.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {invoiceTemplates.map(tpl => (
              <div key={tpl.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px', background: 'var(--bg2)', borderRadius: 8,
                border: tpl.isDefault ? '0.5px solid var(--green-dark)' : '0.5px solid transparent',
              }}>
                <FileText size={14} style={{
                  color: tpl.isDefault ? 'var(--green-dark)' : 'var(--muted)',
                  flexShrink: 0,
                }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)',
                      minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tpl.nom}
                    </div>
                    {tpl.isDefault && (
                      <span style={{
                        padding: '1px 5px', background: 'var(--green-dark)', color: '#fff',
                        fontSize: 8, fontWeight: 700, borderRadius: 3, letterSpacing: '0.04em',
                        flexShrink: 0,
                      }}>DÉFAUT</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                    {tpl.elements?.length || 0} élément(s)
                    {tpl.updatedAt && ` · modifié le ${new Date(tpl.updatedAt).toLocaleDateString('fr-FR')}`}
                  </div>
                </div>
                {!tpl.isDefault && (
                  <button onClick={() => setDefaultInvoiceTpl(tpl.id)} title="Définir comme défaut"
                    style={ICON_BTN_STYLE}>
                    ★
                  </button>
                )}
                <button onClick={() => editInvoiceTemplate(tpl.id)} title="Modifier dans l'éditeur"
                  style={{ ...ICON_BTN_STYLE, color: 'var(--brand-dark)' }}>
                  <FileText size={13}/>
                </button>
                <button onClick={() => duplicateInvoiceTpl(tpl.id)} title="Dupliquer"
                  style={ICON_BTN_STYLE}>
                  ⧉
                </button>
                <button onClick={() => exportInvoiceTpl(tpl)} title="Exporter (fichier .json)"
                  style={ICON_BTN_STYLE}>
                  <Download size={13}/>
                </button>
                <button onClick={() => removeInvoiceTpl(tpl.id)} title="Supprimer"
                  style={{ ...ICON_BTN_STYLE, color: 'var(--red-dark)' }}>
                  <Trash2 size={13}/>
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={newInvoiceTemplate}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', background: 'var(--brand)', color: '#fff',
              border: 'none', borderRadius: 8,
              fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)',
            }}>
            <Plus size={13}/> Nouveau template
          </button>
          <button onClick={handleImportInvoiceTpl}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', background: 'var(--bg)', color: 'var(--text)',
              border: '0.5px solid var(--border2)', borderRadius: 8,
              fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)',
            }}>
            <Upload size={13}/> Importer un template
          </button>
          {/* Input fichier caché pour le picker */}
          <input ref={importInvoiceTplRef} type="file"
            accept=".json,.yllatpl"
            onChange={onImportInvoiceTplFile}
            style={{ display: 'none' }}/>
        </div>

        {/* Préférence locale mémorisée (Lot B3 raffinement) */}
        {rememberedTplId && (
          <div style={{
            marginTop: 12, padding: '10px 12px',
            background: 'var(--gold-light)', borderRadius: 8,
            border: '0.5px solid var(--gold)',
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 12, color: 'var(--gold-dark)',
          }}>
            <span style={{ flex: 1 }}>
              <strong>Préférence enregistrée sur cet appareil :</strong>{' '}
              {rememberedTplId === '__default__'
                ? 'Template standard'
                : (invoiceTemplates.find(t => t.id === rememberedTplId)?.nom
                   || <em style={{ fontStyle: 'italic', opacity: 0.7 }}>Template supprimé</em>)}
              <div style={{ fontSize: 10, marginTop: 2, opacity: 0.85 }}>
                Les factures sont générées avec ce template sans demander.
              </div>
            </span>
            <button onClick={handleForgetTplPreference}
              style={{
                padding: '6px 12px', fontSize: 11, fontWeight: 600,
                background: 'transparent', color: 'var(--gold-dark)',
                border: '0.5px solid var(--gold-dark)', borderRadius: 6,
                cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
              }}>
              Oublier
            </button>
          </div>
        )}

        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, fontStyle: 'italic' }}>
          Le nouveau template démarre comme une copie du template standard. Vous pouvez ensuite tout personnaliser dans l'éditeur visuel.
          {' '}Les fichiers exportés (.yllatpl.json) peuvent être réimportés ici ou partagés entre événements.
        </div>
      </div>

      {/* Exports */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Download size={15} style={{ color: 'var(--muted)' }}/> Export des données
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>Générés côté client — aucun serveur requis.</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={handleCsv} disabled={!!exporting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '0.5px solid var(--border2)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            <Download size={13}/> {exporting === 'csv' ? 'Génération…' : 'Transactions (XLSX)'}
          </button>
          <button onClick={handleExcel} disabled={!!exporting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '0.5px solid #5DCAA5', borderRadius: 8, background: '#E1F5EE', color: '#0F6E56', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            <FileSpreadsheet size={13}/> {exporting === 'excel' ? 'Génération…' : 'Rapport Excel'}
          </button>
          <button onClick={handleAudit} disabled={!!exporting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '0.5px solid #AFA9EC', borderRadius: 8, background: 'var(--purple-light)', color: 'var(--purple)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            <Download size={13}/> {exporting === 'audit' ? 'Génération…' : "Journal d’audit (XLSX)"}
          </button>
        </div>
      </div>

      {/* Outil de diagnostic transactions */}
      <div style={card}>
        <DiagnosticTransactions/>
      </div>

      {/* Studio */}
      <div style={{ ...card, background: 'var(--brand-light)', borderColor: 'var(--brand)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-dark)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wand2 size={15}/> Personnalisation visuelle
        </div>
        <div style={{ fontSize: 12, color: 'var(--brand-dark)', opacity: 0.85 }}>
          Ouvrez le <strong>Studio</strong> via le bouton en haut à droite pour personnaliser couleurs, logo, typographie et QR code.
        </div>
      </div>

      {/* ── MIGRATION V2 — staff/categories/benevoles dans l'événement ── */}
      {currentEventId && user?.role === 'super_admin' && (
        <div style={{ ...card, border: '2px solid #534AB7', background: '#EDE9FE', marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#534AB7', marginBottom: 6 }}>
            🔄 Migration architecture v2
          </div>
          <div style={{ fontSize: 12, color: '#3730a3', marginBottom: 12, lineHeight: 1.6 }}>
            Migre staff, bénévoles et catégories depuis la racine Firestore vers cet événement.
            À effectuer une seule fois après déploiement.
          </div>
          {migrV2Log.length > 0 && (
            <div style={{ background: 'rgba(0,0,0,.06)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, maxHeight: 160, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.8 }}>
              {migrV2Log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
          {migrV2Done && (
            <div style={{ padding: '10px 14px', background: '#D1FAE5', borderRadius: 8, color: '#065f46', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
              ✓ Migration v2 terminée
            </div>
          )}
          {!migrV2Done && (
            <button
              onClick={async () => {
                if (!window.confirm("Migrer staff, bénévoles et catégories vers cet événement ?")) return
                setMigratingV2(true); setMigrV2Log([])
                try {
                  await migrerVersV2(currentEventId, msg => setMigrV2Log(prev => [...prev, msg]))
                  setMigrV2Done(true)
                } catch (e) { setMigrV2Log(prev => [...prev, "✗ " + e.message]) }
                finally { setMigratingV2(false) }
              }}
              disabled={migratingV2}
              style={{ padding: '10px 18px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: migratingV2 ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', opacity: migratingV2 ? .6 : 1 }}>
              {migratingV2 ? 'Migration en cours…' : '🔄 Lancer la migration v2'}
            </button>
          )}
        </div>
      )}

      {/* ── RAPPORT DE CLÔTURE ── */}
      <div className="yc-settings-wide" style={{ ...card, border: '1.5px solid var(--brand)', background: 'var(--brand-light)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-dark)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={15}/> Rapport de clôture PDF
        </div>
        <div style={{ fontSize: 12, color: 'var(--brand-dark)', marginBottom: 14, lineHeight: 1.6, opacity: .85 }}>
          Génère un rapport PDF complet de l'événement : récapitulatif financier, réconciliation comptable, top articles, statistiques par stand, toutes les transactions, spectateurs & soldes restants, réservations et journal d'audit complet.
        </div>

        {/* ─── Panneau de configuration des sections (Lot 2 — filtres) ───
            Extrait en sous-composant pour ne pas surcharger Settings.jsx.
            Affiche un bloc dépliable par section avec ses filtres spécifiques.
            Sauvegarde Firestore immédiate à chaque changement. */}
        <RapportConfigPanel
          sections={rapportSections}
          setSections={setRapportSections}
          sectionsKeys={RAPPORT_SECTIONS_KEYS}
          configOpen={rapportConfigOpen}
          setConfigOpen={setRapportConfigOpen}
          expandedSection={expandedSection}
          setExpandedSection={setExpandedSection}
          buildDefault={buildDefaultSections}
          currentEventId={currentEventId}
          staffList={staff}
          menuList={menu}
          categoriesList={categories}
          spectateursList={spectateurs}
          reservationsList={reservations}
        />

        {/* Lot Custom B — Pages personnalisées */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '0.5px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText size={15}/> Pages personnalisées
          </div>
          <CustomPagesEditor
            pages={rapportCustomPages}
            onChange={saveCustomPages}
            menuList={menu}
            categoriesList={categories}
            spectateursList={spectateurs}
            reservationsList={reservations}
            staffList={staff}
            transactionsList={logs}
          />
        </div>

        {/* Deux modes de génération :
            - Rapide : génère immédiatement avec la config sauvegardée
            - Avec réglages : ouvre une modale pour override temporaire (Lot 2b) */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={async () => {
              setGeneratingPdf(true)
              try { await genererRapportCloture() }
              catch (e) { alert('Erreur : ' + e.message) }
              finally { setGeneratingPdf(false) }
            }}
            disabled={generatingPdf}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: generatingPdf ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', opacity: generatingPdf ? .6 : 1 }}>
            <FileText size={14}/>
            {generatingPdf ? 'Génération en cours…' : 'Générer (config sauvegardée)'}
          </button>
          <button
            onClick={() => setShowGenerateModal(true)}
            disabled={generatingPdf}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', background: 'transparent', color: 'var(--brand-dark)',
              border: '0.5px solid var(--brand)', borderRadius: 9,
              fontSize: 13, fontWeight: 600,
              cursor: generatingPdf ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font)', opacity: generatingPdf ? .6 : 1
            }}>
            <FileText size={14}/>
            Générer avec réglages…
          </button>
        </div>
      </div>

      {/* Modale de génération avec override (Lot 2b) */}
      {showGenerateModal && createPortal(
        <GenerateRapportModal
          initialSections={rapportSections}
          sectionsKeys={RAPPORT_SECTIONS_KEYS}
          buildDefault={buildDefaultSections}
          staffList={staff}
          menuList={menu}
          categoriesList={categories}
          spectateursList={spectateurs}
          reservationsList={reservations}
          currentEventId={currentEventId}
          onCancel={() => setShowGenerateModal(false)}
          onGenerate={async (overrideSections) => {
            try {
              await genererRapportCloture(overrideSections)
              setShowGenerateModal(false)
            } catch (e) {
              alert('Erreur : ' + e.message)
            }
          }}
        />,
        document.body
      )}

      {/* ── ZONE DANGER — Réinitialisation événement ── */}
      <div className="yc-settings-wide" style={{ ...card, border: '1px solid #F09595', background: 'var(--red-light)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--red)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={15}/> Zone dangereuse — Réinitialisation événement
        </div>
        <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 14, lineHeight: 1.6, opacity: 0.9 }}>
          Supprime définitivement toutes les transactions, réservations et comptes spectateurs. Action irréversible.
        </div>

        {!resetOpen ? (
          <button onClick={() => setResetOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            <AlertTriangle size={14}/> Réinitialiser l'événement
          </button>
        ) : (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--red)', borderRadius: 10, padding: 18 }}>

            {resetStep === 'done' ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-dark)', marginBottom: 6 }}>Réinitialisation terminée</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>Toutes les données sélectionnées ont été supprimées.</div>
                <button onClick={closeReset} style={{ padding: '8px 18px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                  Fermer
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
                  Que souhaitez-vous conserver ?
                </div>

                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                  Sélectionnez les éléments à supprimer :
                </div>

                {/* Actions raccourcies */}
                <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
                  <button type="button" onClick={() => setToDelete(Object.keys(EVENT_COLS))}
                    style={{ background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:6, padding:'4px 10px', fontSize:11, color:'var(--red)', fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
                    Tout sélectionner
                  </button>
                  <button type="button" onClick={() => setToDelete([])}
                    style={{ background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:6, padding:'4px 10px', fontSize:11, color:'var(--muted)', fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
                    Désélectionner
                  </button>
                </div>

                <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '4px 12px', marginBottom: 14 }}>
                  {Object.entries(EVENT_COL_GROUPS).map(([gKey, group]) => {
                    const inGroup = Object.entries(EVENT_COLS).filter(([, c]) => c.group === gKey).map(([k]) => k)
                    const allSelected = inGroup.length > 0 && inGroup.every(k => toDelete.includes(k))
                    const someSelected = inGroup.some(k => toDelete.includes(k))
                    return (
                      <div key={gKey} style={{ padding: '10px 0', borderBottom: '0.5px solid var(--border)' }}>
                        {/* Header groupe + check tout */}
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                          <input
                            type="checkbox"
                            id={`grp-${gKey}`}
                            checked={allSelected}
                            ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                            onChange={e => setToDelete(prev => {
                              const without = prev.filter(k => !inGroup.includes(k))
                              return e.target.checked ? [...without, ...inGroup] : without
                            })}
                            style={{ width: 16, height: 16, accentColor: 'var(--red)', cursor: 'pointer' }}
                          />
                          <label htmlFor={`grp-${gKey}`} style={{ flex:1, cursor:'pointer', userSelect:'none' }}>
                            <div style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{group.label}</div>
                            <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>{group.desc}</div>
                          </label>
                        </div>
                        {/* Items du groupe */}
                        <div style={{ paddingLeft:24, display:'flex', flexDirection:'column', gap:4 }}>
                          {inGroup.map(key => {
                            const cfg = EVENT_COLS[key]
                            return (
                              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input
                                  type="checkbox"
                                  id={`del-${key}`}
                                  checked={toDelete.includes(key)}
                                  onChange={e => setToDelete(prev =>
                                    e.target.checked ? [...prev, key] : prev.filter(k => k !== key)
                                  )}
                                  style={{ width: 14, height: 14, accentColor: 'var(--red)', cursor: 'pointer' }}
                                />
                                <label htmlFor={`del-${key}`} style={{ fontSize: 12, color: 'var(--text)', cursor: 'pointer', userSelect: 'none' }}>
                                  {cfg.label}
                                </label>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {toDelete.length > 0 && (
                  <div style={{ padding: '10px 12px', background: '#FCEBEB', border: '0.5px solid #F09595', borderRadius: 8, fontSize: 12, color: 'var(--red)', marginBottom: 14, lineHeight: 1.6 }}>
                    ⚠️ Seront <strong>définitivement supprimés</strong> :<br/>
                    {toDelete.map(k => <span key={k}>• {EVENT_COLS[k]?.label}<br/></span>)}
                  </div>
                )}

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    Confirmez avec votre mot de passe admin
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={resetPwd}
                      onChange={e => { setResetPwd(e.target.value); setResetError('') }}
                      placeholder="Mot de passe…"
                      style={{ ...inp, paddingRight: 36 }}
                    />
                    <button onClick={() => setShowPwd(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}>
                      {showPwd ? <EyeOff size={14}/> : <Eye size={14}/>}
                    </button>
                  </div>
                  {resetError && (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--red)' }}>{resetError}</div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleReset}
                    disabled={!resetPwd || resetStep === 'running'}
                    style={{
                      flex: 1, padding: '10px 0',
                      background: resetStep === 'running' ? 'var(--bg3)' : 'var(--red)',
                      color: resetStep === 'running' ? 'var(--muted)' : '#fff',
                      border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      cursor: !resetPwd || resetStep === 'running' ? 'not-allowed' : 'pointer',
                      fontFamily: 'var(--font)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                    <AlertTriangle size={13}/>
                    {resetStep === 'running' ? 'Réinitialisation en cours…' : 'Confirmer la réinitialisation'}
                  </button>
                  <button onClick={closeReset} disabled={resetStep === 'running'}
                    style={{ padding: '10px 14px', border: '0.5px solid var(--border2)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    Annuler
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Infos système */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Informations système</div>
        {[
          ['Version',          '1.0.0'],
          ['PWA',              'serviceWorker' in navigator ? 'Supportée' : 'Non supportée'],
          ['URL spectateur',   '/solde?id=FY-XXXX'],
          ['URL inscription',  '/inscription'],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid var(--border)', fontSize: 12 }}>
            <span style={{ color: 'var(--muted)' }}>{k}</span>
            <span style={{ color: 'var(--text)', fontFamily: k.includes('URL') ? 'monospace' : 'inherit' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Sous-composant pour input organisateur ────────────────────────
function OrgInput({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label style={{
        fontSize: 11, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.04em',
        display: 'block', marginBottom: 4,
      }}>
        {label}
      </label>
      <input
        type="text"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
          background: 'var(--bg)', color: 'var(--text)',
          border: '0.5px solid var(--border)', borderRadius: 6,
          outline: 'none', boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

// ─── Style commun pour les boutons d'action en ligne (icônes) ──────
// Utilisé par la liste des templates de facture (Lot B3) pour rester
// compact dans les lignes de liste sans surcharger le DOM.
const ICON_BTN_STYLE = {
  width: 30, height: 30, padding: 0,
  background: 'transparent', color: 'var(--text)',
  border: '0.5px solid var(--border)', borderRadius: 6,
  cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
}

// ════════════════════════════════════════════════════════════════════════
// GenerateRapportModal — Modale au clic "Générer le rapport"
// ════════════════════════════════════════════════════════════════════════
// Lot 2b — Permet à l'admin d'override la config sauvegardée pour cette
// génération uniquement. Les modifications dans la modale ne sont PAS
// persistées dans Firestore.
//
// Props :
//   - initialSections : config initiale (depuis Firestore)
//   - sectionsKeys    : metadata des sections (clés + filtres dispo)
//   - buildDefault    : fonction qui produit la config par défaut
//   - staffList       : liste du staff pour les filtres
//   - currentEventId  : ID événement courant
//   - onCancel        : callback fermeture sans action
//   - onGenerate      : callback (sectionsOverride) -> Promise
//
// Le panneau de config interne est réutilisé avec `temporary=true` et
// `modalMode=true` pour qu'aucune sauvegarde Firestore ne se déclenche.
function GenerateRapportModal({
  initialSections, sectionsKeys, buildDefault, staffList, menuList,
  categoriesList, spectateursList, reservationsList,
  currentEventId,
  onCancel, onGenerate,
}) {
  // État local indépendant de Firestore — clone profond pour ne pas muter
  // la config sauvegardée si on annule.
  const [sections, setSections] = useState(() =>
    JSON.parse(JSON.stringify(initialSections))
  )
  const [expandedSection, setExpandedSection] = useState(null)
  const [generating, setGenerating] = useState(false)

  const enabledCount = Object.values(sections).filter(s => s?.enabled).length

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await onGenerate(sections)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, zIndex: 9999,
    }} onClick={(e) => { if (!generating) onCancel() }}>
      <div style={{
        background: 'var(--bg)', borderRadius: 14,
        maxWidth: 720, width: '100%',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>
        {/* En-tête */}
        <div style={{
          padding: '16px 18px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 4,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
              Générer le rapport de clôture
            </div>
            <button onClick={onCancel} disabled={generating}
              style={{
                background: 'transparent', border: 'none',
                color: 'var(--muted)', fontSize: 20,
                cursor: generating ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', padding: 0, lineHeight: 1,
              }}>×</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
            Ajustez les sections et filtres pour cette génération uniquement.
            La configuration sauvegardée dans Paramètres reste inchangée.
          </div>
          <div style={{
            fontSize: 11, color: 'var(--brand-dark)',
            marginTop: 6, fontWeight: 600,
          }}>
            {enabledCount + 1} section{enabledCount > 0 ? 's' : ''} incluse{enabledCount > 0 ? 's' : ''} (couverture + {enabledCount})
          </div>
        </div>

        {/* Corps scrollable : le panneau de config en mode modale */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '14px 18px',
        }}>
          <RapportConfigPanel
            sections={sections}
            setSections={setSections}
            sectionsKeys={sectionsKeys}
            configOpen={true}
            setConfigOpen={() => {}}
            expandedSection={expandedSection}
            setExpandedSection={setExpandedSection}
            buildDefault={buildDefault}
            currentEventId={currentEventId}
            staffList={staffList}
            menuList={menuList}
            categoriesList={categoriesList}
            spectateursList={spectateursList}
            reservationsList={reservationsList}
            temporary={true}
            modalMode={true}
          />
        </div>

        {/* Footer : boutons */}
        <div style={{
          padding: '12px 18px',
          background: 'var(--bg2)',
          display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8,
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <button onClick={onCancel} disabled={generating}
            style={{
              padding: '12px',
              background: 'transparent', color: 'var(--text)',
              border: '0.5px solid var(--border)', borderRadius: 8,
              fontSize: 13, fontWeight: 600,
              cursor: generating ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font)',
              opacity: generating ? 0.5 : 1,
            }}>
            Annuler
          </button>
          <button onClick={handleGenerate} disabled={generating}
            style={{
              padding: '12px',
              background: generating ? 'var(--bg)' : 'var(--brand)',
              color: generating ? 'var(--muted)' : '#fff',
              border: 'none', borderRadius: 8,
              fontSize: 14, fontWeight: 700,
              cursor: generating ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
            <FileText size={14}/>
            {generating ? 'Génération en cours…' : 'Générer avec ces réglages'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// RapportConfigPanel — Panneau de configuration du rapport de clôture
// ════════════════════════════════════════════════════════════════════════
// Lot 2 — Filtres par section. Permet au super_admin de :
//   - Activer/désactiver chaque section (toggle on/off)
//   - Déplier une section pour configurer ses filtres spécifiques
//   - Sauvegarder dans Firestore au moindre changement
//
// Filtres supportés par section (cf. RAPPORT_SECTIONS_KEYS.filters) :
//   - period       : 2 champs date YYYY-MM-DD
//   - topN         : nombre d'articles à inclure (input number)
//   - staffExclude : multi-select des emails de staff à exclure
//   - txTypes      : multi-checkboxes des types de transaction (credit, debit, ...)
//   - amountRange  : montant min/max en €
//   - soldeRange   : solde min/max en €
//   - sortBy       : single-select (solde/nom/tx)
//   - resaStatuses : multi-checkboxes des statuts résa
//   - resaType     : single-select (all/spec/benev)
//   - auditActions : input texte libre (CSV des actions)
//   - auditUserTypes : multi-checkboxes (admin, staff, spectateur, benevole, ...)
//
// Tous les imports sont déjà résolus en haut du fichier Settings.jsx.
function RapportConfigPanel({
  sections, setSections, sectionsKeys,
  configOpen, setConfigOpen,
  expandedSection, setExpandedSection,
  buildDefault, currentEventId, staffList,
  // Liste du menu pour le filtre de sélection d'articles (Lot Custom A)
  menuList = [],
  // Listes pour Lot Custom A2 — sélections précises supplémentaires
  categoriesList = [],
  spectateursList = [],
  reservationsList = [],
  // Si `temporary` est true, les modifications NE sont PAS sauvegardées dans
  // Firestore (mode modale au clic Générer — Lot 2b). Seulement le state
  // React local est mis à jour. Utile pour des overrides éphémères.
  temporary = false,
  // Mode modale : on cache le bouton de dépliage du panneau (toujours ouvert)
  // et on désactive le toggle global.
  modalMode = false,
}) {
  // Helper : update partiel d'une section + sauvegarde Firestore immédiate.
  // Patch peut contenir { enabled, periodFrom, ... } — merge avec la section.
  const updateSection = async (key, patch) => {
    const next = {
      ...sections,
      [key]: { ...sections[key], ...patch },
    }
    setSections(next)
    if (temporary) return  // mode modale : pas de persistance
    try {
      // Import dynamique pour éviter une dépendance circulaire si jamais
      // (saveSettings est dans firebase/service.js, déjà importé en haut).
      const { saveSettings } = await import('../../firebase/service')
      await saveSettings({ rapportSections: next }, currentEventId)
    } catch (e) { console.error('saveRapportSections:', e) }
  }

  // Helper "toutes activées" / "toutes désactivées" (conserve les filtres)
  const setAllEnabled = async (val) => {
    const next = Object.fromEntries(
      Object.entries(sections).map(([k, v]) => [k, { ...v, enabled: val }])
    )
    setSections(next)
    if (temporary) return
    try {
      const { saveSettings } = await import('../../firebase/service')
      await saveSettings({ rapportSections: next }, currentEventId)
    } catch (e) {}
  }
  // Reset complet (par défaut)
  const resetAll = async () => {
    if (!window.confirm('Réinitialiser tous les filtres aux valeurs par défaut ?')) return
    const def = buildDefault()
    setSections(def)
    if (temporary) return
    try {
      const { saveSettings } = await import('../../firebase/service')
      await saveSettings({ rapportSections: def }, currentEventId)
    } catch (e) {}
  }

  const enabledCount = Object.values(sections).filter(s => s?.enabled).length

  // En mode modale, le contenu est toujours visible (pas de toggle déplié)
  const showContent = modalMode ? true : configOpen

  return (
    <div style={{
      background: modalMode ? 'transparent' : '#fff',
      borderRadius: 8,
      border: modalMode ? 'none' : '0.5px solid var(--border)',
      marginBottom: modalMode ? 0 : 14,
      overflow: 'hidden',
    }}>
      {/* En-tête : titre + compteur + toggle dépliage (caché en mode modale) */}
      {!modalMode && (
        <button
          type="button"
          onClick={() => setConfigOpen(o => !o)}
          style={{
            width: '100%', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'transparent', border: 'none',
            cursor: 'pointer', fontFamily: 'var(--font)',
            color: 'var(--text)', fontSize: 13, fontWeight: 600,
          }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Sections et filtres du rapport
            <span style={{
              fontSize: 11, fontWeight: 500, color: 'var(--muted)',
            }}>
              ({enabledCount + 1}/{sectionsKeys.length + 1})
            </span>
          </span>
          <span style={{ color: 'var(--muted)', fontSize: 16 }}>
            {configOpen ? '▾' : '▸'}
          </span>
        </button>
      )}

      {showContent && (
        <div style={{
          borderTop: modalMode ? 'none' : '0.5px solid var(--border)',
          padding: modalMode ? 0 : '10px 14px 14px',
        }}>
          {!modalMode && (
            <div style={{
              fontSize: 11, color: 'var(--muted)',
              marginBottom: 10, lineHeight: 1.5,
            }}>
              Cliquez sur une section pour configurer ses filtres. La couverture est toujours incluse.
              Les modifications sont sauvegardées automatiquement.
            </div>
          )}

          {/* Liste des sections avec leur ligne d'entête + panneau filtres déplié */}
          {sectionsKeys.map(({ key, label, desc, filters, availableFields }) => {
            const sec = sections[key] || { enabled: true }
            const isExpanded = expandedSection === key
            return (
              <div key={key} style={{
                marginBottom: 6, border: '0.5px solid var(--border)',
                borderRadius: 6, background: sec.enabled ? '#fff' : 'var(--bg2)',
                overflow: 'hidden',
              }}>
                {/* Ligne d'en-tête de la section */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px',
                }}>
                  <input
                    type="checkbox"
                    checked={!!sec.enabled}
                    onChange={(e) => updateSection(key, { enabled: e.target.checked })}
                    style={{
                      width: 16, height: 16,
                      accentColor: 'var(--brand)',
                      cursor: 'pointer', flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600,
                      color: sec.enabled ? 'var(--text)' : 'var(--muted)',
                    }}>
                      {label}
                    </div>
                    <div style={{
                      fontSize: 10, color: 'var(--muted)',
                      marginTop: 1, lineHeight: 1.3,
                    }}>
                      {desc}
                    </div>
                  </div>
                  {/* Bouton dépliage filtres (visible si la section a des filtres et est activée) */}
                  {filters && filters.length > 0 && sec.enabled && (
                    <button
                      type="button"
                      onClick={() => setExpandedSection(isExpanded ? null : key)}
                      style={{
                        padding: '4px 8px',
                        background: isExpanded ? 'var(--brand)' : 'var(--bg2)',
                        color: isExpanded ? '#fff' : 'var(--muted)',
                        border: '0.5px solid var(--border)',
                        borderRadius: 4,
                        fontSize: 10, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'var(--font)',
                        whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                      {isExpanded ? '▾ Filtres' : '▸ Filtres'}
                    </button>
                  )}
                </div>

                {/* Panneau filtres déplié — affiche les filtres spécifiques à cette section */}
                {isExpanded && filters && filters.length > 0 && sec.enabled && (
                  <div style={{
                    padding: '10px 12px 12px',
                    borderTop: '0.5px solid var(--border)',
                    background: 'var(--bg2)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    {filters.includes('period') && (
                      <FilterPeriod sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('topN') && (
                      <FilterTopN sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('staffExclude') && (
                      <FilterStaffExclude sec={sec} onChange={(p) => updateSection(key, p)} staffList={staffList}/>
                    )}
                    {filters.includes('txTypes') && (
                      <FilterTxTypes sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('amountRange') && (
                      <FilterAmountRange sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('soldeRange') && (
                      <FilterSoldeRange sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('sortBy') && (
                      <FilterSortBy sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('resaStatuses') && (
                      <FilterResaStatuses sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('resaType') && (
                      <FilterResaType sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('auditActions') && (
                      <FilterAuditActions sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('auditUserTypes') && (
                      <FilterAuditUserTypes sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('articleSelection') && (
                      <FilterArticleSelection sec={sec} onChange={(p) => updateSection(key, p)}
                        menuList={menuList}/>
                    )}
                    {filters.includes('categorieSelection') && (
                      <FilterCategorieSelection sec={sec} onChange={(p) => updateSection(key, p)}
                        categoriesList={categoriesList} menuList={menuList}/>
                    )}
                    {filters.includes('spectateurSelection') && (
                      <FilterSpectateurSelection sec={sec} onChange={(p) => updateSection(key, p)}
                        spectateursList={spectateursList}/>
                    )}
                    {filters.includes('benevoleSelection') && (
                      <FilterBenevoleSelection sec={sec} onChange={(p) => updateSection(key, p)}
                        reservationsList={reservationsList}/>
                    )}
                    {filters.includes('staffSelection') && (
                      <FilterStaffSelection sec={sec} onChange={(p) => updateSection(key, p)}
                        staffList={staffList}/>
                    )}
                    {filters.includes('totalRow') && (
                      <FilterTotalRow sec={sec} onChange={(p) => updateSection(key, p)}
                        availableFields={availableFields}
                        sectionKey={key}/>
                    )}
                    {filters.includes('fields') && availableFields && (
                      <FilterFields sec={sec} onChange={(p) => updateSection(key, p)}
                        availableFields={availableFields}/>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Boutons rapides */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setAllEnabled(true)}
              style={QUICK_BTN_STYLE}>
              Tout activer
            </button>
            <button type="button" onClick={() => setAllEnabled(false)}
              style={QUICK_BTN_STYLE}>
              Tout désactiver
            </button>
            <button type="button" onClick={resetAll}
              style={{ ...QUICK_BTN_STYLE, color: 'var(--red-dark)' }}>
              Réinitialiser filtres
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Styles communs aux composants de filtre ───────────────────────────
const QUICK_BTN_STYLE = {
  padding: '6px 12px', background: 'var(--bg2)',
  border: '0.5px solid var(--border)', borderRadius: 6,
  fontSize: 11, fontWeight: 600, color: 'var(--text)',
  cursor: 'pointer', fontFamily: 'var(--font)',
}
const FILTER_LABEL_STYLE = {
  fontSize: 11, fontWeight: 600, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '0.04em',
  marginBottom: 4, display: 'block',
}
const FILTER_INPUT_STYLE = {
  padding: '6px 8px', fontSize: 12,
  border: '0.5px solid var(--border)', borderRadius: 4,
  fontFamily: 'var(--font)', background: '#fff',
}

// ─── Composants de filtre — un par type ────────────────────────────────
// Période : 2 champs date HTML5 (du / au)
function FilterPeriod({ sec, onChange }) {
  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>Période (laissez vide pour tout inclure)</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="date" value={sec.periodFrom || ''}
          onChange={e => onChange({ periodFrom: e.target.value })}
          style={{ ...FILTER_INPUT_STYLE, flex: 1 }}/>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>→</span>
        <input type="date" value={sec.periodTo || ''}
          onChange={e => onChange({ periodTo: e.target.value })}
          style={{ ...FILTER_INPUT_STYLE, flex: 1 }}/>
      </div>
    </div>
  )
}

// TopN : nombre d'articles à inclure (input number, min 1)
function FilterTopN({ sec, onChange }) {
  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>Nombre maximum d'articles affichés</label>
      <input type="number" min={1} max={100}
        value={sec.topN ?? 20}
        onChange={e => onChange({ topN: Math.max(1, parseInt(e.target.value) || 20) })}
        style={{ ...FILTER_INPUT_STYLE, width: 100 }}/>
    </div>
  )
}

// Staff exclu : multi-select des emails à NE PAS inclure (cocher = exclure)
function FilterStaffExclude({ sec, onChange, staffList }) {
  const list = staffList || []
  const excluded = sec.staffExclude || []
  const toggle = (email) => {
    const next = excluded.includes(email)
      ? excluded.filter(e => e !== email)
      : [...excluded, email]
    onChange({ staffExclude: next })
  }
  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>
        Staff à exclure ({excluded.length} exclu{excluded.length > 1 ? 's' : ''})
      </label>
      {list.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
          Aucun staff dans cet événement.
        </div>
      ) : (
        <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {list.map(s => {
            const email = s.email || s.id
            const isExcl = excluded.includes(email)
            return (
              <label key={email} style={{
                fontSize: 11, display: 'flex', alignItems: 'center', gap: 6,
                cursor: 'pointer',
                color: isExcl ? 'var(--red-dark)' : 'var(--text)',
              }}>
                <input type="checkbox" checked={isExcl}
                  onChange={() => toggle(email)}
                  style={{ accentColor: 'var(--red)' }}/>
                <span style={{ textDecoration: isExcl ? 'line-through' : 'none' }}>
                  {email}{s.nom ? ` (${s.nom})` : ''}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Types de transactions : multi-checkboxes
function FilterTxTypes({ sec, onChange }) {
  const allTypes = [
    { key: 'credit',           label: 'Crédit' },
    { key: 'debit',            label: 'Encaissement' },
    { key: 'retrait',          label: 'Retrait résa' },
    { key: 'reservation',      label: 'Réservation (création)' },
    { key: 'annulation',       label: 'Annulation' },
    { key: 'benev-retrait',    label: 'Retrait bénévole' },
    { key: 'benev-reservation',label: 'Résa bénévole' },
    { key: 'benev-annulation', label: 'Annul. bénévole' },
    { key: 'remboursement',    label: 'Remboursement' },
    { key: 'credit_correction',label: 'Correction crédit' },
  ]
  const selected = sec.txTypes || []
  const toggle = (key) => {
    const next = selected.includes(key)
      ? selected.filter(k => k !== key)
      : [...selected, key]
    onChange({ txTypes: next })
  }
  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>
        Types de transactions {selected.length === 0 ? '(tous)' : `(${selected.length} sélectionné${selected.length > 1 ? 's' : ''})`}
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 4 }}>
        {allTypes.map(t => (
          <label key={t.key} style={{
            fontSize: 11, display: 'flex', alignItems: 'center', gap: 5,
            cursor: 'pointer',
          }}>
            <input type="checkbox" checked={selected.includes(t.key)}
              onChange={() => toggle(t.key)}
              style={{ accentColor: 'var(--brand)' }}/>
            {t.label}
          </label>
        ))}
      </div>
    </div>
  )
}

// Range montant en € (input number, converti en centimes au backend)
function FilterAmountRange({ sec, onChange }) {
  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>Montant (€) — laissez vide pour ne pas filtrer</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="number" min={0} step="0.01"
          placeholder="Min"
          value={sec.minEur ?? ''}
          onChange={e => onChange({ minEur: e.target.value })}
          style={{ ...FILTER_INPUT_STYLE, flex: 1 }}/>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>→</span>
        <input type="number" min={0} step="0.01"
          placeholder="Max"
          value={sec.maxEur ?? ''}
          onChange={e => onChange({ maxEur: e.target.value })}
          style={{ ...FILTER_INPUT_STYLE, flex: 1 }}/>
      </div>
    </div>
  )
}

// Range solde en €
function FilterSoldeRange({ sec, onChange }) {
  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>Solde restant (€) — laissez vide pour ne pas filtrer</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="number" min={0} step="0.01"
          placeholder="Min"
          value={sec.soldeMinEur ?? ''}
          onChange={e => onChange({ soldeMinEur: e.target.value })}
          style={{ ...FILTER_INPUT_STYLE, flex: 1 }}/>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>→</span>
        <input type="number" min={0} step="0.01"
          placeholder="Max"
          value={sec.soldeMaxEur ?? ''}
          onChange={e => onChange({ soldeMaxEur: e.target.value })}
          style={{ ...FILTER_INPUT_STYLE, flex: 1 }}/>
      </div>
    </div>
  )
}

// Tri spectateurs
function FilterSortBy({ sec, onChange }) {
  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>Trier par</label>
      <select value={sec.sortBy || 'solde'}
        onChange={e => onChange({ sortBy: e.target.value })}
        style={{ ...FILTER_INPUT_STYLE, width: '100%' }}>
        <option value="solde">Solde restant (décroissant)</option>
        <option value="nom">Nom (alphabétique)</option>
        <option value="tx">Nombre de transactions</option>
      </select>
    </div>
  )
}

// Statuts de réservation : multi-checkboxes
function FilterResaStatuses({ sec, onChange }) {
  const allStatuses = [
    { key: 'pending',    label: 'En attente' },
    { key: 'processing', label: 'En préparation' },
    { key: 'ready',      label: 'Prête' },
    { key: 'collected',  label: 'Retirée' },
    { key: 'cancelled',  label: 'Annulée' },
  ]
  const selected = sec.resaStatuses || []
  const toggle = (key) => {
    const next = selected.includes(key)
      ? selected.filter(k => k !== key)
      : [...selected, key]
    onChange({ resaStatuses: next })
  }
  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>
        Statuts {selected.length === 0 ? '(tous)' : `(${selected.length} sélectionné${selected.length > 1 ? 's' : ''})`}
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {allStatuses.map(s => (
          <label key={s.key} style={{
            fontSize: 11, display: 'flex', alignItems: 'center', gap: 5,
            cursor: 'pointer',
          }}>
            <input type="checkbox" checked={selected.includes(s.key)}
              onChange={() => toggle(s.key)}
              style={{ accentColor: 'var(--brand)' }}/>
            {s.label}
          </label>
        ))}
      </div>
    </div>
  )
}

// Type résa : spectateur, bénévole, ou tous
function FilterResaType({ sec, onChange }) {
  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>Type de réservation</label>
      <select value={sec.resaType || 'all'}
        onChange={e => onChange({ resaType: e.target.value })}
        style={{ ...FILTER_INPUT_STYLE, width: '100%' }}>
        <option value="all">Tous</option>
        <option value="spec">Spectateurs uniquement</option>
        <option value="benev">Bénévoles uniquement</option>
      </select>
    </div>
  )
}

// Actions d'audit : input texte libre (CSV des actions à inclure)
function FilterAuditActions({ sec, onChange }) {
  const value = (sec.auditActions || []).join(', ')
  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>Actions à inclure (vide = toutes)</label>
      <input type="text"
        placeholder="ex: CREDIT, RETRAIT, ANNULATION_RESA"
        value={value}
        onChange={e => {
          const arr = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          onChange({ auditActions: arr })
        }}
        style={{ ...FILTER_INPUT_STYLE, width: '100%' }}/>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
        Séparez par des virgules. Sensible à la casse.
      </div>
    </div>
  )
}

// Types user audit : multi-checkboxes
function FilterAuditUserTypes({ sec, onChange }) {
  const allTypes = [
    { key: 'admin',      label: 'Admin' },
    { key: 'staff',      label: 'Staff' },
    { key: 'spectateur', label: 'Spectateur' },
    { key: 'benevole',   label: 'Bénévole' },
    { key: 'system',     label: 'Système' },
  ]
  const selected = sec.auditUserTypes || []
  const toggle = (key) => {
    const next = selected.includes(key)
      ? selected.filter(k => k !== key)
      : [...selected, key]
    onChange({ auditUserTypes: next })
  }
  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>
        Types d'utilisateur {selected.length === 0 ? '(tous)' : `(${selected.length} sélectionné${selected.length > 1 ? 's' : ''})`}
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {allTypes.map(t => (
          <label key={t.key} style={{
            fontSize: 11, display: 'flex', alignItems: 'center', gap: 5,
            cursor: 'pointer',
          }}>
            <input type="checkbox" checked={selected.includes(t.key)}
              onChange={() => toggle(t.key)}
              style={{ accentColor: 'var(--brand)' }}/>
            {t.label}
          </label>
        ))}
      </div>
    </div>
  )
}

// Lot 3 — Champs (colonnes/KPIs/graphiques) à inclure dans la section.
// `availableFields` est passé par section depuis RAPPORT_SECTIONS_KEYS.
// La valeur stockée :
//   - null     = toutes les colonnes (rétro-compat avec rapports antérieurs au Lot 3)
//   - []       = aucune colonne (section apparaît avec juste le titre)
//   - [k1,k2…] = liste explicite des colonnes activées
function FilterFields({ sec, onChange, availableFields }) {
  // Si `fields` est null (état par défaut), on considère toutes les colonnes
  // comme cochées dans l'UI. Dès que l'admin coche/décoche, on bascule vers
  // une liste explicite.
  const isAllByDefault = sec.fields === null || sec.fields === undefined
  const currentSet = isAllByDefault
    ? new Set(availableFields.map(f => f.key))
    : new Set(sec.fields || [])

  const toggle = (fieldKey) => {
    // Si on était en "tout par défaut", on matérialise d'abord la liste complète
    let base = isAllByDefault
      ? availableFields.map(f => f.key)
      : (sec.fields || [])
    const setOfBase = new Set(base)
    if (setOfBase.has(fieldKey)) setOfBase.delete(fieldKey)
    else setOfBase.add(fieldKey)
    onChange({ fields: Array.from(setOfBase) })
  }

  const setAll = (value) => {
    if (value) {
      onChange({ fields: availableFields.map(f => f.key) })
    } else {
      onChange({ fields: [] })
    }
  }
  const resetToDefault = () => onChange({ fields: null })

  const allChecked = currentSet.size === availableFields.length
  const noneChecked = currentSet.size === 0

  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>
        Champs affichés ({currentSet.size}/{availableFields.length})
        {isAllByDefault && (
          <span style={{ marginLeft: 6, fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>
            (toutes par défaut)
          </span>
        )}
      </label>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 4,
        marginBottom: 6,
      }}>
        {availableFields.map(f => (
          <label key={f.key} style={{
            fontSize: 11, display: 'flex', alignItems: 'center', gap: 5,
            cursor: 'pointer',
            color: currentSet.has(f.key) ? 'var(--text)' : 'var(--muted)',
          }}>
            <input type="checkbox" checked={currentSet.has(f.key)}
              onChange={() => toggle(f.key)}
              style={{ accentColor: 'var(--brand)' }}/>
            {f.label}
          </label>
        ))}
      </div>
      {/* Actions rapides */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setAll(true)} disabled={allChecked && !isAllByDefault}
          style={{
            padding: '3px 8px', background: 'var(--bg)', border: '0.5px solid var(--border)',
            borderRadius: 4, fontSize: 10, color: 'var(--text)',
            cursor: (allChecked && !isAllByDefault) ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font)',
            opacity: (allChecked && !isAllByDefault) ? 0.5 : 1,
          }}>Tout</button>
        <button type="button" onClick={() => setAll(false)} disabled={noneChecked}
          style={{
            padding: '3px 8px', background: 'var(--bg)', border: '0.5px solid var(--border)',
            borderRadius: 4, fontSize: 10, color: 'var(--text)',
            cursor: noneChecked ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font)', opacity: noneChecked ? 0.5 : 1,
          }}>Rien</button>
        {!isAllByDefault && (
          <button type="button" onClick={resetToDefault}
            style={{
              padding: '3px 8px', background: 'var(--bg)', border: '0.5px solid var(--border)',
              borderRadius: 4, fontSize: 10, color: 'var(--brand-dark)',
              cursor: 'pointer', fontFamily: 'var(--font)',
            }}>↺ Défaut</button>
        )}
      </div>
    </div>
  )
}

// ─── Lot Custom A — Sélection précise d'articles via TransferList ───
// Le menu de l'événement est passé via la prop menuList. La valeur stockée :
//   - null     = pas de filtre (tous les articles inclus, comportement défaut)
//   - []       = aucun article sélectionné (table vide)
//   - [ids…]   = liste explicite des IDs articles à inclure
function FilterArticleSelection({ sec, onChange, menuList }) {
  const list = (menuList || []).map(m => ({
    id: m.id || m.nom,    // certains items menu n'ont pas d'ID stable, on utilise nom
    label: m.nom || 'Sans nom',
    meta: (m.prix !== undefined) ? `${(m.prix / 100).toFixed(2)} €` : null,
  }))
  // Si null = pas de filtre. Pour l'UI, on présente une case "Activer le filtre"
  // qui bascule entre null et [] (ou vice versa) pour éviter de matérialiser
  // une liste vide par accident.
  const filterActive = sec.articleSelection !== null && sec.articleSelection !== undefined
  const selectedIds = filterActive ? (sec.articleSelection || []) : []

  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>
        Sélection précise des articles
        {filterActive && (
          <span style={{ marginLeft: 6, fontWeight: 500, color: 'var(--brand-dark)', textTransform: 'none', letterSpacing: 0 }}>
            ({selectedIds.length} sélectionné{selectedIds.length > 1 ? 's' : ''} sur {list.length})
          </span>
        )}
      </label>
      {!filterActive ? (
        <div style={{
          background: 'var(--bg)', borderRadius: 4,
          border: '0.5px dashed var(--border)',
          padding: '12px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>
            Aucun filtre actif. Tous les articles seront inclus dans la section.
          </div>
          <button type="button" onClick={() => onChange({ articleSelection: [] })}
            style={{
              padding: '5px 12px', background: 'var(--brand)', color: '#fff',
              border: 'none', borderRadius: 4,
              fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font)',
            }}>
            Activer le filtre
          </button>
        </div>
      ) : (
        <>
          <TransferList
            items={list}
            selectedIds={selectedIds}
            onChange={(newIds) => onChange({ articleSelection: newIds })}
            placeholder="Rechercher un article…"
            emptyAvailableMessage="Aucun article dans le menu."
            emptySelectedMessage="Aucune sélection. La table sera vide."
          />
          <div style={{ marginTop: 6, textAlign: 'right' }}>
            <button type="button" onClick={() => onChange({ articleSelection: null })}
              style={{
                background: 'transparent', border: 'none',
                color: 'var(--muted)', fontSize: 10,
                cursor: 'pointer', fontFamily: 'inherit',
                textDecoration: 'underline',
              }}>
              désactiver le filtre (inclure tous)
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Lot Custom A — Configuration de la ligne de total ───
// totalRow stockée dans la config : { enabled, label, position, columns, groupBy, subtotalLabel }
// - columns: liste des keys de colonnes à sommer (ex: ['qty', 'ca'])
// - groupBy: 'categorie' pour articles (sous-totaux par catégorie), null sinon
// - Les colonnes sommables sont déterminées par availableFields filtrées sur
//   celles qui ont du sens à sommer (qty, ca, total, montant, etc.) — pour
//   cette première version on présente toutes les colonnes, l'admin choisit.
// sectionKey est passé pour savoir si la section supporte le groupBy (articles uniquement).
function FilterTotalRow({ sec, onChange, availableFields, sectionKey }) {
  const total = sec.totalRow || { enabled: false, label: 'Total', position: 'bottom', columns: [] }
  const update = (patch) => onChange({ totalRow: { ...total, ...patch } })
  // Colonnes candidates au total : toutes celles qui ne sont pas un graphique
  // ou un KPI (heuristique : on garde celles qui ne commencent pas par 'kpi_'
  // et qui ne sont pas 'charts'/'bar_chart'/'pie_chart'/'kpis'/'tab_repartition'/
  // 'rank' et 'nom'/'who'/'label' (textuelles)).
  const NON_SUMMABLE = ['charts', 'bar_chart', 'pie_chart', 'kpis', 'tab_repartition',
    'rank', 'nom', 'who', 'label', 'date', 'heure', 'type', 'status', 'staff',
    'action', 'userType', 'code', 'id', 'email']
  const summable = (availableFields || []).filter(f =>
    !f.key.startsWith('kpi_') && !NON_SUMMABLE.includes(f.key)
  )

  // Seul Articles supporte le groupBy par catégorie pour cette livraison.
  // Plus tard on pourra étendre (par staff, par statut, etc.)
  const groupByOptions = []
  if (sectionKey === 'articles') {
    groupByOptions.push({ key: 'categorie', label: 'Par catégorie' })
  }

  const toggleColumn = (key) => {
    const current = total.columns || []
    const next = current.includes(key)
      ? current.filter(k => k !== key)
      : [...current, key]
    update({ columns: next })
  }

  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>
        Ligne de total
        {total.enabled && (
          <span style={{ marginLeft: 6, fontWeight: 500, color: 'var(--brand-dark)', textTransform: 'none', letterSpacing: 0 }}>
            ({(total.columns || []).length} colonne{(total.columns || []).length > 1 ? 's' : ''} sommée{(total.columns || []).length > 1 ? 's' : ''}
            {total.groupBy ? ` + sous-totaux ${total.groupBy}` : ''})
          </span>
        )}
      </label>
      <div style={{
        background: 'var(--bg)', borderRadius: 4,
        border: '0.5px solid var(--border)', padding: 10,
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!total.enabled}
            onChange={e => update({ enabled: e.target.checked })}
            style={{ accentColor: 'var(--brand)' }}/>
          Afficher une ligne de total
        </label>

        {total.enabled && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
            {/* Label */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase' }}>
                Libellé
              </div>
              <input type="text"
                value={total.label || ''}
                onChange={e => update({ label: e.target.value })}
                placeholder="ex: Total"
                style={{
                  width: '100%', padding: '5px 8px', fontSize: 11,
                  border: '0.5px solid var(--border)', borderRadius: 4,
                  fontFamily: 'inherit', background: '#fff',
                  boxSizing: 'border-box',
                }}/>
            </div>

            {/* Position */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase' }}>
                Position
              </div>
              <select value={total.position || 'bottom'}
                onChange={e => update({ position: e.target.value })}
                style={{
                  width: '100%', padding: '5px 8px', fontSize: 11,
                  border: '0.5px solid var(--border)', borderRadius: 4,
                  fontFamily: 'inherit', background: '#fff',
                }}>
                <option value="bottom">En bas du tableau</option>
                <option value="top">En haut du tableau</option>
              </select>
            </div>

            {/* Colonnes à sommer */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase' }}>
                Colonnes à sommer
              </div>
              {summable.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                  Aucune colonne sommable détectée.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 4 }}>
                  {summable.map(f => (
                    <label key={f.key} style={{
                      fontSize: 11, display: 'flex', alignItems: 'center', gap: 5,
                      cursor: 'pointer',
                    }}>
                      <input type="checkbox"
                        checked={(total.columns || []).includes(f.key)}
                        onChange={() => toggleColumn(f.key)}
                        style={{ accentColor: 'var(--brand)' }}/>
                      {f.label.replace(/^Colonne\s*:\s*/i, '')}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Lot Custom A2 — Sous-totaux par groupe */}
            {groupByOptions.length > 0 && (
              <div style={{ paddingTop: 8, borderTop: '0.5px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase' }}>
                  Sous-totaux par groupe
                </div>
                <select value={total.groupBy || ''}
                  onChange={e => update({ groupBy: e.target.value || null })}
                  style={{
                    width: '100%', padding: '5px 8px', fontSize: 11,
                    border: '0.5px solid var(--border)', borderRadius: 4,
                    fontFamily: 'inherit', background: '#fff', marginBottom: 6,
                  }}>
                  <option value="">Aucun (juste le total final)</option>
                  {groupByOptions.map(opt => (
                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                  ))}
                </select>
                {total.groupBy && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase' }}>
                      Libellé des sous-totaux
                    </div>
                    <input type="text"
                      value={total.subtotalLabel || 'Sous-total'}
                      onChange={e => update({ subtotalLabel: e.target.value })}
                      placeholder="ex: Sous-total"
                      style={{
                        width: '100%', padding: '5px 8px', fontSize: 11,
                        border: '0.5px solid var(--border)', borderRadius: 4,
                        fontFamily: 'inherit', background: '#fff',
                        boxSizing: 'border-box',
                      }}/>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>
                      Le libellé est suivi du nom du groupe (ex: "Sous-total Boissons")
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Lot Custom A2 — Composants TransferList pour les autres sources
// ════════════════════════════════════════════════════════════════════════

// Pattern commun pour les filtres de sélection précise par TransferList.
// Centralise le toggle d'activation (null → []) et le rendu du wrapper.
function FilterPreciseSelectionWrapper({
  label, sec, fieldKey, totalCount, selectedCount, onActivate, onDeactivate, children,
}) {
  const filterActive = sec[fieldKey] !== null && sec[fieldKey] !== undefined
  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>
        {label}
        {filterActive && (
          <span style={{ marginLeft: 6, fontWeight: 500, color: 'var(--brand-dark)', textTransform: 'none', letterSpacing: 0 }}>
            ({selectedCount} sélectionné{selectedCount > 1 ? 's' : ''} sur {totalCount})
          </span>
        )}
      </label>
      {!filterActive ? (
        <div style={{
          background: 'var(--bg)', borderRadius: 4,
          border: '0.5px dashed var(--border)',
          padding: '12px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>
            Aucun filtre actif. Tous les éléments seront inclus.
          </div>
          <button type="button" onClick={onActivate}
            style={{
              padding: '5px 12px', background: 'var(--brand)', color: '#fff',
              border: 'none', borderRadius: 4,
              fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font)',
            }}>
            Activer le filtre
          </button>
        </div>
      ) : (
        <>
          {children}
          <div style={{ marginTop: 6, textAlign: 'right' }}>
            <button type="button" onClick={onDeactivate}
              style={{
                background: 'transparent', border: 'none',
                color: 'var(--muted)', fontSize: 10,
                cursor: 'pointer', fontFamily: 'inherit',
                textDecoration: 'underline',
              }}>
              désactiver le filtre (inclure tous)
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Sélection par catégorie d'articles (utilise le nom de catégorie comme clé)
function FilterCategorieSelection({ sec, onChange, categoriesList, menuList }) {
  // Affiche les catégories du store, avec en métadonnée le nb d'articles
  // de cette catégorie dans le menu.
  const list = (categoriesList || []).map(c => {
    const count = (menuList || []).filter(m => m.cat === c.nom).length
    return {
      id: c.nom,                                        // clé = nom (cohérent avec menu[i].cat)
      label: c.nom || 'Sans nom',
      meta: `${count} article${count > 1 ? 's' : ''}`,
    }
  })
  const filterActive = sec.categorieSelection !== null && sec.categorieSelection !== undefined
  const selectedIds = filterActive ? (sec.categorieSelection || []) : []

  return (
    <FilterPreciseSelectionWrapper
      label="Sélection précise des catégories"
      sec={sec} fieldKey="categorieSelection"
      totalCount={list.length} selectedCount={selectedIds.length}
      onActivate={() => onChange({ categorieSelection: [] })}
      onDeactivate={() => onChange({ categorieSelection: null })}>
      <TransferList
        items={list}
        selectedIds={selectedIds}
        onChange={(newIds) => onChange({ categorieSelection: newIds })}
        placeholder="Rechercher une catégorie…"
        emptyAvailableMessage="Aucune catégorie configurée."
        emptySelectedMessage="Aucune catégorie sélectionnée. La table sera vide."
      />
    </FilterPreciseSelectionWrapper>
  )
}

// Sélection par spectateur (utilise l'ID FY-XXXX comme clé)
function FilterSpectateurSelection({ sec, onChange, spectateursList }) {
  const list = (spectateursList || []).map(s => ({
    id: s.id,
    label: s.nom || s.id || 'Sans nom',
    meta: s.id ? s.id : null,
  }))
  const filterActive = sec.spectateurSelection !== null && sec.spectateurSelection !== undefined
  const selectedIds = filterActive ? (sec.spectateurSelection || []) : []

  return (
    <FilterPreciseSelectionWrapper
      label="Sélection précise des spectateurs"
      sec={sec} fieldKey="spectateurSelection"
      totalCount={list.length} selectedCount={selectedIds.length}
      onActivate={() => onChange({ spectateurSelection: [] })}
      onDeactivate={() => onChange({ spectateurSelection: null })}>
      <TransferList
        items={list}
        selectedIds={selectedIds}
        onChange={(newIds) => onChange({ spectateurSelection: newIds })}
        placeholder="Rechercher par nom ou ID…"
        emptyAvailableMessage="Aucun spectateur."
        emptySelectedMessage="Aucun spectateur sélectionné. La table sera vide."
      />
    </FilterPreciseSelectionWrapper>
  )
}

// Sélection par bénévole (extraits des résas car pas de collection benevoles côté store)
function FilterBenevoleSelection({ sec, onChange, reservationsList }) {
  // Construit la liste unique des bénévoles depuis les résas
  const benevMap = new Map()
  for (const r of (reservationsList || [])) {
    const id = r.benevoleId
    const nom = r.benevoleNom
    if (id && !benevMap.has(id)) {
      benevMap.set(id, { id, label: nom || id, meta: null })
    }
  }
  const list = Array.from(benevMap.values()).sort((a, b) =>
    (a.label || '').localeCompare(b.label || '')
  )
  const filterActive = sec.benevoleSelection !== null && sec.benevoleSelection !== undefined
  const selectedIds = filterActive ? (sec.benevoleSelection || []) : []

  return (
    <FilterPreciseSelectionWrapper
      label="Sélection précise des bénévoles"
      sec={sec} fieldKey="benevoleSelection"
      totalCount={list.length} selectedCount={selectedIds.length}
      onActivate={() => onChange({ benevoleSelection: [] })}
      onDeactivate={() => onChange({ benevoleSelection: null })}>
      <TransferList
        items={list}
        selectedIds={selectedIds}
        onChange={(newIds) => onChange({ benevoleSelection: newIds })}
        placeholder="Rechercher un bénévole…"
        emptyAvailableMessage="Aucun bénévole avec résa."
        emptySelectedMessage="Aucun bénévole sélectionné. La table sera vide."
      />
    </FilterPreciseSelectionWrapper>
  )
}

// Sélection précise par staff (utilise l'email comme clé, comme staffExclude)
// Cohabite avec staffExclude : si staffSelection est actif (non null), il prend
// priorité ; sinon staffExclude continue de fonctionner. Cela évite la confusion
// de deux filtres opposés actifs simultanément.
function FilterStaffSelection({ sec, onChange, staffList }) {
  const list = (staffList || []).map(s => ({
    id: s.email || s.id || s.username || '—',
    label: s.email || s.username || s.id || 'Sans nom',
    meta: s.nom || s.role || null,
  }))
  const filterActive = sec.staffSelection !== null && sec.staffSelection !== undefined
  const selectedIds = filterActive ? (sec.staffSelection || []) : []
  const hasExclude = (sec.staffExclude || []).length > 0

  return (
    <FilterPreciseSelectionWrapper
      label="Sélection précise du staff (prioritaire sur exclusion)"
      sec={sec} fieldKey="staffSelection"
      totalCount={list.length} selectedCount={selectedIds.length}
      onActivate={() => onChange({ staffSelection: [] })}
      onDeactivate={() => onChange({ staffSelection: null })}>
      <TransferList
        items={list}
        selectedIds={selectedIds}
        onChange={(newIds) => onChange({ staffSelection: newIds })}
        placeholder="Rechercher par email ou nom…"
        emptyAvailableMessage="Aucun staff dans cet événement."
        emptySelectedMessage="Aucun staff sélectionné. La table sera vide."
      />
      {hasExclude && (
        <div style={{
          marginTop: 6, padding: '6px 8px',
          background: 'var(--amber-light)', borderRadius: 4,
          fontSize: 10, color: 'var(--amber-dark)', lineHeight: 1.4,
        }}>
          ⚠ Vous avez aussi {(sec.staffExclude || []).length} staff exclu(s) configuré(s).
          La sélection précise <strong>remplace</strong> ce filtre quand elle est active.
        </div>
      )}
    </FilterPreciseSelectionWrapper>
  )
}
