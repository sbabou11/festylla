/**
 * api/_paiement/stripe.js — recharge en ligne par Stripe (fonctions pures)
 *
 * Choix de l'organisateur (19/11/2026) : recharge du solde depuis l'espace spectateur par la page
 * de paiement hébergée de Stripe (carte, Apple Pay, Google Pay). Le solde n'est crédité que sur
 * la notification signée de Stripe (vérifiée ici), une seule fois par paiement.
 * Aucune clé dans le code : STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET sont des variables
 * d'environnement saisies par l'organisateur dans Vercel.
 */
const crypto = require('crypto')

const MIN = 500      // 5 €
const MAX = 20000    // 200 €

/** Montant en centimes, entier, de 5 € à 200 € ; sinon null */
function montantValide(v) {
  const n = Number(v)
  return Number.isInteger(n) && n >= MIN && n <= MAX ? n : null
}

/**
 * Adresse de retour : la page de l'espace spectateur sur le même site que la requête.
 * Renvoie l'adresse nettoyée (sans ancien paramètre « recharge ») ou null.
 */
function retourValide(retour, host) {
  let u
  try { u = new URL(String(retour || '')) } catch { return null }
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(u.host)
  if (!host || u.host !== host || (u.protocol !== 'https:' && !(local && u.protocol === 'http:'))) return null
  // /benevole : porte-monnaie du bénévole (écran 13, 24/11/2026)
  // « / » : bénévole connecté par mot de passe (son espace s'ouvre à l'accueil de l'appli)
  if (!['/solde', '/balance', '/spectateur', '/benevole', '/'].includes(u.pathname)) return null
  u.searchParams.delete('recharge')
  u.searchParams.delete('annule')
  return u.toString()
}

/** Encodage « formulaire » des paramètres imbriqués attendu par l'API de Stripe */
function formEncode(obj, prefix = '') {
  const out = []
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (typeof v === 'object') out.push(formEncode(v, key))
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`)
  }
  return out.filter(Boolean).join('&')
}

/** Paramètres de la page de paiement Stripe pour une recharge */
function paramsSession({ montant, ev, specId, specDoc, nomEvenement, retour }) {
  const sep = retour.includes('?') ? '&' : '?'
  return {
    mode: 'payment',
    'payment_method_types': undefined,   // laissé à Stripe : carte, Apple Pay, Google Pay selon le tableau de bord
    line_items: { 0: { quantity: 1, price_data: { currency: 'eur', unit_amount: montant,
      product_data: { name: `Recharge YllaCash${nomEvenement ? ` · ${nomEvenement}` : ''}`, description: `Compte ${specId}` } } } },
    client_reference_id: `${ev}:${specId}`,
    metadata: { ev, specId, specDoc, objet: 'recharge-yllacash' },
    payment_intent_data: { metadata: { ev, specId, objet: 'recharge-yllacash' } },
    success_url: `${retour}${sep}recharge={CHECKOUT_SESSION_ID}`,
    cancel_url: `${retour}${sep}annule=1`,
    locale: 'fr',
  }
}

/**
 * Vérifie l'en-tête Stripe-Signature (t=…,v1=…) : HMAC SHA-256 de « t.corps » avec le secret,
 * et date à moins de 5 minutes (rejeu). raw : corps exact reçu (Buffer ou texte).
 */
function verifierSignature(raw, entete, secret, nowSec = Math.floor(Date.now() / 1000), tolerance = 300) {
  if (!raw || !entete || !secret) return false
  const parts = String(entete).split(',').map(p => p.trim().split('='))
  const t = Number((parts.find(([k]) => k === 't') || [])[1])
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!Number.isFinite(t) || !sigs.length || Math.abs(nowSec - t) > tolerance) return false
  const attendu = crypto.createHmac('sha256', secret).update(`${t}.${Buffer.isBuffer(raw) ? raw.toString('utf8') : raw}`).digest('hex')
  const a = Buffer.from(attendu, 'hex')
  return sigs.some(s => {
    const b = Buffer.from(String(s), 'hex')
    return b.length === a.length && crypto.timingSafeEqual(a, b)
  })
}

/** Recharge à créditer d'après un événement Stripe, ou null s'il ne s'agit pas d'un paiement réglé de YllaCash */
function rechargeDepuisEvenement(evt) {
  if (!evt || !['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(evt.type)) return null
  const s = evt.data && evt.data.object
  if (!s || s.payment_status !== 'paid' || s.currency !== 'eur') return null
  const m = s.metadata || {}
  if (m.objet !== 'recharge-yllacash' || !m.ev || !m.specId || !m.specDoc) return null
  const montant = Number(s.amount_total)
  if (!Number.isInteger(montant) || montant <= 0) return null
  return { sessionId: String(s.id), ev: String(m.ev), specId: String(m.specId), specDoc: String(m.specDoc), montant,
    email: (s.customer_details && s.customer_details.email) || null, paymentIntent: s.payment_intent || null }
}

module.exports = { MIN, MAX, montantValide, retourValide, formEncode, paramsSession, verifierSignature, rechargeDepuisEvenement }
