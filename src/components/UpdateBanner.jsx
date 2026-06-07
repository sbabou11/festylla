/**
 * components/UpdateBanner.jsx — v8 debug (responsive)
 *
 * Toast en bas annonçant qu'une mise à jour est disponible.
 * Layout adaptatif :
 *   - Desktop (≥ 520px) : ligne horizontale, boutons à droite
 *   - Mobile (< 520px)  : empilé verticalement, boutons côte à côte sur largeur pleine
 */

import React, { useState, useEffect } from 'react'
import useAppUpdate from '../hooks/useAppUpdate'
import { RefreshCw, Clock, Sparkles } from 'lucide-react'

export default function UpdateBanner() {
  const { updateAvailable, applying, applyUpdate, snooze } = useAppUpdate()
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 520 : false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 520)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (!updateAvailable) return null

  return (
    <div
      role="status" aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 'max(env(safe-area-inset-bottom), 14px)',
        right: 14, left: 14,
        zIndex: 9999,
        display: 'flex', justifyContent: 'center',
        pointerEvents: 'none',
        animation: 'ycSlideUp .3s cubic-bezier(.2,.8,.2,1)',
      }}>
      <div style={{
        pointerEvents: 'auto',
        background: '#003048',
        color: '#FFF8F2',
        borderRadius: 12,
        padding: isMobile ? '14px' : '12px 14px 12px 16px',
        boxShadow: '0 10px 30px rgba(0,48,72,0.35)',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        gap: isMobile ? 12 : 12,
        maxWidth: 480, width: '100%',
        border: '1px solid rgba(0,144,144,.4)',
        boxSizing: 'border-box',
      }}>
        {/* Icône + texte */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <div style={{
            flexShrink: 0,
            width: 36, height: 36, borderRadius: 8,
            background: 'rgba(0,144,144,.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={18} style={{ color: '#14B5B5' }}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
              Mise à jour disponible
            </div>
            <div style={{ fontSize: 11, opacity: .8, lineHeight: 1.4, marginTop: 1 }}>
              Une nouvelle version de YllaCash est prête.
            </div>
          </div>
        </div>

        {/* Boutons */}
        <div style={{
          display: 'flex', gap: 6, flexShrink: 0,
          width: isMobile ? '100%' : 'auto',
        }}>
          <button onClick={snooze}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,248,242,.25)',
              color: '#FFF8F2',
              padding: '10px 12px',
              borderRadius: 8,
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              minHeight: 40, WebkitTapHighlightColor: 'transparent',
              flex: isMobile ? 1 : 'none',
            }}>
            <Clock size={12}/> Plus tard
          </button>
          <button onClick={applyUpdate} disabled={applying}
            style={{
              background: '#14B5B5',
              border: 'none',
              color: '#003048',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'var(--font)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              minHeight: 40, WebkitTapHighlightColor: 'transparent',
              opacity: applying ? 0.6 : 1,
              flex: isMobile ? 2 : 'none',
            }}>
            <RefreshCw size={12} className={applying ? 'spin' : ''}/>
            {applying ? 'Mise à jour…' : 'Mettre à jour'}
          </button>
        </div>
      </div>
    </div>
  )
}
