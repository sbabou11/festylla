// pages/spectateur/Carte.jsx
import React, { useState } from 'react'
import useAppStore from '../../store/useAppStore'
import { fmt } from '../../utils/helpers'
import ArticleInfoModal from '../../components/ArticleInfoModal'

export default function Carte({ onNavigate }) {
  const { spectateurs, menu, reservations, currentSpecId, creerReservation } = useAppStore()
  const s = spectateurs.find(x => x.id === currentSpecId) || spectateurs[0]
  const [qtys, setQtys] = useState({})
  const [done, setDone] = useState(null)
  const [selectedInfoItem, setSelectedInfoItem] = useState(null) // modale composition

  const cats = [...new Set(menu.map(m => m.cat))]
  const change = (id, d) => setQtys(q => { const v = Math.max(0, (q[id] || 0) + d); return { ...q, [id]: v } })
  const items = Object.entries(qtys).filter(([, q]) => q > 0).map(([id, qty]) => { const m = menu.find(x => x.id === id); return { ...m, qty } })
  const total = items.reduce((a, i) => a + i.prix * i.qty, 0)

  const confirm = async () => {
    const resa = await creerReservation(s.id, items)
    if (!resa) return alert('Solde insuffisant ou erreur')
    setDone(resa); setQtys({})
  }

  if (done) return (
    <div style={{ maxWidth: 400, margin: '0 auto' }}>
      <div style={{ padding: '9px 12px', background: 'var(--brand-light)', border: '0.5px solid #5DCAA5', borderRadius: 8, fontSize: 13, color: 'var(--brand-dark)', marginBottom: 12 }}>✓ Réservation confirmée !</div>
      <div style={{ border: '0.5px solid #5DCAA5', borderRadius: 10, padding: 14, background: 'var(--brand-light)', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>Récapitulatif</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'var(--amber-light)', color: 'var(--amber)' }}>En préparation</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{done.items.map(i => i.nom + (i.qty > 1 ? ` ×${i.qty}` : '')).join(' · ')}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)' }}>Code : <strong>{done.code}</strong></span>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{fmt(done.total)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onNavigate('mes-reservations')} style={{ flex: 1, padding: 8, border: '0.5px solid var(--border2)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>Mes réservations</button>
        <button onClick={() => setDone(null)} style={{ flex: 1, padding: 8, background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>Commander encore</button>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 460, margin: '0 auto' }}>
      <div style={{ padding: '9px 12px', background: 'var(--purple-light)', border: '0.5px solid #AFA9EC', borderRadius: 8, fontSize: 13, color: 'var(--purple)', marginBottom: 12 }}>
        Réservez pour un retrait rapide sans attente.
      </div>
      {cats.map(cat => (
        <div key={cat} style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>{cat}</div>
          {menu.filter(m => m.cat === cat).map(m => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid var(--border)' }}>
              <div
                onClick={() => setSelectedInfoItem(m)}
                style={{ cursor: 'pointer' }}
                title="Voir la composition">
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{m.nom}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.stock} dispo</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-dark)' }}>{fmt(m.prix)}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button onClick={() => change(m.id, -1)} style={{ width: 24, height: 24, borderRadius: 6, border: '0.5px solid var(--border2)', background: 'var(--bg)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)', fontFamily: 'var(--font)' }}>−</button>
                  <span style={{ fontSize: 13, fontWeight: 600, minWidth: 16, textAlign: 'center', color: 'var(--text)' }}>{qtys[m.id] || 0}</span>
                  <button onClick={() => change(m.id, 1)} style={{ width: 24, height: 24, borderRadius: 6, border: '0.5px solid var(--border2)', background: 'var(--bg)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)', fontFamily: 'var(--font)' }}>+</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
      {items.length > 0 && (
        <div style={{ background: 'var(--bg)', border: `2px solid var(--brand)`, borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>Ma réservation</div>
          {items.map(i => <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '0.5px solid var(--border)', color: 'var(--text)' }}><span>{i.nom} ×{i.qty}</span><span>{fmt(i.prix * i.qty)}</span></div>)}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, margin: '10px 0', color: 'var(--text)' }}><span>Total</span><span style={{ color: 'var(--brand-dark)' }}>{fmt(total)}</span></div>
          <div style={{ padding: '8px 10px', background: s.solde >= total ? 'var(--brand-light)' : 'var(--red-light)', borderRadius: 8, fontSize: 12, color: s.solde >= total ? 'var(--brand-dark)' : 'var(--red)', marginBottom: 10 }}>
            {s.solde >= total ? `✓ Solde suffisant (${fmt(s.solde)})` : `✗ Solde insuffisant (${fmt(s.solde)})`}
          </div>
          <button onClick={confirm} disabled={s.solde < total} style={{ width: '100%', padding: 8, background: s.solde >= total ? 'var(--brand)' : 'var(--bg3)', color: s.solde >= total ? '#fff' : 'var(--muted)', border: 'none', borderRadius: 8, fontSize: 13, cursor: s.solde >= total ? 'pointer' : 'not-allowed', fontFamily: 'var(--font)' }}>
            Confirmer la réservation
          </button>
        </div>
      )}

      {/* Modale composition / allergènes au clic sur un article */}
      {selectedInfoItem && (
        <ArticleInfoModal
          item={selectedInfoItem}
          qty={qtys[selectedInfoItem.id] || 0}
          onAdd={() => change(selectedInfoItem.id, +1)}
          onClose={() => setSelectedInfoItem(null)}
        />
      )}
    </div>
  )
}
