/**
 * api/connexion.js — Vercel Serverless Function : connexion de l'équipe et des bénévoles
 *
 * Le mot de passe est vérifié ici, jamais dans le navigateur. En cas de succès, la fonction
 * renvoie un jeton Firebase (custom token) portant le rôle ; l'appli ouvre avec lui une
 * session Firebase (signInWithCustomToken), qui servira aux règles de la base (lot 3).
 *
 * POST /api/connexion
 *   { mode: 'motdepasse', identifiant, motDePasse }
 *   { mode: 'microsoft', idToken }      jeton Firebase obtenu après la connexion Microsoft
 *   { mode: 'reinitialisation', identifiant }   demande de nouveau mot de passe (toujours « ok »)
 * Réponse : { token, compte } ; 401 identifiants incorrects ; 429 trop d'essais.
 *
 * REQUIS : FIREBASE_SERVICE_ACCOUNT (déjà en place), et l'authentification Firebase activée
 * (elle l'est déjà pour Microsoft).
 */
const { checkPassword, hasPassword, passwordFields, blockedMinutes, afterFailure, counterKey, sessionFor, compteDesactive, publicAccount } = require('../_auth/core')
const { admin, getDb, findAccountByIdentifiant, findAccountByEmail, linkedBenevole, clientIp, writeAudit } = require('../_auth/server')
const { readBody } = require('../_billets/admin')

const BAD = 'Identifiant ou mot de passe incorrect.'

async function openSession(db, account, method) {
  const { uid, claims } = sessionFor(account)
  const token = await admin.auth().createCustomToken(uid, claims)
  const link = await linkedBenevole(db, account).catch(() => null)
  const nom = account.data.prenom ? `${account.data.prenom} ${account.data.nom || ''}`.trim() : (account.data.nom || '')
  await writeAudit(db, account.data.eventId || account.eventId, {
    action: 'CONNEXION', staff: nom, role: claims.role, userType: account.kind === 'benevole' ? 'benevole' : 'staff', methode: method,
    label: `Connexion de ${nom} (${claims.role})${method === 'microsoft' ? ' avec Microsoft' : ''}`,
  })
  return { token, compte: { ...publicAccount(account), ...(link || {}) } }
}

async function counters(db, keys) {
  const refs = keys.map(k => db.collection('securite-connexions').doc(k))
  const snaps = await Promise.all(refs.map(r => r.get()))
  return snaps.map((s, i) => ({ ref: refs[i], rec: s.exists ? s.data() : null }))
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST attendu.' }); return }
  let body
  try { body = (await readBody(req)) || {} } catch { res.status(400).json({ error: 'Requête illisible.' }); return }
  let db
  try { db = getDb() } catch (e) { res.status(503).json({ error: 'Connexion indisponible : le serveur n\'est pas configuré.' }); return }

  try {
    if (body.mode === 'motdepasse') {
      const ident = String(body.identifiant || '').toLowerCase().trim().slice(0, 120)
      const plain = String(body.motDePasse || '').slice(0, 200)
      if (!ident || !plain) { res.status(400).json({ error: 'Identifiant et mot de passe requis.' }); return }

      const now = Date.now()
      const cs = await counters(db, [counterKey('id', ident), counterKey('ip', clientIp(req))])
      const wait = Math.max(...cs.map(c => blockedMinutes(c.rec, now)))
      if (wait) { res.status(429).json({ error: `Trop d'essais. Réessayez dans ${wait} minute${wait > 1 ? 's' : ''}.` }); return }

      const account = await findAccountByIdentifiant(db, ident)
      const check = account && hasPassword(account.data) ? checkPassword(account.data, plain) : { ok: false }
      if (!check.ok) {
        await Promise.all(cs.map(c => c.ref.set({ ...afterFailure(c.rec, now), majLe: admin.firestore.FieldValue.serverTimestamp() })))
        if (account && !hasPassword(account.data)) { res.status(401).json({ error: 'Aucun mot de passe défini pour ce compte. Contactez l\'administrateur.' }); return }
        res.status(401).json({ error: BAD }); return
      }
      // Ancien format (en clair ou empreinte faible) : remplacé par une empreinte forte
      if (check.upgrade) {
        await db.doc(account.path).update(passwordFields(plain, admin.firestore.FieldValue.delete()))
      }
      await Promise.all(cs.map(c => c.ref.delete().catch(() => {})))
      // Refonte des rôles (23/11/2026) : fiche au rôle retiré (Stand) = compte désactivé
      const desactive = compteDesactive(account)
      if (desactive) { res.status(403).json({ error: desactive }); return }
      res.status(200).json(await openSession(db, account, 'motdepasse')); return
    }

    if (body.mode === 'microsoft') {
      let t
      try { t = await admin.auth().verifyIdToken(String(body.idToken || '')) }
      catch { res.status(401).json({ error: 'Connexion Microsoft expirée, recommencez.' }); return }
      if (t.firebase?.sign_in_provider !== 'microsoft.com') { res.status(401).json({ error: 'Connexion Microsoft attendue.' }); return }
      // L'annuaire Microsoft est déjà imposé à la connexion (paramètre tenant) ; ici, seule une
      // adresse e-mail présente sur une fiche YllaCash ouvre un accès, avec le rôle de cette fiche.
      const email = String(t.email || '').toLowerCase()
      const account = email ? await findAccountByEmail(db, email) : null
      if (!account) {
        await writeAudit(db, null, { action: 'CONNEXION_MICROSOFT_REFUSEE', email, userType: 'inconnu', label: `Connexion Microsoft refusée : ${email || 'adresse inconnue'} n'a pas de fiche` })
        res.status(403).json({ error: `Le compte ${email || 'Microsoft'} n'est relié à aucun accès YllaCash. Demandez à un administrateur d'indiquer cette adresse dans votre fiche.` }); return
      }
      // La session Microsoft n'est plus utile : le jeton YllaCash la remplace
      admin.auth().revokeRefreshTokens(t.uid).catch(() => {})
      const desactive = compteDesactive(account)
      if (desactive) { res.status(403).json({ error: desactive }); return }
      res.status(200).json(await openSession(db, account, 'microsoft')); return
    }

    if (body.mode === 'reinitialisation') {
      const ident = String(body.identifiant || '').toLowerCase().trim().slice(0, 120)
      if (!ident) { res.status(400).json({ error: 'Identifiant requis.' }); return }
      const account = await findAccountByIdentifiant(db, ident).catch(() => null)
      const info = account && account.kind === 'staff' ? {
        staffId: account.id, eventId: account.eventId, staffRole: account.data.role || null, staffEmail: account.data.email || '',
        staffNom: account.data.prenom ? `${account.data.prenom} ${account.data.nom}` : (account.data.nom || ''),
      } : {}
      await db.collection('password-reset-requests').add({ identifier: ident, status: 'pending', createdAt: admin.firestore.FieldValue.serverTimestamp(), ...info })
      // Toujours la même réponse : on ne révèle pas si le compte existe
      res.status(200).json({ ok: true }); return
    }

    res.status(400).json({ error: 'Mode de connexion inconnu.' })
  } catch (e) {
    console.error('connexion:', e)
    res.status(500).json({ error: 'Connexion impossible pour le moment, réessayez.' })
  }
}
