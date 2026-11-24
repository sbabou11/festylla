/**
 * api/_auth/server.js — accès Firebase Admin pour la connexion et la vérification des appels
 *
 * - findAccountByIdentifiant / findAccountsByEmail : mêmes fiches et même ordre de recherche
 *   que l'ancienne connexion du navigateur (staff racine, puis staff et bénévoles de chaque événement)
 * - verifyCaller(req)  : vérifie le jeton de session envoyé par l'appli (Authorization: Bearer <idToken>)
 * - requireCaller(...) : idem, et répond 401/403 à la place de la fonction appelante
 */
const { admin, getDb } = require('../_billets/admin')
const { roleActif, exceptionActive } = require('./role')

const asAccount = (kind, eventId, d) => ({
  kind, id: d.id, eventId, data: d.data(),
  path: eventId ? `events/${eventId}/${kind === 'benevole' ? 'benevoles' : 'staff'}/${d.id}` : `staff/${d.id}`,
})

async function firstMatch(col, field, value) {
  const s = await col.where(field, '==', value).limit(1).get()
  return s.empty ? null : s.docs[0]
}

async function findAccountByIdentifiant(db, ident) {
  const id = String(ident || '').toLowerCase().trim()
  if (!id) return null
  const root = db.collection('staff')
  let d = await firstMatch(root, 'username', id) || await firstMatch(root, 'email', id)
  if (d) return asAccount('staff', null, d)
  const events = await db.collection('events').get()
  for (const ev of events.docs) {
    const staff = ev.ref.collection('staff')
    d = await firstMatch(staff, 'username', id) || await firstMatch(staff, 'email', id)
    if (d) return asAccount('staff', ev.id, d)
    d = await firstMatch(ev.ref.collection('benevoles'), 'username', id)
    if (d) return asAccount('benevole', ev.id, d)
  }
  return null
}

/** Fiche portant cette adresse e-mail (connexion Microsoft) : le staff d'abord, puis les bénévoles */
async function findAccountByEmail(db, email) {
  const e = String(email || '').toLowerCase().trim()
  if (!e) return null
  let d = await firstMatch(db.collection('staff'), 'email', e)
  if (d) return asAccount('staff', null, d)
  const events = await db.collection('events').get()
  for (const ev of events.docs) {
    d = await firstMatch(ev.ref.collection('staff'), 'email', e)
    if (d) return asAccount('staff', ev.id, d)
  }
  for (const ev of events.docs) {
    d = await firstMatch(ev.ref.collection('benevoles'), 'email', e)
    if (d) return asAccount('benevole', ev.id, d)
  }
  return null
}

/** Profil bénévole lié à un membre de l'équipe (même identifiant, même événement) */
async function linkedBenevole(db, account) {
  const uname = account.data.username
  const ev = account.data.eventId || account.eventId
  if (account.kind !== 'staff' || !uname || !ev) return null
  const d = await firstMatch(db.collection('events').doc(ev).collection('benevoles'), 'username', uname)
  return d ? { benevoleDocId: d.id, benevoleEventId: ev } : null
}

async function loadAccount(db, path) {
  const m = /^(?:events\/([\w-]+)\/)?(staff|benevoles)\/([\w-]+)$/.exec(String(path || ''))
  if (!m) return null
  const snap = await db.doc(path).get()
  if (!snap.exists) return null
  return { kind: m[2] === 'benevoles' ? 'benevole' : 'staff', id: m[3], eventId: m[1] || null, data: snap.data(), path }
}

/**
 * Jeton de la personne qui appelle. Écran 11 (24/11/2026) : un bénévole dont l'onglet de rôle est
 * ouvert (jusqu'à roleJusqua, heure du serveur) agit comme un membre de l'équipe de ce rôle ;
 * { brut: true } rend le jeton tel quel (ouverture et fermeture de l'onglet).
 */
async function verifyCaller(req, { brut = false } = {}) {
  const m = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '').trim())
  if (!m) return null
  getDb()
  try {
    const t = await admin.auth().verifyIdToken(m[1].trim())
    if (!t.yc) return null
    if (!brut && roleActif(t)) {
      // Écran 12 : une ouverture exceptionnelle annulée par un admin ne donne plus rien, tout de suite
      if (t.roleExc) {
        const fiche = await loadAccount(getDb(), t.fiche).catch(() => null)
        if (!exceptionActive(fiche?.data, Date.now())) return t
      }
      return { ...t, type: 'staff', role: t.roleEquipe, roleBenevole: true }
    }
    return t
  } catch { return null }
}

const ADMIN_ROLES = ['admin', 'super_admin']

/**
 * Vérifie l'appelant. options.roles : rôles admis ('equipe' = tout membre de l'équipe,
 * 'benevole' = bénévole, ou noms de rôles). Renvoie le jeton décodé, ou null après avoir répondu.
 */
async function requireCaller(req, res, { roles = ['equipe'] } = {}) {
  const t = await verifyCaller(req)
  if (!t) { res.status(401).json({ error: 'Session expirée : reconnectez-vous.' }); return null }
  const ok = roles.some(r => (r === 'equipe' && t.type === 'staff') || (r === 'benevole' && t.type === 'benevole') || r === t.role)
  if (!ok) { res.status(403).json({ error: 'Ce compte n\'a pas les droits pour cette action.' }); return null }
  return t
}

/** Rôle admin, ou rôle personnalisé qui donne accès à la page voulue (« staff », « benevoles »…) */
async function canManage(db, caller, page) {
  if (ADMIN_ROLES.includes(caller.role)) return true
  if (caller.type !== 'staff') return false
  try {
    const r = await db.collection('roles').doc(caller.role).get()
    return r.exists && (r.data().pages || []).includes(page)
  } catch { return false }
}

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim()

async function writeAudit(db, eventId, entry) {
  try {
    const col = eventId ? db.collection('events').doc(eventId).collection('audit') : db.collection('audit')
    const now = new Date()
    await col.add({ ...entry, date: now.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }), timestamp: now.toISOString(), createdAt: admin.firestore.FieldValue.serverTimestamp() })
  } catch (e) { console.warn('audit', e.message) }
}

module.exports = {
  admin, getDb, findAccountByIdentifiant, findAccountByEmail, linkedBenevole, loadAccount,
  verifyCaller, requireCaller, canManage, clientIp, writeAudit, ADMIN_ROLES,
}
