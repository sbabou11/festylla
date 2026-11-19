/**
 * api/_routes/qr.js — QR tournant et code de secours (servi à /api/qr)
 *
 * Choix de l'organisateur (20/11/2026) : on paie avec le QR tournant de son espace, vérifié ici.
 *
 * POST /api/qr
 *   { action: 'identifier', ev, qr }          borne ou équipe : QR tournant lu → compte du spectateur
 *   { action: 'identifier', ev, secours }     idem avec le code de secours (réglage « Scanner en panne »)
 *   { action: 'identifier', ev, commande }    borne : code de commande à 6 chiffres passé en ligne
 *                                             (le solde sera débité : il faut autoriser ce compte)
 *   { action: 'secours', ev }                 espace spectateur : demande un code de secours, valable
 *                                             90 s, seulement si « Scanner en panne » est activé
 *   { action: 'nouveau-lien', ev, docId }     billetterie (« Lien perdu », 20/11/2026) : nouvelle clé pour
 *                                             ce compte (l'ancienne ne vaut plus rien) et jeton à usage
 *                                             unique, valable 2 minutes, affiché en QR au guichet
 *   { action: 'ouvrir-lien', ev, jeton }      téléphone du spectateur, sans session : échange le jeton
 *                                             contre l'ouverture de son espace et sa nouvelle clé
 * Pour la borne, une identification réussie ouvre une autorisation de 10 minutes sur ce seul compte
 * (events/{ev}/autorisations/{compte}) : les règles de la base ne laissent la borne lire ce compte
 * et débiter son solde que pendant ce temps. Limite d'essais : celle des pages publiques.
 */
const crypto = require('crypto')
const { blockedMinutes, afterFailure, counterKey, PUBLIC_LIMIT, newKey, spectatorSession } = require('../_auth/core')
const { cleDuCompte } = require('../_auth/cles')
const { admin, getDb, clientIp, verifyCaller, canManage, writeAudit } = require('../_auth/server')
const { readBody } = require('../_billets/admin')
const { lireJeton, jetonValable, lireSecours, nouveauSecours } = require('../_qr/tournant')

const ID = /^[\w-]{1,128}$/
const CODE = /^\d{6}$/
const AUTORISATION_MS = 10 * 60 * 1000
const SECOURS_MS = 90 * 1000
const JETON_MS = 2 * 60 * 1000
const JETON = /^[0-9a-f]{32}$/

class Refus extends Error { constructor(status, message) { super(message); this.status = status } }

async function trouver(evRef, id) {
  const col = evRef.collection('spectateurs')
  const direct = await col.doc(id).get()
  if (direct.exists && direct.data().id === id) return direct
  const q = await col.where('id', '==', id).limit(1).get()
  return q.empty ? null : q.docs[0]
}

/** Téléphone du spectateur : le QR du guichet (jeton à usage unique) ouvre son espace */
async function ouvrirLien(req, res, ev, body) {
  let db
  try { db = getDb() } catch { res.status(503).json({ error: 'Service indisponible.' }); return }
  const evRef = db.collection('events').doc(ev)
  const now = Date.now()
  try {
    const ipRef = db.collection('securite-connexions').doc(counterKey('pub', clientIp(req)))
    const ipRec = (await ipRef.get()).data()
    const wait = blockedMinutes(ipRec, now)
    if (wait) throw new Refus(429, `Trop d'essais. Réessayez dans ${wait} minutes.`)
    const jeton = String(body.jeton || '').toLowerCase()
    const ref = evRef.collection('jetons-lien').doc(JETON.test(jeton) ? jeton : '-')
    const docId = await db.runTransaction(async (t) => {
      const d = JETON.test(jeton) ? await t.get(ref) : null
      if (!d || !d.exists || d.data().utiliseLe || d.data().expMs < now) return null
      t.update(ref, { utiliseLe: admin.firestore.FieldValue.serverTimestamp(), utiliseMs: now })
      return d.data().specDoc
    })
    if (!docId) {
      await ipRef.set(afterFailure(ipRec, now, PUBLIC_LIMIT))
      throw new Refus(401, 'Ce QR a déjà servi ou a expiré. Demandez-en un nouveau à la billetterie.')
    }
    const [snap, cle] = await Promise.all([evRef.collection('spectateurs').doc(docId).get(), evRef.collection('cles').doc(docId).get()])
    if (!snap.exists || !cle.exists) throw new Refus(404, 'Compte introuvable.')
    const { uid, claims } = spectatorSession(ev, docId, snap.data())
    const token = await admin.auth().createCustomToken(uid, claims)
    res.status(200).json({ token, compte: { id: snap.data().id, docId, nom: snap.data().nom || '', cle: cle.data().cle } })
  } catch (e) {
    if (e instanceof Refus) { res.status(e.status).json({ error: e.message }); return }
    console.error('qr (ouvrir-lien):', e)
    res.status(500).json({ error: 'Ouverture impossible pour le moment, réessayez.' })
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST attendu.' }); return }
  let body
  try { body = (await readBody(req)) || {} } catch { res.status(400).json({ error: 'Requête illisible.' }); return }
  const ev = String(body.ev || '')
  if (!ID.test(ev)) { res.status(400).json({ error: 'Événement manquant.' }); return }
  if (body.action === 'ouvrir-lien') return ouvrirLien(req, res, ev, body)
  const caller = await verifyCaller(req)
  const dansEv = caller && (caller.type === 'staff' ? (!(caller.eventIds || []).length || (caller.eventIds || []).includes(ev) || ['admin', 'super_admin'].includes(caller.role)) : (caller.eventIds || []).includes(ev))
  if (!caller || !dansEv) { res.status(403).json({ error: 'Session expirée : rouvrez la page.' }); return }
  let db
  try { db = getDb() } catch { res.status(503).json({ error: 'Service indisponible.' }); return }
  const evRef = db.collection('events').doc(ev)
  const now = Date.now()
  const secoursActif = async () => {
    const s = await evRef.collection('settings').doc('global').get()
    return s.exists && s.data().scannerEnPanne === true
  }

  try {
    // ── Espace spectateur : code de secours ──
    if (body.action === 'secours') {
      if (caller.type !== 'spectateur' || !caller.specId || !caller.specDoc) throw new Refus(403, 'Ouvrez votre espace avec votre lien.')
      if (!(await secoursActif())) throw new Refus(409, 'Le code de secours n\'est pas activé : présentez votre QR.')
      for (let essai = 0; essai < 6; essai++) {
        const code = nouveauSecours()
        const ref = evRef.collection('codes-secours').doc(code)
        const ok = await db.runTransaction(async (t) => {
          const d = await t.get(ref)
          if (d.exists && d.data().expMs > now) return false
          t.set(ref, { specId: caller.specId, specDoc: String(caller.specDoc), expMs: now + SECOURS_MS, createdAt: admin.firestore.FieldValue.serverTimestamp() })
          return true
        })
        if (ok) { res.status(200).json({ code, secondes: Math.round(SECOURS_MS / 1000) }); return }
      }
      throw new Refus(503, 'Aucun code libre, réessayez.')
    }

    // ── Billetterie : donner un nouveau lien à un spectateur qui a perdu le sien ──
    if (body.action === 'nouveau-lien') {
      const billetterie = caller.type === 'staff' && (['admin', 'super_admin', 'billetterie'].includes(caller.role) || await canManage(db, caller, 'lien-perdu'))
      if (!billetterie) throw new Refus(403, 'Réservé à la billetterie.')
      const docId = String(body.docId || '')
      if (!ID.test(docId)) throw new Refus(400, 'Compte manquant.')
      const snap = await evRef.collection('spectateurs').doc(docId).get()
      if (!snap.exists) throw new Refus(404, 'Compte introuvable.')
      const spec = snap.data()
      if (spec.billet && spec.billet.annule) throw new Refus(403, 'Ce billet a été annulé : pas de nouveau lien.')
      if (spec.billet && spec.billet.sansCompte) throw new Refus(403, 'Billet sans compte, choisi ainsi à l\'achat : pas de lien possible. Son porteur commande à la billetterie.')
      const jeton = crypto.randomBytes(16).toString('hex')
      const batch = db.batch()
      // Nouvelle clé : l'ancien lien et l'ancien QR tournant ne valent plus rien
      batch.set(evRef.collection('cles').doc(docId), { cle: newKey(), changeLe: admin.firestore.FieldValue.serverTimestamp() })
      batch.update(snap.ref, { cle: admin.firestore.FieldValue.delete(), ...(spec.billet ? { 'billet.cle': admin.firestore.FieldValue.delete() } : {}) })
      batch.set(evRef.collection('jetons-lien').doc(jeton), {
        specDoc: docId, specId: spec.id, specNom: spec.nom || '', expMs: now + JETON_MS, utiliseLe: null,
        par: String(body.staff || caller.uid || '').slice(0, 80), createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      await batch.commit()
      // Les sessions déjà ouvertes avec l'ancien lien ne se renouvellent plus (au plus une heure)
      await admin.auth().revokeRefreshTokens(spectatorSession(ev, docId, spec).uid).catch(() => {})
      await writeAudit(db, ev, { action: 'NOUVEAU_LIEN_SPECTATEUR', specId: spec.id, specNom: spec.nom || '', staff: String(body.staff || caller.uid || ''), userType: 'staff',
        label: `Nouveau lien donné à ${spec.nom || spec.id} (identité vérifiée au guichet)` })
      res.status(200).json({ jeton, secondes: Math.round(JETON_MS / 1000) }); return
    }

    if (body.action !== 'identifier') throw new Refus(400, 'Action inconnue.')
    if (!['borne', 'staff'].includes(caller.type)) throw new Refus(403, 'Réservé à la borne et à l\'équipe.')

    const ipRef = db.collection('securite-connexions').doc(counterKey('pub', clientIp(req)))
    const ipRec = (await ipRef.get()).data()
    const wait = blockedMinutes(ipRec, now)
    if (wait) throw new Refus(429, `Trop d'essais. Réessayez dans ${wait} minutes.`)
    const echec = async (status, message) => { await ipRef.set(afterFailure(ipRec, now, PUBLIC_LIMIT)); throw new Refus(status, message) }

    let snap = null
    if (body.qr != null) {
      const lu = lireJeton(body.qr)
      if (!lu) await echec(400, 'Ce QR n\'est pas reconnu. Présentez le QR de votre espace YllaCash.')
      snap = await trouver(evRef, lu.specId)
      if (!snap || !jetonValable({ lu, cle: await cleDuCompte(evRef, snap.id, snap.data()), ev, ms: now })) {
        await echec(401, 'Ce QR n\'est plus valable : il change toutes les 30 secondes. Présentez celui affiché en ce moment.')
      }
    } else if (body.secours != null) {
      const code = lireSecours(body.secours)
      if (!code) throw new Refus(400, 'Code de secours attendu : 2 lettres et 4 chiffres.')
      if (!(await secoursActif())) throw new Refus(409, 'Le code de secours n\'est pas activé.')
      const ref = evRef.collection('codes-secours').doc(code)
      const d = await ref.get()
      if (!d.exists || d.data().expMs < now) await echec(401, 'Code inconnu ou expiré : tapez celui affiché en ce moment.')
      await ref.delete().catch(() => {})   // à usage unique
      snap = await evRef.collection('spectateurs').doc(d.data().specDoc).get()
      if (!snap.exists) throw new Refus(404, 'Compte introuvable.')
    } else if (body.commande != null) {
      if (caller.type !== 'borne') throw new Refus(403, 'Réservé à la borne.')
      const code = String(body.commande)
      if (!CODE.test(code)) throw new Refus(400, 'Code à 6 chiffres attendu.')
      const c = await evRef.collection('codes').doc(code).get()
      if (!c.exists || c.data().origine !== 'en-ligne' || c.data().statut !== 'en_attente') await echec(404, 'Code inconnu ou déjà utilisé.')
      snap = await evRef.collection('spectateurs').doc(String(c.data().specDocId || c.data().specId)).get()
      if (!snap.exists) throw new Refus(404, 'Compte introuvable.')
    } else {
      throw new Refus(400, 'QR ou code attendu.')
    }

    const spec = snap.data()
    if (spec.billet && spec.billet.annule) throw new Refus(403, 'Ce billet a été annulé : présentez-vous à la billetterie.')
    if (caller.type === 'borne') {
      await evRef.collection('autorisations').doc(snap.id).set({
        specId: spec.id, exp: admin.firestore.Timestamp.fromMillis(now + AUTORISATION_MS), par: 'borne',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }
    res.status(200).json({ compte: { id: spec.id, docId: snap.id, nom: spec.nom || '', solde: Number(spec.solde) || 0 } })
  } catch (e) {
    if (e instanceof Refus) { res.status(e.status).json({ error: e.message }); return }
    console.error('qr:', e)
    res.status(500).json({ error: 'Vérification impossible pour le moment, réessayez.' })
  }
}
