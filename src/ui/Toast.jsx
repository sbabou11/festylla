/**
 * ui/Toast.jsx — messages courts empilés en bas de l'écran
 * Placer <ToastViewport /> une fois dans l'app, puis appeler depuis n'importe où :
 *   toast.success('Paiement accepté')
 *   toast.error('Solde insuffisant', { action: { label: 'Recharger', onClick } })
 *   toast.undo('Article retiré', () => remettre())   // 5 s pour se rattraper, barre de temps
 *   toast.undo('Bénévole retiré', () => restaurer(), { onExpire: () => supprimerEnBase() })
 * Fermer le toast avec la croix confirme l'action (onExpire est appelé tout de suite).
 */
import React from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import clsx from 'clsx'
import s from './Toast.module.css'

let nextId = 1

const useToastStore = create((set, get) => ({
  items: [],
  push: (tone, message, { duration = 4000, action, onExpire } = {}) => {
    const id = nextId++
    const items = get().items
    // Au-delà de 3 toasts, le plus ancien part : son action en attente est confirmée
    items.slice(0, -2).forEach(t => t.onExpire?.())
    set({ items: [...items.slice(-2), { id, tone, message, action, duration, onExpire }] })
    if (duration) setTimeout(() => {
      // Toujours affiché à la fin du délai (ni « Annuler » ni fermeture) : l'action est confirmée
      if (get().items.some(t => t.id === id)) onExpire?.()
      get().dismiss(id)
    }, duration)
    return id
  },
  dismiss: (id) => set({ items: get().items.filter(t => t.id !== id) }),
}))

export const toast = {
  success: (msg, opts) => useToastStore.getState().push('success', msg, opts),
  error:   (msg, opts) => useToastStore.getState().push('error', msg, opts),
  info:    (msg, opts) => useToastStore.getState().push('info', msg, opts),
  // Remplace « Êtes-vous sûr ? » quand l'action se rattrape : on agit tout de suite, on propose d'annuler
  // onExpire : appelé si personne n'a annulé (pour n'écrire en base qu'à la fin du délai)
  undo:    (msg, onUndo, { duration = 5000, label = 'Annuler', onExpire } = {}) =>
    useToastStore.getState().push('info', msg, { duration, onExpire, action: { label, onClick: onUndo } }),
  dismiss: (id) => useToastStore.getState().dismiss(id),
}

const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info }

export function ToastViewport() {
  const { items, dismiss } = useToastStore()
  return createPortal(
    <div className={s.viewport} role="status" aria-live="polite">
      {items.map(t => {
        const Icon = ICONS[t.tone]
        return (
          <div key={t.id} className={clsx(s.toast, s[t.tone])}>
            <Icon size={18} aria-hidden="true" className={s.icon} />
            <span className={s.msg}>{t.message}</span>
            {t.action && (
              <button type="button" className={s.action} onClick={() => { t.action.onClick(); dismiss(t.id) }}>
                {t.action.label}
              </button>
            )}
            <button type="button" className={s.close} onClick={() => { t.onExpire?.(); dismiss(t.id) }} aria-label="Fermer">
              <X size={14} />
            </button>
            {t.action && t.duration > 0 && <span className={s.timer} style={{ animationDuration: `${t.duration}ms` }} aria-hidden="true" />}
          </div>
        )
      })}
    </div>,
    document.body,
  )
}
