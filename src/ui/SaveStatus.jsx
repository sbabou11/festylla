/**
 * ui/SaveStatus.jsx — état de l'enregistrement automatique (voir hooks/useAutosave)
 * <SaveStatus status={status} savedAt={savedAt} onRetry={retry} />
 */
import React from 'react'
import { Check, WifiOff, AlertTriangle, Pencil } from 'lucide-react'
import clsx from 'clsx'
import s from './SaveStatus.module.css'

const hm = (d) => d?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

export default function SaveStatus({ status, savedAt, onRetry, className }) {
  if (status === 'idle') return null
  return (
    <span className={clsx(s.chip, s[status], className)} role="status" aria-live="polite">
      {status === 'dirty'   && <><Pencil size={12} aria-hidden="true" /> Modification en cours…</>}
      {status === 'saving'  && <><span className={s.spin} aria-hidden="true" /> Enregistrement…</>}
      {status === 'saved'   && <><Check size={12} strokeWidth={3} aria-hidden="true" /> Enregistré à {hm(savedAt)}</>}
      {status === 'offline' && <><WifiOff size={12} aria-hidden="true" /> Hors ligne, enregistré au retour du réseau</>}
      {status === 'error'   && <><AlertTriangle size={12} aria-hidden="true" /> Non enregistré
        {onRetry && <button type="button" className={s.retry} onClick={onRetry}>Réessayer</button>}</>}
    </span>
  )
}
