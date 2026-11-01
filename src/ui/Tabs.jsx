/**
 * ui/Tabs.jsx — sélecteur segmenté (onglets ou filtres)
 * <Tabs value={v} onChange={setV} items={[{ value:'jour', label:'Jour' }, …]} />
 * Flèches gauche/droite pour changer d'onglet au clavier.
 * Un indicateur glisse sous l'onglet actif (transformations seulement).
 */
import React, { useLayoutEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import s from './Tabs.module.css'

export default function Tabs({ items = [], value, onChange, size = 'md', label, className }) {
  const ref = useRef(null)
  const [pill, setPill] = useState(null)

  // Mesure l'onglet actif ; suit aussi les changements de taille (police chargée, compteur…)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const place = () => {
      const on = root.querySelector('[aria-selected="true"]')
      setPill(on ? { x: on.offsetLeft, w: on.offsetWidth } : null)
    }
    place()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(place)
    ro.observe(root)
    root.querySelectorAll('[role="tab"]').forEach(el => ro.observe(el))
    return () => ro.disconnect()
  }, [value, items.length])

  const onKeyDown = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const i = items.findIndex(it => it.value === value)
    const next = items[(i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length]
    onChange?.(next.value)
    e.currentTarget.querySelector(`[data-value="${CSS.escape(String(next.value))}"]`)?.focus()
  }
  return (
    <div ref={ref} role="tablist" aria-label={label} className={clsx(s.tabs, s[size], className)} onKeyDown={onKeyDown}>
      {pill && <span className={s.pill} style={{ width: pill.w, transform: `translateX(${pill.x}px)` }} aria-hidden="true" />}
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
