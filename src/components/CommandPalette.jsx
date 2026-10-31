/**
 * components/CommandPalette.jsx — recherche globale (Ctrl K / ⌘ K)
 * Cherche dans les pages autorisées, les spectateurs (nom ou code QR),
 * les articles de la carte et les réservations (code #XXXX).
 * Flèches haut/bas pour choisir, Entrée pour ouvrir, Échap pour fermer.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, User, UtensilsCrossed, Bookmark, CornerDownLeft } from 'lucide-react'
import clsx from 'clsx'
import useAppStore from '../store/useAppStore'
import { ALL_PAGES } from './Sidebar'
import { fmt } from '../utils/helpers'
import s from './CommandPalette.module.css'

const norm = (v = '') => String(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const PER_GROUP = 5

export default function CommandPalette({ open, onClose, onNavigate, canAccessPage }) {
  const { spectateurs, menu, reservations } = useAppStore()
  const [q, setQ]           = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef  = useRef(null)

  useEffect(() => {
    if (!open) return
    setQ('')
    setActive(0)
    const prev = document.activeElement
    setTimeout(() => inputRef.current?.focus(), 0)
    return () => prev?.focus?.()
  }, [open])

  const results = useMemo(() => {
    const n = norm(q.trim())
    const out = []
    const pages = Object.entries(ALL_PAGES)
      .filter(([id]) => canAccessPage(id))
      .filter(([, p]) => !n || norm(p.label).includes(n))
      .slice(0, n ? PER_GROUP : 6)
      .map(([id, p]) => ({ key: `p-${id}`, group: 'Pages', icon: p.icon, title: p.label, run: () => onNavigate(id) }))
    out.push(...pages)
    if (!n) return out

    if (canAccessPage('spectateurs')) {
      spectateurs
        .filter(sp => norm(sp.nom).includes(n) || norm(sp.id).includes(n))
        .slice(0, PER_GROUP)
        .forEach(sp => out.push({
          key: `s-${sp.id}`, group: 'Spectateurs', icon: User,
          title: sp.nom || sp.id, meta: `${sp.id} · ${fmt(sp.solde || 0)}`,
          run: () => onNavigate('spectateurs', `?q=${encodeURIComponent(sp.id)}`),
        }))
    }
    if (canAccessPage('menu')) {
      menu
        .filter(m => norm(m.nom).includes(n))
        .slice(0, PER_GROUP)
        .forEach(m => out.push({
          key: `m-${m.id || m.nom}`, group: 'Carte', icon: UtensilsCrossed,
          title: m.nom, meta: `${fmt(m.prix || 0)}${m.stock != null ? ` · stock ${m.stock}` : ''}`,
          run: () => onNavigate('menu'),
        }))
    }
    if (canAccessPage('reservations-admin')) {
      const code = n.replace(/^#/, '')
      reservations
        .filter(r => norm(r.code).includes(code) || norm(r.specNom || r.benevoleNom).includes(n))
        .slice(0, PER_GROUP)
        .forEach(r => out.push({
          key: `r-${r.id}`, group: 'Réservations', icon: Bookmark,
          title: `#${r.code} · ${r.specNom || r.benevoleNom || '—'}`, meta: r.status,
          run: () => onNavigate('reservations-admin'),
        }))
    }
    return out
  }, [q, spectateurs, menu, reservations, canAccessPage, onNavigate])

  useEffect(() => { setActive(0) }, [q])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const choose = (r) => { r.run(); onClose() }
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); choose(results[active]) }
  }

  let lastGroup = null
  return createPortal(
    <div className={s.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={s.panel} role="dialog" aria-modal="true" aria-label="Recherche" onKeyDown={onKeyDown}>
        <div className={s.field}>
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            className={s.input}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Chercher un spectateur, un article, une réservation, une page…"
            aria-label="Rechercher"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={results[active] ? `cmdk-${active}` : undefined}
          />
          <kbd className={s.kbd}>Échap</kbd>
        </div>
        <ul className={s.list} id="cmdk-list" role="listbox" ref={listRef}>
          {results.length === 0 && <li className={s.empty}>Aucun résultat pour « {q} »</li>}
          {results.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null
            lastGroup = r.group
            const Icon = r.icon
            return (
              <React.Fragment key={r.key}>
                {header && <li className={s.group} role="presentation">{header}</li>}
                <li
                  id={`cmdk-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  className={clsx(s.item, i === active && s.on)}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(r)}
                >
                  <span className={s.icon}><Icon size={16} aria-hidden="true" /></span>
                  <span className={s.title}>{r.title}</span>
                  {r.meta && <span className={s.meta}>{r.meta}</span>}
                  {i === active && <CornerDownLeft size={14} className={s.enter} aria-hidden="true" />}
                </li>
              </React.Fragment>
            )
          })}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
