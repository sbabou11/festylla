/**
 * components/QrScanner.jsx — v8 debug (fix débordement définitif)
 *
 * Scan QR code via la caméra du device (html5-qrcode).
 * Fallback : saisie manuelle de l'ID si la caméra est refusée.
 * codeLength : la saisie manuelle devient un champ en cases (code court d'un poste, PIN) validé seul.
 * codeStatus : 'error' fait vibrer les cases (code refusé par l'appelant).
 * Gère les permissions caméra, les erreurs, et le nettoyage au démontage.
 *
 * APPROCHE DÉBORDEMENT FIX
 * ════════════════════════
 * Le problème historique : la lib html5-qrcode v2.3.x crée une structure DOM
 * complexe (<div><div><video></div></div>) avec des styles inline en pixels
 * (ex: `width: 640px`) qui dépassent le conteneur parent sur mobile.
 *
 * Stratégie en 3 couches :
 *   1. Conteneur dimensionné en JS (pas en aspectRatio CSS qui peut être ignoré
 *      par les éléments en position absolute)
 *   2. Option `aspectRatio` passée à la lib pour qu'elle dimensionne en interne
 *   3. CSS très spécifique avec sélecteurs ciblant TOUS les enfants du scanner,
 *      avec !important pour battre les styles inline
 *
 * Bonus : la zone est limitée à 280px (ou largeur du parent, le min des deux).
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import clsx from 'clsx'
import { Camera, CameraOff, Keyboard, Search, X, Clock } from 'lucide-react'
import useAppStore from '../store/useAppStore'
import { Tabs, Button, CodeInput, Field, focusFirstInvalid } from '../ui'
import s from './QrScanner.module.css'

const SCANNER_ID = 'qr-reader-' + Math.random().toString(36).slice(2, 7)

// Le QR contient soit l'ID direct (FY-XXXX) soit une URL
const parseSpecId = (text) => text.includes('FY-')
  ? text.match(/FY-[A-Z0-9]{4}/)?.[0]
  : text.trim().toUpperCase()

// Taille cible du scanner (carré). Sera réduite si l'écran est plus petit.
const SCANNER_TARGET_SIZE = 280

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
  const [size, setSize] = useState(SCANNER_TARGET_SIZE)
  // État du tap-to-focus : { x, y, key, supported } | null
  // key permet de relancer l'animation à chaque tap (clé React unique)
  const [focusTap, setFocusTap] = useState(null)
  // La recherche par nom et les « récemment servis » ne concernent que les comptes spectateurs :
  // un appelant qui fournit son propre parse (QR de poste…) garde la saisie simple.
  const searchable = parse === parseSpecId
  const scannerRef = useRef(null)
  const containerRef = useRef(null)
  const mountedRef = useRef(true)
  // Track caméra active (récupérée après démarrage) pour applyConstraints
  const videoTrackRef = useRef(null)

  // ── Accès aux données pour la saisie enrichie ──────────────────────
  // Spectateurs : pour la recherche par code OU par nom.
  // Logs : pour identifier les derniers spectateurs servis sur cette tablette.
  const spectateurs = useAppStore(s => s.spectateurs) || []
  const logs        = useAppStore(s => s.logs) || []

  // Filtre des spectateurs en fonction de la saisie : on accepte le début
  // du code (FY-1234) OU le début du nom (insensible à la casse/accents).
  const searchResults = useMemo(() => {
    const q = (manualVal || '').trim().toLowerCase()
    if (q.length < 2) return []
    // Normalisation simple pour ignorer les accents les plus courants
    const norm = (s) => (s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const nq = norm(q)
    return spectateurs
      .filter(s => {
        if (!s) return false
        const code = (s.id || '').toLowerCase()
        if (code.includes(q)) return true
        if (norm(s.nom).includes(nq)) return true
        return false
      })
      .slice(0, 5)
  }, [manualVal, spectateurs])

  // Derniers spectateurs servis depuis cette tablette (= transactions de type
  // débit/retrait/crédit récentes). On déduplique par specId, on prend les 6.
  const recentSpectateurs = useMemo(() => {
    const seen = new Set()
    const result = []
    const interesting = ['debit', 'credit', 'retrait', 'benev-retrait']
    // logs est trié desc (createdAt) par le store
    for (const t of logs) {
      if (!t || !interesting.includes(t.type)) continue
      const sid = t.specId
      if (!sid || seen.has(sid)) continue
      const spec = spectateurs.find(x => x.id === sid)
      if (!spec) continue
      seen.add(sid)
      result.push(spec)
      if (result.length >= 6) break
    }
    return result
  }, [logs, spectateurs])

  // Calcule la taille réelle disponible (taille cible OU largeur du parent - 4px de bordure).
  // Doit être appelé AVANT le démarrage de la caméra pour que la lib reçoive la bonne dim.
  const computeSize = useCallback(() => {
    if (!containerRef.current) return SCANNER_TARGET_SIZE
    // Largeur dispo = parent - padding (on prend une marge de sécurité de 8px)
    const parentWidth = containerRef.current.parentElement?.clientWidth || window.innerWidth
    const available = Math.max(160, parentWidth - 8)
    // Limite aussi en hauteur (50vh max pour ne jamais bouffer l'écran)
    const maxByHeight = Math.floor(window.innerHeight * 0.5)
    return Math.min(SCANNER_TARGET_SIZE, available, maxByHeight)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    // Calcul initial après le 1er rendu
    const next = computeSize()
    setSize(next)
    // Recalcul au redimensionnement
    const onResize = () => {
      const s = computeSize()
      setSize(s)
    }
    window.addEventListener('resize', onResize)
    return () => {
      mountedRef.current = false
      window.removeEventListener('resize', onResize)
      stopScanner()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (mode === 'camera') {
      // Petit délai pour s'assurer que le DOM avec la bonne taille est là
      const t = setTimeout(() => { if (mountedRef.current) startScanner() }, 50)
      return () => clearTimeout(t)
    } else {
      stopScanner()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, size])

  const startScanner = async () => {
    try {
      // Stop précédent éventuel pour ne pas accumuler
      await stopScanner()
      if (!mountedRef.current) return

      const { Html5Qrcode } = await import('html5-qrcode')
      if (!mountedRef.current) return

      const html5QrCode = new Html5Qrcode(SCANNER_ID, /* verbose */ false)
      scannerRef.current = html5QrCode
      setScanning(true)
      setCamError(null)

      // Taille interne du qrbox (zone de détection) = 70% du conteneur
      const qrSize = Math.floor(size * 0.7)

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 15, // 15 FPS au lieu de 10 : plus de chances d'attraper une frame nette
          qrbox: { width: qrSize, height: qrSize },
          aspectRatio: 1.0,
          // ⬇️ On laisse la caméra délivrer en HD pour avoir une image NETTE
          // (sinon des capteurs comme le Huawei P40 Pro génèrent un flou).
          // L'affichage CSS contraint déjà la taille à 280px, donc pas de débordement.
          videoConstraints: {
            facingMode: 'environment',
            width:  { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 },
          },
        },
        (decodedText) => {
          if (mountedRef.current && onScan) {
            const id = parse(decodedText)
            if (id) onScan(id)
          }
        },
        () => {} // erreurs de frame silencieuses
      )

      // Récupère la MediaStreamTrack active pour permettre le tap-to-focus.
      try {
        const videoEl = document.querySelector(`#${SCANNER_ID} video`)
        if (videoEl && videoEl.srcObject) {
          const tracks = videoEl.srcObject.getVideoTracks()
          if (tracks && tracks[0]) {
            videoTrackRef.current = tracks[0]

            // ⬇️ Active le mode autofocus continu si l'appareil le supporte.
            // Ça aide énormément sur Huawei P40 Pro / Samsung où le focus
            // par défaut est "one-shot" et la caméra reste floue.
            try {
              const caps = typeof tracks[0].getCapabilities === 'function' ? tracks[0].getCapabilities() : {}
              if (caps.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
                await tracks[0].applyConstraints({
                  advanced: [{ focusMode: 'continuous' }]
                })
              }
            } catch (focusErr) {
              // Pas grave si non supporté — le focus reste en mode par défaut
              console.debug('Continuous focus non supporté:', focusErr?.message)
            }
          }
        }
      } catch (e) {
        console.warn('Track caméra non récupérable:', e?.message)
      }
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
        if (state === 2) await scannerRef.current.stop()
        scannerRef.current.clear?.()
      } catch (_) {}
      scannerRef.current = null
    }
    // Libère la référence à la track caméra (la lib s'occupe de stop() la track elle-même)
    videoTrackRef.current = null
    if (mountedRef.current) {
      setScanning(false)
      setFocusTap(null)
    }
  }

  const handleManualSubmit = (raw = manualVal) => {
    const val = String(raw).trim().toUpperCase()
    if (!val) { setManualTried(true); focusFirstInvalid(manualRef.current); return }
    setManualTried(false)
    if (onScan) onScan(val)
    if (onManual) onManual(val)
    setManualVal('')
  }

  // Sélection directe d'un spectateur depuis suggestions/récents.
  // Émet le callback comme si on avait scanné le QR.
  const handleSelectSpec = (specId) => {
    if (!specId) return
    if (onScan) onScan(specId)
    if (onManual) onManual(specId)
    setManualVal('')
  }

  // Format euros pour affichage compact (8,50 €)
  const fmtEur = (cents) => ((cents || 0) / 100).toFixed(2).replace('.', ',') + ' €'

  const handleSimulate = () => {
    // Simulation pour le dev / navigateur sans caméra
    const id = simulate[Math.floor(Math.random() * simulate.length)]
    if (onScan) onScan(id)
  }

  /**
   * Tap-to-focus : tente de focaliser la caméra sur le point tapé.
   *
   * Stratégie en 2 niveaux :
   *   1. Si l'API MediaStreamTrack.applyConstraints supporte focusMode + pointsOfInterest
   *      (Android Chrome récent), on déclenche un focus matériel sur le point.
   *      Après 1.5s on revient en mode continuous pour ne pas figer le focus.
   *   2. Si non (iOS Safari, vieux Chrome) on affiche juste l'effet visuel.
   */
  const handleFocusTap = async (e) => {
    if (!scanning) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const nx = Math.min(1, Math.max(0, x / rect.width))
    const ny = Math.min(1, Math.max(0, y / rect.height))

    let supported = false
    const track = videoTrackRef.current
    if (track && typeof track.applyConstraints === 'function') {
      try {
        const caps = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {}
        const advanced = []
        if (caps.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.includes('single-shot')) {
          advanced.push({ focusMode: 'single-shot' })
        }
        if (caps.pointsOfInterest) {
          advanced.push({ pointsOfInterest: [{ x: nx, y: ny }] })
        }
        if (advanced.length > 0) {
          await track.applyConstraints({ advanced })
          supported = true

          // Retour en autofocus continu après 1.5s pour ne pas figer la caméra
          setTimeout(async () => {
            try {
              if (mountedRef.current && track === videoTrackRef.current) {
                const c = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {}
                if (c.focusMode && Array.isArray(c.focusMode) && c.focusMode.includes('continuous')) {
                  await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] })
                }
              }
            } catch {}
          }, 1500)
        }
      } catch (err) {
        console.debug('Tap-to-focus non supporté :', err?.message)
      }
    }

    setFocusTap({ x, y, key: Date.now(), supported })
    setTimeout(() => {
      if (mountedRef.current) setFocusTap(null)
    }, 550)
  }

  return (
    <div ref={containerRef} className={s.root}>
      {/* CSS spécifique pour forcer TOUTES les couches internes de html5-qrcode
          à respecter la taille du conteneur, peu importe les styles inline qu'elle pose.
          On utilise des sélecteurs très spécifiques + !important. */}
      <style>{`
        #${SCANNER_ID} {
          width: ${size}px !important;
          height: ${size}px !important;
          max-width: 100% !important;
          max-height: ${size}px !important;
          min-width: 0 !important;
          min-height: 0 !important;
          overflow: hidden !important;
          position: relative !important;
          border: 0 !important;
          padding: 0 !important;
          background: #000 !important;
        }
        #${SCANNER_ID} > div,
        #${SCANNER_ID} > div > div {
          width: ${size}px !important;
          height: ${size}px !important;
          max-width: 100% !important;
          max-height: ${size}px !important;
          padding: 0 !important;
          border: 0 !important;
          position: relative !important;
        }
        #${SCANNER_ID} video,
        #${SCANNER_ID} canvas {
          width: ${size}px !important;
          height: ${size}px !important;
          max-width: 100% !important;
          max-height: ${size}px !important;
          object-fit: cover !important;
          display: block !important;
        }
        /* Le carré "qrbox" overlay de la lib peut aussi déborder */
        #${SCANNER_ID} #qr-shaded-region {
          width: ${size}px !important;
          height: ${size}px !important;
          max-width: 100% !important;
          max-height: ${size}px !important;
          border-width: ${Math.floor(size * 0.15)}px !important;
        }
      `}</style>

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

      {/* Zone caméra avec tap-to-focus */}
      {mode === 'camera' && (
        <div>
          <div className={s.cameraWrap}>
            <div
              onClick={handleFocusTap}
              className={clsx(s.camera, scanning && s.cameraLive)}
              style={{ width: size, height: size, maxHeight: size }}>
              {/* Le div cible de html5-qrcode */}
              <div id={SCANNER_ID} />

              {/* Overlay tap-to-focus : cercle de mise au point */}
              {focusTap && (
                <div key={focusTap.key} className={s.focusRing} style={{ top: focusTap.y - 30, left: focusTap.x - 30 }}>
                  <div className={s.focusDot} />
                </div>
              )}
            </div>
          </div>
          {scanning && <p className={s.hint}>{hint} · Touchez la zone pour focaliser</p>}
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
      ) : searchable ? (
        /* Saisie enrichie : recherche par code OU nom + suggestions + récents */
        <form ref={manualRef} className={s.manual} noValidate onSubmit={e => { e.preventDefault(); handleManualSubmit() }}>
          <div className={s.searchBox}>
            <Search size={14} className={s.searchIcon} aria-hidden="true" />
            <Field error={manualTried && !manualVal.trim() ? 'Saisis un identifiant ou un nom.' : null} showError={manualTried}>
              <input
                value={manualVal}
                onChange={e => setManualVal(e.target.value)}
                placeholder="Code (FY-1234) ou nom du client"
                aria-label="Code ou nom du client"
                className={clsx(s.input, s.inputSearch)}
                autoComplete="off"
                autoFocus
              />
            </Field>
            {manualVal && (
              <button type="button" onClick={() => setManualVal('')} className={s.searchClear} aria-label="Effacer">
                <X size={14} />
              </button>
            )}
          </div>
          <p className={s.searchHelp}>Tapez le code OU les premières lettres du nom</p>

          {/* Suggestions (apparaissent dès 2 caractères) */}
          {searchResults.length > 0 && (
            <div className={s.suggestions}>
              {searchResults.map(sp => (
                <button key={sp.id} type="button" onClick={() => handleSelectSpec(sp.id)} className={s.suggestion}>
                  <span className={s.suggestionInfo}>
                    <span className={s.suggestionName}>{sp.nom || '—'}</span>
                    <span className={s.mono}>{sp.id}</span>
                  </span>
                  <span className={clsx(s.suggestionSolde, (sp.solde || 0) > 0 && s.suggestionSoldePos)}>{fmtEur(sp.solde)}</span>
                </button>
              ))}
            </div>
          )}

          {/* Cas : recherche active mais aucun résultat */}
          {manualVal.trim().length >= 2 && searchResults.length === 0 && (
            <p className={s.noResult}>Aucun spectateur trouvé. Tapez « Entrée » pour valider tel quel.</p>
          )}

          {/* Bouton valider (toujours visible, utile si le client donne juste son code) */}
          <Button type="submit" block>Valider</Button>

          {/* Récemment servis */}
          {recentSpectateurs.length > 0 && (
            <div className={s.recents}>
              <div className={s.recentsTitle}><Clock size={11} aria-hidden="true" /> Récemment servis</div>
              <div className={s.recentsGrid}>
                {recentSpectateurs.map(sp => (
                  <button key={sp.id} type="button" onClick={() => handleSelectSpec(sp.id)} className={s.recent}>
                    <span className={s.suggestionName}>{sp.nom || '—'}</span>
                    <span className={s.mono}>{sp.id} · {fmtEur(sp.solde)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
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
