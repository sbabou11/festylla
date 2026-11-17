/**
 * api/_billets/cles.js — clés de liaison par événement et par source (règle d'échange v1.3, §2)
 *
 * Forme d'une clé YllaCash : <identifiant public de l'événement>.<identifiant de clé>.<secret>
 *  - l'événement : identifiant Firestore (lettres, chiffres, _ ou -) ; le site le reprend dans
 *    l'adresse du compte d'un billet ;
 *  - l'identifiant de clé : permet de la retrouver sans parcourir les autres ;
 *  - le secret : 40 caractères tirés au hasard ; seule son empreinte (SHA-256) est gardée.
 * La clé désigne l'événement : un message reçu avec elle est rangé dans son événement, nulle part ailleurs.
 * Rangement : collection racine `liaisons/{identifiant de clé}`, que les règles réservent au serveur.
 */
const crypto = require('crypto')

const EV = /^[A-Za-z0-9_-]{1,128}$/
const KEY_ID = /^[a-z0-9]{8,32}$/
const SECRET = /^[A-Za-z0-9_-]{32,128}$/
const ALPHA = 'abcdefghijklmnopqrstuvwxyz0123456789'

const empreinte = (secret) => crypto.createHash('sha256').update(String(secret)).digest('hex')

/** Découpe une clé reçue ; null si sa forme ne convient pas */
function parseKey(raw) {
  const parts = String(raw || '').trim().split('.')
  if (parts.length !== 3) return null
  const [ev, keyId, secret] = parts
  if (!EV.test(ev) || !KEY_ID.test(keyId) || !SECRET.test(secret)) return null
  return { ev, keyId, secret }
}

/** Lit l'en-tête Authorization: Bearer <clé> */
function keyFromHeader(header) {
  const m = /^Bearer\s+(\S+)$/i.exec(String(header || '').trim())
  return m ? parseKey(m[1]) : null
}

/** La clé reçue correspond-elle à la fiche enregistrée ? (comparaison en temps constant) */
function keyMatches(parsed, stored) {
  if (!parsed || !stored || stored.supprimee || stored.ev !== parsed.ev || !/^[0-9a-f]{64}$/.test(stored.empreinte || '')) return false
  const a = Buffer.from(empreinte(parsed.secret), 'hex')
  const b = Buffer.from(stored.empreinte, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

const randomText = (n, alphabet) => Array.from(crypto.randomBytes(n), b => alphabet[b % alphabet.length]).join('')

/** Nouvelle clé pour un événement : la clé complète n'est montrée qu'une fois ; on garde l'empreinte */
function newKey(ev, keyId = randomText(12, ALPHA)) {
  if (!EV.test(ev)) throw new Error('Identifiant d\'événement invalide pour une clé.')
  const secret = crypto.randomBytes(30).toString('base64url')   // 40 caractères
  return { keyId, cle: `${ev}.${keyId}.${secret}`, empreinte: empreinte(secret) }
}

const cleanName = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 60)

module.exports = { parseKey, keyFromHeader, keyMatches, newKey, empreinte, cleanName, EV }
