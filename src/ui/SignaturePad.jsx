/**
 * ui/SignaturePad.jsx — zone de signature au doigt, au stylet ou à la souris
 * onChange(dataUrl | null) : image PNG de la signature, null quand la zone est vide
 */
import React, { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'
import s from './SignaturePad.module.css'

export default function SignaturePad({ onChange, label = 'Signez dans le cadre', height = 160 }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [empty, setEmpty] = useState(true)

  // Taille réelle du canvas = taille affichée × densité de l'écran (trait net)
  useEffect(() => {
    const c = canvasRef.current
    const ratio = window.devicePixelRatio || 1
    c.width = c.offsetWidth * ratio
    c.height = height * ratio
    const ctx = c.getContext('2d')
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#003048'
  }, [height])

  const point = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const down = (e) => {
    e.preventDefault()
    canvasRef.current.setPointerCapture(e.pointerId)
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const [x, y] = point(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 0.1, y + 0.1)
    ctx.stroke()
  }
  const move = (e) => {
    if (!drawing.current) return
    const ctx = canvasRef.current.getContext('2d')
    const [x, y] = point(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  const up = () => {
    if (!drawing.current) return
    drawing.current = false
    setEmpty(false)
    onChange?.(canvasRef.current.toDataURL('image/png'))
  }
  const clear = () => {
    const c = canvasRef.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    setEmpty(true)
    onChange?.(null)
  }

  return (
    <div className={s.wrap}>
      <canvas
        ref={canvasRef}
        className={s.pad}
        style={{ height }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label={label}
        role="img"
      />
      {empty && <span className={s.hint} aria-hidden="true">{label}</span>}
      <button type="button" className={s.clear} onClick={clear} disabled={empty}>
        <Eraser size={14} /> Effacer
      </button>
    </div>
  )
}
