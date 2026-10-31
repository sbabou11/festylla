/**
 * hooks/useFCM.js — v4 STABLE
 * SW FCM enregistré séparément — fonctionne sur PC et mobile
 */
import { useEffect } from 'react'
import { db }        from '../firebase/config'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import useAuthStore  from '../store/useAuthStore'

const VAPID_KEY    = 'BIWPnTVnzojV9EQHpD584iIpp9F4uE3cGrv9ofEC01z6pSSFqJPxKidcYg4Fq28msKgOYR7z9lL8UjUT4YCYn-k'
const FCM_STOR_KEY = 'yllacash-fcm-token'

export function useFCM() {
  const { user } = useAuthStore()
  useEffect(() => {
    if (!user || user.id?.match(/^s\d+$/)) return
    initFCM(user)
  }, [user?.id])
}

async function initFCM(user) {
  try {
    const { isSupported, getMessaging, getToken, onMessage } = await import('firebase/messaging')
    if (!(await isSupported())) return

    if (Notification.permission === 'denied') return
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return
    }

    const { default: app } = await import('../firebase/config')
    const messaging = getMessaging(app)

    // Enregistrer le SW FCM dédié
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope:          '/firebase-cloud-messaging-push-scope',
      updateViaCache: 'none',
    })
    await reg.update()

    const token = await getToken(messaging, {
      vapidKey:                  VAPID_KEY,
      serviceWorkerRegistration: reg,
    })
    if (!token) return

    // Sauvegarder sans dupliquer
    const oldToken = localStorage.getItem(FCM_STOR_KEY)
    if (oldToken === token) return // Déjà à jour

    const ref  = doc(db, 'staff', user.id)
    const snap = await getDoc(ref)
    if (!snap.exists()) return

    const tokens = snap.data().fcmTokens || []
    // Remplacer l'ancien token, ajouter le nouveau
    const updated = [...new Set(
      tokens
        .filter(t => t !== oldToken) // Supprimer l'ancien
        .concat(token)               // Ajouter le nouveau
    )]

    await updateDoc(ref, { fcmTokens: updated })
    localStorage.setItem(FCM_STOR_KEY, token)

    // Messages en premier plan
    onMessage(messaging, payload => {
      const { title, body } = payload.notification || {}
      if (title) new Notification(title, { body: body || '', icon: '/logo-192.png' })
    })

  } catch (err) {
    console.warn('FCM:', err.message)
  }
}
