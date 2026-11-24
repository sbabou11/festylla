/**
 * api/_borne/benevole.js — commande d'un bénévole à la borne (fonctions pures)
 *
 * Choix de l'organisateur (19/11/2026) : le bénévole commande depuis son espace (code à 6 chiffres)
 * ou à la borne en présentant son QR. Seuls les articles marqués « Consommation bénévole »
 * (repas, boisson, eau) sont proposés. Les droits sont décomptés à l'impression du ticket,
 * sur la journée de festival du jour (coupure à 6 h). Toute la commande sort en un seul ticket
 * pour le stand coché « Stand des bénévoles ».
 */
const TYPES = ['repas', 'boisson', 'eau']

/** Fiche venue d'Event Manager : droits et consommations par jour */
const isEmFiche = (f) => !!f && f.source === 'event-manager'

/** { droits, conso } d'un bénévole pour une journée (même règle que src/em/jour.js) */
function quotasDuJour(benev, jour) {
  if (!benev) return { droits: {}, conso: {} }
  if (!isEmFiche(benev)) return { droits: benev.droits || {}, conso: benev.consommation || {} }
  return { droits: (benev.droitsJours || {})[jour] || {}, conso: (benev.consoJours || {})[jour] || {} }
}

/** Droits restants du jour, par type */
function restants(benev, jour) {
  const q = quotasDuJour(benev, jour)
  return Object.fromEntries(TYPES.map(t => [t, Math.max(0, (Number(q.droits[t]) || 0) - (Number(q.conso[t]) || 0))]))
}

const LABEL = { repas: 'repas', boisson: 'boisson', eau: 'eau' }

/**
 * Vérifie et prépare la commande. lignes : [{ id, qty }] ; menuById : Map id → article ;
 * standBenev : stand coché « bénévoles » (ou null).
 * @returns {{ items, parType, valeur, champs }} — champs : chemins de consommation à augmenter
 * @throws Error avec un message pour la borne
 */
function preparerCommande({ benev, jour, lignes, menuById, standBenev }) {
  if (!benev) throw new Error('Fiche bénévole introuvable.')
  if (!Array.isArray(lignes) || lignes.length === 0) throw new Error('Aucun article dans la commande.')
  const parType = {}
  const items = []
  for (const l of lignes) {
    const qty = Math.round(Number(l.qty) || 0)
    if (qty < 1 || qty > 20) throw new Error('Quantité invalide.')
    const m = menuById.get(String(l.id))
    if (!m || m.actif === false) throw new Error(`Un article n'est plus à la carte.`)
    const type = m.typeConsommation
    if (!TYPES.includes(type)) throw new Error(`« ${m.nom} » n'est pas proposé aux bénévoles.`)
    if ((Number(m.stock) || 0) < qty) throw new Error(`Plus assez de « ${m.nom} » (${Number(m.stock) || 0} restant${(Number(m.stock) || 0) > 1 ? 's' : ''}).`)
    parType[type] = (parType[type] || 0) + qty
    items.push({
      id: String(l.id), nom: String(m.nom || ''), qty, prix: Number(m.prix) || 0, prixUnit: Number(m.prix) || 0,
      total: qty * (Number(m.prix) || 0), typeConsommation: type,
      ...(standBenev ? { standId: standBenev.id, standNumero: Number(standBenev.numero) || 0 } : {}),
    })
  }
  const reste = restants(benev, jour)
  for (const [type, qty] of Object.entries(parType)) {
    if (qty > reste[type]) {
      throw new Error(`Droits insuffisants pour ${LABEL[type]}${isEmFiche(benev) ? ' aujourd\'hui' : ''} : il en reste ${reste[type]}, la commande en demande ${qty}.`)
    }
  }
  const em = isEmFiche(benev)
  const champs = Object.fromEntries(Object.entries(parType).map(([t, q]) => [em ? `consoJours.${jour}.${t}` : `consommation.${t}`, q]))
  const valeur = items.reduce((s, i) => s + i.total, 0)
  return { items, parType, valeur, champs }
}

/** Le stand coché « Stand des bénévoles » dans settings/carte */
const standBenevoles = (carte) => ((carte && carte.stands) || []).find(s => s.benevoles === true) || null

/**
 * Écran 13 (24/11/2026, choix de l'organisateur) : le bénévole commande toute la carte, comme un
 * spectateur. Ses avantages du jour couvrent d'abord les articles les plus chers de leur type (repas,
 * boisson, eau) ; tout le reste se paie sur son solde (porte-monnaie).
 * Les articles offerts partent au stand des bénévoles, les articles payés à leur propre stand.
 * lignes : [{ id, qty }] ; menuById : Map ; stands : stands de settings/carte ; standBenev : stand « bénévoles »
 * @returns {{ items, offerts, payes, parType, valeurOfferte, totalPaye, champs }}
 */
function repartirCommande({ benev, jour, lignes, menuById, stands = [], standBenev }) {
  if (!benev) throw new Error('Fiche bénévole introuvable.')
  if (!Array.isArray(lignes) || lignes.length === 0) throw new Error('Aucun article dans la commande.')
  const standById = new Map((stands || []).map(s => [s.id, s]))
  const unites = []
  const qtyParArticle = new Map()
  for (const l of lignes) {
    const qty = Math.round(Number(l.qty) || 0)
    if (qty < 1 || qty > 20) throw new Error('Quantité invalide.')
    const id = String(l.id)
    qtyParArticle.set(id, (qtyParArticle.get(id) || 0) + qty)
  }
  for (const [id, qty] of qtyParArticle) {
    const m = menuById.get(id)
    if (!m || m.actif === false) throw new Error(`Un article n'est plus à la carte.`)
    if ((Number(m.stock) || 0) < qty) throw new Error(`Plus assez de « ${m.nom} » (${Number(m.stock) || 0} restant${(Number(m.stock) || 0) > 1 ? 's' : ''}).`)
    const type = TYPES.includes(m.typeConsommation) ? m.typeConsommation : ''
    for (let i = 0; i < qty; i++) unites.push({ id, m, type, prix: Number(m.prix) || 0 })
  }
  // Les plus chers d'abord : le bénévole paie le moins possible
  unites.sort((a, b) => b.prix - a.prix)
  const reste = restants(benev, jour)
  const parType = {}
  const offertes = new Map(), payees = new Map()
  for (const u of unites) {
    const cible = u.type && reste[u.type] > 0 ? offertes : payees
    if (cible === offertes) { reste[u.type]--; parType[u.type] = (parType[u.type] || 0) + 1 }
    cible.set(u.id, (cible.get(u.id) || 0) + 1)
  }
  const ligne = (id, qty, offert) => {
    const m = menuById.get(id)
    const prix = Number(m.prix) || 0
    const st = offert ? standBenev : (standById.get(m.standId) || null)
    return {
      id, nom: String(m.nom || ''), qty, prix, prixUnit: prix, total: offert ? 0 : qty * prix, offert,
      typeConsommation: TYPES.includes(m.typeConsommation) ? m.typeConsommation : '',
      ...(st ? { standId: st.id, standNumero: Number(st.numero) || 0 } : {}),
    }
  }
  const offerts = [...offertes].map(([id, q]) => ligne(id, q, true))
  const payes = [...payees].map(([id, q]) => ligne(id, q, false))
  const em = isEmFiche(benev)
  const champs = Object.fromEntries(Object.entries(parType).map(([t, q]) => [em ? `consoJours.${jour}.${t}` : `consommation.${t}`, q]))
  return {
    items: [...offerts, ...payes], offerts, payes, parType, champs,
    valeurOfferte: offerts.reduce((s, i) => s + i.qty * i.prix, 0),
    totalPaye: payes.reduce((s, i) => s + i.total, 0),
  }
}

module.exports = { TYPES, isEmFiche, quotasDuJour, restants, preparerCommande, standBenevoles, repartirCommande }
