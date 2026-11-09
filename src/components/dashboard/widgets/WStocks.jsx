/**
 * WStocks.jsx — Widget stocks bas et ruptures.
 *
 * Affiche les articles en rupture (stock = 0) et bas (stock <= seuilAlerte).
 */
import React, { useMemo } from 'react'
import { Package } from 'lucide-react'
import useAppStore from '../../../store/useAppStore'

export default function WStocks() {
  const { menu } = useAppStore()

  const { ruptures, bas } = useMemo(() => {
    const r = []
    const b = []
    ;(menu || []).forEach(m => {
      const stock = Number(m.stock || 0)
      const seuil = Number(m.seuilAlerte ?? 10)
      if (stock <= 0) r.push(m)
      else if (stock <= seuil) b.push(m)
    })
    return { ruptures: r, bas: b }
  }, [menu])

  const total = ruptures.length + bas.length

  return (
    <div style={{
      width: '100%', height: '100%',
      background: total > 0
        ? (ruptures.length > 0 ? 'var(--amber-light, #FAEEDA)' : 'var(--bg, #fff)')
        : 'var(--bg, #fff)',
      border: ruptures.length === 0 ? '0.5px solid var(--border, #D3D1C7)' : 'none',
      borderRadius: 12,
      padding: '12px 16px',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexShrink: 0 }}>
        <Package size={14} style={{ flexShrink: 0, color: ruptures.length > 0 ? 'var(--amber-dark, #854F0B)' : 'var(--muted, #888)' }}/>
        <div style={{ fontSize: 11, color: ruptures.length > 0 ? 'var(--amber-dark, #854F0B)' : 'var(--muted, #888)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
          Stocks
        </div>
      </div>
      {total === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted, #888)', fontStyle: 'italic', textAlign: 'center', padding: '6px 0' }}>
          Aucune alerte
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 500, lineHeight: 1, color: ruptures.length > 0 ? 'var(--amber-darker, #4A1B0C)' : 'var(--text, #1E1E1E)' }}>
                {ruptures.length}
              </div>
              <div style={{ fontSize: 9, color: 'var(--amber-dark, #854F0B)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                rupture{ruptures.length > 1 ? 's' : ''}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 500, lineHeight: 1, color: 'var(--text, #1E1E1E)' }}>
                {bas.length}
              </div>
              <div style={{ fontSize: 9, color: 'var(--muted, #888)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                bas
              </div>
            </div>
          </div>
          {/* Liste compacte des 3 premiers en rupture / bas */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, fontSize: 10, marginTop: 4 }}>
            {[...ruptures, ...bas].slice(0, 4).map(m => (
              <div key={m._docId || m.id || m.nom} style={{
                display: 'flex', justifyContent: 'space-between',
                color: ruptures.includes(m) ? 'var(--amber-darker, #4A1B0C)' : 'var(--muted, #888)',
                padding: '2px 0',
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 6 }}>
                  {m.nom}
                </span>
                <span style={{ fontWeight: 500, flexShrink: 0 }}>{m.stock || 0}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
