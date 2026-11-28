/**
 * utils/bilanSpec.js — « Bilan » de l'historique du spectateur (maquette validée le 28/11/2026)
 *
 * Calculé sur le téléphone, à partir des opérations que le titulaire voit déjà : rien de nouveau
 * n'est collecté. Seules les dépenses comptent (achats, commandes, moins les annulations).
 *  - par jour du festival ;
 *  - par catégorie du menu (d'après le nom de l'article ; « Autres » sinon) ;
 *  - par bracelet (opération.bracelet ; sans bracelet : « Téléphone ou code ») ;
 *  - stands les plus fréquentés (stand de l'article dans le menu).
 */

/** Effet d'une opération sur les dépenses (centimes) */
export function depenseDe(t) {
  const m = Math.round(Number(t && t.montant) || 0)
  if (!t) return 0
  if (t.type === 'debit' || t.type === 'reservation') return m
  if (t.type === 'annulation') return -m
  return 0
}

/** Opérations d'un bracelet ('' : toutes) */
export const filtrerBracelet = (txs, numero) => (numero ? txs.filter(t => t && t.bracelet === numero) : txs)

const ajouter = (map, cle, base, montant, fois = 0) => {
  const x = map.get(cle) || { ...base, montant: 0, fois: 0 }
  x.montant += montant
  x.fois += fois
  map.set(cle, x)
}
const tries = (map) => [...map.values()].filter(x => x.montant > 0).sort((a, b) => b.montant - a.montant)

/**
 * txs : opérations (déjà filtrées par bracelet si besoin) ; menu : articles { nom, cat, standId } ;
 * stands : [{ id, nom, numero }] ; jourDe(t) → { key, label } ; bracelets : [{ numero, prenom }]
 */
export function bilanSpec(txs = [], { menu = [], stands = [], jourDe, bracelets = [] } = {}) {
  const parNom = new Map(menu.map(m => [String(m.nom || '').trim().toLowerCase(), m]))
  const standById = new Map(stands.map(s => [s.id, s]))
  const nomBr = new Map(bracelets.map(b => [b.numero, b.prenom || `Bracelet ${String(b.numero).slice(0, 4)}`]))
  const jours = new Map(), cats = new Map(), brs = new Map(), sts = new Map()
  let depense = 0, recharge = 0

  for (const t of txs) {
    if (t && t.type === 'credit') recharge += Math.round(Number(t.montant) || 0)
    const d = depenseDe(t)
    if (!d) continue
    depense += d
    const j = jourDe ? jourDe(t) : { key: '', label: '' }
    ajouter(jours, j.key, { key: j.key, label: j.label }, d)
    const cle = t.bracelet || ''
    ajouter(brs, cle, { numero: cle, nom: cle ? (t.braceletPrenom || nomBr.get(cle) || `Bracelet ${cle.slice(0, 4)}`) : 'Téléphone ou code' }, d)

    const items = Array.isArray(t.items) ? t.items : []
    const totalItems = items.reduce((s, i) => s + (Number(i.total) || (Number(i.qty) || 0) * (Number(i.prixUnit) || 0)), 0)
    if (!items.length || !totalItems) { ajouter(cats, 'Autres', { nom: 'Autres' }, d); continue }
    const vus = new Set()
    for (const i of items) {
      const part = Math.round(d * ((Number(i.total) || (Number(i.qty) || 0) * (Number(i.prixUnit) || 0)) / totalItems))
      const m = parNom.get(String(i.nom || '').trim().toLowerCase())
      const cat = (m && m.cat) || 'Autres'
      ajouter(cats, cat, { nom: cat }, part)
      const st = m && m.standId ? standById.get(m.standId) : null
      if (st) { ajouter(sts, st.id, { nom: st.nom || `Stand ${st.numero}` }, part, vus.has(st.id) ? 0 : 1); vus.add(st.id) }
    }
  }
  return {
    depense, recharge,
    parJour: [...jours.values()].filter(x => x.montant > 0).sort((a, b) => String(a.key).localeCompare(String(b.key))),
    parCategorie: tries(cats),
    parBracelet: tries(brs),
    stands: tries(sts).slice(0, 3),
  }
}
