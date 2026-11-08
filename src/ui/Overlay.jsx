/**
 * ui/Overlay.jsx — Dialog (fenêtre centrée) et Sheet (panneau du bas sur mobile, latéral sinon)
 * Rendus dans un portail, fermeture par Échap ou clic sur le fond, focus gardé dans le panneau.
 * À la fermeture, le contenu reste affiché le temps de l'animation de sortie.
 */
import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import clsx from 'clsx'
import s from './Overlay.module.css'

const EXIT_MS = 150
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Fenêtres ouvertes : seule la dernière réagit à Échap et à Tab
const openStack = []

function Overlay({ open, onClose, title, footer, kind, side = 'right', className, children }) {
  const panelRef = useRef(null)
  // onClose dans une ref : un parent qui passe une fonction inline ne doit pas
  // relancer l'effet (et voler le focus d'un champ) à chaque rendu
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // Dernier contenu ouvert : les parents vident souvent leur état en fermant
  const shown = useRef(null)
  if (open) shown.current = { title, footer, children }

  const [leaving, setLeaving] = useState(false)
  const wasOpen = useRef(open)
  useEffect(() => {
    if (open || !wasOpen.current) { wasOpen.current = open; setLeaving(false); return }
    wasOpen.current = false
    setLeaving(true)
    const t = setTimeout(() => setLeaving(false), EXIT_MS)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    const me = {}
    openStack.push(me)
    const onKey = (e) => {
      if (openStack[openStack.length - 1] !== me) return
      if (e.key === 'Escape') { closeRef.current?.(); return }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null)
      if (!items.length) { e.preventDefault(); return }
      const first = items[0], last = items[items.length - 1], active = document.activeElement
      if (e.shiftKey && (active === first || active === panel || !panel.contains(active))) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (active === last || !panel.contains(active))) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => {
      openStack.splice(openStack.indexOf(me), 1)
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [open])

  if (!open && !leaving) return null
  const content = open ? { title, footer, children } : shown.current

  return createPortal(
    <div className={clsx(s.backdrop, s[kind], !open && s.closing)} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof content.title === 'string' ? content.title : undefined}
        tabIndex={-1}
        className={clsx(s.panel, s[`${kind}Panel`], kind === 'sheet' && s[side], className)}
      >
        {content.title && (
          <header className={s.head}>
            <h2 className={s.title}>{content.title}</h2>
            <button type="button" className={s.close} onClick={onClose} aria-label="Fermer">
              <X size={18} />
            </button>
          </header>
        )}
        <div className={s.body}>{content.children}</div>
        {content.footer && <footer className={s.foot}>{content.footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

export function Dialog(props) { return <Overlay {...props} kind="dialog" /> }
export function Sheet(props)  { return <Overlay {...props} kind="sheet" /> }
