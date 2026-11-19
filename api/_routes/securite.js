/**
 * api/securite.js — Vercel Serverless Function : réglages de sécurité (administrateurs)
 *
 * POST /api/securite   (session d'un administrateur)
 *   { mode: 'migrer-mots-de-passe' }   remplace tout de suite chaque mot de passe en clair (équipe et
 *                                      bénévoles, tous événements) par une empreinte forte, sans attendre
 *                                      la prochaine connexion de chacun ; renvoie les nombres traités
 *   { mode: 'fermer', ev }             active les règles strictes sur l'événement (securite: 'fermee')
 *   { mode: 'ouvrir', ev }             revient au mode ancien (en cas de problème le jour J)
 */
const { passwordFields } = require('../_auth/core')
const { admin, getDb, requireCaller, writeAudit } = require('../_auth/server')
const { readBody } = require('../_billets/admin')

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST attendu.' }); return }
  const caller = await requireCaller(req, res, { roles: ['admin', 'super_admin'] })
  if (!caller) return
  let body
  try { body = (await readBody(req)) || {} } catch { res.status(400).json({ error: 'Requête illisible.' }); return }
  const db = getDb()
  const DELETE = admin.firestore.FieldValue.delete()

  try {
    if (body.mode === 'migrer-mots-de-passe') {
      const cols = [db.collection('staff')]
      for (const ev of (await db.collection('events').get()).docs) {
        cols.push(ev.ref.collection('staff'), ev.ref.collection('benevoles'))
      }
      let converties = 0, dejaProteges = 0, anciennesEmpreintes = 0
      for (const col of cols) {
        for (const d of (await col.get()).docs) {
          const data = d.data()
          const clear = data.password || data.pwd
          if (clear) { await d.ref.update(passwordFields(String(clear), DELETE)); converties++ }
          else if (data.motDePasseHash) dejaProteges++
          else if (data.passwordHash) anciennesEmpreintes++   // remplacée à la prochaine connexion
        }
      }
      await writeAudit(db, null, { action: 'MIGRATION_MOTS_DE_PASSE', staff: caller.uid, userType: 'admin', label: `Mots de passe en clair convertis : ${converties}` })
      res.status(200).json({ ok: true, converties, dejaProteges, anciennesEmpreintes }); return
    }

    if (body.mode === 'fermer' || body.mode === 'ouvrir') {
      const ev = String(body.ev || '')
      if (!/^[\w-]{1,128}$/.test(ev)) { res.status(400).json({ error: 'Événement manquant.' }); return }
      const ref = db.collection('events').doc(ev)
      if (!(await ref.get()).exists) { res.status(404).json({ error: 'Événement introuvable.' }); return }
      await ref.update({ securite: body.mode === 'fermer' ? 'fermee' : DELETE })
      await writeAudit(db, ev, {
        action: body.mode === 'fermer' ? 'SECURITE_FERMEE' : 'SECURITE_OUVERTE', staff: caller.uid, userType: 'admin',
        label: body.mode === 'fermer' ? 'Règles strictes activées sur l\'événement' : 'Retour au mode ancien sur l\'événement',
      })
      res.status(200).json({ ok: true }); return
    }

    res.status(400).json({ error: 'Mode inconnu.' })
  } catch (e) {
    console.error('securite:', e)
    res.status(500).json({ error: 'Opération impossible pour le moment.' })
  }
}
