/**
 * components/NotifBell.jsx
 * Desktop  → dropdown depuis la cloche (haut droite)
 * Mobile   → bottom sheet (remonte depuis le bas) avec backdrop semi-transparent
 */
import React, { useState, useEffect, useRef } from 'react'
import { Bell, X, CheckCheck } from 'lucide-react'
import { NOTIF_TYPES } from '../hooks/useNotifications'
import { useBreakpoint } from '../hooks/useBreakpoint'

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

  // ── Contenu partagé entre desktop et mobile ───────────────────
  const PanelContent = () => (
    <>
      {/* Handle mobile */}
      {isMobile && (
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border2)', margin: '12px auto 4px' }}/>
      )}

      {/* Header */}
      <div style={{
        padding: isMobile ? '12px 20px 14px' : '14px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={16} style={{ color: 'var(--brand)' }}/>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Notifications</span>
          {notifications.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>({notifications.length})</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {nonLuCount > 0 && (
            <button onClick={onMarkAllRead}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1px solid var(--border2)', borderRadius: 8, background: 'var(--bg2)', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 'auto' }}>
              <CheckCheck size={13}/> Tout lire
            </button>
          )}
          <button onClick={close}
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 8, background: 'var(--bg2)', color: 'var(--muted)', cursor: 'pointer', flexShrink: 0, minHeight: 'auto' }}>
            <X size={15}/>
          </button>
        </div>
      </div>

      {/* Liste */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {notifications.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--muted)' }}>
            <Bell size={36} style={{ opacity: .25, marginBottom: 12, display: 'block', margin: '0 auto 12px' }}/>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Aucune notification</div>
            <div style={{ fontSize: 13 }}>Les alertes apparaîtront ici</div>
          </div>
        ) : (
          notifications.map((n, i) => {
            const cfg = NOTIF_TYPES[n.type] || { icon: '🔔', color: 'var(--muted)' }
            return (
              <div key={n.id} style={{
                padding: isMobile ? '14px 20px' : '12px 16px',
                borderBottom: i < notifications.length - 1 ? '1px solid var(--border)' : 'none',
                display: 'flex', gap: 12, alignItems: 'flex-start',
                background: !n.lu ? cfg.color + '0c' : 'transparent',
                animation: `fadeInItem .2s ease ${i * 0.04}s both`,
              }}>
                {/* Icône */}
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: cfg.color + '18',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18,
                }}>
                  {cfg.icon}
                </div>

                {/* Texte */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: n.lu ? 500 : 700, color: 'var(--text)', marginBottom: 3, lineHeight: 1.3 }}>
                    {n.titre}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>
                    {n.message}
                  </div>
                  {n.resaCode && (
                    <div style={{ marginTop: 5, fontSize: 12, fontFamily: 'monospace', color: cfg.color, fontWeight: 700 }}>
                      Code : {n.resaCode}
                    </div>
                  )}
                  <div style={{ marginTop: 5, fontSize: 11, color: 'var(--muted)', opacity: .65 }}>
                    {formatTime(n.timestamp)}
                  </div>
                </div>

                {/* Point non-lu */}
                {!n.lu && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626', flexShrink: 0, marginTop: 6 }}/>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)', textAlign: 'center', flexShrink: 0 }}>
          Notifications de cette session
        </div>
      )}
    </>
  )

  return (
    <>
      {/* ── CSS animations ── */}
      <style>{`
        @keyframes bellShake {
          0%,100% { transform: rotate(0deg);   }
          15%      { transform: rotate(-12deg); }
          30%      { transform: rotate(10deg);  }
          45%      { transform: rotate(-8deg);  }
          60%      { transform: rotate(6deg);   }
          75%      { transform: rotate(-4deg);  }
          90%      { transform: rotate(2deg);   }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)     scale(1);    }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0);    }
        }
        @keyframes fadeInItem {
          from { opacity: 0; transform: translateX(-5px); }
          to   { opacity: 1; transform: translateX(0);    }
        }
        @keyframes fadeInBackdrop {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* ── Bouton cloche ── */}
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          onClick={handleOpen}
          className="btn-icon nav-btn"
          title="Notifications"
          style={{
            width: 36, height: 36,
            position: 'relative',
            animation: shake ? 'bellShake .5s ease' : 'none',
            background: open ? 'var(--brand-light)' : undefined,
            borderColor: open ? 'var(--brand)' : undefined,
            color: open ? 'var(--brand)' : undefined,
          }}
        >
          <Bell size={16}/>
          {nonLuCount > 0 && (
            <span style={{
              position: 'absolute', top: -3, right: -3,
              minWidth: 17, height: 17,
              borderRadius: 10, background: '#DC2626', color: '#fff',
              fontSize: 10, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 3px', border: '2px solid var(--bg)', lineHeight: 1,
            }}>
              {nonLuCount > 9 ? '9+' : nonLuCount}
            </span>
          )}
        </button>

        {/* ── Desktop : dropdown ── */}
        {!isMobile && open && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: 340,
            maxHeight: 500,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            boxShadow: '0 16px 48px rgba(0,0,0,0.16)',
            zIndex: 200,
            animation: 'slideDown .18s ease',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <PanelContent/>
          </div>
        )}
      </div>

      {/* ── Mobile : bottom sheet avec backdrop ── */}
      {isMobile && open && (
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 210,
            background: 'rgba(0,0,0,0.5)',
            animation: 'fadeInBackdrop .2s ease',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              maxHeight: '85vh',
              background: 'var(--bg)',
              borderRadius: '20px 20px 0 0',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
              display: 'flex', flexDirection: 'column',
              animation: 'slideUp .25s cubic-bezier(.4,0,.2,1)',
              overflow: 'hidden',
            }}
          >
            <PanelContent/>
          </div>
        </div>
      )}
    </>
  )
}
