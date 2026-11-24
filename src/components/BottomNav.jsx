/**
 * components/BottomNav.jsx — barre du bas de l'espace staff sur téléphone (lot 7)
 * Les 4 pages les plus utilisées selon le rôle, puis « Plus » qui ouvre le menu complet.
 * Pose --bottom-nav sur <html> pour que les éléments fixés en bas (toasts, barre de caisse) se décalent.
 * Nouveau style (23/11/2026) : barre flottante `.nv-tabbar` (styles/nouveau.css) ; n'est rendue que sur téléphone.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import clsx from 'clsx'
import { ALL_PAGES } from './Sidebar'
import { ROLE_PAGES } from '../store/useAuthStore'
import s from './BottomNav.module.css'

// Pages mises en avant par rôle (les rôles personnalisés prennent leurs 4 premières pages)
// 23/11/2026 (maquette validée) : « Accueil » en premier pour tous les rôles ; la page qui sort de la
// barre reste dans « Plus » (Mon profil, Clôture…)
const FAVORITES = {
  super_admin:          ['accueil', 'debit', 'transactions', 'alertes'],
  admin:                ['accueil', 'debit', 'transactions', 'alertes'],
  billetterie:          ['accueil', 'credit', 'commande-sur-place', 'debit'],   // « Encaisser » : seulement pendant une panne de borne (écran 7)
  stand:                ['accueil', 'debit', 'reservations-admin', 'transactions'],
  consultation:         ['accueil', 'transactions', 'reservations-admin', 'analytics'],
  directeur_artistique: ['accueil', 'planning', 'gestion-artistes'],   // planning masqué si relié à Event Manager ; plus de Cachets (23/11/2026)
  controle_entree:      ['entree'],   // 23/11/2026 : seulement l'écran « Entrée »
}

// Libellés courts : 5 cases sur 375 px
const SHORT = {
  dashboard: 'Direct', accueil: 'Accueil', transactions: 'Flux', alertes: 'Alertes', benevoles: 'Bénévoles',
  credit: 'Recharger', 'commande-sur-place': 'Sur place', nouveau: 'Compte', entree: 'Entrée', 'lien-perdu': 'Lien perdu', bracelets: 'Bracelets', cloture: 'Clôture', debit: 'Encaisser',
  retrait: 'Retrait', 'reservations-admin': 'Réserv.', analytics: 'Analyse',
  planning: 'Planning', 'gestion-artistes': 'Artistes', 'mon-profil': 'Profil', evenements: 'Événements', spectateurs: 'Public',
}

export default function BottomNav({ role, customPages, currentPage, onNavigate, onMore, canAccess, badges = {} }) {
  // Rôles personnalisés : « Accueil » d'abord s'il fait partie de leurs pages, puis leurs premières pages
  const base = FAVORITES[role] || (customPages ? ['accueil', ...customPages.filter(p => p !== 'accueil')] : ROLE_PAGES[role]) || []
  const fav = base.filter(p => ALL_PAGES[p] && canAccess(p)).slice(0, 4)
  const inFav = fav.includes(currentPage)
  const navRef = useRef(null)
  const [pill, setPill] = useState(null)

  // La barre existe : on réserve sa place en bas de l'écran.
  // Nouveau style (23/11/2026) : la barre flotte (marge et zone sûre comprises), donc --bottom-nav
  // vaut la distance entre le haut de la barre et le bas de l'écran, pas seulement sa hauteur.
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    const set = () => {
      const top = el.getBoundingClientRect().top
      const h = top > 0 ? Math.round(window.innerHeight - top) : el.offsetHeight
      document.documentElement.style.setProperty('--bottom-nav', `${h}px`)
    }
    set()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null
    ro?.observe(el)
    window.addEventListener('resize', set, { passive: true })
    return () => { ro?.disconnect(); window.removeEventListener('resize', set); document.documentElement.style.removeProperty('--bottom-nav') }
  }, [])

  // Pastille glissante derrière l'onglet actif (« Plus » si la page n'est pas dans la barre).
  // `.nv-tab-ind` part de left: 6px (marge intérieure de la barre) : on retire ces 6 px.
  useLayoutEffect(() => {
    const on = navRef.current?.querySelector('[aria-current="page"], [data-more="on"]')
    setPill(on ? { x: on.offsetLeft - 6, w: on.offsetWidth } : null)
  }, [currentPage, fav.join()])

  return (
    <nav ref={navRef} className={clsx('nv-tabbar', s.nav)} aria-label="Navigation principale">
      {pill && <span className="nv-tab-ind" style={{ width: pill.w, transform: `translateX(${pill.x}px)` }} aria-hidden="true" />}
      {fav.map(pid => {
        const { icon: Icon, label } = ALL_PAGES[pid]
        const on = pid === currentPage
        const badge = badges[pid]
        return (
          <button key={pid} type="button" className={clsx('nv-press', s.item)} onClick={() => onNavigate(pid)}
            aria-current={on ? 'page' : undefined} aria-label={badge > 0 ? `${label}, ${badge} à traiter` : label}>
            <Icon size={22} aria-hidden="true" />
            {badge > 0 && <span className="nv-tab-badge" aria-hidden="true">{badge > 99 ? '99+' : badge}</span>}
            <span className={s.label}>{SHORT[pid] || label}</span>
          </button>
        )
      })}
      <button type="button" className={clsx('nv-press', s.item, !inFav && s.on)} onClick={onMore}
        data-more={!inFav ? 'on' : undefined} aria-label="Plus de pages et réglages">
        <MoreHorizontal size={22} aria-hidden="true" />
        <span className={s.label}>Plus</span>
      </button>
    </nav>
  )
}
