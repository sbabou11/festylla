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
      throw new Error(`Droits insuffisants pour ${LABEL[type]} aujourd'hui : il en reste ${reste[type]}, la commande en demande ${qty}.`)
    }
  }
  const em = isEmFiche(benev)
  const champs = Object.fromEntries(Object.entries(parType).map(([t, q]) => [em ? `consoJours.${jour}.${t}` : `consommation.${t}`, q]))
  const valeur = items.reduce((s, i) => s + i.total, 0)
  return { items, parType, valeur, champs }
}

/** Le stand coché « Stand des bénévoles » dans settings/carte */
const standBenevoles = (carte) => ((carte && carte.stands) || []).find(s => s.benevoles === true) || null

module.exports = { TYPES, isEmFiche, quotasDuJour, restants, preparerCommande, standBenevoles }
