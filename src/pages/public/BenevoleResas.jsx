/**
 * pages/public/BenevoleResas.jsx
 * Onglet "Mes réservations" de l'espace bénévole
 */
import React from 'react'
import { fmt } from '../../utils/helpers'

export default function BenevoleResas({ resas, BRAND, AMBER, AMBER_L, cancelResa }) {
  return (
<div style={{ background:'var(--bg)', borderRadius:14, padding:14, boxShadow:'0 2px 8px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:12 }}>Mes réservations</div>
            {resas.length === 0 ? (
              <div style={{ textAlign:'center', padding:'24px 0', color:'var(--muted)', fontSize:13 }}>Aucune réservation</div>
            ) : resas.map(r => {
              const st = r.status === 'collected' ? { label:'Retirée ✅',       color:'var(--muted)', bg:'#F1F5F9' }
                : r.status === 'ready'      ? { label:'Prête ! 🎉',        color:'#065f46', bg:'#D1FAE5' }
                : r.status === 'cancelled'  ? { label:'Annulée ❌',         color:'var(--red)', bg:'#FEE2E2' }
                : r.status === 'processing' ? { label:'En préparation 👨‍🍳', color:'#534AB7', bg:'#EDE9FE' }
                :                            { label:'En revue 🕐',         color:AMBER,     bg:AMBER_L  }
              const canCancel = r.status === 'pending' || r.status === 'processing'
              return (
                <div key={r.id} style={{ border:`1px solid ${st.color}33`, borderRadius:12, padding:12, marginBottom:8, background:st.bg+'44' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                    <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10, background:st.bg, color:st.color }}>{st.label}</span>
                    <span style={{ fontSize:11, fontFamily:'monospace', color:'var(--muted)' }}>#{r.code}</span>
                  </div>
                  <div style={{ fontSize:13, color:'var(--text)', marginBottom: canCancel ? 8 : 0 }}>
                    {(r.items||[]).map(i => `${i.nom} ×${i.qty}`).join(', ')}
                  </div>
                  {canCancel && (
                    <button onClick={() => cancelResa(r.id, r.code)}
                      style={{ padding:'5px 12px', background:'var(--red-light)', color:'var(--red)', border:'1px solid var(--red)', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'system-ui' }}>
                      ✕ Annuler
                    </button>
                  )}
                </div>
              )
            })}
          </div>
  )
}
