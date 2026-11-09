/**
 * WReservations.jsx — Widget réservations en cours.
 *
 * Affiche : nombre de résas en attente / prêtes / actives totales.
 * Couleur amber si des résas sont prêtes (à retirer).
 */
import React from 'react'
import { Calendar } from 'lucide-react'
import useAppStore from '../../../store/useAppStore'

export default function WReservations() {
  const { reservations } = useAppStore()

  const resas = reservations || []
  const enAttente = resas.filter(r =>
    (r.status === 'pending' || r.status === 'processing') && !r.isBenev
  ).length
  const pretes = resas.filter(r => r.status === 'ready' && !r.isBenev).length
  const total = enAttente + pretes

  const hasReady = pretes > 0

  return (
    <div style={{
      width: '100%', height: '100%',
      background: hasReady ? 'var(--amber-light, #FAEEDA)' : 'var(--bg, #fff)',
      border: hasReady ? 'none' : '0.5px solid var(--border, #D3D1C7)',
      borderRadius: 12,
      padding: '12px 16px',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Calendar size={14} style={{ flexShrink: 0, color: hasReady ? 'var(--amber-dark, #854F0B)' : 'var(--muted, #888)' }}/>
        <div style={{ fontSize: 11, color: hasReady ? 'var(--amber-dark, #854F0B)' : 'var(--muted, #888)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
          Réservations
        </div>
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.1, color: hasReady ? 'var(--amber-darker, #4A1B0C)' : 'var(--text, #1E1E1E)' }}>
          {total}
        </div>
        <div style={{ fontSize: 10, color: hasReady ? 'var(--amber-dark, #854F0B)' : 'var(--muted, #888)', marginTop: 2 }}>
          {pretes > 0 && (
            <span style={{ fontWeight: 500 }}>{pretes} à retirer</span>
          )}
          {pretes > 0 && enAttente > 0 && ' · '}
          {enAttente > 0 && `${enAttente} en attente`}
          {total === 0 && 'Aucune en cours'}
        </div>
      </div>
    </div>
  )
}
