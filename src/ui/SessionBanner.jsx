/**
 * ui/SessionBanner.jsx — bandeau « session expirée » (20/11/2026)
 * Affiché quand la base refuse de répondre parce que la session n'est plus valable :
 * il dit ce qui se passe et propose une seule action (réessayer ou se reconnecter).
 * <SessionBanner title="Connexion expirée" actionLabel="Me reconnecter" onAction={logout}>Texte…</SessionBanner>
 */
import React from 'react'
import clsx from 'clsx'
import Button from './Button'
import s from './SessionBanner.module.css'

export default function SessionBanner({ title, children, actionLabel, onAction, loading = false, variant = 'primary', flush = false, className }) {
  return (
    <div className={clsx(s.ban, flush && s.flush, className)} role="alert">
      <b className={s.title}>{title}</b>
      <p className={s.text}>{children}</p>
      {actionLabel && (
        <Button variant={variant} loading={loading} onClick={onAction} className={s.action}>{actionLabel}</Button>
      )}
    </div>
  )
}
