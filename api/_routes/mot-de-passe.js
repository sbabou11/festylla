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
const { checkPassword, passwordFields, validateNewPassword, validateRolePassword, identifiantDe, ROLES_EQUIPE_BENEVOLE, blockedMinutes, afterFailure, counterKey } = require('../_auth/core')
const { admin, getDb, requireCaller, loadAccount, canManage, writeAudit, ADMIN_ROLES } = require('../_auth/server')
const { readBody } = require('../_billets/admin')
const { EXCEPTION_MINUTES } = require('../_auth/role')

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

      // Écran 10 : un bénévole qui a un rôle d'équipe garde un mot de passe solide
      const invalid = self.kind === 'benevole' && self.data.roleEquipe
        ? validateRolePassword(body.nouveau, self.data) : validateNewPassword(body.nouveau)
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
      // Écran 10 : le mot de passe d'un bénévole qui a un rôle d'équipe ne se change que par un admin,
      // et reste solide (sinon un rôle « Bénévoles » pourrait prendre la billetterie de quelqu'un)
      const aUnRole = target.kind === 'benevole' && !!target.data.roleEquipe
      if (aUnRole && !ADMIN_ROLES.includes(caller.role)) {
        res.status(403).json({ error: 'Ce bénévole a un rôle d\'équipe : seul un admin change son mot de passe.' }); return
      }
      const invalid = aUnRole ? validateRolePassword(body.nouveau, target.data) : validateNewPassword(body.nouveau)
      if (invalid) { res.status(400).json({ error: invalid }); return }
      await db.doc(target.path).update(passwordFields(body.nouveau, DELETE))
      await writeAudit(db, ev || target.data.eventId, {
        action: target.kind === 'benevole' ? 'RESET_PWD_BENEV' : 'RESET_PWD_STAFF', targetId: target.id, staff: caller.uid,
        userType: 'admin', label: `Nouveau mot de passe pour ${nomDe(target.data)}`,
      })
      res.status(200).json({ ok: true }); return
    }

    // Écran 10 (23/11/2026) : un admin donne (ou retire) un rôle d'équipe à un bénévole.
    // { mode: 'role-benevole', cible: 'events/<ev>/benevoles/<id>', role: '' | 'billetterie' | …, nouveau? }
    // Donner un rôle exige un nouveau mot de passe solide ; le rôle n'est jamais écrit par le navigateur.
    if (body.mode === 'role-benevole') {
      if (!ADMIN_ROLES.includes(caller.role)) { res.status(403).json({ error: 'Seul un admin donne un rôle d\'équipe.' }); return }
      const target = await loadAccount(db, body.cible)
      if (!target || target.kind !== 'benevole' || !target.eventId) { res.status(404).json({ error: 'Fiche bénévole introuvable.' }); return }
      const role = String(body.role || '')
      if (role && !ROLES_EQUIPE_BENEVOLE.includes(role)) { res.status(400).json({ error: 'Rôle inconnu.' }); return }
      const ev = target.eventId
      const evRef = db.collection('events').doc(ev)
      const nom = nomDe(target.data)
      const changes = {}
      let username = target.data.username || ''
      if (role) {
        // Fiche sans identifiant (Event Manager) : on en crée un, libre parmi les bénévoles de l'événement
        if (!username) {
          const base = identifiantDe(target.data.prenom, target.data.nom)
          for (let i = 0; i < 50; i++) {
            const essai = i ? `${base}${i + 1}` : base
            // Libre aussi parmi l'équipe : à la connexion, un compte équipe passe avant un bénévole
            const cols = [evRef.collection('benevoles'), evRef.collection('staff'), db.collection('staff')]
            const pris = await Promise.all(cols.map(c => c.where('username', '==', essai).limit(1).get()))
            if (pris.every(p => p.empty)) { username = essai; break }
          }
          if (!username) { res.status(409).json({ error: 'Aucun identifiant libre trouvé.' }); return }
          changes.username = username
        }
        if (body.nouveau === undefined && target.data.roleEquipe !== role) {
          res.status(400).json({ error: 'Donner un rôle exige un nouveau mot de passe.' }); return
        }
        if (body.nouveau !== undefined) {
          const invalid = validateRolePassword(body.nouveau, { ...target.data, username })
          if (invalid) { res.status(400).json({ error: invalid }); return }
          Object.assign(changes, passwordFields(body.nouveau, DELETE))
        }
        Object.assign(changes, { roleEquipe: role, roleEquipeLe: new Date().toISOString(), roleEquipePar: caller.uid })
      } else {
        Object.assign(changes, { roleEquipe: DELETE, roleException: DELETE, roleEquipeLe: new Date().toISOString(), roleEquipePar: caller.uid })
      }
      await db.doc(target.path).update(changes)
      await writeAudit(db, ev, {
        action: role ? 'ROLE_BENEVOLE_DONNE' : 'ROLE_BENEVOLE_RETIRE', targetId: target.id, benevoleId: target.id, staff: caller.uid, userType: 'admin',
        label: role ? `Rôle d'équipe « ${role} » donné à ${nom}${body.nouveau !== undefined ? ' (nouveau mot de passe)' : ''}` : `Rôle d'équipe retiré à ${nom}`,
      })
      res.status(200).json({ ok: true, username }); return
    }

    // Écran 12 (24/11/2026) : ouverture exceptionnelle de l'onglet de rôle par un admin, hors créneau.
    // { mode: 'role-exception', cible, minutes: 30|60|120|240, motif } ; { mode: 'role-exception-annuler', cible }
    // Le bénévole déverrouille ensuite avec son propre mot de passe ; l'annulation coupe l'accès aussitôt.
    if (body.mode === 'role-exception' || body.mode === 'role-exception-annuler') {
      if (!ADMIN_ROLES.includes(caller.role)) { res.status(403).json({ error: 'Réservé aux admins.' }); return }
      const target = await loadAccount(db, body.cible)
      if (!target || target.kind !== 'benevole' || !target.eventId) { res.status(404).json({ error: 'Fiche bénévole introuvable.' }); return }
      const ev = target.eventId
      const nom = nomDe(target.data)
      const moi = caller.fiche ? await loadAccount(db, caller.fiche).catch(() => null) : null
      const parNom = moi ? nomDe(moi.data) : 'un admin'
      if (body.mode === 'role-exception-annuler') {
        await db.doc(target.path).update({ roleException: DELETE })
        await writeAudit(db, ev, { action: 'ROLE_EXCEPTION_ANNULEE', targetId: target.id, benevoleId: target.id, staff: caller.uid, userType: 'admin', label: `Ouverture exceptionnelle annulée pour ${nom} par ${parNom}` })
        res.status(200).json({ ok: true }); return
      }
      if (!target.data.roleEquipe) { res.status(400).json({ error: 'Ce bénévole n\'a pas de rôle d\'équipe.' }); return }
      const minutes = Number(body.minutes)
      if (!EXCEPTION_MINUTES.includes(minutes)) { res.status(400).json({ error: 'Durée à choisir : 30 min, 1 h, 2 h ou 4 h.' }); return }
      const motif = String(body.motif || '').trim().slice(0, 200)
      if (motif.length < 5) { res.status(400).json({ error: 'Indiquez le motif (quelques mots).' }); return }
      const now = Date.now()
      const jusqua = now + minutes * 60000
      await db.doc(target.path).update({ roleException: { jusqua, le: now, par: caller.uid, parNom, motif } })
      const a = new Date(jusqua).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })
      await writeAudit(db, ev, {
        action: 'ROLE_EXCEPTION_OUVERTE', targetId: target.id, benevoleId: target.id, staff: caller.uid, userType: 'admin',
        label: `Ouverture exceptionnelle de l'onglet « ${target.data.roleEquipe} » pour ${nom} jusqu'à ${a}, par ${parNom} (motif : ${motif})`,
      })
      res.status(200).json({ ok: true, jusqua }); return
    }

    res.status(400).json({ error: 'Mode inconnu.' })
  } catch (e) {
    console.error('mot-de-passe:', e)
    res.status(500).json({ error: 'Le mot de passe n\'a pas pu être enregistré, réessayez.' })
  }
}
