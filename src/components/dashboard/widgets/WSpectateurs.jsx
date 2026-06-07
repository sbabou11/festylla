/**
 * WSpectateurs.jsx — Widget mini KPI spectateurs.
 *
 * Inscrits totaux + actifs (avec solde > 0).
 */
import React from 'react'
import { Users } from 'lucide-react'
import useAppStore from '../../../store/useAppStore'

export default function WSpectateurs() {
  const { spectateurs } = useAppStore()
  const total  = (spectateurs || []).length
  const actifs = (spectateurs || []).filter(s => (s.solde || 0) > 0).length

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--bg, #fff)',
      border: '0.5px solid var(--border, #D3D1C7)',
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Users size={16} style={{ flexShrink: 0, color: 'var(--muted, #888)' }}/>
        <div style={{ fontSize: 11, color: 'var(--muted, #888)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
          Spectateurs
        </div>
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 500, lineHeight: 1.1, color: 'var(--text, #1E1E1E)' }}>
          {total.toLocaleString('fr-FR')}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted, #888)', marginTop: 2 }}>
          {actifs} avec solde
        </div>
      </div>
    </div>
  )
}
