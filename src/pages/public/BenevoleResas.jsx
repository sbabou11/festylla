/**
 * pages/public/BenevoleResas.jsx — v8 debug modernisé
 * Onglet "Mes réservations" de l'espace bénévole
 */
import React from 'react'
import { CheckCircle, AlertCircle, Clock, X, Sparkles } from 'lucide-react'

export default function BenevoleResas({ resas, BRAND, AMBER, AMBER_L, cancelResa }) {
  return (
    <div style={{
      background: 'var(--bg)',
      borderRadius: 14,
      padding: 16,
      boxShadow: '0 2px 8px rgba(0,0,0,.06)',
      border: '0.5px solid var(--border)',
    }}>
      <div style={{
        fontSize: 14, fontWeight: 800, color: 'var(--text)',
        marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8,
      }}>
        📦 Mes réservations
        {resas.length > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700,
            padding: '2px 8px', borderRadius: 10,
            background: 'var(--bg2)', color: 'var(--muted)',
          }}>
            {resas.length}
          </span>
        )}
      </div>
      {resas.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '32px 16px',
          color: 'var(--muted)', fontSize: 13,
          background: 'var(--bg2)', borderRadius: 12,
        }}>
          <Sparkles size={28} style={{ marginBottom: 8, opacity: 0.5 }}/>
          <div>Aucune réservation pour le moment.</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>
            Rendez-vous dans Conso pour commander.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {resas.map(r => {
            const st = r.status === 'collected' ? { label: 'Retirée', color: 'var(--green-dark)', bg: 'var(--green-light)', icon: <CheckCircle size={12}/> }
              : r.status === 'ready'      ? { label: 'Prête', color: 'var(--gold-dark)', bg: 'var(--gold-light)', icon: <AlertCircle size={12}/> }
              : r.status === 'cancelled'  ? { label: 'Annulée', color: 'var(--red)', bg: 'var(--red-light)', icon: <X size={12}/> }
              : r.status === 'processing' ? { label: 'En préparation', color: '#5040C0', bg: '#E5DFFA', icon: <Clock size={12}/> }
              :                              { label: 'En attente', color: AMBER, bg: AMBER_L, icon: <Clock size={12}/> }
            const canCancel = r.status === 'pending' || r.status === 'processing'
            return (
              <div key={r.id} style={{
                background: 'var(--bg2)',
                borderRadius: 12,
                padding: 12,
                borderLeft: `3px solid ${st.color}`,
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 8, gap: 8,
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                    background: st.bg, color: st.color,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    {st.icon} {st.label}
                  </span>
                  <span style={{
                    fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)',
                    flexShrink: 0,
                  }}>
                    #{r.code}
                  </span>
                </div>
                <div style={{
                  fontSize: 13, color: 'var(--text)', fontWeight: 500,
                  marginBottom: canCancel ? 10 : 0,
                  lineHeight: 1.4,
                }}>
                  {(r.items || []).map(i => `${i.nom} ×${i.qty}`).join(', ')}
                </div>
                {canCancel && (
                  <button onClick={() => cancelResa(r.id, r.code)}
                    style={{
                      padding: '10px 14px',
                      minHeight: 40,
                      background: 'var(--red-light)',
                      color: 'var(--red)',
                      border: '1px solid var(--red)',
                      borderRadius: 8,
                      fontSize: 12, fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                    <X size={14}/> Annuler
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
