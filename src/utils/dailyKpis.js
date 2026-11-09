/**
 * utils/dailyKpis.js — KPIs du jour pour les widgets dashboard.
 *
 * Centralise la logique « depuis 00:00 aujourd'hui » utilisée par les widgets
 * du dashboard composable. Évite la duplication entre Accueil et widgets.
 *
 * Tous les montants sont en EUROS (pas en centimes — conversion faite ici).
 */

// Extrait le timestamp (en ms) d'une transaction quel que soit son format.
// Firestore Timestamp, seconds, Date, string, number — tout est géré.
export const getTs = (item) => {
  const t = item.createdAt || item.timestamp || item.date
  if (!t) return 0
  if (t.toDate)              return t.toDate().getTime()
  if (t.seconds)             return t.seconds * 1000
  if (t instanceof Date)     return t.getTime()
  if (typeof t === 'string') return new Date(t).getTime()
  if (typeof t === 'number') return t
  return 0
}

// Format euro court : "1 234 €" (sans décimales, séparateur français)
export const fmtEShort = (n) =>
  `${(Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`

// Format euro précis : "1 234,50 €"
export const fmtEuroPrecis = (n) =>
  `${(Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

// KPIs filtrés sur la journée en cours (depuis 00:00 local).
// Montants en euros (division par 100 incluse — Firestore stocke en centimes).
export function computeDailyKpis({ logs = [], reservations = [], spectateurs = [] }) {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const startTs = startOfDay.getTime()

  const logsJour = (logs || []).filter(t => getTs(t) >= startTs)

  // Recettes du jour = tout sauf ajustements/dépenses
  const recettesJour = logsJour
    .filter(t => ['credit', 'debit', 'retrait', 'reservation'].includes(t.type))
    .reduce((s, t) => s + ((t.montant || 0) / 100), 0)

  // Crédits du jour (rechargements)
  const creditsJour = logsJour
    .filter(t => t.type === 'credit')
    .reduce((s, t) => s + ((t.montant || 0) / 100), 0)
  const creditsCount = logsJour.filter(t => t.type === 'credit').length

  // Ventes du jour (débits + retraits)
  const ventesJour = logsJour
    .filter(t => ['debit', 'retrait', 'benev-retrait'].includes(t.type))
    .reduce((s, t) => s + ((t.montant || 0) / 100), 0)
  const ventesCount = logsJour.filter(t => ['debit', 'retrait', 'benev-retrait'].includes(t.type)).length

  // Dépenses du jour (si vous tracez des dépenses via t.type === 'depense' ou similaire)
  const depensesJour = logsJour
    .filter(t => t.type === 'depense' || t.type === 'expense')
    .reduce((s, t) => s + ((t.montant || 0) / 100), 0)

  const txCount = logsJour.length

  // Réservations
  const resasEnAttente = (reservations || []).filter(r =>
    (r.status === 'pending' || r.status === 'processing') && !r.isBenev
  ).length
  const resasPretes    = (reservations || []).filter(r => r.status === 'ready' && !r.isBenev).length

  // Spectateurs : on compte tout (pas filtré par jour, c'est cumulatif)
  const nbSpec     = (spectateurs || []).length
  const nbSpecActifs = (spectateurs || []).filter(s => (s.solde || 0) > 0).length
  const soldesTotal = (spectateurs || []).reduce((s, sp) => s + (Number(sp.solde) || 0), 0) / 100

  // Panier moyen sur les ventes du jour
  const panierMoyen = ventesCount > 0 ? ventesJour / ventesCount : 0

  return {
    recettesJour, creditsJour, creditsCount,
    ventesJour, ventesCount,
    depensesJour,
    txCount,
    resasEnAttente, resasPretes,
    nbSpec, nbSpecActifs, soldesTotal,
    panierMoyen,
  }
}
