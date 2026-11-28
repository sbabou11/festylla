/**
 * menu/etapes.js — commande par étapes (maquette validée le 28/11/2026, inspirée de Hoplunch)
 *
 * Les étapes sont les rayons de la carte (organiserCarte), dans leur ordre. Après chaque ajout, on
 * suggère la prochaine étape où le panier n'a encore rien, sauf si le client a répondu « Pas
 * intéressé ». Loi Évin : on ne pousse jamais vers l'alcool — une étape qui n'a que de l'alcool
 * n'est pas suggérée, et la suggestion ouvre une catégorie sans alcool.
 * Partagé par l'espace spectateur (onglet Commander) et la borne.
 */

const dispo = (m) => m && m.actif !== false && !(typeof m.stock === 'number' && m.stock <= 0)
const sansAlcool = (m) => dispo(m) && m.alcool !== true

/** Index de l'étape (rayon) qui contient cet article, sinon -1 */
export function etapeDeArticle(rayons = [], id) {
  return rayons.findIndex(r => (r.cats || []).some(c => (c.items || []).some(m => m.id === id)))
}

/** L'étape a-t-elle un article dans le panier ? qtys : { id: quantité } */
export const etapeRemplie = (rayon, qtys = {}) =>
  (rayon?.cats || []).some(c => (c.items || []).some(m => (qtys[m.id] || 0) > 0))

/**
 * Prochaine étape à suggérer après un ajout (index) ou null.
 * courante : étape affichée ; refus : { index: true } pour « Pas intéressé ».
 */
export function prochaineSuggestion(rayons = [], { courante = 0, qtys = {}, refus = {} } = {}) {
  const n = rayons.length
  if (n < 2) return null
  for (let k = 1; k < n; k++) {
    const i = (courante + k) % n
    const r = rayons[i]
    if (refus[i] || etapeRemplie(r, qtys)) continue
    if (!(r.cats || []).some(c => (c.items || []).some(sansAlcool))) continue   // que de l'alcool : jamais suggéré
    return i
  }
  return null
}

/** Catégorie à ouvrir pour une suggestion : la première sans alcool (clé), sinon la première */
export function categorieSuggeree(rayon) {
  const cats = rayon?.cats || []
  const pure = cats.find(c => (c.items || []).some(sansAlcool) && !(c.items || []).some(m => m.alcool === true))
  const mixte = cats.find(c => (c.items || []).some(sansAlcool))
  return (pure || mixte || cats[0] || {}).key ?? null
}
