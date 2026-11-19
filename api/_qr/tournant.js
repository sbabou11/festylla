/**
 * api/_qr/tournant.js — QR tournant du spectateur (fonctions pures, serveur)
 *
 * Choix de l'organisateur (20/11/2026) : on ne paie plus avec le code « FY-… » ni avec un QR fixe.
 * L'espace spectateur affiche un QR qui change toutes les 30 secondes ; une capture d'écran ne
 * sert plus à rien après quelques dizaines de secondes.
 *
 * Jeton : YQ-<code du compte sans « FY- »>-<fenêtre en base 36>-<signature, 12 caractères>
 *   signature = HMAC-SHA256(clé du compte, « yq1|<événement>|<FY-code>|<fenêtre> »), en base 32
 * La clé du compte est celle du lien personnel : le téléphone la retient, le serveur la connaît.
 * Que des majuscules, des chiffres et des tirets : lisible par un lecteur en mode clavier.
 * Même calcul côté téléphone : src/utils/qrTournant.js (un test vérifie l'égalité).
 *
 * Code de secours (scanner en panne) : 2 lettres + 4 chiffres (ex. KT-4821), tiré au hasard par
 * le serveur, valable peu de temps, différent des codes de commande à 6 chiffres.
 */
const crypto = require('crypto')

const PERIODE_MS = 30 * 1000
const TOLERANCE = 2            // fenêtres acceptées avant et après (horloge du téléphone)
const JETON = /YQ-([A-Z0-9]{4,12})-([0-9A-Z]{4,9})-([A-Z2-7]{12})(?![A-Z0-9])/
const SECOURS = /^([A-HJ-NP-Z]{2})-?(\d{4})$/
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const LETTRES = 'ABCDEFGHJKLMNPRSTUVWXYZ'

const fenetreDe = (ms) => Math.floor(ms / PERIODE_MS)

function base32(buf, n) {
  let bits = '', out = ''
  for (const b of buf) bits += b.toString(2).padStart(8, '0')
  for (let i = 0; i + 5 <= bits.length && out.length < n; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]
  return out
}

function signature({ cle, ev, specId, fenetre }) {
  const h = crypto.createHmac('sha256', String(cle)).update(`yq1|${ev}|${specId}|${fenetre}`).digest()
  return base32(h, 12)
}

function jeton({ cle, ev, specId, ms }) {
  const fenetre = fenetreDe(ms)
  return `YQ-${String(specId).replace(/^FY-/, '')}-${fenetre.toString(36).toUpperCase()}-${signature({ cle, ev, specId, fenetre })}`
}

/** Jeton trouvé dans un texte lu : { specId, fenetre, sig } ou null */
function lireJeton(texte) {
  const m = String(texte || '').toUpperCase().match(JETON)
  if (!m) return null
  const fenetre = parseInt(m[2], 36)
  return Number.isFinite(fenetre) ? { specId: `FY-${m[1]}`, fenetre, sig: m[3] } : null
}

/** Le jeton est-il celui de ce compte, à cette heure (à quelques fenêtres près) ? */
function jetonValable({ lu, cle, ev, ms }) {
  if (!lu || !cle) return false
  if (Math.abs(lu.fenetre - fenetreDe(ms)) > TOLERANCE) return false
  const attendu = Buffer.from(signature({ cle, ev, specId: lu.specId, fenetre: lu.fenetre }))
  const recu = Buffer.from(String(lu.sig))
  return attendu.length === recu.length && crypto.timingSafeEqual(attendu, recu)
}

/** Code de secours normalisé (« KT-4821 ») ou null */
function lireSecours(texte) {
  const m = String(texte || '').toUpperCase().replace(/\s+/g, '').match(SECOURS)
  return m ? `${m[1]}-${m[2]}` : null
}

function nouveauSecours(random = crypto.randomInt) {
  const l = () => LETTRES[random(LETTRES.length)]
  return `${l()}${l()}-${String(random(10000)).padStart(4, '0')}`
}

module.exports = { PERIODE_MS, TOLERANCE, fenetreDe, signature, jeton, lireJeton, jetonValable, lireSecours, nouveauSecours }
