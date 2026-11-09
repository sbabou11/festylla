/**
 * utils/euroEnLettres.js
 *
 * Convertit un montant numérique en sa version textuelle française.
 * Utilisé pour les décharges de paiement (obligation légale d'écrire
 * le montant en lettres en complément des chiffres).
 *
 * Exemples :
 *   1     → "un euro"
 *   2.5   → "deux euros et cinquante centimes"
 *   1500  → "mille cinq cents euros"
 *   500   → "cinq cents euros"
 *
 * Règles orthographiques françaises 1990 appliquées
 * (orthographe rectifiée acceptée par l'Académie).
 */

const UNITS = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize']
const TENS  = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt']

function numberToFrenchWords(n) {
  if (n === 0) return 'zéro'
  if (n < 0) return 'moins ' + numberToFrenchWords(-n)
  if (n < 17) return UNITS[n]
  if (n < 20) return 'dix-' + UNITS[n - 10]
  if (n < 100) {
    const t = Math.floor(n / 10)
    const u = n % 10
    if (t === 7 || t === 9) {
      // 70 = soixante-dix, 71 = soixante-et-onze, ..., 90 = quatre-vingt-dix, 91 = quatre-vingt-onze
      const base = t === 7 ? 'soixante' : 'quatre-vingt'
      if (u === 0) return base + (t === 9 ? '-dix' : '-dix')
      return base + '-' + UNITS[u + 10]
    }
    let str = TENS[t]
    if (u === 0) {
      // 80 = quatre-vingts (avec s)
      if (t === 8) str += 's'
    } else if (u === 1 && t !== 8) {
      str += '-et-' + UNITS[u]
    } else {
      str += '-' + UNITS[u]
    }
    return str
  }
  if (n < 1000) {
    const c = Math.floor(n / 100)
    const r = n % 100
    let str = ''
    if (c === 1) str = 'cent'
    else str = UNITS[c] + ' cent' + (r === 0 ? 's' : '')
    if (r > 0) str += ' ' + numberToFrenchWords(r)
    return str
  }
  if (n < 1000000) {
    const k = Math.floor(n / 1000)
    const r = n % 1000
    let str = ''
    if (k === 1) str = 'mille'
    else str = numberToFrenchWords(k) + ' mille'
    if (r > 0) str += ' ' + numberToFrenchWords(r)
    return str
  }
  if (n < 1000000000) {
    const m = Math.floor(n / 1000000)
    const r = n % 1000000
    let str = (m === 1 ? 'un million' : numberToFrenchWords(m) + ' millions')
    if (r > 0) str += ' ' + numberToFrenchWords(r)
    return str
  }
  return n.toString() // au-delà du milliard, on évite
}

/**
 * Convertit un montant en euros (number) en sa version textuelle complète.
 * Gère les centimes.
 *
 * @param {number} amount - Montant en euros (ex: 500, 1500.50)
 * @returns {string} - Texte du type "cinq cents euros" ou "mille cinq cents euros et cinquante centimes"
 */
export function euroEnLettres(amount) {
  if (amount == null || isNaN(amount)) return ''
  const absAmount = Math.abs(amount)
  const euros = Math.floor(absAmount)
  const centimes = Math.round((absAmount - euros) * 100)

  let result = ''
  if (euros === 0) result = 'zéro euro'
  else if (euros === 1) result = 'un euro'
  else result = numberToFrenchWords(euros) + ' euros'

  if (centimes > 0) {
    result += ' et '
    if (centimes === 1) result += 'un centime'
    else result += numberToFrenchWords(centimes) + ' centimes'
  }

  if (amount < 0) result = 'moins ' + result
  return result
}

// Export par défaut pour compatibilité
export default euroEnLettres
