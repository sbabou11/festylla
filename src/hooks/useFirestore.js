/**
 * hooks/useFirestore.js — v5 STABLE
 * Architecture multi-événements v2 :
 * - super_admin : voit tous les événements, staff global
 * - admin/staff : isolé dans events/{currentEventId}/
 * Toutes les collections (staff, categories, benevoles) sont dans l'événement
 */
import { useState, useEffect } from 'react'
import {
  watchSpectateurs, watchReservations,
  watchMenu, watchStaff, watchTransactions,
  watchRoles, watchCategories, watchPlanning, getSettings, setCurrentEvent,
} from '../firebase/service'
import useAppStore   from '../store/useAppStore'
import useEventStore from '../store/useEventStore'

export function useFirestore() {
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const {
    setSpectateurs, setReservations, setMenu,
    setStaff, setPlanning,setLogs, setRoles, setCategories, updateTheme,
  } = useAppStore()

  const { currentEventId } = useEventStore()

  useEffect(() => {
    setCurrentEvent(currentEventId)
  }, [currentEventId])

  // Listeners PAR ÉVÉNEMENT — tout est dans events/{id}/
  useEffect(() => {
    const fallback = setTimeout(() => setLoading(false), 3000)
    if (!currentEventId) return () => clearTimeout(fallback)

    const subs = [
      watchSpectateurs(data => {
        setSpectateurs(data)
        clearTimeout(fallback)
        setLoading(false)
      }, currentEventId),
      watchReservations(data  => setReservations(data), currentEventId),
      watchMenu(data          => setMenu(data),         currentEventId),
      watchTransactions(data  => setLogs(data),         currentEventId),
      watchStaff(data         => setStaff(data),        currentEventId),
      watchCategories(data    => setCategories(data),   currentEventId),
      watchPlanning(data      => setPlanning(data),      currentEventId),
    ]

    getSettings(currentEventId).then(s => {
      if (s?.theme)    updateTheme(s.theme)
      if (s?.festName) updateTheme({ festName: s.festName === 'YllaTok' ? 'YllaCash' : s.festName })
    }).catch(() => {})

    return () => { clearTimeout(fallback); subs.forEach(u => u?.()) }
  }, [currentEventId])

  // Rôles — globaux
  useEffect(() => {
    const unsub = watchRoles(data => setRoles(data))
    return unsub
  }, [])

  return { loading, error }
}