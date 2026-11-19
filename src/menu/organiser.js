/**
 * menu/organiser.js — carte vue par le client (borne, espace spectateur), fonctions pures
 *
 * - Rayons en haut, catégories dessous, dans l'ordre choisi par l'organisateur.
 * - Dès qu'un stand existe, un article sans stand n'est pas proposé (on ne saurait
 *   pas sur quel ticket l'imprimer). Sans aucun stand, toute la carte reste proposée.
 * - Seuls les rayons et catégories qui ont au moins un article apparaissent.
 */

const norm = (v) => String(v || '').trim().toLowerCase()

/**
 * @returns {{ rayons: Array<{ id, nom, icon, cats: Array<{ key, nom, icon, couleur, items }> }>, items: Array }}
 *   rayons : [{ id:'' … }] unique et sans nom quand l'organisateur n'a créé aucun rayon
 */
export function organiserCarte({ menu = [], categories = [], rayons = [], stands = [] }) {
  const standIds = new Set(stands.map(s => s.id))
  const items = menu.filter(m => m.actif !== false && (standIds.size === 0 || standIds.has(m.standId)))

  // Catégories connues (ordre de l'organisateur), puis celles qui n'existent que sur des articles
  const cats = [...categories].sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
  const known = new Set(cats.map(c => norm(c.nom)))
  const extra = [...new Set(items.map(m => m.cat).filter(c => c && !known.has(norm(c))))].sort()
  const allCats = [...cats, ...extra.map(nom => ({ nom }))]

  const rayonIds = new Set(rayons.map(r => r.id))
  const sansRayon = { id: '', nom: rayons.length ? 'Autres' : '', icon: 'tag', cats: [] }
  const out = [...rayons].sort((a, b) => (a.ordre || 0) - (b.ordre || 0)).map(r => ({ ...r, cats: [] }))
  const byId = new Map(out.map(r => [r.id, r]))

  for (const c of allCats) {
    const list = items.filter(m => norm(m.cat) === norm(c.nom))
    if (list.length === 0) continue
    const target = rayonIds.has(c.rayonId) ? byId.get(c.rayonId) : sansRayon
    target.cats.push({ key: c.id || c.nom, nom: c.nom, icon: c.icon, couleur: c.couleur, items: list })
  }
  // Articles sans catégorie
  const sansCat = items.filter(m => !m.cat)
  if (sansCat.length) sansRayon.cats.push({ key: '__autres', nom: 'Autres', icon: 'tag', items: sansCat })

  const result = [...out, sansRayon].filter(r => r.cats.length > 0)
  return { rayons: result, items }
}

/**
 * Un ticket par stand. lignes : [{ nom, qty, prix, standId }] ; numero : n° de commande.
 * Sans stand (aucun stand créé), un seul ticket sans numéro de stand.
 */
export function ticketsParStand(lignes = [], stands = [], numero = '') {
  const byId = new Map(stands.map(s => [s.id, s]))
  const groups = new Map()
  for (const l of lignes) {
    const st = byId.get(l.standId) || null
    const key = st ? st.id : ''
    if (!groups.has(key)) groups.set(key, { stand: st, lignes: [] })
    groups.get(key).lignes.push(l)
  }
  return [...groups.values()]
    .sort((a, b) => (a.stand?.numero ?? Infinity) - (b.stand?.numero ?? Infinity))
    .map(g => ({
      ...g,
      numero: g.stand ? `${numero}-${g.stand.numero}` : String(numero),
      sousTotal: g.lignes.reduce((s, l) => s + (l.prix || 0) * (l.qty || 0), 0),
    }))
}

/** Numéro de ticket tapé à la billetterie : « 47-4 » → { numero: 47, standNumero: 4 } ; « 47 » → stand null */
export function lireNumeroTicket(saisie) {
  const m = String(saisie || '').trim().match(/^#?\s*(\d{1,5})(?:\s*[-–]\s*(\d{1,3}))?$/)
  return m ? { numero: Number(m[1]), standNumero: m[2] != null ? Number(m[2]) : null } : null
}
