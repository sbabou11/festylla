/**
 * WAlertes.jsx — Widget alertes financières (soldes négatifs, écarts…).
 *
 * Détection allégée (cf. Alertes.jsx pour version complète).
 * Cliquable pour aller sur la page Alertes complète.
 */
import React, { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import useAppStore from '../../../store/useAppStore'

function countAnomalies(spectateurs, logs) {
  let critiques = 0, attentions = 0
  ;(spectateurs || []).forEach(s => { if ((s.solde || 0) < 0) critiques++ })
  const txParSpec = {}
  ;(logs || []).forEach(t => {
    if (!t.specId) return
    txParSpec[t.specId] = (txParSpec[t.specId] || 0) + 1
  })
  Object.values(txParSpec).forEach(c => { if (c >= 5) attentions++ })
  ;(logs || []).forEach(t => { if (t.type === 'debit' && (t.montant || 0) > 5000) attentions++ })
  return { critiques, attentions, total: critiques + attentions }
}

export default function WAlertes() {
  const { spectateurs, logs } = useAppStore()
  const anomalies = useMemo(() => countAnomalies(spectateurs, logs), [spectateurs, logs])

  const isCritique = anomalies.critiques > 0
  const hasAlertes = anomalies.total > 0

  return (
    <div style={{
      width: '100%', height: '100%',
      background: hasAlertes ? (isCritique ? 'var(--red-light, #FCEBEB)' : 'var(--amber-light, #FAEEDA)') : 'var(--bg2, #F1EFE8)',
      color: hasAlertes ? (isCritique ? 'var(--red, #A32D2D)' : 'var(--amber-dark, #854F0B)') : 'var(--muted, #5F5E5A)',
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertTriangle size={16} style={{ flexShrink: 0 }}/>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500, opacity: hasAlertes ? 1 : 0.7 }}>
          Alertes
        </div>
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 500, lineHeight: 1.1 }}>
          {anomalies.total}
        </div>
        <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
          {!hasAlertes ? 'Aucune alerte' :
           isCritique ? `${anomalies.critiques} critique${anomalies.critiques > 1 ? 's' : ''}`
                      : `${anomalies.attentions} attention${anomalies.attentions > 1 ? 's' : ''}`}
        </div>
      </div>
    </div>
  )
}
