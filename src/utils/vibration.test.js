import { describe, it, expect, afterEach, vi } from 'vitest'
import { vibrerSucces } from './vibration'

afterEach(() => vi.unstubAllGlobals())

describe('vibration courte (24/11/2026)', () => {
  it('vibre 12 ms quand le téléphone le permet', () => {
    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { vibrate })
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    expect(vibrerSucces()).toBe(true)
    expect(vibrate).toHaveBeenCalledWith(12)
  })
  it('ne vibre pas si le téléphone demande de réduire les animations', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    expect(vibrerSucces()).toBe(false)
    expect(vibrate).not.toHaveBeenCalled()
  })
  it('ne fait rien sur iPhone (pas de vibration pour les pages web)', () => {
    vi.stubGlobal('navigator', {})
    expect(vibrerSucces()).toBe(false)
  })
})
