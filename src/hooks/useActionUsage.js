/**
 * hooks/useActionUsage.js
 *
 * Track les compteurs d'usage des actions rapides admin, stockés en
 * localStorage (clé par utilisateur). Permet de trier les actions par
 * fréquence et d'afficher les N plus utilisées.
 *
 * Modèle :
 *   localStorage['yllatok-action-usage-{uid}'] = {
 *     actionKey: { count: number, last: timestamp_ms },
 *     ...
 *   }
 *
 * Score utilisé pour le tri :
 *   score = count * decayFactor(last)
 *   où decayFactor décroît dans le temps :
 *     - < 24h    : 1.0
 *     - 1-7j     : 0.7
 *     - 7-30j    : 0.4
 *     - > 30j    : 0.2
 *
 * Ainsi une action utilisée 10 fois il y a 2 mois vaut 2 points,
 * et une action utilisée 5 fois aujourd'hui vaut 5 points → la récente gagne.
 */
import { useCallback, useState, useEffect } from 'react'
import useAuthStore from '../store/useAuthStore'

const STORAGE_PREFIX = 'yllatok-action-usage-'

const decayFactor = (lastMs) => {
  if (!lastMs) return 1
  const ageMs = Date.now() - lastMs
  const day = 24 * 60 * 60 * 1000
  if (ageMs < day)        return 1.0
  if (ageMs < 7  * day)   return 0.7
  if (ageMs < 30 * day)   return 0.4
  return 0.2
}

const readStorage = (uid) => {
  if (!uid) return {}
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + uid)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const writeStorage = (uid, data) => {
  if (!uid) return
  try {
    localStorage.setItem(STORAGE_PREFIX + uid, JSON.stringify(data))
  } catch (e) {
    console.warn('[useActionUsage] localStorage failed:', e?.message)
  }
}

export default function useActionUsage() {
  const user = useAuthStore(s => s.user)
  const uid = user?.id || user?.uid

  // On stocke l'objet usage en state pour que les composants re-render
  // quand on incrémente.
  const [usage, setUsage] = useState(() => readStorage(uid))

  // Recharger si l'uid change (changement d'utilisateur)
  useEffect(() => {
    setUsage(readStorage(uid))
  }, [uid])

  // Incrémenter le compteur d'une action
  const recordUse = useCallback((actionKey) => {
    if (!actionKey || !uid) return
    setUsage(prev => {
      const cur = prev[actionKey] || { count: 0, last: 0 }
      const next = {
        ...prev,
        [actionKey]: { count: cur.count + 1, last: Date.now() },
      }
      writeStorage(uid, next)
      return next
    })
  }, [uid])

  // Score calculé d'une action (count * decay)
  const scoreOf = useCallback((actionKey) => {
    const entry = usage[actionKey]
    if (!entry) return 0
    return entry.count * decayFactor(entry.last)
  }, [usage])

  // Top N actions selon le score, en complétant avec un défaut si pas assez
  // d'historique. `defaultOrder` est un tableau d'actionKey à utiliser comme
  // ordre de référence pour les actions jamais utilisées (= 0).
  const topActions = useCallback((allKeys, n = 4, defaultOrder = []) => {
    // Score de chaque action ; les non-utilisées ont 0
    const scored = allKeys.map(k => ({ key: k, score: scoreOf(k) }))
    // Trier par score décroissant. Pour les ex-aequo (notamment toutes à 0),
    // on respecte l'ordre par défaut fourni.
    const defaultIndex = (k) => {
      const i = defaultOrder.indexOf(k)
      return i === -1 ? 999 : i
    }
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return defaultIndex(a.key) - defaultIndex(b.key)
    })
    return scored.slice(0, n).map(s => s.key)
  }, [scoreOf])

  return { recordUse, scoreOf, topActions, usage }
}
