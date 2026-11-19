/**
 * api/archive-file.js — Vercel Serverless Function (Node.js)
 *
 * Renvoie un fichier de Firebase Storage pour l'archivage d'une édition.
 * Firebase Storage refuse les téléchargements directs depuis le navigateur (pas de
 * règle CORS sur le bucket) ; le serveur, lui, lit le fichier avec la clé de service.
 *
 * REQUIS : FIREBASE_SERVICE_ACCOUNT (déjà utilisée par send-push).
 * Bucket : FIREBASE_STORAGE_BUCKET ou VITE_FIREBASE_STORAGE_BUCKET.
 *
 * GET /api/archive-file?path=events/<id>/menu/<article>/<fichier>
 * Seuls les fichiers rangés sous events/ sont accessibles, et seulement aux administrateurs connectés.
 */
const admin = require('firebase-admin')
const { requireCaller } = require('../_auth/server')

let app = null
function getBucket() {
  if (!app) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT
    if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT manquante')
    const creds = typeof sa === 'string' ? JSON.parse(sa) : sa
    if (creds.private_key && creds.private_key.includes('\\n')) creds.private_key = creds.private_key.replace(/\\n/g, '\n')
    app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(creds) })
  }
  const name = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET
  if (!name) throw new Error('Nom du bucket Storage absent (FIREBASE_STORAGE_BUCKET)')
  return admin.storage().bucket(name)
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method Not Allowed' }); return }
  // Sécurité, lot 1 : réservé aux administrateurs (archivage des éditions)
  const caller = await requireCaller(req, res, { roles: ['admin', 'super_admin'] })
  if (!caller) return
  const path = String((req.query && req.query.path) || '')
  if (!/^events\/[\w-]+\/[^\0]+$/.test(path) || path.includes('..')) {
    res.status(400).json({ error: 'Chemin de fichier refusé' }); return
  }
  try {
    const file = getBucket().file(path)
    const [exists] = await file.exists()
    if (!exists) { res.status(404).json({ error: 'Fichier introuvable' }); return }
    const [meta] = await file.getMetadata()
    const [buf] = await file.download()
    res.setHeader('Content-Type', meta.contentType || 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).send(buf)
  } catch (e) {
    console.error('archive-file:', e)
    res.status(500).json({ error: e.message || 'Erreur interne' })
  }
}
