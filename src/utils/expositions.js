/**
 * utils/expositions.js — Helpers pour le module Exposants
 *
 * Fonctions pures (sans I/O) utilisées par les composants UI et les exports
 * pour calculer statuts, totaux et restant dû à partir d'un objet expo.
 */

/**
 * Calcule le statut de paiement d'un exposant.
 *
 * @param {object} expo - { montantTotal, acompte, solde, forcedStatut, forcedStatutMotif }
 * @returns {'paye'|'acompte'|'impaye'}
 *
 * Si `forcedStatut` est défini, il prend priorité sur le calcul. Le statut forcé
 * doit toujours être accompagné d'un motif (forcedStatutMotif) pour la traçabilité.
 *
 * Règles de calcul (statut non forcé) :
 *   - solde présent ET (acompte + solde) >= montantTotal → 'paye'
 *   - acompte présent uniquement → 'acompte'
 *   - sinon → 'impaye'
 *
 * Pour savoir SI un statut est forcé (afficher un badge différent), utiliser
 * `isExpoStatutForce(expo)` qui retourne un booléen.
 */
export function computeExpoStatut(expo) {
  // Statut forcé manuellement par un admin — priorité absolue
  if (expo?.forcedStatut && ['paye', 'acompte', 'impaye'].includes(expo.forcedStatut)) {
    return expo.forcedStatut
  }
  // Sinon, calcul automatique depuis les montants
  const total = Number(expo?.montantTotal) || 0
  if (total <= 0) return 'impaye'
  const acompte = Number(expo?.acompte?.montant) || 0
  const solde = Number(expo?.solde?.montant) || 0
  const paye = acompte + solde
  if (paye >= total) return 'paye'
  if (acompte > 0) return 'acompte'
  return 'impaye'
}

/**
 * Indique si le statut d'un exposant est forcé manuellement
 * (différent de la valeur qui résulterait du calcul des montants).
 *
 * Utilisé pour afficher un indicateur visuel (badge ⚠️) dans l'UI.
 */
export function isExpoStatutForce(expo) {
  return !!expo?.forcedStatut && ['paye', 'acompte', 'impaye'].includes(expo.forcedStatut)
}

/**
 * Calcule le montant déjà payé (acompte + solde).
 * @returns {number} en centimes
 */
export function computeExpoPaye(expo) {
  return (Number(expo?.acompte?.montant) || 0) + (Number(expo?.solde?.montant) || 0)
}

/**
 * Calcule le restant dû (montantTotal - paye, jamais négatif).
 * @returns {number} en centimes
 */
export function computeExpoRestant(expo) {
  const total = Number(expo?.montantTotal) || 0
  return Math.max(0, total - computeExpoPaye(expo))
}

/**
 * Calcule le pourcentage payé (0-100).
 * @returns {number}
 */
export function computeExpoPercent(expo) {
  const total = Number(expo?.montantTotal) || 0
  if (total <= 0) return 0
  return Math.min(100, Math.round((computeExpoPaye(expo) / total) * 100))
}

/**
 * Labels lisibles pour les statuts (FR).
 */
export const STATUT_LABEL = {
  paye:    'Payé',
  acompte: 'Acompte versé',
  impaye:  'Impayé',
}

/**
 * Couleurs CSS associées aux statuts (compatibles avec le design system YllaCash).
 * Retourne { bg, color } pour styliser un badge.
 */
export function statutColors(statut) {
  switch (statut) {
    case 'paye':    return { bg: 'var(--green-light)',  color: 'var(--green-dark)' }
    case 'acompte': return { bg: 'var(--gold-light)',   color: 'var(--gold-dark)' }
    case 'impaye':  return { bg: 'var(--red-light)',    color: 'var(--red-dark)' }
    default:        return { bg: 'var(--bg2)',          color: 'var(--muted)' }
  }
}

/**
 * Méthodes de paiement supportées (UI dropdown).
 */
export const PAYMENT_METHODS = [
  { id: 'cash',     label: 'Espèces' },
  { id: 'cb',       label: 'Carte bancaire' },
  { id: 'virement', label: 'Virement' },
  { id: 'cheque',   label: 'Chèque' },
]

export const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map(m => [m.id, m.label]))

/**
 * Agrège des stats globales pour la barre du haut de la liste Exposants.
 * @param {Array} expositions
 * @returns {{ totalFacture, totalEncaisse, totalRestant, nbPaye, nbAcompte, nbImpaye }}
 */
export function aggregateExpoStats(expositions) {
  let totalFacture = 0
  let totalEncaisse = 0
  let nbPaye = 0, nbAcompte = 0, nbImpaye = 0

  for (const e of expositions || []) {
    totalFacture += Number(e?.montantTotal) || 0
    totalEncaisse += computeExpoPaye(e)
    const s = computeExpoStatut(e)
    if (s === 'paye') nbPaye++
    else if (s === 'acompte') nbAcompte++
    else nbImpaye++
  }
  return {
    totalFacture,
    totalEncaisse,
    totalRestant: totalFacture - totalEncaisse,
    nbPaye, nbAcompte, nbImpaye,
  }
}

// ────────────────────────────────────────────────────────────────────
// LIVRAISON A — Helpers ajoutés
// ────────────────────────────────────────────────────────────────────

/**
 * Types d'exposants supportés (UI dropdown).
 * - particulier : personne physique (nom complet, adresse personnelle)
 * - entreprise  : personne morale (raison sociale, SIRET, dirigeant...)
 */
export const TYPE_EXPOSANT = [
  { id: 'particulier', label: 'Particulier' },
  { id: 'entreprise',  label: 'Entreprise' },
]
export const TYPE_LABEL = Object.fromEntries(TYPE_EXPOSANT.map(t => [t.id, t.label]))

/**
 * Identité par défaut d'un exposant (utilisée dans les formulaires).
 * Les champs entreprise (raisonSociale, siret, etc.) sont toujours présents
 * mais conditionnellement remplis selon typeExposant.
 */
export function defaultIdentite() {
  return {
    // Communs
    prenom: '',
    nom: '',
    email: '',
    telephone: '',
    adresse: '',
    codePostal: '',
    ville: '',
    pays: 'France',
    // Entreprise uniquement
    raisonSociale: '',
    siret: '',
    tva: '',
    rcs: '',
    dirigeant: '',
  }
}

/**
 * Construit le "nom d'affichage" d'un exposant selon son type.
 * - Particulier : "Prénom Nom"
 * - Entreprise  : raison sociale
 * Fallback : champ nom historique de l'exposant.
 */
export function expoDisplayName(expo) {
  if (!expo) return '—'
  const id = expo.identite || {}
  if (expo.typeExposant === 'entreprise' && id.raisonSociale) {
    return id.raisonSociale
  }
  if (expo.typeExposant === 'particulier') {
    const full = [id.prenom, id.nom].filter(Boolean).join(' ').trim()
    if (full) return full
  }
  return expo.nom || '—'
}

/**
 * Génère une nouvelle ligne de frais vide (pour l'édition d'exposant).
 * @returns {{ id, description, qty, prixUnit, total }}
 */
export function newLigne(description = '', qty = 1, prixUnit = 0) {
  const q = Number(qty) || 1
  const p = Math.round(Number(prixUnit) || 0)
  return {
    id: 'lig-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    description: description || '',
    qty: q,
    prixUnit: p,
    total: q * p,
  }
}

/**
 * Calcule le total BRUT d'une ligne (qty * prixUnit), en centimes.
 * Ne tient PAS compte de la réduction éventuelle. Utiliser ligneTotal()
 * pour le total net après réduction ligne.
 */
export function ligneTotalBrut(ligne) {
  if (!ligne) return 0
  return (Number(ligne.qty) || 0) * (Number(ligne.prixUnit) || 0)
}

/**
 * Calcule le montant de la réduction d'une ligne, en centimes.
 * Une réduction peut être en pourcentage ('percent') ou en montant fixe ('amount').
 * Retourne 0 si pas de réduction ou réduction invalide.
 *
 *   { type: 'percent', value: 10 }    → 10% du total brut
 *   { type: 'amount',  value: 500 }   → 500 centimes (5,00 €)
 *
 * Note : value est stockée comme suit selon le type :
 *   - 'percent' : nombre 0-100 (ex: 10 pour 10%)
 *   - 'amount'  : entier en CENTIMES (ex: 500 pour 5,00 €)
 */
export function ligneReductionMontant(ligne) {
  const r = ligne?.reduction
  if (!r || !r.type) return 0
  const v = Number(r.value) || 0
  if (v <= 0) return 0
  if (r.type === 'percent') {
    const brut = ligneTotalBrut(ligne)
    return Math.round((brut * Math.min(100, v)) / 100)
  }
  if (r.type === 'amount') {
    // Ne peut pas dépasser le brut (sinon total négatif)
    return Math.min(v, ligneTotalBrut(ligne))
  }
  return 0
}

/**
 * Calcule le total NET d'une ligne (qty * prixUnit - réduction ligne), en centimes.
 * C'est ce qui s'affiche dans la colonne "Total" du tableau de facture.
 */
export function ligneTotal(ligne) {
  return ligneTotalBrut(ligne) - ligneReductionMontant(ligne)
}

/**
 * Calcule le sous-total (somme des totaux nets de lignes), en centimes.
 * Renommé conceptuellement en "sousTotalHT" car c'est ce qui sert de base
 * aux réductions globales suivantes.
 */
export function lignesTotal(lignes) {
  if (!Array.isArray(lignes)) return 0
  return lignes.reduce((a, l) => a + ligneTotal(l), 0)
}

/**
 * Calcule le montant total des réductions globales d'un exposant.
 * Une réduction globale s'applique sur le sous-total (somme des lignes
 * après réductions ligne). Jusqu'à 2 réductions cumulables.
 *
 *   - 1ère réduction : appliquée sur le sous-total
 *   - 2ème réduction : appliquée sur le résultat (sous-total - 1ère)
 *
 * Cet ordre est important pour les pourcentages : -10% puis -5% ≠ -15%.
 * Retourne le montant total déduit, en centimes.
 */
export function reductionsGlobalesMontant(sousTotal, reductionsGlobales) {
  if (!Array.isArray(reductionsGlobales) || reductionsGlobales.length === 0) return 0
  let base = sousTotal
  let totalDeduit = 0
  for (const r of reductionsGlobales) {
    if (!r || !r.type) continue
    const v = Number(r.value) || 0
    if (v <= 0) continue
    let deduction = 0
    if (r.type === 'percent') {
      deduction = Math.round((base * Math.min(100, v)) / 100)
    } else if (r.type === 'amount') {
      deduction = Math.min(v, base) // ne dépasse pas la base courante
    }
    totalDeduit += deduction
    base -= deduction
    if (base <= 0) break // plus rien à déduire
  }
  return totalDeduit
}

/**
 * Calcule le montant total net final d'un exposant après toutes réductions
 * (réductions ligne + réductions globales). C'est ce qui doit être enregistré
 * comme `montantTotal` en base et utilisé pour les paiements.
 */
export function computeMontantTotalNet(expo) {
  const lignes = getExpoLignes(expo)
  const sousTotal = lignesTotal(lignes)
  const deduit = reductionsGlobalesMontant(sousTotal, expo?.reductionsGlobales || [])
  return Math.max(0, sousTotal - deduit)
}

/**
 * Formate une réduction en libellé court pour affichage (ex: "-10%" ou "-5,00 €").
 */
export function formatReductionLabel(r) {
  if (!r || !r.type) return ''
  const v = Number(r.value) || 0
  if (r.type === 'percent') return `-${v}%`
  if (r.type === 'amount')  return `-${(v / 100).toFixed(2)} €`
  return ''
}

/**
 * Rétrocompatibilité : retourne les lignes d'un exposant, ou une ligne
 * unique synthétique pour les anciens exposants qui n'avaient qu'un
 * montantTotal et une thématique.
 */
export function getExpoLignes(expo) {
  if (Array.isArray(expo?.lignes) && expo.lignes.length > 0) {
    return expo.lignes
  }
  // Rétrocompat : un exposant historique = 1 ligne déduite du montantTotal + thématique
  if (expo?.montantTotal > 0) {
    return [{
      id: 'legacy',
      description: expo.thematiqueLabel || 'Frais d\'exposition',
      qty: 1,
      prixUnit: expo.montantTotal,
      total: expo.montantTotal,
    }]
  }
  return []
}

// ─── TVA (Lot C3) ────────────────────────────────────────────────────
// La TVA est activée par événement (toggle dans settings). Si désactivée,
// les calculs TVA sont skippés et la mention "TVA non applicable, art. 293 B
// du CGI" doit apparaître sur la facture.
//
// Quand activée :
//   - Un taux par défaut est configuré dans settings (ex: 20)
//   - Chaque ligne peut override ce taux (champ `tauxTva`)
//   - Les montants stockés en base (prixUnit, total) restent en HT
//   - La TVA est calculée AU RENDU PDF (pas persistée)

/**
 * Lit la config TVA depuis les settings d'un événement.
 * Retourne un objet { active, defaultTaux } avec fallback safe.
 *
 *   { tvaActive: false }       → { active: false, defaultTaux: 0 }
 *   { tvaActive: true,
 *     tvaDefaultTaux: 20 }     → { active: true,  defaultTaux: 20 }
 */
export function getTvaConfig(settings) {
  return {
    active: !!settings?.tvaActive,
    defaultTaux: Number(settings?.tvaDefaultTaux) || 0,
  }
}

/**
 * Retourne le taux de TVA effectif d'une ligne, en pourcentage.
 *   - Si la ligne a un `tauxTva` explicite (number, ≥ 0) → utilisé
 *   - Sinon → defaultTaux des settings
 *   - Si TVA désactivée globalement → 0
 */
export function ligneTauxTva(ligne, tvaConfig) {
  if (!tvaConfig?.active) return 0
  if (ligne && Number.isFinite(Number(ligne.tauxTva))) {
    return Math.max(0, Number(ligne.tauxTva))
  }
  return tvaConfig.defaultTaux || 0
}

/**
 * Calcule le montant de TVA d'une ligne, en centimes.
 * La base est le total NET de la ligne (= après réduction éventuelle).
 *
 * Note : on travaille en centimes pour éviter les arrondis flottants.
 * Le résultat est arrondi à l'entier le plus proche.
 */
export function ligneTva(ligne, tvaConfig) {
  const taux = ligneTauxTva(ligne, tvaConfig)
  if (taux <= 0) return 0
  return Math.round((ligneTotal(ligne) * taux) / 100)
}

/**
 * Calcule la ventilation de TVA pour un ensemble de lignes.
 * Retourne un objet {[taux]: { baseHT, montantTva }} où chaque clé est un taux
 * (sous forme de string pour préserver la précision : "20", "5.5", "10").
 *
 * Utilisé pour la mention "TVA détaillée par taux" obligatoire en bas de facture.
 */
export function ventilationTva(lignes, tvaConfig) {
  if (!tvaConfig?.active) return {}
  const repartition = {}
  for (const l of lignes || []) {
    const taux = ligneTauxTva(l, tvaConfig)
    if (taux <= 0) continue
    const baseHT = ligneTotal(l)  // total NET de la ligne (= déjà avec réduction ligne)
    const tva = Math.round((baseHT * taux) / 100)
    const k = String(taux)
    if (!repartition[k]) repartition[k] = { baseHT: 0, montantTva: 0 }
    repartition[k].baseHT += baseHT
    repartition[k].montantTva += tva
  }
  return repartition
}

/**
 * Calcule les totaux HT/TVA/TTC d'un exposant en tenant compte de la TVA.
 * Tient compte aussi des réductions globales (qui s'appliquent SUR LE HT,
 * puis la TVA est recalculée sur le HT après réductions).
 *
 * Retourne un objet :
 *   {
 *     sousTotalHT,        // somme des lignes nettes (avec réductions ligne)
 *     reductionsHT,       // montant des réductions globales (sur le HT)
 *     totalHT,            // sousTotalHT − reductionsHT
 *     totalTva,           // TVA calculée sur le totalHT (proportionnée par taux)
 *     totalTTC,           // totalHT + totalTva
 *     ventilation,        // { taux: { baseHT, montantTva } } ajustée des réductions
 *   }
 *
 * IMPORTANT : pour les réductions globales appliquées sur du multi-taux, on
 * répartit proportionnellement la réduction sur chaque ligne, ce qui donne
 * la ventilation TVA correcte.
 */
export function computeTvaTotaux(expo, tvaConfig) {
  const lignes = getExpoLignes(expo)
  const sousTotalHT = lignesTotal(lignes)
  const reductionsHT = reductionsGlobalesMontant(sousTotalHT, expo?.reductionsGlobales || [])
  const totalHT = Math.max(0, sousTotalHT - reductionsHT)

  if (!tvaConfig?.active) {
    return {
      sousTotalHT, reductionsHT, totalHT,
      totalTva: 0,
      totalTTC: totalHT,
      ventilation: {},
    }
  }

  // Ventilation initiale (avant réductions globales)
  const ventilationBrute = ventilationTva(lignes, tvaConfig)
  // Si pas de réductions globales, c'est directement bon
  if (reductionsHT === 0 || Object.keys(ventilationBrute).length === 0) {
    let totalTva = 0
    for (const k of Object.keys(ventilationBrute)) totalTva += ventilationBrute[k].montantTva
    return {
      sousTotalHT, reductionsHT, totalHT,
      totalTva,
      totalTTC: totalHT + totalTva,
      ventilation: ventilationBrute,
    }
  }

  // Sinon : répartir la réduction proportionnellement à chaque tranche de taux
  const ratio = sousTotalHT > 0 ? (totalHT / sousTotalHT) : 0
  const ventilation = {}
  let totalTva = 0
  for (const k of Object.keys(ventilationBrute)) {
    const ajustHT = Math.round(ventilationBrute[k].baseHT * ratio)
    const taux = Number(k)
    const ajustTva = Math.round((ajustHT * taux) / 100)
    ventilation[k] = { baseHT: ajustHT, montantTva: ajustTva }
    totalTva += ajustTva
  }
  return {
    sousTotalHT, reductionsHT, totalHT,
    totalTva,
    totalTTC: totalHT + totalTva,
    ventilation,
  }
}
