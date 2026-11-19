/**
 * utils/remboursementPlan.js — aperçu, dans l'espace spectateur, de la répartition du remboursement
 * de son solde (20/11/2026). Même calcul que le serveur (api/_paiement/remboursement.js), qui seul
 * fait foi au moment de la demande ; un test vérifie que les deux donnent le même résultat.
 */
const moyen = (t) => String(t.moyen || '').toLowerCase()
const estStripe = (t) => t.type === 'credit' && moyen(t) === 'en-ligne' && !!t.stripePaiement
const estSumup = (t) => t.type === 'credit' && (moyen(t) === 'cb' || moyen(t).startsWith('carte'))
const ms = (t) => (t.createdAt && t.createdAt.toMillis ? t.createdAt.toMillis() : Date.parse(t.timestamp || '') || 0)

export function planRemboursement({ solde, txs = [] }) {
  let reste = Math.max(0, Math.round(Number(solde) || 0))
  const total = reste
  const rendu = new Map()
  txs.filter(t => t.type === 'remboursement' && t.stripePaiement)
    .forEach(t => rendu.set(t.stripePaiement, (rendu.get(t.stripePaiement) || 0) + (Number(t.montant) || 0)))
  const stripe = []
  for (const t of txs.filter(estStripe).sort((a, b) => ms(b) - ms(a))) {
    if (reste <= 0) break
    const dispo = (Number(t.montant) || 0) - (rendu.get(t.stripePaiement) || 0)
    if (dispo <= 0) continue
    const m = Math.min(dispo, reste)
    stripe.push({ paiement: t.stripePaiement, montant: m })
    rendu.set(t.stripePaiement, (rendu.get(t.stripePaiement) || 0) + m)
    reste -= m
  }
  const stripeTotal = total - reste
  const sumupRecu = txs.filter(estSumup).reduce((a, t) => a + (Number(t.montant) || 0), 0)
  const sumupRendu = txs.filter(t => t.type === 'remboursement' && t.surPlace === true && moyen(t) === 'cb')
    .reduce((a, t) => a + (Number(t.montant) || 0), 0)
  const sumup = Math.min(reste, Math.max(0, sumupRecu - sumupRendu))
  reste -= sumup
  const sumupRecharges = []
  let aCouvrir = sumup
  for (const t of txs.filter(estSumup).sort((a, b) => ms(b) - ms(a))) {
    if (aCouvrir <= 0) break
    sumupRecharges.push({ montant: Number(t.montant) || 0, date: t.date || '', heure: t.heure || '', staff: t.staff || '' })
    aCouvrir -= Number(t.montant) || 0
  }
  return { stripe, stripeTotal, sumup, sumupRecharges, especes: reste, total }
}
