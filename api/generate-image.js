/**
 * api/generate-image.js — Vercel Serverless Function (Node.js)
 *
 * Génère l'image d'un article du menu avec l'API Higgsfield (modèle Qwen Image 3),
 * au format carré des cartes du menu.
 *
 * REQUIS — Variables d'environnement Vercel :
 *   HF_API_KEY_ID, HF_API_KEY_SECRET  = clé API créée sur https://console.higgsfield.ai
 *   FIREBASE_SERVICE_ACCOUNT           = déjà utilisée par send-push (lecture de l'article)
 * OPTIONNEL :
 *   HF_MAX_PER_ITEM   = nombre max de générations par article (défaut 8)
 *   HF_MAX_PER_EVENT  = nombre max de générations par événement (défaut 300)
 *
 * Sécurité : l'appli n'a pas de jeton de connexion vérifiable côté serveur. La fonction
 * ne reçoit donc que l'identifiant d'un article existant ; elle construit elle-même la
 * description à partir de la fiche, et les plafonds ci-dessus bornent la dépense.
 *
 * POST /api/generate-image, corps JSON :
 *   { action: 'start',  eventId, itemId }            → { requestId }
 *   { action: 'status', eventId, itemId, requestId } → { status, error? }
 *   { action: 'image',  eventId, itemId, requestId } → octets de l'image (PNG)
 *
 * La génération est asynchrone chez Higgsfield : le client lance, interroge le statut
 * toutes les 2 s, puis récupère l'image et l'enregistre lui-même dans Firebase Storage
 * (les fichiers Higgsfield sont effacés au bout de 7 jours).
 */

const admin = require('firebase-admin')
const crypto = require('crypto')

const HF_BASE = 'https://api.higgsfield.ai'
const HF_MODEL = '/alibaba/qwen-image-3/text-to-image'
const MAX_PER_ITEM = Number(process.env.HF_MAX_PER_ITEM) || 8
const MAX_PER_EVENT = Number(process.env.HF_MAX_PER_EVENT) || 300

let app = null
function getDb() {
  if (!app) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT
    if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT manquante')
    const creds = typeof sa === 'string' ? JSON.parse(sa) : sa
    if (creds.private_key && creds.private_key.includes('\\n')) {
      creds.private_key = creds.private_key.replace(/\\n/g, '\n')
    }
    app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(creds) })
  }
  return admin.firestore()
}

function hfHeaders() {
  const id = process.env.HF_API_KEY_ID, secret = process.env.HF_API_KEY_SECRET
  if (!id || !secret) {
    const e = new Error('La génération d\'images n\'est pas encore configurée (clé Higgsfield absente).')
    e.status = 503
    throw e
  }
  return { Authorization: `Key ${id}:${secret}`, 'Content-Type': 'application/json' }
}

const clean = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max)

// Description envoyée au modèle : construite ici, jamais reçue du navigateur
function buildPrompt(item) {
  const nom = clean(item.nom, 120)
  const cat = clean(item.cat, 60)
  const desc = clean(item.description, 300)
  return [
    `Professional product photograph for a festival food and drink menu. The product is: "${nom}"`
      + (cat ? ` (menu category: ${cat})` : '') + '.',
    desc ? `Details about the product: ${desc}.` : '',
    'The names above are in French: interpret them as a French festival menu item.',
    'Show exactly one serving of the product, centered, entirely visible, with generous empty space around it',
    'so the picture can be cropped into a wide banner without cutting the product.',
    'Square composition, appetizing and realistic, soft natural studio light, gentle shadow,',
    'clean warm neutral background, shallow depth of field, high detail.',
    'No text, no letters, no numbers, no logo, no brand name, plain unbranded packaging, no watermark, no people, no hands.',
  ].filter(Boolean).join(' ')
}

const NEGATIVE = 'text, letters, words, numbers, logo, brand name, label with writing, watermark, people, hands, '
  + 'cropped product, cut off, several products, blurry, deformed, low quality'

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  const raw = await new Promise((resolve, reject) => {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
  return raw ? JSON.parse(raw) : {}
}

const validId = (v) => typeof v === 'string' && /^[\w-]{1,128}$/.test(v)

async function hfStatus(statusUrl) {
  const r = await fetch(statusUrl, { headers: hfHeaders() })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = new Error(j.detail || j.error || `Higgsfield a répondu ${r.status}`)
    e.status = 502
    throw e
  }
  return j
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return }

  try {
    let data
    try { data = await readBody(req) } catch { res.status(400).json({ error: 'Requête illisible' }); return }
    const { action, eventId, itemId, requestId } = data || {}
    if (!validId(eventId) || !validId(itemId)) { res.status(400).json({ error: 'Article invalide' }); return }

    const db = getDb()
    const eventRef = db.collection('events').doc(eventId)
    const itemRef = eventRef.collection('menu').doc(itemId)

    if (action === 'start') {
      const headers = hfHeaders()
      // Compteurs et plafonds, dans une transaction pour ne pas les dépasser à plusieurs
      const item = await db.runTransaction(async (tx) => {
        const [itemSnap, eventSnap] = await Promise.all([tx.get(itemRef), tx.get(eventRef)])
        if (!itemSnap.exists) { const e = new Error('Article introuvable'); e.status = 404; throw e }
        const it = itemSnap.data()
        if (!clean(it.nom, 120)) { const e = new Error('Donnez d\'abord un nom à l\'article.'); e.status = 400; throw e }
        if ((it.aiGenerations || 0) >= MAX_PER_ITEM) {
          const e = new Error(`Limite atteinte : ${MAX_PER_ITEM} images générées pour cet article.`); e.status = 429; throw e
        }
        if ((eventSnap.data()?.aiImageCount || 0) >= MAX_PER_EVENT) {
          const e = new Error(`Limite atteinte : ${MAX_PER_EVENT} images générées pour cet événement.`); e.status = 429; throw e
        }
        tx.set(itemRef, { aiGenerations: admin.firestore.FieldValue.increment(1) }, { merge: true })
        tx.set(eventRef, { aiImageCount: admin.firestore.FieldValue.increment(1) }, { merge: true })
        return it
      })

      const r = await fetch(HF_BASE + HF_MODEL, {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          prompt: buildPrompt(item),
          negative_prompt: NEGATIVE,
          aspect_ratio: '1:1',
          resolution: '1k',
          prompt_extend: true,
          enable_thinking: false,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.request_id || !j.status_url) {
        // Rien n'a été généré : on rend le crédit au compteur
        await Promise.all([
          itemRef.set({ aiGenerations: admin.firestore.FieldValue.increment(-1) }, { merge: true }),
          eventRef.set({ aiImageCount: admin.firestore.FieldValue.increment(-1) }, { merge: true }),
        ]).catch(() => {})
        const msg = r.status === 402 ? 'Solde Higgsfield insuffisant.' : (j.detail || j.error || `Higgsfield a répondu ${r.status}`)
        res.status(502).json({ error: msg }); return
      }
      // Seule la dernière demande de l'article peut être lue ensuite
      await itemRef.set({ aiPending: { requestId: j.request_id, statusUrl: j.status_url } }, { merge: true })
      res.status(200).json({ requestId: j.request_id }); return
    }

    if (action === 'status' || action === 'image') {
      const snap = await itemRef.get()
      const pending = snap.exists ? snap.data().aiPending : null
      if (!pending || pending.requestId !== requestId || !/^https:\/\/[\w.-]*higgsfield\.ai\//.test(pending.statusUrl || '')) {
        res.status(404).json({ error: 'Demande inconnue pour cet article' }); return
      }
      const st = await hfStatus(pending.statusUrl)

      if (action === 'status') {
        const msg = st.status === 'nsfw' ? 'Image refusée par le filtre de contenu. Essayez de préciser la description de l\'article.'
          : st.status === 'failed' ? (st.error || 'La génération a échoué.')
          : undefined
        res.status(200).json({ status: st.status, error: msg }); return
      }

      const url = st.status === 'completed' && st.images && st.images[0] && st.images[0].url
      if (!url || !/^https:\/\//.test(url)) { res.status(409).json({ error: 'Image pas encore prête' }); return }
      const img = await fetch(url)
      if (!img.ok) { res.status(502).json({ error: 'Téléchargement de l\'image impossible' }); return }
      const buf = Buffer.from(await img.arrayBuffer())
      res.setHeader('Content-Type', img.headers.get('content-type') || 'image/png')
      res.setHeader('Cache-Control', 'no-store')
      res.status(200).send(buf); return
    }

    res.status(400).json({ error: 'Action inconnue' })
  } catch (e) {
    console.error('generate-image:', e)
    res.status(e.status || 500).json({ error: e.message || 'Erreur interne' })
  }
}
