/**
 * api/session.js — Vercel Serverless Function : sessions des pages publiques (sécurité, lot 2)
 *
 * Les pages sans connexion de l'équipe obtiennent ici une session Firebase limitée, que les
 * règles de la base (lot 3) restreindront à leurs propres données :
 *
 * POST /api/session
 *   { mode: 'compte', ev, id, cle? }       compte spectateur (/solde, borne) : clé du billet ou du compte
 *                                           exigée quand le compte en a une ; sinon le code seul (anciens comptes)
 *   { mode: 'lien', kind, ev, id?, cle }   lien personnel : 'benevole' (id = fiche), 'artiste' (id = créneau),
 *                                           ou appareil : 'borne', 'ecran' (un lien par événement)
 * Réponse : { token, ... } ; 401 code ou clé incorrects ; 429 trop d'essais depuis cet appareil.
 *
 * Limite d'essais : 15 échecs en 15 minutes depuis une même adresse réseau la bloquent 30 minutes
 * (et 8 échecs sur un même code bloquent ce code). Avec des codes de 6 caractères, essayer des codes
 * au hasard devient sans espoir.
 * Les clés des liens sont rangées dans events/{ev}/liens/{benevole-<id>|artiste-<id>|borne|ecran},
 * lisibles par l'équipe seulement (lot 3).
 */
const {
  blockedMinutes, afterFailure, counterKey, PUBLIC_LIMIT, LIMIT, isKey, sameKey, accountKey,
  spectatorSession, LINK_KINDS, linkDocId, deviceSession, sessionFor, publicAccount,
} = require('../_auth/core')
const { admin, getDb, clientIp, verifyCaller, loadAccount } = require('../_auth/server')
const { readBody } = require('../_billets/admin')

const ID = /^[\w-]{1,128}$/
const SPEC = /^FY-[A-Z0-9]{4,12}$/

async function findSpectator(db, ev, id) {
  const col = db.collection('events').doc(ev).collection('spectateurs')
  const direct = await col.doc(id).get()
  if (direct.exists && direct.data().id === id) return { docId: direct.id, data: direct.data() }
  const q = await col.where('id', '==', id).limit(1).get()
  return q.empty ? null : { docId: q.docs[0].id, data: q.docs[0].data() }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST attendu.' }); return }
  let body
  try { body = (await readBody(req)) || {} } catch { res.status(400).json({ error: 'Requête illisible.' }); return }
  const ev = String(body.ev || '')
  if (!ID.test(ev)) { res.status(400).json({ error: 'Événement manquant dans l\'adresse.' }); return }
  let db
  try { db = getDb() } catch { res.status(503).json({ error: 'Service indisponible.' }); return }

  const now = Date.now()
  const ipRef = db.collection('securite-connexions').doc(counterKey('pub', clientIp(req)))
  const ipRec = (await ipRef.get()).data()
  const wait = blockedMinutes(ipRec, now)
  if (wait) { res.status(429).json({ error: `Trop d'essais depuis cet appareil. Réessayez dans ${wait} minutes.` }); return }
  const fail = async (status, error, extraRef, extraRec) => {
    await ipRef.set(afterFailure(ipRec, now, PUBLIC_LIMIT))
    if (extraRef) await extraRef.set(afterFailure(extraRec, now, LIMIT))
    res.status(status).json({ error })
  }

  try {
    const event = await db.collection('events').doc(ev).get()
    if (!event.exists || event.data().deleted) { await fail(404, 'Événement inconnu.'); return }

    if (body.mode === 'compte') {
      const id = String(body.id || '').toUpperCase().trim()
      if (!SPEC.test(id)) { await fail(400, 'Code invalide. Format attendu : FY- suivi de lettres et de chiffres.'); return }
      const codeRef = db.collection('securite-connexions').doc(counterKey('code', `${ev}:${id}`))
      const codeRec = (await codeRef.get()).data()
      const codeWait = blockedMinutes(codeRec, now)
      if (codeWait) { res.status(429).json({ error: `Trop d'essais pour ce code. Réessayez dans ${codeWait} minutes.` }); return }

      const spec = await findSpectator(db, ev, id)
      if (!spec) { await fail(401, 'Code inconnu : vérifiez le code ou l\'événement.'); return }
      const expected = accountKey(spec.data)
      if (expected && !sameKey(String(body.cle || '').toLowerCase(), expected)) {
        // Exception : l'artiste dont le créneau est relié à ce compte (espace artiste → solde)
        const caller = await verifyCaller(req)
        let allowed = false
        if (caller && caller.type === 'artiste' && (caller.eventIds || []).includes(ev)) {
          const cr = await db.collection('events').doc(ev).collection('planning').doc(caller.creneauId).get()
          allowed = cr.exists && cr.data().linkedSpecId === id
        }
        if (!allowed) {
          await fail(401, body.cle ? 'Ce lien n\'est plus valable pour ce compte.' : 'Ce compte s\'ouvre avec le lien ou le QR code reçu à la création du compte (billet, e-mail ou carte). Demandez-le à la billetterie si besoin.', codeRef, codeRec)
          return
        }
      }
      const { uid, claims } = spectatorSession(ev, spec.docId, spec.data)
      const token = await admin.auth().createCustomToken(uid, claims)
      res.status(200).json({ token, compte: { id: spec.data.id, docId: spec.docId, nom: spec.data.nom || '', cle: expected ? String(body.cle || '').toLowerCase() || null : null } })
      return
    }

    if (body.mode === 'lien') {
      const kind = String(body.kind || '')
      const id = String(body.id || '')
      if (!LINK_KINDS.includes(kind) || ((kind === 'benevole' || kind === 'artiste') && !ID.test(id))) { await fail(400, 'Lien incomplet.'); return }
      const cle = String(body.cle || '').toLowerCase()
      const link = await db.collection('events').doc(ev).collection('liens').doc(linkDocId(kind, id)).get()
      if (!isKey(cle) || !link.exists || !sameKey(cle, link.data().cle)) {
        await fail(401, 'Ce lien n\'est pas ou plus valable. Demandez un nouveau lien à l\'organisation.'); return
      }
      if (kind === 'benevole') {
        const account = await loadAccount(db, `events/${ev}/benevoles/${id}`)
        if (!account) { await fail(404, 'Fiche bénévole introuvable.'); return }
        const { uid, claims } = sessionFor(account)
        res.status(200).json({ token: await admin.auth().createCustomToken(uid, claims), compte: publicAccount(account) })
        return
      }
      if (kind === 'artiste') {
        // Créneau du planning de YllaCash, ou fiche d'artiste venue d'Event Manager (lot C)
        const evRef = db.collection('events').doc(ev)
        const [cr, fiche] = await Promise.all([evRef.collection('planning').doc(id).get(), evRef.collection('artistes').doc(id).get()])
        if (!cr.exists && !(fiche.exists && fiche.data().actif !== false)) { await fail(404, 'Artiste introuvable.'); return }
      }
      const { uid, claims } = deviceSession(kind, ev, id)
      res.status(200).json({ token: await admin.auth().createCustomToken(uid, claims) })
      return
    }

    res.status(400).json({ error: 'Mode inconnu.' })
  } catch (e) {
    console.error('session:', e)
    res.status(500).json({ error: 'Ouverture impossible pour le moment, réessayez.' })
  }
}
