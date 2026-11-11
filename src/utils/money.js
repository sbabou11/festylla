/**
 * utils/money.js — conversions d'argent, couvertes par les tests (src/utils/money.test.js)
 * Les montants sont stockés en centimes entiers ; les saisies arrivent en euros (« 12,10 », 12.1…).
 */

// Euros saisis → centimes entiers. Math.round évite 12.1 * 100 = 1209.9999…
export function toCents(euros) {
  const n = parseFloat(String(euros ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

// Centimes → texte « 12,10 € » (espace insécable avant le symbole)
export function formatCents(cents) {
  return (Math.round(cents || 0) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}
