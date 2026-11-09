/**
 * WBenevoles.jsx — Widget bénévoles.
 *
 * Total bénévoles + nombre ayant pris au moins une consommation aujourd'hui.
 */
import React, { useState, useEffect, useMemo } from 'react'
import { Users } from 'lucide-react'
import { collection, query, onSnapshot } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import useEventStore from '../../../store/useEventStore'
import useAppStore from '../../../store/useAppStore'
import { getTs } from '../../../utils/dailyKpis'

export default function WBenevoles() {
  const { currentEventId } = useEventStore()
  const { logs, reservations } = useAppStore()
  const [benevoles, setBenevoles] = useState([])

  // Chargement listener bénévoles
  useEffect(() => {
    if (!currentEventId) return
    const unsub = onSnapshot(
      query(collection(db, 'events', currentEventId, 'benevoles')),
      snap => setBenevoles(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      () => setBenevoles([])
    )
    return () => unsub()
  }, [currentEventId])

  // Bénévoles actifs aujourd'hui = ceux ayant une résa bénévole 'collected' du jour
  const actifsJour = useMemo(() => {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const startTs = startOfDay.getTime()
    const benevsActifs = new Set()
    ;(reservations || []).forEach(r => {
      if (r.isBenev && r.status === 'collected' && getTs(r) >= startTs && r.benevoleId) {
        benevsActifs.add(r.benevoleId)
      }
    })
    return benevsActifs.size
  }, [reservations])

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--bg, #fff)',
      border: '0.5px solid var(--border, #D3D1C7)',
      borderRadius: 12,
      padding: '12px 16px',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Users size={14} style={{ flexShrink: 0, color: 'var(--muted, #888)' }}/>
        <div style={{ fontSize: 11, color: 'var(--muted, #888)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
          Bénévoles
        </div>
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.1, color: 'var(--text, #1E1E1E)' }}>
          {benevoles.length}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted, #888)', marginTop: 2 }}>
          {actifsJour > 0 ? `${actifsJour} actif${actifsJour > 1 ? 's' : ''} aujourd'hui` : 'Inscrits au total'}
        </div>
      </div>
    </div>
  )
}
