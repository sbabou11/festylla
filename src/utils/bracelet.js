/**
 * utils/bracelet.js — bracelet de secours (24/11/2026), côté écran
 * Même lecture que le serveur (api/_qr/bracelet.js) : QR « FYB-K7Q3PX9M » ou numéro tapé « K7Q3 PX9M ».
 * Le serveur revérifie tout (numéro, code) : ceci ne sert qu'à répondre tout de suite à l'écran.
 */
const NUMERO = /^[2-9A-HJ-NP-Z]{8}$/

export function lireBracelet(texte) {
  const t = String(texte || '').toUpperCase().trim().slice(0, 80)
  const m = /(?:^|[^A-Z0-9])FYB-?([A-Z0-9]{8})(?![A-Z0-9])/.exec(t) || /^([A-Z0-9]{4})[\s-]?([A-Z0-9]{4})$/.exec(t)
  if (!m) return null
  const n = m[2] ? m[1] + m[2] : m[1]
  return NUMERO.test(n) ? n : null
}

/** QR imprimé seulement (« FYB-… ») : pour le lecteur de la borne, qui ne doit pas prendre un autre code pour un bracelet */
export function lireQrBracelet(texte) {
  const m = /(?:^|[^A-Z0-9])FYB-([A-Z0-9]{8})(?![A-Z0-9])/.exec(String(texte || '').toUpperCase().slice(0, 80))
  return m && NUMERO.test(m[1]) ? m[1] : null
}

export function erreurCode(code) {
  const c = String(code || '')
  if (!/^\d{4}$/.test(c)) return 'Le code doit faire 4 chiffres.'
  if (/^(\d)\1{3}$/.test(c)) return 'Ce code est trop facile à deviner : évitez les chiffres tous pareils.'
  const d = c.split('').map(Number)
  const suite = (pas) => d.every((x, i) => i === 0 || x === d[i - 1] + pas)
  if (suite(1) || suite(-1)) return 'Ce code est trop facile à deviner : évitez les suites comme 1234.'
  return null
}

export const numeroAffiche = (n) => `${String(n || '').slice(0, 4)} ${String(n || '').slice(4)}`
