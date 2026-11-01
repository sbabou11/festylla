/**
 * ui/Jar.jsx — jauge en bocal : le niveau montre ce qu'il reste
 * <Jar value={2} max={3} label="Repas" color="var(--coral)" icon={UtensilsCrossed} />
 */
import React from 'react'
import clsx from 'clsx'
import s from './Jar.module.css'

export default function Jar({ value = 0, max = 0, label, color = 'var(--brand)', icon: Icon, className }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  const empty = value <= 0
  return (
    <div
      className={clsx(s.jar, empty && s.empty, className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={`${label} : ${value} sur ${max}`}
      style={{ '--jar-color': color }}
    >
      <div className={s.glass}>
        <span className={s.lid} aria-hidden="true" />
        <span className={s.fill} style={{ height: `${pct}%` }} aria-hidden="true" />
        {Icon && <Icon size={16} className={s.icon} aria-hidden="true" />}
      </div>
      <b className={s.count}>{value}<span>/{max}</span></b>
      <span className={s.label}>{empty ? `${label} · épuisé` : label}</span>
    </div>
  )
}
