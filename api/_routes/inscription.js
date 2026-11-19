/**
 * api/inscription.js — Vercel Serverless Function : création d'un compte spectateur (/inscription)
 *
 * Remplace l'écriture directe dans la base depuis la page publique (sécurité, lot 2).
 * Le compte reçoit une clé (mesure 3) : son lien et son QR code l'ouvrent sans rien taper ;
 * le code court FY-XXXX reste celui que l'équipe scanne ou tape aux stands.
 *
 * POST /api/inscription   { ev, prenom, nom }
 * Réponse : { token, compte: { id, nom, cle } } — la session du nouveau compte est ouverte.
 * Limite : 30 comptes par heure depuis une même adresse réseau.
 */
const crypto = require('crypto')
const { counterKey, blockedMinutes, afterFailure, newKey, spectatorSession } = require('../_auth/core')
const { admin, getDb, clientIp, writeAudit } = require('../_auth/server')
const { readBody } = require('../_billets/admin')

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const LIMIT = { fails: 30, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 }
const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 60)

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST attendu.' }); return }
  let body
  try { body = (await readBody(req)) || {} } catch { res.status(400).json({ error: 'Requête illisible.' }); return }
  const ev = String(body.ev || '')
  const nom = `${clean(body.prenom)} ${clean(body.nom)}`.trim()
  if (!/^[\w-]{1,128}$/.test(ev)) { res.status(400).json({ error: 'Événement manquant dans l\'adresse.' }); return }
  if (nom.length < 2) { res.status(400).json({ error: 'Veuillez entrer votre prénom et nom.' }); return }

  let db
  try { db = getDb() } catch { res.status(503).json({ error: 'Service indisponible.' }); return }
  try {
    const event = await db.collection('events').doc(ev).get()
    if (!event.exists || event.data().deleted || event.data().archive?.readOnly) { res.status(404).json({ error: 'Événement inconnu ou terminé.' }); return }

    // Chaque création compte : au-delà de 30 par heure depuis la même adresse, on bloque
    const ipRef = db.collection('securite-connexions').doc(counterKey('insc', clientIp(req)))
    const ipRec = (await ipRef.get()).data()
    const wait = blockedMinutes(ipRec, Date.now())
    if (wait) { res.status(429).json({ error: `Trop de comptes créés depuis cet appareil. Réessayez dans ${wait} minutes.` }); return }
    await ipRef.set(afterFailure(ipRec, Date.now(), LIMIT))

    const col = db.collection('events').doc(ev).collection('spectateurs')
    const cle = newKey()
    let id = null
    for (let i = 0; i < 10 && !id; i++) {
      const cand = 'FY-' + Array.from(crypto.randomBytes(4), b => ALPHABET[b % ALPHABET.length]).join('')
      const taken = (await col.doc(cand).get()).exists || !(await col.where('id', '==', cand).limit(1).get()).empty
      if (!taken) id = cand
    }
    if (!id) { res.status(503).json({ error: 'Création impossible pour le moment, réessayez.' }); return }

    const data = { id, nom, solde: 0, avatar: null, cle, createdAt: admin.firestore.FieldValue.serverTimestamp(), source: 'inscription' }
    await col.doc(id).set(data)
    await writeAudit(db, ev, { action: 'CREATION_SPECTATEUR', specId: id, specNom: nom, userType: 'spectateur', label: `Nouveau spectateur (inscription en ligne) : ${nom}` })
    const { uid, claims } = spectatorSession(ev, id, data)
    res.status(201).json({ token: await admin.auth().createCustomToken(uid, claims), compte: { id, nom, cle } })
  } catch (e) {
    console.error('inscription:', e)
    res.status(500).json({ error: 'Création impossible pour le moment, réessayez.' })
  }
}
