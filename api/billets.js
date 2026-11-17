/**
 * api/billets.js — Vercel Serverless Function : ventes et annulations envoyées par un site de billetterie
 *
 * Règle d'échange : echanges-billetterie.md (v1.3), §2 et §3.
 *
 * Identification : Authorization: Bearer <événement>.<identifiant de clé>.<secret>
 * La clé est créée dans YllaCash, fenêtre « Liaisons » de l'événement (une par site), et c'est
 * elle qui désigne l'événement où ranger les comptes. Clé absente, inconnue ou supprimée : 401.
 * Les clés sont rangées dans la collection racine `liaisons` (empreinte du secret seulement),
 * que les règles de la base réservent au serveur.
 *
 * POST /api/billets
 *   { id, type: 'vente', commande, le, billets: [{ code, ref, cle, prenom, nom, pass, jours, prix }] }
 *   { id, type: 'annulation', commande, le, codes: [...] }
 * Réponses : 201/200 { ok }, 200 { ok, duplicate } si déjà reçu, 400/401/404 { error }.
 *
 * Une vente crée un compte events/{événement}/spectateurs/FY-<code> (identifiant du document
 * = identifiant du compte) avec le bloc `billet` et `source` (nom de la clé). Les messages reçus
 * sont notés dans events/{événement}/billetterie-recus/{id} pour ne jamais rien traiter deux fois.
 *
 * REQUIS : FIREBASE_SERVICE_ACCOUNT (déjà utilisée par send-push).
 */
const { validateMessage, handleMessage } = require('./_billets/core')
const { keyFromHeader, keyMatches } = require('./_billets/cles')
const { admin, getDb, adminStore, readBody } = require('./_billets/admin')

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée : POST attendu.' }); return }

  const parsed = keyFromHeader(req.headers.authorization)
  if (!parsed) { res.status(401).json({ error: 'Clé de liaison absente ou mal formée.' }); return }
  let db
  try { db = getDb() } catch { res.status(503).json({ error: 'YllaCash n\'est pas configuré pour recevoir des billets.' }); return }

  let key
  try {
    const snap = await db.collection('liaisons').doc(parsed.keyId).get()
    key = snap.exists ? snap.data() : null
  } catch (e) { console.error('billets: lecture de la clé', e); res.status(500).json({ error: 'Erreur interne de YllaCash, le message sera renvoyé.' }); return }
  if (!keyMatches(parsed, key)) { res.status(401).json({ error: 'Clé de liaison inconnue ou supprimée.' }); return }

  let msg
  try { msg = await readBody(req) } catch { res.status(400).json({ error: 'Corps JSON illisible.' }); return }
  const invalid = validateMessage(msg)
  if (invalid) { res.status(400).json({ error: invalid }); return }

  try {
    const r = await handleMessage(adminStore(db), msg, { ev: parsed.ev, source: key.nom || '' })
    if (r.status < 300 && !r.body.duplicate) {
      await db.collection('liaisons').doc(parsed.keyId).update({
        derniereUtilisation: admin.firestore.FieldValue.serverTimestamp(),
        comptes: admin.firestore.FieldValue.increment(r.created || 0),
      }).catch(() => {})
    }
    res.status(r.status).json(r.body)
  } catch (e) {
    console.error('billets:', e)
    res.status(500).json({ error: 'Erreur interne de YllaCash, le message sera renvoyé.' })
  }
}
