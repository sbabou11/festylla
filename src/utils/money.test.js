import { describe, it, expect } from 'vitest'
import { toCents, formatCents } from './money'
import { fmt } from './helpers'

describe('toCents : saisie en euros → centimes', () => {
  it('arrondit au centime sans erreur de virgule flottante', () => {
    expect(toCents(12.1)).toBe(1210)       // 12.1 * 100 = 1209.9999…
    expect(toCents(0.29)).toBe(29)         // 0.29 * 100 = 28.999…
    expect(toCents(19.99)).toBe(1999)
    expect(toCents(2.999)).toBe(300)       // une 3e décimale tapée par erreur est arrondie
  })
  it('accepte la virgule française et les espaces', () => {
    expect(toCents('12,10')).toBe(1210)
    expect(toCents('1 000,50')).toBe(100050)
    expect(toCents(' 5 ')).toBe(500)
  })
  it('renvoie 0 pour une saisie vide ou invalide', () => {
    expect(toCents('')).toBe(0)
    expect(toCents(null)).toBe(0)
    expect(toCents(undefined)).toBe(0)
    expect(toCents('abc')).toBe(0)
  })
  it('garde le signe des montants négatifs (remboursements, corrections)', () => {
    expect(toCents('-4,50')).toBe(-450)
  })
})

describe('affichage des montants', () => {
  it('fmt affiche des centimes en euros', () => {
    expect(fmt(1210)).toBe('12,10€')
    expect(fmt(0)).toBe('0,00€')
    expect(fmt(-150)).toBe('-1,50€')
  })
  it('formatCents arrondit et sépare les milliers', () => {
    expect(formatCents(123456)).toMatch(/^1\s?234,56\s€$/)
    expect(formatCents(1209.6)).toMatch(/^12,10\s€$/)
  })
})
