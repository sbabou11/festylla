/**
 * components/QrCode.jsx
 * QR code avec logo centré — se met à jour dès que le thème change.
 * La key={} force un re-mount complet quand couleur ou logo changent.
 */

import React, { useEffect, useRef } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import useAppStore from '../store/useAppStore'

function QrCodeInner({ value, size, qrColor, qrBg, qrLogoSrc }) {
  const wrapRef = useRef(null)

  // Overlay du logo APRÈS que QRCodeCanvas ait rendu son canvas
  useEffect(() => {
    if (!qrLogoSrc || !wrapRef.current) return

    // Petit délai pour laisser QRCodeCanvas finir son rendu
    const timer = setTimeout(() => {
      const canvas = wrapRef.current?.querySelector('canvas')
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      const img = new Image()
      img.onload = () => {
        const s = canvas.width * 0.22
        const x = (canvas.width - s) / 2
        const y = (canvas.height - s) / 2
        ctx.fillStyle = qrBg || '#ffffff'
        ctx.fillRect(x - 4, y - 4, s + 8, s + 8)
        ctx.drawImage(img, x, y, s, s)
      }
      img.src = qrLogoSrc
    }, 50)

    return () => clearTimeout(timer)
  }, [qrLogoSrc, qrBg, value, size])

  return (
    <div
      ref={wrapRef}
      style={{ display:'inline-flex', borderRadius:8, overflow:'hidden', background:'#fff', border:'2px solid var(--border2)' }}>
      <QRCodeCanvas
        value={value || 'FY-DEMO'}
        size={size}
        bgColor={qrBg || '#ffffff'}
        fgColor={qrColor || '#1a6b7a'}
        level="M"
        includeMargin={false}
      />
    </div>
  )
}

export default function QrCode({ value, size = 120, className = '' }) {
  const { theme } = useAppStore()

  // La key force un re-mount complet quand couleur ou logo changent
  // → le canvas est recréé proprement, puis le logo est dessiné dessus
  const key = `${theme.qrColor}-${theme.qrBg}-${size}-${!!theme.qrLogoSrc}`

  return (
    <div className={className}>
      <QrCodeInner
        key={key}
        value={value}
        size={size}
        qrColor={theme.qrColor || theme.brand || '#1a6b7a'}
        qrBg={theme.qrBg || '#ffffff'}
        qrLogoSrc={theme.qrLogoSrc}
      />
    </div>
  )
}
