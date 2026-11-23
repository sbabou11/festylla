/**
 * components/NotifBell.jsx — v2 (design system)
 * Desktop  → menu déroulant depuis la cloche (haut droite)
 * Mobile   → feuille du bas avec fond assombri
 * Échap ferme le panneau. Styles : NotifBell.module.css (tokens, clair / sombre / plein soleil).
 */
import React, { useState, useEffect, useRef } from 'react'
import clsx from 'clsx'
import { Bell, X, CheckCheck, ChevronRight } from 'lucide-react'
import { NOTIF_TYPES } from '../hooks/useNotifications'
import { useBreakpoint } from '../hooks/useBreakpoint'
import DetailSheet from './DetailSheet'
import s from './NotifBell.module.css'

// onOpenCommande (facultatif, 23/11/2026) : ouvre la commande liée à une notification
// (reçoit la notification) ; sans lui, le détail n'affiche pas de bouton « Voir la commande ».
export default function NotifBell({ notifications, nonLuCount, onMarkAllRead, onOpenCommande = null }) {
  const [open, setOpen]   = useState(false)
  // Notification ouverte en détail (23/11/2026, maquette validée) : lecture seule. L'ouverture de la
  // cloche marque déjà tout comme lu (logique existante), rien de plus n'est écrit ici.
  const [ouverte, setOuverte] = useState(null)
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
              <li key={n.id}>
                <button type="button" className={clsx(s.item, s.itemBtn, !n.lu && s.unread)} style={{ '--notif': cfg.color }}
                  onClick={() => { setOpen(false); setOuverte(n) }} aria-haspopup="dialog"
                  aria-label={`${n.titre}${!n.lu ? ', non lue' : ''}. Voir le détail`}>
                  <span className={s.icon} aria-hidden="true">{cfg.icon}</span>
                  <span className={s.text}>
                    <b>{n.titre}</b>
                    <span className={s.msg}>{n.message}</span>
                    {n.resaCode && <span className={s.code}>Code : {n.resaCode}</span>}
                    <span className={s.time}>{formatTime(n.timestamp)}</span>
                  </span>
                  {!n.lu && <span className={s.dot} aria-hidden="true"/>}
                  <ChevronRight size={16} className={s.chev} aria-hidden="true"/>
                </button>
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

      {/* ── Détail d'une notification (23/11/2026) : message, ce à quoi elle est liée, quand ── */}
      <DetailSheet open={!!ouverte} onClose={() => setOuverte(null)}
        {...(ouverte ? (() => {
          const n = ouverte
          const cfg = NOTIF_TYPES[n.type] || { icon: '🔔', color: null }
          const Emoji = () => <span style={{ fontSize: 22, lineHeight: 1 }}>{cfg.icon}</span>
          let quand = ''
          try { quand = n.timestamp ? new Date(n.timestamp).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '' } catch {}
          const liee = !!(n.resaId || n.resaCode)
          return {
            title: n.titre || cfg.label || 'Notification',
            icon: Emoji, color: cfg.color || undefined,
            status: cfg.label ? { label: cfg.label, tone: 'neutral' } : null,
            sections: [
              n.message && { label: 'Message', content: <p className={s.detMsg}>{n.message}</p> },
              { label: 'Détail', rows: [
                ['Commande', n.resaCode ? `#${String(n.resaCode).replace(/^#/, '')}` : ''],
                ['Reçue', quand || formatTime(n.timestamp)],
              ] },
            ],
            actions: liee && onOpenCommande ? (
              <button type="button" className="nv-btn nv-press" onClick={() => { setOuverte(null); onOpenCommande(n) }}>Voir la commande</button>
            ) : null,
          }
        })() : {})} />

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
