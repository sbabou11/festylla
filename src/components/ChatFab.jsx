/**
 * components/ChatFab.jsx — v7 palier 2 (FAB dual chat + talkie)
 *
 * Le FAB est un bouton élargi avec 2 zones :
 *  - Zone gauche  : 💬 → tap = ouvre la modale chat
 *  - Zone droite  : 📻 → push & hold = parle en talkie-walkie
 * Appui long sur n'importe quelle zone = drag pour déplacer.
 *
 * Comportements visuels :
 *  - badge non-lus en haut à gauche
 *  - si JE parle : FAB pulse rouge + chrono visible
 *  - si quelqu'un d'autre parle : couleur ambre, le bouton talkie est bloqué
 */
import React, { useEffect, useRef, useState } from 'react'
import { MessageCircle, Radio, Mic } from 'lucide-react'

const FAB_HEIGHT = 56
const FAB_WIDTH  = 108
const MARGIN     = 12
const LONG_PRESS_MS = 500
const MOVE_THRESHOLD = 8

function loadPos(uid) {
  try {
    const saved = localStorage.getItem('chat-fab-pos-' + (uid || 'guest'))
    if (saved) return JSON.parse(saved)
  } catch {}
  return {
    x: window.innerWidth  - FAB_WIDTH - MARGIN,
    y: window.innerHeight - FAB_HEIGHT - 80,
  }
}

function savePos(uid, pos) {
  try { localStorage.setItem('chat-fab-pos-' + (uid || 'guest'), JSON.stringify(pos)) } catch {}
}

function clamp(pos) {
  const w = window.innerWidth, h = window.innerHeight
  return {
    x: Math.max(MARGIN, Math.min(w - FAB_WIDTH  - MARGIN, pos.x)),
    y: Math.max(MARGIN, Math.min(h - FAB_HEIGHT - MARGIN, pos.y)),
  }
}

export default function ChatFab({
  uid,
  color = '#1a6b7a',
  nonLuCount = 0,
  onOpenChat,
  onWalkieStart,
  onWalkieStop,
  iAmTalking = false,
  someoneElseTalking = false,
  talkDuration = 0,
}) {
  const [pos, setPos]           = useState(() => clamp(loadPos(uid)))
  const [dragMode, setDragMode] = useState(false)

  const posRef         = useRef(pos)
  const dragModeRef    = useRef(false)
  const startRef       = useRef(null)
  const longPressRef   = useRef(null)
  const movedRef       = useRef(false)
  const pressedZoneRef = useRef(null)  // 'chat' | 'talkie'
  const isHoldingTalkie = useRef(false)

  useEffect(() => { posRef.current = pos }, [pos])
  useEffect(() => { dragModeRef.current = dragMode }, [dragMode])

  useEffect(() => {
    const onResize = () => setPos(p => clamp(p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── Gestion du press par zone ───────────────────────────────────
  const handleDown = (zone, e) => {
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}

    movedRef.current = false
    pressedZoneRef.current = zone
    startRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: posRef.current.x,
      posY: posRef.current.y,
      pointerId: e.pointerId,
    }

    if (longPressRef.current) clearTimeout(longPressRef.current)
    longPressRef.current = setTimeout(() => {
      if (startRef.current && !isHoldingTalkie.current) {
        setDragMode(true)
        dragModeRef.current = true
        if (navigator.vibrate) navigator.vibrate(30)
      }
    }, LONG_PRESS_MS)

    // Pour le talkie : déclencher start immédiatement (push-to-talk)
    if (zone === 'talkie' && !someoneElseTalking) {
      isHoldingTalkie.current = true
      onWalkieStart?.()
    }
  }

  const handleMove = (e) => {
    if (!startRef.current) return
    if (e.pointerId !== startRef.current.pointerId) return

    const dx = e.clientX - startRef.current.x
    const dy = e.clientY - startRef.current.y
    const dist2 = dx*dx + dy*dy

    if (dist2 > MOVE_THRESHOLD * MOVE_THRESHOLD) {
      movedRef.current = true
      if (!dragModeRef.current && !isHoldingTalkie.current) {
        if (longPressRef.current) {
          clearTimeout(longPressRef.current)
          longPressRef.current = null
        }
      }
    }

    if (dragModeRef.current) {
      e.preventDefault()
      const newPos = clamp({
        x: startRef.current.posX + dx,
        y: startRef.current.posY + dy,
      })
      setPos(newPos)
      posRef.current = newPos
    }
  }

  const handleUp = (e) => {
    if (!startRef.current) return
    if (e.pointerId !== startRef.current.pointerId) return

    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }

    const wasDragging = dragModeRef.current
    const wasMoved    = movedRef.current
    const zone        = pressedZoneRef.current

    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}

    // Si on parlait en talkie : arrêter
    if (isHoldingTalkie.current) {
      isHoldingTalkie.current = false
      onWalkieStop?.()
    }

    if (wasDragging) {
      savePos(uid, posRef.current)
      setDragMode(false)
      dragModeRef.current = false
    } else if (!wasMoved && zone === 'chat') {
      onOpenChat?.()
    }

    startRef.current = null
    movedRef.current = false
    pressedZoneRef.current = null
  }

  const handleCancel = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
    if (isHoldingTalkie.current) {
      isHoldingTalkie.current = false
      onWalkieStop?.()
    }
    startRef.current = null
    movedRef.current = false
    pressedZoneRef.current = null
    if (dragModeRef.current) {
      setDragMode(false)
      dragModeRef.current = false
    }
  }

  // ── Styles dynamiques ──────────────────────────────────────────
  const isTalkieDisabled = someoneElseTalking && !iAmTalking
  // Marine au repos (--marine #003048), coral si je parle (--coral), or si qqn parle (--gold)
  const fabBg = iAmTalking ? '#F07848'
              : someoneElseTalking ? '#D89030'
              : '#002438'

  const talkieZoneBg = iAmTalking ? 'rgba(255,255,255,.20)'
                     : isTalkieDisabled ? 'rgba(255,255,255,.06)'
                     : 'rgba(255,255,255,.10)'

  // Zone chat : teal signature
  const chatZoneBg = iAmTalking ? 'rgba(255,255,255,.10)' : '#009090'

  return (
    <div style={{
      position:'fixed',
      left: pos.x, top: pos.y,
      width: FAB_WIDTH, height: FAB_HEIGHT,
      borderRadius: 14,
      background: fabBg,
      color:'#fff',
      boxShadow: dragMode
        ? '0 0 0 4px rgba(255,255,255,.30), 0 8px 24px rgba(0,0,0,.30)'
        : iAmTalking
        ? '0 0 0 4px rgba(240,120,72,.40), 0 8px 24px rgba(240,120,72,.50)'
        : someoneElseTalking
        ? '0 8px 24px rgba(216,144,48,.45)'
        : '0 6px 18px rgba(0,48,72,.30)',
      display:'flex', flexDirection:'row', alignItems:'stretch',
      zIndex: 998,
      transition: dragMode ? 'none' : 'background-color .2s, box-shadow .15s, transform .15s',
      transform: dragMode ? 'scale(1.05)' : 'scale(1)',
      userSelect:'none',
      WebkitUserSelect:'none',
      WebkitTapHighlightColor:'transparent',
      overflow:'hidden',
      animation: iAmTalking ? 'walkiePulse 1.5s ease-in-out infinite' : 'none',
    }}>
      {/* Zone CHAT */}
      <button
        onPointerDown={(e) => handleDown('chat', e)}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleCancel}
        onContextMenu={(e) => e.preventDefault()}
        title="Chat équipe"
        style={{
          flex:1, height:'100%',
          background: chatZoneBg,
          border:'none',
          color:'#fff',
          cursor: dragMode ? 'grabbing' : 'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          touchAction:'none',
          position:'relative',
          padding: 0,
        }}>
        <MessageCircle size={22}/>
        {nonLuCount > 0 && (
          <span style={{
            position:'absolute', top:-4, left:-4,
            minWidth: 22, height: 22, padding:'0 6px',
            borderRadius: 11,
            background:'#D83030', color:'#fff',
            fontSize: 11, fontWeight: 800,
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 2px 6px rgba(0,0,0,.30)',
            border:'2px solid #FFF8F2',
            pointerEvents:'none',
          }}>
            {nonLuCount > 99 ? '99+' : nonLuCount}
          </span>
        )}
      </button>

      {/* Séparateur */}
      <div style={{ width:1, background:'rgba(255,255,255,.2)', alignSelf:'center', height:'60%' }}/>

      {/* Zone TALKIE */}
      <button
        onPointerDown={(e) => handleDown('talkie', e)}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleCancel}
        onContextMenu={(e) => e.preventDefault()}
        title={iAmTalking ? "Vous parlez…" : isTalkieDisabled ? "Quelqu'un parle déjà" : "Maintenir pour parler"}
        disabled={isTalkieDisabled}
        style={{
          flex:1, height:'100%',
          background: talkieZoneBg,
          border:'none',
          color:'#fff',
          cursor: isTalkieDisabled ? 'not-allowed' : (dragMode ? 'grabbing' : 'pointer'),
          opacity: isTalkieDisabled ? 0.5 : 1,
          display:'flex', alignItems:'center', justifyContent:'center',
          touchAction:'none',
          padding: 0,
          gap: 4,
        }}>
        {iAmTalking ? (
          <>
            <Mic size={18}/>
            <span style={{ fontSize:11, fontWeight:800, fontFamily:'monospace' }}>{talkDuration}s</span>
          </>
        ) : (
          <Radio size={22}/>
        )}
      </button>

      <style>{`
        @keyframes walkiePulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(240,120,72,.40), 0 8px 24px rgba(240,120,72,.50); }
          50%      { box-shadow: 0 0 0 12px rgba(240,120,72,.15), 0 8px 24px rgba(240,120,72,.40); }
        }
      `}</style>
    </div>
  )
}
