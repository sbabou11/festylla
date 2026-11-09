/**
 * hooks/useAppUpdate.js — v8 debug (fix popup absente + popup qui revient)
 *
 * Système hybride de mise à jour de l'app via service worker.
 *
 * Comportement :
 *   1. Vérification immédiate au démarrage (pas d'attente de 60s)
 *   2. Polling toutes les 60s ensuite
 *   3. Si nouvelle version → popup avec "Mettre à jour" / "Plus tard"
 *   4. Auto-update silencieux si inactif 5 min (sauf saisie en cours)
 *   5. Grace period 90s après reload pour ignorer faux positifs du SW
 *   6. Logging détaillé pour diagnostic (visible dans la console DevTools)
 */

import { useEffect, useState, useRef, useCallback } from 'react'

const CHECK_INTERVAL_MS    = 25_000          // 25s entre 2 vérifications auto (réactif sans surcharge)
const INACTIVITY_THRESHOLD = 5 * 60_000      // 5 min d'inactivité pour auto-update
const SNOOZE_DURATION_MS   = 30 * 60_000     // 30 min après "Plus tard"
const APPLY_TIMEOUT_MS     = 15_000          // Si reload pas survenu en 15s, forcer
const POST_RELOAD_GRACE_MS = 90_000          // 90s après reload : ignorer onNeedRefresh

// Clés localStorage pour communiquer entre les sessions
const LS_LAST_APPLIED = 'yllacash_update_applied_at'

// ═══════════════════════════════════════════════════════════════════════
// Singleton : une SEULE registration de SW pour toute l'app
// ═══════════════════════════════════════════════════════════════════════

let updateSWPromise = null
let updateSWFn = null
let swRegistration = null
const refreshListeners = new Set()

const log = (...args) => console.log('[YllaCash Update]', ...args)

// Vérifie si on est dans la fenêtre de grâce post-reload.
// Pendant cette période, on ignore les notifs de "nouvelle version"
// car elles sont probablement des résidus du SW qu'on vient d'activer.
function isInGracePeriod() {
  try {
    const lastApplied = parseInt(localStorage.getItem(LS_LAST_APPLIED) || '0', 10)
    if (!lastApplied) return false
    const elapsed = Date.now() - lastApplied
    if (elapsed < 0 || elapsed > POST_RELOAD_GRACE_MS) {
      // Au-delà de la grace period, on peut nettoyer
      if (elapsed > POST_RELOAD_GRACE_MS) {
        localStorage.removeItem(LS_LAST_APPLIED)
      }
      return false
    }
    return true
  } catch {
    return false
  }
}

function notifyListeners() {
  if (isInGracePeriod()) {
    log('⏭️ Notification ignorée (grace period post-reload active)')
    return
  }
  log('Nouvelle version détectée — notification des listeners')
  refreshListeners.forEach(cb => { try { cb() } catch {} })
}

function getUpdateSWPromise() {
  if (updateSWPromise) return updateSWPromise
  updateSWPromise = (async () => {
    try {
      log('Chargement de virtual:pwa-register…')
      const { registerSW } = await import('virtual:pwa-register')
      log('Module chargé, enregistrement du SW…')

      // NOTE : avec skipWaiting=false + clientsClaim=false, le SW reste sagement
      // en "waiting" tant qu'on ne lui dit pas de s'activer. Le bandeau de mise
      // à jour s'affiche alors normalement via onNeedRefresh ci-dessous.
      // Le listener controllerchange est géré dans applyUpdate() — il ne se
      // déclenchera donc QUE quand l'utilisateur clique sur "Mettre à jour".

      updateSWFn = registerSW({
        onNeedRefresh() {
          log('✨ onNeedRefresh — une nouvelle version est prête')
          notifyListeners()
        },
        onOfflineReady() {
          log('App prête en mode hors-ligne')
        },
        onRegisteredSW(swUrl, registration) {
          log('SW enregistré :', swUrl)
          swRegistration = registration
          if (!registration) {
            log('⚠ Pas de registration retournée — polling impossible')
            return
          }
          // Vérification IMMÉDIATE (sans attendre les 60s)
          log('Première vérification de mise à jour…')
          registration.update().catch(e => log('Erreur update initial:', e.message))

          // Polling périodique
          setInterval(() => {
            log('Vérification périodique…')
            registration.update().catch(e => log('Erreur update périodique:', e.message))
          }, CHECK_INTERVAL_MS)
        },
        onRegisterError(err) {
          log('❌ Erreur de registration SW:', err)
        },
      })
      log('registerSW appelé')
      return updateSWFn
    } catch (e) {
      log('❌ Impossible de charger virtual:pwa-register:', e?.message || e)
      updateSWPromise = null
      return null
    }
  })()
  return updateSWPromise
}

/**
 * Permet à l'UI de déclencher manuellement une vérification de mise à jour.
 * Renvoie un objet { found, error } selon le résultat.
 */
export async function checkForUpdate() {
  log('Vérification manuelle déclenchée')
  // Pendant la grace period, on signale qu'il n'y a rien à mettre à jour
  // pour éviter les faux positifs juste après un reload
  if (isInGracePeriod()) {
    log('⏭️ Vérification skip (grace period)')
    return { found: false, gracePeriod: true }
  }
  await getUpdateSWPromise()
  if (!swRegistration) {
    log('Pas de SW enregistré — impossible de vérifier')
    return { found: false, error: 'Service worker non enregistré' }
  }
  try {
    await swRegistration.update()
    // Donne 1s au SW pour traiter
    await new Promise(r => setTimeout(r, 1000))
    // Vérifie si un nouveau SW est en attente d'activation
    if (swRegistration.waiting) {
      log('SW en waiting détecté — déclenchement du onNeedRefresh')
      notifyListeners()
      return { found: true }
    }
    if (swRegistration.installing) {
      log('Nouveau SW en cours d\'installation')
      return { found: true, installing: true }
    }
    log('Aucune nouvelle version trouvée')
    return { found: false }
  } catch (e) {
    log('Erreur lors de la vérification:', e.message)
    return { found: false, error: e.message }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Hook public
// ═══════════════════════════════════════════════════════════════════════

export default function useAppUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [snoozedUntil,    setSnoozedUntil]    = useState(0)
  const [applying,        setApplying]        = useState(false)

  const lastActivityRef = useRef(Date.now())
  const applyingRef     = useRef(false)

  // ── 1. S'abonner aux notifications du SW ─────────────────────────
  useEffect(() => {
    let mounted = true
    const handler = () => {
      if (mounted && !applyingRef.current) {
        log('Popup d\'update affichée')
        setUpdateAvailable(true)
      }
    }
    refreshListeners.add(handler)
    getUpdateSWPromise()
    return () => {
      mounted = false
      refreshListeners.delete(handler)
    }
  }, [])

  // ── 2. Tracking d'activité utilisateur ───────────────────────────
  useEffect(() => {
    const update = () => { lastActivityRef.current = Date.now() }
    const events = ['mousedown', 'mousemove', 'touchstart', 'keydown', 'scroll', 'click']
    events.forEach(e => window.addEventListener(e, update, { passive: true }))
    return () => events.forEach(e => window.removeEventListener(e, update))
  }, [])

  // ── 3. Appliquer la mise à jour ──────────────────────────────────
  const applyUpdate = useCallback(async () => {
    if (applyingRef.current) return
    log('Application de la mise à jour…')
    applyingRef.current = true
    setApplying(true)
    setUpdateAvailable(false)

    // Mémorise le timestamp pour activer la grace period au prochain chargement
    try { localStorage.setItem(LS_LAST_APPLIED, String(Date.now())) } catch {}

    /**
     * Reload "hard" qui contourne TOUS les caches :
     *   1. Vide les caches Workbox (Cache API)
     *   2. Désinscrit le Service Worker actuel
     *   3. Reload avec un paramètre unique pour contourner le cache HTTP
     *
     * Pourquoi tout ça ? Parce qu'un simple location.reload() après skipWaiting
     * peut TOUJOURS afficher l'ancienne version : le SW actuel sert l'ancien
     * HTML depuis son cache, qui pointe vers d'anciens JS. Il faut faire table
     * rase pour que la prochaine requête remonte fraîche depuis Vercel.
     */
    const hardReload = async () => {
      log('🔄 Reload complet de la page')

      // 1. Vider tous les caches Workbox (gardera juste l'essentiel SW)
      try {
        if ('caches' in window) {
          const names = await caches.keys()
          await Promise.all(names.map(name => {
            log('  → vidage cache:', name)
            return caches.delete(name)
          }))
        }
      } catch (e) {
        log('  Erreur vidage caches:', e?.message)
      }

      // 2. Désinscrire le Service Worker actif pour cette session.
      //    Le nouveau SW sera ré-enregistré au prochain chargement.
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map(r => {
            log('  → désinscription SW:', r.scope)
            return r.unregister()
          }))
        }
      } catch (e) {
        log('  Erreur désinscription SW:', e?.message)
      }

      // 3. Reload avec paramètre query unique pour contourner le cache HTTP.
      //    `location.reload()` seul peut rester sur la version cachée si le
      //    SW intercepte encore. En remplaçant href avec un timestamp unique,
      //    on garantit une nouvelle URL → nouvelle requête → nouvelle version.
      try {
        const url = new URL(window.location.href)
        url.searchParams.set('_v', String(Date.now()))
        window.location.replace(url.toString())
      } catch {
        try {
          window.location.reload()
        } catch {
          window.location.href = window.location.pathname + '?_v=' + Date.now()
        }
      }
    }

    const safetyTimer = setTimeout(() => {
      log('⚠ Timeout 15s — reload forcé')
      hardReload()
    }, APPLY_TIMEOUT_MS)

    try {
      // 1. Écoute l'événement controllerchange : c'est lui qui signale
      //    que le nouveau SW a vraiment pris le contrôle. C'est le bon
      //    moment pour reload, car on est sûr que la prochaine requête
      //    sera servie par la nouvelle version.
      let controllerChanged = false
      const onControllerChange = () => {
        if (controllerChanged) return // évite le double-reload
        controllerChanged = true
        log('✅ controllerchange reçu — nouveau SW actif, hard reload')
        clearTimeout(safetyTimer)
        // Petit délai pour laisser le SW vraiment finaliser
        setTimeout(hardReload, 100)
      }
      if (navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, { once: true })
      }

      // 2. Demande au SW d'activer la nouvelle version (skipWaiting interne)
      const fn = await getUpdateSWPromise()
      if (fn) {
        log('Appel updateSWFn(true)…')
        await fn(true)
        // Si controllerchange ne survient pas dans les 2s, on force le reload
        // (par exemple si le SW est déjà le bon contrôleur, ce qui peut arriver)
        setTimeout(() => {
          if (!controllerChanged) {
            log('⏱ Pas de controllerchange après 2s — reload de secours')
            clearTimeout(safetyTimer)
            hardReload()
          }
        }, 2000)
      } else {
        log('Pas de SW disponible — reload simple')
        clearTimeout(safetyTimer)
        hardReload()
      }
    } catch (e) {
      log('❌ Erreur applyUpdate:', e.message)
      clearTimeout(safetyTimer)
      hardReload()
    }
  }, [])

  // ── 4. Auto-update si inactif ────────────────────────────────────
  useEffect(() => {
    if (!updateAvailable) return
    const tick = setInterval(() => {
      if (applyingRef.current) return
      const inactiveFor = Date.now() - lastActivityRef.current
      if (inactiveFor < INACTIVITY_THRESHOLD) return
      const active = document.activeElement
      const tagName = active?.tagName?.toLowerCase()
      const isTyping = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || active?.isContentEditable
      if (isTyping) return
      log('Auto-update silencieux déclenché (inactivité)')
      applyUpdate()
    }, 30_000)
    return () => clearInterval(tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateAvailable])

  // ── 5. Reporter à plus tard ──────────────────────────────────────
  const snooze = useCallback(() => {
    log('Mise à jour reportée de', SNOOZE_DURATION_MS / 60_000, 'minutes')
    setSnoozedUntil(Date.now() + SNOOZE_DURATION_MS)
  }, [])

  useEffect(() => {
    if (!snoozedUntil) return
    const t = setTimeout(() => setSnoozedUntil(0), snoozedUntil - Date.now())
    return () => clearTimeout(t)
  }, [snoozedUntil])

  const shouldShowBanner = updateAvailable && !applying && Date.now() >= snoozedUntil

  return { updateAvailable: shouldShowBanner, applying, applyUpdate, snooze, checkForUpdate }
}
