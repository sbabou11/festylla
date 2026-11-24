/**
 * hooks/useRetourFerme.js — le bouton « retour » du téléphone ferme d'abord la fenêtre ouverte
 * (24/11/2026, maquette https://claude.ai/artifact/6E6F81HNWziw19sdsjnYG9, idée d'Event Manager,
 * fiche Bottom Sheets de designmotionhq.com/patterns)
 *
 * useRetourFerme(open, onClose) : à l'ouverture, on ajoute une étape à l'historique (même adresse,
 * repères de l'appli gardés). Retour du téléphone (Android) ou geste retour (iPhone) : la fenêtre
 * du dessus se ferme au lieu de quitter l'écran. Si elle refuse de se fermer (opération en cours),
 * l'étape est remise et un message l'explique. Fermée autrement (croix, fond, bouton) : l'étape
 * ajoutée est retirée, sauf si une navigation a eu lieu entre-temps (on ne touche alors à rien).
 */
import { useEffect, useRef } from 'react'
import { toast } from '../ui/Toast'

const pile = []          // fenêtres ouvertes, la dernière au-dessus : { id, fermer, ouverte }
let suivant = 1
let ignorer = 0          // retours lancés par nous-mêmes (fenêtre fermée à la croix)
let ecoute = false

const etapeDe = (state) => (state && typeof state === 'object' && state.ycFenetre) || 0

function surRetour(ev) {
  if (ignorer > 0) { ignorer--; return }
  const haut = pile[pile.length - 1]
  if (!haut) return
  // On est revenu sous l'étape de la fenêtre du dessus : elle se ferme
  if (etapeDe(ev.state) >= haut.id) return
  pile.pop()
  haut.fermer()
  setTimeout(() => {
    if (!haut.ouverte()) return
    // Elle a refusé (opération en cours) : on la remet en place
    pile.push(haut)
    window.history.pushState({ ...(window.history.state || {}), ycFenetre: haut.id }, '', window.location.href)
    toast.info('Opération en cours : attendez la fin avant de fermer.')
  }, 60)
}

function ecouter() {
  if (ecoute || typeof window === 'undefined') return
  ecoute = true
  window.addEventListener('popstate', surRetour)
}

export default function useRetourFerme(open, onClose) {
  const fermerRef = useRef(onClose)
  fermerRef.current = onClose
  const ouverteRef = useRef(open)
  ouverteRef.current = open

  useEffect(() => {
    if (!open || typeof window === 'undefined' || !window.history?.pushState) return undefined
    ecouter()
    const entree = { id: suivant++, fermer: () => fermerRef.current?.(), ouverte: () => ouverteRef.current }
    pile.push(entree)
    // On garde les repères de l'appli (idx, key du routeur) et on ajoute le nôtre
    window.history.pushState({ ...(window.history.state || {}), ycFenetre: entree.id }, '', window.location.href)
    return () => {
      const i = pile.indexOf(entree)
      if (i < 0) return            // déjà fermée par le retour du téléphone
      pile.splice(i, 1)
      // Fermée autrement : on retire notre étape, seulement si rien n'a bougé entre-temps
      setTimeout(() => {
        if (etapeDe(window.history.state) === entree.id) { ignorer++; window.history.back() }
      }, 0)
    }
  }, [open])
}

// Pour les tests
export const _pile = pile
