/**
 * WCachets.jsx — Widget cachets artistes.
 *
 * Affiche : total cachets à payer (planifié), payés, et 3 cachets prochains.
 */
import React, { useState, useEffect, useMemo } from 'react'
import { Mic } from 'lucide-react'
import { watchCachets } from '../../../firebase/service'
import { fmtEShort } from '../../../utils/dailyKpis'
import useEventStore from '../../../store/useEventStore'

export default function WCachets() {
  const { currentEventId } = useEventStore()
  const [cachets, setCachets] = useState([])

  useEffect(() => {
    if (!currentEventId) return
    const unsub = watchCachets(setCachets, currentEventId)
    return () => unsub && unsub()
  }, [currentEventId])

  const { aPayer, aPayerCount, payes, payesCount, prochains } = useMemo(() => {
    let aPayer = 0, aPayerCount = 0
    let payes = 0, payesCount = 0
    cachets.forEach(c => {
      if (c.statut === 'planifie') { aPayer += (c.montant || 0) / 100; aPayerCount++ }
      else if (c.statut === 'paye') { payes += (c.montant || 0) / 100; payesCount++ }
    })
    const prochains = cachets.filter(c => c.statut === 'planifie').slice(0, 3)
    return { aPayer, aPayerCount, payes, payesCount, prochains }
  }, [cachets])

  const hasOutstanding = aPayer > 0

  return (
    <div style={{
      width: '100%', height: '100%',
      background: hasOutstanding ? 'var(--amber-light, #FAEEDA)' : 'var(--bg, #fff)',
      border: hasOutstanding ? 'none' : '0.5px solid var(--border, #D3D1C7)',
      borderRadius: 12,
      padding: '12px 16px',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexShrink: 0 }}>
        <Mic size={14} style={{ flexShrink: 0, color: hasOutstanding ? 'var(--amber-dark, #854F0B)' : 'var(--muted, #888)' }}/>
        <div style={{ fontSize: 11, color: hasOutstanding ? 'var(--amber-dark, #854F0B)' : 'var(--muted, #888)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
          Cachets
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 6, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500, lineHeight: 1, color: hasOutstanding ? 'var(--amber-darker, #4A1B0C)' : 'var(--text, #1E1E1E)' }}>
            {fmtEShort(aPayer)}
          </div>
          <div style={{ fontSize: 9, color: hasOutstanding ? 'var(--amber-dark, #854F0B)' : 'var(--muted, #888)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            à payer{aPayerCount > 0 ? ` (${aPayerCount})` : ''}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1, color: 'var(--text, #1E1E1E)', opacity: 0.7 }}>
            {fmtEShort(payes)}
          </div>
          <div style={{ fontSize: 9, color: 'var(--muted, #888)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            payés
          </div>
        </div>
      </div>

      {prochains.length > 0 && (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, marginTop: 4, paddingTop: 4, borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
          {prochains.map(c => (
            <div key={c.id} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '2px 0', fontSize: 11,
              color: hasOutstanding ? 'var(--amber-darker, #4A1B0C)' : 'var(--text, #1E1E1E)',
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 6 }}>
                {c.artiste || '—'}
              </span>
              <span style={{ flexShrink: 0, fontWeight: 500 }}>
                {fmtEShort((c.montant || 0) / 100)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
