/**
 * api/liaisons.js — Vercel Serverless Function : clés de liaison d'un événement (administrateurs)
 *
 * Fenêtre « Liaisons » de la page Événements (maquette validée le 18/11/2026) :
 *  - clés des sites qui envoient des billets : une par site, nommée, renouvelable, supprimable ;
 *    la clé complète n'est renvoyée qu'une fois, à la création ou au renouvellement ;
 *  - clé Event Manager de l'événement, pour l'envoi des entrées (règle d'échange v1.3, §5).
 * Tout est rangé dans des collections racine que les règles réservent au serveur :
 *   liaisons/{identifiant de clé}  { ev, nom, empreinte, creeLe, derniereUtilisation, comptes }
 *   liaisons-em/{événement}        { cle, enregistreLe, dernierEnvoi…, lecture }
 *
 * POST /api/liaisons   (session d'un administrateur)
 *   { mode: 'lister', ev }
 *   { mode: 'creer', ev, nom }             → { cle } (affichée une seule fois)
 *   { mode: 'renouveler', ev, id }         → { cle } ; l'ancienne ne fonctionne plus
 *   { mode: 'supprimer', ev, id }
 *   { mode: 'em-enregistrer', ev, cle }
 *   { mode: 'em-retirer', ev }
 *   { mode: 'em-actualiser', ev }          → relit l'instantané d'Event Manager tout de suite
 * La même clé Event Manager sert à envoyer les entrées et à lire l'instantané (_em/lecture.js).
 */
const { newKey, cleanName, EV } = require('../_billets/cles')
const { admin, getDb, requireCaller, writeAudit } = require('../_auth/server')
const { readBody } = require('../_billets/admin')
const { refreshEvent } = require('../_em/lecture')

const iso = (t) => (t && t.toDate ? t.toDate().toISOString() : null)
const isoMs = (ms) => (typeof ms === 'number' ? new Date(ms).toISOString() : null)
const lectureView = (l) => (l ? {
  okLe: isoMs(l.okMs), essaiLe: isoMs(l.essaiMs), comptes: l.comptes || null,
  echec: l.echec ? { type: l.echec.type, format: !!l.echec.format, depuis: isoMs(l.echec.depuisMs), detail: l.echec.detail || '' } : null,
} : null)
// Retour des consommations et du bilan vers Event Manager (§7)
const retourView = (r) => (r ? {
  okLe: isoMs(r.okMs), finalLe: isoMs(r.finalMs), clotureLe: isoMs(r.clotureMs),
  echec: r.echec || null, echecDepuis: isoMs(r.echecDepuisMs),
} : null)

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST attendu.' }); return }
  const caller = await requireCaller(req, res, { roles: ['admin', 'super_admin'] })
  if (!caller) return
  let body
  try { body = (await readBody(req)) || {} } catch { res.status(400).json({ error: 'Requête illisible.' }); return }
  const ev = String(body.ev || '')
  if (!EV.test(ev)) { res.status(400).json({ error: 'Événement manquant.' }); return }
  const db = getDb()
  const now = admin.firestore.FieldValue.serverTimestamp()

  try {
    if (!(await db.collection('events').doc(ev).get()).exists) { res.status(404).json({ error: 'Événement introuvable.' }); return }
    const keys = db.collection('liaisons')
    const mine = async (id) => {
      const s = await keys.doc(String(id || '')).get()
      return s.exists && s.data().ev === ev && !s.data().supprimee ? s : null
    }

    if (body.mode === 'lister') {
      const list = await keys.where('ev', '==', ev).get()
      const em = await db.collection('liaisons-em').doc(ev).get()
      const e = em.exists ? em.data() : null
      res.status(200).json({
        cles: list.docs.filter(d => !d.data().supprimee).map(d => ({
          id: d.id, nom: d.data().nom, creeLe: iso(d.data().creeLe), derniereUtilisation: iso(d.data().derniereUtilisation), comptes: d.data().comptes || 0,
        })).sort((a, b) => String(a.creeLe).localeCompare(String(b.creeLe))),
        em: e && e.cle ? { fin: e.cle.slice(-4), enregistreLe: iso(e.enregistreLe), dernierEnvoiOk: iso(e.dernierEnvoiOk), dernierEchec: e.dernierEchec || null, lecture: lectureView(e.lecture), retour: retourView(e.retour) } : null,
      })
      return
    }

    if (body.mode === 'creer') {
      const nom = cleanName(body.nom)
      if (!nom) { res.status(400).json({ error: 'Donnez un nom à la clé (par exemple le nom du site).' }); return }
      const k = newKey(ev)
      await keys.doc(k.keyId).set({ ev, nom, empreinte: k.empreinte, comptes: 0, creeLe: now, creePar: caller.uid })
      await writeAudit(db, ev, { action: 'CLE_LIAISON_CREEE', staff: caller.uid, userType: 'admin', label: `Clé de liaison créée : ${nom}` })
      res.status(201).json({ id: k.keyId, nom, cle: k.cle }); return
    }

    if (body.mode === 'renouveler') {
      const s = await mine(body.id)
      if (!s) { res.status(404).json({ error: 'Clé introuvable.' }); return }
      const k = newKey(ev, s.id)
      await s.ref.update({ empreinte: k.empreinte, creeLe: now, derniereUtilisation: admin.firestore.FieldValue.delete(), renouveleePar: caller.uid })
      await writeAudit(db, ev, { action: 'CLE_LIAISON_RENOUVELEE', staff: caller.uid, userType: 'admin', label: `Clé de liaison renouvelée : ${s.data().nom}` })
      res.status(200).json({ id: s.id, nom: s.data().nom, cle: k.cle }); return
    }

    if (body.mode === 'supprimer') {
      const s = await mine(body.id)
      if (!s) { res.status(404).json({ error: 'Clé introuvable.' }); return }
      // On garde la fiche sans empreinte : son nom reste lisible sur les comptes qu'elle a apportés
      await s.ref.update({ supprimee: true, empreinte: admin.firestore.FieldValue.delete(), supprimeeLe: now })
      await writeAudit(db, ev, { action: 'CLE_LIAISON_SUPPRIMEE', staff: caller.uid, userType: 'admin', label: `Clé de liaison supprimée : ${s.data().nom}` })
      res.status(200).json({ ok: true }); return
    }

    if (body.mode === 'em-enregistrer') {
      const cle = String(body.cle || '').trim()
      if (cle.length < 20 || cle.length > 300 || /\s/.test(cle)) { res.status(400).json({ error: 'Cette clé ne ressemble pas à une clé Event Manager.' }); return }
      await db.collection('liaisons-em').doc(ev).set({ cle, enregistreLe: now, enregistrePar: caller.uid })
      await writeAudit(db, ev, { action: 'CLE_EM_ENREGISTREE', staff: caller.uid, userType: 'admin', label: 'Clé Event Manager enregistrée' })
      // Première lecture tout de suite : la fenêtre montre aussitôt si la clé est acceptée
      await refreshEvent(db, ev, { force: true }).catch(e => console.error('lecture Event Manager:', e))
      res.status(200).json({ ok: true, fin: cle.slice(-4) }); return
    }

    if (body.mode === 'em-retirer') {
      await db.collection('liaisons-em').doc(ev).delete()
      await writeAudit(db, ev, { action: 'CLE_EM_RETIREE', staff: caller.uid, userType: 'admin', label: 'Clé Event Manager retirée' })
      res.status(200).json({ ok: true }); return
    }

    if (body.mode === 'em-actualiser') {
      const r = await refreshEvent(db, ev, { force: true })
      if (!r.lu) { res.status(400).json({ error: "Aucune clé Event Manager n'est enregistrée pour cet événement." }); return }
      res.status(200).json({ ok: true, lecture: lectureView(r.lecture) }); return
    }

    res.status(400).json({ error: 'Mode inconnu.' })
  } catch (e) {
    console.error('liaisons:', e)
    res.status(500).json({ error: 'Opération impossible pour le moment.' })
  }
}
