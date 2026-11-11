/**
 * components/expo/ConfirmDialog.jsx — confirmation des actions exposants (remplace confirm())
 * <ConfirmDialog open={!!x} title="Supprimer ?" onClose={…} onConfirm={async () => …} hold confirmLabel="Maintenir pour supprimer">
 *   Texte d'explication
 * </ConfirmDialog>
 * hold : action irréversible, confirmée en maintenant le bouton (HoldButton).
 * Sans hold : bouton classique. onConfirm doit lever en cas d'échec (la fenêtre reste ouverte).
 */
import React, { useState } from 'react'
import { Button, Dialog, HoldButton } from '../../ui'
import s from './expo.module.css'

export default function ConfirmDialog({
  open, title, onClose, onConfirm, hold = false, confirmLabel = 'Confirmer',
  tone = 'danger', icon, children,
}) {
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    try { await onConfirm?.(); onClose?.() }
    catch { /* l'appelant a déjà affiché l'erreur */ }
    finally { setBusy(false) }
  }

  return (
    <Dialog
      open={open}
      title={title}
      onClose={() => { if (!busy) onClose?.() }}
      footer={
        <div className={s.dialogActions}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Annuler</Button>
          {hold
            ? <HoldButton tone={tone} icon={icon} onConfirm={run} disabled={busy}>{confirmLabel}</HoldButton>
            : <Button variant={tone === 'danger' ? 'danger' : 'primary'} icon={icon} loading={busy} onClick={run}>{confirmLabel}</Button>}
        </div>
      }
    >
      <div className={s.confirmText}>{children}</div>
    </Dialog>
  )
}
