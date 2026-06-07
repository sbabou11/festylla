// pages/spectateur/MesReservations.jsx
import React from 'react'
import useAppStore from '../../store/useAppStore'
import { fmt } from '../../utils/helpers'

export default function MesReservations({ onNavigate }) {
  const { spectateurs, reservations, currentSpecId, annulerReservation } = useAppStore()
  const s = spectateurs.find(x => x.id === currentSpecId) || spectateurs[0]
  const resas = reservations.filter(r => r.specId === s.id)

  const cancel = async (id) => {
    if (window.confirm("Annuler cette réservation ?")) await annulerReservation(id)
  }

  return (
    <div style={{ maxWidth: 420, margin: '0 auto' }}>
      <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>Mes réservations — {s.nom}</div>
        {resas.length === 0 && <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)', fontSize: 13 }}>Aucune réservation</div>}
        {resas.map(r => (
          <div key={r.id} style={{ border: `0.5px solid ${r.status === 'ready' ? '#5DCAA5' : r.status === 'collected' ? 'var(--border)' : '#EF9F27'}`, borderRadius: 10, padding: 12, marginBottom: 10, background: r.status === 'ready' ? 'var(--brand-light)' : r.status === 'collected' ? 'var(--bg2)' : 'var(--amber-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{r.items.map(i => i.nom + (i.qty > 1 ? ` ×${i.qty}` : '')).join(', ')}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: r.status === 'ready' ? 'var(--brand-dark)' : r.status === 'collected' ? 'var(--muted)' : 'var(--amber)' }}>
                {r.status === 'ready' ? 'Prêt' : r.status === 'collected' ? 'Retiré' : 'En préparation'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: r.status === 'ready' ? 8 : 0 }}>
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)' }}>Code : <strong>{r.code}</strong></span>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{fmt(r.total)}</span>
            </div>
            {r.status === 'ready' && <div style={{ padding: '8px 10px', background: 'var(--brand-light)', border: '0.5px solid #5DCAA5', borderRadius: 8, fontSize: 12, color: 'var(--brand-dark)', marginBottom: 6 }}>✓ Prêt ! Présentez votre QR au stand.</div>}
            {r.status === 'pending' && (
              <div style={{ marginTop: 8 }}>
                <button onClick={() => cancel(r.id)} style={{ padding: '5px 10px', background: 'var(--red-light)', color: 'var(--red)', border: '0.5px solid #F09595', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                  Annuler la réservation
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={() => onNavigate('carte')} style={{ width: '100%', padding: 8, background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
        + Réserver un article
      </button>
    </div>
  )
}
