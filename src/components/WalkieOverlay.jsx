/**
 * components/WalkieOverlay.jsx — refonte Maison Ylla
 * Bandeau en haut de l'écran quand quelqu'un parle (ou que je parle).
 * Couleurs : coral si je parle (action), or si qqn parle (écoute).
 */
import React from 'react'
import { Radio, MicOff, Volume2, VolumeX } from 'lucide-react'

export default function WalkieOverlay({
  iAmTalking, someoneElseTalking,
  talkerName,
  muted,
  onToggleMute,
}) {
  if (!iAmTalking && !someoneElseTalking) return null

  // Coral (j'émets, action) / Or (je reçois, écoute)
  const bg = iAmTalking ? '#F07848' : '#D89030'
  const fgText = iAmTalking ? '#fff' : '#2A1810'
  const shadow = iAmTalking
    ? '0 6px 20px rgba(240,120,72,.45)'
    : '0 6px 20px rgba(216,144,48,.40)'

  return (
    <div style={{
      position:'fixed',
      top: 'max(env(safe-area-inset-top), 8px)',
      left: 8, right: 8,
      zIndex: 1200,
      background: bg, color: fgText,
      borderRadius: 12,
      padding: '10px 14px',
      boxShadow: shadow,
      display:'flex', alignItems:'center', gap: 10,
      fontFamily:'var(--font)',
      animation: 'walkieSlideDown .25s ease-out',
    }}>
      <span style={{
        width: 10, height: 10, borderRadius:'50%',
        background: fgText,
        animation: 'walkieDot 1s ease-in-out infinite',
        flexShrink: 0,
      }}/>
      <Radio size={18} style={{ flexShrink: 0 }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {iAmTalking ? 'Vous parlez en direct…' : (talkerName + ' parle…')}
        </div>
        {someoneElseTalking && muted && (
          <div style={{ fontSize: 10, opacity: .85, display:'flex', alignItems:'center', gap: 4, marginTop: 1 }}>
            <MicOff size={10}/> Son coupé — Tap 🔊 pour entendre
          </div>
        )}
      </div>
      {someoneElseTalking && (
        <button onClick={onToggleMute}
          style={{
            background: 'rgba(42,24,16,.18)', color: fgText, border:'none',
            width: 34, height: 34, borderRadius: 8, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
            flexShrink: 0,
          }}
          title={muted ? 'Réactiver le son' : 'Couper le son'}>
          {muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}
        </button>
      )}

      <style>{`
        @keyframes walkieDot { 0%, 100% { opacity: 1 } 50% { opacity: .35 } }
        @keyframes walkieSlideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
      `}</style>
    </div>
  )
}
