/**
 * api/_auth/core.js — mots de passe, limite d'essais et session (sans Firebase, testé)
 *
 * Sécurité, lot 1 (décision de l'organisateur du 17/11/2026) :
 *  - les mots de passe ne sont plus jamais lus ni comparés dans le navigateur ;
 *  - ils sont gardés en empreinte forte (scrypt, sel aléatoire par compte) dans `motDePasseHash` ;
 *  - les anciens champs (`password`, `pwd` en clair, `passwordHash` SHA-256 à sel fixe)
 *    sont acceptés une dernière fois puis remplacés à la connexion réussie ;
 *  - les connexions ratées sont comptées : au-delà de 8 en 15 minutes, l'identifiant
 *    (et l'adresse réseau) sont bloqués 15 minutes.
 */
const crypto = require('crypto')

const SCRYPT = { N: 16384, r: 8, p: 1, len: 64 }
const LEGACY_SALT = 'yllacash-salt-2025'
const MIN_LENGTH = 6

function hashPassword(plain) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(String(plain), salt, SCRYPT.len, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p })
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${hash.toString('hex')}`
}

const sameBytes = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b)
const sameText = (a, b) => sameBytes(
  crypto.createHash('sha256').update(String(a)).digest(),
  crypto.createHash('sha256').update(String(b)).digest(),
)

function verifyScrypt(plain, stored) {
  const parts = String(stored).split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, N, r, p, saltHex, hashHex] = parts
  const expected = Buffer.from(hashHex, 'hex')
  const got = crypto.scryptSync(String(plain), Buffer.from(saltHex, 'hex'), expected.length, { N: +N, r: +r, p: +p })
  return sameBytes(got, expected)
}

const legacyHash = (plain) => crypto.createHash('sha256').update(String(plain) + LEGACY_SALT).digest('hex')

/**
 * Vérifie un mot de passe contre une fiche. Renvoie { ok, upgrade } :
 * upgrade = true quand la fiche porte encore un ancien format à remplacer.
 */
function checkPassword(data, plain) {
  if (!plain) return { ok: false, upgrade: false }
  if (data.motDePasseHash) return { ok: verifyScrypt(plain, data.motDePasseHash), upgrade: false }
  const clear = data.password || data.pwd
  if (clear && sameText(clear, plain)) return { ok: true, upgrade: true }
  if (data.passwordHash && sameText(data.passwordHash, legacyHash(plain))) return { ok: true, upgrade: true }
  return { ok: false, upgrade: false }
}

const hasPassword = (data) => !!(data.motDePasseHash || data.password || data.pwd || data.passwordHash)

/** Champs à écrire pour enregistrer un mot de passe ; DELETE est la valeur « supprimer le champ » de l'appelant */
function passwordFields(plain, DELETE) {
  return { motDePasseHash: hashPassword(plain), password: DELETE, pwd: DELETE, passwordHash: DELETE }
}

function validateNewPassword(plain) {
  const p = String(plain || '')
  if (p.length < MIN_LENGTH) return `Le mot de passe doit faire au moins ${MIN_LENGTH} caractères.`
  if (p.length > 200) return 'Le mot de passe est trop long.'
  return null
}

// ── Rôle d'équipe d'un bénévole (écran 10, 23/11/2026) ──────────────────────
// Un bénévole peut recevoir un rôle (onglet de son espace) ; seul un admin le donne, par le serveur.
const ROLES_EQUIPE_BENEVOLE = ['billetterie', 'controle_entree', 'consultation']
const ROLE_MIN_LENGTH = 8
const SUITES_FACILES = /(0123|1234|2345|3456|4567|5678|6789|azerty|qwerty|password|motdepasse|festival|ylla)/

/**
 * Mot de passe d'un bénévole qui a un rôle : 8 caractères au moins, sans son nom, son prénom, son
 * identifiant ni une suite facile (le mot de passe de départ « identifiant123 » est refusé).
 */
function validateRolePassword(plain, fiche = {}) {
  const base = validateNewPassword(plain)
  if (base) return base
  const p = String(plain)
  if (p.length < ROLE_MIN_LENGTH) return `Pour un rôle d'équipe, le mot de passe doit faire au moins ${ROLE_MIN_LENGTH} caractères.`
  const low = p.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const mots = [fiche.username, fiche.prenom, fiche.nom]
    .flatMap(x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/))
    .filter(x => x.length >= 3)
  if (mots.some(m => low.includes(m)) || SUITES_FACILES.test(low) || /^(.)\1+$/.test(p)) {
    return 'Mot de passe trop facile à deviner : évitez le nom, l\'identifiant et les suites simples.'
  }
  return null
}

/** Identifiant à partir du prénom et du nom : « awa.diallo » (sans accents ni espaces) */
function identifiantDe(prenom, nom) {
  const net = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '')
  return [net(prenom), net(nom)].filter(Boolean).join('.') || 'benevole'
}

// ── Limite des essais de connexion ──────────────────────────────────────────
const MIN = 60 * 1000
const LIMIT = { fails: 8, windowMs: 15 * MIN, blockMs: 15 * MIN }

// Pages publiques (code d'un compte, lien personnel) : plus d'essais permis, blocage plus long
const PUBLIC_LIMIT = { fails: 15, windowMs: 15 * MIN, blockMs: 30 * MIN }

/** Le compteur bloque-t-il une nouvelle tentative ? Renvoie le nombre de minutes restantes, ou 0. */
function blockedMinutes(rec, nowMs) {
  if (!rec || !rec.bloqueJusquaMs || rec.bloqueJusquaMs <= nowMs) return 0
  return Math.ceil((rec.bloqueJusquaMs - nowMs) / MIN)
}

/** Nouveau compteur après un échec */
function afterFailure(rec, nowMs, limit = LIMIT) {
  const fresh = !rec || typeof rec.debutMs !== 'number' || nowMs - rec.debutMs > limit.windowMs
  const echecs = fresh ? 1 : (rec.echecs || 0) + 1
  const debutMs = fresh ? nowMs : rec.debutMs
  return { echecs, debutMs, bloqueJusquaMs: echecs >= limit.fails ? nowMs + limit.blockMs : 0 }
}

/** Clé de compteur : on ne garde jamais l'adresse réseau ni l'identifiant en clair */
const counterKey = (kind, value) => `${kind}-${crypto.createHash('sha256').update(String(value || '').toLowerCase()).digest('hex').slice(0, 40)}`

// ── Session ──────────────────────────────────────────────────────────────────
/**
 * account : { kind: 'staff'|'benevole', id, eventId, data }
 * Identifiant Firebase stable et claims lus par les futures règles de la base.
 */
/**
 * Refonte des rôles (23/11/2026, accord de l'organisateur) : le rôle « stand » n'existe plus ; les
 * fiches de l'équipe qui l'ont encore (ou n'ont pas de rôle, ce qui valait « stand ») sont
 * désactivées, pas supprimées : l'historique des ventes reste. Renvoie le message à afficher, ou ''.
 */
const ROLES_RETIRES = ['stand']
function compteDesactive(account) {
  if (!account || account.kind !== 'staff') return ''
  const role = (account.data && account.data.role) || 'stand'
  return ROLES_RETIRES.includes(role)
    ? 'Ce compte est désactivé : le rôle « Stand » n\'existe plus. Demandez un autre rôle à l\'organisation.'
    : ''
}

function sessionFor(account) {
  const { kind, id, eventId, data } = account
  const role = kind === 'benevole' ? 'benevole' : (data.role || 'stand')
  const scope = eventId ? `${eventId}:` : ''
  const uid = `${kind}:${scope}${id}`.slice(0, 128)
  const eventIds = Array.isArray(data.eventIds) && data.eventIds.length ? data.eventIds.slice(0, 20) : (data.eventId || eventId ? [data.eventId || eventId] : [])
  const claims = { yc: 1, type: kind, role, eventIds, fiche: account.path }
  // Écran 13 (24/11/2026) : le porte-monnaie du bénévole est un compte de type spectateur ; sa session
  // le désigne comme celle d'un spectateur (recharge en ligne, codes, remboursement, don)
  const pm = kind === 'benevole' && data.porteMonnaie
  if (pm && pm.id && pm.docId) Object.assign(claims, { specId: String(pm.id), specDoc: String(pm.docId) })
  return { uid, claims }
}

// ── Sessions des pages publiques (lot 2) ────────────────────────────────────
const KEY = /^[0-9a-f]{20,64}$/
const isKey = (v) => KEY.test(String(v || ''))
/** Comparaison de clés sans fuite par le temps de réponse */
const sameKey = (a, b) => isKey(a) && isKey(b) && sameText(a, b)
const newKey = () => crypto.randomBytes(16).toString('hex')

/** Clé attendue pour ouvrir un compte spectateur : celle du billet, sinon celle du compte créé sur place */
const accountKey = (spec) => (spec && (spec.billet && spec.billet.cle)) || (spec && spec.cle) || ''

function spectatorSession(eventId, docId, spec) {
  return {
    uid: `spectateur:${eventId}:${docId}`.slice(0, 128),
    claims: { yc: 1, type: 'spectateur', role: 'spectateur', eventIds: [eventId], specId: spec.id, specDoc: docId },
  }
}

/** Liens personnels et appareils : bénévole et artiste (id = fiche ou créneau), borne et écran (un par événement) */
const LINK_KINDS = ['benevole', 'artiste', 'borne', 'ecran']
const linkDocId = (kind, id) => (kind === 'borne' || kind === 'ecran') ? kind : `${kind}-${id}`

function deviceSession(kind, eventId, id) {
  const claims = { yc: 1, type: kind, role: kind, eventIds: [eventId] }
  if (kind === 'artiste') claims.creneauId = id
  return { uid: `${kind}:${eventId}${kind === 'artiste' ? ':' + id : ''}`.slice(0, 128), claims }
}

/** Ce que le navigateur reçoit de la fiche : jamais de mot de passe ni d'empreinte */
function publicAccount(account) {
  const d = { ...account.data }
  for (const k of ['password', 'pwd', 'passwordHash', 'motDePasseHash', 'fcmTokens']) delete d[k]
  return { ...d, id: account.id, kind: account.kind, eventId: d.eventId || account.eventId || null, path: account.path }
}

module.exports = {
  hashPassword, checkPassword, hasPassword, passwordFields, validateNewPassword, legacyHash,
  ROLES_EQUIPE_BENEVOLE, validateRolePassword, identifiantDe,
  blockedMinutes, afterFailure, counterKey, sessionFor, compteDesactive, ROLES_RETIRES, publicAccount, LIMIT, PUBLIC_LIMIT,
  isKey, sameKey, newKey, accountKey, spectatorSession, LINK_KINDS, linkDocId, deviceSession,
}
