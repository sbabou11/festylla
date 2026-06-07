// pages/spectateur/Solde.jsx
import React from 'react'
import useAppStore from '../../store/useAppStore'
import { fmt } from '../../utils/helpers'

export default function Solde() {
  const { spectateurs, reservations, currentSpecId } = useAppStore()
  const s = spectateurs.find(x => x.id === currentSpecId) || spectateurs[0]
  const resaBloque = reservations.filter(r => r.specId === s.id && r.status !== 'collected').reduce((a, r) => a + r.total, 0)
  const txColor = { credit: 'var(--brand-dark)', debit: 'var(--red)', reservation: 'var(--amber)', annulation: 'var(--purple)' }
  return (
    <div style={{ maxWidth: 380, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: '12px 14px' }}><div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Solde disponible</div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--brand-dark)' }}>{fmt(s.solde)}</div></div>
        <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: '12px 14px' }}><div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>En réservation</div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--amber)' }}>{fmt(resaBloque)}</div><div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>débité au retrait</div></div>
      </div>
      <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>Historique</div>
        {(s.transactions || []).map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg2)', borderRadius: 8, marginBottom: 6 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, background: t.type === 'credit' ? 'var(--brand-light)' : t.type === 'reservation' ? 'var(--amber-light)' : 'var(--red-light)' }}>
              {t.type === 'credit' ? '+' : t.type === 'reservation' ? '⏳' : '−'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.date}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: txColor[t.type] || 'var(--text)', flexShrink: 0 }}>
              {t.type === 'credit' ? '+' : t.type === 'reservation' ? '' : '−'}{fmt(t.montant)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
