/**
 * pages/auth/AuthShell.jsx — fond commun de la connexion et du choix d'espace
 * Dégradé signature, halos flous et carte en verre dépoli (seul endroit avec la barre d'onglets mobile).
 */
import React from 'react'
import ThemeToggle from '../../components/ThemeToggle'
import { useTheme } from '../../hooks/useTheme'
import { APP_FULL_LABEL } from '../../utils/buildInfo'
import s from './auth.module.css'

export default function AuthShell({ subtitle = 'Votre événement, sans cash.', children }) {
  useTheme()
  return (
    <div className={s.page}>
      <span className={`${s.halo} ${s.haloA}`} aria-hidden="true" />
      <span className={`${s.halo} ${s.haloB}`} aria-hidden="true" />
      <div className={s.toggle}><ThemeToggle variant="dark" /></div>

      <main className={s.column}>
        <div className={s.brand}>
          <div className={s.logo}>
            <img src="/logo.png" alt="" onError={e => { e.currentTarget.style.display = 'none' }} />
            <span aria-hidden="true">Y</span>
          </div>
          <h1 className={s.name}>YllaCash</h1>
          {subtitle && <p className={s.tagline}>{subtitle}</p>}
        </div>

        {children}

        <footer className={s.footer}>
          <b>{APP_FULL_LABEL}</b>
          <span>Développée par <strong>Maison Ylla</strong></span>
        </footer>
      </main>
    </div>
  )
}
