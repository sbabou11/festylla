/**
 * ui/Tabs.jsx — sélecteur segmenté (onglets ou filtres)
 * <Tabs value={v} onChange={setV} items={[{ value:'jour', label:'Jour' }, …]} />
 * Flèches gauche/droite pour changer d'onglet au clavier.
 */
import React from 'react'
import clsx from 'clsx'
import s from './Tabs.module.css'

export default function Tabs({ items = [], value, onChange, size = 'md', label, className }) {
  const onKeyDown = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const i = items.findIndex(it => it.value === value)
    const next = items[(i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length]
    onChange?.(next.value)
    e.currentTarget.querySelector(`[data-value="${CSS.escape(String(next.value))}"]`)?.focus()
  }
  return (
    <div role="tablist" aria-label={label} className={clsx(s.tabs, s[size], className)} onKeyDown={onKeyDown}>
      {items.map(it => {
        const on = it.value === value
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            data-value={it.value}
            className={clsx(s.tab, on && s.on)}
            onClick={() => onChange?.(it.value)}
          >
            {it.label}
            {it.count != null && <span className={s.count}>{it.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
