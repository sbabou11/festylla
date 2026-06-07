/**
 * components/PageTransition.jsx — v1.1.0
 *
 * Wrapper qui anime ses enfants lors d'un changement de page/onglet.
 * Utilise une "key" React : changer la prop `pageKey` démonte/remonte
 * l'enfant, ce qui rejoue l'animation CSS de montée (@keyframes ycPageEnter).
 *
 * Animation : fade + léger slide vertical (12px du bas vers le haut), 200ms.
 *
 * Usage :
 *   <PageTransition pageKey={currentPage}>
 *     <MaPage/>
 *   </PageTransition>
 *
 * Respecte automatiquement prefers-reduced-motion via la classe CSS
 * 'page-transition' définie dans index.css.
 */

import React from 'react'

export default function PageTransition({ pageKey, children, duration = 200 }) {
  return (
    <div
      key={pageKey}
      className="page-transition"
      style={{
        // Permet d'override la durée par défaut (200ms) au cas par cas
        animationDuration: `${duration}ms`,
      }}>
      {children}
    </div>
  )
}
