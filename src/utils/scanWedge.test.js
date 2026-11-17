import { describe, it, expect, vi } from 'vitest'
import { createWedge, parseSpectatorCode, usCharFromCode } from './scanWedge'

// Simule un lecteur qui tape `text` : un keydown tous les `gap` ms, puis Entrée
function type(wedge, keys, clock, gap = 8) {
  for (const k of keys) { clock.t += gap; wedge.feed(k) }
  clock.t += gap
  return wedge.feed({ key: 'Enter', code: 'Enter' })
}
const us = (text) => [...text].map(ch => {
  const up = /[A-Z]/.test(ch), shiftDigits = ')!@#$%^&*('
  if (/[a-z]/i.test(ch)) return { key: ch, code: `Key${ch.toUpperCase()}`, shiftKey: up }
  if (/[0-9]/.test(ch)) return { key: ch, code: `Digit${ch}`, shiftKey: false }
  const map = { '-': ['Minus', false], '/': ['Slash', false], ':': ['Semicolon', true], '.': ['Period', false], '?': ['Slash', true], '=': ['Equal', false], '&': ['Digit7', true] }
  const [code, shiftKey] = map[ch]
  return { key: ch, code, shiftKey }
})

describe('lecteur de QR en mode clavier', () => {
  it('reconnaît un code spectateur tapé par le lecteur', () => {
    const clock = { t: 0 }, onScan = vi.fn()
    const w = createWedge({ onScan, now: () => clock.t })
    type(w, us('FY-4A2B'), clock)
    expect(onScan).toHaveBeenCalledWith('FY-4A2B')
  })

  it('extrait le code d\'un lien complet', () => {
    const clock = { t: 0 }, onScan = vi.fn()
    const w = createWedge({ onScan, now: () => clock.t })
    type(w, us('https://festylla.vercel.app/solde?id=FY-K7MX'), clock)
    expect(onScan).toHaveBeenCalledWith('FY-K7MX')
  })

  it('corrige un lecteur QWERTY branché sur une tablette AZERTY', () => {
    // Sur AZERTY, la touche « - » du QWERTY produit « ) » et les chiffres demandent Maj
    const clock = { t: 0 }, onScan = vi.fn()
    const w = createWedge({ onScan, now: () => clock.t })
    const azerty = [
      { key: 'F', code: 'KeyF', shiftKey: true }, { key: 'Y', code: 'KeyY', shiftKey: true },
      { key: ')', code: 'Minus', shiftKey: false },
      { key: "'", code: 'Digit4', shiftKey: false }, { key: 'A', code: 'KeyA', shiftKey: true },
      { key: 'é', code: 'Digit2', shiftKey: false }, { key: 'B', code: 'KeyB', shiftKey: true },
    ]
    type(w, azerty, clock)
    expect(onScan).toHaveBeenCalledWith('FY-4A2B')
  })

  it('ignore la frappe humaine, trop lente', () => {
    const clock = { t: 0 }, onScan = vi.fn()
    const w = createWedge({ onScan, now: () => clock.t })
    type(w, us('FY-4A2B'), clock, 180)
    expect(onScan).not.toHaveBeenCalled()
  })

  it('signale un QR lu qui n\'est pas un code spectateur', () => {
    const clock = { t: 0 }, onScan = vi.fn(), onUnknown = vi.fn()
    const w = createWedge({ onScan, onUnknown, now: () => clock.t })
    type(w, us('https://exemple.fr'), clock)
    expect(onScan).not.toHaveBeenCalled()
    expect(onUnknown).toHaveBeenCalled()
  })

  it('termine la lecture après un silence quand le lecteur n\'envoie pas Entrée', () => {
    vi.useFakeTimers()
    const clock = { t: 0 }, onScan = vi.fn()
    const w = createWedge({ onScan, now: () => clock.t })
    for (const k of us('FY-9C7E')) { clock.t += 8; w.feed(k) }
    vi.advanceTimersByTime(200)
    expect(onScan).toHaveBeenCalledWith('FY-9C7E')
    vi.useRealTimers()
  })
})

describe('décodage', () => {
  it('traduit les touches physiques en QWERTY', () => {
    expect(usCharFromCode('Minus', false)).toBe('-')
    expect(usCharFromCode('Semicolon', true)).toBe(':')
    expect(usCharFromCode('Digit2', false)).toBe('2')
    expect(usCharFromCode('KeyQ', true)).toBe('Q')
  })
  it('trouve le code spectateur dans un texte', () => {
    expect(parseSpectatorCode('fy-4a2b')).toBe('FY-4A2B')
    expect(parseSpectatorCode('rien')).toBeNull()
  })
})

describe('codes de billet du site (12 caractères)', () => {
  it('reconnaît un billet seul ou dans son adresse', () => {
    expect(parseSpectatorCode('FY-K7QW3NPX9RTB')).toBe('FY-K7QW3NPX9RTB')
    expect(parseSpectatorCode('https://festishop.festylla.com/solde?id=FY-K7QW3NPX9RTB&ev=abc123')).toBe('FY-K7QW3NPX9RTB')
    expect(parseSpectatorCode('FY-4A2B')).toBe('FY-4A2B')
  })
  it('lit un billet tapé par un lecteur clavier', () => {
    const clock = { t: 0 }, onScan = vi.fn()
    const w = createWedge({ onScan, now: () => clock.t })
    type(w, us('https://festishop.festylla.com/solde?id=FY-K7QW3NPX9RTB&ev=x'), clock)
    expect(onScan).toHaveBeenCalledWith('FY-K7QW3NPX9RTB')
  })
})
