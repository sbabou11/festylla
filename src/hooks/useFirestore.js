/**
 * hooks/useFirestore.js — v8 debug
 * Architecture multi-événements v2 :
 * - super_admin : voit tous les événements, staff global
 * - admin/staff : isolé dans events/{currentEventId}/
 * Toutes les collections (staff, categories, benevoles) sont dans l'événement
 *
 * Performance v8 debug :
 *   - Firestore persistance offline activée dans config.js
 *     → les listeners reçoivent les données du CACHE LOCAL d'abord (instantané),
 *       puis du serveur en arrière-plan
 *   - loading=false dès qu'un seul listener répond (cache ou serveur), pas
 *     besoin d'attendre les 7 collections
 *   - Fallback réduit à 1.5s (au lieu de 3s) : sur Firefox/Safari privée
 *     sans IndexedDB, on n'attend pas trop longtemps
 */
import { useState, useEffect } from 'react'
import {
  watchSpectateurs, watchReservations,
  watchMenu, watchStaff, watchTransactions,
  watchRoles, watchCategories, watchPlanning, watchExpositions, getSettings, setCurrentEvent,
} from '../firebase/service'
import useAppStore   from '../store/useAppStore'
import useEventStore from '../store/useEventStore'

export function useFirestore() {
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const {
    setSpectateurs, setReservations, setMenu,
    setStaff, setPlanning,setLogs, setRoles, setCategories, setExpositions, updateTheme,
  } = useAppStore()

  const { currentEventId } = useEventStore()

  useEffect(() => {
    setCurrentEvent(currentEventId)
  }, [currentEventId])

  // Listeners PAR ÉVÉNEMENT — tout est dans events/{id}/
  useEffect(() => {
    // Fallback court : 1.5s. Avec la persistance, les données du cache arrivent
    // typiquement en < 100ms. Ce fallback ne sert qu'en mode dégradé (navigation
    // privée sans IndexedDB) ou première utilisation totale.
    const fallback = setTimeout(() => setLoading(false), 1500)
    if (!currentEventId) {
      clearTimeout(fallback)
      setLoading(false) // pas d'event → pas la peine d'attendre
      return
    }

    // Helper : marque loading=false dès que le premier listener répond
    let firstResponse = false
    const markLoaded = () => {
      if (firstResponse) return
      firstResponse = true
      clearTimeout(fallback)
      setLoading(false)
    }

    const subs = [
      watchSpectateurs(data => { setSpectateurs(data); markLoaded() }, currentEventId),
      watchReservations(data  => { setReservations(data); markLoaded() }, currentEventId),
      watchMenu(data          => { setMenu(data); markLoaded() },         currentEventId),
      watchTransactions(data  => { setLogs(data); markLoaded() },         currentEventId),
      watchStaff(data         => { setStaff(data); markLoaded() },        currentEventId),
      watchCategories(data    => { setCategories(data); markLoaded() },   currentEventId),
      watchPlanning(data      => { setPlanning(data); markLoaded() },     currentEventId),
      watchExpositions(data   => { setExpositions(data); markLoaded() },  currentEventId),
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