/**
 * components/QrScanner.jsx
 * Scan QR code via la caméra du device (html5-qrcode).
 * Fallback : saisie manuelle de l'ID si la caméra est refusée.
 * Gère les permissions caméra, les erreurs, et le nettoyage au démontage.
 */

import React, { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Keyboard } from 'lucide-react'

const SCANNER_ID = 'qr-reader-' + Math.random().toString(36).slice(2, 7)

// Le QR contient soit l'ID direct (FY-XXXX) soit une URL
const parseSpecId = (text) => text.includes('FY-')
  ? text.match(/FY-[A-Z0-9]{4}/)?.[0]
  : text.trim().toUpperCase()

// parse    : transforme le texte lu en valeur transmise à onScan (null = ignoré)
// hint     : consigne sous la caméra
// simulate : valeurs du bouton « Simuler un scan », affiché en développement seulement
export default function QrScanner({
  onScan, onManual, placeholder = 'ID spectateur (ex: FY-4A2B)',
  parse = parseSpecId,
  hint = 'Pointez la caméra vers le QR code du spectateur',
  simulate = ['FY-4A2B', 'FY-9C7E', 'FY-1F3D'],
}) {
  const [mode, setMode] = useState('camera') // 'camera' | 'manual'
  const [camError, setCamError] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [manualVal, setManualVal] = useState('')
  const scannerRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopScanner()
    }
  }, [])

  useEffect(() => {
    if (mode === 'camera') startScanner()
    else stopScanner()
  }, [mode])

  const startScanner = async () => {
    try {
      // Import dynamique pour ne pas bloquer le bundle initial
      const { Html5Qrcode } = await import('html5-qrcode')
      if (!mountedRef.current) return

      const html5QrCode = new Html5Qrcode(SCANNER_ID)
      scannerRef.current = html5QrCode
      setScanning(true)
      setCamError(null)

      await html5QrCode.start(
        { facingMode: 'environment' }, // Caméra arrière prioritaire
        { fps: 10, qrbox: { width: 200, height: 200 } },
        (decodedText) => {
          // QR scanné avec succès
          if (mountedRef.current && onScan) {
            const id = parse(decodedText)
            if (id) onScan(id)
          }
        },
        () => {} // Erreurs de frame silencieuses (normal)
      )
    } catch (err) {
      if (!mountedRef.current) return
      setCamError(
        err?.message?.includes('Permission')
          ? 'Accès caméra refusé. Utilisez la saisie manuelle.'
          : 'Caméra indisponible. Utilisez la saisie manuelle.'
      )
      setScanning(false)
      setMode('manual')
    }
  }

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState?.()
        // State 2 = SCANNING
        if (state === 2) await scannerRef.current.stop()
        scannerRef.current.clear?.()
      } catch (_) {}
      scannerRef.current = null
    }
    if (mountedRef.current) setScanning(false)
  }

  const handleManualSubmit = () => {
    const val = manualVal.trim().toUpperCase()
    if (!val) return
    if (onScan) onScan(val)
    if (onManual) onManual(val)
    setManualVal('')
  }

  const handleSimulate = () => {
    // Simulation pour le dev / navigateur sans caméra
    const id = simulate[Math.floor(Math.random() * simulate.length)]
    if (onScan) onScan(id)
  }

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Toggles mode */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button
          onClick={() => setMode('camera')}
          style={{ flex: 1, padding: '7px 10px', border: '0.5px solid var(--border2)', borderRadius: 8, background: mode === 'camera' ? 'var(--brand)' : 'var(--bg2)', color: mode === 'camera' ? '#fff' : 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Camera size={14} /> Caméra
        </button>
        <button
          onClick={() => setMode('manual')}
          style={{ flex: 1, padding: '7px 10px', border: '0.5px solid var(--border2)', borderRadius: 8, background: mode === 'manual' ? 'var(--brand)' : 'var(--bg2)', color: mode === 'manual' ? '#fff' : 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Keyboard size={14} /> Manuel
        </button>
      </div>

      {/* Erreur caméra */}
      {camError && (
        <div style={{ padding: '8px 12px', background: 'var(--amber-light)', border: '0.5px solid #EF9F27', borderRadius: 8, fontSize: 12, color: 'var(--amber)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CameraOff size={14} /> {camError}
        </div>
      )}

      {/* Zone caméra */}
      {mode === 'camera' && (
        <div>
          <div
            id={SCANNER_ID}
            style={{ borderRadius: 10, overflow: 'hidden', border: '2px solid var(--border2)', minHeight: 200, background: '#000', position: 'relative' }}
          />
          {scanning && (
            <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 6 }}>
              {hint}
            </div>
          )}
          {/* Bouton simulation (développement uniquement) */}
          {import.meta.env.DEV && simulate?.length > 0 && <button
            onClick={handleSimulate}
            style={{ width: '100%', marginTop: 8, padding: '6px 10px', border: '0.5px solid var(--border2)', borderRadius: 8, background: 'var(--bg2)', color: 'var(--muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            Simuler un scan (démo)
          </button>}
        </div>
      )}

      {/* Saisie manuelle */}
      {mode === 'manual' && (
        <div>
          <input
            value={manualVal}
            onChange={e => setManualVal(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
            placeholder={placeholder}
            style={{ width: '100%', padding: '9px 12px', border: '0.5px solid var(--border2)', borderRadius: 8, fontSize: 13, background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'var(--font)', marginBottom: 8 }}
          />
          <button
            onClick={handleManualSubmit}
            style={{ width: '100%', padding: 8, background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            Valider
          </button>
        </div>
      )}
    </div>
  )
}
