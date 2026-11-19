/**
 * api/mot-de-passe.js — Vercel Serverless Function : mots de passe de l'équipe et des bénévoles
 *
 * Le navigateur n'écrit plus jamais de mot de passe dans la base : tout passe ici, avec la
 * session de la personne connectée (Authorization: Bearer <jeton Firebase>).
 *
 * POST /api/mot-de-passe
 *   { mode: 'changer', nouveau, ancien? }     son propre mot de passe (ancien vérifié s'il est fourni)
 *   { mode: 'verifier', motDePasse }          revérifie son mot de passe (actions sensibles)
 *   { mode: 'definir', cible, nouveau }       un administrateur fixe le mot de passe d'une fiche
 *                                             cible = 'staff/<id>' | 'events/<ev>/staff/<id>' | 'events/<ev>/benevoles/<id>'
 */
const { checkPassword, passwordFields, validateNewPassword, blockedMinutes, afterFailure, counterKey } = require('../_auth/core')
const { admin, getDb, requireCaller, loadAccount, canManage, writeAudit, ADMIN_ROLES } = require('../_auth/server')
const { readBody } = require('../_billets/admin')

const nomDe = (d) => (d.prenom ? `${d.prenom} ${d.nom || ''}`.trim() : (d.nom || ''))

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST attendu.' }); return }
  let body
  try { body = (await readBody(req)) || {} } catch { res.status(400).json({ error: 'Requête illisible.' }); return }
  const caller = await requireCaller(req, res, { roles: ['equipe', 'benevole'] })
  if (!caller) return
  const db = getDb()
  const DELETE = admin.firestore.FieldValue.delete()

  try {
    if (body.mode === 'changer' || body.mode === 'verifier') {
      const self = await loadAccount(db, caller.fiche)
      if (!self) { res.status(404).json({ error: 'Votre fiche est introuvable.' }); return }
      const ref = db.collection('securite-connexions').doc(counterKey('verif', caller.uid))
      const rec = (await ref.get()).data()
      const wait = blockedMinutes(rec, Date.now())
      if (wait) { res.status(429).json({ error: `Trop d'essais. Réessayez dans ${wait} minute${wait > 1 ? 's' : ''}.` }); return }

      const toCheck = body.mode === 'verifier' ? body.motDePasse : body.ancien
      if (toCheck !== undefined) {
        if (!checkPassword(self.data, String(toCheck)).ok) {
          await ref.set(afterFailure(rec, Date.now()))
          res.status(body.mode === 'verifier' ? 200 : 401).json(body.mode === 'verifier' ? { ok: false } : { error: 'Mot de passe actuel incorrect.' })
          return
        }
        await ref.delete().catch(() => {})
      }
      if (body.mode === 'verifier') { res.status(200).json({ ok: true }); return }

      const invalid = validateNewPassword(body.nouveau)
      if (invalid) { res.status(400).json({ error: invalid }); return }
      await db.doc(self.path).update(passwordFields(body.nouveau, DELETE))
      await writeAudit(db, self.eventId || self.data.eventId, {
        action: self.kind === 'benevole' ? 'CHANGEMENT_PWD_BENEV' : 'RESET_PWD_SELF', staff: nomDe(self.data),
        userType: self.kind === 'benevole' ? 'benevole' : 'staff', label: `${nomDe(self.data)} a changé son mot de passe`,
      })
      res.status(200).json({ ok: true }); return
    }

    if (body.mode === 'definir') {
      const target = await loadAccount(db, body.cible)
      if (!target) { res.status(404).json({ error: 'Fiche introuvable.' }); return }
      const page = target.kind === 'benevole' ? 'benevoles' : 'staff'
      if (!(await canManage(db, caller, page))) { res.status(403).json({ error: 'Ce compte n\'a pas les droits pour cette action.' }); return }
      // Un rôle non administrateur n'agit que sur ses propres événements
      const ev = target.eventId
      if (ev && !ADMIN_ROLES.includes(caller.role) && !(caller.eventIds || []).includes(ev)) {
        res.status(403).json({ error: 'Cette fiche appartient à un autre événement.' }); return
      }
      const invalid = validateNewPassword(body.nouveau)
      if (invalid) { res.status(400).json({ error: invalid }); return }
      await db.doc(target.path).update(passwordFields(body.nouveau, DELETE))
      await writeAudit(db, ev || target.data.eventId, {
        action: target.kind === 'benevole' ? 'RESET_PWD_BENEV' : 'RESET_PWD_STAFF', targetId: target.id, staff: caller.uid,
        userType: 'admin', label: `Nouveau mot de passe pour ${nomDe(target.data)}`,
      })
      res.status(200).json({ ok: true }); return
    }

    res.status(400).json({ error: 'Mode inconnu.' })
  } catch (e) {
    console.error('mot-de-passe:', e)
    res.status(500).json({ error: 'Le mot de passe n\'a pas pu être enregistré, réessayez.' })
  }
}
