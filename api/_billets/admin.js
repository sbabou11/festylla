/**
 * api/_billets/admin.js — accès Firebase Admin partagé par les fonctions de billetterie
 * Adaptateur `store` attendu par core.js (transactions sur des chemins texte).
 */
const admin = require('firebase-admin')

function getDb() {
  if (!admin.apps.length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT
    if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT manquante')
    const creds = typeof sa === 'string' ? JSON.parse(sa) : sa
    if (creds.private_key && creds.private_key.includes('\\n')) creds.private_key = creds.private_key.replace(/\\n/g, '\n')
    admin.initializeApp({ credential: admin.credential.cert(creds) })
  }
  return admin.firestore()
}

function adminStore(db) {
  return {
    now: () => admin.firestore.FieldValue.serverTimestamp(),
    runTransaction: (fn) => db.runTransaction(async (t) => fn({
      get: async (path) => { const s = await t.get(db.doc(path)); return { exists: s.exists, data: s.exists ? s.data() : null } },
      set: (path, data, opts) => { if (opts) t.set(db.doc(path), data, opts); else t.set(db.doc(path), data) },
    })),
  }
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  const raw = typeof req.body === 'string' ? req.body : await new Promise((resolve, reject) => {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
  return raw ? JSON.parse(raw) : null
}

module.exports = { admin, getDb, adminStore, readBody }
