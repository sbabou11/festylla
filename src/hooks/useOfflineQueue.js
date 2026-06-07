/**
 * hooks/useOfflineQueue.js
 * File d'attente persistée pour les transactions en mode hors-ligne.
 * Synchronise automatiquement quand la connexion revient.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import useAppStore from '../store/useAppStore'

const QUEUE_KEY = 'yllacash-offline-queue'

const loadQueue = () => {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}
const saveQueue = (q) => {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) } catch {}
}

export function useOfflineQueue() {
  const [online, setOnline]     = useState(navigator.onLine)
  const [queue, setQueue]       = useState(loadQueue)
  const [syncing, setSyncing]   = useState(false)
  const { crediter, debiter }   = useAppStore()
  const syncRef                 = useRef(false)

  // Écouter les changements de connectivité
  useEffect(() => {
    const onOnline  = () => { setOnline(true) }
    const onOffline = () => setOnline(false)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Persister la queue à chaque changement
  useEffect(() => { saveQueue(queue) }, [queue])

  // Synchroniser quand on revient en ligne
  useEffect(() => {
    if (online && queue.length > 0 && !syncRef.current) {
      syncQueue()
    }
  }, [online])

  // Ajouter une opération à la queue
  const enqueue = useCallback((type, payload) => {
    const entry = { id: Date.now(), type, payload, createdAt: new Date().toISOString() }
    setQueue(q => [...q, entry])
    return entry.id
  }, [])

  // Synchroniser toutes les opérations en attente
  const syncQueue = useCallback(async () => {
    if (syncRef.current || !navigator.onLine) return
    syncRef.current = true
    setSyncing(true)

    const current = loadQueue()
    const failed  = []

    for (const entry of current) {
      try {
        if (entry.type === 'credit') {
          await crediter(entry.payload.specId, entry.payload.montant, entry.payload.staffNom)
        } else if (entry.type === 'debit') {
          await debiter(entry.payload.specId, entry.payload.items, entry.payload.staffNom)
        }
        // Succès : retirer de la queue
        setQueue(q => q.filter(e => e.id !== entry.id))
      } catch (err) {
        console.warn('Sync failed for entry', entry.id, err)
        failed.push(entry)
      }
    }

    if (failed.length > 0) saveQueue(failed)
    setSyncing(false)
    syncRef.current = false
  }, [crediter, debiter])

  // Exécuter une opération avec fallback hors-ligne
  // Retourne true si exécuté immédiatement, false si mis en file d'attente
  const execute = useCallback(async (type, payload, fn) => {
    if (navigator.onLine) {
      await fn()
      return true
    } else {
      enqueue(type, payload)
      return false
    }
  }, [enqueue])


  return { online, queue, syncing, enqueue, syncQueue, execute, queueSize: queue.length }
}
