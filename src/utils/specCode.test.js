import { describe, it, expect } from 'vitest'
import { extractSpecId } from './specCode'

describe('codes spectateur', () => {
  it('accepte les comptes courts et les billets', () => {
    expect(extractSpecId('fy-4a2b')).toBe('FY-4A2B')
    expect(extractSpecId('https://festishop.festylla.com/solde?id=FY-K7Q3NP&ev=Abc')).toBe('FY-K7Q3NP')
  })
  it('complète un code de billet tapé sans FY-', () => {
    expect(extractSpecId('k7q3np')).toBe('FY-K7Q3NP')
    expect(extractSpecId('kqwnpx')).toBe('FY-KQWNPX')
    expect(extractSpecId('Marie')).toBeNull()
  })
  it('refuse un code trop long', () => {
    expect(extractSpecId('FY-K7Q3NPX9RTBXY')).toBeNull()
  })
})
