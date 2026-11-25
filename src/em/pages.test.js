import { describe, it, expect } from 'vitest'
import { isEmLinked, pageRetiree } from './pages'

describe('pages retirées (lot D, puis partout depuis le 25/11/2026)', () => {
  it('reconnaît un événement relié à Event Manager', () => {
    expect(isEmLinked({ id: 'e27', emEquipe: { majMs: 1 } })).toBe(true)
    expect(isEmLinked({ emProgramme: { majMs: 1 } })).toBe(true)
    expect(isEmLinked({ id: 'e26', archive: { readOnly: true } })).toBe(false)
  })
  it('masque les pages d\'Event Manager et le QR code entrée sur tous les événements', () => {
    const relie = { id: 'e27', emEquipe: { majMs: 1 } }
    const nonRelie = { id: 'e26' }
    for (const p of ['planning', 'cachets', 'exposants', 'finances', 'editeur-template', 'gestion-artistes', 'qr-entree']) {
      expect(pageRetiree(relie, p)).toBe(true)
      expect(pageRetiree(nonRelie, p)).toBe(true)
      expect(pageRetiree(null, p)).toBe(true)
    }
  })
  it('garde les pages de YllaCash', () => {
    for (const p of ['comptabilite', 'transactions', 'cloture', 'entree', 'spectateurs', 'bracelets', 'menu']) {
      expect(pageRetiree({ id: 'e26' }, p)).toBe(false)
    }
  })
})
