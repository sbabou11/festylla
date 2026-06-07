/**
 * WPlanning.jsx — Widget planning du jour.
 *
 * Affiche les prochains créneaux à venir aujourd'hui ou demain.
 */
import React, { useState, useEffect, useMemo } from 'react'
import { Calendar } from 'lucide-react'
import { watchPlanning } from '../../../firebase/service'
import useEventStore from '../../../store/useEventStore'

// Extrait un timestamp d'un champ Firestore (Timestamp, Date, string ISO, ms)
const toMs = (v) => {
  if (!v) return 0
  if (v.toDate) return v.toDate().getTime()
  if (v.seconds) return v.seconds * 1000
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'string') return new Date(v).getTime()
  if (typeof v === 'number') return v
  return 0
}

const fmtHeure = (v) => {
  const ms = toMs(v)
  if (!ms) return '—'
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export default function WPlanning() {
  const { currentEventId } = useEventStore()
  const [planning, setPlanning] = useState([])

  useEffect(() => {
    if (!currentEventId) return
    const unsub = watchPlanning(setPlanning, currentEventId)
    return () => unsub && unsub()
  }, [currentEventId])

  // Filtrer les 4 prochains créneaux non terminés
  const prochains = useMemo(() => {
    const now = Date.now()
    return (planning || [])
      .filter(c => {
        const finMs = toMs(c.fin)
        return finMs === 0 || finMs >= now  // garde ceux dont la fin n'est pas passée
      })
      .sort((a, b) => toMs(a.debut) - toMs(b.debut))
      .slice(0, 4)
  }, [planning])

  // Marquer celui en cours (now entre debut et fin)
  const isEnCours = (c) => {
    const now = Date.now()
    const d = toMs(c.debut)
    const f = toMs(c.fin)
    return d > 0 && f > 0 && now >= d && now <= f
  }

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
        <Calendar size={14} style={{ flexShrink: 0, color: 'var(--muted, #888)' }}/>
        <div style={{ fontSize: 11, color: 'var(--muted, #888)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
          Prochains créneaux
        </div>
      </div>

      {prochains.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--muted, #888)', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
          Aucun créneau à venir
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {prochains.map(c => {
            const enCours = isEnCours(c)
            return (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 0',
                borderBottom: '0.5px solid var(--border, #E2E0D5)',
              }}>
                <div style={{
                  background: enCours ? 'var(--brand, #0F6E56)' : 'var(--bg2, #F1EFE8)',
                  color: enCours ? '#fff' : 'var(--muted, #888)',
                  borderRadius: 6, padding: '2px 6px',
                  fontSize: 10, fontWeight: 500,
                  fontVariantNumeric: 'tabular-nums',
                  flexShrink: 0,
                }}>
                  {fmtHeure(c.debut)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12,
                    color: 'var(--text, #1E1E1E)',
                    fontWeight: enCours ? 500 : 400,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {c.artiste || c.titre || '—'}
                  </div>
                  {c.scene && (
                    <div style={{ fontSize: 10, color: 'var(--muted, #888)' }}>
                      {c.scene}
                    </div>
                  )}
                </div>
                {enCours && (
                  <span style={{
                    fontSize: 9, fontWeight: 500, color: 'var(--brand, #0F6E56)',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    flexShrink: 0,
                  }}>
                    en cours
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
