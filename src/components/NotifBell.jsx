/**
 * components/NotifBell.jsx — v2 (design system)
 * Desktop  → menu déroulant depuis la cloche (haut droite)
 * Mobile   → feuille du bas avec fond assombri
 * Échap ferme le panneau. Styles : NotifBell.module.css (tokens, clair / sombre / plein soleil).
 */
import React, { useState, useEffect, useRef } from 'react'
import clsx from 'clsx'
import { Bell, X, CheckCheck } from 'lucide-react'
import { NOTIF_TYPES } from '../hooks/useNotifications'
import { useBreakpoint } from '../hooks/useBreakpoint'
import s from './NotifBell.module.css'

export default function NotifBell({ notifications, nonLuCount, onMarkAllRead }) {
  const [open, setOpen]   = useState(false)
  const [shake, setShake] = useState(false)
  const prevCount         = useRef(nonLuCount)
  const dropdownRef       = useRef(null)
  const { isMobile }      = useBreakpoint()

  // Animation cloche sur nouvelle notif
  useEffect(() => {
    if (nonLuCount > prevCount.current) {
      setShake(true)
      setTimeout(() => setShake(false), 600)
    }
    prevCount.current = nonLuCount
  }, [nonLuCount])

  // Fermer le dropdown desktop si clic en dehors
  useEffect(() => {
    if (!open || isMobile) return
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, isMobile])

  // Empêcher le scroll body quand le bottom sheet est ouvert
  useEffect(() => {
    if (isMobile && open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open, isMobile])

  const handleOpen = () => {
    setOpen(o => !o)
    if (!open && nonLuCount > 0) onMarkAllRead?.()
  }

  const close = () => setOpen(false)

  const formatTime = (ts) => {
    if (!ts) return ''
    try {
      const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
      if (diff < 60)   return 'À l\'instant'
      if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`
      return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }

  // Échap ferme le panneau (bureau et mobile)
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // ── Contenu partagé entre desktop et mobile ───────────────────
  const panel = (
    <>
      {isMobile && <div className={s.handle} aria-hidden="true"/>}

      <div className={s.head}>
        <h2 id="notif-title">
          <Bell size={16} aria-hidden="true"/> Notifications
          {notifications.length > 0 && <span className={s.total}>({notifications.length})</span>}
        </h2>
        {nonLuCount > 0 && (
          <button type="button" className={s.readAll} onClick={onMarkAllRead}>
            <CheckCheck size={14} aria-hidden="true"/> Tout lire
          </button>
        )}
        <button type="button" className={s.close} onClick={close} aria-label="Fermer les notifications">
          <X size={16} aria-hidden="true"/>
        </button>
      </div>

      {notifications.length === 0 ? (
        <div className={s.empty}>
          <span className={s.emptyIcon}><Bell size={22} aria-hidden="true"/></span>
          <b>Aucune notification</b>
          <p>Les alertes apparaîtront ici</p>
        </div>
      ) : (
        <ul className={clsx(s.list, 'yc-stagger')}>
          {notifications.map((n) => {
            const cfg = NOTIF_TYPES[n.type] || { icon: '🔔', color: 'var(--muted)' }
            return (
              <li key={n.id} className={clsx(s.item, !n.lu && s.unread)} style={{ '--notif': cfg.color }}>
                <span className={s.icon} aria-hidden="true">{cfg.icon}</span>
                <div className={s.text}>
                  <b>{n.titre}</b>
                  <p className={s.msg}>{n.message}</p>
                  {n.resaCode && <span className={s.code}>Code : {n.resaCode}</span>}
                  <span className={s.time}>{formatTime(n.timestamp)}</span>
                </div>
                {!n.lu && <span className={s.dot} aria-label="Non lue"/>}
              </li>
            )
          })}
        </ul>
      )}

      {notifications.length > 0 && (
        <div className={s.foot}>Notifications de cette session</div>
      )}
    </>
  )

  const label = nonLuCount > 0 ? `Notifications, ${nonLuCount} non lue${nonLuCount > 1 ? 's' : ''}` : 'Notifications'

  return (
    <>
      {/* ── Bouton cloche ── */}
      <div ref={dropdownRef} className={s.wrap}>
        <button
          type="button"
          onClick={handleOpen}
          className={clsx('btn-icon nav-btn', s.bell, open && s.bellOpen, shake && s.shake)}
          title="Notifications"
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <Bell size={16} aria-hidden="true"/>
          {nonLuCount > 0 && (
            <span className={s.count} aria-hidden="true">{nonLuCount > 9 ? '9+' : nonLuCount}</span>
          )}
        </button>

        {/* ── Desktop : menu déroulant ── */}
        {!isMobile && open && (
          <div className={s.dropdown} role="dialog" aria-labelledby="notif-title">
            {panel}
          </div>
        )}
      </div>

      {/* ── Mobile : feuille du bas avec fond ── */}
      {isMobile && open && (
        <div className={s.backdrop} onClick={close}>
          <div className={s.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="notif-title">
            {panel}
          </div>
        </div>
      )}
    </>
  )
}
