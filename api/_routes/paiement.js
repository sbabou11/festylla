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
 *   POST { action: 'rembourser', ev }                 espace spectateur (bouton maintenu 3 s, 20/11/2026) :
 *        demande de remboursement du solde. La part rechargée en ligne est remboursée tout de suite
 *        par Stripe (solde débité d'abord, recrédité si Stripe refuse) ; la part SumUp et les espèces
 *        attendent la billetterie (events/{ev}/demandes-remboursement).
 *   POST { action: 'annulerDemande', ev, id }         le spectateur annule la partie billetterie.
 * Variables d'environnement (saisies par l'organisateur dans Vercel, jamais dans le code) :
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
 */
const { admin, getDb, verifyCaller } = require('../_auth/server')
const { readBody } = require('../_billets/admin')
const { montantValide, retourValide, formEncode, paramsSession, verifierSignature, rechargeDepuisEvenement } = require('../_paiement/stripe')
const { planRemboursement } = require('../_paiement/remboursement')

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

async function creer(req, res, lu) {
  const cle = process.env.STRIPE_SECRET_KEY
  if (!cle) { res.status(503).json({ error: 'La recharge en ligne n\'est pas encore activée. Rechargez à la billetterie.' }); return }
  const body = lu || {}
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

// ── Remboursement du solde demandé par le spectateur (20/11/2026) ─────────────────────────
const euros = (c) => (c / 100).toFixed(2).replace('.', ',') + ' €'

/** Rembourse un paiement Stripe (clé anti-doublon : un même essai ne rembourse jamais deux fois) */
async function rembourserStripe(cle, { paiement, montant, idem, meta }) {
  const r = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': idem },
    body: formEncode({ payment_intent: paiement, amount: montant, metadata: meta }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((data.error && data.error.message) || `Stripe ${r.status}`)
  return data
}

async function spectateurAppelant(req, res, body) {
  const ev = String(body.ev || '')
  if (!ID.test(ev)) { res.status(400).json({ error: 'Événement manquant.' }); return null }
  const caller = await verifyCaller(req)
  if (!caller || caller.type !== 'spectateur' || !(caller.eventIds || []).includes(ev) || !caller.specId || !caller.specDoc) {
    res.status(403).json({ error: 'Ouvrez votre espace avec votre lien ou votre QR.' }); return null
  }
  return { ev, caller }
}

async function rembourser(req, res, body) {
  const who = await spectateurAppelant(req, res, body)
  if (!who) return
  const { ev, caller } = who
  const db = getDb()
  const evRef = db.collection('events').doc(ev)
  const specRef = evRef.collection('spectateurs').doc(String(caller.specDoc))
  const demandeRef = evRef.collection('demandes-remboursement').doc()
  const now = new Date()
  const date = parisDate.format(now), heure = parisTime.format(now), iso = now.toISOString()
  const ts = admin.firestore.FieldValue.serverTimestamp()

  let plan, specNom, txIds = []
  try {
    await db.runTransaction(async (t) => {
      const spec = await t.get(specRef)
      if (!spec.exists || spec.data().id !== caller.specId) throw Object.assign(new Error('Compte introuvable.'), { status: 404 })
      const enCours = spec.data().demandeRemboursement
      if (enCours) {
        const d = await t.get(evRef.collection('demandes-remboursement').doc(String(enCours)))
        if (d.exists && d.data().statut === 'en_attente') throw Object.assign(new Error('Une demande de remboursement est déjà en cours.'), { status: 409 })
      }
      const txsSnap = await t.get(evRef.collection('transactions').where('specId', '==', caller.specId))
      const solde = Number(spec.data().solde) || 0
      plan = planRemboursement({ solde, txs: txsSnap.docs.map(d => d.data()) })
      if (plan.total <= 0) throw Object.assign(new Error('Votre solde est à zéro : rien à rembourser.'), { status: 409 })
      if (plan.stripeTotal > 0 && !process.env.STRIPE_SECRET_KEY) {
        throw Object.assign(new Error('Le remboursement en ligne n\'est pas disponible. Présentez-vous à la billetterie.'), { status: 503 })
      }
      specNom = spec.data().nom || '—'
      const billetterie = plan.sumup + plan.especes > 0
      // Solde débité de la part Stripe avant d'appeler Stripe (recrédité plus bas si Stripe refuse)
      let soldeCourant = solde
      plan.stripe.forEach(p => {
        const ref = evRef.collection('transactions').doc()
        txIds.push({ ref, ...p })
        t.set(ref, {
          specId: caller.specId, specNom, type: 'remboursement', surPlace: true, moyen: 'en-ligne', staff: 'Stripe',
          label: `Remboursement en ligne ${euros(p.montant)} (demande du spectateur)`,
          montant: p.montant, soldeBefore: soldeCourant, soldeAfter: soldeCourant - p.montant,
          stripePaiement: p.paiement, statutStripe: 'en_cours', demandeId: demandeRef.id,
          date, heure, timestamp: iso, createdAt: ts,
        })
        soldeCourant -= p.montant
      })
      t.update(specRef, {
        ...(plan.stripeTotal > 0 ? { solde: admin.firestore.FieldValue.increment(-plan.stripeTotal) } : {}),
        demandeRemboursement: billetterie ? demandeRef.id : null,
      })
      const part = (m) => ({ montant: m, statut: m > 0 ? 'a_traiter' : 'sans' })
      t.set(demandeRef, {
        specId: caller.specId, specNom, specDoc: String(caller.specDoc), total: plan.total,
        stripe: { montant: plan.stripeTotal, statut: plan.stripeTotal > 0 ? 'en_cours' : 'sans', paiements: plan.stripe },
        sumup: { ...part(plan.sumup), recharges: plan.sumupRecharges }, especes: part(plan.especes),
        statut: billetterie ? 'en_attente' : 'rembourse', date, heure, timestamp: iso, createdAt: ts,
      })
    })
  } catch (e) {
    if (e.status) { res.status(e.status).json({ error: e.message }); return }
    console.error('paiement (remboursement):', e)
    res.status(500).json({ error: 'Demande impossible pour le moment, réessayez.' }); return
  }

  // Remboursements Stripe, paiement par paiement
  const cle = process.env.STRIPE_SECRET_KEY
  let rendu = 0, echecs = 0
  for (const x of txIds) {
    try {
      const r = await rembourserStripe(cle, {
        paiement: x.paiement, montant: x.montant, idem: `yllacash-${demandeRef.id}-${x.paiement}`,
        meta: { ev, specId: caller.specId, demande: demandeRef.id, objet: 'remboursement-yllacash' },
      })
      await x.ref.update({ statutStripe: 'rembourse', stripeRemboursement: r.id || null })
      rendu += x.montant
    } catch (e) {
      console.error('paiement (remboursement Stripe):', x.paiement, e.message)
      echecs++
      // Stripe a refusé : le montant revient sur le solde, la ligne disparaît du journal
      await db.runTransaction(async (t) => {
        t.update(specRef, { solde: admin.firestore.FieldValue.increment(x.montant) })
        t.delete(x.ref)
      }).catch(err => console.error('paiement (recrédit):', err))
    }
  }
  if (txIds.length) {
    const stripeStatut = echecs === 0 ? 'rembourse' : rendu > 0 ? 'partiel' : 'echec'
    const maj = { 'stripe.statut': stripeStatut, 'stripe.rendu': rendu }
    if (plan.sumup + plan.especes === 0) maj.statut = rendu > 0 ? 'rembourse' : 'echec'
    await demandeRef.update(maj).catch(() => {})
    await evRef.collection('audit').add({
      action: 'REMBOURSEMENT_EN_LIGNE', specId: caller.specId, montant: rendu, staff: 'Stripe',
      label: `Remboursement en ligne de ${euros(rendu)} demandé par ${specNom}${echecs ? ` (${echecs} refus de Stripe)` : ''}`,
      timestamp: iso, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {})
  }
  res.status(200).json({
    id: demandeRef.id, stripe: rendu, stripeEchec: plan.stripeTotal - rendu, sumup: plan.sumup, especes: plan.especes,
  })
}

async function annulerDemande(req, res, body) {
  const who = await spectateurAppelant(req, res, body)
  if (!who) return
  const { ev, caller } = who
  const id = String(body.id || '')
  if (!ID.test(id)) { res.status(400).json({ error: 'Demande inconnue.' }); return }
  const db = getDb()
  const evRef = db.collection('events').doc(ev)
  try {
    await db.runTransaction(async (t) => {
      const ref = evRef.collection('demandes-remboursement').doc(id)
      const d = await t.get(ref)
      if (!d.exists || d.data().specId !== caller.specId) throw Object.assign(new Error('Demande introuvable.'), { status: 404 })
      if (d.data().statut !== 'en_attente') throw Object.assign(new Error('Cette demande est déjà traitée.'), { status: 409 })
      const maj = { statut: 'annule', annuleLe: admin.firestore.FieldValue.serverTimestamp() }
      ;['sumup', 'especes'].forEach(k => { if (d.data()[k] && d.data()[k].statut === 'a_traiter') maj[`${k}.statut`] = 'annule' })
      t.update(ref, maj)
      t.update(evRef.collection('spectateurs').doc(String(caller.specDoc)), { demandeRemboursement: null })
    })
    res.status(200).json({ ok: true })
  } catch (e) {
    if (e.status) { res.status(e.status).json({ error: e.message }); return }
    console.error('paiement (annulation demande):', e)
    res.status(500).json({ error: 'Annulation impossible pour le moment.' })
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST attendu.' }); return }
  // La notification de Stripe se reconnaît à sa signature : on lit alors le corps brut, sans l'interpréter avant
  if (req.headers['stripe-signature']) return notification(req, res)
  // Corps lu une seule fois ici, puis transmis à l'action
  let body
  try { body = (await readBody(req)) || {} } catch { res.status(400).json({ error: 'Requête illisible.' }); return }
  if (body.action === 'rembourser') return rembourser(req, res, body)
  if (body.action === 'annulerDemande') return annulerDemande(req, res, body)
  return creer(req, res, body)
}
