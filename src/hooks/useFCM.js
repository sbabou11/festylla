/**
 * hooks/useFCM.js — v8 debug (fix refresh + double instance)
 *
 * Gestion robuste des notifications push (vraies push, fonctionnent
 * même app fermée / téléphone verrouillé via /api/send-push backend).
 *
 * Architecture singleton :
 *   - Un seul état FCM partagé pour toute l'app (qu'il y ait 1, 2, ou N
 *     composants qui appellent useFCM)
 *   - L'init du SW FCM ne se fait qu'une seule fois
 *   - Tous les composants montés voient le même état et reçoivent les updates
 *
 * Fonctionne sur :
 *   ✓ Chrome desktop / Android (toutes versions récentes)
 *   ✓ Firefox desktop (Android : Mozilla a retiré le support en 2024)
 *   ✓ Edge / EMUI (moteur Chromium)
 *   ✓ iOS 16.4+ — UNIQUEMENT en mode PWA installée sur l'écran d'accueil
 */

import { useEffect, useState, useCallback } from 'react'
import { db } from '../firebase/config'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import useAuthStore from '../store/useAuthStore'

const VAPID_KEY    = 'BIWPnTVnzojV9EQHpD584iIpp9F4uE3cGrv9ofEC01z6pSSFqJPxKidcYg4Fq28msKgOYR7z9lL8UjUT4YCYn-k'
const FCM_STOR_KEY = 'yllacash-fcm-token'

// ═══════════════════════════════════════════════════════════════════════
// État partagé entre toutes les instances du hook
// ═══════════════════════════════════════════════════════════════════════

let sharedStatus = { ready: false, token: null, error: null, capabilities: null, isRefreshing: false }
let initPromise  = null
const subscribers = new Set()

function setSharedStatus(updater) {
  sharedStatus = typeof updater === 'function' ? updater(sharedStatus) : { ...sharedStatus, ...updater }
  subscribers.forEach(cb => { try { cb(sharedStatus) } catch {} })
}

/**
 * Détection des capacités de l'appareil — appelée par l'UI pour informer l'admin.
 * Recalculée à chaque appel : la permission peut changer entre 2 appels.
 */
export function detectPushCapabilities() {
  const isIOS    = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
  const isPWA    = window.matchMedia('(display-mode: standalone)').matches ||
                   window.navigator.standalone === true
  const hasNotif = 'Notification' in window
  const hasSW    = 'serviceWorker' in navigator
  const hasPush  = 'PushManager' in window
  const iosBlocking = isIOS && !isPWA

  return {
    supported: hasNotif && hasSW && hasPush && !iosBlocking,
    permission: hasNotif ? Notification.permission : 'unavailable',
    isIOS,
    isPWA,
    iosBlocking,
    reason: !hasNotif ? 'Notification API non supportée'
          : !hasSW   ? 'Service workers non supportés'
          : !hasPush ? 'PushManager non supporté'
          : iosBlocking ? "Sur iOS, vous devez d'abord installer l'app sur l'écran d'accueil (Partager → Sur l'écran d'accueil) pour activer les notifications"
          : null,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Hook public
// ═══════════════════════════════════════════════════════════════════════

export function useFCM() {
  const { user } = useAuthStore()
  const [status, setStatus] = useState(sharedStatus)

  // S'abonner aux changements de l'état partagé
  useEffect(() => {
    subscribers.add(setStatus)
    return () => { subscribers.delete(setStatus) }
  }, [])

  // Init automatique au login (idempotent grâce à initPromise singleton)
  useEffect(() => {
    if (!user || user.id?.match(/^s\d+$/)) return
    if (initPromise) return // déjà en cours / déjà fait
    initPromise = initFCM(user).then(r => {
      setSharedStatus({ ...r, isRefreshing: false })
      return r
    }).catch(e => {
      const r = { ready: false, error: e?.message || String(e), token: null, capabilities: detectPushCapabilities(), isRefreshing: false }
      setSharedStatus(r)
      return r
    })
  }, [user?.id])

  // Refresh manuel : re-vérifie permission et token
  const refresh = useCallback(async () => {
    if (!user) return
    if (sharedStatus.isRefreshing) return
    setSharedStatus({ isRefreshing: true, error: null })
    try {
      const r = await initFCM(user, { force: true })
      setSharedStatus({ ...r, isRefreshing: false })
      // Permet de relancer une nouvelle init après refresh
      initPromise = Promise.resolve(r)
      return r
    } catch (e) {
      const r = { ready: false, error: e?.message || String(e), token: null, capabilities: detectPushCapabilities(), isRefreshing: false }
      setSharedStatus(r)
      return r
    }
  }, [user])

  return { ...status, refresh }
}

async function initFCM(user, { force = false } = {}) {
  const caps = detectPushCapabilities()
  if (!caps.supported) return { ready: false, error: caps.reason, token: null, capabilities: caps }

  if (Notification.permission === 'denied') {
    return { ready: false, error: "Notifications refusées par l'utilisateur", token: null, capabilities: caps }
  }
  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') {
      return { ready: false, error: 'Notifications non accordées', token: null, capabilities: { ...caps, permission: perm } }
    }
  }

  const { isSupported, getMessaging, getToken, onMessage } = await import('firebase/messaging')
  if (!(await isSupported())) {
    return { ready: false, error: 'Firebase Messaging non supporté sur ce navigateur', token: null, capabilities: caps }
  }

  const { default: app } = await import('../firebase/config')
  const messaging = getMessaging(app)

  let reg
  try {
    reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope:          '/firebase-cloud-messaging-push-scope',
      updateViaCache: 'none',
    })
    if (force) await reg.update()
    if (reg.installing) {
      await new Promise(resolve => {
        const sw = reg.installing
        sw.addEventListener('statechange', () => {
          if (sw.state === 'activated') resolve()
        })
      })
    }
  } catch (e) {
    return { ready: false, error: "Impossible d'enregistrer le SW FCM : " + e.message, token: null, capabilities: caps }
  }

  let token
  try {
    token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: reg,
    })
  } catch (e) {
    return { ready: false, error: "Impossible d'obtenir le token FCM : " + e.message, token: null, capabilities: caps }
  }
  if (!token) {
    return { ready: false, error: 'Token FCM vide (autorisation manquante ?)', token: null, capabilities: caps }
  }

  await saveTokenToFirestore(user, token)

  // Listener foreground (affiche notif système même app ouverte)
  onMessage(messaging, payload => {
    const { title, body } = payload.notification || {}
    try {
      if (reg && reg.showNotification) {
        reg.showNotification(title || 'YllaCash', {
          body:  body || '',
          icon:  '/logo-192.png',
          badge: '/logo-192.png',
          vibrate: [200, 100, 200],
          tag: payload.data?.tag || 'yllacash-fg',
          renotify: true,
          data: payload.data || {},
        })
      } else if (title) {
        new Notification(title, { body: body || '', icon: '/logo-192.png' })
      }
    } catch {}
  })

  return { ready: true, error: null, token, capabilities: caps }
}

async function saveTokenToFirestore(user, token) {
  const oldToken = localStorage.getItem(FCM_STOR_KEY)
  if (oldToken === token) return

  const paths = []
  if (user.eventId) paths.push(doc(db, 'events', user.eventId, 'staff', user.id))
  paths.push(doc(db, 'staff', user.id))

  for (const ref of paths) {
    try {
      const snap = await getDoc(ref)
      if (!snap.exists()) continue
      const tokens = snap.data().fcmTokens || []
      const updated = [...new Set(
        tokens
          .filter(t => t && t !== oldToken)
          .concat(token)
      )].slice(-10)
      await updateDoc(ref, { fcmTokens: updated })
      localStorage.setItem(FCM_STOR_KEY, token)
      return true
    } catch (e) {
      continue
    }
  }
  localStorage.setItem(FCM_STOR_KEY, token)
  return false
}

export async function unregisterFCMToken(user) {
  const token = localStorage.getItem(FCM_STOR_KEY)
  if (!token || !user) return
  const paths = []
  if (user.eventId) paths.push(doc(db, 'events', user.eventId, 'staff', user.id))
  paths.push(doc(db, 'staff', user.id))
  for (const ref of paths) {
    try {
      const snap = await getDoc(ref)
      if (!snap.exists()) continue
      const tokens = (snap.data().fcmTokens || []).filter(t => t !== token)
      await updateDoc(ref, { fcmTokens: tokens })
      break
    } catch {}
  }
  localStorage.removeItem(FCM_STOR_KEY)
}

/**
 * Helper utilitaire : envoie une notif push à un ou plusieurs utilisateurs.
 * Récupère leurs tokens depuis Firestore puis appelle /api/send-push.
 */
export async function sendPushToUsers(userIds, { title, body, data, eventId }) {
  if (!Array.isArray(userIds) || userIds.length === 0) return { sent: 0 }
  const tokens = new Set()
  for (const uid of userIds) {
    const paths = []
    if (eventId) paths.push(doc(db, 'events', eventId, 'staff', uid))
    paths.push(doc(db, 'staff', uid))
    for (const ref of paths) {
      try {
        const snap = await getDoc(ref)
        if (!snap.exists()) continue
        const arr = snap.data().fcmTokens || []
        arr.forEach(t => t && tokens.add(t))
        break
      } catch {}
    }
  }
  if (tokens.size === 0) return { sent: 0, reason: 'no-tokens' }

  try {
    const resp = await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokens: [...tokens],
        title, body, data: data || {},
        eventId,
      }),
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return { sent: 0, error: 'HTTP ' + resp.status + ' ' + text }
    }
    const json = await resp.json()
    if (json.invalidTokens?.length && eventId) {
      cleanupInvalidTokens(json.invalidTokens, eventId).catch(() => {})
    }
    return { sent: json.successCount || 0, failed: json.failureCount || 0 }
  } catch (e) {
    return { sent: 0, error: e.message }
  }
}

async function cleanupInvalidTokens(invalidTokens, eventId) {
  if (!invalidTokens?.length) return
  const { collection, getDocs } = await import('firebase/firestore')
  try {
    const snap = await getDocs(collection(db, 'events', eventId, 'staff'))
    for (const d of snap.docs) {
      const tokens = (d.data().fcmTokens || []).filter(t => !invalidTokens.includes(t))
      if (tokens.length !== (d.data().fcmTokens || []).length) {
        await updateDoc(d.ref, { fcmTokens: tokens })
      }
    }
  } catch {}
}
