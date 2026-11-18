import { describe, it, expect } from 'vitest'
import { isEmLinked, pageRetiree } from './pages'

describe('pages retirées (lot D)', () => {
  it("masque planning, cachets, exposants et finances seulement pour un événement relié", () => {
    const relie = { id: 'e27', emEquipe: { majMs: 1 } }
    const archive = { id: 'e26', archive: { readOnly: true } }
    expect(isEmLinked(relie)).toBe(true)
    expect(isEmLinked({ emProgramme: { majMs: 1 } })).toBe(true)
    expect(isEmLinked(archive)).toBe(false)
    for (const p of ['planning', 'cachets', 'exposants', 'finances', 'editeur-template']) {
      expect(pageRetiree(relie, p)).toBe(true)
      expect(pageRetiree(archive, p)).toBe(false)
    }
    expect(pageRetiree(relie, 'comptabilite')).toBe(false)
    expect(pageRetiree(relie, 'gestion-artistes')).toBe(false)
  })
})
