/**
 * api/billets.js — Vercel Serverless Function : ventes et annulations envoyées par le site festylla.com
 *
 * Règle d'échange : echanges-billetterie.md (v1, 17/11/2026), §2 et §3.
 *
 * REQUIS — Variables d'environnement Vercel (saisies par l'administrateur) :
 *   YLLA_BILLETTERIE_KEY      = clé de la liaison « site → YllaCash » (la même que dans WooCommerce › Billetterie)
 *   FIREBASE_SERVICE_ACCOUNT  = déjà utilisée par send-push
 *
 * POST /api/billets   Authorization: Bearer <clé>
 *   { id, type: 'vente', evenement, commande, le, billets: [{ code, ref, prenom, nom, pass, jours, prix }] }
 *   { id, type: 'annulation', evenement, commande, le, codes: [...] }
 * Réponses : 201/200 { ok }, 200 { ok, duplicate } si déjà reçu, 400/401/404/503 { error }.
 *
 * Une vente crée un compte events/{evenement}/spectateurs/FY-<code> (identifiant du document
 * = identifiant du compte) avec le bloc `billet`. Les messages reçus sont notés dans
 * events/{evenement}/billetterie-recus/{id} pour ne jamais rien traiter deux fois.
 */
const { checkAuth, validateMessage, handleMessage } = require('./_billets/core')
const { getDb, adminStore, readBody } = require('./_billets/admin')

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée : POST attendu.' }); return }

  const denied = checkAuth(req.headers.authorization, process.env.YLLA_BILLETTERIE_KEY)
  if (denied) { res.status(denied.status).json({ error: denied.error }); return }

  let msg
  try { msg = await readBody(req) } catch { res.status(400).json({ error: 'Corps JSON illisible.' }); return }
  const invalid = validateMessage(msg)
  if (invalid) { res.status(400).json({ error: invalid }); return }

  try {
    const r = await handleMessage(adminStore(getDb()), msg)
    res.status(r.status).json(r.body)
  } catch (e) {
    console.error('billets:', e)
    res.status(500).json({ error: 'Erreur interne de YllaCash, le message sera renvoyé.' })
  }
}
