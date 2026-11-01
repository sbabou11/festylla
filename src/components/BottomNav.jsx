/**
 * components/BottomNav.jsx — barre du bas de l'espace staff sur téléphone (lot 7)
 * Les 4 pages les plus utilisées selon le rôle, puis « Plus » qui ouvre le menu complet.
 * Pose --bottom-nav sur <html> pour que les éléments fixés en bas (toasts, barre de caisse) se décalent.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import clsx from 'clsx'
import { ALL_PAGES } from './Sidebar'
import { ROLE_PAGES } from '../store/useAuthStore'
import s from './BottomNav.module.css'

// Pages mises en avant par rôle (les rôles personnalisés prennent leurs 4 premières pages)
const FAVORITES = {
  super_admin:          ['dashboard', 'transactions', 'alertes', 'benevoles'],
  admin:                ['dashboard', 'transactions', 'alertes', 'benevoles'],
  billetterie:          ['credit', 'nouveau', 'transactions', 'cloture'],
  stand:                ['debit', 'retrait', 'reservations-admin', 'transactions'],
  consultation:         ['transactions', 'reservations-admin', 'analytics'],
  directeur_artistique: ['planning', 'mon-profil'],
}

// Libellés courts : 5 cases sur 375 px
const SHORT = {
  dashboard: 'Direct', transactions: 'Flux', alertes: 'Alertes', benevoles: 'Bénévoles',
  credit: 'Recharger', nouveau: 'Nouveau', cloture: 'Clôture', debit: 'Encaisser',
  retrait: 'Retrait', 'reservations-admin': 'Réserv.', analytics: 'Analyse',
  planning: 'Planning', 'mon-profil': 'Profil', evenements: 'Événements', spectateurs: 'Public',
}

export default function BottomNav({ role, customPages, currentPage, onNavigate, onMore, canAccess, badges = {} }) {
  const fav = (FAVORITES[role] || customPages || ROLE_PAGES[role] || []).filter(p => ALL_PAGES[p] && canAccess(p)).slice(0, 4)
  const inFav = fav.includes(currentPage)
  const navRef = useRef(null)
  const [pill, setPill] = useState(null)

  // La barre existe : on réserve sa hauteur en bas de l'écran
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--bottom-nav', `${el.offsetHeight}px`)
    set()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null
    ro?.observe(el)
    return () => { ro?.disconnect(); document.documentElement.style.removeProperty('--bottom-nav') }
  }, [])

  // Indicateur glissant sous l'onglet actif (« Plus » si la page n'est pas dans la barre)
  useLayoutEffect(() => {
    const on = navRef.current?.querySelector('[aria-current="page"], [data-more="on"]')
    setPill(on ? { x: on.offsetLeft, w: on.offsetWidth } : null)
  }, [currentPage, fav.join()])

  return (
    <nav ref={navRef} className={s.nav} aria-label="Navigation principale">
      {pill && <span className={s.pill} style={{ width: pill.w, transform: `translateX(${pill.x}px)` }} aria-hidden="true" />}
      {fav.map(pid => {
        const { icon: Icon, label } = ALL_PAGES[pid]
        const on = pid === currentPage
        const badge = badges[pid]
        return (
          <button key={pid} type="button" className={clsx(s.item, on && s.on)} onClick={() => onNavigate(pid)}
            aria-current={on ? 'page' : undefined} aria-label={label}>
            <span className={s.icon}>
              <Icon size={20} aria-hidden="true" />
              {badge > 0 && <span className={s.badge}>{badge > 99 ? '99+' : badge}</span>}
            </span>
            <span className={s.label}>{SHORT[pid] || label}</span>
          </button>
        )
      })}
      <button type="button" className={clsx(s.item, !inFav && s.on)} onClick={onMore}
        data-more={!inFav ? 'on' : undefined} aria-label="Plus de pages et réglages">
        <span className={s.icon}><MoreHorizontal size={20} aria-hidden="true" /></span>
        <span className={s.label}>Plus</span>
      </button>
    </nav>
  )
}
