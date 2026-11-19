/**
 * api/process-reminders.js — Vercel Serverless Function (Node.js)
 *
 * Scanne TOUTES les collections events/{eventId}/scheduled-reminders/
 * et envoie une notif push à l'artiste pour chaque rappel dont :
 *   - dueAt <= maintenant
 *   - sent === false
 *
 * Conçu pour être appelé toutes les minutes par GitHub Actions Cron.
 * Idempotent : un rappel ne sera envoyé qu'une seule fois (champ "sent").
 *
 * Sécurité : protégé par un token secret pour éviter qu'un tiers ne déclenche
 * des notifications en spam. Le token est passé en header "x-cron-secret"
 * et comparé à process.env.CRON_SECRET (variable Vercel).
 *
 * Méthode acceptée : GET (cron) ou POST (debug manuel).
 */

const admin = require('firebase-admin')

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
  if (creds.private_key && creds.private_key.includes('\\n')) {
    creds.private_key = creds.private_key.replace(/\\n/g, '\n')
  }
  app = admin.initializeApp({
    credential: admin.credential.cert(creds),
  })
  return app
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-cron-secret')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  // ── Vérif token (sauf pour appels locaux/admin)  ─────────────────
  const expected = process.env.CRON_SECRET
  const provided = req.headers['x-cron-secret'] || req.query?.secret
  if (expected && expected !== provided) {
    res.status(401).json({ error: 'Unauthorized: invalid or missing x-cron-secret' })
    return
  }

  // ── Init Firebase Admin ──────────────────────────────────────────
  try { getAdminApp() } catch (e) {
    console.error('Firebase admin init error:', e.message)
    res.status(500).json({ error: 'Backend mal configuré : ' + e.message })
    return
  }
  const db = admin.firestore()

  const startedAt = new Date().toISOString()
  const summary = {
    startedAt,
    events: 0,
    remindersFound: 0,
    remindersSent: 0,
    skipped: [],     // détaille les rappels non envoyés et pourquoi
    sent: [],        // détaille les envois réussis
    errors: [],
  }

  // ── 1. Liste tous les événements actifs ──────────────────────────
  let eventDocs
  try {
    const snap = await db.collection('events').get()
    eventDocs = snap.docs.filter(d => !d.data().deleted)
  } catch (e) {
    res.status(500).json({ error: 'Impossible de lire les événements : ' + e.message })
    return
  }
  summary.events = eventDocs.length

  // ── 2. Pour chaque événement, traite les rappels dus ─────────────
  const now = Date.now()
  for (const evDoc of eventDocs) {
    const eventId = evDoc.id
    try {
      // Récupère les rappels dus (dueAt <= now ET sent == false)
      // On évite le double where pour ne pas exiger d'index composite
      const remindersSnap = await db
        .collection('events').doc(eventId)
        .collection('scheduled-reminders')
        .where('sent', '==', false)
        .get()

      // Filtre côté code : dueAt <= now (et pas trop dans le passé pour limiter spam)
      const dueReminders = remindersSnap.docs.filter(d => {
        const due = new Date(d.data().dueAt).getTime()
        if (isNaN(due)) return false
        if (due > now) return false              // pas encore l'heure
        if (due < now - 10 * 60_000) return false // trop vieux (>10min), on skip
        return true
      })

      if (dueReminders.length === 0) continue
      summary.remindersFound += dueReminders.length

      // Pour chaque rappel dû, on envoie une notif à l'artiste
      for (const remDoc of dueReminders) {
        const rem = remDoc.data()
        try {
          // Identifier l'artiste et récupérer ses tokens FCM.
          // 3 pistes par ordre de priorité :
          //   A. Tokens stockés directement sur le créneau planning (artistFcmTokens)
          //      → c'est le cas standard depuis v8 debug, quand l'artiste a activé
          //         les notifs depuis son espace artiste
          //   B. Si artisteId pointe vers un spectateur (rare/legacy)
          //   C. Si le créneau a un linkedSpecId, on cherche les tokens du spectateur lié
          let tokens = []

          // Piste A : tokens sur le créneau lui-même (cas standard)
          if (rem.creneauId) {
            const crSnap = await db
              .collection('events').doc(eventId)
              .collection('planning').doc(rem.creneauId).get()
            if (crSnap.exists) {
              const cr = crSnap.data()
              if (Array.isArray(cr.artistFcmTokens)) {
                tokens = cr.artistFcmTokens.filter(t => !!t)
              }

              // Piste C : si pas de token direct, essayer via linkedSpecId
              if (tokens.length === 0 && cr.linkedSpecId) {
                const specSnap = await db
                  .collection('events').doc(eventId)
                  .collection('spectateurs')
                  .where('id', '==', cr.linkedSpecId)
                  .limit(1).get()
                if (!specSnap.empty) {
                  tokens = (specSnap.docs[0].data().fcmTokens || []).filter(t => !!t)
                }
              }
            }
          }

          // Piste B : si artisteId pointe directement vers un spectateur (rare)
          if (tokens.length === 0 && rem.artisteId) {
            const specSnap = await db
              .collection('events').doc(eventId)
              .collection('spectateurs')
              .where('id', '==', rem.artisteId)
              .limit(1).get()
            if (!specSnap.empty) {
              tokens = (specSnap.docs[0].data().fcmTokens || []).filter(t => !!t)
            }
          }

          if (tokens.length === 0) {
            // Pas de token → on enregistre le skip (avec contexte) ET on marque
            // le rappel comme envoyé pour ne pas le réessayer à chaque tick
            const skipInfo = {
              reminderId: remDoc.id,
              creneauId: rem.creneauId,
              artiste: rem.artiste,
              type: rem.type,
              reason: 'no-token',
              detail: 'Aucun token FCM trouvé pour cet artiste. Vérifiez qu\'il a ouvert son espace artiste et activé les notifications.',
            }
            summary.skipped.push(skipInfo)
            await remDoc.ref.update({
              sent: true,
              sentAt: new Date().toISOString(),
              skippedReason: 'no-token',
            })
            continue
          }

          // 2) Construit la notification
          const sceneText = rem.scene ? ` · ${rem.scene}` : ''
          const isBalance = rem.type.startsWith('balance')
          const body = isBalance
            ? `${rem.title}${sceneText}`
            : `${rem.title}${sceneText}`
          const title = `${rem.icon || '🔔'} ${rem.artiste || 'Artiste'}`

          const message = {
            tokens,
            notification: { title, body },
            data: {
              type: 'artist-reminder',
              reminderType: rem.type,
              creneauId: rem.creneauId || '',
              url: '/?p=espace-artiste',
            },
            webpush: {
              notification: {
                icon:  '/logo-192.png',
                badge: '/logo-192.png',
                vibrate: [400, 200, 400, 200, 400],
                tag:   `reminder-${rem.creneauId}-${rem.type}`,
                renotify: true,
                requireInteraction: true, // ne disparaît pas tout seul
              },
              fcmOptions: { link: '/?p=espace-artiste' },
            },
            android: {
              notification: {
                color: '#009090',
                priority: 'high',
                sound: 'default',
                channelId: 'artist-reminders',
              },
              priority: 'high',
            },
            apns: {
              payload: {
                aps: { sound: 'default', badge: 1, 'interruption-level': 'time-sensitive' },
              },
            },
          }

          // 3) Envoi FCM
          const resp = await admin.messaging().sendEachForMulticast(message)
          summary.remindersSent += resp.successCount

          // Détail dans le summary
          summary.sent.push({
            reminderId: remDoc.id,
            creneauId: rem.creneauId,
            artiste: rem.artiste,
            type: rem.type,
            tokensCount: tokens.length,
            successCount: resp.successCount,
            failureCount: resp.failureCount,
            errors: resp.responses
              .filter(r => !r.success)
              .map(r => r.error?.code || r.error?.message || 'unknown')
              .slice(0, 3),
          })

          // Tokens invalides à nettoyer côté Firestore (best-effort)
          const invalid = []
          resp.responses.forEach((r, i) => {
            if (!r.success) {
              const code = r.error?.code || ''
              if (code === 'messaging/invalid-registration-token' ||
                  code === 'messaging/registration-token-not-registered') {
                invalid.push(tokens[i])
              }
            }
          })
          if (invalid.length > 0) {
            // Nettoyer sur le créneau planning (cas standard v8 debug)
            if (rem.creneauId) {
              try {
                const crRef = db.collection('events').doc(eventId)
                  .collection('planning').doc(rem.creneauId)
                const crSnap = await crRef.get()
                if (crSnap.exists) {
                  const arr = crSnap.data().artistFcmTokens || []
                  const cleaned = arr.filter(t => !invalid.includes(t))
                  if (cleaned.length !== arr.length) {
                    await crRef.update({ artistFcmTokens: cleaned })
                  }
                }
              } catch {}
            }
            // Et aussi sur le spectateur lié (cas legacy)
            if (rem.artisteId) {
              try {
                const specSnap = await db
                  .collection('events').doc(eventId)
                  .collection('spectateurs')
                  .where('id', '==', rem.artisteId)
                  .limit(1).get()
                if (!specSnap.empty) {
                  const cleanTokens = (specSnap.docs[0].data().fcmTokens || [])
                    .filter(t => !invalid.includes(t))
                  await specSnap.docs[0].ref.update({ fcmTokens: cleanTokens })
                }
              } catch {}
            }
          }

          // 4) Marque le rappel comme envoyé
          await remDoc.ref.update({
            sent: true,
            sentAt: new Date().toISOString(),
            sentCount: resp.successCount,
            failedCount: resp.failureCount,
          })
        } catch (e) {
          summary.errors.push({ eventId, reminderId: remDoc.id, error: e.message })
        }
      }
    } catch (e) {
      summary.errors.push({ eventId, error: e.message })
    }
  }

  summary.finishedAt = new Date().toISOString()
  res.status(200).json(summary)
}
