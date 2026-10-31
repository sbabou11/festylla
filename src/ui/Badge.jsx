/**
 * ui/Badge.jsx — pastille d'état, rectangulaire (charte : jamais ovale)
 * tone : neutral | brand | success | warning | danger | coral
 */
import React from 'react'
import clsx from 'clsx'
import s from './Badge.module.css'

export default function Badge({ tone = 'neutral', icon: Icon, className, children, ...rest }) {
  return (
    <span className={clsx(s.badge, s[tone], className)} {...rest}>
      {Icon && <Icon size={12} aria-hidden="true" />}
      {children}
    </span>
  )
}
