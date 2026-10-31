/**
 * ui/Stat.jsx — indicateur clé : libellé, valeur, évolution, tendance
 * tone  : brand | success | coral | warning (couleur de l'icône et de la courbe)
 * delta : { value: '+12 %', direction: 'up' | 'down' | 'flat', label: 'vs hier' }
 */
import React from 'react'
import clsx from 'clsx'
import Sparkline from './Sparkline'
import s from './Stat.module.css'

const TONES = {
  brand:   { color: 'var(--brand)', fill: 'var(--brand-light)' },
  success: { color: 'var(--green)', fill: 'var(--green-light)' },
  coral:   { color: 'var(--coral)', fill: 'var(--coral-light)' },
  warning: { color: 'var(--gold)',  fill: 'var(--gold-light)' },
}

export default function Stat({ label, value, sub, delta, trend, icon: Icon, tone = 'brand', className }) {
  const t = TONES[tone] || TONES.brand
  return (
    <div className={clsx(s.stat, className)}>
      <div className={s.top}>
        <span className={s.label}>{label}</span>
        {Icon && (
          <span className={s.icon} style={{ background: t.fill, color: t.color }}>
            <Icon size={15} aria-hidden="true" />
          </span>
        )}
      </div>
      <div className={s.value}>{value}</div>
      {delta && (
        <div className={clsx(s.delta, s[delta.direction || 'flat'])}>
          {delta.value}{delta.label && <span className={s.deltaLabel}> {delta.label}</span>}
        </div>
      )}
      {sub && <div className={s.sub}>{sub}</div>}
      {trend && <Sparkline data={trend} color={t.color} fill={t.fill} className={s.trend} />}
    </div>
  )
}
