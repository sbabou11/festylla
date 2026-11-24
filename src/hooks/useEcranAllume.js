/**
 * hooks/useEcranAllume.js — garder l'écran allumé pendant les scans (24/11/2026)
 * Maquette validée : https://claude.ai/artifact/UmkEsQXciGkMc6Azb7GXJF (idée d'Event Manager)
 *
 * useEcranAllume(actif) : tant que `actif` est vrai, le téléphone ne se met pas en veille.
 * Le verrou tombe quand l'appli passe en arrière-plan : on le redemande au retour. Il est rendu
 * dès qu'on quitte l'écran. Si le téléphone ne le permet pas, on ne dit rien (comme avant).
 */
import { useEffect } from 'react'

export default function useEcranAllume(actif = true) {
  useEffect(() => {
    if (!actif || typeof navigator === 'undefined' || !navigator.wakeLock?.request) return undefined
    let verrou = null
    let fini = false
    const demander = async () => {
      if (fini || document.visibilityState !== 'visible' || (verrou && !verrou.released)) return
      try {
        verrou = await navigator.wakeLock.request('screen')
        if (fini) { verrou.release().catch(() => {}); verrou = null }
      } catch { /* refusé (batterie faible, réglage) : rien à dire */ }
    }
    const surVisibilite = () => { if (document.visibilityState === 'visible') demander() }
    demander()
    document.addEventListener('visibilitychange', surVisibilite)
    return () => {
      fini = true
      document.removeEventListener('visibilitychange', surVisibilite)
      if (verrou) { verrou.release().catch(() => {}); verrou = null }
    }
  }, [actif])
}
