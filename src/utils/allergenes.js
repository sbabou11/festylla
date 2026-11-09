/**
 * utils/allergenes.js
 *
 * Liste officielle des 14 allergènes à déclaration obligatoire (UE — règlement INCO).
 * Chaque allergène a un code stable (utilisé en base), un label affichable
 * et un emoji pour repérage visuel rapide.
 */

export const ALLERGENES_UE = [
  { code: 'gluten',     label: 'Gluten',           emoji: '🌾' },
  { code: 'crustaces',  label: 'Crustacés',        emoji: '🦐' },
  { code: 'oeufs',      label: 'Œufs',             emoji: '🥚' },
  { code: 'poissons',   label: 'Poissons',         emoji: '🐟' },
  { code: 'arachides',  label: 'Arachides',        emoji: '🥜' },
  { code: 'soja',       label: 'Soja',             emoji: '🫘' },
  { code: 'lait',       label: 'Lait',             emoji: '🥛' },
  { code: 'fruits_coque', label: 'Fruits à coque', emoji: '🌰' },
  { code: 'celeri',     label: 'Céleri',           emoji: '🌿' },
  { code: 'moutarde',   label: 'Moutarde',         emoji: '🟡' },
  { code: 'sesame',     label: 'Graines de sésame', emoji: '🌱' },
  { code: 'sulfites',   label: 'Sulfites',         emoji: '🍷' },
  { code: 'lupin',      label: 'Lupin',            emoji: '🌼' },
  { code: 'mollusques', label: 'Mollusques',       emoji: '🐚' },
]

// Map rapide code → infos, pour résolution en O(1).
export const ALLERGENES_BY_CODE = Object.fromEntries(
  ALLERGENES_UE.map(a => [a.code, a])
)

/**
 * Résout un code allergène en label affichable.
 * Si le code n'est pas dans la liste UE, renvoie le code tel quel (custom).
 */
export function labelAllergene(code) {
  const a = ALLERGENES_BY_CODE[code]
  return a ? a.label : code
}
