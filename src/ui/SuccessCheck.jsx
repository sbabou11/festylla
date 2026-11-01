/**
 * ui/SuccessCheck.jsx — coche qui se dessine (paiement accepté, pointage, recharge)
 * <SuccessCheck size={64} /> ; tone="danger" dessine une croix ; tone="inverse" pour un fond plein.
 * Rejoue l'animation quand `play` change (identifiant de vente, horodatage…).
 */
import React from 'react'
import clsx from 'clsx'
import s from './SuccessCheck.module.css'

export default function SuccessCheck({ size = 56, tone = 'success', cross = tone === 'danger', play, className }) {
  return (
    <svg key={play} className={clsx(s.check, s[tone], className)} width={size} height={size} viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r="25" />
      {cross
        ? <path d="M19 19l18 18M37 19L19 37" />
        : <path d="M17 29l7 7 15-15" />}
    </svg>
  )
}
