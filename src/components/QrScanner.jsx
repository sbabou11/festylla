/**
 * components/QrScanner.jsx — v8 debug (fix débordement définitif)
 *
 * Scan QR code via la caméra du device (html5-qrcode).
 * Fallback : saisie manuelle de l'ID si la caméra est refusée.
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
import { Camera, CameraOff, Keyboard, Search, X, Clock } from 'lucide-react'
import useAppStore from '../store/useAppStore'

const SCANNER_ID = 'qr-reader-' + Math.random().toString(36).slice(2, 7)

// Taille cible du scanner (carré). Sera réduite si l'écran est plus petit.
const SCANNER_TARGET_SIZE = 280

export default function QrScanner({ onScan, onManual, placeholder = 'ID spectateur (ex: FY-4A2B)' }) {
  const [mode, setMode] = useState('camera')
  const [camError, setCamError] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [manualVal, setManualVal] = useState('')
  const [size, setSize] = useState(SCANNER_TARGET_SIZE)
  // État du tap-to-focus : { x, y, key, supported } | null
  // key permet de relancer l'animation à chaque tap (clé React unique)
  const [focusTap, setFocusTap] = useState(null)
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
            const id = decodedText.includes('FY-')
              ? decodedText.match(/FY-[A-Z0-9]{4}/)?.[0]
              : decodedText.trim().toUpperCase()
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

  const handleManualSubmit = () => {
    const val = manualVal.trim().toUpperCase()
    if (!val) return
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
    const ids = ['FY-4A2B', 'FY-9C7E', 'FY-1F3D']
    const id = ids[Math.floor(Math.random() * ids.length)]
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
    <div ref={containerRef} style={{ marginBottom: 12, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
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
        /* Animation du cercle de focus (tap-to-focus) :
           démarre à 1.6x avec opacité 1, finit à 1x avec opacité 0 */
        @keyframes qrFocusPulse {
          0%   { transform: scale(1.6); opacity: 0.9; }
          40%  { transform: scale(1);   opacity: 1; }
          100% { transform: scale(0.95); opacity: 0; }
        }
      `}</style>

      {/* Toggles mode */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button
          onClick={() => setMode('camera')}
          style={{ flex: 1, padding: '9px 10px', minHeight: 40, border: '1px solid var(--border2)', borderRadius: 8, background: mode === 'camera' ? 'var(--brand)' : 'var(--bg2)', color: mode === 'camera' ? '#fff' : 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, WebkitTapHighlightColor: 'transparent' }}>
          <Camera size={14} /> Caméra
        </button>
        <button
          onClick={() => setMode('manual')}
          style={{ flex: 1, padding: '9px 10px', minHeight: 40, border: '1px solid var(--border2)', borderRadius: 8, background: mode === 'manual' ? 'var(--brand)' : 'var(--bg2)', color: mode === 'manual' ? '#fff' : 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, WebkitTapHighlightColor: 'transparent' }}>
          <Keyboard size={14} /> Manuel
        </button>
      </div>

      {/* Erreur caméra */}
      {camError && (
        <div style={{ padding: '8px 12px', background: 'var(--amber-light)', border: '0.5px solid #EF9F27', borderRadius: 8, fontSize: 12, color: 'var(--amber)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CameraOff size={14} /> {camError}
        </div>
      )}

      {/* Zone caméra avec tap-to-focus */}
      {mode === 'camera' && (
        <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
          <div
            onClick={handleFocusTap}
            style={{
              width: size,
              height: size,
              maxWidth: '100%',
              maxHeight: size,
              borderRadius: 12,
              overflow: 'hidden',
              border: '2px solid var(--border2)',
              background: '#000',
              position: 'relative',
              flexShrink: 0,
              cursor: scanning ? 'crosshair' : 'default',
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
            }}>
            {/* Le div cible de html5-qrcode */}
            <div id={SCANNER_ID} />

            {/* Overlay tap-to-focus : cercle de mise au point */}
            {focusTap && (
              <div
                key={focusTap.key}
                style={{
                  position: 'absolute',
                  top: focusTap.y - 30,
                  left: focusTap.x - 30,
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  border: '2px solid #FFB833',
                  boxShadow: '0 0 12px rgba(255,184,51,0.60), inset 0 0 6px rgba(255,184,51,0.30)',
                  pointerEvents: 'none',
                  animation: 'qrFocusPulse 550ms ease-out forwards',
                  zIndex: 10,
                }}>
                {/* Petit point central */}
                <div style={{
                  position: 'absolute', top: '50%', left: '50%',
                  width: 4, height: 4, borderRadius: '50%',
                  background: '#FFB833',
                  transform: 'translate(-50%, -50%)',
                }}/>
              </div>
            )}
          </div>
        </div>
      )}

      {mode === 'camera' && scanning && (
        <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>
          Pointez la caméra vers le QR code · Touchez la zone pour focaliser
        </div>
      )}

      {mode === 'camera' && (
        <button
          onClick={handleSimulate}
          style={{ width: '100%', marginTop: 8, padding: '8px 10px', minHeight: 40, border: '0.5px solid var(--border2)', borderRadius: 8, background: 'var(--bg2)', color: 'var(--muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)', WebkitTapHighlightColor: 'transparent' }}>
          Simuler un scan (démo)
        </button>
      )}

      {/* Saisie manuelle enrichie : recherche + suggestions + récents */}
      {mode === 'manual' && (
        <div>
          {/* Champ de recherche unifié (code OU nom) */}
          <div style={{ position: 'relative', marginBottom: 6 }}>
            <Search size={14} style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--muted)', pointerEvents: 'none',
            }}/>
            <input
              value={manualVal}
              onChange={e => setManualVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
              placeholder="Code (FY-1234) ou nom du client"
              autoFocus
              style={{
                width: '100%', padding: '10px 36px 10px 36px', minHeight: 44,
                border: '1px solid var(--border2)', borderRadius: 8, fontSize: 14,
                background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'var(--font)',
                boxSizing: 'border-box', outline: 'none',
              }}
            />
            {manualVal && (
              <button
                onClick={() => setManualVal('')}
                aria-label="Effacer"
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  width: 26, height: 26, padding: 0, background: 'transparent',
                  border: 'none', cursor: 'pointer', color: 'var(--muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <X size={14}/>
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
            Tapez le code OU les premières lettres du nom
          </div>

          {/* Suggestions (apparaissent dès 2 caractères) */}
          {searchResults.length > 0 && (
            <div style={{
              background: 'var(--bg)', border: '0.5px solid var(--border)',
              borderRadius: 8, overflow: 'hidden', marginBottom: 10,
            }}>
              {searchResults.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => handleSelectSpec(s.id)}
                  style={{
                    width: '100%', display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', gap: 8, padding: '10px 12px',
                    background: 'transparent', border: 'none',
                    borderBottom: i < searchResults.length - 1 ? '0.5px solid var(--border)' : 'none',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)',
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.nom || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'ui-monospace, Menlo, monospace' }}>{s.id}</div>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 500,
                    color: (s.solde || 0) > 0 ? 'var(--green-dark, #065f46)' : 'var(--muted)',
                    flexShrink: 0,
                  }}>{fmtEur(s.solde)}</span>
                </button>
              ))}
            </div>
          )}

          {/* Cas : recherche active mais aucun résultat */}
          {manualVal.trim().length >= 2 && searchResults.length === 0 && (
            <div style={{
              padding: '10px 12px', marginBottom: 10,
              background: 'var(--amber-light, #faeeda)', color: 'var(--amber-dark, #ba7517)',
              borderRadius: 8, fontSize: 12, textAlign: 'center',
            }}>
              Aucun spectateur trouvé. Tapez « Entrée » pour valider tel quel.
            </div>
          )}

          {/* Bouton valider (toujours visible, utile si le client donne juste son code) */}
          <button
            onClick={handleManualSubmit}
            disabled={!manualVal.trim()}
            style={{
              width: '100%', padding: 12, minHeight: 44,
              background: manualVal.trim() ? 'var(--brand)' : 'var(--bg2)',
              color: manualVal.trim() ? '#fff' : 'var(--muted)',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
              cursor: manualVal.trim() ? 'pointer' : 'not-allowed', fontFamily: 'var(--font)',
              WebkitTapHighlightColor: 'transparent',
              marginBottom: recentSpectateurs.length > 0 ? 14 : 0,
            }}>
            Valider
          </button>

          {/* Récemment servis */}
          {recentSpectateurs.length > 0 && (
            <div>
              <div style={{
                fontSize: 11, fontWeight: 500, color: 'var(--muted)',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Clock size={11}/> Récemment servis
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: 6,
              }}>
                {recentSpectateurs.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectSpec(s.id)}
                    style={{
                      padding: '8px 10px', background: 'var(--bg2)',
                      border: '0.5px solid var(--border)', borderRadius: 6,
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)',
                      WebkitTapHighlightColor: 'transparent', minWidth: 0,
                    }}>
                    <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.nom || '—'}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1, fontFamily: 'ui-monospace, Menlo, monospace' }}>{s.id} · {fmtEur(s.solde)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
