/**
 * api/_qr/espace.js — QR tournant des espaces bénévole et artiste (fonctions pures, serveur)
 *
 * Choix de l'organisateur (23/11/2026) : le QR de l'espace bénévole et celui de l'espace artiste
 * ne contiennent plus le lien personnel avec sa clé (une photo suffisait pour commander à la borne
 * à la place de la personne). Comme pour le spectateur (tournant.js), ils changent toutes les 30 s.
 *
 * Jeton : Y<B|A>-<fiche ou créneau en base 32>-<fenêtre en base 36>-<signature, 12 caractères>
 *   YB = bénévole : signature = HMAC-SHA256(clé du lien, « yb1|<événement>|<fiche>|<fenêtre> »)
 *   YA = artiste  : signature = HMAC-SHA256(clé du lien, « ya1|<événement>|<créneau>|<fenêtre> »)
 * La clé est celle du lien personnel (events/{ev}/liens/{benevole-<id>|artiste-<id>}).
 * L'identifiant est écrit en base 32 (A-Z, 2-7) : que des majuscules, des chiffres et des tirets,
 * lisible par un lecteur en mode clavier quelle que soit la casse de l'identifiant d'origine.
 * Même calcul côté téléphone : src/utils/qrEspace.js (un test vérifie l'égalité).
 *
 * Passage : après un QR valable, la borne reçoit un passage signé (10 minutes) pour commander
 * sans que la personne doive représenter un QR qui aura changé entre-temps. Il est signé avec la
 * même clé du lien : rien à ranger dans la base, et un nouveau lien l'annule.
 */
const crypto = require('crypto')
const { PERIODE_MS, TOLERANCE, fenetreDe } = require('./tournant')

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const JETON = /Y([BA])-([A-Z2-7]{2,205})-([0-9A-Z]{4,9})-([A-Z2-7]{12})(?![A-Z0-9])/
const ID = /^[\w-]{1,128}$/
const KINDS = { B: 'benevole', A: 'artiste' }
const PREFIXES = { benevole: 'YB', artiste: 'YA' }
const VERSIONS = { benevole: 'yb1', artiste: 'ya1' }
const PASSAGE_MS = 10 * 60 * 1000

function base32(buf, n = Infinity) {
  let bits = '', out = ''
  for (const b of buf) bits += b.toString(2).padStart(8, '0')
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
  return Buffer.from(octets).toString('utf8')
}

const idEnBase32 = (id) => base32(Buffer.from(String(id), 'utf8'))

function signature({ kind, cle, ev, id, fenetre }) {
  const h = crypto.createHmac('sha256', String(cle).toLowerCase()).update(`${VERSIONS[kind]}|${ev}|${id}|${fenetre}`).digest()
  return base32(h, 12)
}

function jeton({ kind, cle, ev, id, ms }) {
  const fenetre = fenetreDe(ms)
  return `${PREFIXES[kind]}-${idEnBase32(id)}-${fenetre.toString(36).toUpperCase()}-${signature({ kind, cle, ev, id, fenetre })}`
}

/** Jeton trouvé dans une ou plusieurs lectures : { kind, id, fenetre, sig } ou null */
function lireJetonEspace(...lectures) {
  for (const t of lectures) {
    const m = String(t || '').toUpperCase().match(JETON)
    if (!m) continue
    const id = deBase32(m[2])
    const fenetre = parseInt(m[3], 36)
    if (id && ID.test(id) && Number.isFinite(fenetre)) return { kind: KINDS[m[1]], id, fenetre, sig: m[4] }
  }
  return null
}

const memeTexte = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

/** Le jeton est-il celui de cette fiche, à cette heure (à quelques fenêtres près) ? */
function jetonEspaceValable({ lu, cle, ev, ms }) {
  if (!lu || !cle || !VERSIONS[lu.kind]) return false
  if (Math.abs(lu.fenetre - fenetreDe(ms)) > TOLERANCE) return false
  return memeTexte(signature({ kind: lu.kind, cle, ev, id: lu.id, fenetre: lu.fenetre }), lu.sig)
}

/** Jetons des prochaines fenêtres (repli du téléphone qui ne connaît pas la clé) */
function jetonsAVenir({ kind, cle, ev, id, ms, n = 10 }) {
  const f0 = fenetreDe(ms)
  return Array.from({ length: n }, (_, i) => ({ fenetre: f0 + i, jeton: jeton({ kind, cle, ev, id, ms: (f0 + i) * PERIODE_MS }) }))
}

// ── Passage de la borne ──
const signerPassage = ({ kind, cle, ev, id, exp }) =>
  crypto.createHmac('sha256', String(cle).toLowerCase()).update(`pb1|${ev}|${kind}|${id}|${exp}`).digest('hex')

function nouveauPassage({ kind, cle, ev, id, ms }) {
  const exp = ms + PASSAGE_MS
  return { kind, id, exp, sig: signerPassage({ kind, cle, ev, id, exp }) }
}

function passageValable({ passage, cle, ev, ms }) {
  if (!passage || !cle || !VERSIONS[passage.kind] || !ID.test(String(passage.id || ''))) return false
  const exp = Number(passage.exp)
  if (!Number.isFinite(exp) || exp < ms || exp > ms + PASSAGE_MS) return false
  return memeTexte(signerPassage({ kind: passage.kind, cle, ev, id: passage.id, exp }), String(passage.sig || ''))
}

module.exports = {
  PERIODE_MS, PASSAGE_MS, idEnBase32, signature, jeton, lireJetonEspace, jetonEspaceValable, jetonsAVenir,
  nouveauPassage, passageValable,
}
