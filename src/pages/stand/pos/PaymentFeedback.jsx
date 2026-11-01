/**
 * PaymentFeedback — retour plein écran après « Encaisser ».
 * Succès (vert) : compte à rebours d'annulation, puis fermeture automatique.
 * Erreur (brique) : message et bouton pour revenir au ticket.
 */
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Undo2, WifiOff } from 'lucide-react'
import clsx from 'clsx'
import { fmt } from '../../../utils/helpers'
import { SuccessCheck } from '../../../ui'
import { HOLD_MS } from '../../../utils/pendingSales'
import s from './pos.module.css'

export default function PaymentFeedback({ feedback, onUndo, onClose }) {
  const [left, setLeft] = useState(HOLD_MS / 1000)

  useEffect(() => {
    if (!feedback) return
    if (feedback.kind === 'error') return
    const end = feedback.at + HOLD_MS
    const tick = () => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)))
    tick()
    const t = setInterval(tick, 250)
    // Le vert reste 2,5 s puis laisse la place au client suivant (l'annulation reste
    // possible jusqu'à la fin du délai via le bandeau de la caisse)
    const close = setTimeout(onClose, 2500)
    return () => { clearInterval(t); clearTimeout(close) }
  }, [feedback])

  useEffect(() => {
    if (!feedback) return
    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [feedback, onClose])

  if (!feedback) return null
  const ok = feedback.kind !== 'error'

  return createPortal(
    <div className={clsx(s.flash, ok ? s.flashOk : s.flashErr)} role="alertdialog" aria-live="assertive"
      onClick={onClose}>
      <SuccessCheck size={120} tone="inverse" cross={!ok} play={feedback.saleId || feedback.message} className={s.flashCheck} />
      {ok ? (
        <>
          <b className={s.flashAmount}>−{fmt(feedback.total)}</b>
          <span className={s.flashText}>Paiement accepté · {feedback.nom}</span>
          {feedback.newSolde != null && <span className={s.flashSub}>Nouveau solde {fmt(feedback.newSolde)}</span>}
          {feedback.offline && <span className={s.flashOffline}><WifiOff size={14} /> Hors ligne : envoi au retour du réseau</span>}
          {left > 0 && (
            <button type="button" className={s.flashUndo} onClick={(e) => { e.stopPropagation(); onUndo() }}>
              <Undo2 size={16} /> Annuler ({left} s)
            </button>
          )}
        </>
      ) : (
        <>
          <b className={s.flashAmount}>Paiement refusé</b>
          <span className={s.flashText}>{feedback.message}</span>
          <button type="button" className={s.flashUndo} onClick={onClose}>Revenir au ticket</button>
        </>
      )}
    </div>,
    document.body,
  )
}
