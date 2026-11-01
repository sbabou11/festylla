/**
 * ui/AnimatedNumber.jsx — montant qui défile jusqu'à sa nouvelle valeur
 * <AnimatedNumber value={soldeCentimes} format={fmt} />
 * Le premier rendu affiche la valeur directement ; seuls les changements défilent.
 * Respecte « Réduire les animations ». Les lecteurs d'écran ne lisent que la valeur finale.
 */
import React, { useEffect, useRef, useState } from 'react'

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const SR = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }

export default function AnimatedNumber({ value = 0, format = (v) => Math.round(v).toLocaleString('fr-FR'), duration = 650, className }) {
  const target = Number(value) || 0
  const [shown, setShown] = useState(target)
  const current = useRef(target)

  useEffect(() => {
    const start = current.current
    if (start === target || reduced()) { current.current = target; setShown(target); return }
    const t0 = performance.now()
    let raf
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration)
      const v = start + (target - start) * (1 - Math.pow(1 - p, 3))
      current.current = p < 1 ? v : target
      setShown(current.current)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return (
    <span className={className} style={{ position: 'relative', fontVariantNumeric: 'tabular-nums' }}>
      <span aria-hidden="true">{format(Math.round(shown))}</span>
      <span style={SR}>{format(target)}</span>
    </span>
  )
}
