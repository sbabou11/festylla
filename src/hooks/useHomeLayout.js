/**
 * hooks/useHomeLayout.js — ordre et visibilité des blocs de l'accueil
 *
 * Même document que l'ancien tableau de bord composable (useDashboardLayout) :
 *   users/{uid}/dashboard/main
 *     - home : { order: [blockId], hidden: [blockId], v: 1 }   ← nouveau champ
 *     - layout, widgets                                         ← anciens champs, jamais modifiés
 * Écriture en merge : les préférences de l'ancienne grille restent intactes.
 *
 * Sans champ `home`, les widgets installés dans l'ancienne grille décident de la
 * visibilité des blocs équivalents (migration douce, rien n'est réécrit tant que
 * la personne n'enregistre pas).
 * Copie locale (localStorage) pour un affichage immédiat et en secours hors ligne.
 */
import { useCallback, useEffect, useState } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import useAuthStore from '../store/useAuthStore'

const LS_PREFIX = 'yllacash-accueil-blocs-'

// Ancien type de widget → bloc de l'accueil
const WIDGET_TO_BLOCK = {
  alertes: 'alertes', transactions: 'transactions', spectateurs: 'spectateurs',
  'top-articles': 'top-articles', stocks: 'stocks', depenses: 'depenses',
  reservations: 'resas', benevoles: 'benevoles', cachets: 'cachets', planning: 'planning',
}

// Blocs « optionnels » dont la visibilité vient de l'ancienne grille
const FROM_WIDGETS = ['top-articles', 'stocks', 'depenses', 'benevoles', 'cachets', 'planning', 'spectateurs']

const readLocal = (uid) => {
  try { return JSON.parse(localStorage.getItem(LS_PREFIX + (uid || 'anon')) || 'null') } catch { return null }
}
const writeLocal = (uid, prefs) => {
  try { localStorage.setItem(LS_PREFIX + (uid || 'anon'), JSON.stringify(prefs)) } catch { /* stockage indisponible */ }
}

/** Complète des préférences avec les blocs connus : ids inconnus retirés, nouveaux blocs à leur place par défaut */
export function normalizePrefs(prefs, defaults) {
  const known = defaults.order
  const order = (prefs?.order || []).filter(id => known.includes(id))
  known.forEach((id, i) => {
    if (order.includes(id)) return
    // Insère après le bloc qui le précède par défaut
    const before = known.slice(0, i).reverse().find(b => order.includes(b))
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id)
  })
  const hidden = Array.isArray(prefs?.hidden)
    ? prefs.hidden.filter(id => known.includes(id))
    : defaults.hidden
  return { order, hidden }
}

function fromOldWidgets(widgets, defaults) {
  const installed = new Set(widgets.map(w => WIDGET_TO_BLOCK[w.type]).filter(Boolean))
  const hidden = defaults.hidden.filter(id => !FROM_WIDGETS.includes(id))
  FROM_WIDGETS.forEach(id => { if (!installed.has(id)) hidden.push(id) })
  return { order: defaults.order, hidden }
}

export default function useHomeLayout(defaults) {
  const user = useAuthStore(st => st.user)
  const uid = user?.id || user?.uid
  const [prefs, setPrefs] = useState(() => normalizePrefs(readLocal(uid) || defaults, defaults))
  const [loading, setLoading] = useState(!!uid)

  useEffect(() => {
    const local = readLocal(uid)
    setPrefs(normalizePrefs(local || defaults, defaults))
    if (!uid) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    getDoc(doc(db, 'users', uid, 'dashboard', 'main'))
      .then(snap => {
        if (cancelled || !snap.exists()) return
        const data = snap.data()
        if (data.home?.order) {
          const next = normalizePrefs(data.home, defaults)
          setPrefs(next)
          writeLocal(uid, next)
        } else if (!local && Array.isArray(data.widgets) && data.widgets.length) {
          setPrefs(normalizePrefs(fromOldWidgets(data.widgets, defaults), defaults))
        }
      })
      .catch(e => console.warn('[useHomeLayout] lecture impossible :', e?.code || e?.message))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // defaults est une constante du module appelant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  /** Enregistre (local tout de suite, Firestore ensuite). Rejette si Firestore échoue. */
  const save = useCallback(async (next) => {
    const clean = normalizePrefs(next, defaults)
    setPrefs(clean)
    writeLocal(uid, clean)
    if (!uid) return
    await setDoc(doc(db, 'users', uid, 'dashboard', 'main'),
      { home: { order: clean.order, hidden: clean.hidden, v: 1 }, updatedAt: serverTimestamp() },
      { merge: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  return { prefs, loading, save }
}
