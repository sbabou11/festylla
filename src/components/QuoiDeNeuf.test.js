import { describe, it, expect } from 'vitest'
import { dejaVu, marquerVu } from './QuoiDeNeuf'
import { NOUVEAUTES } from '../nouveautes'

const memoire = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } }

describe('quoi de neuf (24/11/2026)', () => {
  it('une fois par mise en ligne, par espace et par téléphone', () => {
    const st = memoire()
    expect(dejaVu('equipe', 'v1', st)).toBe(false)
    marquerVu('equipe', 'v1', st)
    expect(dejaVu('equipe', 'v1', st)).toBe(true)
    expect(dejaVu('spectateur', 'v1', st)).toBe(false)   // autre espace
    expect(dejaVu('equipe', 'v2', st)).toBe(false)        // nouvelle mise en ligne
  })
  it('mémoire inaccessible : le lien reste visible, sans erreur', () => {
    const casse = { getItem: () => { throw new Error('privé') }, setItem: () => { throw new Error('privé') } }
    expect(dejaVu('equipe', 'v1', casse)).toBe(false)
    expect(() => marquerVu('equipe', 'v1', casse)).not.toThrow()
  })
  it('3 ou 4 lignes par espace au plus', () => {
    for (const e of ['equipe', 'benevole', 'spectateur']) {
      expect(NOUVEAUTES[e].length).toBeGreaterThan(0)
      expect(NOUVEAUTES[e].length).toBeLessThanOrEqual(4)
    }
  })
})
