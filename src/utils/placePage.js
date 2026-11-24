/**
 * utils/placePage.js — remonter en haut et retrouver sa place (24/11/2026)
 * Maquette validée : https://claude.ai/artifact/TEdcftdnJsg3GafgPomiHQ (idée d'Event Manager)
 *
 * - Toucher l'onglet du bas où l'on est déjà ramène en haut de la page (en douceur, d'un coup si
 *   le téléphone demande de réduire les animations).
 * - Revenir sur une page ramène à l'endroit où l'on était. Gardé en mémoire pendant la visite
 *   seulement : rien n'est enregistré sur l'appareil.
 */
const places = new Map()

const reduit = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/** La zone qui défile : l'élément donné, sinon la page entière */
const zone = (el) => el || (typeof document !== 'undefined' ? document.scrollingElement || document.documentElement : null)

export function remonter(el) {
  const z = zone(el)
  if (!z) return
  if (typeof z.scrollTo === 'function') z.scrollTo({ top: 0, behavior: reduit() ? 'auto' : 'smooth' })
  else z.scrollTop = 0
}

export function garderPlace(cle, el) {
  const z = zone(el)
  if (z && cle) places.set(cle, z.scrollTop || 0)
}

/**
 * Remet la place gardée pour cette page (0 si aucune). La page peut se charger en plusieurs fois
 * (contenu chargé après coup) : on réessaie quelques images de suite jusqu'à pouvoir descendre.
 */
export function remettrePlace(cle, el, { essais = 40 } = {}) {
  const z = zone(el)
  if (!z) return
  const cible = places.get(cle) || 0
  let n = 0
  const essayer = () => {
    z.scrollTop = cible
    if (Math.abs(z.scrollTop - cible) > 1 && ++n < essais && typeof requestAnimationFrame === 'function') requestAnimationFrame(essayer)
  }
  essayer()
}

// Pour les tests
export const _places = places
