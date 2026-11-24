import { describe, it, expect } from 'vitest'
import { versionLisible } from './TirerActualiser'

describe('tirer pour actualiser (24/11/2026)', () => {
  it('affiche le numéro de version lisiblement', () => {
    expect(versionLisible('2411.2055')).toBe('24.11 · 20:55')
    expect(versionLisible('dev')).toBe('dev')
  })
})
