/**
 * ui/Overlay.jsx — Dialog (fenêtre centrée) et Sheet (panneau du bas sur mobile, latéral sinon)
 * Rendus dans un portail, fermeture par Échap ou clic sur le fond, focus placé dans le panneau.
 */
import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import clsx from 'clsx'
import s from './Overlay.module.css'

function Overlay({ open, onClose, title, footer, kind, side = 'right', className, children }) {
  const panelRef = useRef(null)
  // onClose dans une ref : un parent qui passe une fonction inline ne doit pas
  // relancer l'effet (et voler le focus d'un champ) à chaque rendu
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current?.() }
    document.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className={clsx(s.backdrop, s[kind])} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={clsx(s.panel, s[`${kind}Panel`], kind === 'sheet' && s[side], className)}
      >
        {title && (
          <header className={s.head}>
            <h2 className={s.title}>{title}</h2>
            <button type="button" className={s.close} onClick={onClose} aria-label="Fermer">
              <X size={18} />
            </button>
          </header>
        )}
        <div className={s.body}>{children}</div>
        {footer && <footer className={s.foot}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

export function Dialog(props) { return <Overlay {...props} kind="dialog" /> }
export function Sheet(props)  { return <Overlay {...props} kind="sheet" /> }
