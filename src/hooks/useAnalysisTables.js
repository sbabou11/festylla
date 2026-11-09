/**
 * hooks/useAnalysisTables.js
 *
 * Gère les "tableaux d'analyse" (tableaux croisés articles × transactions)
 * de la page Comptabilité. Persistés dans Firestore par événement :
 *   events/{eid}/analysisTables/{tableId}
 *     - name        : nom du tableau
 *     - articles    : string[] (noms d'articles = colonnes)
 *     - window      : { x, y, w, h, collapsed }  (position/taille fenêtre)
 *     - createdAt, updatedAt
 *
 * Les LIGNES (transactions) ne sont pas stockées : elles sont recalculées
 * à la volée depuis les logs selon les articles choisis.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import useEventStore from '../store/useEventStore'

export default function useAnalysisTables() {
  const { currentEventId } = useEventStore()
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const saveTimers = useRef({})
  // Patches locaux non encore confirmés côté serveur, par id de tableau.
  // Tant qu'un patch est ici, on le ré-applique par-dessus les snapshots
  // pour éviter qu'un snapshot en retard ne ramène l'ancienne valeur.
  const pendingWrites = useRef({})

  // Fusionne les patches en attente par-dessus une liste de tables (du serveur)
  const applyPending = (serverTables) =>
    serverTables.map(t => pendingWrites.current[t.id]
      ? { ...t, ...pendingWrites.current[t.id] }
      : t)

  // Écoute temps réel
  useEffect(() => {
    if (!currentEventId) { setLoading(false); return }
    const unsub = onSnapshot(
      collection(db, 'events', currentEventId, 'analysisTables'),
      snap => {
        const serverTables = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setTables(applyPending(serverTables))
        setLoading(false)
      },
      err => { console.warn('[useAnalysisTables]', err?.message); setLoading(false) }
    )
    return () => unsub()
  }, [currentEventId])

  // Créer un tableau
  const createTable = useCallback(async (name = 'Nouveau tableau') => {
    if (!currentEventId) return null
    const id = `tbl-${Date.now()}`
    // Position légèrement décalée pour empiler visuellement les fenêtres
    const offset = (tables.length % 5) * 30
    await setDoc(doc(db, 'events', currentEventId, 'analysisTables', id), {
      name,
      articles: [],
      window: { x: 40 + offset, y: 40 + offset, w: 460, h: 360, collapsed: false },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return id
  }, [currentEventId, tables.length])

  // Mise à jour partielle d'un tableau.
  //  - 'local'     : met à jour l'état local sans écrire Firestore (pendant un drag)
  //  - true/'immediate' : écrit Firestore tout de suite (fin de drag, action discrète)
  //  - sinon (false) : écriture debounced
  const updateTable = useCallback((id, patch, mode = false) => {
    if (!currentEventId) return
    const immediate = mode === true || mode === 'immediate'
    const localOnly = mode === 'local'
    // Optimistic update local
    setTables(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
    // Mémorise le patch en attente (sera ré-appliqué sur les snapshots en retard)
    pendingWrites.current[id] = { ...(pendingWrites.current[id] || {}), ...patch }
    if (localOnly) return

    const doSave = async () => {
      try {
        await setDoc(
          doc(db, 'events', currentEventId, 'analysisTables', id),
          { ...patch, updatedAt: serverTimestamp() },
          { merge: true }
        )
        // Write confirmé : on peut oublier le patch en attente pour ces champs.
        // On retire uniquement les clés qu'on vient d'écrire.
        if (pendingWrites.current[id]) {
          const remaining = { ...pendingWrites.current[id] }
          Object.keys(patch).forEach(k => { delete remaining[k] })
          if (Object.keys(remaining).length === 0) delete pendingWrites.current[id]
          else pendingWrites.current[id] = remaining
        }
      } catch (e) { console.warn('[useAnalysisTables] save', e?.message) }
    }
    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id])
    if (immediate) { doSave(); return }
    saveTimers.current[id] = setTimeout(doSave, 500)
  }, [currentEventId])

  // Supprimer un tableau
  const deleteTable = useCallback(async (id) => {
    if (!currentEventId) return
    try {
      await deleteDoc(doc(db, 'events', currentEventId, 'analysisTables', id))
    } catch (e) { console.warn('[useAnalysisTables] delete', e?.message) }
  }, [currentEventId])

  return { tables, loading, createTable, updateTable, deleteTable }
}
