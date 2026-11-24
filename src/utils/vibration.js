/**
 * utils/vibration.js — courte vibration quand un geste aboutit (24/11/2026)
 * Maquette validée : https://claude.ai/artifact/2uDCNPsqRhkuXyvPKpsuKD (idée d'Event Manager)
 *
 * Seulement quand le geste aboutit (bouton maintenu jusqu'au bout, QR reconnu par la caméra,
 * « tirer pour actualiser » lâché assez loin), jamais pendant le geste ni s'il est annulé.
 * Coupée si le téléphone demande de réduire les animations. Android seulement : l'iPhone ne
 * permet pas aux pages web de vibrer (l'appel ne fait rien).
 */
export function vibrerSucces() {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
    return navigator.vibrate(12)
  } catch { return false }
}
