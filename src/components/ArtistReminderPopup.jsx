/**
 * components/ArtistReminderPopup.jsx — v8 debug
 *
 * Popup plein écran semi-transparent qui s'affiche quand un rappel
 * (balance ou prestation) est déclenché pour un artiste.
 *
 * Couleur :
 *   - Balance → teal Maison Ylla (couleur "préparation")
 *   - Prestation → coral Maison Ylla (couleur "action immédiate")
 *
 * Le popup peut être acquitté en cliquant n'importe où dessus.
 * Auto-disparait après 2 minutes si non acquitté.
 */

import React from 'react'

export default function ArtistReminderPopup({ reminder, onAcknowledge }) {
  if (!reminder) return null

  const isBalance = reminder.isBalance
  const colors = isBalance ? {
    bg:       'linear-gradient(135deg, #14B5B5 0%, #009090 100%)',
    iconBg:   'rgba(255,255,255,0.20)',
    accent:   '#FFF8F2',
  } : {
    bg:       'linear-gradient(135deg, #FF8A5C 0%, #F07848 100%)',
    iconBg:   'rgba(255,255,255,0.20)',
    accent:   '#FFF8F2',
  }

  return (
    <div
      onClick={onAcknowledge}
      role="alertdialog"
      aria-modal="true"
      aria-label={reminder.label}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0, 24, 36, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'popupFadeIn 0.25s ease-out',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        cursor: 'pointer',
      }}>
      <style>{`
        @keyframes popupFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes popupPop {
          0%   { transform: scale(0.7); opacity: 0; }
          60%  { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes popupPulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.08); }
        }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: colors.bg,
          color: '#fff',
          padding: '28px 24px 24px',
          borderRadius: 24,
          maxWidth: 360,
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          textAlign: 'center',
          animation: 'popupPop 0.35s cubic-bezier(.34,1.56,.64,1)',
          position: 'relative',
        }}>
        {/* Icône */}
        <div style={{
          width: 80, height: 80,
          margin: '0 auto 16px',
          borderRadius: '50%',
          background: colors.iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 44,
          animation: 'popupPulse 1.5s ease-in-out infinite',
        }}>
          {reminder.icon}
        </div>

        {/* Label */}
        <div style={{
          fontSize: 22, fontWeight: 800,
          marginBottom: 8,
          letterSpacing: '-0.01em',
          lineHeight: 1.2,
        }}>
          {reminder.label}
        </div>

        {/* Détail scène/lieu */}
        {reminder.scene && (
          <div style={{
            fontSize: 14, fontWeight: 600,
            opacity: 0.92,
            marginBottom: 18,
            padding: '6px 14px',
            background: 'rgba(255,255,255,0.18)',
            borderRadius: 12,
            display: 'inline-block',
          }}>
            📍 {reminder.scene}
          </div>
        )}

        {/* Description */}
        <div style={{
          fontSize: 13,
          opacity: 0.85,
          marginBottom: 22,
          lineHeight: 1.5,
        }}>
          {reminder.isBalance
            ? 'Préparez-vous à monter sur scène pour la balance technique.'
            : 'C\'est presque l\'heure de votre prestation. Rejoignez la scène !'}
        </div>

        {/* Bouton acquit */}
        <button
          onClick={onAcknowledge}
          style={{
            background: '#fff',
            color: isBalance ? '#006666' : '#C45520',
            border: 'none',
            borderRadius: 14,
            padding: '14px 28px',
            fontSize: 14,
            fontWeight: 800,
            cursor: 'pointer',
            fontFamily: 'inherit',
            width: '100%',
            minHeight: 48,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            letterSpacing: '0.02em',
            WebkitTapHighlightColor: 'transparent',
          }}>
          ✓ Compris
        </button>
      </div>
    </div>
  )
}
