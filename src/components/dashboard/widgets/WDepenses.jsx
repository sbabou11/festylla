/**
 * WDepenses.jsx — Widget dépenses récentes.
 *
 * Liste les 4 dernières dépenses (collection events/{eid}/finances avec sens=depense).
 * Listener Firestore en temps réel via watchFinances().
 */
import React, { useState, useEffect } from 'react'
import { Wallet } from 'lucide-react'
import { watchFinances } from '../../../firebase/service'
import { fmtEShort } from '../../../utils/dailyKpis'
import useEventStore from '../../../store/useEventStore'

export default function WDepenses() {
  const { currentEventId } = useEventStore()
  const [finances, setFinances] = useState([])

  useEffect(() => {
    if (!currentEventId) return
    const unsub = watchFinances(setFinances, currentEventId)
    return () => unsub && unsub()
  }, [currentEventId])

  const depenses = finances
    .filter(f => f.sens === 'depense')
    .slice(0, 4)

  const totalJour = (() => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
    return finances
      .filter(f => f.sens === 'depense' && f.date === todayStr)
      .reduce((s, f) => s + (f.montant || 0) / 100, 0)
  })()

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexShrink: 0 }}>
        <Wallet size={14} style={{ flexShrink: 0, color: 'var(--muted, #888)' }}/>
        <div style={{ fontSize: 11, color: 'var(--muted, #888)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
          Dépenses
        </div>
      </div>
      <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--text, #1E1E1E)', marginBottom: 2 }}>
        {fmtEShort(totalJour)}
        <span style={{ fontSize: 10, color: 'var(--muted, #888)', fontWeight: 400, marginLeft: 6 }}>
          aujourd'hui
        </span>
      </div>
      {depenses.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--muted, #888)', fontStyle: 'italic', marginTop: 6 }}>
          Aucune dépense enregistrée
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, marginTop: 6, paddingTop: 6, borderTop: '0.5px solid var(--border, #E2E0D5)' }}>
          {depenses.map(d => (
            <div key={d.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              padding: '3px 0', fontSize: 11,
            }}>
              <span style={{ color: 'var(--text, #1E1E1E)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 6 }}>
                {d.libelle || d.categorie || 'Sans libellé'}
              </span>
              <span style={{ flexShrink: 0, color: 'var(--text, #1E1E1E)', fontWeight: 500 }}>
                −{fmtEShort((d.montant || 0) / 100)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
