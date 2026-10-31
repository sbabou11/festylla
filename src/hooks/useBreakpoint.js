/**
 * hooks/useBreakpoint.js
 * Détecte la taille d'écran courante.
 * Retourne : { isMobile, isTablet, isDesktop, width }
 */
import { useState, useEffect } from 'react'

export function useBreakpoint() {
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  )

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handler, { passive: true })
    return () => window.removeEventListener('resize', handler)
  }, [])

  return {
    width,
    isMobile:  width < 641,
    isTablet:  width >= 641 && width < 1025,
    isDesktop: width >= 1025,
  }
}
