/**
 * api/send-push.js — Vercel Serverless Function (Node.js)
 *
 * Envoie une vraie notification push via Firebase Cloud Messaging.
 * Fonctionne même quand l'app est fermée / téléphone verrouillé.
 *
 * REQUIS — Variable d'environnement Vercel :
 *   FIREBASE_SERVICE_ACCOUNT = JSON complet de la clé de service Firebase
 *   (voir le guide /docs/PUSH-SETUP.md à la racine du projet)
 *
 * POST /api/send-push
 * Body JSON :
 *   {
 *     "tokens": ["fcm-token-1", "fcm-token-2"],   // obligatoire
 *     "title":  "Titre de la notif",              // obligatoire
 *     "body":   "Corps du message",               // obligatoire
 *     "data":   { "url": "/dashboard" },          // optionnel (clé/valeur strings)
 *     "icon":   "/logo-192.png",                  // optionnel
 *     "tag":    "yllacash-notif",                 // optionnel (dédoublonnage)
 *     "eventId":"abc123",                         // optionnel — pour nettoyer tokens invalides côté Firestore
 *   }
 *
 * Réponse :
 *   { ok: true, successCount: N, failureCount: M, invalidTokens: [...] }
 *
 * Tokens invalides : automatiquement marqués pour suppression (mais la
 * suppression réelle dans Firestore se fait côté client, on évite d'avoir
 * besoin des permissions admin Firestore pour rester sur des règles simples).
 */

const admin = require('firebase-admin')

// ── Init Firebase Admin (une seule fois par instance Vercel) ─────────────
let app = null
function getAdminApp() {
  if (app) return app
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT env var manquante')
  let creds
  try {
    creds = typeof sa === 'string' ? JSON.parse(sa) : sa
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT n\'est pas un JSON valide : ' + e.message)
  }
  // Firebase exige le format avec \n littéraux dans la private_key
  if (creds.private_key && creds.private_key.includes('\\n')) {
    creds.private_key = creds.private_key.replace(/\\n/g, '\n')
  }
  app = admin.initializeApp({
    credential: admin.credential.cert(creds),
  })
  return app
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method Not Allowed' }); return }

  // Parse body (Vercel passe parfois req.body en string brut)
  let data = {}
  try {
    if (req.body && typeof req.body === 'object') {
      data = req.body
    } else {
      const raw = await new Promise((resolve, reject) => {
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => resolve(body))
        req.on('error', reject)
      })
      if (raw) data = JSON.parse(raw)
    }
  } catch (e) {
    res.status(400).json({ error: 'Invalid JSON: ' + e.message }); return
  }

  const { tokens, title, body, data: payload, icon, tag, eventId } = data
  if (!Array.isArray(tokens) || tokens.length === 0) {
    res.status(400).json({ error: 'tokens manquants ou vides' }); return
  }
  if (!title || !body) {
    res.status(400).json({ error: 'title et body sont obligatoires' }); return
  }

  // Init Firebase Admin
  try { getAdminApp() } catch (e) {
    console.error('Firebase admin init error:', e.message)
    res.status(500).json({ error: 'Configuration backend incorrecte : ' + e.message }); return
  }

  // ── Construit le message FCM ───────────────────────────────────────────
  // Bonnes pratiques :
  //  - data: que des strings (sinon FCM rejette)
  //  - notification: provoque affichage natif système (même app fermée)
  //  - apns/webpush: options par plateforme pour customisations fines
  const dataPayload = {}
  if (payload && typeof payload === 'object') {
    Object.entries(payload).forEach(([k, v]) => { dataPayload[k] = String(v ?? '') })
  }

  const message = {
    notification: { title, body },
    data:    dataPayload,
    webpush: {
      notification: {
        icon:  icon || '/logo-192.png',
        badge: '/logo-192.png',
        vibrate: [200, 100, 200],
        tag:   tag || undefined,
        renotify: !!tag,
      },
      fcmOptions: {
        link: dataPayload.url || '/',
      },
    },
    android: {
      notification: {
        icon:  'logo_192',
        color: '#009090', // teal Maison Ylla
        priority: 'high',
      },
      priority: 'high',
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    },
  }

  // ── Envoi en batch via FCM sendEachForMulticast ────────────────────────
  let response
  try {
    response = await admin.messaging().sendEachForMulticast({
      tokens,
      ...message,
    })
  } catch (e) {
    console.error('FCM send error:', e)
    res.status(500).json({ error: 'Échec d\'envoi FCM : ' + e.message }); return
  }

  // Détecte les tokens invalides (à supprimer)
  const invalidTokens = []
  response.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code || ''
      // Ces codes indiquent un token mort/invalide définitivement
      if (code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-argument') {
        invalidTokens.push(tokens[i])
      }
    }
  })

  res.status(200).json({
    ok: true,
    successCount: response.successCount,
    failureCount: response.failureCount,
    invalidTokens,
    eventId: eventId || null,
  })
}
