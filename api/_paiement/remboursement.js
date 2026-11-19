/**
 * api/_paiement/remboursement.js — répartition du remboursement d'un solde (fonctions pures)
 *
 * Choix de l'organisateur (20/11/2026) : le spectateur demande le remboursement de son solde
 * depuis son espace (bouton maintenu 3 s). Le solde est rendu par le chemin d'origine :
 *   1. recharges en ligne (Stripe) : remboursées tout de suite sur la carte, paiement par paiement,
 *      les plus récentes d'abord, sans dépasser ce qui reste de chaque paiement ;
 *   2. recharges par carte à la billetterie (SumUp) : la billetterie rembourse dans l'appli SumUp ;
 *   3. le reste en espèces, à la billetterie.
 * Aucun frais n'est retenu au spectateur.
 */
const moyen = (t) => String(t.moyen || '').toLowerCase()
const estStripe = (t) => t.type === 'credit' && moyen(t) === 'en-ligne' && !!t.stripePaiement
const estSumup = (t) => t.type === 'credit' && (moyen(t) === 'cb' || moyen(t).startsWith('carte'))
const ms = (t) => (t.createdAt && t.createdAt.toMillis ? t.createdAt.toMillis() : Date.parse(t.timestamp || '') || 0)

/**
 * solde : centimes ; txs : transactions du spectateur.
 * @returns {{ stripe: [{ paiement, montant }], stripeTotal, sumup, sumupRecharges, especes, total }}
 */
function planRemboursement({ solde, txs = [] }) {
  let reste = Math.max(0, Math.round(Number(solde) || 0))
  const total = reste

  // Déjà rendu par paiement Stripe (remboursements précédents)
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

  // Carte à la billetterie : recharges SumUp moins ce qui a déjà été rendu sur carte
  const sumupRecu = txs.filter(estSumup).reduce((a, t) => a + (Number(t.montant) || 0), 0)
  const sumupRendu = txs.filter(t => t.type === 'remboursement' && t.surPlace === true && moyen(t) === 'cb')
    .reduce((a, t) => a + (Number(t.montant) || 0), 0)
  const sumup = Math.min(reste, Math.max(0, sumupRecu - sumupRendu))
  reste -= sumup
  // Recharges SumUp à montrer à la billetterie pour retrouver la transaction (les plus récentes)
  const sumupRecharges = []
  let aCouvrir = sumup
  for (const t of txs.filter(estSumup).sort((a, b) => ms(b) - ms(a))) {
    if (aCouvrir <= 0) break
    sumupRecharges.push({ montant: Number(t.montant) || 0, date: t.date || '', heure: t.heure || '', staff: t.staff || '' })
    aCouvrir -= Number(t.montant) || 0
  }
  return { stripe, stripeTotal, sumup, sumupRecharges, especes: reste, total }
}

module.exports = { planRemboursement, estStripe, estSumup }
