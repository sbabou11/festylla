/**
 * api/_qr/bracelet.js — bracelet de secours (décidé le 24/11/2026, maquette 3NMrrVEtcXWWyVS5jE48Lk)
 *
 * Un bracelet porte un QR « FYB-XXXXXXXX » : un numéro tiré au hasard, sans nom ni clé de compte.
 * Le spectateur le relie à son compte et choisit un code à 4 chiffres, demandé seulement quand il
 * paie avec le bracelet (téléphone déchargé). Le code n'est jamais gardé en clair : empreinte scrypt.
 *
 * Base : events/{ev}/bracelets/{numero}, écrit et lu par le serveur seulement (règles : aucun accès)
 *   { numero, specDoc, specId, statut: 'actif'|'bloque'|'remplace', codeHash, essais,
 *     relieLe, reliePar, codeLe, bloqueLe, bloqueMotif }
 */
const { hashPassword, checkPassword } = require('../_auth/core')

// Sans 0, 1, I ni O : rien à confondre en lisant le numéro imprimé sous le QR
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const NUMERO = /^[2-9A-HJ-NP-Z]{8}$/
const ESSAIS_MAX = 3

/** Texte lu (QR « FYB-K7Q3PX9M » ou numéro tapé « K7Q3 PX9M ») → numéro, sinon null */
function lireBracelet(texte) {
  const t = String(texte || '').toUpperCase().trim().slice(0, 80)
  const m = /(?:^|[^A-Z0-9])FYB-?([A-Z0-9]{8})(?![A-Z0-9])/.exec(t) || /^([A-Z0-9]{4})[\s-]?([A-Z0-9]{4})$/.exec(t)
  if (!m) return null
  const n = m[2] ? m[1] + m[2] : m[1]
  return NUMERO.test(n) ? n : null
}

/** Code à 4 chiffres, sans les plus faciles à deviner : 0000, 1111…, 1234, 4321… */
function erreurCode(code) {
  const c = String(code || '')
  if (!/^\d{4}$/.test(c)) return 'Le code doit faire 4 chiffres.'
  if (/^(\d)\1{3}$/.test(c)) return 'Ce code est trop facile à deviner : évitez les chiffres tous pareils.'
  const d = c.split('').map(Number)
  const suite = (pas) => d.every((x, i) => i === 0 || x === d[i - 1] + pas)
  if (suite(1) || suite(-1)) return 'Ce code est trop facile à deviner : évitez les suites comme 1234.'
  return null
}

const empreinteCode = (code) => hashPassword(code)
const codeJuste = (bracelet, code) => !!bracelet && !!bracelet.codeHash && checkPassword({ motDePasseHash: bracelet.codeHash }, String(code || '')).ok

/** Ce que l'espace du spectateur voit de son bracelet : jamais l'empreinte du code */
const vueBracelet = (b) => b ? { numero: b.numero, statut: b.statut, motif: b.bloqueMotif || null } : null

/** Numéro affiché : « K7Q3 PX9M » */
const numeroAffiche = (n) => `${String(n).slice(0, 4)} ${String(n).slice(4)}`

/** Numéros neufs pour la commande au fournisseur (liste à imprimer) */
function nouveauxNumeros(n, crypto = require('crypto')) {
  const vus = new Set()
  while (vus.size < n) {
    const b = crypto.randomBytes(8)
    vus.add(Array.from(b, (x) => ALPHABET[x & 31]).join(''))
  }
  return [...vus]
}

module.exports = { lireBracelet, erreurCode, empreinteCode, codeJuste, vueBracelet, numeroAffiche, nouveauxNumeros, ESSAIS_MAX, ALPHABET }
