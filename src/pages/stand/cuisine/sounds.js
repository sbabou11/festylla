/**
 * pages/stand/cuisine/sounds.js — sons de la cuisine (Web Audio API), inchangés depuis la production
 *   - playBip()     : bip discret pour notification nouvelle commande
 *   - playBeep2()   : double bip = niveau 1 (5-10 min, orange)
 *   - playSiren()   : sirène 3 notes = niveau 2 (10-15 min, rouge)
 *   - playAlarm()   : alarme stridente = niveau 3 (>15 min, panique)
 * Toutes utilisent un AudioContext partagé (initialisé après 1ère interaction).
 */
let _audioCtx = null
function _getCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (_audioCtx.state === 'suspended') _audioCtx.resume()
  return _audioCtx
}

// Joue une note via oscillateur, durée d, gain g, freq f, type t
function _playNote(ctx, freq, duration, gain = 0.15, type = 'sine', startOffset = 0) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.value = gain
  osc.connect(g)
  g.connect(ctx.destination)
  const t0 = ctx.currentTime + startOffset
  osc.start(t0)
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
  osc.stop(t0 + duration + 0.02)
}

// Bip discret — nouvelle commande
export function playBip() {
  try {
    const ctx = _getCtx()
    _playNote(ctx, 880, 0.18, 0.10, 'sine', 0)
  } catch {}
}

// Niveau 1 — Double bip insistant (orange, 5-10 min)
export function playBeep2() {
  try {
    const ctx = _getCtx()
    _playNote(ctx, 1000, 0.12, 0.20, 'square', 0)
    _playNote(ctx, 1400, 0.12, 0.20, 'square', 0.15)
  } catch {}
}

// Niveau 2 — Sirène 3 notes (rouge, 10-15 min)
export function playSiren() {
  try {
    const ctx = _getCtx()
    _playNote(ctx, 1200, 0.20, 0.25, 'square', 0.00)
    _playNote(ctx, 1600, 0.20, 0.25, 'square', 0.22)
    _playNote(ctx, 1200, 0.20, 0.25, 'square', 0.44)
  } catch {}
}

// Niveau 3 — Alarme stridente (>15 min, panique)
// Combinaison de 2 oscillateurs en sawtooth + montée de fréquence pour effet "alerte"
export function playAlarm() {
  try {
    const ctx = _getCtx()
    // 4 notes alternées hautes/basses rapidement répétées
    for (let i = 0; i < 4; i++) {
      _playNote(ctx, 1800, 0.10, 0.30, 'sawtooth', i * 0.13)
      _playNote(ctx, 1400, 0.10, 0.30, 'sawtooth', i * 0.13 + 0.06)
    }
  } catch {}
}
