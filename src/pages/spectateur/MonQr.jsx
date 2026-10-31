// pages/spectateur/MonQr.jsx
import React from 'react'
import useAppStore from '../../store/useAppStore'
import { fmt } from '../../utils/helpers'
import QrCode from '../../components/QrCode'
import Avatar from '../../components/Avatar'

export default function MonQr({ onNavigate }) {
  const { spectateurs, currentSpecId } = useAppStore()
  const s = spectateurs.find(x => x.id === currentSpecId) || spectateurs[0]
  return (
    <div style={{ maxWidth: 300, margin: '0 auto' }}>
      <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius-lg)', padding: 16, border: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 16px' }}>
          <Avatar nom={s.nom} src={s.avatar} size={56} style={{ marginBottom: 12, cursor: 'pointer' }} onClick={() => onNavigate('mon-profil')} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{s.nom}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, fontFamily: 'monospace' }}>{s.id}</div>
          <QrCode value={s.id} size={160} />
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--brand-dark)', marginTop: 12 }}>{fmt(s.solde)}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>solde disponible</div>
        </div>
        <div style={{ padding: '9px 12px', background: 'var(--purple-light)', border: '0.5px solid #AFA9EC', borderRadius: 8, fontSize: 13, color: 'var(--purple)', marginBottom: 10 }}>
          Présentez ce QR aux stands et à la billetterie
        </div>
        <button onClick={() => onNavigate('mes-reservations')} style={{ width: '100%', padding: 8, border: '0.5px solid var(--border2)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
          Mes réservations
        </button>
      </div>
    </div>
  )
}
