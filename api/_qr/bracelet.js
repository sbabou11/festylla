/**
 * api/_qr/bracelet.js — bracelet de secours (décidé le 24/11/2026, maquette 3NMrrVEtcXWWyVS5jE48Lk)
 *
 * Un bracelet porte un QR « FYB-XXXXXXXX » : un numéro tiré au hasard, sans nom ni clé de compte.
 * Le spectateur le relie à son compte et choisit un code à 4 chiffres, demandé seulement quand il
 * paie avec le bracelet (téléphone déchargé). Le code n'est jamais gardé en clair : empreinte scrypt.
 *
 * Base : events/{ev}/bracelets/{numero}, écrit et lu par le serveur seulement (règles : aucun accès)
 *   { numero, specDoc, specId, statut: 'actif'|'bloque'|'remplace', codeHash, essais,
 *     relieLe, reliePar, codeLe, bloqueLe, bloqueMotif,
 *     prenom, mineur, plafondJour }                       ← plusieurs bracelets par compte (28/11/2026)
 *
 * Plusieurs bracelets par compte (maquette v2 validée le 28/11/2026) : un seul solde, 6 bracelets
 * actifs au plus ; chacun a un prénom facultatif, une case « mineur » (pas d'alcool à la borne) et un
 * plafond par jour. Un bracelet « mineur » peut être sans code (codeHash null) : son plafond est alors
 * obligatoire, 30 € par jour au plus et 10 € par achat. Seul le guichet décoche « mineur ».
 */
const { hashPassword, checkPassword } = require('../_auth/core')

// Sans 0, 1, I ni O : rien à confondre en lisant le numéro imprimé sous le QR
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const NUMERO = /^[2-9A-HJ-NP-Z]{8}$/
const ESSAIS_MAX = 3
const MAX_BRACELETS = 6
const PLAFOND_SANS_CODE_MAX = 30   // € par jour, bracelet sans code
const ACHAT_SANS_CODE_MAX = 10     // € par achat, bracelet sans code (appliqué à la borne)
const PLAFOND_MAX = 200            // € par jour, bracelet avec code (plafond facultatif)

/**
 * Réglages d'un bracelet saisis par le titulaire → { reglages } ou { erreur }.
 * avant : réglages actuels (modification) ; parGuichet : le guichet peut décocher « mineur ».
 * avecCode : le bracelet aura (ou garde) un code.
 */
function reglagesBracelet(entree = {}, { avant = null, parGuichet = false, avecCode = true } = {}) {
  const prenom = String(entree.prenom ?? avant?.prenom ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)
  let mineur = entree.mineur === undefined ? !!avant?.mineur : entree.mineur === true
  if (avant?.mineur && !mineur && !parGuichet) return { erreur: "Seule la billetterie peut décocher « mineur », sur pièce d'identité." }
  if (!avecCode && !mineur) return { erreur: "Un bracelet sans code doit être celui d'un mineur." }
  const brut = entree.plafondJour === undefined ? avant?.plafondJour : entree.plafondJour
  let plafondJour = null
  if (brut !== null && brut !== undefined && brut !== '') {
    const n = Number(brut)
    if (!Number.isFinite(n) || n <= 0 || Math.round(n * 100) !== n * 100) return { erreur: 'Plafond par jour : un montant en euros.' }
    plafondJour = n
  }
  if (!avecCode) {
    if (!plafondJour) return { erreur: 'Sans code, le plafond par jour est obligatoire.' }
    if (plafondJour > PLAFOND_SANS_CODE_MAX) return { erreur: `Sans code, le plafond est de ${PLAFOND_SANS_CODE_MAX} € par jour au plus.` }
  } else if (plafondJour && plafondJour > PLAFOND_MAX) return { erreur: `Plafond de ${PLAFOND_MAX} € par jour au plus.` }
  return { reglages: { prenom, mineur, plafondJour } }
}

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
const vueBracelet = (b) => b ? {
  numero: b.numero, statut: b.statut, motif: b.bloqueMotif || null,
  prenom: b.prenom || '', mineur: !!b.mineur, avecCode: !!b.codeHash, plafondJour: b.plafondJour || null,
  relieMs: b.relieMs || null, bloqueMs: b.bloqueMs || null,
} : null

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

module.exports = {
  lireBracelet, erreurCode, empreinteCode, codeJuste, vueBracelet, numeroAffiche, nouveauxNumeros, reglagesBracelet,
  ESSAIS_MAX, ALPHABET, MAX_BRACELETS, PLAFOND_SANS_CODE_MAX, ACHAT_SANS_CODE_MAX, PLAFOND_MAX,
}
