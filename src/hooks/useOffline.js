/**
 * hooks/useOffline.js
 * Détecte automatiquement la perte de réseau et expose
 * les helpers de synchronisation de la file offline.
 */

import { useEffect } from 'react'
import useAppStore from '../store/useAppStore'

export function useOffline() {
  const { offline, offlineQueue, setOffline, syncOfflineQueue } = useAppStore()

  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline  = () => {
      setOffline(false)
      // Auto-sync dès que le réseau revient
      if (offlineQueue.length > 0) syncOfflineQueue()
    }

    window.addEventListener('offline', goOffline)
    window.addEventListener('online',  goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online',  goOnline)
    }
  }, [offlineQueue.length])

  return {
    isOffline: offline,
    pendingCount: offlineQueue.length,
    syncNow: syncOfflineQueue,
    toggleSimulate: () => setOffline(!offline),
  }
}
