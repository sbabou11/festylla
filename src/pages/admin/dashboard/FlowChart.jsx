/**
 * FlowChart — recharges au-dessus de zéro, dépenses en dessous, une barre par heure.
 * Ligne rouge "maintenant" ; les heures à venir restent vides.
 */
import React from 'react'
import s from './Dashboard.module.css'

const W = 560, H = 190, LEFT = 40, TOP = 14, BOTTOM = 22
const MID = TOP + (H - TOP - BOTTOM) / 2
const HALF = (H - TOP - BOTTOM) / 2

// Arrondi "propre" de l'échelle : 1, 2 ou 5 × 10^n (en euros)
function niceMax(cents) {
  const euros = Math.max(cents / 100, 10)
  const p = 10 ** Math.floor(Math.log10(euros))
  const m = [1, 2, 5, 10].find(k => k * p >= euros)
  return m * p * 100
}
const short = (cents) => {
  const e = cents / 100
  return e >= 1000 ? `${(e / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}k€` : `${Math.round(e)}€`
}
const eur = (cents) => (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

export default function FlowChart({ flow }) {
  const { buckets, nowIndex, nowTime } = flow
  const max = niceMax(Math.max(...buckets.map(b => Math.max(b.credits, b.sales)), 0))
  const slot = (W - LEFT) / buckets.length
  const barW = Math.min(26, slot * 0.62)
  const y = (v) => (v / max) * HALF
  const labelEvery = buckets.length > 12 ? 2 : 1

  const nowX = nowTime != null
    ? LEFT + slot * nowIndex + slot * (new Date(nowTime).getMinutes() / 60)
    : null

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={s.chart} role="img"
      aria-label={`Flux de caisse par heure : ${eur(flow.total.credits)} rechargés, ${eur(flow.total.sales)} dépensés`}>
      {/* Axe */}
      <g className={s.axisText}>
        <text x={LEFT - 6} y={TOP + 4} textAnchor="end">+{short(max)}</text>
        <text x={LEFT - 6} y={MID + 3} textAnchor="end">0</text>
        <text x={LEFT - 6} y={H - BOTTOM + 2} textAnchor="end">−{short(max)}</text>
      </g>
      <line x1={LEFT} x2={W} y1={TOP} y2={TOP} className={s.grid} />
      <line x1={LEFT} x2={W} y1={H - BOTTOM} y2={H - BOTTOM} className={s.grid} />

      {buckets.map((b, i) => {
        const cx = LEFT + slot * i + slot / 2
        return (
          <g key={b.from} opacity={b.future ? 0.35 : 1}>
            <title>{`${b.hour}h–${(b.hour + 1) % 24}h · recharges ${eur(b.credits)} · dépenses ${eur(b.sales)}`}</title>
            <rect x={cx - slot / 2} y={TOP} width={slot} height={H - TOP - BOTTOM} fill="transparent" />
            {b.credits > 0 && <rect x={cx - barW / 2} y={MID - y(b.credits)} width={barW} height={y(b.credits)} rx="2" className={s.barIn} />}
            {b.sales > 0 && <rect x={cx - barW / 2} y={MID} width={barW} height={y(b.sales)} rx="2" className={s.barOut} />}
            {i % labelEvery === 0 && <text x={cx} y={H - 6} textAnchor="middle" className={s.axisText}>{b.hour}h</text>}
          </g>
        )
      })}
      <line x1={LEFT} x2={W} y1={MID} y2={MID} className={s.zero} />

      {nowX != null && (
        <g>
          <line x1={nowX} x2={nowX} y1={TOP - 6} y2={H - BOTTOM} className={s.now} />
          <text x={Math.min(nowX + 4, W - 70)} y={TOP - 2} className={s.nowText}>
            maintenant {new Date(nowTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </text>
        </g>
      )}
    </svg>
  )
}
