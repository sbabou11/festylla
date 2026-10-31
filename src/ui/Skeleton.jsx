/**
 * ui/Skeleton.jsx — bloc de chargement à la forme du contenu attendu
 * <Skeleton height={24} width="60%" /> ou <Skeleton lines={3} />
 */
import React from 'react'
import clsx from 'clsx'
import s from './Skeleton.module.css'

export default function Skeleton({ width = '100%', height = 14, radius, lines, className }) {
  if (lines) {
    return (
      <div className={s.stack} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className={clsx(s.sk, className)} style={{ height, width: i === lines - 1 ? '60%' : '100%', borderRadius: radius }} />
        ))}
      </div>
    )
  }
  return <span className={clsx(s.sk, className)} style={{ width, height, borderRadius: radius }} aria-hidden="true" />
}
