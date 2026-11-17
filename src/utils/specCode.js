/**
 * utils/specCode.js — reconnaissance des codes spectateur
 *
 * Deux formes de compte coexistent :
 *  - FY-XXXX           comptes créés à la billetterie ou à l'inscription (4 caractères)
 *  - FY-K7QW3NPX9RTB   comptes créés par un billet du site (12 caractères, voir api/billets.js)
 * Le QR d'un billet contient une adresse : https://…/solde?id=FY-<code>&ev=<événement>.
 */
export const SPEC_CODE = /FY-[A-Z0-9]{4,12}(?![A-Z0-9])/

/**
 * Code spectateur trouvé dans un texte lu ou saisi : code seul, adresse complète,
 * ou code de billet tapé sans « FY- ». Renvoie « FY-… » ou null.
 */
export function extractSpecId(text) {
  const t = String(text || '').trim().toUpperCase()
  const m = t.match(SPEC_CODE)
  if (m) return m[0]
  if (/^[A-Z0-9]{4,12}$/.test(t) && /\d/.test(t)) return `FY-${t}`
  return null
}
