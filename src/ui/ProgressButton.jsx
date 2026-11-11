/**
 * ui/ProgressButton.jsx — bouton qui devient sa propre barre de progression
 * <ProgressButton onRun={async (report) => { …; report(0.5); … }} doneLabel="Rapport prêt">Générer le rapport</ProgressButton>
 * report(x) avec x entre 0 et 1 : barre et pourcentage. Sans appel à report : bande animée (durée inconnue).
 * Le reste de la page reste utilisable pendant le travail. En cas d'erreur, onRun doit lever : le bouton
 * revient à son état initial (l'appelant affiche le message).
 */
import React, { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import clsx from 'clsx'
import s from './ProgressButton.module.css'

export default function ProgressButton({
  onRun, children, doneLabel = 'Terminé', runningLabel, icon: Icon, variant = 'primary',
  block = false, disabled = false, doneMs = 2500, className,
}) {
  const [state, setState] = useState('idle') // idle | running | done
  const [progress, setProgress] = useState(null)
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  const run = async () => {
    if (state !== 'idle' || disabled) return
    setState('running'); setProgress(null)
    try {
      await onRun?.((p) => { if (mounted.current) setProgress(Math.max(0, Math.min(1, p))) })
      if (!mounted.current) return
      setProgress(1); setState('done')
      setTimeout(() => { if (mounted.current) setState('idle') }, doneMs)
    } catch {
      if (mounted.current) setState('idle')
    }
  }

  const pct = progress == null ? null : Math.round(progress * 100)
  return (
    <button
      type="button"
      className={clsx(s.btn, s[variant], block && s.block, s[state], className)}
      onClick={run}
      disabled={disabled}
      aria-busy={state === 'running' || undefined}
      aria-live="polite"
    >
      {state === 'running' && (pct == null
        ? <span className={s.stripes} aria-hidden="true" />
        : <span className={s.fill} style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />)}
      <span className={s.label}>
        {state === 'done'
          ? <><Check size={16} aria-hidden="true" /> {doneLabel}</>
          : state === 'running'
            ? <>{runningLabel || children}{pct != null && <span className={s.pct}>{pct} %</span>}</>
            : <>{Icon && <Icon size={16} aria-hidden="true" />}{children}</>}
      </span>
    </button>
  )
}
