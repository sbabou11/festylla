/**
 * components/SignatureCanvas.jsx
 *
 * Composant de capture de signature manuscrite via canvas HTML5.
 * Support souris + tactile + stylet (pointer events).
 *
 * Le composant expose 2 méthodes via ref :
 *   - clear() : efface le canvas
 *   - toDataURL() : retourne la signature en PNG base64 (ou null si vide)
 *
 * Aussi : props `onChange(hasSignature: boolean)` notifié à chaque trait
 * pour activer/désactiver le bouton "Valider" côté parent.
 */

import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react'

const SignatureCanvas = forwardRef(({ onChange, height = 180, strokeColor = '#1a1a1a', strokeWidth = 2 }, ref) => {
  const canvasRef = useRef(null)
  const wrapperRef = useRef(null)
  const drawing = useRef(false)
  const hasContent = useRef(false)
  const [empty, setEmpty] = useState(true)

  // ─── Initialisation du canvas (dimensions, devicePixelRatio) ──────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Ajuste la résolution pour les écrans retina (qualité signature)
    const setup = () => {
      const rect = wrapperRef.current.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${height}px`
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = strokeWidth
      // Fond blanc (sinon transparent au export PNG, mal lisible)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, rect.width, height)
    }
    setup()

    // Re-setup sur resize (rotation device, etc.)
    const onResize = () => {
      // Préserver le contenu actuel
      const tmp = canvas.toDataURL('image/png')
      setup()
      if (hasContent.current) {
        const img = new Image()
        img.onload = () => {
          const ctx = canvas.getContext('2d')
          const rect = wrapperRef.current.getBoundingClientRect()
          ctx.drawImage(img, 0, 0, rect.width, height)
        }
        img.src = tmp
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [height, strokeColor, strokeWidth])

  // ─── Helpers : position du pointeur dans le canvas ────────────────
  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    // Touch events fournissent .touches[0], pointer events fournissent .clientX directement
    const point = e.touches && e.touches[0] ? e.touches[0] : e
    return {
      x: point.clientX - rect.left,
      y: point.clientY - rect.top,
    }
  }

  // ─── Handlers de dessin ───────────────────────────────────────────
  const startDrawing = (e) => {
    e.preventDefault()
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const draw = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    if (!hasContent.current) {
      hasContent.current = true
      setEmpty(false)
      onChange && onChange(true)
    }
  }

  const stopDrawing = (e) => {
    if (!drawing.current) return
    e && e.preventDefault && e.preventDefault()
    drawing.current = false
  }

  // ─── API exposée via ref ──────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    clear: () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      const rect = wrapperRef.current.getBoundingClientRect()
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, rect.width, height)
      hasContent.current = false
      setEmpty(true)
      onChange && onChange(false)
    },
    isEmpty: () => !hasContent.current,
    toDataURL: () => {
      if (!hasContent.current) return null
      return canvasRef.current.toDataURL('image/png')
    },
  }))

  return (
    <div ref={wrapperRef} style={{
      width: '100%', position: 'relative',
      border: '0.5px solid var(--border)', borderRadius: 8,
      background: '#ffffff', overflow: 'hidden',
    }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: 'crosshair', touchAction: 'none' }}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
      {empty && (
        // Placeholder visible quand le canvas est vide
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#bbb', fontSize: 13, fontStyle: 'italic',
          pointerEvents: 'none', userSelect: 'none',
        }}>
          Signez ici avec votre doigt ou stylet
        </div>
      )}
    </div>
  )
})

SignatureCanvas.displayName = 'SignatureCanvas'
export default SignatureCanvas
