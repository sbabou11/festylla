/**
 * utils/specCode.js — reconnaissance des codes spectateur
 *
 * Deux formes de compte coexistent :
 *  - FY-XXXX           comptes créés à la billetterie ou à l'inscription (4 caractères)
 *  - FY-K7Q3NP         comptes créés par un billet du site (6 caractères pris dans
 *                      ABCDEFGHJKLMNPQRSTUVWXYZ23456789, voir api/billets.js ; décision du 17/11/2026)
 * Les longueurs diffèrent : un billet ne peut pas reprendre le code d'un compte créé sur place.
 * Jusqu'à 12 caractères restent acceptés (premiers billets d'essai du site).
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
  // Code de billet tout en lettres (ex. « KQWNPX ») : 6 caractères de l'alphabet des billets
  if (/^[A-HJ-NP-Z2-9]{6}$/.test(t)) return `FY-${t}`
  return null
}
