/**
 * api/_routes/paiement.js — recharge en ligne du solde par Stripe (servi à /api/paiement)
 *
 * Choix de l'organisateur (19/11/2026) : page de paiement hébergée de Stripe (carte, Apple Pay,
 * Google Pay). Deux usages :
 *   POST { action: 'creer', ev, montant, retour }   espace spectateur connecté : crée la page de
 *        paiement (montant en centimes, 5 € à 200 €, contrôlé ici) et renvoie son adresse.
 *   POST (en-tête Stripe-Signature)                  notification de Stripe : signature vérifiée avec
 *        STRIPE_WEBHOOK_SECRET (quand le corps exact est disponible), puis le paiement est redemandé
 *        à Stripe avec la clé secrète : seul ce que Stripe confirme est crédité. Crédit en un seul
 *        enregistrement : recharge « credit », moyen « en-ligne », identifiant fixe stripe-<session>.
 * Variables d'environnement (saisies par l'organisateur dans Vercel, jamais dans le code) :
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
 */
const { admin, getDb, verifyCaller } = require('../_auth/server')
const { readBody } = require('../_billets/admin')
const { montantValide, retourValide, formEncode, paramsSession, verifierSignature, rechargeDepuisEvenement } = require('../_paiement/stripe')

const ID = /^[\w-]{1,128}$/

/** Corps exact de la requête, s'il est encore lisible (sinon un Buffer vide au bout d'un court délai) */
function corpsBrut(req) {
  if (Buffer.isBuffer(req.rawBody)) return Promise.resolve(req.rawBody)
  if (req.readableEnded || req.complete) return Promise.resolve(Buffer.alloc(0))
  return new Promise((resolve) => {
    const chunks = []
    const fin = () => resolve(Buffer.concat(chunks))
    const timer = setTimeout(fin, 2000)
    req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => { clearTimeout(timer); fin() })
    req.on('error', () => { clearTimeout(timer); fin() })
  })
}

/** Le paiement tel que Stripe le connaît (la seule source qui fait foi pour créditer) */
async function sessionStripe(cle, id) {
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${cle}` },
  })
  if (!r.ok) throw new Error(`Stripe ${r.status}`)
  return r.json()
}

const parisDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' })
const parisTime = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' })

async function notification(req, res) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const cle = process.env.STRIPE_SECRET_KEY
  if (!secret || !cle) { res.status(503).json({ error: 'Recharge en ligne non configurée.' }); return }
  const raw = await corpsBrut(req)
  let evt = null
  if (raw.length) {
    if (!verifierSignature(raw, req.headers['stripe-signature'], secret)) {
      res.status(400).json({ error: 'Signature invalide.' }); return
    }
    try { evt = JSON.parse(raw.toString('utf8')) } catch { res.status(400).json({ error: 'Message illisible.' }); return }
  } else if (req.body && typeof req.body === 'object') {
    evt = req.body   // corps déjà lu par la plateforme : la confirmation ci-dessous auprès de Stripe fait foi
  }
  const id = evt && evt.data && evt.data.object && evt.data.object.id
  if (!evt || !String(evt.type || '').startsWith('checkout.session.') || !id) { res.status(200).json({ recu: true }); return }
  let session
  try { session = await sessionStripe(cle, String(id)) }
  catch (e) { console.error('paiement (vérification):', e); res.status(502).json({ error: 'Vérification impossible, Stripe réessaiera.' }); return }
  const r = rechargeDepuisEvenement({ type: evt.type, data: { object: session } })
  if (!r) { res.status(200).json({ recu: true }); return }   // autre événement : rien à faire
  if (!ID.test(r.ev) || !ID.test(r.specDoc)) { res.status(200).json({ recu: true, ignore: 'références invalides' }); return }

  const db = getDb()
  const evRef = db.collection('events').doc(r.ev)
  const txRef = evRef.collection('transactions').doc(`stripe-${r.sessionId}`.slice(0, 150))
  const specRef = evRef.collection('spectateurs').doc(r.specDoc)
  const now = new Date()
  try {
    const resultat = await db.runTransaction(async (t) => {
      const [deja, spec] = await Promise.all([t.get(txRef), t.get(specRef)])
      if (deja.exists) return 'deja'
      if (!spec.exists || spec.data().id !== r.specId) return 'compte'
      const soldeBefore = Number(spec.data().solde) || 0
      t.update(specRef, { solde: admin.firestore.FieldValue.increment(r.montant) })
      t.set(txRef, {
        specId: r.specId, specNom: spec.data().nom || '—', type: 'credit', moyen: 'en-ligne',
        label: `Recharge en ligne ${(r.montant / 100).toFixed(2).replace('.', ',')} €`,
        montant: r.montant, staff: 'Stripe', soldeBefore, soldeAfter: soldeBefore + r.montant,
        stripeSession: r.sessionId, stripePaiement: r.paymentIntent || null,
        date: parisDate.format(now), heure: parisTime.format(now), timestamp: now.toISOString(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      return 'credite'
    })
    if (resultat === 'compte') {
      // Paiement reçu mais compte introuvable : on le garde visible pour l'équipe (remboursement ou crédit manuel)
      console.error('paiement: compte introuvable', r.ev, r.specId, r.sessionId)
      await evRef.collection('audit').add({
        action: 'RECHARGE_EN_LIGNE_SANS_COMPTE', specId: r.specId, montant: r.montant, staff: 'Stripe',
        label: `Paiement Stripe ${r.sessionId} reçu mais compte ${r.specId} introuvable`, timestamp: now.toISOString(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {})
    }
    if (resultat === 'credite') {
      await evRef.collection('audit').add({
        action: 'RECHARGE_EN_LIGNE', specId: r.specId, montant: r.montant, staff: 'Stripe',
        label: `Recharge en ligne de ${(r.montant / 100).toFixed(2)} € (Stripe)`, timestamp: now.toISOString(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {})
    }
    res.status(200).json({ recu: true, resultat })
  } catch (e) {
    console.error('paiement (notification):', e)
    res.status(500).json({ error: 'Enregistrement impossible, Stripe réessaiera.' })   // Stripe renvoie le message plus tard
  }
}

async function creer(req, res) {
  const cle = process.env.STRIPE_SECRET_KEY
  if (!cle) { res.status(503).json({ error: 'La recharge en ligne n\'est pas encore activée. Rechargez à la billetterie.' }); return }
  let body
  try { body = (await readBody(req)) || {} } catch { res.status(400).json({ error: 'Requête illisible.' }); return }
  const ev = String(body.ev || '')
  if (!ID.test(ev)) { res.status(400).json({ error: 'Événement manquant.' }); return }
  const caller = await verifyCaller(req)
  if (!caller || caller.type !== 'spectateur' || !(caller.eventIds || []).includes(ev) || !caller.specId || !caller.specDoc) {
    res.status(403).json({ error: 'Ouvrez votre espace avec votre lien ou votre QR pour recharger.' }); return
  }
  const montant = montantValide(body.montant)
  if (!montant) { res.status(400).json({ error: 'Choisissez un montant entre 5 € et 200 €.' }); return }
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
  const retour = retourValide(body.retour, host)
  if (!retour) { res.status(400).json({ error: 'Adresse de retour invalide.' }); return }

  const db = getDb()
  const event = await db.collection('events').doc(ev).get()
  if (!event.exists || event.data().deleted) { res.status(404).json({ error: 'Événement inconnu.' }); return }

  const params = paramsSession({ montant, ev, specId: caller.specId, specDoc: caller.specDoc, nomEvenement: event.data().nom || '', retour })
  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formEncode(params),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok || !data.url) {
      console.error('paiement (création):', r.status, data && data.error && data.error.message)
      res.status(502).json({ error: 'Le paiement en ligne est indisponible pour le moment. Réessayez ou rechargez à la billetterie.' }); return
    }
    res.status(200).json({ url: data.url, session: data.id })
  } catch (e) {
    console.error('paiement (création):', e)
    res.status(502).json({ error: 'Le paiement en ligne est indisponible pour le moment. Réessayez ou rechargez à la billetterie.' })
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST attendu.' }); return }
  // La notification de Stripe se reconnaît à sa signature : on lit alors le corps brut, sans l'interpréter avant
  if (req.headers['stripe-signature']) return notification(req, res)
  return creer(req, res)
}
