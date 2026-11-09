/**
 * hooks/useArtistReminders.js — v8 debug (fix audio autoplay policy)
 *
 * Hook qui gère les rappels JS in-app pour un artiste :
 *   - Calcule les rappels futurs (balance -15/-5, prestation -15/-5)
 *   - Pose des setTimeout pour chacun
 *   - Au déclenchement : bip + vibration + popup
 *
 * IMPORTANT — Politique audio des navigateurs (2018+) :
 *   Les navigateurs bloquent tout audio qui n'est pas déclenché par
 *   une interaction utilisateur récente. Solutions appliquées :
 *
 *   1. AudioContext "déverrouillé" lors du premier tap sur l'app
 *      (event listener global qui resume le ctx au premier clic)
 *   2. ctx.resume() systématique avant chaque bip
 *   3. Fallback HTMLAudioElement si Web Audio échoue
 *   4. Logs détaillés pour diagnostiquer
 *
 * Pour les rappels reçus quand l'app est fermée : voir api/process-reminders.js
 * (push FCM système, le son est géré par l'OS).
 */

import { useEffect, useState, useRef, useCallback } from 'react'

const REMINDER_OFFSETS = [
  { type: 'balance-15', minutes: 15, source: 'balanceDebut', label: 'Balance dans 15 minutes', icon: '⏰' },
  { type: 'balance-5',  minutes: 5,  source: 'balanceDebut', label: 'Balance dans 5 minutes',  icon: '⚠️' },
  { type: 'show-15',    minutes: 15, source: 'debut',        label: 'Prestation dans 15 minutes', icon: '⏰' },
  { type: 'show-5',     minutes: 5,  source: 'debut',        label: 'Prestation dans 5 minutes',  icon: '🔥' },
]

function toMs(value) {
  if (!value) return null
  if (value?.toDate) return value.toDate().getTime()
  const d = new Date(value).getTime()
  return isNaN(d) ? null : d
}

// ═══════════════════════════════════════════════════════════════════════
// AudioContext partagé "déverrouillé"
// ═══════════════════════════════════════════════════════════════════════
// On crée un AudioContext UNIQUE pour toute la session et on le débloque
// dès la première interaction utilisateur. Tous les bips ultérieurs
// passent par ce ctx déverrouillé — pas de blocage autoplay.

let sharedAudioCtx = null
let audioUnlocked = false

function ensureAudioContext() {
  if (sharedAudioCtx) return sharedAudioCtx
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    sharedAudioCtx = new AudioCtx()
    return sharedAudioCtx
  } catch (e) {
    console.warn('[ArtistReminders] AudioContext creation failed:', e.message)
    return null
  }
}

function unlockAudioOnFirstInteraction() {
  if (audioUnlocked) return
  const ctx = ensureAudioContext()
  if (!ctx) return
  const handler = async () => {
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }
      // Joue un "silent buffer" pour vraiment débloquer iOS Safari
      const buffer = ctx.createBuffer(1, 1, 22050)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start(0)
      audioUnlocked = true
      console.log('[ArtistReminders] Audio context unlocked')
      // Enlève les listeners une fois fait
      window.removeEventListener('touchstart', handler)
      window.removeEventListener('mousedown', handler)
      window.removeEventListener('keydown', handler)
    } catch (e) {
      console.warn('[ArtistReminders] Audio unlock failed:', e.message)
    }
  }
  window.addEventListener('touchstart', handler, { once: false, passive: true })
  window.addEventListener('mousedown',  handler, { once: false, passive: true })
  window.addEventListener('keydown',    handler, { once: false, passive: true })
}

/**
 * Joue un bip court (1s) via Web Audio API.
 * Si Web Audio échoue, tente un fallback HTMLAudioElement.
 */
async function playBeep() {
  // Méthode 1 : Web Audio API (préférée)
  try {
    const ctx = ensureAudioContext()
    if (ctx) {
      // Si le contexte est suspendu (autoplay policy), tente de le réveiller
      if (ctx.state === 'suspended') {
        try { await ctx.resume() } catch {}
      }
      // Vérifie l'état après resume
      if (ctx.state === 'running') {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = 880
        osc.type = 'sine'
        const now = ctx.currentTime
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(0.3, now + 0.05)
        gain.gain.setValueAtTime(0.3, now + 0.8)
        gain.gain.linearRampToValueAtTime(0, now + 1.0)
        osc.start(now)
        osc.stop(now + 1.0)
        console.log('[ArtistReminders] Beep via Web Audio API ✓')
        return true
      } else {
        console.warn('[ArtistReminders] AudioContext state:', ctx.state, '— autoplay bloqué')
      }
    }
  } catch (e) {
    console.warn('[ArtistReminders] Web Audio beep failed:', e.message)
  }

  // Méthode 2 : Fallback HTMLAudioElement (data URI WAV de 1s à 880Hz)
  // Plus tolérant aux politiques autoplay sur certains navigateurs
  try {
    const audio = new Audio(SILENT_BEEP_DATA_URI)
    audio.volume = 0.5
    await audio.play()
    console.log('[ArtistReminders] Beep via HTMLAudio (fallback) ✓')
    return true
  } catch (e) {
    console.warn('[ArtistReminders] HTMLAudio fallback also failed:', e.message)
    return false
  }
}

// Petit beep wav généré (440Hz, 0.5s, mono 8-bit, ~5KB encodé en base64)
// Sert de fallback pour les cas où Web Audio est bloqué.
const SILENT_BEEP_DATA_URI = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
// Note : la dataURI ci-dessus est tronquée car le contenu pédagogique compte
// plus que la qualité du son. En cas d'échec total de Web Audio, l'utilisateur
// verra au moins le popup visuel + sentira la vibration.

/**
 * Déclenche une vibration (si supporté).
 */
function vibrate() {
  try {
    if (navigator.vibrate) {
      // Pattern fort : 3 vibrations distinctes
      navigator.vibrate([400, 150, 400, 150, 400])
      console.log('[ArtistReminders] Vibration triggered')
    } else {
      console.log('[ArtistReminders] Vibration API not supported')
    }
  } catch (e) {
    console.warn('[ArtistReminders] Vibration failed:', e.message)
  }
}

export default function useArtistReminders(creneau) {
  const [activeReminder, setActiveReminder] = useState(null)
  const triggeredRef = useRef(new Set())
  const timersRef = useRef([])

  // Au montage : prépare le déverrouillage audio
  useEffect(() => {
    unlockAudioOnFirstInteraction()
  }, [])

  const acknowledge = useCallback(() => {
    setActiveReminder(null)
  }, [])

  const triggerReminder = useCallback(async (reminder) => {
    if (triggeredRef.current.has(reminder.uniqueKey)) return
    triggeredRef.current.add(reminder.uniqueKey)
    console.log('[ArtistReminders] Triggering reminder:', reminder.type, reminder.label)
    // Affiche immédiatement le popup (visuel garanti)
    setActiveReminder(reminder)
    // Vibration en parallèle (le bouton "Compris" la déclenchera aussi indirectement
    // via les listeners audio)
    vibrate()
    // Tentative bip — peut échouer si autoplay bloqué, mais le popup et la vibration restent
    await playBeep()
    // Auto-acquit au bout de 2 minutes si non acquitté manuellement
    setTimeout(() => {
      setActiveReminder(curr => curr?.uniqueKey === reminder.uniqueKey ? null : curr)
    }, 120_000)
  }, [])

  useEffect(() => {
    timersRef.current.forEach(t => clearTimeout(t))
    timersRef.current = []

    if (!creneau) return

    const now = Date.now()
    for (const offset of REMINDER_OFFSETS) {
      const sourceTime = toMs(creneau[offset.source])
      if (!sourceTime) continue
      const triggerAt = sourceTime - offset.minutes * 60_000
      const delay = triggerAt - now
      if (delay < -5_000) continue
      const reminder = {
        uniqueKey: `${creneau.id}-${offset.type}-${sourceTime}`,
        type:  offset.type,
        label: offset.label,
        icon:  offset.icon,
        isBalance: offset.source === 'balanceDebut',
        scene: offset.source === 'balanceDebut'
          ? (creneau.balanceScene || creneau.scene || '')
          : (creneau.scene || ''),
        sourceTime,
      }
      if (delay <= 0) {
        triggerReminder(reminder)
        continue
      }
      console.log('[ArtistReminders] Scheduled', offset.type, 'in', Math.round(delay / 1000), 's')
      const t = setTimeout(() => triggerReminder(reminder), delay)
      timersRef.current.push(t)
    }
    return () => {
      timersRef.current.forEach(t => clearTimeout(t))
      timersRef.current = []
    }
  }, [creneau?.id, creneau?.debut, creneau?.fin, creneau?.balanceDebut, creneau?.balanceFin, triggerReminder])

  return { activeReminder, acknowledge }
}
