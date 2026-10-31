/**
 * ui/Card.jsx — surface bordée + en-tête optionnel
 * <Card title="Réservations" subtitle="4 en attente" actions={<Button…/>}>…</Card>
 * flush : pas de padding interne (listes, tableaux)
 */
import React from 'react'
import clsx from 'clsx'
import s from './Card.module.css'

export default function Card({ title, subtitle, actions, flush = false, tone, className, children, ...rest }) {
  return (
    <section className={clsx(s.card, tone && s[tone], className)} {...rest}>
      {(title || actions) && (
        <header className={s.head}>
          <div className={s.titles}>
            {title && <h3 className={s.title}>{title}</h3>}
            {subtitle && <p className={s.subtitle}>{subtitle}</p>}
          </div>
          {actions && <div className={s.actions}>{actions}</div>}
        </header>
      )}
      <div className={clsx(!flush && s.body)}>{children}</div>
    </section>
  )
}
