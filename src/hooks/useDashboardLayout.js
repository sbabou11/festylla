/**
 * hooks/useDashboardLayout.js
 *
 * Gère le layout personnalisable du dashboard admin (N3 — widgets composables).
 *
 * Modèle Firestore :
 *   users/{uid}/dashboard (document unique par utilisateur)
 *     - layout : Array<{ i: widgetId, x, y, w, h }> (positions et tailles)
 *     - widgets : Array<{ id, type, options? }> (widgets installés)
 *     - updatedAt
 *
 * Le layout est PERSONNEL (par utilisateur), pas par événement.
 *
 * Sauvegarde avec debounce 800ms pour ne pas spammer Firestore pendant
 * le drag/resize.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import useAuthStore from '../store/useAuthStore'

// Layout par défaut pour un nouvel admin (utilisé si aucun layout sauvegardé).
// Chaque widget : { id (unique), type (cf. registry), x, y, w, h (en unités de grille) }
// La grille fait 12 colonnes. w=6 = demi-largeur, w=12 = pleine largeur.
export const DEFAULT_LAYOUT = {
  widgets: [
    { id: 'recettes-1',   type: 'recettes-jour' },
    { id: 'alertes-1',    type: 'alertes' },
    { id: 'transactions-1', type: 'transactions' },
    { id: 'spectateurs-1',  type: 'spectateurs' },
  ],
  layout: [
    { i: 'recettes-1',    x: 0, y: 0, w: 6, h: 4 },
    { i: 'alertes-1',     x: 6, y: 0, w: 6, h: 2 },
    { i: 'transactions-1',x: 6, y: 2, w: 3, h: 2 },
    { i: 'spectateurs-1', x: 9, y: 2, w: 3, h: 2 },
  ],
}

export default function useDashboardLayout() {
  const user = useAuthStore(s => s.user)
  const uid = user?.id || user?.uid

  const [layout, setLayout]       = useState(DEFAULT_LAYOUT.layout)
  const [widgets, setWidgets]     = useState(DEFAULT_LAYOUT.widgets)
  const [loading, setLoading]     = useState(true)
  const [editMode, setEditMode]   = useState(false)
  const saveTimerRef = useRef(null)
  const hasLoadedRef = useRef(false)

  // Chargement initial depuis Firestore
  useEffect(() => {
    if (!uid) {
      console.warn('[useDashboardLayout] pas d\'uid utilisateur, layout par défaut utilisé')
      setLoading(false)
      hasLoadedRef.current = true
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const ref = doc(db, 'users', uid, 'dashboard', 'main')
        console.log('[useDashboardLayout] chargement depuis', ref.path)
        const snap = await getDoc(ref)
        if (cancelled) return
        if (snap.exists()) {
          const data = snap.data()
          console.log('[useDashboardLayout] document trouvé, widgets:', data.widgets?.length, 'layout:', data.layout?.length)
          if (Array.isArray(data.layout)  && data.layout.length > 0)  setLayout(data.layout)
          if (Array.isArray(data.widgets) && data.widgets.length > 0) setWidgets(data.widgets)
        } else {
          console.log('[useDashboardLayout] pas de document, layout par défaut')
        }
      } catch (e) {
        console.error('[useDashboardLayout] load failed:', e?.code, e?.message)
      } finally {
        if (!cancelled) {
          setLoading(false)
          hasLoadedRef.current = true
        }
      }
    })()
    return () => { cancelled = true }
  }, [uid])

  // Sauvegarde debounced — déclenchée à chaque changement après le chargement.
  const persist = useCallback((newLayout, newWidgets) => {
    if (!uid) {
      console.warn('[useDashboardLayout] persist annulé : pas d\'uid')
      return
    }
    if (!hasLoadedRef.current) {
      // Évite de sauvegarder le layout par défaut avant d'avoir lu Firestore
      return
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const ref = doc(db, 'users', uid, 'dashboard', 'main')
        // Sérialiser proprement : on garde uniquement les champs nécessaires
        // (RGL peut ajouter des champs internes comme moved, isDraggable…)
        const cleanLayout = newLayout.map(l => ({
          i: l.i, x: l.x, y: l.y, w: l.w, h: l.h,
        }))
        const cleanWidgets = newWidgets.map(w => ({
          id: w.id, type: w.type, ...(w.options ? { options: w.options } : {}),
        }))
        console.log('[useDashboardLayout] sauvegarde', cleanLayout.length, 'positions /', cleanWidgets.length, 'widgets')
        await setDoc(ref, {
          layout: cleanLayout, widgets: cleanWidgets,
          updatedAt: serverTimestamp(),
        }, { merge: true })
        console.log('[useDashboardLayout] sauvegarde OK')
      } catch (e) {
        console.error('[useDashboardLayout] save failed:', e?.code, e?.message)
      }
    }, 600)
  }, [uid])

  // Met à jour le layout (positions/tailles) ET persiste.
  // IMPORTANT : on ignore les appels avant le chargement initial pour éviter
  // que RGL écrase Firestore avec le layout par défaut au tout premier rendu.
  const updateLayout = useCallback((newLayout) => {
    if (!hasLoadedRef.current) return
    setLayout(newLayout)
    persist(newLayout, widgets)
  }, [persist, widgets])

  // Ajoute un widget : crée un id unique, l'ajoute en bas du layout
  const addWidget = useCallback((type, defaultSize = { w: 6, h: 2 }) => {
    const id = `${type}-${Date.now()}`
    // y = max y existant + 1 pour le mettre en bas
    const maxY = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0)
    const newWidgets = [...widgets, { id, type }]
    const newLayout = [...layout, { i: id, x: 0, y: maxY, ...defaultSize }]
    setWidgets(newWidgets); setLayout(newLayout)
    persist(newLayout, newWidgets)
    return id
  }, [layout, widgets, persist])

  // Supprime un widget par son id
  const removeWidget = useCallback((id) => {
    const newWidgets = widgets.filter(w => w.id !== id)
    const newLayout = layout.filter(l => l.i !== id)
    setWidgets(newWidgets); setLayout(newLayout)
    persist(newLayout, newWidgets)
  }, [layout, widgets, persist])

  // Reset au défaut
  const resetToDefault = useCallback(() => {
    setLayout(DEFAULT_LAYOUT.layout)
    setWidgets(DEFAULT_LAYOUT.widgets)
    persist(DEFAULT_LAYOUT.layout, DEFAULT_LAYOUT.widgets)
  }, [persist])

  return {
    layout, widgets, loading,
    editMode, setEditMode,
    updateLayout, addWidget, removeWidget, resetToDefault,
  }
}
