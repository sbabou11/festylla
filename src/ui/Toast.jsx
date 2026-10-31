/**
 * ui/Toast.jsx — messages courts empilés en bas de l'écran
 * Placer <ToastViewport /> une fois dans l'app, puis appeler depuis n'importe où :
 *   toast.success('Paiement accepté')
 *   toast.error('Solde insuffisant', { action: { label: 'Recharger', onClick } })
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
  push: (tone, message, { duration = 4000, action } = {}) => {
    const id = nextId++
    set({ items: [...get().items.slice(-2), { id, tone, message, action }] })
    if (duration) setTimeout(() => get().dismiss(id), duration)
    return id
  },
  dismiss: (id) => set({ items: get().items.filter(t => t.id !== id) }),
}))

export const toast = {
  success: (msg, opts) => useToastStore.getState().push('success', msg, opts),
  error:   (msg, opts) => useToastStore.getState().push('error', msg, opts),
  info:    (msg, opts) => useToastStore.getState().push('info', msg, opts),
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
            <button type="button" className={s.close} onClick={() => dismiss(t.id)} aria-label="Fermer">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>,
    document.body,
  )
}
