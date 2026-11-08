/**
 * components/QrScanner.jsx
 * Scan QR code via la caméra du device (html5-qrcode).
 * Fallback : saisie manuelle de l'ID si la caméra est refusée.
 * codeLength : la saisie manuelle devient un champ en cases (code court d'un poste, PIN) validé seul.
 * codeStatus : 'error' fait vibrer les cases (code refusé par l'appelant).
 * Gère les permissions caméra, les erreurs, et le nettoyage au démontage.
 */

import React, { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Keyboard } from 'lucide-react'
import { Tabs, Button, CodeInput, Field, focusFirstInvalid } from '../ui'
import s from './QrScanner.module.css'

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
  codeLength, codeStatus = null,
}) {
  const [mode, setMode] = useState('camera') // 'camera' | 'manual'
  const [camError, setCamError] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [manualVal, setManualVal] = useState('')
  const [manualTried, setManualTried] = useState(false)
  const manualRef = useRef(null)
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

  const handleManualSubmit = (raw = manualVal) => {
    const val = String(raw).trim().toUpperCase()
    if (!val) { setManualTried(true); focusFirstInvalid(manualRef.current); return }
    setManualTried(false)
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
    <div className={s.root}>
      <Tabs
        label="Mode de lecture"
        value={mode}
        onChange={setMode}
        className={s.modes}
        items={[
          { value: 'camera', label: <><Camera size={14} aria-hidden="true" /> Caméra</> },
          { value: 'manual', label: <><Keyboard size={14} aria-hidden="true" /> Saisie</> },
        ]}
      />

      {camError && (
        <div className={s.error} role="status"><CameraOff size={14} aria-hidden="true" /> {camError}</div>
      )}

      {mode === 'camera' && (
        <div>
          <div id={SCANNER_ID} className={s.camera} />
          {scanning && <p className={s.hint}>{hint}</p>}
          {/* Bouton simulation (développement uniquement) */}
          {import.meta.env.DEV && simulate?.length > 0 && (
            <button type="button" onClick={handleSimulate} className={s.simulate}>Simuler un scan (démo)</button>
          )}
        </div>
      )}

      {mode === 'manual' && (codeLength ? (
        <div className={s.manualCode}>
          <CodeInput
            length={codeLength}
            value={manualVal}
            onChange={setManualVal}
            onComplete={handleManualSubmit}
            status={codeStatus}
            autoFocus
            label={placeholder}
          />
          <p className={s.hint}>{placeholder}</p>
        </div>
      ) : (
        <form ref={manualRef} className={s.manual} noValidate onSubmit={e => { e.preventDefault(); handleManualSubmit() }}>
          {/* Erreur au clic sur Valider seulement : champ vidé après chaque saisie réussie */}
          <Field error={manualTried && !manualVal.trim() ? 'Saisis un identifiant.' : null} showError={manualTried}>
            <input
              value={manualVal}
              onChange={e => setManualVal(e.target.value.toUpperCase())}
              placeholder={placeholder}
              aria-label={placeholder}
              className={s.input}
              autoCapitalize="characters"
              autoComplete="off"
            />
          </Field>
          <Button type="submit" block>Valider</Button>
        </form>
      ))}
    </div>
  )
}
