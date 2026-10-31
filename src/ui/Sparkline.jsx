/**
 * ui/Sparkline.jsx — mini courbe de tendance (aire + trait + point final)
 * <Sparkline data={[3,5,4,8]} color="var(--coral)" fill="var(--coral-light)" />
 */
import React from 'react'

export default function Sparkline({ data = [], color = 'var(--brand)', fill = 'var(--brand-light)', height = 28, className }) {
  if (data.length < 2) return null
  const w = 100
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const pad = 3
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    pad + (1 - (v - min) / span) * (height - pad * 2),
  ])
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" width="100%" height={height} className={className} aria-hidden="true">
      <path d={`${line} L${w} ${height} L0 ${height}Z`} fill={fill} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="2.5" fill={color} />
    </svg>
  )
}
