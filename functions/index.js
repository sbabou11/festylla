/**
 * functions/index.js — Gen2
 * Firestore est en eur3, Functions en europe-west1
 * On utilise database pour spécifier la base Firestore
 */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { initializeApp }  = require('firebase-admin/app')
const { getFirestore }   = require('firebase-admin/firestore')
const { getMessaging }   = require('firebase-admin/messaging')

initializeApp()

const db        = getFirestore()
const messaging = getMessaging()

// Tokens FCM de tout le staff
async function getStaffTokens() {
  const snap = await db.collection('staff').get()
  const tokens = []
  snap.docs.forEach(d => tokens.push(...(d.data().fcmTokens || [])))
  return [...new Set(tokens)]
}

// Envoyer push
async function sendPush(tokens, title, body, data = {}) {
  if (!tokens.length) return
  try {
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data,
      webpush: {
        notification: { icon: '/logo-192.png' },
        fcmOptions:   { link: 'https://festishop.festylla.com' }
      },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    })
    console.log(`Push envoyé: ${res.successCount} succès, ${res.failureCount} échecs`)

    // Nettoyer automatiquement les tokens invalides
    const invalidTokens = []
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || ''
        if (code.includes('registration-token-not-registered') ||
            code.includes('invalid-registration-token') ||
            code.includes('invalid-argument')) {
          invalidTokens.push(tokens[i])
        }
      }
    })

    if (invalidTokens.length > 0) {
      console.log(`Nettoyage de ${invalidTokens.length} token(s) invalide(s)`)
      const staffSnap = await db.collection('staff').get()
      const batch = db.batch()
      staffSnap.docs.forEach(d => {
        const t       = d.data().fcmTokens || []
        const cleaned = t.filter(tok => !invalidTokens.includes(tok))
        if (cleaned.length !== t.length) {
          batch.update(d.ref, { fcmTokens: cleaned })
        }
      })
      await batch.commit()
    }
  } catch (err) {
    console.error('sendPush error:', err)
  }
}

// Nouvelle réservation
exports.onNewReservation = onDocumentCreated({
  document: 'events/{eventId}/reservations/{resaId}',
  region:   'europe-west1',
  database: '(default)',
}, async (event) => {
  const resa   = event.data.data()
  const tokens = await getStaffTokens()
  const items  = (resa.items || []).map(i => i.nom + (i.qty > 1 ? ` x${i.qty}` : '')).join(', ')
  await sendPush(tokens, 'Nouvelle reservation', `${resa.specNom || ''} a reserve : ${items}`, { type: 'RESA_CREEE' })
})

// Reservation prete
exports.onResaPrete = onDocumentUpdated({
  document: 'events/{eventId}/reservations/{resaId}',
  region:   'europe-west1',
  database: '(default)',
}, async (event) => {
  const before = event.data.before.data()
  const after  = event.data.after.data()
  if (before.status === after.status || after.status !== 'ready') return
  const tokens = await getStaffTokens()
  const items  = (after.items || []).map(i => i.nom).join(', ')
  await sendPush(tokens, 'Commande prete', `${after.specNom || ''} peut recuperer : ${items}`, { type: 'RESA_PRETE' })
})

// Credit
exports.onCredit = onDocumentCreated({
  document: 'events/{eventId}/transactions/{txId}',
  region:   'europe-west1',
  database: '(default)',
}, async (event) => {
  const tx = event.data.data()
  if (tx.type !== 'credit') return
  const tokens = await getStaffTokens()
  await sendPush(tokens, 'Recharge effectuee', `${tx.specNom || ''} a ete credite de ${((tx.montant || 0) / 100).toFixed(2)} EUR`, { type: 'CREDIT' })
})

// Stock bas
exports.onStockBas = onDocumentUpdated({
  document: 'events/{eventId}/menu/{itemId}',
  region:   'europe-west1',
  database: '(default)',
}, async (event) => {
  const before = event.data.before.data()
  const after  = event.data.after.data()
  const seuil  = after.seuilAlerte || 10
  const tokens = await getStaffTokens()
  if (before.stock > seuil && after.stock <= seuil && after.stock > 0) {
    await sendPush(tokens, `Stock bas - ${after.nom}`, `Il ne reste que ${after.stock} unite(s) de "${after.nom}"`, { type: 'ALERTE_STOCK' })
  }
  if (before.stock > 0 && after.stock === 0) {
    await sendPush(tokens, `Rupture - ${after.nom}`, `"${after.nom}" est en rupture totale`, { type: 'RUPTURE' })
  }
})

// Rapport Excel stylisé
const { generateRapport } = require('./generateRapport')
exports.generateRapport = generateRapport
