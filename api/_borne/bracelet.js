/**
 * api/_borne/bracelet.js — paiement à la borne avec un bracelet limité (28/11/2026)
 *
 * Bracelet « mineur » ou plafonné (voir api/_qr/bracelet.js) : le serveur seul débite le solde,
 * après avoir vérifié, dans la même transaction :
 *  - aucun article « Contient de l'alcool » (menu.alcool) pour un mineur ;
 *  - 10 € au plus par achat pour un bracelet sans code ;
 *  - le plafond du jour : ce que ce bracelet a déjà payé aujourd'hui (transactions bracelet == numéro).
 * Fonctions sans base de données, testées.
 */
const { ACHAT_SANS_CODE_MAX } = require('../_qr/bracelet')

const euros = (c) => ((Number(c) || 0) / 100).toFixed(2).replace('.', ',') + ' €'

/** Bracelet limité ? → limites en centimes, sinon null (bracelet d'adulte sans plafond : parcours habituel) */
function limitesBracelet(b) {
  if (!b || !(b.mineur || b.plafondJour)) return null
  return {
    numero: b.numero,
    prenom: b.prenom || '',
    mineur: !!b.mineur,
    plafondJour: b.plafondJour ? Math.round(b.plafondJour * 100) : null,
    achatMax: b.codeHash ? null : ACHAT_SANS_CODE_MAX * 100,
    avecCode: !!b.codeHash,
  }
}

/** Ce que ce bracelet a payé le jour donné (centimes) ; jourDe(ms|iso) → 'AAAA-MM-JJ' */
function depenseDuJour(transactions, jour, jourDe) {
  return transactions
    // horsPlafond : commande passée par le titulaire pour ce bracelet (« Pour qui ? »), retirée à la borne
    .filter((t) => t && t.type === 'debit' && !t.annule && !t.horsPlafond && jourDe(t.timestamp) === jour)
    .reduce((s, t) => s + (Number(t.montant) || 0), 0)
}

/** Reste du plafond aujourd'hui (centimes), null sans plafond */
const resteDuJour = (limites, depense) => (limites && limites.plafondJour ? Math.max(0, limites.plafondJour - depense) : null)

/**
 * Panier vérifié. lignes : [{ id, qty }] ; menuById : Map id → article (prix en centimes, alcool, standId)
 * Renvoie { items, total } ou lève une Error au message montré à la borne.
 */
function verifierPanier({ lignes, menuById, standById = new Map(), limites, depense = 0 }) {
  const parId = new Map()
  for (const l of lignes || []) {
    const id = String(l && l.id || '')
    const qty = Math.floor(Number(l && l.qty) || 0)
    if (!id || qty <= 0) continue
    parId.set(id, (parId.get(id) || 0) + qty)
  }
  if (!parId.size) throw new Error('Panier vide.')
  const items = []
  for (const [id, qty] of parId) {
    const m = menuById.get(id)
    if (!m) throw new Error('Un article n\'est plus disponible. Recommencez la commande.')
    if (limites && limites.mineur && m.alcool === true) throw new Error(`« ${m.nom} » contient de l'alcool : pas avec ce bracelet.`)
    if ((Number(m.stock) || 0) < qty) throw new Error(`Stock insuffisant pour « ${m.nom} » (${Number(m.stock) || 0} disponible${Number(m.stock) > 1 ? 's' : ''}).`)
    const prixUnit = Number(m.prix) || 0
    const st = m.standId ? standById.get(m.standId) : null
    items.push({ id, nom: String(m.nom || ''), qty, prixUnit, total: prixUnit * qty, ...(st ? { standId: st.id, standNumero: Number(st.numero) || 0 } : {}) })
  }
  const total = items.reduce((s, i) => s + i.total, 0)
  if (limites && limites.achatMax != null && total > limites.achatMax) {
    throw new Error(`Ce panier fait ${euros(total)}. Avec ce bracelet sans code : ${euros(limites.achatMax)} au plus par achat. Retirez un article.`)
  }
  const reste = resteDuJour(limites, depense)
  if (reste != null && total > reste) {
    throw new Error(`Ce panier fait ${euros(total)}, il reste ${euros(reste)} aujourd'hui sur ce bracelet. Retirez un article.`)
  }
  return { items, total }
}

module.exports = { limitesBracelet, depenseDuJour, resteDuJour, verifierPanier }
