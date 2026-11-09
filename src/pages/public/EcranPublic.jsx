/**
 * EcranPublic.jsx — Affichage public des commandes prêtes
 *
 * Page publique sans login, destinée à un grand écran/TV à côté du stand.
 * Affiche les numéros de commandes/résas marquées prêtes, en gros, animés
 * discrètement. Permet aux clients de voir quand leur numéro est appelé.
 *
 * Accès : /ecran?ev=<eventId>
 *
 * Fonctionnement :
 *   - Watch en temps réel des collections commandes + reservations
 *   - Filtre status === 'ready'
 *   - Affichage grille de numéros (responsive selon taille écran)
 *   - Pulsation discrète sur les numéros
 *   - Quand une commande passe en 'collected' (cuisine clique 'remis'),
 *     elle disparaît automatiquement de la grille
 *   - Aucune interaction utilisateur — c'est un écran d'affichage pur
 *
 * Sécurité :
 *   - Lecture seule, aucun bouton, aucune saisie possible
 *   - Pas de localStorage, pas de session
 */
import React, { useState, useEffect, useMemo, useRef } from 'react'
import { onSnapshot, collection, query, where, doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { getSettings } from '../../firebase/service'
import { Maximize2 } from 'lucide-react'
import useKioskMode from '../../hooks/useKioskMode'

// ─── Helpers couleur ────────────────────────────────────────────────────
// Identiques à ceux de Borne.jsx — duplication assumée pour éviter une
// dépendance circulaire (les pages publiques restent autonomes).
const hex2rgb = (hex) => {
  const h = (hex || '#003048').replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const n = parseInt(full, 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgb2hex = ([r, g, b]) => {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return '#' + c(r) + c(g) + c(b)
}
const darken = (hex, factor) => {
  const [r, g, b] = hex2rgb(hex)
  return rgb2hex([r * (1 - factor), g * (1 - factor), b * (1 - factor)])
}
const textOnBg = (hex) => {
  const [r, g, b] = hex2rgb(hex)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.55 ? '#000' : '#fff'
}

// Couleurs identité par défaut — sera remplacé dynamiquement par
// la couleur du festival (settings.brandColor) au chargement.
const DEFAULT_COLORS = {
  marine:     '#003048',
  marineDark: '#001a25',
  teal:       '#009090',
  coral:      '#F07848',
  green:      '#1D9E75',
  white:      '#fff',
}

export default function EcranPublic() {
  // Liste des items prêts (résa + commande fusionnés)
  const [readyItems, setReadyItems] = useState([])
  // Liste des items détectés comme "nouveaux" pour l'animation d'entrée.
  // Un Set des IDs récemment apparus — on enlève après 2s.
  const [newIds, setNewIds] = useState(new Set())
  // Nom de l'événement (récupéré depuis events/{eventId}.nom)
  const [eventName, setEventName] = useState('')
  // Horloge
  const [now, setNow] = useState(new Date())
  // État eventId valide
  const [eventReady, setEventReady] = useState(false)
  const [eventId, setEventId] = useState(null)
  // Branding dynamique chargé depuis settings (logo + couleur festival)
  const [COLORS, setColors] = useState(DEFAULT_COLORS)
  const [logoUrl, setLogoUrl] = useState('')

  // Mode borne : fullscreen + paysage + wake lock (cf. hook réutilisable)
  // Sur un écran public TV/borne, le wake lock évite l'extinction.
  const kiosk = useKioskMode({ orientation: 'landscape' })

  // ─── Initialisation depuis l'URL ────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ev = params.get('ev')
    if (!ev) return
    setEventId(ev)
    setEventReady(true)
    // Récupère le nom de l'événement (one-shot, pas besoin de watch)
    getDoc(doc(db, 'events', ev)).then(snap => {
      if (snap.exists()) setEventName(snap.data().nom || '')
    }).catch(() => {})
    // Récupère le branding du festival (logo + couleur)
    getSettings(ev).then(s => {
      if (s?.brandColor) {
        const brand = s.brandColor
        setColors({
          marine:     brand,                     // accent principal
          marineDark: darken(brand, 0.6),        // fond très sombre (gradient haut)
          teal:       brand,
          coral:      '#F07848',
          green:      '#1D9E75',
          white:      textOnBg(brand) === '#fff' ? '#fff' : brand,
        })
      }
      if (s?.logoDataUrl) setLogoUrl(s.logoDataUrl)
    }).catch(() => {})
  }, [])

  // ─── Watchers temps réel sur résas + commandes ──────────────────────
  // On utilise `where status == 'ready'` directement pour limiter le trafic
  // (le doc n'est lu que quand il passe en ready, et plus quand il est collected)
  useEffect(() => {
    if (!eventId) return
    const seen = new Set() // IDs déjà vus (pour ne pas animer au montage)
    let initialReady = false

    const handleResas = (snap) => {
      const items = snap.docs.map(d => ({
        ...d.data(), id: d.id, _kind: 'resa',
      }))
      handleUpdate(items, 'resa')
    }
    const handleCmds = (snap) => {
      const items = snap.docs.map(d => ({
        ...d.data(), id: d.id, _kind: 'cmd',
      }))
      handleUpdate(items, 'cmd')
    }
    const handleUpdate = (newItems, kind) => {
      setReadyItems(prev => {
        // Garde les items de l'autre type, remplace ceux du type courant
        const others = prev.filter(x => x._kind !== kind)
        const merged = [...others, ...newItems]
        // Détection des nouveaux (pour animation d'entrée) — uniquement après
        // le premier chargement, pour ne pas animer tous les items au montage
        if (initialReady) {
          const freshIds = newItems
            .filter(it => !seen.has(it.id))
            .map(it => it.id)
          if (freshIds.length > 0) {
            setNewIds(curr => {
              const next = new Set(curr)
              freshIds.forEach(id => next.add(id))
              return next
            })
            // Retire l'animation après 2s
            setTimeout(() => {
              setNewIds(curr => {
                const next = new Set(curr)
                freshIds.forEach(id => next.delete(id))
                return next
              })
            }, 2000)
          }
        }
        newItems.forEach(it => seen.add(it.id))
        return merged
      })
    }

    // Sub réservations status == ready
    const unsubR = onSnapshot(
      query(collection(db, 'events', eventId, 'reservations'),
        where('status', '==', 'ready')),
      handleResas
    )
    // Sub commandes status == ready
    const unsubC = onSnapshot(
      query(collection(db, 'events', eventId, 'commandes'),
        where('status', '==', 'ready')),
      handleCmds
    )
    // Après ~800ms on considère que le chargement initial est fini.
    // Les éventuels nouveaux items après ce délai seront animés.
    const t = setTimeout(() => { initialReady = true }, 800)

    return () => {
      unsubR && unsubR()
      unsubC && unsubC()
      clearTimeout(t)
    }
  }, [eventId])

  // ─── Horloge (mise à jour chaque minute, suffit) ─────────────────────
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  // ─── Tri des items prêts (par numéro croissant) ──────────────────────
  // On affiche du plus petit au plus grand pour stabilité visuelle.
  //
  // FALLBACK NUMÉRO : certaines résas n'ont pas reçu de `numero` séquentiel
  // à la création (legacy, ou workflow particulier). Plutôt que d'afficher
  // le code court (peu compréhensible publiquement), on calcule un numéro
  // d'affichage à partir du rang chronologique de l'item parmi les
  // résas+commandes du même jour. Même logique que la cuisine.
  const sortedReady = useMemo(() => {
    // Helper local : extrait la clé "jour" depuis createdAt
    const getTs = (item) => {
      const t = item.createdAt
      if (!t) return null
      if (t.toDate)   return t.toDate().getTime()
      if (t.seconds)  return t.seconds * 1000
      if (t instanceof Date) return t.getTime()
      if (typeof t === 'string') return new Date(t).getTime()
      if (typeof t === 'number') return t
      return null
    }
    const dayKey = (item) => {
      const ts = getTs(item)
      if (!ts) return 'unknown'
      const d = new Date(ts)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    // Regroupe par jour pour calculer les numéros manquants
    const byDay = new Map()
    for (const it of readyItems) {
      const key = dayKey(it)
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key).push(it)
    }
    // Pour chaque jour, attribuer les numéros manquants
    const enriched = []
    for (const [, items] of byDay) {
      const sorted = items.slice().sort((a, b) => (getTs(a) || 0) - (getTs(b) || 0))
      const used = new Set()
      sorted.forEach(it => {
        if (typeof it.numero === 'number' && it.numero > 0) used.add(it.numero)
      })
      let nextFree = 1
      const findNextFree = () => {
        while (used.has(nextFree)) nextFree++
        used.add(nextFree)
        return nextFree++
      }
      for (const it of sorted) {
        const num = (typeof it.numero === 'number' && it.numero > 0)
          ? it.numero
          : findNextFree()
        enriched.push({ ...it, _displayNumero: num })
      }
    }
    // Tri final par _displayNumero croissant pour stabilité visuelle
    return enriched.sort((a, b) => a._displayNumero - b._displayNumero)
  }, [readyItems])

  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  // ─── Défilement automatique vertical (yo-yo) ─────────────────────────
  // Quand la grille des numéros prêts dépasse la hauteur visible (cas où il
  // y a beaucoup de commandes prêtes en même temps), on déclenche un scroll
  // automatique en va-et-vient :
  //   - 2s de pause en haut
  //   - descente lente jusqu'en bas
  //   - 2s de pause en bas
  //   - remontée lente jusqu'en haut
  //   - boucle infinie tant que le contenu déborde
  //
  // Si le contenu redevient assez petit pour tenir, on stoppe et on remet
  // le scroll en haut. Toute interaction tactile ne stoppe pas le défilement
  // (l'écran public est non-interactif par design).
  const scrollContainerRef = useRef(null)
  // L'état `needsScroll` permet d'éviter le code de défilement quand pas utile.
  const [needsScroll, setNeedsScroll] = useState(false)

  // Détecte si le contenu déborde — re-évalué à chaque changement de la grille,
  // de la liste, et au resize de la fenêtre.
  useEffect(() => {
    const checkOverflow = () => {
      const el = scrollContainerRef.current
      if (!el) return
      // Marge de 8px pour ne pas activer le scroll pour un débordement minuscule
      // (issu d'arrondi de calcul ou de rendu de bordure)
      const overflow = el.scrollHeight - el.clientHeight > 8
      setNeedsScroll(prev => prev !== overflow ? overflow : prev)
      if (!overflow) el.scrollTop = 0
    }
    // Premier check après un cycle de render (le DOM est à jour)
    const t = setTimeout(checkOverflow, 50)
    window.addEventListener('resize', checkOverflow)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', checkOverflow)
    }
  }, [sortedReady])

  // Boucle de défilement automatique. S'active uniquement quand needsScroll
  // est true. Utilise un timer + requestAnimationFrame pour la fluidité.
  useEffect(() => {
    if (!needsScroll) return
    const el = scrollContainerRef.current
    if (!el) return

    // Vitesse de défilement : ~30px par seconde de base, légèrement plus
    // rapide si beaucoup de contenu (pour faire un cycle complet en temps
    // raisonnable). Avec 12 commandes ça fait ~20-30s par cycle.
    const PIXELS_PER_SECOND = 25
    // Pause à chaque extrémité (haut/bas) en ms
    const PAUSE_MS = 2500

    let direction = 1  // 1 = descend, -1 = remonte
    let lastTime = performance.now()
    let pausedUntil = lastTime + PAUSE_MS  // démarre par une pause en haut
    let rafId = null

    const step = (now) => {
      const dt = now - lastTime
      lastTime = now

      // Si on est en pause, on attend
      if (now < pausedUntil) {
        rafId = requestAnimationFrame(step)
        return
      }

      // Calcule la nouvelle position de scroll
      const maxScroll = el.scrollHeight - el.clientHeight
      // Si plus de débordement entre-temps (commandes retirées), on stoppe
      if (maxScroll <= 8) {
        el.scrollTop = 0
        return
      }
      const delta = (PIXELS_PER_SECOND * dt) / 1000
      el.scrollTop += direction * delta

      // Atteint le bas ?
      if (el.scrollTop >= maxScroll) {
        el.scrollTop = maxScroll
        direction = -1
        pausedUntil = now + PAUSE_MS
      }
      // Atteint le haut ?
      else if (el.scrollTop <= 0) {
        el.scrollTop = 0
        direction = 1
        pausedUntil = now + PAUSE_MS
      }

      rafId = requestAnimationFrame(step)
    }

    rafId = requestAnimationFrame(step)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [needsScroll])

  // ─── Erreur configuration ────────────────────────────────────────────
  if (!eventReady) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: COLORS.marineDark, color: COLORS.white,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 40, textAlign: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div>
          <div style={{ fontSize: 64, marginBottom: 20 }}>⚠️</div>
          <div style={{ fontSize: 28, fontWeight: 600, marginBottom: 12 }}>
            Écran non configuré
          </div>
          <div style={{ fontSize: 16, opacity: 0.6, marginBottom: 20 }}>
            Paramètre ?ev=&lt;eventId&gt; manquant dans l'URL.
          </div>
          <div style={{ fontSize: 13, opacity: 0.4, fontFamily: 'monospace' }}>
            URL attendue : /ecran?ev=&lt;eventId&gt;
          </div>
        </div>
      </div>
    )
  }

  // ─── Layout principal ────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: `linear-gradient(180deg, ${COLORS.marineDark} 0%, ${COLORS.marine} 100%)`,
      color: COLORS.white,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex', flexDirection: 'column',
      userSelect: 'none', WebkitUserSelect: 'none',
      overflow: 'hidden',
    }}>
      {/* En-tête discret */}
      <header style={{
        padding: '16px 32px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '0.5px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Logo du festival si configuré (settings.logoDataUrl) */}
          {logoUrl && (
            <img src={logoUrl} alt=""
              style={{
                height: 36, maxWidth: 120, objectFit: 'contain',
              }}/>
          )}
          <span style={{
            fontSize: 13, color: 'rgba(255,255,255,0.5)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>Maison Ylla</span>
          {eventName && (
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
              · {eventName}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Bouton "Mode borne" discret — visible uniquement quand non actif.
              Sur un écran public, l'admin l'active une fois au démarrage. */}
          {!kiosk.active && (
            <button
              onClick={kiosk.activate}
              style={{
                padding: '6px 12px', borderRadius: 6,
                background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)',
                border: '0.5px solid rgba(255,255,255,0.2)',
                fontSize: 12, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 5,
                WebkitTapHighlightColor: 'transparent',
              }}>
              <Maximize2 size={12}/> Mode borne
            </button>
          )}
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>
            {timeStr}
          </div>
        </div>
      </header>

      {/* Titre */}
      <div style={{
        textAlign: 'center', padding: '24px 24px 8px',
      }}>
        <div style={{
          fontSize: 14, color: 'rgba(255,255,255,0.5)',
          textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8,
        }}>
          Commandes prêtes à retirer
        </div>
        <div style={{
          fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 700,
          color: COLORS.white, lineHeight: 1,
        }}>
          Présentez-vous au stand
        </div>
      </div>

      {/* Zone centrale : grille de numéros prêts.
          - Si peu d'items qui tiennent → centré verticalement (esthétique)
          - Si débordement → alignement haut + scroll automatique en yo-yo
          Le `ref` permet à l'effet de défilement de manipuler scrollTop. */}
      <div
        ref={scrollContainerRef}
        data-ecran-scroll
        style={{
          flex: 1, padding: '24px 32px',
          display: 'flex',
          // Centrage vertical uniquement quand pas de débordement, sinon
          // on aligne en haut pour que le scroll auto puisse fonctionner
          // sans que le contenu soit coupé en haut.
          alignItems: needsScroll ? 'flex-start' : 'center',
          justifyContent: 'center',
          overflowY: 'auto',
          // Masque la scrollbar (pas pertinente sur un écran non-interactif)
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}>
        {/* Cache aussi la scrollbar WebKit */}
        <style>{`
          [data-ecran-scroll]::-webkit-scrollbar { display: none; width: 0; height: 0; }
        `}</style>
        {sortedReady.length === 0 ? (
          <EmptyState/>
        ) : (
          <div style={{
            display: 'grid',
            // Adapte la largeur min des cards selon le nombre d'items :
            // - peu d'items (1-4) → cards larges (320px+) → numéros bien visibles
            // - beaucoup d'items (5+) → cards plus serrées mais lisibles (220px)
            gridTemplateColumns: sortedReady.length <= 4
              ? 'repeat(auto-fit, minmax(280px, 1fr))'
              : 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 20,
            width: '100%',
            maxWidth: 1600,
          }}>
            {sortedReady.map(item => (
              <NumeroCard key={item.id} item={item} isNew={newIds.has(item.id)}/>
            ))}
          </div>
        )}
      </div>

      {/* Footer discret */}
      <footer style={{
        padding: '12px 32px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 12, color: 'rgba(255,255,255,0.3)',
        borderTop: '0.5px solid rgba(255,255,255,0.08)',
      }}>
        <span>
          {sortedReady.length === 0
            ? 'Aucune commande prête pour le moment'
            : `${sortedReady.length} commande${sortedReady.length > 1 ? 's' : ''} prête${sortedReady.length > 1 ? 's' : ''}`}
          {needsScroll && ' · défilement automatique'}
        </span>
        <span>Mise à jour automatique</span>
      </footer>

      {/* Styles globaux (animation de pulsation + d'entrée) */}
      <style>{`
        @keyframes ecran-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        @keyframes ecran-enter {
          0%   { transform: scale(0.5); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Carte d'un numéro prêt
// ════════════════════════════════════════════════════════════════════
// Affiche le numéro en très gros. Pulsation discrète permanente.
// Quand `isNew=true`, animation d'entrée par-dessus.
function NumeroCard({ item, isNew }) {
  // Priorité : _displayNumero (calculé chronologiquement) > numero (séquentiel
  // attribué à la création) > '?' (fallback dernier recours).
  // Le code court (FY-XXXX) n'est PLUS utilisé comme fallback car peu lisible.
  const numero = item._displayNumero || item.numero || '?'
  // Longueur du numéro affiché (sans le #) — utilisée pour calibrer la taille.
  // À 1-2 chiffres on peut faire très gros, à 3+ il faut réduire pour rester
  // dans la card. cqfont() retourne une taille en clamp basée sur cette longueur.
  const numLen = String(numero).length
  const fontSize = numLen <= 2
    ? 'clamp(64px, 7vw, 110px)'
    : numLen === 3
      ? 'clamp(48px, 5.5vw, 88px)'
      : 'clamp(36px, 4.5vw, 72px)'

  return (
    <div style={{
      background: 'rgba(255,255,255,0.06)',
      border: '0.5px solid rgba(255,255,255,0.15)',
      borderRadius: 16,
      padding: '20px 12px 24px',
      textAlign: 'center',
      // Limites strictes pour empêcher le débordement
      minWidth: 0,
      overflow: 'hidden',
      animation: isNew
        ? 'ecran-enter 0.6s ease-out, ecran-pulse 2.5s ease-in-out 0.6s infinite'
        : 'ecran-pulse 2.5s ease-in-out infinite',
    }}>
      {/* Label "PRÊT" en petit au-dessus */}
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.15em',
        color: '#1D9E75',
        textTransform: 'uppercase',
        marginBottom: 6,
      }}>
        ● Prêt
      </div>
      {/* Le numéro — taille adaptée à sa longueur pour ne pas déborder.
          line-height resserré pour éviter d'étirer la card verticalement. */}
      <div style={{
        fontSize,
        fontWeight: 800,
        lineHeight: 1,
        color: '#fff',
        fontVariantNumeric: 'tabular-nums',
        // Sécurité supplémentaire : si malgré tout ça dépasse on coupe
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}>
        #{numero}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// État vide (aucune commande prête)
// ════════════════════════════════════════════════════════════════════
function EmptyState() {
  return (
    <div style={{
      textAlign: 'center', opacity: 0.4,
    }}>
      <div style={{
        fontSize: 'clamp(48px, 8vw, 96px)',
        marginBottom: 16, lineHeight: 1,
      }}>⏳</div>
      <div style={{
        fontSize: 'clamp(18px, 2.5vw, 28px)',
        fontWeight: 600,
        color: 'rgba(255,255,255,0.7)',
      }}>
        Aucune commande prête pour le moment
      </div>
      <div style={{
        fontSize: 'clamp(13px, 1.5vw, 16px)',
        color: 'rgba(255,255,255,0.4)',
        marginTop: 8,
      }}>
        Les numéros apparaîtront ici dès que la cuisine les marquera prêts
      </div>
    </div>
  )
}
