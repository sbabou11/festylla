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
import useAuthStore  from '../store/useAuthStore'
import { waitForSession } from '../firebase/session'

// Connexion expirée (20/11/2026) : une écoute de l'équipe refusée par la base n'est signalée que si
// la session de l'équipe n'est vraiment plus là (fermée, expirée, remplacée par une autre sur cet
// appareil). Si la session est toujours valable, le refus vient des droits (événement non autorisé
// pour cette fiche) : se reconnecter n'y changerait rien, on ne dit rien. Hors ligne, la base ne
// renvoie pas ces codes : rien n'est signalé non plus.
const REFUS = ['permission-denied', 'unauthenticated']
async function sessionEquipePerdue() {
  const u = await waitForSession()
  if (!u) return true
  const r = await u.getIdTokenResult().catch(() => null)
  if (!r) return false   // jeton illisible (réseau) : dans le doute, pas de bandeau
  return !(r.claims?.yc && r.claims.type === 'staff')
}

// enabled : faux tant que personne de l'équipe n'est connecté (sécurité, lot 3 : rien n'est lu avant)
export function useFirestore({ enabled = true } = {}) {
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
    if (!currentEventId || !enabled) {
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

    // Connexion expirée (20/11/2026) : écoutes réservées à l'équipe (spectateurs, réservations, carte,
    // transactions, équipe). Avant, leur refus n'était pas géré : l'écran gardait ses dernières
    // données, ou restait vide, sans rien dire.
    let actif = true
    const refus = (nom) => (e) => {
      console.warn(`Écoute « ${nom} » refusée :`, e?.code || e)
      if (!REFUS.includes(e?.code)) return
      sessionEquipePerdue().then(perdue => {
        if (actif && perdue) useAuthStore.getState().signalerSessionExpiree()
      }).catch(() => {})
    }

    const subs = [
      watchSpectateurs(data => { setSpectateurs(data); markLoaded() }, currentEventId, refus('spectateurs')),
      watchReservations(data  => { setReservations(data); markLoaded() }, currentEventId, refus('reservations')),
      watchMenu(data          => { setMenu(data); markLoaded() },         currentEventId, refus('menu')),
      watchTransactions(data  => { setLogs(data); markLoaded() },         currentEventId, refus('transactions')),
      watchStaff(data         => { setStaff(data); markLoaded() },        currentEventId, refus('staff')),
      watchCategories(data    => { setCategories(data); markLoaded() },   currentEventId),
      watchPlanning(data      => { setPlanning(data); markLoaded() },     currentEventId),
      watchExpositions(data   => { setExpositions(data); markLoaded() },  currentEventId),
    ]

    getSettings(currentEventId).then(s => {
      if (s?.theme)    updateTheme(s.theme)
      if (s?.festName) updateTheme({ festName: s.festName === 'YllaTok' ? 'YllaCash' : s.festName })
    }).catch(() => {})

    return () => { actif = false; clearTimeout(fallback); subs.forEach(u => u?.()) }
  }, [currentEventId, enabled])

  // Rôles — globaux
  useEffect(() => {
    if (!enabled) return
    const unsub = watchRoles(data => setRoles(data))
    return unsub
  }, [enabled])

  return { loading, error }
}