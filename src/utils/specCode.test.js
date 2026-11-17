import { describe, it, expect } from 'vitest'
import { extractSpecId } from './specCode'

describe('codes spectateur', () => {
  it('accepte les comptes courts et les billets', () => {
    expect(extractSpecId('fy-4a2b')).toBe('FY-4A2B')
    expect(extractSpecId('https://festishop.festylla.com/solde?id=FY-K7QW3NPX9RTB&ev=Abc')).toBe('FY-K7QW3NPX9RTB')
  })
  it('complète un code de billet tapé sans FY-', () => {
    expect(extractSpecId('k7qw3npx9rtb')).toBe('FY-K7QW3NPX9RTB')
    expect(extractSpecId('Marie')).toBeNull()
  })
  it('refuse un code trop long', () => {
    expect(extractSpecId('FY-K7QW3NPX9RTBX')).toBeNull()
  })
})
