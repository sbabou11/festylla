/**
 * utils/fuzzy.js — correspondance approximative pour la recherche Ctrl K
 * fuzzyMatch('Remboursement', 'rmb') → { score, indices: [0, 2, 3] } ; null si les lettres ne s'y trouvent pas dans l'ordre.
 * Bonus : début du texte, début de mot, lettres consécutives. Accents et casse ignorés.
 */
const fold = (v = '') => String(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function fuzzyMatch(text, query) {
  const t = fold(text), q = fold(query).replace(/\s+/g, '')
  if (!q) return { score: 0, indices: [] }
  const indices = []
  let score = 0, ti = 0, prev = -2
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found === -1) return null
    const startOfWord = found === 0 || /[\s\-'’·.(]/.test(t[found - 1])
    score += 1 + (found === prev + 1 ? 3 : 0) + (startOfWord ? 2 : 0) + (found === 0 ? 3 : 0)
    score -= Math.min(found - ti, 6) * 0.2 // lettres éloignées : un peu moins pertinent
    indices.push(found)
    prev = found
    ti = found + 1
  }
  // Correspondance exacte d'un morceau : toujours en tête
  if (t.includes(fold(query).trim())) score += 10
  return { score, indices }
}

// Découpe un texte en morceaux { text, hit } pour surligner les lettres trouvées
export function highlight(text, indices = []) {
  const set = new Set(indices)
  const out = []
  ;[...String(text)].forEach((ch, i) => {
    const hit = set.has(i)
    const last = out[out.length - 1]
    if (last && last.hit === hit) last.text += ch
    else out.push({ text: ch, hit })
  })
  return out
}
