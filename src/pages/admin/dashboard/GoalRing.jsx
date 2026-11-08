/**
 * GoalRing — recettes du jour face à l'objectif, avec la projection en clair
 * useGoalParty : une seule célébration par jour et par événement, quand l'objectif est atteint
 */
import React, { useEffect, useState } from 'react'
import s from './Dashboard.module.css'

const R = 48
const C = 2 * Math.PI * R

const LS_KEY = 'yllacash-goal-party'
const PARTY_MS = 3500
const COLORS = ['var(--brand)', 'var(--coral)', 'var(--gold)', 'var(--green)']
const DOTS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * 2 * Math.PI
  return { '--x': `${Math.round(Math.cos(a) * 88)}px`, '--y': `${Math.round(Math.sin(a) * 88)}px`, background: COLORS[i % 4] }
})

export function useGoalParty(reached, dayKey) {
  const [party, setParty] = useState(false)
  useEffect(() => {
    if (!reached || !dayKey) return
    try {
      if (localStorage.getItem(LS_KEY) === dayKey) return
      localStorage.setItem(LS_KEY, dayKey)
    } catch { return }
    setParty(true)
  }, [reached, dayKey])
  useEffect(() => {
    if (!party) return
    const t = setTimeout(() => setParty(false), PARTY_MS)
    return () => clearTimeout(t)
  }, [party])
  return party
}

export default function GoalRing({ revenue, projected, goal, party = false }) {
  const done = Math.min(revenue / goal, 1)
  const proj = Math.min(Math.max(projected, revenue) / goal, 1)
  const pct  = Math.round((revenue / goal) * 100)
  return (
    <div className={s.ringWrap}>
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
    {party && DOTS.map((style, i) => <span key={i} className={s.burst} style={style} aria-hidden="true" />)}
    </div>
  )
}
