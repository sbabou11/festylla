/**
 * hooks/useTheme.js
 * Applique le thème Studio au DOM au montage et à chaque update.
 */

import { useEffect } from 'react'
import useAppStore from '../store/useAppStore'

export function useTheme() {
  const { theme, applyThemeToDom, updateTheme, resetTheme } = useAppStore()

  useEffect(() => {
    applyThemeToDom()
  }, [theme])

  const toggleDark = () => updateTheme({ isDark: !theme.isDark })

  return { theme, updateTheme, resetTheme, toggleDark }
}
