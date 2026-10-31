/**
 * components/ThemeToggle.jsx
 * Bouton mode sombre/clair réutilisable dans tous les espaces
 */
import React from 'react'
import { useTheme } from '../hooks/useTheme'
import { Sun, Moon } from 'lucide-react'

export default function ThemeToggle({ style = {}, variant = 'auto' }) {
  const { theme, toggleDark } = useTheme()
  // variant: 'auto' (par défaut), 'light' (pour fond clair), 'dark' (pour fond coloré/foncé)
  const isOnDarkBg = variant === 'dark'
  return (
    <button
      onClick={toggleDark}
      title={theme.isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      style={{
        width: 34, height: 34,
        borderRadius: 10,
        border: isOnDarkBg ? '0.5px solid rgba(255,255,255,.3)' : '0.5px solid var(--border)',
        background: isOnDarkBg ? 'rgba(255,255,255,.15)' : 'var(--bg2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        color: isOnDarkBg ? '#fff' : 'var(--text)',
        flexShrink: 0,
        ...style,
      }}>
      {theme.isDark
        ? <Sun  size={15} style={{ color: '#FCD34D' }}/>
        : <Moon size={15} style={{ color: isOnDarkBg ? '#fff' : '#64748b' }}/>
      }
    </button>
  )
}
