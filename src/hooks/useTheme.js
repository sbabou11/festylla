/**
 * hooks/useTheme.js
 * Applique le thème Studio au DOM au montage et à chaque update.
 * toggleDark(event) : le nouveau thème se répand en cercle depuis le bouton cliqué
 * (API View Transitions ; bascule directe si absente ou si « réduire les animations »).
 */

import { useEffect } from 'react'
import { flushSync } from 'react-dom'
import useAppStore from '../store/useAppStore'

// Utilisable hors React (vitrine /ui) : transition circulaire autour d'une bascule de thème
export function revealTheme(apply, event) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // Onglet masqué : le navigateur attendrait qu'il redevienne visible pour lancer la transition
  if (!document.startViewTransition || reduced || document.visibilityState !== 'visible') { apply(); return }
  const x = event?.clientX ?? window.innerWidth - 40
  const y = event?.clientY ?? 30
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  const root = document.documentElement
  root.classList.add('yc-theme-vt')
  let started = false
  const vt = document.startViewTransition(() => { started = true; flushSync(apply) })
  // Sans image à dessiner (fenêtre masquée…), la transition attendrait : le thème change quand même
  setTimeout(() => { if (!started) vt.skipTransition() }, 300)
  vt.ready.then(() => root.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
    { duration: 450, easing: 'cubic-bezier(.2,.7,.3,1)', pseudoElement: '::view-transition-new(root)' },
  )).catch(() => {})
  vt.finished.finally(() => root.classList.remove('yc-theme-vt'))
}

export function useTheme() {
  const { theme, applyThemeToDom, updateTheme, resetTheme } = useAppStore()

  useEffect(() => {
    applyThemeToDom()
  }, [theme])

  const toggleDark = (event) => revealTheme(() => updateTheme({ isDark: !theme.isDark }), event)

  return { theme, updateTheme, resetTheme, toggleDark }
}
