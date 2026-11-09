/**
 * WTopArticles.jsx — Widget top articles vendus du jour.
 *
 * Liste les 5 articles avec le plus de CA aujourd'hui.
 */
import React, { useMemo } from 'react'
import { TrendingUp } from 'lucide-react'
import useAppStore from '../../../store/useAppStore'
import { getTs, fmtEShort } from '../../../utils/dailyKpis'

export default function WTopArticles() {
  const { logs } = useAppStore()

  const top = useMemo(() => {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const startTs = startOfDay.getTime()

    const articlesMap = {}
    ;(logs || []).forEach(t => {
      if (getTs(t) < startTs) return
      if (!['debit', 'retrait', 'benev-retrait'].includes(t.type)) return
      ;(t.items || []).forEach(i => {
        const nom = i.nom || 'Inconnu'
        if (!articlesMap[nom]) articlesMap[nom] = { nom, qty: 0, ca: 0 }
        articlesMap[nom].qty += (i.qty || 1)
        articlesMap[nom].ca  += (i.total || (i.prixUnit || i.prix || 0) * (i.qty || 1)) / 100
      })
    })
    return Object.values(articlesMap).sort((a, b) => b.ca - a.ca).slice(0, 5)
  }, [logs])

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--bg, #fff)',
      border: '0.5px solid var(--border, #D3D1C7)',
      borderRadius: 12,
      padding: '12px 16px',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexShrink: 0 }}>
        <TrendingUp size={14} style={{ flexShrink: 0, color: 'var(--muted, #888)' }}/>
        <div style={{ fontSize: 11, color: 'var(--muted, #888)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
          Top articles du jour
        </div>
      </div>
      {top.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--muted, #888)', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
          Aucune vente aujourd'hui
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {top.map((a, i) => (
            <div key={a.nom} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              padding: '4px 0', borderBottom: i < top.length - 1 ? '0.5px solid var(--border, #E2E0D5)' : 'none',
              fontSize: 12,
            }}>
              <span style={{ color: 'var(--text, #1E1E1E)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
                {a.nom}
              </span>
              <span style={{ flexShrink: 0, fontWeight: 500, color: 'var(--text, #1E1E1E)' }}>
                {fmtEShort(a.ca)}
                <span style={{ color: 'var(--muted, #888)', marginLeft: 4, fontWeight: 400 }}>· {a.qty}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
