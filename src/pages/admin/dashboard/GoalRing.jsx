/**
 * GoalRing — recettes du jour face à l'objectif, avec la projection en clair
 */
import React from 'react'
import s from './Dashboard.module.css'

const R = 48
const C = 2 * Math.PI * R

export default function GoalRing({ revenue, projected, goal }) {
  const done = Math.min(revenue / goal, 1)
  const proj = Math.min(Math.max(projected, revenue) / goal, 1)
  const pct  = Math.round((revenue / goal) * 100)
  return (
    <svg viewBox="0 0 120 120" className={s.ring} role="img" aria-label={`${pct} % de l'objectif du jour`}>
      <circle cx="60" cy="60" r={R} className={s.ringTrack} />
      {proj > done && (
        <circle cx="60" cy="60" r={R} className={s.ringProj}
          strokeDasharray={`0 ${done * C} ${(proj - done) * C} ${C}`} transform="rotate(-90 60 60)" />
      )}
      <circle cx="60" cy="60" r={R} className={s.ringDone}
        strokeDasharray={`${done * C} ${C}`} transform="rotate(-90 60 60)" />
      <text x="60" y="60" textAnchor="middle" className={s.ringPct}>{pct} %</text>
      <text x="60" y="77" textAnchor="middle" className={s.ringSub}>de l'objectif</text>
    </svg>
  )
}
