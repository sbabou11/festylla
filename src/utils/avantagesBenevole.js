/**
 * utils/avantagesBenevole.js — panier d'un bénévole : avantages offerts et part payée (écran 13, 24/11/2026)
 *
 * Même règle que le serveur (api/_borne/benevole.js, repartirCommande), pour l'affichage : les
 * avantages du jour couvrent d'abord les articles les plus chers de leur type (repas, boisson, eau) ;
 * tout le reste se paie sur le solde. À la borne, c'est le serveur qui décide et débite.
 */
export const TYPES_AVANTAGE = ['repas', 'boisson', 'eau']

const qtyDe = (t) => (t.items || []).reduce((a, i) => a + (Number(i.qty) || 1), 0) || 1

/**
 * Rapports (écran 13) : consommations offertes et achats sur le solde comptés à part, et soldes des
 * bénévoles (rechargés à la billetterie, en ligne, dépensés, restant).
 * logs : transactions ; spectateurs : comptes (les porte-monnaie portent porteMonnaieBenevole)
 */
export function bilanBenevoles(logs = [], spectateurs = []) {
  const pms = spectateurs.filter(s => s && s.porteMonnaieBenevole)
  const ids = new Set(pms.map(s => s.id))
  const out = {
    offertes: { n: 0, valeur: 0 }, achetees: { n: 0, montant: 0 },
    recharges: { billetterie: 0, enLigne: 0 }, depense: 0, restant: pms.reduce((a, s) => a + (Number(s.solde) || 0), 0), comptes: pms.length,
  }
  for (const t of logs) {
    if (t.type === 'benev-retrait') { out.offertes.n += qtyDe(t); out.offertes.valeur += Number(t.montant) || 0; continue }
    if (!ids.has(t.specId)) continue
    if (t.type === 'debit') { out.achetees.n += qtyDe(t); out.achetees.montant += Number(t.montant) || 0; out.depense += Number(t.montant) || 0 }
    else if (t.type === 'credit') {
      if (t.moyen === 'en-ligne') out.recharges.enLigne += Number(t.montant) || 0
      else out.recharges.billetterie += Number(t.montant) || 0
    }
  }
  return out
}

/**
 * cart : [{ id, nom, qty, prix, typeConsommation }] ; restants : { repas, boisson, eau }
 * @returns {{ lignes: [{ nom, prix, offert }], offertsPar: {id: n}, valeurOfferte, totalPaye, total, reste }}
 */
export function repartirPanier(cart = [], restants = {}) {
  const reste = Object.fromEntries(TYPES_AVANTAGE.map(t => [t, Math.max(0, Number(restants[t]) || 0)]))
  const unites = []
  for (const i of cart) {
    const type = TYPES_AVANTAGE.includes(i.typeConsommation) ? i.typeConsommation : ''
    for (let k = 0; k < (Number(i.qty) || 0); k++) unites.push({ id: i.id, nom: i.nom, prix: Number(i.prix) || 0, type })
  }
  unites.sort((a, b) => b.prix - a.prix)
  const lignes = []
  const offertsPar = {}
  let valeurOfferte = 0, totalPaye = 0
  for (const u of unites) {
    if (u.type && reste[u.type] > 0) {
      reste[u.type]--; valeurOfferte += u.prix; offertsPar[u.id] = (offertsPar[u.id] || 0) + 1
      lignes.push({ nom: u.nom, prix: u.prix, offert: true })
    } else {
      totalPaye += u.prix
      lignes.push({ nom: u.nom, prix: u.prix, offert: false })
    }
  }
  return { lignes, offertsPar, valeurOfferte, totalPaye, total: valeurOfferte + totalPaye, reste }
}
