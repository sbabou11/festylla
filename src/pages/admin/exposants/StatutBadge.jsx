/**
 * pages/admin/exposants/StatutBadge.jsx — pastille de statut de paiement d'un exposant
 * Le statut forcé à la main porte une icône d'alerte et son motif en infobulle.
 */
import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { Badge } from '../../../ui'
import { computeExpoStatut, STATUT_LABEL, isExpoStatutForce } from '../../../utils/expositions'

// Même correspondance que statutColors() : payé vert, acompte or, impayé brique
export const STATUT_TONE = { paye: 'success', acompte: 'warning', impaye: 'danger' }

export default function StatutBadge({ expo, statut = computeExpoStatut(expo), detailed = false }) {
  const forced = isExpoStatutForce(expo)
  const title = !forced ? undefined
    : detailed ? `Statut forcé manuellement.\nMotif : ${expo.forcedStatutMotif || '—'}`
    : 'Statut forcé manuellement'
  return (
    <Badge tone={STATUT_TONE[statut] || 'neutral'} icon={forced ? AlertTriangle : undefined} title={title}
      aria-label={forced ? `${STATUT_LABEL[statut]} (statut forcé)` : undefined}>
      {STATUT_LABEL[statut]}
    </Badge>
  )
}
