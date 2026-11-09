/**
 * hooks/useKioskMode.js
 *
 * Hook pour activer un "mode borne" sur une page publique :
 *   - Plein écran via Fullscreen API
 *   - Verrouillage de l'orientation paysage (Android Chrome uniquement)
 *   - Wake Lock pour empêcher l'écran de s'éteindre
 *
 * Doit être déclenché par un clic utilisateur (Fullscreen API l'exige).
 *
 * Note honnête sur les limites web :
 *   - iOS Safari ne supporte ni Fullscreen ni Screen Orientation lock
 *   - Le client peut toujours sortir via swipe-up Home, bouton système, etc.
 *     Pour un verrouillage 100%, il faut Fully Kiosk Browser ou APK natif.
 *
 * Utilisation :
 *   const { active, activate } = useKioskMode({ orientation: 'landscape' })
 *   ...
 *   {!active && <button onClick={activate}>Mode borne</button>}
 */
import { useState, useEffect, useRef } from 'react'

export default function useKioskMode({ orientation = 'landscape' } = {}) {
  const [active, setActive] = useState(false)
  // Wake Lock : stocké en ref car objet natif, pas géré par React
  const wakeLockRef = useRef(null)

  const activate = async (e) => {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    try {
      // 1. Plein écran (fait disparaître la barre Chrome/URL)
      const el = document.documentElement
      if (el.requestFullscreen) await el.requestFullscreen()
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen()
      // 2. Verrouillage orientation (Android Chrome uniquement, échec silencieux sur iOS)
      try {
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock(orientation)
        }
      } catch {
        // Pas critique : fullscreen actif quand même
      }
      // 3. Wake lock : écran reste allumé (utile en festival)
      try {
        if (navigator.wakeLock && navigator.wakeLock.request) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
        }
      } catch {
        // Pas critique
      }
      setActive(true)
    } catch (err) {
      alert("Le mode borne n'a pas pu être activé : " + (err.message || 'erreur inconnue'))
    }
  }

  // Détection de sortie du plein écran (Échap, swipe, bouton système).
  // On reset l'état pour réafficher le bouton d'activation.
  useEffect(() => {
    const onFsChange = () => {
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement)
      if (!isFs) {
        setActive(false)
        if (wakeLockRef.current) {
          try { wakeLockRef.current.release() } catch {}
          wakeLockRef.current = null
        }
      }
    }
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
      if (wakeLockRef.current) {
        try { wakeLockRef.current.release() } catch {}
      }
    }
  }, [])

  return { active, activate }
}
