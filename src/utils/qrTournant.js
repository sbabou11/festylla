/**
 * utils/qrTournant.js — QR tournant du spectateur, côté téléphone (20/11/2026)
 *
 * Même calcul que le serveur (api/_qr/tournant.js), qui seul fait foi ; un test vérifie l'égalité.
 * Jeton : YQ-<code du compte sans « FY- »>-<fenêtre en base 36>-<signature, 12 caractères>.
 * Calculé sur le téléphone à partir de la clé du lien personnel : aucun réseau nécessaire.
 */
export const PERIODE_MS = 30 * 1000
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const JETON = /YQ-([A-Z0-9]{4,12})-([0-9A-Z]{4,9})-([A-Z2-7]{12})(?![A-Z0-9])/
const SECOURS = /^([A-HJ-NP-Z]{2})-?(\d{4})$/

export const fenetreDe = (ms) => Math.floor(ms / PERIODE_MS)
/** Secondes avant le prochain changement */
export const resteSecondes = (ms) => Math.ceil((PERIODE_MS - (ms % PERIODE_MS)) / 1000)

function base32(bytes, n) {
  let bits = '', out = ''
  for (const b of bytes) bits += b.toString(2).padStart(8, '0')
  for (let i = 0; i + 5 <= bits.length && out.length < n; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]
  return out
}

export async function jetonTournant({ cle, ev, specId, ms = Date.now() }) {
  const enc = new TextEncoder()
  const fenetre = fenetreDe(ms)
  const k = await crypto.subtle.importKey('raw', enc.encode(String(cle)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(`yq1|${ev}|${specId}|${fenetre}`)))
  return `YQ-${String(specId).replace(/^FY-/, '')}-${fenetre.toString(36).toUpperCase()}-${base32(h, 12)}`
}

/** Jeton tournant dans une ou plusieurs lectures (caméra, lecteur en mode clavier) : le texte du jeton ou null */
export function parseQrTournant(...lectures) {
  for (const t of lectures) {
    const m = String(t || '').toUpperCase().match(JETON)
    if (m) return m[0]
  }
  return null
}

/** Code de secours (« KT-4821 », saisi avec ou sans tiret) ou null */
export function parseSecours(texte) {
  const m = String(texte || '').toUpperCase().replace(/\s+/g, '').match(SECOURS)
  return m ? `${m[1]}-${m[2]}` : null
}
