/**
 * utils/qrEspace.js — QR tournant des espaces bénévole et artiste, côté téléphone (23/11/2026)
 *
 * Même calcul que le serveur (api/_qr/espace.js), qui seul fait foi ; un test vérifie l'égalité.
 * Jeton : Y<B|A>-<fiche ou créneau en base 32>-<fenêtre en base 36>-<signature, 12 caractères>.
 * Calculé sur le téléphone avec la clé du lien personnel : aucun réseau nécessaire. Sans clé
 * (espace ouvert autrement), le téléphone demande les jetons au serveur (api/qr, « jetons-espace »).
 */
import { fenetreDe } from './qrTournant'

export { PERIODE_MS, fenetreDe, resteSecondes } from './qrTournant'

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const JETON = /Y([BA])-([A-Z2-7]{2,205})-([0-9A-Z]{4,9})-([A-Z2-7]{12})(?![A-Z0-9])/
const ID = /^[\w-]{1,128}$/
const PREFIXES = { benevole: 'YB', artiste: 'YA' }
const VERSIONS = { benevole: 'yb1', artiste: 'ya1' }

function base32(bytes, n = Infinity) {
  let bits = '', out = ''
  for (const b of bytes) bits += b.toString(2).padStart(8, '0')
  if (n === Infinity) bits = bits.padEnd(Math.ceil(bits.length / 5) * 5, '0')
  for (let i = 0; i + 5 <= bits.length && out.length < n; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]
  return out
}

function deBase32(texte) {
  let bits = ''
  for (const c of String(texte)) {
    const v = B32.indexOf(c)
    if (v < 0) return null
    bits += v.toString(2).padStart(5, '0')
  }
  const octets = []
  for (let i = 0; i + 8 <= bits.length; i += 8) octets.push(parseInt(bits.slice(i, i + 8), 2))
  try { return new TextDecoder().decode(new Uint8Array(octets)) } catch { return null }
}

/** Jeton de la fenêtre en cours. kind : 'benevole' ou 'artiste' ; id : fiche ou créneau */
export async function jetonEspace({ kind, cle, ev, id, ms = Date.now() }) {
  const enc = new TextEncoder()
  const fenetre = fenetreDe(ms)
  const k = await crypto.subtle.importKey('raw', enc.encode(String(cle).toLowerCase()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(`${VERSIONS[kind]}|${ev}|${id}|${fenetre}`)))
  return `${PREFIXES[kind]}-${base32(enc.encode(String(id)))}-${fenetre.toString(36).toUpperCase()}-${base32(h, 12)}`
}

/**
 * Jeton d'espace dans une ou plusieurs lectures (caméra, lecteur en mode clavier) :
 * { kind: 'benevole' | 'artiste', id, jeton } ou null. La signature n'est pas vérifiée ici.
 */
export function parseQrEspace(...lectures) {
  for (const t of lectures) {
    const m = String(t || '').toUpperCase().match(JETON)
    if (!m) continue
    const id = deBase32(m[2])
    if (id && ID.test(id)) return { kind: m[1] === 'B' ? 'benevole' : 'artiste', id, jeton: m[0] }
  }
  return null
}
