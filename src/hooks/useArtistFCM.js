/**
 * hooks/useArtistFCM.js — v8 debug
 *
 * Hook qui enregistre un token FCM pour un artiste sur SON créneau planning.
 * Les artistes ne sont pas connectés comme staff — ils accèdent à leur espace
 * via un lien direct `/artiste?ev=...&cr=...`. Donc leurs tokens FCM doivent
 * être stockés sur le créneau (pas sur un compte staff).
 *
 * Stockage : events/{eventId}/planning/{creneauId}.artistFcmTokens[]
 *
 * Comportement :
 *   - Au montage : si les notifs sont déjà autorisées (granted), enregistre auto
 *   - Si permission "default" : ne demande PAS automatiquement (rude). Expose
 *     une fonction enable() à appeler au clic d'un bouton.
 *   - Si "denied" : on ne peut rien faire (l'artiste doit débloquer en paramètres)
 *
 * Exporte :
 *   - status: { state: 'unsupported'|'denied'|'default'|'granted'|'enrolled', error?, token? }
 *   - enable(): demande la permission et enregistre le token
 */

import { useEffect, useState, useCallback } from 'react'
import { db } from '../firebase/config'
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore'

const VAPID_KEY = 'BIWPnTVnzojV9EQHpD584iIpp9F4uE3cGrv9ofEC01z6pSSFqJPxKidcYg4Fq28msKgOYR7z9lL8UjUT4YCYn-k'

function detectCapabilities() {
  const isIOS    = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
  const isPWA    = window.matchMedia('(display-mode: standalone)').matches ||
                   window.navigator.standalone === true
  const hasNotif = 'Notification' in window
  const hasSW    = 'serviceWorker' in navigator
  const hasPush  = 'PushManager' in window
  const iosBlocking = isIOS && !isPWA
  return {
    supported: hasNotif && hasSW && hasPush && !iosBlocking,
    isIOS, isPWA, iosBlocking,
    reason: !hasNotif ? 'Notifications non supportées par ce navigateur'
          : !hasSW   ? 'Service workers non supportés'
          : !hasPush ? 'PushManager non supporté'
          : iosBlocking ? "Sur iPhone, ajoutez d'abord l'app sur l'écran d'accueil (Partager → Sur l'écran d'accueil) pour activer les notifications"
          : null,
  }
}

export default function useArtistFCM({ eventId, creneauId, autoEnableIfGranted = true }) {
  const [status, setStatus] = useState({ state: 'idle', token: null, error: null, capabilities: null })

  // Enregistre le token sur le créneau planning (Firestore)
  const saveTokenToCreneau = useCallback(async (token) => {
    if (!eventId || !creneauId || !token) return false
    try {
      const ref = doc(db, 'events', eventId, 'planning', creneauId)
      const snap = await getDoc(ref)
      if (!snap.exists()) {
        console.warn('[ArtistFCM] Créneau introuvable pour enregistrer le token')
        return false
      }
      const existing = snap.data().artistFcmTokens || []
      // Évite les doublons et garde max 5 tokens (5 appareils max par artiste)
      const updated = [...new Set([...existing.filter(t => t && t !== token), token])].slice(-5)
      await updateDoc(ref, { artistFcmTokens: updated })
      console.log('[ArtistFCM] Token enregistré sur le créneau')
      return true
    } catch (e) {
      console.warn('[ArtistFCM] Save token failed:', e.message)
      return false
    }
  }, [eventId, creneauId])

  // Génère le token FCM et l'enregistre
  const generateAndSaveToken = useCallback(async () => {
    const caps = detectCapabilities()
    if (!caps.supported) {
      setStatus({ state: 'unsupported', error: caps.reason, capabilities: caps })
      return null
    }
    try {
      const { isSupported, getMessaging, getToken } = await import('firebase/messaging')
      if (!(await isSupported())) {
        setStatus({ state: 'unsupported', error: 'Firebase Messaging non supporté', capabilities: caps })
        return null
      }
      const { default: app } = await import('../firebase/config')
      const messaging = getMessaging(app)

      // Enregistre le SW FCM si pas déjà fait
      const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/firebase-cloud-messaging-push-scope',
        updateViaCache: 'none',
      })
      if (reg.installing) {
        await new Promise(resolve => {
          const sw = reg.installing
          sw.addEventListener('statechange', () => {
            if (sw.state === 'activated') resolve()
          })
        })
      }

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: reg,
      })
      if (!token) {
        setStatus({ state: 'denied', error: 'Token vide — permission peut-être refusée', capabilities: caps })
        return null
      }

      const saved = await saveTokenToCreneau(token)
      if (saved) {
        setStatus({ state: 'enrolled', token, error: null, capabilities: caps })
        return token
      } else {
        setStatus({ state: 'granted', token, error: "Impossible d'enregistrer le token côté serveur", capabilities: caps })
        return token
      }
    } catch (e) {
      console.warn('[ArtistFCM] generateAndSaveToken failed:', e.message)
      setStatus({ state: 'error', error: e.message, capabilities: detectCapabilities() })
      return null
    }
  }, [saveTokenToCreneau])

  // Fonction publique : demande la permission puis enregistre
  const enable = useCallback(async () => {
    const caps = detectCapabilities()
    if (!caps.supported) {
      setStatus({ state: 'unsupported', error: caps.reason, capabilities: caps })
      return false
    }
    if (Notification.permission === 'denied') {
      setStatus({ state: 'denied', error: 'Vous avez refusé les notifications. Pour les réactiver, allez dans les paramètres du site dans votre navigateur.', capabilities: caps })
      return false
    }
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setStatus({ state: 'denied', error: 'Permission refusée', capabilities: caps })
        return false
      }
    }
    return !!(await generateAndSaveToken())
  }, [generateAndSaveToken])

  // Init au montage : si déjà accordé, enregistre auto (silencieux)
  useEffect(() => {
    if (!eventId || !creneauId) return
    const caps = detectCapabilities()
    setStatus(s => ({ ...s, capabilities: caps }))
    if (!caps.supported) {
      setStatus({ state: 'unsupported', error: caps.reason, capabilities: caps })
      return
    }
    if (Notification.permission === 'denied') {
      setStatus({ state: 'denied', error: 'Notifications refusées', capabilities: caps })
      return
    }
    if (Notification.permission === 'granted') {
      if (autoEnableIfGranted) {
        // Permission déjà accordée → enregistre direct
        generateAndSaveToken()
      } else {
        setStatus({ state: 'granted', capabilities: caps })
      }
    } else {
      // 'default' : attendre que l'utilisateur clique sur le bouton
      setStatus({ state: 'default', capabilities: caps })
    }
  }, [eventId, creneauId, autoEnableIfGranted, generateAndSaveToken])

  return { status, enable }
}
