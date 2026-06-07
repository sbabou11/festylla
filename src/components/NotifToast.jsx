/**
 * components/NotifToast.jsx
 * Toast visuel qui apparaît en haut de l'écran pour chaque nouvelle notification
 */
import React, { useState, useEffect, useRef } from 'react'
import { NOTIF_TYPES } from '../hooks/useNotifications'

export default function NotifToast({ notifications }) {
  const [toasts, setToasts]   = useState([])
  const knownIds              = useRef(new Set())
  const sessionStart          = useRef(Date.now())

  useEffect(() => {
    notifications.forEach(n => {
      if (knownIds.current.has(n.id)) return
      if (n.timestamp && new Date(n.timestamp).getTime() < sessionStart.current - 3000) {
        knownIds.current.add(n.id)
        return
      }
      knownIds.current.add(n.id)

      const toast = { ...n, toastId: n.id + Date.now() }
      setToasts(prev => [toast, ...prev].slice(0, 3)) // Max 3 toasts simultanés

      // Auto-supprimer après 4 secondes
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.toastId !== toast.toastId))
      }, 4000)
    })
  }, [notifications])

  if (!toasts.length) return null

  return (
    <>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes toastOut {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(-10px); }
        }
      `}</style>
      <div style={{
        position: 'fixed', top: 16, right: 16, zIndex: 500,
        display: 'flex', flexDirection: 'column', gap: 8,
        maxWidth: 320, width: 'calc(100vw - 32px)',
      }}>
        {toasts.map(toast => {
          const cfg = NOTIF_TYPES[toast.type] || { icon: '🔔', color: '#1a6b7a' }
          return (
            <div key={toast.toastId} style={{
              background: 'var(--bg)',
              border: `1.5px solid ${cfg.color}`,
              borderLeft: `4px solid ${cfg.color}`,
              borderRadius: 12,
              padding: '12px 14px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              animation: 'toastIn .25s cubic-bezier(.4,0,.2,1)',
              display: 'flex', gap: 10, alignItems: 'flex-start',
              cursor: 'pointer',
            }}
              onClick={() => setToasts(prev => prev.filter(t => t.toastId !== toast.toastId))}
            >
              <span style={{ fontSize: 22, flexShrink: 0 }}>{cfg.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2, lineHeight: 1.3 }}>
                  {toast.titre}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
                  {toast.message}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
