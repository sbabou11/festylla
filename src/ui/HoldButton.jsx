/**
 * ui/HoldButton.jsx — bouton à maintenir pour les actions irréversibles
 * <HoldButton onConfirm={annuler} tone="danger">Maintenir pour annuler</HoldButton>
 * Relâcher avant la fin ne fait rien. Clavier : maintenir Espace ou Entrée.
 * La durée ne dépend pas de « Réduire les animations » : c'est une sécurité, pas un effet.
 */
import React, { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import s from './HoldButton.module.css'

export default function HoldButton({
  onConfirm, duration = 1200, tone = 'danger', block = false, disabled = false,
  icon: Icon, doneLabel, hint = 'Maintenir appuyé pour confirmer', className, children,
}) {
  const [state, setState] = useState('idle') // idle | filling | done
  const timer = useRef(null)
  const doneTimer = useRef(null)

  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(doneTimer.current) }, [])

  const start = (e) => {
    if (disabled || state !== 'idle') return
    if (e.type === 'pointerdown' && e.button !== 0) return
    setState('filling')
    timer.current = setTimeout(async () => {
      setState('done')
      navigator.vibrate?.(30)
      try { await onConfirm?.() } finally {
        doneTimer.current = setTimeout(() => setState('idle'), 1600)
      }
    }, duration)
  }
  const stop = () => {
    if (state !== 'filling') return
    clearTimeout(timer.current)
    setState('idle')
  }

  return (
    <button
      type="button"
      className={clsx(s.hold, s[tone], block && s.block, state === 'filling' && s.filling, state === 'done' && s.done, className)}
      style={{ '--hold-ms': `${duration}ms` }}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={e => e.preventDefault()}
      onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(e) } }}
      onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') stop() }}
      title={hint}
    >
      <span className={s.fill} aria-hidden="true" />
      <span className={s.label}>
        {Icon && <Icon size={16} aria-hidden="true" />}
        {state === 'done' && doneLabel ? doneLabel : children}
      </span>
      <span className={s.sr}>{hint}</span>
    </button>
  )
}
