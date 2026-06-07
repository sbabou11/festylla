/**
 * WRecettesJour.jsx — Hero widget recettes du jour.
 *
 * Variante visuelle "hero" : dégradé brand, gros chiffre.
 * Recommandé en 2x2 ou plus large.
 */
import React from 'react'
import useAppStore from '../../../store/useAppStore'
import { computeDailyKpis, fmtEShort, fmtEuroPrecis } from '../../../utils/dailyKpis'

export default function WRecettesJour() {
  const { spectateurs, reservations, logs } = useAppStore()
  const k = computeDailyKpis({ spectateurs, reservations, logs })

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'linear-gradient(135deg, var(--brand, #003048) 0%, var(--brand-dark, #04342C) 100%)',
      color: '#fff',
      borderRadius: 12,
      padding: '16px 18px',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>
      <div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
          Recettes du jour
        </div>
        <div style={{ fontSize: 28, fontWeight: 500, marginTop: 4, lineHeight: 1.1 }}>
          {fmtEuroPrecis(k.recettesJour)}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 6 }}>
          {k.txCount} transaction{k.txCount > 1 ? 's' : ''}
          {k.ventesCount > 0 ? ` · panier moyen ${fmtEuroPrecis(k.panierMoyen)}` : ''}
        </div>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, paddingTop: 12, marginTop: 12,
        borderTop: '0.5px solid rgba(255,255,255,0.2)',
      }}>
        <div>
          <div style={{ opacity: 0.7, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Crédits</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{fmtEShort(k.creditsJour)}</div>
        </div>
        <div>
          <div style={{ opacity: 0.7, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ventes</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{fmtEShort(k.ventesJour)}</div>
        </div>
        <div>
          <div style={{ opacity: 0.7, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dépenses</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{fmtEShort(k.depensesJour)}</div>
        </div>
      </div>
    </div>
  )
}
