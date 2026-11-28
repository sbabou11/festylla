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
    expect(vueBracelet({ numero: 'TESTQR26', statut: 'actif', codeHash: h })).toMatchObject({ numero: 'TESTQR26', statut: 'actif', motif: null, avecCode: true })
  })
  it('affiche et génère des numéros lisibles', () => {
    expect(numeroAffiche('K7Q3PX9M')).toBe('K7Q3 PX9M')
    expect(ALPHABET).toHaveLength(32)
    const n = nouveauxNumeros(500)
    expect(new Set(n).size).toBe(500)
    for (const x of n) expect(lireBracelet(`FYB-${x}`)).toBe(x)
  })
})

describe('plusieurs bracelets par compte : réglages (28/11/2026)', () => {
  const { reglagesBracelet } = require('./bracelet.js')
  it('mineur sans code : plafond obligatoire, 30 € par jour au plus', () => {
    expect(reglagesBracelet({ prenom: '  Léa ', mineur: true, plafondJour: 20 }, { avecCode: false })).toEqual({ reglages: { prenom: 'Léa', mineur: true, plafondJour: 20 } })
    expect(reglagesBracelet({ mineur: true }, { avecCode: false }).erreur).toMatch(/obligatoire/)
    expect(reglagesBracelet({ mineur: true, plafondJour: 31 }, { avecCode: false }).erreur).toMatch(/30 €/)
    expect(reglagesBracelet({ mineur: false, plafondJour: 20 }, { avecCode: false }).erreur).toMatch(/mineur/)
  })
  it('avec code : plafond facultatif ; seul le guichet décoche « mineur »', () => {
    expect(reglagesBracelet({ prenom: 'Moi' })).toEqual({ reglages: { prenom: 'Moi', mineur: false, plafondJour: null } })
    expect(reglagesBracelet({ mineur: false }, { avant: { mineur: true } }).erreur).toMatch(/billetterie/)
    expect(reglagesBracelet({ mineur: false }, { avant: { mineur: true }, parGuichet: true }).reglages.mineur).toBe(false)
    expect(reglagesBracelet({ plafondJour: 'abc' }).erreur).toMatch(/montant/)
    expect(reglagesBracelet({ plafondJour: '' }, { avant: { plafondJour: 20 } }).reglages.plafondJour).toBeNull()
  })
  it('la vue ne montre jamais l’empreinte du code', () => {
    const { vueBracelet } = require('./bracelet.js')
    const v = vueBracelet({ numero: 'K7Q3PX9M', statut: 'actif', codeHash: 'secret', prenom: 'Tom', mineur: true, plafondJour: 30 })
    expect(v).toMatchObject({ avecCode: true, prenom: 'Tom', mineur: true, plafondJour: 30 })
    expect(JSON.stringify(v)).not.toContain('secret')
  })
})
