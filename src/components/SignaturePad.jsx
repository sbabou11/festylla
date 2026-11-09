/**
 * components/SignaturePad.jsx — v8 debug
 *
 * Composant de signature tactile sur canvas HTML5.
 * Compatible souris (desktop) et touch (mobile/tablette).
 *
 * Props :
 *   - onSignatureChange(dataUrl) : appelé à chaque mouvement (peut être null si vide)
 *   - width, height : dimensions du canvas (par défaut auto-fit)
 *   - disabled : empêche toute saisie (mode lecture seule, ex: après validation)
 *   - initialDataUrl : pré-affiche une signature existante (mode lecture)
 *
 * Méthodes exposées via ref :
 *   - clear() : efface le canvas
 *   - getDataUrl() : retourne le PNG data URI
 *   - isEmpty() : true si rien n'a été dessiné
 */

import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react'

const SignaturePad = forwardRef(({ onSignatureChange, width, height = 160, disabled = false, initialDataUrl = null }, ref) => {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [isEmpty, setIsEmpty] = useState(!initialDataUrl)
  const lastPos = useRef({ x: 0, y: 0 })

  // Init canvas : ajuste la résolution selon le DPR (Retina, etc.)
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()
    const realW = width || rect.width
    const realH = height

    canvas.width  = realW * dpr
    canvas.height = realH * dpr
    canvas.style.width  = realW + 'px'
    canvas.style.height = realH + 'px'

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#003048' // marine Maison Ylla

    // Si initialDataUrl, le charger
    if (initialDataUrl) {
      const img = new Image()
      img.onload = () => {
        ctx.clearRect(0, 0, realW, realH)
        ctx.drawImage(img, 0, 0, realW, realH)
      }
      img.src = initialDataUrl
    }
  }, [width, height, initialDataUrl])

  const getPos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    }
  }

  const startDraw = (e) => {
    if (disabled) return
    e.preventDefault()
    const pos = getPos(e)
    lastPos.current = pos
    setIsDrawing(true)
    setIsEmpty(false)
    // Premier point : petit cercle pour que le tap simple soit visible
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, 1.2, 0, Math.PI * 2)
    ctx.fillStyle = '#003048'
    ctx.fill()
  }

  const draw = (e) => {
    if (!isDrawing || disabled) return
    e.preventDefault()
    const pos = getPos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
  }

  const endDraw = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    if (onSignatureChange && canvasRef.current) {
      onSignatureChange(canvasRef.current.toDataURL('image/png'))
    }
  }

  // Méthodes exposées
  useImperativeHandle(ref, () => ({
    clear: () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setIsEmpty(true)
      if (onSignatureChange) onSignatureChange(null)
    },
    getDataUrl: () => {
      if (!canvasRef.current || isEmpty) return null
      return canvasRef.current.toDataURL('image/png')
    },
    isEmpty: () => isEmpty,
  }))

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: height + 'px',
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 8,
          cursor: disabled ? 'default' : 'crosshair',
          touchAction: 'none',
          display: 'block',
        }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      {isEmpty && !disabled && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted)',
          fontSize: 12,
          fontStyle: 'italic',
          pointerEvents: 'none',
        }}>
          Signez ici avec votre doigt
        </div>
      )}
    </div>
  )
})

SignaturePad.displayName = 'SignaturePad'
export default SignaturePad
