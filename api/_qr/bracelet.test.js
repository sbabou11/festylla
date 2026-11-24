import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { lireBracelet, erreurCode, empreinteCode, codeJuste, vueBracelet, numeroAffiche, nouveauxNumeros, ALPHABET } = require('./bracelet.js')

describe('bracelet de secours', () => {
  it('lit le QR du bracelet et le numéro tapé', () => {
    expect(lireBracelet('FYB-TESTQR26')).toBe('TESTQR26')
    expect(lireBracelet('fyb-k7q3px9m')).toBe('K7Q3PX9M')
    expect(lireBracelet('K7Q3 PX9M')).toBe('K7Q3PX9M')
    expect(lireBracelet('K7Q3-PX9M')).toBe('K7Q3PX9M')
  })
  it('refuse le reste', () => {
    expect(lireBracelet('FY-K7Q3PX')).toBeNull()             // compte spectateur
    expect(lireBracelet('FYB-K7Q3PX9')).toBeNull()           // trop court
    expect(lireBracelet('FYB-K7Q3PX0M')).toBeNull()          // 0 exclu
    expect(lireBracelet('FYB-K7Q3PXIM')).toBeNull()          // I exclu
    expect(lireBracelet('')).toBeNull()
  })
  it('refuse les codes faciles', () => {
    expect(erreurCode('2580')).toBeNull()
    expect(erreurCode('1975')).toBeNull()
    for (const c of ['0000', '7777', '1234', '4321', '6789', '3210']) expect(erreurCode(c)).toBeTruthy()
    for (const c of ['123', '12345', 'abcd', '']) expect(erreurCode(c)).toBeTruthy()
  })
  it('garde une empreinte du code, jamais le code', () => {
    const h = empreinteCode('2580')
    expect(h).not.toContain('2580')
    expect(codeJuste({ codeHash: h }, '2580')).toBe(true)
    expect(codeJuste({ codeHash: h }, '2581')).toBe(false)
    expect(codeJuste(null, '2580')).toBe(false)
    expect(vueBracelet({ numero: 'TESTQR26', statut: 'actif', codeHash: h })).toEqual({ numero: 'TESTQR26', statut: 'actif', motif: null })
  })
  it('affiche et génère des numéros lisibles', () => {
    expect(numeroAffiche('K7Q3PX9M')).toBe('K7Q3 PX9M')
    expect(ALPHABET).toHaveLength(32)
    const n = nouveauxNumeros(500)
    expect(new Set(n).size).toBe(500)
    for (const x of n) expect(lireBracelet(`FYB-${x}`)).toBe(x)
  })
})
