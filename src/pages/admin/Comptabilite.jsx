/**
 * pages/admin/Comptabilite.jsx — v8 debug
 *
 * Page comptabilité 360° du festival.
 *
 * Périmètre :
 *   - Recettes : crédits encaissés, ventes stand, retraits de réservation
 *   - Dépenses : cachets artistes, consos bénévoles, gifts artistes, remboursements
 *
 * 2 vues comptables :
 *   - Trésorerie : ce qui entre / sort de la caisse (réalité physique)
 *   - Résultat   : analytique, basé sur la consommation réelle (chiffre d'affaires)
 *
 * 3 onglets :
 *   - Synthèse : KPI + graphes + compte de résultat simplifié
 *   - Recettes : détail ligne par ligne des entrées
 *   - Dépenses : détail ligne par ligne des sorties
 *
 * Filtres : recherche libre, mode de paiement, origine, période
 * Exports : XLSX (multi-feuille) et PDF (avec autotable)
 */

import React, { useState, useEffect, useMemo } from 'react'
import {
  Search, Filter, Download, FileText, Calendar, X,
  TrendingUp, TrendingDown, Wallet, AlertCircle, CheckCircle, FileSpreadsheet,
} from 'lucide-react'
import useAppStore from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { watchCachets, watchFinances } from '../../firebase/service'
import { APP_VERSION_LABEL } from '../../utils/buildInfo'
import AnalysisTables from '../../components/analyse/AnalysisTables'
import { Table2 } from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

const fmtE = (n) => `${(Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const fmtEShort = (n) => `${(Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`

const fmtDate = (date) => {
  if (!date) return ''
  const d = date?.toDate ? date.toDate() : (date.seconds ? new Date(date.seconds * 1000) : new Date(date))
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const fmtDateTime = (date) => {
  if (!date) return ''
  const d = date?.toDate ? date.toDate() : (date.seconds ? new Date(date.seconds * 1000) : new Date(date))
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const getTimestamp = (item) => {
  // Récupère le timestamp en millisecondes depuis n'importe quel format
  const t = item.createdAt || item.timestamp || item.date
  if (!t) return 0
  if (t.toDate) return t.toDate().getTime()
  if (t.seconds) return t.seconds * 1000
  if (t instanceof Date) return t.getTime()
  if (typeof t === 'string') return new Date(t).getTime()
  if (typeof t === 'number') return t
  return 0
}

// ═══════════════════════════════════════════════════════════════════════
// Catégorisation des opérations
// ═══════════════════════════════════════════════════════════════════════

/**
 * Convertit une transaction brute (log) en ligne comptable normalisée.
 * Tient compte du fait que les montants logs sont en CENTIMES (Math.round(prix*100)).
 */
function logToOperation(log, vue = 'tresorerie') {
  const baseAmount = (log.montant || 0) / 100
  const ts = getTimestamp(log)

  switch (log.type) {
    case 'credit': {
      // Crédit d'un compte spectateur : +trésorerie (entre en caisse)
      // En vue résultat : pas un revenu (juste de la trésorerie temporaire)
      return {
        id: log.id || `log-${ts}`,
        ts, date: log.date || ts,
        sens: 'recette',
        categorie: 'Crédit billetterie',
        origine: 'Billetterie',
        description: `Crédit · ${log.specNom || '—'}`,
        ref: log.specId || '',
        montant: baseAmount,
        mode: 'cash', // les crédits sont généralement en espèces ou CB
        staff: log.staff || log.benevoleNom || '',
        // Vue résultat : crédit non considéré comme revenu net
        excludeInResult: vue === 'resultat',
      }
    }
    case 'debit': {
      // Vente stand : +revenu (consommation réelle)
      return {
        id: log.id || `log-${ts}`,
        ts, date: log.date || ts,
        sens: 'recette',
        categorie: 'Vente stand',
        origine: log.staff || 'Stand',
        description: log.label || 'Achat',
        ref: log.specId || log.benevoleNom || '',
        montant: baseAmount,
        mode: 'compte',
        staff: log.staff || '',
        items: log.items || [],
        kind: 'vente',
      }
    }
    case 'retrait': {
      // Retrait réservation : déjà payé, neutre en tréso (mais c'est une vente conceptuelle)
      // En vue résultat : c'est une vente effective (consommée)
      return {
        id: log.id || `log-${ts}`,
        ts, date: log.date || ts,
        sens: 'recette',
        categorie: 'Retrait réservation',
        origine: log.staff || 'Stand',
        description: log.label || `Retrait · ${log.specNom || '—'}`,
        ref: log.specId || '',
        montant: baseAmount,
        mode: 'compte',
        staff: log.staff || '',
        // En tréso : neutre (la trésorerie a déjà encaissé à la création de la résa)
        excludeInTresorerie: vue === 'tresorerie',
        items: log.items || [],
        kind: log.isBenev ? 'resa-benevole' : 'resa-spectateur',
      }
    }

    case 'reservation': {
      // Réservation créée : +trésorerie (encaissement immédiat)
      // En vue résultat : revenu différé (sera consommé au retrait)
      return {
        id: log.id || `log-${ts}`,
        ts, date: log.date || ts,
        sens: 'recette',
        categorie: 'Réservation',
        origine: 'Billetterie',
        description: log.label || `Réservation · ${log.specNom || '—'}`,
        ref: log.specId || '',
        montant: baseAmount,
        mode: 'cash',
        staff: log.staff || '',
        excludeInResult: vue === 'resultat',
      }
    }
    case 'annulation':
    case 'benev-annulation': {
      // Remboursement : -trésorerie (sort de la caisse)
      const mt = Math.abs(baseAmount)
      return {
        id: log.id || `log-${ts}`,
        ts, date: log.date || ts,
        sens: 'depense',
        categorie: 'Remboursement',
        origine: 'Stand',
        description: log.label || `Annulation · ${log.specNom || '—'}`,
        ref: log.specId || '',
        montant: mt,
        mode: 'cash',
        staff: log.staff || '',
      }
    }
    case 'benev-retrait': {
      // Bénévole consomme un avantage : pas une vraie sortie d'argent, mais coût "humain"
      // (la valeur a été financée par l'asso)
      return {
        id: log.id || `log-${ts}`,
        ts, date: log.date || ts,
        sens: 'depense',
        categorie: 'Consommation bénévole',
        origine: log.staff || 'Bénévoles',
        description: log.label || `Avantage · ${log.benevoleNom || '—'}`,
        ref: log.benevoleNom || '',
        montant: baseAmount,
        mode: 'avantage',
        staff: log.staff || '',
        // En tréso : pas de sortie réelle (déjà décompté à l'achat des stocks)
        excludeInTresorerie: vue === 'tresorerie',
        items: log.items || [],
        kind: 'conso-benevole',
      }
    }
    case 'artist-gift': {
      // Conso offerte artiste : même logique que bénévole
      return {
        id: log.id || `log-${ts}`,
        ts, date: log.date || ts,
        sens: 'depense',
        categorie: 'Avantage artiste',
        origine: 'Stand',
        description: log.label || 'Consommation offerte',
        ref: log.benevoleNom || log.artiste || '',
        montant: baseAmount,
        mode: 'avantage',
        staff: log.staff || '',
        excludeInTresorerie: vue === 'tresorerie',
      }
    }
    case 'remboursement': {
      // Remboursement de solde billetterie : -trésorerie (sortie de cash vers le client)
      // Pas un coût pour l'asso (juste rendre l'argent du compte) → exclu en vue résultat.
      return {
        id: log.id || `log-${ts}`,
        ts, date: log.date || ts,
        sens: 'depense',
        categorie: 'Remboursement solde',
        origine: log.staff || 'Billetterie',
        description: log.label || `Remboursement · ${log.specNom || '—'}`,
        ref: log.specId || '',
        montant: Math.abs(baseAmount),
        mode: 'cash',
        staff: log.staff || '',
        excludeInResult: vue === 'resultat',
      }
    }
    case 'credit_correction': {
      // Crédit corrigeant un débit : recrédite le compte client (geste commercial, erreur...)
      // Pas un mouvement de tréso réel (juste un transfert virtuel sur le compte).
      // En vue résultat : ce n'est pas un coût direct, c'est un ajustement comptable.
      return {
        id: log.id || `log-${ts}`,
        ts, date: log.date || ts,
        sens: 'depense',
        categorie: 'Crédit correction',
        origine: log.staff || 'Billetterie',
        description: log.label || `Crédit correction · ${log.specNom || '—'}`,
        ref: log.specId || '',
        montant: Math.abs(baseAmount),
        mode: 'compte',
        staff: log.staff || '',
        // En tréso : neutre (le crédit virtuel ne sort pas du tiroir)
        excludeInTresorerie: vue === 'tresorerie',
        // En résultat : neutre aussi (juste ajustement)
        excludeInResult: vue === 'resultat',
      }
    }
    case 'cachet-artiste': {
      // Paiement effectif d'un cachet artiste depuis un compte spectateur (rare mais existe).
      // Note : la majorité des cachets sont gérés via la collection 'cachets' séparée
      // (cf. cachetToOperation ci-dessous). Ce case couvre les transactions exceptionnelles.
      return {
        id: log.id || `log-${ts}`,
        ts, date: log.date || ts,
        sens: 'depense',
        categorie: 'Cachet artiste',
        origine: log.staff || 'Direction artistique',
        description: log.label || `Cachet · ${log.artiste || '—'}`,
        ref: log.artiste || log.specId || '',
        montant: baseAmount,
        mode: 'cash',
        staff: log.staff || '',
      }
    }
    default:
      // Type inconnu : on filtre les types non-financiers (audit, etc.)
      return null
  }
}

/**
 * Convertit un cachet en opération comptable.
 * En tréso : compte uniquement les cachets PAYÉS (sortie réelle)
 * En résultat : compte tous les cachets (planifié ET payé) car c'est un engagement
 */
function cachetToOperation(cachet, vue = 'tresorerie') {
  if (cachet.statut === 'annule') return null
  // En trésorerie : seuls les payés comptent (sortie réelle)
  if (vue === 'tresorerie' && cachet.statut !== 'paye') return null

  const ts = cachet.paidAt ? getTimestamp({ createdAt: cachet.paidAt })
           : getTimestamp(cachet)

  const modeLabel = {
    especes:  'cash',
    virement: 'virement',
    cheque:   'cheque',
  }[cachet.modePaiement] || 'cash'

  return {
    id: 'cachet-' + cachet.id,
    ts, date: ts,
    sens: 'depense',
    categorie: 'Cachet artiste',
    origine: 'Artistes',
    description: `${cachet.artiste || 'Inconnu'}${cachet.type !== 'cachet' ? ' (' + cachet.type + ')' : ''}`,
    ref: cachet.numeroDecharge || '',
    montant: Number(cachet.montant) || 0,
    mode: modeLabel,
    staff: cachet.createdByNom || '',
    statut: cachet.statut, // 'paye' | 'planifie'
  }
}

/**
 * Convertit un paiement d'exposant (acompte ou solde) en opération comptable.
 * Un exposant peut générer jusqu'à 2 opérations (acompte + solde) côté Recettes.
 *
 * @param {object} expo - { id, nom, thematiqueLabel, acompte, solde, ... }
 * @param {'acompte'|'solde'} kind
 * @returns {object|null} opération ou null si pas de paiement de ce type
 */
function expoPaymentToOperation(expo, kind) {
  const payment = expo?.[kind]
  if (!payment || !Number(payment.montant)) return null

  const ts = (() => {
    if (payment.paidAt) {
      const t = new Date(payment.paidAt).getTime()
      if (!isNaN(t)) return t
    }
    if (payment.date) {
      const t = new Date(payment.date).getTime()
      if (!isNaN(t)) return t
    }
    return Date.now()
  })()

  const modeMap = {
    cash: 'cash',
    cb: 'cb',
    virement: 'virement',
    cheque: 'cheque',
  }

  return {
    id: `expo-${expo.id}-${kind}`,
    ts, date: payment.date || new Date(ts).toISOString().slice(0, 10),
    sens: 'recette',
    categorie: 'Frais exposant',
    origine: 'Exposants',
    description: `${kind === 'acompte' ? 'Acompte' : 'Solde'} — ${expo.nom || '—'}${expo.thematiqueLabel ? ` (${expo.thematiqueLabel})` : ''}`,
    ref: expo.id || '',
    montant: Number(payment.montant) / 100, // centimes → euros pour cohérence avec les autres
    mode: modeMap[payment.method] || payment.method || 'cash',
    staff: '',
  }
}

/**
 * Convertit un mouvement du module Finances (Lot Finances 1) en opération comptable.
 * Les mouvements stockent leur montant en CENTIMES, conversion ÷100 vers euros.
 *
 * En vue 'tresorerie' : on ne garde que les mouvements PAYÉS (sortie réelle de caisse).
 * En vue 'resultat'   : on garde tout (prévus inclus, car ils représentent un engagement).
 */
function financeToOperation(finance, vue = 'tresorerie') {
  if (!finance) return null
  if (vue === 'tresorerie' && finance.statut !== 'paye') return null

  const ts = (() => {
    if (finance.date) {
      const t = new Date(finance.date).getTime()
      if (!isNaN(t)) return t
    }
    return getTimestamp(finance)
  })()

  const modeMap = {
    especes: 'cash', cb: 'cb', virement: 'virement', cheque: 'cheque', autre: 'autre',
  }

  const isRec = finance.sens === 'recette'
  return {
    id: 'finance-' + finance.id,
    ts, date: finance.date || new Date(ts).toISOString().slice(0, 10),
    sens: isRec ? 'recette' : 'depense',
    categorie: finance.categorie || (isRec ? 'Recette diverse' : 'Dépense diverse'),
    origine: isRec ? 'Recettes orga' : 'Dépenses orga',
    description: finance.libelle || finance.categorie || '—',
    ref: finance.id || '',
    montant: Number(finance.montant) / 100, // centimes → euros
    mode: modeMap[finance.modePaiement] || finance.modePaiement || 'autre',
    staff: finance.createdBy?.nom || '',
    statut: finance.statut, // 'paye' | 'prevu'
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Composant principal
// ═══════════════════════════════════════════════════════════════════════

export default function Comptabilite() {
  const { logs, spectateurs, expositions } = useAppStore()
  const { events, currentEventId } = useEventStore()
  const currentEvent = events.find(e => e.id === currentEventId && !e.deleted)
  const { isMobile } = useBreakpoint()

  // States
  const [vue, setVue]       = useState('tresorerie')  // 'tresorerie' | 'resultat'
  const [tab, setTab]       = useState('synthese')    // 'synthese' | 'recettes' | 'depenses'
  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode]    = useState('all')
  const [filterOrigine, setFilterOrigine] = useState('all')
  const [filterArticle, setFilterArticle] = useState('all')
  const [showTotalFiltre, setShowTotalFiltre] = useState(false)
  const [filterPeriode, setFilterPeriode] = useState('all') // 'all' | '7d' | '30d' | 'custom'
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin]     = useState('')
  const [sortBy, setSortBy]       = useState('ts-desc') // 'ts-desc' | 'ts-asc' | 'montant-desc' | 'montant-asc'
  const [exporting, setExporting] = useState(false)
  const [cachets, setCachets] = useState([])
  const [finances, setFinances] = useState([])

  // Chargement cachets
  useEffect(() => {
    if (!currentEventId) { setCachets([]); return }
    const unsub = watchCachets(setCachets, currentEventId)
    return unsub
  }, [currentEventId])

  // Chargement finances (Lot Finances 1)
  useEffect(() => {
    if (!currentEventId) { setFinances([]); return }
    const unsub = watchFinances(setFinances, currentEventId)
    return unsub
  }, [currentEventId])

  // ─── Conversion des données brutes en opérations comptables ──────────
  const operations = useMemo(() => {
    const ops = []
    // Logs (transactions opérationnelles)
    ;(logs || []).forEach(log => {
      const op = logToOperation(log, vue)
      if (!op) return
      if (vue === 'tresorerie' && op.excludeInTresorerie) return
      if (vue === 'resultat' && op.excludeInResult) return
      ops.push(op)
    })
    // Cachets
    cachets.forEach(c => {
      const op = cachetToOperation(c, vue)
      if (op) ops.push(op)
    })
    // Paiements exposants (acompte + solde, indépendamment) — recettes du module Exposants
    ;(expositions || []).forEach(expo => {
      ['acompte', 'solde'].forEach(kind => {
        const op = expoPaymentToOperation(expo, kind)
        if (op) ops.push(op)
      })
    })
    // Mouvements financiers manuels (Lot Finances 1)
    ;(finances || []).forEach(f => {
      const op = financeToOperation(f, vue)
      if (op) ops.push(op)
    })
    return ops
  }, [logs, cachets, expositions, finances, vue])

  // Liste des articles présents dans les transactions (pour le filtre).
  // Extrait depuis les items, dédupliqué et trié — inclut les articles supprimés.
  const articlesDisponibles = useMemo(() => {
    const set = new Set()
    operations.forEach(o => {
      if (Array.isArray(o.items)) {
        o.items.forEach(it => {
          const nom = it.nom || it.name
          if (nom) set.add(nom)
        })
      }
    })
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [operations])

  // ─── Filtrage ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const now = Date.now()
    const MS_DAY = 86_400_000
    let result = [...operations]

    // Filtre par onglet
    if (tab === 'recettes') result = result.filter(o => o.sens === 'recette')
    if (tab === 'depenses') result = result.filter(o => o.sens === 'depense')

    // Recherche libre
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      result = result.filter(o =>
        (o.description || '').toLowerCase().includes(q) ||
        (o.ref || '').toLowerCase().includes(q) ||
        (o.origine || '').toLowerCase().includes(q) ||
        (o.categorie || '').toLowerCase().includes(q) ||
        (o.staff || '').toLowerCase().includes(q)
      )
    }

    // Filtre mode
    if (filterMode !== 'all') result = result.filter(o => o.mode === filterMode)

    // Filtre origine
    if (filterOrigine !== 'all') result = result.filter(o => o.categorie === filterOrigine)

    // Filtre par article : ne garde que les opérations contenant l'article choisi
    if (filterArticle !== 'all') {
      result = result.filter(o =>
        Array.isArray(o.items) && o.items.some(it => (it.nom || it.name) === filterArticle)
      )
    }

    // Filtre période
    if (filterPeriode === '7d')  result = result.filter(o => (now - o.ts) < 7 * MS_DAY)
    if (filterPeriode === '30d') result = result.filter(o => (now - o.ts) < 30 * MS_DAY)
    if (filterPeriode === 'custom') {
      if (dateDebut) {
        const t = new Date(dateDebut + 'T00:00:00').getTime()
        result = result.filter(o => o.ts >= t)
      }
      if (dateFin) {
        const t = new Date(dateFin + 'T23:59:59').getTime()
        result = result.filter(o => o.ts <= t)
      }
    }

    // Tri
    if (sortBy === 'ts-desc')      result.sort((a, b) => b.ts - a.ts)
    if (sortBy === 'ts-asc')       result.sort((a, b) => a.ts - b.ts)
    if (sortBy === 'montant-desc') result.sort((a, b) => b.montant - a.montant)
    if (sortBy === 'montant-asc')  result.sort((a, b) => a.montant - b.montant)

    return result
  }, [operations, tab, search, filterMode, filterOrigine, filterArticle, filterPeriode, dateDebut, dateFin, sortBy])

  // Total du filtre courant. Si un article est filtré, on totalise la part
  // de cet article (montant + unités) ; sinon la somme des montants filtrés.
  const totalFiltre = useMemo(() => {
    if (filterArticle === 'all') {
      return { total: filtered.reduce((s, o) => s + (o.montant || 0), 0), unites: null }
    }
    let total = 0, unites = 0
    filtered.forEach(o => {
      ;(o.items || []).forEach(it => {
        if ((it.nom || it.name) === filterArticle) {
          const qty = it.qty || it.quantite || 1
          const montant = (it.total != null ? it.total : (it.prixUnit || it.prix || 0) * qty) / 100
          total += montant
          unites += qty
        }
      })
    })
    return { total, unites }
  }, [filtered, filterArticle])

  // ─── KPIs globaux (sur l'ensemble, pas filtré) ───────────────────────
  const kpis = useMemo(() => {
    const recettes = operations.filter(o => o.sens === 'recette').reduce((s, o) => s + o.montant, 0)
    const depenses = operations.filter(o => o.sens === 'depense').reduce((s, o) => s + o.montant, 0)
    const solde = recettes - depenses

    // Engagement à payer (cachets planifiés en vue tréso uniquement)
    const aPayer = cachets
      .filter(c => c.statut === 'planifie')
      .reduce((s, c) => s + (Number(c.montant) || 0), 0)

    // Soldes spectateurs restants (= dette de la Maison Ylla envers eux)
    const soldesRestants = (spectateurs || [])
      .reduce((s, sp) => s + (Number(sp.solde) || 0), 0) / 100

    return { recettes, depenses, solde, aPayer, soldesRestants }
  }, [operations, cachets, spectateurs])

  // ─── Décomposition par catégorie (pour la synthèse) ──────────────────
  const parCategorie = useMemo(() => {
    const byCat = {}
    operations.forEach(o => {
      const k = o.sens + '::' + o.categorie
      if (!byCat[k]) byCat[k] = { sens: o.sens, categorie: o.categorie, total: 0, count: 0 }
      byCat[k].total += o.montant
      byCat[k].count += 1
    })
    return Object.values(byCat).sort((a, b) => b.total - a.total)
  }, [operations])

  // Origines disponibles pour le filtre
  const categoriesDispo = useMemo(() => {
    const cats = new Set(operations.map(o => o.categorie))
    return [...cats].sort()
  }, [operations])

  // ─── Exports ─────────────────────────────────────────────────────────
  // ─── Exports via endpoints serveur (style identique au rapport événement) ─
  // Préparation des données pour les endpoints serveur
  const buildExportPayload = () => ({
    event: {
      nom: currentEvent?.nom || 'Événement',
      couleur: currentEvent?.couleur || '#1a6b7a',
    },
    appVersion: APP_VERSION_LABEL, // pour footer document généré
    vue,
    operations: operations.map(o => ({
      ts: o.ts,
      date: o.ts, // côté serveur on utilise ts pour reformater
      sens: o.sens,
      categorie: o.categorie,
      origine: o.origine,
      description: o.description,
      ref: o.ref,
      montant: Number(o.montant) || 0,
      mode: o.mode,
      staff: o.staff,
      statut: o.statut,
    })),
    kpis: {
      recettes: Number(kpis.recettes) || 0,
      depenses: Number(kpis.depenses) || 0,
      solde:    Number(kpis.solde) || 0,
      aPayer:   Number(kpis.aPayer) || 0,
      soldesRestants: Number(kpis.soldesRestants) || 0,
    },
    parCategorie: parCategorie.map(c => ({
      sens: c.sens,
      categorie: c.categorie,
      total: Number(c.total) || 0,
      count: Number(c.count) || 0,
    })),
  })

  // Helper : déclenche le téléchargement à partir d'un blob et d'un nom
  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: filename })
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Charge SheetJS dynamiquement (CDN) — utilisé en fallback si endpoint serveur down
  const loadXLSX = () => new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(window.XLSX); return }
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => resolve(window.XLSX)
    s.onerror = () => reject(new Error('Impossible de charger XLSX'))
    document.head.appendChild(s)
  })

  /**
   * Fallback : génère un XLSX simple côté client (sans styles avancés)
   * quand l'endpoint serveur retourne une erreur. Garde au moins l'accès aux données.
   */
  const fallbackClientXLSX = async (payload) => {
    const XLSX = await loadXLSX()
    const wb = XLSX.utils.book_new()
    const v = payload.vue === 'tresorerie' ? 'Trésorerie' : 'Résultat'
    // Synthèse
    const ws1 = XLSX.utils.aoa_to_sheet([
      [`COMPTABILITÉ — ${payload.event.nom}`],
      [`Vue ${v}`, `Généré le ${new Date().toLocaleString('fr-FR')}`],
      [],
      ['Recettes', payload.kpis.recettes.toFixed(2) + ' €'],
      ['Dépenses', payload.kpis.depenses.toFixed(2) + ' €'],
      ['Solde net', payload.kpis.solde.toFixed(2) + ' €'],
      [payload.vue === 'tresorerie' ? 'À payer' : 'Soldes spec.',
        (payload.vue === 'tresorerie' ? payload.kpis.aPayer : payload.kpis.soldesRestants).toFixed(2) + ' €'],
      [],
      ['Par catégorie'],
      ['Sens', 'Catégorie', 'Total (€)', 'Nb'],
      ...payload.parCategorie.map(c => [
        c.sens === 'recette' ? 'Recette' : 'Dépense',
        c.categorie, c.total.toFixed(2), c.count,
      ]),
    ])
    ws1['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 8 }]
    XLSX.utils.book_append_sheet(wb, ws1, 'Synthèse')
    // Recettes
    const rec = payload.operations.filter(o => o.sens === 'recette').sort((a, b) => b.ts - a.ts)
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['Date', 'Catégorie', 'Description', 'Mode', 'Staff', 'Montant (€)'],
      ...rec.map(o => [
        new Date(o.ts).toLocaleString('fr-FR'),
        o.categorie, o.description, o.mode, o.staff,
        Number(o.montant).toFixed(2),
      ]),
    ])
    ws2['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 36 }, { wch: 12 }, { wch: 18 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Recettes')
    // Dépenses
    const dep = payload.operations.filter(o => o.sens === 'depense').sort((a, b) => b.ts - a.ts)
    const ws3 = XLSX.utils.aoa_to_sheet([
      ['Date', 'Catégorie', 'Description', 'Mode', 'Statut', 'Staff', 'Montant (€)'],
      ...dep.map(o => [
        new Date(o.ts).toLocaleString('fr-FR'),
        o.categorie, o.description, o.mode,
        o.statut === 'paye' ? 'Payé' : o.statut === 'planifie' ? 'À payer' : '',
        o.staff, Number(o.montant).toFixed(2),
      ]),
    ])
    ws3['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 36 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws3, 'Dépenses')
    const d = new Date()
    const jj = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const aaaa = d.getFullYear()
    XLSX.writeFile(wb, `${payload.event.nom || 'Compta'} - Comptabilité - ${jj}_${mm}_${aaaa}.xlsx`)
  }

  const handleExportXLSX = async () => {
    try {
      setExporting(true)
      const payload = buildExportPayload()
      const resp = await fetch('/api/comptabilite', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        // Si l'endpoint serveur échoue, fallback côté client (sans styles)
        console.warn(`Endpoint comptabilité KO (${resp.status}). Fallback client.`)
        await fallbackClientXLSX(payload)
        return
      }
      const blob = await resp.blob()
      const d = new Date()
      const jj = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const aaaa = d.getFullYear()
      downloadBlob(blob, `${currentEvent?.nom || 'Compta'} - Comptabilité - ${jj}_${mm}_${aaaa}.xlsx`)
    } catch (e) {
      console.error('Export XLSX:', e)
      // Dernier recours : tente le fallback client si fetch a complètement échoué
      try {
        await fallbackClientXLSX(buildExportPayload())
      } catch (e2) {
        alert('Erreur export Excel : ' + e.message + ' (fallback aussi en échec : ' + e2.message + ')')
      }
    } finally {
      setExporting(false)
    }
  }

  const handleExportPDF = async () => {
    try {
      setExporting(true)
      const payload = buildExportPayload()
      const resp = await fetch('/api/comptabilite-pdf', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const errTxt = await resp.text().catch(() => '')
        throw new Error(`Erreur serveur (${resp.status}) : ${errTxt.slice(0, 200)}`)
      }
      const blob = await resp.blob()
      const d = new Date()
      const jj = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const aaaa = d.getFullYear()
      downloadBlob(blob, `${currentEvent?.nom || 'Compta'} - Comptabilité - ${jj}_${mm}_${aaaa}.pdf`)
    } catch (e) {
      console.error('Export PDF:', e)
      alert('Erreur export PDF : ' + e.message)
    } finally {
      setExporting(false)
    }
  }

  const resetFilters = () => {
    setSearch('')
    setFilterMode('all')
    setFilterOrigine('all')
    setFilterArticle('all')
    setFilterPeriode('all')
    setDateDebut('')
    setDateFin('')
  }

  return (
    <div style={{ padding: '16px 12px', maxWidth: 1200, margin: '0 auto' }}>
      {/* ─── HEADER ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, color: 'var(--marine)', margin: 0 }}>
          💼 Comptabilité
        </h1>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          {currentEvent?.nom || 'Aucun événement'} · {operations.length} opération{operations.length > 1 ? 's' : ''}
        </div>
      </div>

      {/* ─── BARRE SWITCH VUE + EXPORTS ──────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr auto auto',
        gap: 8, marginBottom: 16,
      }}>
        {/* Toggle Tréso/Résultat */}
        <div style={{
          display: 'flex',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 4,
          minHeight: 44,
        }}>
          {[
            { k: 'tresorerie', label: '💰 Trésorerie', desc: 'Caisse réelle' },
            { k: 'resultat',   label: '📊 Résultat',   desc: 'Analytique' },
          ].map(opt => (
            <button key={opt.k} onClick={() => setVue(opt.k)}
              style={{
                flex: 1,
                // var(--brand) au lieu de var(--marine) : teal qui reste contrasté
                // contre du blanc en clair ET en sombre.
                background: vue === opt.k ? 'var(--brand)' : 'transparent',
                color: vue === opt.k ? '#fff' : 'var(--muted)',
                border: 'none', borderRadius: 8,
                padding: '8px 12px',
                fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                WebkitTapHighlightColor: 'transparent',
              }}>
              {opt.label}
            </button>
          ))}
        </div>
        <button onClick={handleExportXLSX} disabled={exporting || operations.length === 0}
          style={{
            padding: '10px 14px', background: '#14803C',
            border: 'none', borderRadius: 10,
            fontSize: 13, fontWeight: 700, color: '#fff',
            cursor: exporting ? 'wait' : 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            minHeight: 44, opacity: (exporting || operations.length === 0) ? 0.6 : 1,
            WebkitTapHighlightColor: 'transparent',
          }}>
          <FileSpreadsheet size={16}/> Excel
        </button>
        <button onClick={handleExportPDF} disabled={exporting || operations.length === 0}
          style={{
            padding: '10px 14px', background: 'var(--red)',
            border: 'none', borderRadius: 10,
            fontSize: 13, fontWeight: 700, color: '#fff',
            cursor: exporting ? 'wait' : 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            minHeight: 44, opacity: (exporting || operations.length === 0) ? 0.6 : 1,
            WebkitTapHighlightColor: 'transparent',
          }}>
          <FileText size={16}/> PDF
        </button>
      </div>

      {/* ─── KPI CARDS ──────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: 8, marginBottom: 16,
      }}>
        <KpiCard label="Recettes" value={fmtEShort(kpis.recettes)} color="var(--green)" icon={TrendingUp} isMobile={isMobile}/>
        <KpiCard label="Dépenses" value={fmtEShort(kpis.depenses)} color="var(--coral)" icon={TrendingDown} isMobile={isMobile}/>
        <KpiCard label="Solde net" value={fmtEShort(kpis.solde)}
          color={kpis.solde >= 0 ? 'var(--marine)' : 'var(--red)'}
          icon={Wallet} isMobile={isMobile}/>
        <KpiCard
          label={vue === 'tresorerie' ? 'À payer' : 'Soldes spec.'}
          value={vue === 'tresorerie' ? fmtEShort(kpis.aPayer) : fmtEShort(kpis.soldesRestants)}
          color="var(--gold)"
          icon={AlertCircle} isMobile={isMobile}
          sub={vue === 'tresorerie' ? 'Cachets prévus' : 'Restant sur cartes'}
        />
      </div>

      {/* ─── ONGLETS ────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 4, marginBottom: 12,
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      }}>
        {[
          { k: 'synthese', label: 'Synthèse', count: null },
          { k: 'recettes', label: 'Recettes', count: operations.filter(o => o.sens === 'recette').length },
          { k: 'depenses', label: 'Dépenses', count: operations.filter(o => o.sens === 'depense').length },
          { k: 'analyse', label: "Tableaux d'analyse", count: null },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={{
              flex: '1 0 auto',
              // var(--brand) au lieu de var(--marine) : teal qui reste contrasté
              // contre du blanc en clair ET en sombre.
              background: tab === t.k ? 'var(--brand)' : 'transparent',
              color: tab === t.k ? '#fff' : 'var(--muted)',
              border: 'none', borderRadius: 8,
              padding: '10px 16px', minHeight: 40,
              fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              WebkitTapHighlightColor: 'transparent',
            }}>
            {t.label}
            {t.count !== null && (
              <span style={{
                marginLeft: 6, fontSize: 11, opacity: 0.85,
                padding: '1px 6px', borderRadius: 10,
                background: tab === t.k ? 'rgba(255,255,255,0.20)' : 'var(--bg2)',
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── CONTENU ONGLET ─────────────────────────────────────────── */}
      {tab === 'analyse' ? (
        <AnalysisTables operations={operations}/>
      ) : tab === 'synthese' ? (
        <SyntheseTab parCategorie={parCategorie} kpis={kpis} vue={vue} isMobile={isMobile} operations={operations}/>
      ) : (
        <>
          {/* Filtres */}
          <FilterBar
            isMobile={isMobile}
            search={search} setSearch={setSearch}
            filterMode={filterMode} setFilterMode={setFilterMode}
            filterOrigine={filterOrigine} setFilterOrigine={setFilterOrigine}
            filterArticle={filterArticle} setFilterArticle={setFilterArticle}
            articlesDisponibles={articlesDisponibles}
            filterPeriode={filterPeriode} setFilterPeriode={setFilterPeriode}
            dateDebut={dateDebut} setDateDebut={setDateDebut}
            dateFin={dateFin} setDateFin={setDateFin}
            sortBy={sortBy} setSortBy={setSortBy}
            categoriesDispo={categoriesDispo.filter(c => {
              // Filtre les catégories à montrer selon l'onglet courant
              const inTab = operations.some(o =>
                o.categorie === c &&
                (tab === 'recettes' ? o.sens === 'recette' : o.sens === 'depense')
              )
              return inTab
            })}
            onReset={resetFilters}
          />

          {/* Total du filtre (affichage optionnel) */}
          {filterArticle !== 'all' && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 8,
              background: 'var(--brand-light, #E1F5EE)',
              border: '0.5px solid var(--brand, #0F6E56)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 10,
            }}>
              <div style={{ fontSize: 13, color: 'var(--brand-dark, #04342C)' }}>
                <strong>{filterArticle}</strong>
                {' — '}{filtered.length} transaction{filtered.length > 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {totalFiltre.unites != null && (
                  <span style={{ fontSize: 13, color: 'var(--brand-dark, #04342C)' }}>
                    {totalFiltre.unites} unité{totalFiltre.unites > 1 ? 's' : ''}
                  </span>
                )}
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--brand-dark, #04342C)' }}>
                  {totalFiltre.total.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </span>
              </div>
            </div>
          )}

          {/* Tableau */}
          <OperationsTable operations={filtered} isMobile={isMobile} tab={tab}/>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Sous-composants
// ═══════════════════════════════════════════════════════════════════════

function KpiCard({ label, value, color, icon: Icon, sub, isMobile }) {
  return (
    <div style={{
      background: 'var(--bg)', borderRadius: 10, padding: isMobile ? '10px 12px' : '14px 16px',
      border: '1px solid var(--border)', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{
          fontSize: isMobile ? 9 : 10, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{label}</span>
        {Icon && <Icon size={14} style={{ color, flexShrink: 0 }}/>}
      </div>
      <div style={{
        fontSize: isMobile ? 17 : 22, fontWeight: 800, color,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{value}</div>
      {sub && (
        <div style={{
          fontSize: isMobile ? 9 : 10, color: 'var(--muted)', marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{sub}</div>
      )}
    </div>
  )
}

// ─── Onglet Synthèse ──────────────────────────────────────────────────
function SyntheseTab({ parCategorie, kpis, vue, isMobile, operations }) {
  const recettes = parCategorie.filter(c => c.sens === 'recette')
  const depenses = parCategorie.filter(c => c.sens === 'depense')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Compte de résultat simplifié */}
      <div style={{
        background: 'var(--bg)', borderRadius: 12, padding: isMobile ? 14 : 18,
        border: '1px solid var(--border)',
      }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14,
        }}>
          📋 Compte de résultat simplifié
        </div>

        {recettes.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>
              ▼ RECETTES
            </div>
            {recettes.map(c => (
              <CategorieLine key={c.categorie} cat={c} color="var(--green)"/>
            ))}
            <CategorieLine
              cat={{ categorie: 'Total recettes', total: kpis.recettes, count: recettes.reduce((s, c) => s + c.count, 0) }}
              color="var(--green)" isTotal
            />
          </>
        )}

        {depenses.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral)', marginTop: 14, marginBottom: 8 }}>
              ▼ DÉPENSES
            </div>
            {depenses.map(c => (
              <CategorieLine key={c.categorie} cat={c} color="var(--coral)" sign="-"/>
            ))}
            <CategorieLine
              cat={{ categorie: 'Total dépenses', total: kpis.depenses, count: depenses.reduce((s, c) => s + c.count, 0) }}
              color="var(--coral)" sign="-" isTotal
            />
          </>
        )}

        {/* Ligne résultat */}
        <div style={{
          marginTop: 16, paddingTop: 14,
          borderTop: '2px solid var(--marine)',
          display: 'flex', justifyContent: 'space-between',
          fontSize: 16, fontWeight: 800,
        }}>
          <span style={{ color: 'var(--marine)' }}>= RÉSULTAT NET</span>
          <span style={{ color: kpis.solde >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {kpis.solde >= 0 ? '+' : ''}{fmtE(kpis.solde)}
          </span>
        </div>

        {/* Notes selon la vue */}
        {vue === 'tresorerie' ? (
          <div style={{
            marginTop: 12, padding: '8px 12px',
            background: 'var(--bg2)', borderRadius: 8,
            fontSize: 11, color: 'var(--muted)', lineHeight: 1.5,
          }}>
            💡 <strong>Vue Trésorerie</strong> : montre les flux réels d'argent en caisse.
            Les cachets en attente ({fmtE(kpis.aPayer)}) seront soustraits quand vous les paierez.
            Les soldes spectateurs restants ({fmtE(kpis.soldesRestants)}) sont des avances déjà encaissées.
          </div>
        ) : (
          <div style={{
            marginTop: 12, padding: '8px 12px',
            background: 'var(--bg2)', borderRadius: 8,
            fontSize: 11, color: 'var(--muted)', lineHeight: 1.5,
          }}>
            💡 <strong>Vue Résultat</strong> : montre l'activité réelle (consommations effectives, charges engagées).
            Les crédits non encore consommés ({fmtE(kpis.soldesRestants)}) sont une dette envers les spectateurs.
            Tous les cachets engagés sont comptés, même non encore versés.
          </div>
        )}
      </div>

      {/* Aperçu graphique recettes vs dépenses */}
      {(kpis.recettes > 0 || kpis.depenses > 0) && (
        <div style={{
          background: 'var(--bg)', borderRadius: 12, padding: isMobile ? 14 : 18,
          border: '1px solid var(--border)',
        }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14,
          }}>
            📊 Aperçu équilibre
          </div>
          <RecettesVsDepensesBar kpis={kpis}/>
        </div>
      )}
    </div>
  )
}

function CategorieLine({ cat, color, sign = '+', isTotal = false }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: isTotal ? '8px 0' : '4px 0 4px 12px',
      fontSize: isTotal ? 14 : 13,
      fontWeight: isTotal ? 800 : 500,
      borderTop: isTotal ? '1px solid var(--border)' : 'none',
      marginTop: isTotal ? 4 : 0,
    }}>
      <span style={{ color: isTotal ? color : 'var(--text)' }}>
        {cat.categorie}
        {!isTotal && (
          <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 6 }}>
            ({cat.count})
          </span>
        )}
      </span>
      <span style={{ color, fontWeight: isTotal ? 800 : 700 }}>
        {sign}{fmtE(cat.total)}
      </span>
    </div>
  )
}

function RecettesVsDepensesBar({ kpis }) {
  const total = kpis.recettes + kpis.depenses
  if (total === 0) return null
  const pctR = (kpis.recettes / total) * 100
  return (
    <div>
      <div style={{ display: 'flex', height: 32, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{
          width: `${pctR}%`, background: 'var(--green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 11, fontWeight: 700,
        }}>
          {pctR > 15 && fmtEShort(kpis.recettes)}
        </div>
        <div style={{
          width: `${100 - pctR}%`, background: 'var(--coral)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 11, fontWeight: 700,
        }}>
          {(100 - pctR) > 15 && fmtEShort(kpis.depenses)}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
        <span>🟢 {pctR.toFixed(0)}% Recettes</span>
        <span>🟠 {(100 - pctR).toFixed(0)}% Dépenses</span>
      </div>
    </div>
  )
}

// ─── Barre de filtres ──────────────────────────────────────────────────
function FilterBar({
  isMobile, search, setSearch,
  filterMode, setFilterMode,
  filterOrigine, setFilterOrigine,
  filterArticle, setFilterArticle,
  articlesDisponibles = [],
  filterPeriode, setFilterPeriode,
  dateDebut, setDateDebut, dateFin, setDateFin,
  sortBy, setSortBy,
  categoriesDispo, onReset,
}) {
  const [showAdv, setShowAdv] = useState(!isMobile)

  return (
    <div style={{
      background: 'var(--bg)', borderRadius: 10, padding: 12,
      border: '1px solid var(--border)', marginBottom: 12,
    }}>
      {/* Recherche pleine largeur */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}/>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher (description, référence, staff…)"
          style={{
            width: '100%', minWidth: 0, maxWidth: '100%',
            padding: '10px 12px 10px 36px', minHeight: 40,
            border: '1px solid var(--border)', borderRadius: 8,
            fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--bg2)',
            boxSizing: 'border-box',
          }}/>
      </div>

      {/* Toggle avancés sur mobile */}
      {isMobile && (
        <button onClick={() => setShowAdv(s => !s)}
          style={{
            width: '100%', padding: 8,
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 8, fontSize: 12, fontWeight: 700,
            color: 'var(--marine)', cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            marginBottom: showAdv ? 10 : 0,
            WebkitTapHighlightColor: 'transparent',
          }}>
          <Filter size={14}/> {showAdv ? 'Masquer les filtres' : 'Filtres avancés'}
        </button>
      )}

      {showAdv && (
        <>
          {/* Filtres en grille */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 8, marginBottom: 10,
          }}>
            <FilterSelect label="Mode" value={filterMode} onChange={setFilterMode}
              options={[
                { v: 'all', l: 'Tous' },
                { v: 'cash', l: '💵 Espèces' },
                { v: 'virement', l: '🏦 Virement' },
                { v: 'cheque', l: '📝 Chèque' },
                { v: 'compte', l: '💳 Compte' },
                { v: 'avantage', l: '🎁 Avantage' },
              ]}/>
            <FilterSelect label="Catégorie" value={filterOrigine} onChange={setFilterOrigine}
              options={[
                { v: 'all', l: 'Toutes' },
                ...categoriesDispo.map(c => ({ v: c, l: c })),
              ]}/>
            <FilterSelect label="Article" value={filterArticle} onChange={setFilterArticle}
              options={[
                { v: 'all', l: 'Tous les articles' },
                ...articlesDisponibles.map(a => ({ v: a, l: a })),
              ]}/>
            <FilterSelect label="Période" value={filterPeriode} onChange={setFilterPeriode}
              options={[
                { v: 'all', l: 'Tout' },
                { v: '7d', l: '7 derniers jours' },
                { v: '30d', l: '30 derniers jours' },
                { v: 'custom', l: 'Personnalisée' },
              ]}/>
            <FilterSelect label="Tri" value={sortBy} onChange={setSortBy}
              options={[
                { v: 'ts-desc', l: '↓ Récent' },
                { v: 'ts-asc', l: '↑ Ancien' },
                { v: 'montant-desc', l: '↓ Montant' },
                { v: 'montant-asc', l: '↑ Montant' },
              ]}/>
          </div>

          {/* Dates si période personnalisée */}
          {filterPeriode === 'custom' && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10,
            }}>
              <div>
                <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Du</label>
                <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 10px', minHeight: 38,
                    border: '1px solid var(--border)', borderRadius: 8,
                    fontSize: 12, fontFamily: 'inherit', outline: 'none',
                    background: 'var(--bg2)', boxSizing: 'border-box',
                  }}/>
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Au</label>
                <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 10px', minHeight: 38,
                    border: '1px solid var(--border)', borderRadius: 8,
                    fontSize: 12, fontFamily: 'inherit', outline: 'none',
                    background: 'var(--bg2)', boxSizing: 'border-box',
                  }}/>
              </div>
            </div>
          )}

          {/* Reset */}
          <button onClick={onReset}
            style={{
              padding: '6px 12px', background: 'transparent',
              border: '1px solid var(--border)', borderRadius: 8,
              fontSize: 11, fontWeight: 600, color: 'var(--muted)',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              WebkitTapHighlightColor: 'transparent',
            }}>
            <X size={12}/> Réinitialiser
          </button>
        </>
      )}
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4, fontWeight: 600 }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '8px 10px', minHeight: 38,
          border: '1px solid var(--border)', borderRadius: 8,
          fontSize: 12, fontFamily: 'inherit', outline: 'none',
          background: 'var(--bg2)', boxSizing: 'border-box', cursor: 'pointer',
        }}>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  )
}

// ─── Tableau des opérations ────────────────────────────────────────────
function OperationsTable({ operations, isMobile, tab }) {
  if (operations.length === 0) {
    return (
      <div style={{
        background: 'var(--bg)', borderRadius: 10, padding: 40, textAlign: 'center',
        border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13,
      }}>
        Aucune opération ne correspond aux filtres.
      </div>
    )
  }

  const total = operations.reduce((s, o) => s + o.montant, 0)
  const sens = tab === 'recettes' ? 'recette' : tab === 'depenses' ? 'depense' : null

  return (
    <div style={{ background: 'var(--bg)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
      {/* Header tableau (desktop seulement) */}
      {!isMobile && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '100px 140px 1fr 100px 120px',
          gap: 12, padding: '8px 14px',
          background: 'var(--bg2)',
          fontSize: 10, fontWeight: 700, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
          borderBottom: '1px solid var(--border)',
        }}>
          <div>Date</div>
          <div>Catégorie</div>
          <div>Description</div>
          <div>Mode</div>
          <div style={{ textAlign: 'right' }}>Montant</div>
        </div>
      )}

      {/* Lignes */}
      {operations.map(o => <OperationRow key={o.id} op={o} isMobile={isMobile}/>)}

      {/* Total bas */}
      <div style={{
        padding: '12px 14px',
        background: 'var(--bg2)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderTop: '1px solid var(--border)',
        fontSize: 13, fontWeight: 800,
      }}>
        <span style={{ color: 'var(--marine)' }}>
          Total {operations.length} opération{operations.length > 1 ? 's' : ''}
        </span>
        <span style={{
          color: sens === 'depense' ? 'var(--coral)' : 'var(--green)',
          fontSize: 16,
        }}>
          {sens === 'depense' ? '-' : '+'}{fmtE(total)}
        </span>
      </div>
    </div>
  )
}

function OperationRow({ op, isMobile }) {
  const isDepense = op.sens === 'depense'
  const color = isDepense ? 'var(--coral)' : 'var(--green)'

  if (isMobile) {
    return (
      <div style={{
        padding: 12, borderBottom: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--marine)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {op.description}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
              {fmtDate(op.date)} · {op.categorie}
              {op.statut === 'planifie' && <span style={{ color: 'var(--gold)', marginLeft: 4 }}>· Prévu</span>}
            </div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color, flexShrink: 0, whiteSpace: 'nowrap' }}>
            {isDepense ? '-' : '+'}{fmtE(op.montant)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '100px 140px 1fr 100px 120px',
      gap: 12, padding: '10px 14px',
      borderBottom: '1px solid var(--border)',
      alignItems: 'center',
      fontSize: 12,
    }}>
      <div style={{ color: 'var(--muted)' }}>{fmtDate(op.date)}</div>
      <div style={{ color: 'var(--marine)', fontWeight: 600,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {op.categorie}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {op.description}
        </div>
        {op.ref && (
          <div style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Ref : {op.ref}
          </div>
        )}
      </div>
      <div>
        <span style={{
          fontSize: 10, fontWeight: 700,
          padding: '3px 8px', borderRadius: 4,
          background: 'var(--bg2)', color: 'var(--muted)',
        }}>
          {op.mode === 'cash' ? '💵' :
           op.mode === 'virement' ? '🏦' :
           op.mode === 'cheque' ? '📝' :
           op.mode === 'avantage' ? '🎁' :
           op.mode === 'compte' ? '💳' : op.mode}
        </span>
        {op.statut === 'planifie' && (
          <span style={{
            fontSize: 9, fontWeight: 700, marginLeft: 4,
            padding: '2px 6px', borderRadius: 4,
            background: 'var(--gold-light)', color: 'var(--gold)',
          }}>
            Prévu
          </span>
        )}
      </div>
      <div style={{
        textAlign: 'right', fontWeight: 800, fontSize: 13,
        color, whiteSpace: 'nowrap',
      }}>
        {isDepense ? '-' : '+'}{fmtE(op.montant)}
      </div>
    </div>
  )
}
