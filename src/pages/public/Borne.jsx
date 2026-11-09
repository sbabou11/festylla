/**
 * Borne.jsx — Borne self-service pour spectateurs au stand
 *
 * Page publique sans login, conçue pour fonctionner sur tablette
 * en mode kiosque devant l'entrée d'un stand. Le spectateur scanne
 * son QR ou saisit son ID pour passer commande de manière autonome.
 *
 * Accès : /borne?ev=<eventId>&stand=<numéro-stand-optionnel>
 *
 * Lot 1 (cette livraison) :
 *   - Écran 1 : accueil "Toucher pour commencer"
 *   - Écran 2 : identification QR + saisie manuelle
 *   - Validation du spectateur depuis Firestore
 *
 * Lots suivants (à venir) :
 *   - Écran 3 : menu avec ajout au panier + compteur inactivité
 *   - Écran 4 : confirmation panier avec décompte solde
 *   - Écran 5 : ticket de fin + auto-retour
 *
 * SÉCURITÉ — points clés :
 *   - Aucune session persistante (pas de localStorage de l'identité du
 *     spectateur). Tout l'état d'identification est uniquement dans React.
 *   - Auto-retour à l'accueil après chaque commande ou inactivité.
 *   - Pas d'historique, pas d'infos personnelles affichées.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from 'react'
import { ArrowLeft, RefreshCw, Plus, Minus, ShoppingCart, Clock, X, Maximize2 } from 'lucide-react'
import useKioskMode from '../../hooks/useKioskMode'
import ArticleInfoModal from '../../components/ArticleInfoModal'
import { getSpectateur, setCurrentEvent, watchMenu, createCommande, getSettings } from '../../firebase/service'

// ─── Étapes du flux ─────────────────────────────────────────────────────
// Codé en const pour pouvoir étendre facilement (lots suivants : 'menu',
// 'panier', 'ticket').
const STEP = {
  ACCUEIL:        'accueil',
  IDENTIFICATION: 'identification',
  // Étapes à venir :
  MENU:           'menu',
  PANIER:         'panier',
  TICKET:         'ticket',
}

// ─── Helpers couleur ────────────────────────────────────────────────────
// La couleur de marque vient de settings.brandColor (hexadécimal, ex: #009090).
// On dérive automatiquement les variantes :
//   - bgDark : fond très sombre pour l'accueil et l'écran public
//   - bgLight : fond plus clair pour le menu (pas de fatigue visuelle)
//   - textOnBrand : noir ou blanc selon la luminance
//   - btnPrimary : couleur d'accent (= brandColor par défaut)
// Tout est calculé pour qu'une couleur claire ou foncée donne un résultat
// lisible dans les deux cas.

const hex2rgb = (hex) => {
  const h = (hex || '#003048').replace('#', '')
  const full = h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h
  const n = parseInt(full, 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgb2hex = ([r, g, b]) => {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return '#' + c(r) + c(g) + c(b)
}
// Mélange une couleur avec du noir (factor 0 = pure, 1 = noir total)
const darken = (hex, factor) => {
  const [r, g, b] = hex2rgb(hex)
  return rgb2hex([r * (1 - factor), g * (1 - factor), b * (1 - factor)])
}
// Mélange une couleur avec du blanc (factor 0 = pure, 1 = blanc total)
const lighten = (hex, factor) => {
  const [r, g, b] = hex2rgb(hex)
  return rgb2hex([r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor])
}
// Retourne #fff ou #000 selon la luminance perçue de la couleur d'arrière-plan.
// Utilise la formule WCAG simplifiée. Permet le contraste optimal du texte.
const textOnBg = (hex) => {
  const [r, g, b] = hex2rgb(hex)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.55 ? '#000' : '#fff'
}

// Construit une palette à partir d'une brandColor unique.
// brandColor peut être null/undefined → on tombe sur les défauts Maison Ylla.
const buildPalette = (brandColor) => {
  const brand = brandColor || '#003048'
  return {
    brand,                             // couleur principale (ex: bouton)
    brandDark:   darken(brand, 0.4),   // fond très sombre (accueil)
    brandDarker: darken(brand, 0.7),   // fond ultra sombre (haut du gradient)
    brandLight:  lighten(brand, 0.4),  // fond clair pour highlights
    brandLighter: lighten(brand, 0.92),// presque blanc, teint léger
    textOnBrand: textOnBg(brand),
    // Alias historiques (le code existant utilise ces noms partout) :
    // - marine : couleur principale d'accent dans l'UI (= brand)
    // - tealDark : variante sombre (= brandDark)
    // - teal : couleur secondaire (= brand pour simplifier, sinon variante plus claire)
    marine:      brand,
    teal:        brand,
    tealDark:    darken(brand, 0.2),
    coral:       '#F07848',            // accent CTA (gardé fixe, complémentaire)
    bg:          '#F8F8F5',
    text:        '#1E1E1E',
    muted:       '#888888',
    border:      '#E5E5E0',
    green:       '#1D9E75',
    red:         '#D85A30',
  }
}

// COLORS : palette par défaut (Maison Ylla, marine #003048).
// Sera MUTÉE dynamiquement à l'init avec la palette du festival
// chargée depuis settings.brandColor (cf. useEffect du composant Borne).
// Tous les composants enfants référencent COLORS.x sans prop drilling.
const COLORS = buildPalette('#003048')

// ─── Sécurité : timers d'inactivité (Lot 2) ─────────────────────────────
// Sur les écrans MENU et PANIER, on surveille l'inactivité tactile pour
// éviter qu'une session reste ouverte si le spectateur s'éloigne.
//   - WARN_AT  : à 50 s, on affiche une modale "Vous êtes toujours là ?"
//   - LOGOUT_AT: à 60 s, on retourne à l'accueil sans valider
// Tout tap/click n'importe où réinitialise le compteur (cf. activityListener).
const IDLE_WARN_SEC = 50
const IDLE_LOGOUT_SEC = 60

export default function Borne() {
  // Étape courante du flux. Stockée uniquement en mémoire React (jamais
  // persistée) pour garantir qu'un reload ramène toujours à l'accueil.
  const [step, setStep] = useState(STEP.ACCUEIL)
  // Spectateur identifié — null tant qu'on n'a pas validé un QR/ID
  const [spec, setSpec] = useState(null)
  // Panier {[itemId]: qty}. Aussi en mémoire React uniquement. Sera reset
  // à la fin de la session (auto-déco, validation, ou retour manuel).
  const [cart, setCart] = useState({})
  // Résa créée après validation (pour affichage du ticket — Lot 4)
  const [lastResa, setLastResa] = useState(null)
  // État erreur affiché en surimpression (sur écran d'identification)
  const [error, setError] = useState('')
  // Indique qu'on est en train de chercher le spectateur dans Firestore
  const [loading, setLoading] = useState(false)
  // Nom du stand (passé en URL ?stand=N) pour affichage discret
  const [standName, setStandName] = useState('')
  // Indique si l'eventId est valide pour cet appareil
  const [eventReady, setEventReady] = useState(false)
  // ─── Branding dynamique (logo + palette) chargés depuis settings ─────
  // Palette par défaut au montage, remplacée dès que les settings sont chargés.
  // Le rerender propage automatiquement aux composants enfants via les props.
  const [palette, setPalette] = useState(() => buildPalette(null))
  const [logoUrl, setLogoUrl] = useState('')

  // ─── Initialisation : lecture des params URL ──────────────────────────
  // On lit l'eventId depuis l'URL et on l'installe dans le store/localStorage
  // pour que les appels service.js fonctionnent (getEventId() les utilise).
  // Puis on charge les settings pour récupérer logo + couleur du festival.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ev = params.get('ev')
    const stand = params.get('stand')
    if (stand) setStandName(stand)
    if (!ev) {
      setError('Cette borne n\'est pas configurée. Paramètre ?ev=<eventId> manquant dans l\'URL.')
      return
    }
    // Installe l'eventId dans le store pour que getEventId() le retourne
    setCurrentEvent(ev)
    setEventReady(true)
    // Charge le branding (logo + couleur de marque) depuis settings.
    // Best-effort : si erreur, on garde les défauts Maison Ylla.
    getSettings(ev).then(s => {
      if (s?.brandColor) {
        const newPalette = buildPalette(s.brandColor)
        setPalette(newPalette)
        // Mutation de l'objet COLORS pour que tous les composants existants
        // qui référencent COLORS.x voient les nouvelles valeurs au prochain render.
        // Hack pragmatique car le fichier référence COLORS.x partout.
        Object.assign(COLORS, newPalette)
      }
      if (s?.logoDataUrl) setLogoUrl(s.logoDataUrl)
    }).catch(e => console.warn('Borne settings:', e.message))
  }, [])

  // ─── Validation d'un ID spectateur (commun QR + saisie manuelle) ──────
  // Recherche dans Firestore, valide, puis passe à l'étape suivante.
  const validateSpec = useCallback(async (rawId) => {
    if (!rawId) return
    setError('')
    setLoading(true)
    try {
      // Normalisation : nettoie espaces, met en majuscules, retire URL si QR
      // a encodé une URL complète (ex: https://festishop.festylla.com/spec/FY-XYZ)
      let id = String(rawId).trim().toUpperCase()
      // Si on a une URL avec un FY- dedans, extrait
      const match = id.match(/FY-[A-Z0-9]+/)
      if (match) id = match[0]

      if (!id.startsWith('FY-')) {
        setError('Code spectateur invalide. Format attendu : FY-XXXX.')
        return
      }
      // Recherche dans Firestore
      const found = await getSpectateur(id)
      if (!found) {
        setError(`Code spectateur "${id}" introuvable. Vérifiez votre QR ou demandez à la caisse.`)
        return
      }
      // Succès : on stocke le spectateur et on passe à l'étape suivante
      // (pour l'instant juste affichage temporaire d'un message — le menu sera
      // ajouté au Lot 2)
      setSpec(found)
      setStep(STEP.MENU)
    } catch (e) {
      console.error('Borne validateSpec:', e)
      setError('Erreur de connexion. Réessayez dans un instant.')
    } finally {
      setLoading(false)
    }
  }, [])

  // ─── Helpers de transition ────────────────────────────────────────────
  // resetSession : retour à l'accueil + effacement de toute donnée perso.
  // Appelé après commande terminée, inactivité, ou bouton "Terminer".
  const resetSession = useCallback(() => {
    setSpec(null)
    setCart({})
    setLastResa(null)
    setError('')
    setStep(STEP.ACCUEIL)
  }, [])

  // ─── Rendu selon l'étape ──────────────────────────────────────────────
  // Container plein écran avec couleurs marine/coral identité Maison Ylla
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: COLORS.bg,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: COLORS.text,
      overflow: 'hidden',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      WebkitTapHighlightColor: 'transparent',
    }}>
      {!eventReady ? (
        <ConfigError error={error}/>
      ) : step === STEP.ACCUEIL ? (
        <Accueil onStart={() => setStep(STEP.IDENTIFICATION)} standName={standName} logoUrl={logoUrl}/>
      ) : step === STEP.IDENTIFICATION ? (
        <Identification
          onValidated={validateSpec}
          onCancel={resetSession}
          loading={loading}
          error={error}
          standName={standName}/>
      ) : step === STEP.MENU ? (
        <Menu
          spec={spec}
          cart={cart}
          setCart={setCart}
          onTimeout={resetSession}
          onGoToCart={() => setStep(STEP.PANIER)}
          onTerminate={resetSession}
          standName={standName}/>
      ) : step === STEP.PANIER ? (
        <Panier
          spec={spec}
          cart={cart}
          setCart={setCart}
          onTimeout={resetSession}
          onBack={() => setStep(STEP.MENU)}
          onTerminate={resetSession}
          onConfirmed={(resa) => {
            setLastResa(resa)
            setStep(STEP.TICKET)
          }}/>
      ) : step === STEP.TICKET ? (
        <Ticket resa={lastResa} onDone={resetSession} logoUrl={logoUrl}/>
      ) : null}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Écran d'erreur de configuration (eventId absent dans l'URL)
// ════════════════════════════════════════════════════════════════════
function ConfigError({ error }) {
  return (
    <div style={{
      height: '100%', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 40, textAlign: 'center', background: COLORS.marine, color: '#fff',
    }}>
      <div style={{ fontSize: 64, marginBottom: 20 }}>⚠️</div>
      <div style={{ fontSize: 24, fontWeight: 600, marginBottom: 12 }}>
        Borne non configurée
      </div>
      <div style={{ fontSize: 16, opacity: 0.8, maxWidth: 500, lineHeight: 1.5 }}>
        {error || 'Veuillez contacter l\'administrateur.'}
      </div>
      <div style={{ fontSize: 13, opacity: 0.5, marginTop: 40, fontFamily: 'monospace' }}>
        URL attendue : /borne?ev=&lt;eventId&gt;&amp;stand=&lt;numéro&gt;
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Écran 1 — Accueil
// ════════════════════════════════════════════════════════════════════
// Plein écran tactile. Tout l'écran est cliquable pour démarrer.
// Le fond utilise la couleur de marque du festival (settings.brandColor),
// avec un gradient vers une variante plus sombre pour la profondeur.
// Le logo (settings.logoDataUrl) est affiché en haut s'il est défini.
function Accueil({ onStart, standName, logoUrl }) {
  // Texte sur le fond brand — soit blanc soit noir selon luminance
  const onBrand = COLORS.textOnBrand || '#fff'
  // Couleur des labels secondaires : variante avec opacité réduite
  const onBrandMuted = onBrand === '#fff' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)'
  const onBrandSubtle = onBrand === '#fff' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)'
  const onBrandFaint = onBrand === '#fff' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'

  // Mode borne : Fullscreen + paysage forcé + wake lock (cf. hook).
  // Réservé au staff qui configure la tablette en début de service.
  const kiosk = useKioskMode({ orientation: 'landscape' })

  return (
    <div
      onClick={onStart}
      onTouchEnd={onStart}
      style={{
        height: '100%', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 40, textAlign: 'center',
        // Dégradé vertical de la version sombre vers la couleur de marque
        background: `linear-gradient(180deg, ${COLORS.brandDarker} 0%, ${COLORS.brandDark} 100%)`,
        color: onBrand, cursor: 'pointer',
        position: 'relative',
      }}>
      {/* Bouton "Mode borne" discret en haut à droite — visible seulement
          quand le mode n'est pas déjà actif. Réservé au staff qui configure
          la tablette.
          IMPORTANT : sur tablette, le parent capte onTouchEnd → onStart.
          On doit donc gérer onTouchEnd ici aussi pour :
            1. Empêcher la propagation au parent (sinon démarre la commande)
            2. Activer le mode borne (sinon le bouton ne fait rien sur tactile)
          Note : Fullscreen API exige un geste utilisateur direct, c'est le
          cas avec onTouchEnd. */}
      {!kiosk.active && (
        <button
          onClick={kiosk.activate}
          onTouchEnd={kiosk.activate}
          style={{
            position: 'absolute', top: 16, right: 16,
            padding: '8px 14px', borderRadius: 8,
            background: 'rgba(0,0,0,0.25)', color: onBrand,
            border: `0.5px solid ${onBrandFaint}`,
            fontSize: 12, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            WebkitTapHighlightColor: 'transparent',
            zIndex: 10,
          }}>
          <Maximize2 size={13}/> Mode borne
        </button>
      )}
      {/* Logo du festival si disponible, sinon texte de fallback */}
      {logoUrl ? (
        <img src={logoUrl} alt="Logo"
          style={{
            maxHeight: 100, maxWidth: 280,
            marginBottom: 24, objectFit: 'contain',
            // Si fond sombre + logo sombre, ajout d'un fond blanc subtil
            // (rare, mais sécurité visuelle)
          }}/>
      ) : (
        <div style={{
          fontSize: 20, color: onBrandMuted, marginBottom: 12,
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          Maison Ylla{standName ? ` — Stand ${standName}` : ''}
        </div>
      )}
      {/* Nom du stand affiché en plus si on a un logo (sinon déjà dans le label ci-dessus) */}
      {logoUrl && standName && (
        <div style={{
          fontSize: 16, color: onBrandMuted, marginBottom: 12,
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          Stand {standName}
        </div>
      )}
      <div style={{
        fontSize: 'clamp(36px, 6vw, 56px)',
        fontWeight: 600, marginBottom: 16, lineHeight: 1.1,
        color: onBrand,
      }}>
        Commandez vous-même
      </div>
      <div style={{
        fontSize: 'clamp(15px, 2vw, 19px)',
        color: onBrandSubtle, marginBottom: 48,
        maxWidth: 500, lineHeight: 1.5,
      }}>
        Pas d'attente, paiement direct sur votre solde.
      </div>
      <div style={{
        background: COLORS.coral, color: '#fff',
        padding: '24px 56px', borderRadius: 14,
        fontSize: 'clamp(18px, 2.5vw, 24px)', fontWeight: 600,
        boxShadow: '0 4px 20px rgba(240,120,72,0.3)',
        animation: 'borne-pulse 2s ease-in-out infinite',
      }}>
        Toucher pour commencer
      </div>
      <div style={{
        position: 'absolute', bottom: 20, left: 0, right: 0,
        textAlign: 'center', fontSize: 12, color: onBrandFaint,
      }}>
        Tap n'importe où sur l'écran
      </div>
      <style>{`
        @keyframes borne-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
      `}</style>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Écran 2 — Identification (QR + saisie manuelle)
// ════════════════════════════════════════════════════════════════════
function Identification({ onValidated, onCancel, loading, error, standName }) {
  // Saisie manuelle du code (préfixe FY- ajouté automatiquement à la validation)
  const [manualInput, setManualInput] = useState('')

  // Heure courante (mise à jour chaque minute pour l'en-tête)
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  // Ajout d'une lettre/chiffre au clavier manuel.
  // On limite à 8 caractères (les IDs typiques font 4-6 caractères après FY-).
  const addChar = (ch) => {
    if (loading) return
    if (manualInput.length >= 8) return
    setManualInput(prev => prev + ch)
  }
  const removeChar = () => {
    if (loading) return
    setManualInput(prev => prev.slice(0, -1))
  }
  const submitManual = () => {
    if (loading || manualInput.length < 3) return
    // Reconstitue le code complet avec préfixe FY-
    onValidated('FY-' + manualInput)
  }

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      padding: 'clamp(12px, 2vh, 24px)',
      background: COLORS.bg,
      overflow: 'hidden',
    }}>
      {/* En-tête : stand + heure + bouton retour */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 'clamp(8px, 1.5vh, 20px)',
        flexShrink: 0,
      }}>
        <button onClick={onCancel}
          style={{
            background: 'transparent', border: 'none', color: COLORS.muted,
            fontSize: 14, padding: '8px 12px', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: 'inherit',
          }}>
          <ArrowLeft size={16}/> Annuler
        </button>
        <div style={{ fontSize: 13, color: COLORS.muted }}>
          {standName ? `Stand ${standName} · ` : ''}{timeStr}
        </div>
      </div>

      {/* Titre */}
      <div style={{
        textAlign: 'center',
        marginBottom: 'clamp(8px, 2vh, 24px)',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 'clamp(18px, 3vh, 22px)',
          fontWeight: 600, color: COLORS.marine, marginBottom: 4,
        }}>
          Identifiez-vous
        </div>
        <div style={{ fontSize: 13, color: COLORS.muted }}>
          Saisissez votre identifiant (ex : FY-A2B4)
        </div>
      </div>

      {/* Saisie manuelle (mode unique pour la borne self-service) */}
      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        overflowY: 'auto',
      }}>
        <ManualKeypad
          value={manualInput}
          onAdd={addChar}
          onRemove={removeChar}
          onSubmit={submitManual}
          loading={loading}/>
      </div>

      {/* Message d'erreur (en bas, surimpression) */}
      {error && (
        <div style={{
          position: 'absolute', bottom: 24, left: 24, right: 24,
          background: '#FCEBEB', color: '#791F1F',
          border: '0.5px solid #F09595', borderRadius: 10,
          padding: '14px 18px', fontSize: 14, lineHeight: 1.4,
          textAlign: 'center', maxWidth: 600, margin: '0 auto',
        }}>
          {error}
        </div>
      )}

      {/* Spinner si chargement */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(255,255,255,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, color: COLORS.marine, fontWeight: 600,
        }}>
          <RefreshCw size={20} style={{
            animation: 'borne-spin 1s linear infinite', marginRight: 10,
          }}/>
          Vérification…
          <style>{`
            @keyframes borne-spin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Clavier manuel pour saisie ID
// ════════════════════════════════════════════════════════════════════
// Les IDs spectateurs sont du format FY-XXXX où X = alphanumérique.
// On expose un clavier 4 colonnes avec chiffres + lettres majuscules.
function ManualKeypad({ value, onAdd, onRemove, onSubmit, loading }) {
  // 0-9 puis A-Z (sans I, O, 0, 1 si on veut éviter les confusions visuelles,
  // mais ici on garde tout pour ne pas surprendre l'utilisateur)
  const keys = ['0','1','2','3','4','5','6','7','8','9',
                'A','B','C','D','E','F','G','H','I','J',
                'K','L','M','N','O','P','Q','R','S','T',
                'U','V','W','X','Y','Z']
  return (
    <div style={{
      background: '#fff', borderRadius: 14,
      padding: 'clamp(12px, 2vh, 24px)',
      border: `0.5px solid ${COLORS.border}`,
      width: '100%', maxWidth: 720,
      maxHeight: '100%',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Styles communs (keyframes + effet :active sur les touches) */}
      <style>{`
        @keyframes borne-blink { to { opacity: 0; } }
        .borne-key {
          transition: transform 0.06s ease, background-color 0.1s ease;
        }
        .borne-key:not(:disabled):active {
          transform: scale(0.94);
          background-color: #0a0a0a !important;
        }
        .borne-action {
          transition: transform 0.06s ease, background-color 0.1s ease;
        }
        .borne-action:not(:disabled):active {
          transform: scale(0.97);
        }
      `}</style>

      {/* Affichage de la saisie en cours — fond clair, texte sombre.
          Les tailles s'adaptent à la hauteur disponible via clamp() pour
          rester utilisables sur tablette en paysage (~600-800px de haut). */}
      <div style={{
        background: '#F1EFE8', borderRadius: 12,
        padding: 'clamp(12px, 2.5vh, 24px) 16px',
        marginBottom: 'clamp(8px, 1.5vh, 20px)',
        textAlign: 'center',
        fontSize: 'clamp(22px, 4vh, 36px)',
        fontWeight: 600,
        color: '#2C2C2A', letterSpacing: '0.12em',
        fontFamily: 'monospace',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `0.5px solid ${COLORS.border}`,
        flexShrink: 0,
      }}>
        <span style={{ color: '#B4B2A9', fontWeight: 400 }}>FY-</span>
        <span>{value}</span>
        <span style={{
          display: 'inline-block', width: 3,
          height: 'clamp(22px, 4vh, 36px)',
          background: '#2C2C2A', marginLeft: 4,
          animation: 'borne-blink 1s steps(2) infinite',
        }}/>
      </div>

      {/* Grille de touches — padding/fontSize ajustés à la hauteur dispo */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gap: 'clamp(4px, 1vh, 8px)',
        marginBottom: 'clamp(8px, 1.5vh, 14px)',
        flexShrink: 0,
      }}>
        {keys.map(k => (
          <button key={k}
            className="borne-key"
            onClick={() => onAdd(k)}
            disabled={loading}
            style={{
              background: '#2C2C2A', color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: 'clamp(10px, 2.4vh, 22px) 0',
              fontSize: 'clamp(16px, 2.8vh, 22px)',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'monospace',
              opacity: loading ? 0.5 : 1,
              WebkitTapHighlightColor: 'transparent',
            }}>
            {k}
          </button>
        ))}
      </div>

      {/* Effacer (neutre clair) + Valider (couleur de marque) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 2fr',
        gap: 'clamp(6px, 1vh, 10px)',
        flexShrink: 0,
      }}>
        <button onClick={onRemove} disabled={loading || value.length === 0}
          className="borne-action"
          style={{
            background: '#D3D1C7', color: '#2C2C2A',
            border: 'none',
            borderRadius: 10,
            padding: 'clamp(12px, 2.5vh, 20px)',
            fontSize: 'clamp(14px, 2.4vh, 18px)',
            fontWeight: 600,
            cursor: (loading || value.length === 0) ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            opacity: (loading || value.length === 0) ? 0.4 : 1,
            WebkitTapHighlightColor: 'transparent',
          }}>
          ← Effacer
        </button>
        <button onClick={onSubmit} disabled={loading || value.length < 3}
          className="borne-action"
          style={{
            background: (loading || value.length < 3) ? '#D3D1C7' : COLORS.teal,
            color: (loading || value.length < 3) ? '#888780' : '#fff',
            border: 'none', borderRadius: 10,
            padding: 'clamp(12px, 2.5vh, 20px)',
            fontSize: 'clamp(15px, 2.6vh, 20px)',
            fontWeight: 700,
            cursor: (loading || value.length < 3) ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            WebkitTapHighlightColor: 'transparent',
          }}>
          Valider →
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Hook : surveillance d'inactivité
// ════════════════════════════════════════════════════════════════════
// Démarre un timer qui :
//   - déclenche `onWarn()` à warnSec secondes (modale d'avertissement)
//   - déclenche `onTimeout()` à timeoutSec secondes (force la déco)
// Toute interaction tactile/clic/scroll/clavier réinitialise le compteur.
//
// Retourne `idleSec` (compteur affichable) pour l'UI.
function useIdleWatcher({ warnSec, timeoutSec, onWarn, onTimeout, enabled = true }) {
  const [idleSec, setIdleSec] = useState(0)
  const lastActivity = useRef(Date.now())
  const warnedRef = useRef(false)

  // Reset à chaque interaction
  const touchActivity = useCallback(() => {
    lastActivity.current = Date.now()
    setIdleSec(0)
    warnedRef.current = false
  }, [])

  useEffect(() => {
    if (!enabled) return
    // Écoute toutes les interactions sur le document
    const events = ['mousedown', 'touchstart', 'keydown', 'scroll']
    events.forEach(e => window.addEventListener(e, touchActivity, { passive: true }))
    return () => events.forEach(e => window.removeEventListener(e, touchActivity))
  }, [enabled, touchActivity])

  useEffect(() => {
    if (!enabled) return
    const tick = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastActivity.current) / 1000)
      setIdleSec(elapsed)
      if (elapsed >= timeoutSec) {
        onTimeout?.()
      } else if (elapsed >= warnSec && !warnedRef.current) {
        warnedRef.current = true
        onWarn?.()
      }
    }, 1000)
    return () => clearInterval(tick)
  }, [enabled, warnSec, timeoutSec, onWarn, onTimeout])

  return { idleSec, touchActivity }
}

// ════════════════════════════════════════════════════════════════════
// Écran 3 — Menu (Lot 2)
// ════════════════════════════════════════════════════════════════════
// Affiche le solde + les articles du menu, avec ajout/retrait au panier.
// Filtres catégories. Compteur d'inactivité visible. Bouton Terminer
// permanent en haut à droite.
function Menu({ spec, cart, setCart, onTimeout, onGoToCart, onTerminate, standName }) {
  // Items du menu (chargés en live depuis Firestore)
  const [menu, setMenu] = useState([])
  // Filtre catégorie actif (null = toutes)
  const [activeCat, setActiveCat] = useState(null)
  // Modale "Vous êtes toujours là ?" (warning d'inactivité)
  const [showWarn, setShowWarn] = useState(false)
  // Article actuellement affiché en modale composition (null = aucune)
  const [selectedItem, setSelectedItem] = useState(null)

  // Watcher Firestore sur la collection menu
  useEffect(() => {
    const unsub = watchMenu((items) => {
      // On filtre les articles désactivés ou hors-vente
      setMenu(items.filter(i => i.actif !== false))
    })
    return () => unsub && unsub()
  }, [])

  // Watcher d'inactivité — déclenche warning à 50s, déconnexion à 60s
  const { idleSec, touchActivity } = useIdleWatcher({
    warnSec: IDLE_WARN_SEC,
    timeoutSec: IDLE_LOGOUT_SEC,
    onWarn: () => setShowWarn(true),
    onTimeout: onTimeout,
    enabled: true,
  })

  // Quand le user touche "Je suis là" dans la modale, on ferme + reset le timer
  const dismissWarn = () => {
    touchActivity()
    setShowWarn(false)
  }

  // ─── Catégories dérivées ────────────────────────────────────────────
  // On trie les catégories par ordre alphabétique pour stabilité d'affichage
  const cats = useMemo(() => {
    const set = new Set()
    menu.forEach(m => { if (m.cat) set.add(m.cat) })
    return Array.from(set).sort()
  }, [menu])

  // Items filtrés par catégorie active
  const filteredMenu = useMemo(() => {
    if (!activeCat) return menu
    return menu.filter(m => m.cat === activeCat)
  }, [menu, activeCat])

  // ─── Helpers panier ─────────────────────────────────────────────────
  const updateQty = (itemId, delta) => {
    setCart(prev => {
      const next = { ...prev }
      const current = next[itemId] || 0
      const newQty = Math.max(0, current + delta)
      if (newQty === 0) delete next[itemId]
      else next[itemId] = newQty
      return next
    })
  }

  // Total du panier en centimes
  const cartTotal = useMemo(() => {
    return Object.entries(cart).reduce((sum, [itemId, qty]) => {
      const item = menu.find(m => m.id === itemId)
      if (!item) return sum
      return sum + (item.prix || 0) * qty
    }, 0)
  }, [cart, menu])

  const cartCount = useMemo(() => {
    return Object.values(cart).reduce((sum, q) => sum + q, 0)
  }, [cart])

  // Compteur d'auto-déco affiché (60 - écoulé)
  const secondsLeft = Math.max(0, IDLE_LOGOUT_SEC - idleSec)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: COLORS.bg }}>
      {/* ─── En-tête : nom + solde + compteur + bouton terminer ───────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr auto auto',
        gap: 16, alignItems: 'center',
        padding: '14px 24px', background: '#fff',
        borderBottom: `0.5px solid ${COLORS.border}`,
      }}>
        <div>
          <div style={{ fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Bonjour
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.marine }}>
            {spec?.nom || '—'}
          </div>
        </div>
        <div style={{ textAlign: 'left', paddingLeft: 20 }}>
          <div style={{ fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Solde
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.green }}>
            {((spec?.solde || 0) / 100).toFixed(2)} €
          </div>
        </div>
        {/* Compteur d'inactivité */}
        <div style={{
          background: COLORS.bg,
          padding: '8px 12px', borderRadius: 8,
          border: `0.5px solid ${COLORS.border}`,
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: COLORS.muted,
        }}>
          <Clock size={13}/>
          <span>Déco auto dans</span>
          <span style={{
            fontWeight: 700,
            color: secondsLeft <= 15 ? COLORS.red : COLORS.marine,
          }}>{secondsLeft}s</span>
        </div>
        {/* Bouton Terminer */}
        <button onClick={onTerminate}
          style={{
            background: 'transparent', color: COLORS.muted,
            border: `0.5px solid ${COLORS.border}`,
            borderRadius: 8, padding: '8px 14px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
          <X size={14}/> Terminer
        </button>
      </div>

      {/* ─── Tabs catégories ──────────────────────────────────────────── */}
      <div style={{
        padding: '10px 24px', background: '#fff',
        borderBottom: `0.5px solid ${COLORS.border}`,
        display: 'flex', gap: 8, overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        <CategoryTab
          active={activeCat === null}
          onClick={() => setActiveCat(null)}>
          Tout ({menu.length})
        </CategoryTab>
        {cats.map(cat => {
          const count = menu.filter(m => m.cat === cat).length
          return (
            <CategoryTab key={cat}
              active={activeCat === cat}
              onClick={() => setActiveCat(cat)}>
              {cat} ({count})
            </CategoryTab>
          )
        })}
      </div>

      {/* ─── Grille des articles ──────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {filteredMenu.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 60, color: COLORS.muted,
          }}>
            {menu.length === 0
              ? 'Chargement du menu…'
              : 'Aucun article dans cette catégorie.'}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 12,
          }}>
            {filteredMenu.map(item => (
              <MenuCard key={item.id}
                item={item}
                qty={cart[item.id] || 0}
                onAdd={() => updateQty(item.id, +1)}
                onRemove={() => updateQty(item.id, -1)}
                onShowInfo={() => setSelectedItem(item)}/>
            ))}
          </div>
        )}
      </div>

      {/* ─── Barre panier en bas (visible quand panier non vide) ──────── */}
      {cartCount > 0 && (
        <div style={{
          background: COLORS.marine, color: '#fff',
          padding: '16px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShoppingCart size={20}/>
            <div>
              <div style={{ fontSize: 14, opacity: 0.7 }}>
                {cartCount} article{cartCount > 1 ? 's' : ''}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {(cartTotal / 100).toFixed(2)} €
              </div>
            </div>
          </div>
          <button onClick={onGoToCart}
            style={{
              background: COLORS.coral, color: '#fff',
              border: 'none', borderRadius: 10,
              padding: '14px 28px', fontSize: 16, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
            Voir le panier →
          </button>
        </div>
      )}

      {/* ─── Modale "Vous êtes toujours là ?" ─────────────────────────── */}
      {showWarn && (
        <IdleWarning onContinue={dismissWarn} secondsLeft={secondsLeft}/>
      )}

      {/* ─── Modale fiche article (composition, allergènes) ──────────── */}
      {selectedItem && (
        <ArticleInfoModal
          item={selectedItem}
          qty={cart[selectedItem.id] || 0}
          onAdd={() => updateQty(selectedItem.id, +1)}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  )
}

// ─── Petits composants Menu ─────────────────────────────────────────────
function CategoryTab({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      style={{
        background: active ? COLORS.marine : 'transparent',
        color: active ? '#fff' : COLORS.muted,
        border: active ? 'none' : `0.5px solid ${COLORS.border}`,
        borderRadius: 20, padding: '8px 18px',
        fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
        cursor: 'pointer', fontFamily: 'inherit',
      }}>
      {children}
    </button>
  )
}

function MenuCard({ item, qty, onAdd, onRemove, onShowInfo }) {
  const outOfStock = typeof item.stock === 'number' && item.stock <= 0
  const inCart = qty > 0
  // Compatibilité : photoUrl (nouveau champ Lot Image 1) ou image (legacy)
  const photoSrc = item.photoUrl || item.image
  // Couleur de placeholder déterministe à partir du nom de l'article
  // pour donner un visuel agréable même sans photo.
  const placeholderHue = (item.nom || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  // Stoppe la propagation sur les boutons +/− pour ne pas déclencher
  // l'ouverture de la modale composition.
  const stop = (handler) => (e) => { e.stopPropagation(); handler && handler() }
  return (
    <div
      onClick={onShowInfo}
      style={{
      position: 'relative',
      borderRadius: 14,
      overflow: 'hidden',
      aspectRatio: '1/1',
      border: `0.5px solid ${inCart ? COLORS.teal : 'transparent'}`,
      outline: inCart ? `2px solid ${COLORS.teal}` : 'none',
      outlineOffset: -1,
      opacity: outOfStock ? 0.55 : 1,
      cursor: outOfStock ? 'not-allowed' : (onShowInfo ? 'pointer' : 'default'),
      background: '#222', // Fond sombre par défaut, masqué par l'image
    }}>
      {/* Image entière + fond flouté pour combler les bandes */}
      {photoSrc ? (
        <>
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${photoSrc})`,
            backgroundSize: 'cover', backgroundPosition: 'center',
            filter: 'blur(18px) brightness(0.6)',
            transform: 'scale(1.15)',
          }}/>
          <img src={photoSrc} alt={item.nom}
            style={{
              position: 'absolute', inset: 0,
              margin: 'auto',
              maxWidth: '100%', maxHeight: '100%',
              objectFit: 'contain',
            }}/>
        </>
      ) : (
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(135deg, hsl(${placeholderHue},35%,55%), hsl(${(placeholderHue+30)%360},45%,30%))`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 64, color: 'rgba(255,255,255,0.25)', fontWeight: 700 }}>
            {item.nom?.[0]?.toUpperCase() || '?'}
          </span>
        </div>
      )}

      {/* Dégradé sombre en bas pour lisibilité du texte */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 40%, transparent 70%)',
      }}/>

      {/* Badge rupture en haut à droite */}
      {outOfStock && (
        <span style={{
          position: 'absolute', top: 8, right: 8,
          background: COLORS.red, color: '#fff',
          padding: '3px 8px', borderRadius: 4,
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>Rupture</span>
      )}

      {/* Badge quantité en cart, en haut à gauche */}
      {inCart && (
        <span style={{
          position: 'absolute', top: 8, left: 8,
          background: COLORS.teal, color: '#fff',
          minWidth: 24, height: 24, borderRadius: 12,
          padding: '0 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700,
        }}>{qty}</span>
      )}

      {/* Texte + actions en bas, par-dessus l'image */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '12px 14px',
        color: '#fff',
      }}>
        <div style={{
          fontSize: 14, fontWeight: 600, lineHeight: 1.3,
          marginBottom: 8,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textShadow: '0 1px 3px rgba(0,0,0,0.5)',
        }}>{item.nom}</div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            fontSize: 16, fontWeight: 700,
            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
          }}>
            {((item.prix || 0) / 100).toFixed(2)} €
          </span>
          {outOfStock ? (
            <span style={{ fontSize: 11, opacity: 0.8 }}>Indispo.</span>
          ) : qty === 0 ? (
            <button onClick={stop(onAdd)}
              style={{
                background: COLORS.teal, color: '#fff',
                border: 'none', width: 32, height: 32, borderRadius: '50%',
                fontSize: 18, fontWeight: 700, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit',
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
              }}>
              <Plus size={18}/>
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={stop(onRemove)}
                style={{
                  background: 'rgba(255,255,255,0.95)', color: COLORS.marine,
                  border: 'none', width: 30, height: 30, borderRadius: '50%',
                  fontSize: 14, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'inherit',
                }}>
                <Minus size={14}/>
            </button>
            <span style={{
              fontSize: 16, fontWeight: 700, color: '#fff',
              minWidth: 16, textAlign: 'center',
              textShadow: '0 1px 3px rgba(0,0,0,0.5)',
            }}>
              {qty}
            </span>
            <button onClick={stop(onAdd)}
              disabled={typeof item.stock === 'number' && qty >= item.stock}
              style={{
                background: COLORS.teal, color: '#fff',
                border: 'none', width: 30, height: 30, borderRadius: '50%',
                fontSize: 14, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit',
                opacity: (typeof item.stock === 'number' && qty >= item.stock) ? 0.4 : 1,
              }}>
              <Plus size={14}/>
            </button>
          </div>
        )}
      </div>
    </div>
    </div>
  )
}

// ─── Modale d'avertissement d'inactivité ────────────────────────────────
function IdleWarning({ onContinue, secondsLeft }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(0,24,36,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, zIndex: 999,
    }} onClick={onContinue}>
      <div style={{
        background: '#fff', borderRadius: 16,
        padding: '40px 40px 32px',
        maxWidth: 500, width: '100%', textAlign: 'center',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⏱️</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.marine, marginBottom: 8 }}>
          Vous êtes toujours là ?
        </div>
        <div style={{ fontSize: 15, color: COLORS.muted, marginBottom: 8, lineHeight: 1.5 }}>
          Votre session va se fermer automatiquement dans
        </div>
        <div style={{
          fontSize: 40, fontWeight: 800, color: COLORS.red, marginBottom: 24,
        }}>
          {secondsLeft}s
        </div>
        <button onClick={onContinue}
          style={{
            background: COLORS.teal, color: '#fff',
            border: 'none', borderRadius: 12,
            padding: '16px 36px', fontSize: 16, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', width: '100%',
          }}>
          Je continue ma commande
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Écran 4 — Panier (Lot 3)
// ════════════════════════════════════════════════════════════════════
// Récap de la commande, ajustement des quantités, calcul du nouveau solde
// et validation. Utilise le même endpoint creerReservation que l'espace
// spectateur classique : la résa est créée en status='processing' donc
// visible en cuisine immédiatement.
//
// La résa n'est PAS débitée du solde du spectateur ici — c'est fait par
// validerRetrait quand la cuisine remet la commande. Comportement cohérent
// avec l'espace spectateur existant.
function Panier({ spec, cart, setCart, onTimeout, onBack, onTerminate, onConfirmed }) {
  // Items du menu pour récupérer prix/nom (le panier ne stocke que les qty)
  const [menu, setMenu] = useState([])
  // Modale "Vous êtes toujours là ?" (warning d'inactivité)
  const [showWarn, setShowWarn] = useState(false)
  // État submission (évite double-clic + désactive boutons pendant l'appel)
  const [submitting, setSubmitting] = useState(false)
  // Erreur affichée si validation échoue
  const [error, setError] = useState('')

  // Watcher menu pour avoir les détails des articles (prix, nom)
  useEffect(() => {
    const unsub = watchMenu(setMenu)
    return () => unsub && unsub()
  }, [])

  // Inactivité — même règle que sur le menu
  const { idleSec, touchActivity } = useIdleWatcher({
    warnSec: IDLE_WARN_SEC,
    timeoutSec: IDLE_LOGOUT_SEC,
    onWarn: () => setShowWarn(true),
    onTimeout: onTimeout,
    enabled: !submitting, // pas d'auto-déco pendant une validation en cours
  })
  const dismissWarn = () => { touchActivity(); setShowWarn(false) }

  // Items du panier enrichis avec les infos menu
  const cartItems = useMemo(() => {
    return Object.entries(cart).map(([itemId, qty]) => {
      const item = menu.find(m => m.id === itemId)
      if (!item) return null
      return { ...item, qty }
    }).filter(Boolean)
  }, [cart, menu])

  const total = useMemo(() => {
    return cartItems.reduce((s, i) => s + (i.prix || 0) * i.qty, 0)
  }, [cartItems])

  const solde = spec?.solde || 0
  const soldeAfter = solde - total
  const isInsufficient = soldeAfter < 0

  // ─── Helpers panier (mêmes que sur Menu, refactor possible) ──────────
  const updateQty = (itemId, delta) => {
    setCart(prev => {
      const next = { ...prev }
      const current = next[itemId] || 0
      const newQty = Math.max(0, current + delta)
      if (newQty === 0) delete next[itemId]
      else next[itemId] = newQty
      return next
    })
  }
  const removeItem = (itemId) => {
    setCart(prev => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
  }

  // ─── Validation de la commande ───────────────────────────────────────
  // Si plus rien au panier, on ne devrait pas pouvoir cliquer, mais sécurité.
  // Si solde insuffisant, on bloque et on affiche message.
  //
  // ARCHITECTURE — Borne crée maintenant une COMMANDE (collection `commandes`)
  // plutôt qu'une réservation. Conséquence : le solde du client est DÉBITÉ
  // IMMÉDIATEMENT à la validation, comme une commande staff classique. Cohérence
  // avec PrendreCommande, plus de risque de double-commande au-delà du solde,
  // et le terme "réservation" devient cohérent (réservé = client paie à la
  // remise, plus rare).
  const handleConfirm = async () => {
    if (cartItems.length === 0) return
    if (isInsufficient) {
      setError('Solde insuffisant. Veuillez recharger à la caisse.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      // createCommande attend des items avec { id, nom, prixUnit, qty }
      // (prixUnit au lieu de prix — c'est le format des commandes staff)
      const items = cartItems.map(i => ({
        id: i.id,
        nom: i.nom,
        prixUnit: i.prix,      // ← borne stocke en `prix`, on convertit
        qty: i.qty,
        // Type de consommation conservé pour compat menu (ex: sur place/à emporter)
        ...(i.typeConsommation ? { typeConsommation: i.typeConsommation } : {}),
      }))
      // Génère un code court 'BRN-XXX-NNN' côté client. C'est purement
      // informatif (le numero séquentiel reste l'identifiant principal).
      // Le préfixe BRN- permet à un œil avisé d'identifier les commandes borne.
      // Format : BRN- + 3 lettres aléatoires + - + 3 chiffres aléatoires
      const rndLetters = Array.from({length: 3}, () =>
        String.fromCharCode(65 + Math.floor(Math.random() * 26))
      ).join('')
      const rndDigits = String(Math.floor(Math.random() * 900) + 100)
      const borneCode = `BRN-${rndLetters}-${rndDigits}`

      // Création de la commande avec débit immédiat (payNow: true).
      // Source 'borne' permet à la cuisine (et aux audits) de différencier
      // les commandes borne des commandes staff classiques.
      const cmd = await createCommande({
        specId: spec.id,
        specNom: spec.nom,
        items,
        payNow: true,                 // ← débit immédiat du solde
        staff: 'Borne self-service',  // ← traçabilité dans les audits
        code: borneCode,
        source: 'borne',
      })
      // createCommande retourne { id, numero, code }. Pour le ticket, on
      // construit un objet enrichi avec les items et le total déjà calculés
      // côté client (pas besoin de relire Firestore).
      const orderForTicket = {
        ...cmd,
        items: items.map(i => ({
          nom: i.nom, qty: i.qty, prix: i.prixUnit,
        })),
        total,
      }
      // Succès → vide le panier et transmet au ticket de fin
      setCart({})
      onConfirmed(orderForTicket)
    } catch (e) {
      // Cas typiques : "Solde insuffisant (X.XX € disponibles, Y.YY € requis)",
      // "Stock épuisé pour <article>", "Spectateur introuvable"
      console.error('Borne handleConfirm:', e)
      setError(e.message || 'Erreur lors de la validation. Réessayez.')
    } finally {
      setSubmitting(false)
    }
  }

  const secondsLeft = Math.max(0, IDLE_LOGOUT_SEC - idleSec)

  // Si panier vide après une suppression manuelle, on propose un retour
  if (cartItems.length === 0) {
    return (
      <div style={{
        height: '100%', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 40, textAlign: 'center', background: COLORS.bg,
      }}>
        <ShoppingCart size={48} style={{ color: COLORS.muted, marginBottom: 16 }}/>
        <div style={{ fontSize: 22, fontWeight: 600, color: COLORS.marine, marginBottom: 8 }}>
          Votre panier est vide
        </div>
        <div style={{ fontSize: 14, color: COLORS.muted, marginBottom: 32 }}>
          Retournez au menu pour ajouter des articles.
        </div>
        <button onClick={onBack}
          style={{
            background: COLORS.teal, color: '#fff',
            border: 'none', borderRadius: 10, padding: '14px 32px',
            fontSize: 15, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
          ← Retour au menu
        </button>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: COLORS.bg }}>
      {/* En-tête : nom + solde + compteur + bouton terminer (idem Menu) */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr auto auto',
        gap: 16, alignItems: 'center',
        padding: '14px 24px', background: '#fff',
        borderBottom: `0.5px solid ${COLORS.border}`,
      }}>
        <div>
          <div style={{ fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Bonjour
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.marine }}>
            {spec?.nom || '—'}
          </div>
        </div>
        <div style={{ paddingLeft: 20 }}>
          <div style={{ fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Solde
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.green }}>
            {(solde / 100).toFixed(2)} €
          </div>
        </div>
        <div style={{
          background: COLORS.bg,
          padding: '8px 12px', borderRadius: 8,
          border: `0.5px solid ${COLORS.border}`,
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: COLORS.muted,
        }}>
          <Clock size={13}/>
          <span>Déco auto dans</span>
          <span style={{
            fontWeight: 700,
            color: secondsLeft <= 15 ? COLORS.red : COLORS.marine,
          }}>{secondsLeft}s</span>
        </div>
        <button onClick={onTerminate}
          disabled={submitting}
          style={{
            background: 'transparent', color: COLORS.muted,
            border: `0.5px solid ${COLORS.border}`,
            borderRadius: 8, padding: '8px 14px',
            fontSize: 13, fontWeight: 600,
            cursor: submitting ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            opacity: submitting ? 0.5 : 1,
          }}>
          <X size={14}/> Terminer
        </button>
      </div>

      {/* Corps : titre + liste articles + récap solde */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 18,
        }}>
          <button onClick={onBack} disabled={submitting}
            style={{
              background: 'transparent', border: 'none', color: COLORS.muted,
              fontSize: 13, padding: '4px 8px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              opacity: submitting ? 0.5 : 1,
            }}>
            <ArrowLeft size={14}/> Retour au menu
          </button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 700, color: COLORS.marine }}>
            Confirmer la commande
          </div>
          <div style={{ width: 110 }}/>{/* spacer pour centrer le titre */}
        </div>

        {/* Liste articles avec stepper */}
        <div style={{
          background: '#fff', borderRadius: 12,
          border: `0.5px solid ${COLORS.border}`,
          marginBottom: 16, overflow: 'hidden',
        }}>
          {cartItems.map((item, idx) => (
            <div key={item.id} style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto auto',
              gap: 14, alignItems: 'center',
              padding: '14px 16px',
              borderBottom: idx < cartItems.length - 1 ? `0.5px solid ${COLORS.border}` : 'none',
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text, marginBottom: 2 }}>
                  {item.nom}
                </div>
                <div style={{ fontSize: 12, color: COLORS.muted }}>
                  {((item.prix || 0) / 100).toFixed(2)} € / unité
                </div>
              </div>
              {/* Stepper */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                background: COLORS.bg, borderRadius: 8, padding: '4px 8px',
              }}>
                <button onClick={() => updateQty(item.id, -1)}
                  disabled={submitting}
                  style={{
                    background: '#fff', color: COLORS.marine,
                    border: `0.5px solid ${COLORS.marine}`,
                    width: 28, height: 28, borderRadius: '50%',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'inherit',
                  }}>
                  <Minus size={13}/>
                </button>
                <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.marine, minWidth: 20, textAlign: 'center' }}>
                  {item.qty}
                </span>
                <button onClick={() => updateQty(item.id, +1)}
                  disabled={submitting || (typeof item.stock === 'number' && item.qty >= item.stock)}
                  style={{
                    background: COLORS.teal, color: '#fff',
                    border: 'none', width: 28, height: 28, borderRadius: '50%',
                    cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'inherit',
                    opacity: (submitting || (typeof item.stock === 'number' && item.qty >= item.stock)) ? 0.4 : 1,
                  }}>
                  <Plus size={13}/>
                </button>
              </div>
              {/* Total ligne */}
              <div style={{
                minWidth: 80, textAlign: 'right',
                fontSize: 15, fontWeight: 700, color: COLORS.marine,
              }}>
                {((item.prix || 0) * item.qty / 100).toFixed(2)} €
              </div>
              {/* Bouton suppression */}
              <button onClick={() => removeItem(item.id)}
                disabled={submitting}
                title="Retirer l'article"
                style={{
                  background: 'transparent', color: COLORS.muted,
                  border: 'none', padding: 4,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', display: 'flex',
                }}>
                <X size={16}/>
              </button>
            </div>
          ))}
        </div>

        {/* Récap solde */}
        <div style={{
          background: '#fff', borderRadius: 12,
          border: `0.5px solid ${COLORS.border}`,
          padding: '16px 18px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, color: COLORS.muted }}>
            <span>Solde actuel</span>
            <span style={{ fontWeight: 600 }}>{(solde / 100).toFixed(2)} €</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, color: COLORS.coral }}>
            <span>Cette commande</span>
            <span style={{ fontWeight: 600 }}>− {(total / 100).toFixed(2)} €</span>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            paddingTop: 10, marginTop: 6,
            borderTop: `0.5px solid ${COLORS.border}`,
            fontSize: 16,
          }}>
            <span style={{ fontWeight: 600, color: COLORS.text }}>Nouveau solde</span>
            <span style={{
              fontWeight: 700,
              color: isInsufficient ? COLORS.red : COLORS.green,
            }}>
              {(soldeAfter / 100).toFixed(2)} €
            </span>
          </div>
          {isInsufficient && (
            <div style={{
              marginTop: 10, padding: '8px 10px',
              background: '#FCEBEB', color: '#791F1F',
              borderRadius: 6, fontSize: 12,
            }}>
              Solde insuffisant. Réduisez la commande ou rechargez à la caisse.
            </div>
          )}
        </div>

        {/* Erreur de validation */}
        {error && (
          <div style={{
            padding: '12px 16px', marginBottom: 16,
            background: '#FCEBEB', color: '#791F1F',
            border: '0.5px solid #F09595', borderRadius: 8,
            fontSize: 13, lineHeight: 1.4,
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Footer : Annuler / Confirmer */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12,
        padding: '16px 24px',
        background: '#fff',
        borderTop: `0.5px solid ${COLORS.border}`,
      }}>
        <button onClick={onBack} disabled={submitting}
          style={{
            background: 'transparent', color: COLORS.marine,
            border: `0.5px solid ${COLORS.border}`,
            borderRadius: 10, padding: '16px',
            fontSize: 15, fontWeight: 600,
            cursor: submitting ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            opacity: submitting ? 0.5 : 1,
          }}>
          Continuer mes choix
        </button>
        <button onClick={handleConfirm}
          disabled={submitting || isInsufficient || cartItems.length === 0}
          style={{
            background: (submitting || isInsufficient) ? COLORS.border : COLORS.teal,
            color: '#fff', border: 'none',
            borderRadius: 10, padding: '16px',
            fontSize: 16, fontWeight: 700,
            cursor: (submitting || isInsufficient || cartItems.length === 0) ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
          {submitting ? (
            <>
              <RefreshCw size={16} style={{ animation: 'borne-spin 1s linear infinite' }}/>
              Envoi en cours…
            </>
          ) : (
            <>✓ Confirmer · {(total / 100).toFixed(2)} €</>
          )}
        </button>
      </div>

      {/* Modale d'avertissement d'inactivité */}
      {showWarn && <IdleWarning onContinue={dismissWarn} secondsLeft={secondsLeft}/>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Écran 5 — Ticket (Lot 4)
// ════════════════════════════════════════════════════════════════════
// Affiche la confirmation de commande avec :
//   - Numéro de commande en grand (le client le retient pour la cuisine)
//   - Récap des articles commandés
//   - Code court (FY-XXXX-NNN) pour traçabilité
//   - Compte à rebours visuel (cercle SVG qui se remplit) — auto-retour 10s
//   - Bouton "Terminer maintenant" pour skip immédiat
//
// IMPORTANT : pas de timer d'inactivité ici. Le compte à rebours est
// strict, indépendant des interactions. Le seul moyen de prolonger
// l'affichage est de NE PAS cliquer Terminer. Sinon → retour auto.
const TICKET_TIMEOUT_SEC = 10

function Ticket({ resa, onDone, logoUrl }) {
  const [secondsLeft, setSecondsLeft] = useState(TICKET_TIMEOUT_SEC)

  // Décompte simple. Pas d'écoute des interactions — le timer est strict
  // pour éviter qu'une session reste ouverte si le spectateur reste devant.
  useEffect(() => {
    if (secondsLeft <= 0) { onDone(); return }
    const t = setTimeout(() => setSecondsLeft(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [secondsLeft, onDone])

  // Items de la résa (fallback sur tableau vide si la résa est mal formée)
  const items = Array.isArray(resa?.items) ? resa.items : []
  const total = resa?.total || items.reduce((s, i) => s + (i.prix || 0) * (i.qty || 0), 0)

  // Calcul du progrès du cercle (0 → 1)
  const progress = (TICKET_TIMEOUT_SEC - secondsLeft) / TICKET_TIMEOUT_SEC
  // Circonférence d'un cercle de rayon 22 (utilisé dans le SVG)
  const CIRC = 2 * Math.PI * 22

  return (
    <div style={{
      height: '100%', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 30, background: COLORS.bg,
      overflowY: 'auto',
    }}>
      {/* Logo du festival en haut (Lot branding) */}
      {logoUrl && (
        <img src={logoUrl} alt=""
          style={{
            maxHeight: 48, maxWidth: 160,
            marginBottom: 14, objectFit: 'contain',
          }}/>
      )}

      {/* Coche verte avec animation d'apparition */}
      <div style={{
        width: 96, height: 96, background: COLORS.green,
        borderRadius: '50%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 48, marginBottom: 16,
        animation: 'borne-ticket-pop 0.4s ease-out',
      }}>✓</div>

      <div style={{
        fontSize: 26, fontWeight: 700,
        color: COLORS.marine, marginBottom: 4, textAlign: 'center',
      }}>
        Commande envoyée !
      </div>
      <div style={{
        fontSize: 13, color: COLORS.muted, marginBottom: 22,
        textAlign: 'center', maxWidth: 420, lineHeight: 1.5,
      }}>
        Votre numéro sera affiché sur l'écran du stand lorsque votre commande sera prête.
      </div>

      {/* Numéro en grand + code court */}
      <div style={{
        background: '#fff', padding: '20px 48px', borderRadius: 14,
        border: `0.5px solid ${COLORS.border}`,
        marginBottom: 16, textAlign: 'center',
      }}>
        <div style={{
          fontSize: 11, color: COLORS.muted,
          textTransform: 'uppercase', letterSpacing: '0.04em',
          marginBottom: 2,
        }}>Votre numéro</div>
        <div style={{
          fontSize: 64, fontWeight: 800, color: COLORS.coral,
          lineHeight: 1, marginBottom: 4,
        }}>
          #{resa?.numero || '—'}
        </div>
        {resa?.code && (
          <div style={{
            fontSize: 10, color: COLORS.muted,
            fontFamily: 'monospace', letterSpacing: '0.05em',
          }}>
            {resa.code}
          </div>
        )}
      </div>

      {/* Récap articles (compact, max 4 visibles, le reste agrégé) */}
      {items.length > 0 && (
        <div style={{
          background: '#fff', borderRadius: 12,
          border: `0.5px solid ${COLORS.border}`,
          padding: '12px 16px',
          maxWidth: 480, width: '100%',
          marginBottom: 18,
        }}>
          {items.slice(0, 4).map((it, idx) => (
            <div key={idx} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '4px 0',
              fontSize: 13, color: COLORS.text,
              borderBottom: idx < Math.min(items.length, 4) - 1
                ? `0.5px solid ${COLORS.border}`
                : 'none',
            }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.qty > 1 ? `${it.qty}× ` : ''}{it.nom}
              </span>
              <span style={{ color: COLORS.muted, marginLeft: 12, flexShrink: 0 }}>
                {((it.prix || 0) * (it.qty || 0) / 100).toFixed(2)} €
              </span>
            </div>
          ))}
          {items.length > 4 && (
            <div style={{
              padding: '4px 0', fontSize: 12,
              color: COLORS.muted, fontStyle: 'italic',
              borderBottom: `0.5px solid ${COLORS.border}`,
            }}>
              + {items.length - 4} autre{items.length - 4 > 1 ? 's' : ''} article{items.length - 4 > 1 ? 's' : ''}
            </div>
          )}
          {/* Total */}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '8px 0 2px',
            marginTop: 4, borderTop: `0.5px solid ${COLORS.border}`,
            fontSize: 14, fontWeight: 700, color: COLORS.marine,
          }}>
            <span>Total</span>
            <span>{(total / 100).toFixed(2)} €</span>
          </div>
        </div>
      )}

      {/* Compte à rebours visuel : cercle SVG */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        marginBottom: 16, color: COLORS.muted, fontSize: 13,
      }}>
        <svg width="56" height="56" viewBox="0 0 56 56" style={{ flexShrink: 0 }}>
          {/* Anneau gris de fond */}
          <circle cx="28" cy="28" r="22"
            fill="none" stroke={COLORS.border} strokeWidth="4"/>
          {/* Anneau coral qui se remplit (rotation -90° pour commencer en haut) */}
          <circle cx="28" cy="28" r="22"
            fill="none" stroke={COLORS.coral} strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - progress)}
            style={{
              transform: 'rotate(-90deg)',
              transformOrigin: '28px 28px',
              transition: 'stroke-dashoffset 1s linear',
            }}/>
          {/* Compteur au centre */}
          <text x="28" y="34" textAnchor="middle"
            fontSize="18" fontWeight="700"
            fill={COLORS.marine}>
            {secondsLeft}
          </text>
        </svg>
        <div>
          <div style={{ fontWeight: 600, color: COLORS.text }}>
            Retour automatique
          </div>
          <div style={{ fontSize: 11 }}>
            La borne sera libérée dans {secondsLeft} seconde{secondsLeft > 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Bouton terminer immédiat */}
      <button onClick={onDone}
        style={{
          background: COLORS.marine, color: '#fff',
          border: 'none', borderRadius: 10, padding: '14px 36px',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'inherit',
        }}>
        Terminer maintenant
      </button>

      <style>{`
        @keyframes borne-ticket-pop {
          0% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
