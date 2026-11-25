/**
 * components/CommandPalette.jsx — recherche globale (Ctrl K / ⌘ K)
 * Cherche dans les actions, les pages autorisées, les spectateurs (nom ou code QR),
 * les articles de la carte et les réservations (code #XXXX).
 * Correspondance approximative (« rmb » trouve Remboursement), lettres trouvées surlignées.
 * Ouverte sans texte : les derniers éléments utilisés, puis les actions courantes.
 * Flèches haut/bas pour choisir, Entrée pour ouvrir, Échap pour fermer.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, User, UtensilsCrossed, Bookmark, CornerDownLeft, History } from 'lucide-react'
import clsx from 'clsx'
import useAppStore from '../store/useAppStore'
import { ALL_PAGES } from './Sidebar'
import { fmt } from '../utils/helpers'
import { fuzzyMatch, highlight } from '../utils/fuzzy'
import s from './CommandPalette.module.css'
import useRetourFerme from '../hooks/useRetourFerme'

const norm = (v = '') => String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const PER_GROUP = 5
const RECENT_KEY = 'yllacash-palette-recents'

// Actions courantes : une phrase qui dit ce qu'on veut faire, menant à la bonne page
const ACTIONS = [
  ['debit', 'Encaisser une vente'],
  ['credit', 'Recharger un spectateur'],
  ['commande-sur-place', 'Encaisser une commande sur place (code borne)'],
  ['nouveau', 'Compte pour un billet (billet sans compte, ou liaison du site en panne)'],
  ['remboursement', 'Rembourser un spectateur'],
  ['lien-perdu', 'Donner un nouveau lien à un spectateur'],
  ['artistes', 'Artistes : liens personnels et articles offerts'],
  ['bracelets', 'Bracelet de secours : relier, nouveau code, bloquer'],
  ['cloture', 'Clôturer une caisse'],
  ['exposants', 'Ajouter un exposant'],
  ['menu', 'Ajouter un article à la carte'],
  ['benevoles', 'Ajouter un bénévole'],
  ['staff', 'Ajouter un membre de l\u2019équipe'],
]

const loadRecents = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] } }
const saveRecent = (r) => {
  const entry = { key: r.recentKey || r.key, title: r.title, page: r.page, search: r.search || '', meta: r.meta || '' }
  const next = [entry, ...loadRecents().filter(x => x.key !== r.key)].slice(0, 5)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch {}
}

// Garde les meilleurs résultats d'une liste selon la correspondance approximative
const rank = (items, n, text, limit = PER_GROUP) => items
  .map(it => ({ it, m: fuzzyMatch(text(it), n) }))
  .filter(x => x.m)
  .sort((a, b) => b.m.score - a.m.score)
  .slice(0, limit)

export default function CommandPalette({ open, onClose, onNavigate, canAccessPage }) {
  const { spectateurs, menu, reservations } = useAppStore()
  // Retour du téléphone (24/11/2026) : ferme cette fenêtre au lieu de quitter l'écran
  useRetourFerme(!!open, onClose)
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
    const n = q.trim()
    const out = []
    const pageIcon = (id) => ALL_PAGES[id]?.icon || CornerDownLeft
    const go = (page, search = '') => () => onNavigate(page, search)

    if (!n) {
      loadRecents().filter(r => canAccessPage(r.page)).forEach(r => out.push({
        ...r, key: `rec-${r.key}`, recentKey: r.key, group: 'Récents', icon: History, run: go(r.page, r.search),
      }))
      ACTIONS.filter(([pid]) => canAccessPage(pid)).slice(0, 5).forEach(([pid, title]) => out.push({
        key: `a-${pid}`, group: 'Actions', icon: pageIcon(pid), title, page: pid, run: go(pid),
      }))
      Object.entries(ALL_PAGES).filter(([id]) => canAccessPage(id)).slice(0, 6).forEach(([id, p]) => out.push({
        key: `p-${id}`, group: 'Pages', icon: p.icon, title: p.label, page: id, run: go(id),
      }))
      return out
    }

    rank(ACTIONS.filter(([pid]) => canAccessPage(pid)), n, ([, title]) => title, 4).forEach(({ it: [pid, title], m }) => out.push({
      key: `a-${pid}`, group: 'Actions', icon: pageIcon(pid), title, hits: m.indices, page: pid, run: go(pid),
    }))
    rank(Object.entries(ALL_PAGES).filter(([id]) => canAccessPage(id)), n, ([, p]) => p.label).forEach(({ it: [id, p], m }) => out.push({
      key: `p-${id}`, group: 'Pages', icon: p.icon, title: p.label, hits: m.indices, page: id, run: go(id),
    }))
    if (canAccessPage('spectateurs')) {
      // Un code QR tapé en entier passe en premier ; sinon correspondance sur le nom
      const exact = spectateurs.filter(sp => norm(sp.id).includes(norm(n)))
      const byName = rank(spectateurs.filter(sp => !exact.includes(sp)), n, sp => sp.nom || '')
      ;[...exact.slice(0, PER_GROUP).map(it => ({ it, m: null })), ...byName].slice(0, PER_GROUP).forEach(({ it: sp, m }) => {
        const search = `?q=${encodeURIComponent(sp.id)}`
        out.push({
          key: `s-${sp.id}`, group: 'Spectateurs', icon: User, hits: m?.indices,
          title: sp.nom || sp.id, meta: `${sp.id} · ${fmt(sp.solde || 0)}`, page: 'spectateurs', search, run: go('spectateurs', search),
        })
      })
    }
    if (canAccessPage('menu')) {
      rank(menu, n, m => m.nom).forEach(({ it: m, m: hit }) => out.push({
        key: `m-${m.id || m.nom}`, group: 'Carte', icon: UtensilsCrossed, hits: hit.indices,
        title: m.nom, meta: `${fmt(m.prix || 0)}${m.stock != null ? ` · stock ${m.stock}` : ''}`, page: 'menu', run: go('menu'),
      }))
    }
    if (canAccessPage('reservations-admin')) {
      const code = norm(n).replace(/^#/, '')
      reservations
        .filter(r => norm(r.code).includes(code) || fuzzyMatch(r.specNom || r.benevoleNom || '', n))
        .slice(0, PER_GROUP)
        .forEach(r => out.push({
          key: `r-${r.id}`, group: 'Réservations', icon: Bookmark,
          title: `#${r.code} · ${r.specNom || r.benevoleNom || '—'}`, meta: r.status, page: 'reservations-admin', run: go('reservations-admin'),
        }))
    }
    return out
  }, [q, open, spectateurs, menu, reservations, canAccessPage, onNavigate])

  useEffect(() => { setActive(0) }, [q])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const choose = (r) => { saveRecent(r); r.run(); onClose() }
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
                  <span className={s.title}>
                    {r.hits ? highlight(r.title, r.hits).map((part, k) => part.hit ? <mark key={k}>{part.text}</mark> : part.text) : r.title}
                  </span>
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
