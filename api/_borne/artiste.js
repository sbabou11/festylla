/**
 * api/_borne/artiste.js — commande d'un artiste à la borne (fonctions pures)
 *
 * Choix de l'organisateur (20/11/2026) : même parcours que les bénévoles. L'artiste commande depuis
 * son espace (code à 6 chiffres) ou à la borne en présentant son QR ; ses avantages sont décomptés
 * à l'impression. Contrairement aux bénévoles, chaque article sort au stand de cet article
 * (un ticket par stand, comme pour les spectateurs).
 *
 * Deux sortes de fiche (comme src/em/artiste.js et l'espace artiste) :
 *   - créneau du planning : avantages { drinks, meals, eaux, drinkIds, mealIds, eauIds } pour le créneau ;
 *   - fiche Event Manager (events/{ev}/artistes) : avantagesJours[jour] { repas, boisson, eau } et
 *     articles offerts (settings/artistes.articles) répartis selon le type de consommation.
 * Les consommations sont des documents artist-consumptions (un par article servi), comme au stand.
 */
const TYPES = ['meal', 'drink', 'eau']
const DE_CONSO = { repas: 'meal', boisson: 'drink', eau: 'eau' }
const LABEL = { meal: 'repas', drink: 'boisson', eau: 'eau' }

/**
 * Avantages et articles éligibles d'un artiste pour la journée.
 * fiche : { creneau } (planning) ou { em } (Event Manager) ; offerts : ids ; menuById : Map.
 * @returns {{ total: {meal,drink,eau}, typeDe: Map<articleId, type> }}
 */
function avantagesDe({ creneau = null, em = null, jour, offerts = [], menuById = new Map() }) {
  const typeDe = new Map()
  if (em) {
    const d = (em.avantagesJours || {})[jour] || {}
    offerts.forEach(id => { const t = DE_CONSO[(menuById.get(id) || {}).typeConsommation]; if (t) typeDe.set(id, t) })
    return { total: { meal: Number(d.repas) || 0, drink: Number(d.boisson) || 0, eau: Number(d.eau) || 0 }, typeDe }
  }
  const av = (creneau && creneau.avantages) || {}
  ;(av.mealIds || []).forEach(id => typeDe.set(id, 'meal'))
  ;(av.drinkIds || []).forEach(id => typeDe.set(id, 'drink'))
  ;(av.eauIds || []).forEach(id => typeDe.set(id, 'eau'))
  return { total: { meal: Number(av.meals) || 0, drink: Number(av.drinks) || 0, eau: Number(av.eaux) || 0 }, typeDe }
}

/** Déjà pris, par type : consommations servies + anciennes réservations encore en attente */
function dejaPris({ consos = [], resasEnAttente = [] }) {
  const n = { meal: 0, drink: 0, eau: 0 }
  consos.forEach(c => { if (n[c.type] !== undefined) n[c.type] += 1 })
  resasEnAttente.forEach(r => (r.items || []).forEach(i => { const t = i.type || i._type; if (n[t] !== undefined) n[t] += 1 }))
  return n
}

function restantsArtiste(total, pris) {
  return Object.fromEntries(TYPES.map(t => [t, Math.max(0, (Number(total[t]) || 0) - (Number(pris[t]) || 0))]))
}

/**
 * Vérifie et prépare la commande. lignes : [{ id, qty }] ; standById : Map id → stand.
 * @returns {{ items, parType }} — items avec stand de retrait
 * @throws Error avec un message pour la borne
 */
function preparerCommandeArtiste({ lignes, menuById, typeDe, restants, standById }) {
  if (!Array.isArray(lignes) || lignes.length === 0) throw new Error('Aucun article dans la commande.')
  const parType = {}
  const items = []
  for (const l of lignes) {
    const qty = Math.round(Number(l.qty) || 0)
    if (qty < 1 || qty > 20) throw new Error('Quantité invalide.')
    const id = String(l.id)
    const m = menuById.get(id)
    if (!m || m.actif === false) throw new Error(`Un article n'est plus à la carte.`)
    const type = typeDe.get(id)
    if (!type) throw new Error(`« ${m.nom} » ne fait pas partie de vos avantages.`)
    if ((Number(m.stock) || 0) < qty) throw new Error(`Plus assez de « ${m.nom} » (${Number(m.stock) || 0} restant${(Number(m.stock) || 0) > 1 ? 's' : ''}).`)
    const stand = m.standId ? standById.get(m.standId) : null
    if (!stand) throw new Error(`« ${m.nom} » n'a pas de stand de retrait. Demandez à l'organisation.`)
    parType[type] = (parType[type] || 0) + qty
    items.push({
      id, nom: String(m.nom || ''), qty, prix: Number(m.prix) || 0, prixUnit: Number(m.prix) || 0, type,
      standId: stand.id, standNumero: Number(stand.numero) || 0,
    })
  }
  for (const [type, qty] of Object.entries(parType)) {
    if (qty > (restants[type] || 0)) {
      throw new Error(`Avantages insuffisants pour ${LABEL[type]} : il en reste ${restants[type] || 0}, la commande en demande ${qty}.`)
    }
  }
  return { items, parType }
}

module.exports = { TYPES, DE_CONSO, avantagesDe, dejaPris, restantsArtiste, preparerCommandeArtiste }
