/**
 * ui/Empty.jsx — état vide : dit ce qui apparaîtra ici et comment commencer
 */
import React from 'react'
import clsx from 'clsx'
import s from './Empty.module.css'

export default function Empty({ icon: Icon, title, children, action, className }) {
  return (
    <div className={clsx(s.empty, className)}>
      {Icon && <span className={s.icon}><Icon size={20} aria-hidden="true" /></span>}
      {title && <p className={s.title}>{title}</p>}
      {children && <p className={s.text}>{children}</p>}
      {action}
    </div>
  )
}
