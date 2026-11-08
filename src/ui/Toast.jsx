/**
 * ui/Toast.jsx — messages courts, en bas à droite (ordinateur) ou en haut (téléphone)
 * Placer <ToastViewport /> une fois dans l'app, puis appeler depuis n'importe où :
 *   toast.success('Paiement accepté')                  // 4 s
 *   toast.warning('Stock bas')                         // 7 s
 *   toast.error('Solde insuffisant', { action: { label: 'Recharger', onClick } })   // reste affiché
 *   toast.undo('Article retiré', () => remettre())     // 5 s pour se rattraper, barre de temps
 *   toast.undo('Bénévole retiré', () => restaurer(), { onExpire: () => supprimerEnBase() })
 * Fermer un toast (croix ou balayage) confirme l'action en attente (onExpire).
 * Le temps s'arrête au survol et pendant un appui.
 */
import React, { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'
import clsx from 'clsx'
import s from './Toast.module.css'

let nextId = 1
const EXIT_MS = 150
const SWIPE_PX = 70
const DURATIONS = { success: 4000, info: 4000, warning: 7000, error: 0 } // 0 : jusqu'à fermeture

const timers = new Map() // id -> { handle, remaining, startedAt }

const useToastStore = create((set, get) => ({
  items: [],
  push: (tone, message, { duration = DURATIONS[tone], action, onExpire } = {}) => {
    const id = nextId++
    // Au-delà de 3 toasts, le plus ancien part : son action en attente est confirmée
    const live = get().items.filter(t => !t.leaving)
    live.slice(0, -2).forEach(t => { t.onExpire?.(); get().remove(t.id) })
    set({ items: [...get().items, { id, tone, message, action, duration, onExpire }] })
    if (duration) { timers.set(id, { remaining: duration }); get().resume(id) }
    return id
  },
  pause: (id) => {
    const t = timers.get(id)
    if (!t?.handle) return
    clearTimeout(t.handle)
    t.handle = null
    t.remaining -= Date.now() - t.startedAt
  },
  resume: (id) => {
    const t = timers.get(id)
    if (!t || t.handle) return
    t.startedAt = Date.now()
    t.handle = setTimeout(() => get().confirm(id), Math.max(0, t.remaining))
  },
  // Le délai est écoulé ou le toast est écarté : l'action en attente est confirmée
  confirm: (id) => {
    const t = get().items.find(x => x.id === id)
    if (t && !t.leaving) t.onExpire?.()
    get().dismiss(id)
  },
  dismiss: (id) => {
    const t = timers.get(id)
    if (t?.handle) clearTimeout(t.handle)
    timers.delete(id)
    set({ items: get().items.map(x => x.id === id ? { ...x, leaving: true } : x) })
    setTimeout(() => get().remove(id), EXIT_MS)
  },
  remove: (id) => {
    const t = timers.get(id)
    if (t?.handle) clearTimeout(t.handle)
    timers.delete(id)
    set({ items: get().items.filter(x => x.id !== id) })
  },
}))

export const toast = {
  success: (msg, opts) => useToastStore.getState().push('success', msg, opts),
  error:   (msg, opts) => useToastStore.getState().push('error', msg, opts),
  warning: (msg, opts) => useToastStore.getState().push('warning', msg, opts),
  info:    (msg, opts) => useToastStore.getState().push('info', msg, opts),
  // Remplace « Êtes-vous sûr ? » quand l'action se rattrape : on agit tout de suite, on propose d'annuler
  // onExpire : appelé si personne n'a annulé (pour n'écrire en base qu'à la fin du délai)
  undo:    (msg, onUndo, { duration = 5000, label = 'Annuler', onExpire } = {}) =>
    useToastStore.getState().push('info', msg, { duration, onExpire, action: { label, onClick: onUndo } }),
  dismiss: (id) => useToastStore.getState().dismiss(id),
}

const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info }

function ToastItem({ t }) {
  const { pause, resume, confirm, dismiss } = useToastStore.getState()
  const Icon = ICONS[t.tone]
  const [dx, setDx] = useState(0)
  const drag = useRef(null)

  const onPointerDown = (e) => {
    if (e.target.closest('button')) return
    drag.current = e.clientX
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pause(t.id)
  }
  const onPointerMove = (e) => { if (drag.current != null) setDx(e.clientX - drag.current) }
  const onPointerUp = () => {
    if (drag.current == null) return
    drag.current = null
    if (Math.abs(dx) > SWIPE_PX) confirm(t.id)
    else { setDx(0); resume(t.id) }
  }

  return (
    <div
      className={clsx(s.toast, s[t.tone], t.leaving && s.leaving, dx !== 0 && s.dragging)}
      style={dx ? { transform: `translateX(${dx}px)`, opacity: Math.max(.3, 1 - Math.abs(dx) / 240) } : undefined}
      onMouseEnter={() => pause(t.id)}
      onMouseLeave={() => { if (drag.current == null) resume(t.id) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <Icon size={18} aria-hidden="true" className={s.icon} />
      <span className={s.msg}>{t.message}</span>
      {t.action && (
        <button type="button" className={s.action} onClick={() => { t.action.onClick(); dismiss(t.id) }}>
          {t.action.label}
        </button>
      )}
      <button type="button" className={s.close} onClick={() => confirm(t.id)} aria-label="Fermer">
        <X size={14} />
      </button>
      {t.action && t.duration > 0 && <span className={s.timer} style={{ animationDuration: `${t.duration}ms` }} aria-hidden="true" />}
    </div>
  )
}

export function ToastViewport() {
  const items = useToastStore(st => st.items)
  return createPortal(
    <div className={s.viewport} role="status" aria-live="polite">
      {items.map(t => <ToastItem key={t.id} t={t} />)}
    </div>,
    document.body,
  )
}
