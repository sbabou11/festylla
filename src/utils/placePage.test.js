import { describe, it, expect, afterEach, vi } from 'vitest'
import { remonter, garderPlace, remettrePlace, _places } from './placePage'

afterEach(() => { vi.unstubAllGlobals(); _places.clear() })

const zone = (h = 2000) => {
  const z = { _t: 0, scrollHeight: h, clientHeight: 700, scrollTo: vi.fn(function (o) { this.scrollTop = o.top }) }
  Object.defineProperty(z, 'scrollTop', { get() { return this._t }, set(v) { this._t = Math.max(0, Math.min(v, this.scrollHeight - this.clientHeight)) } })
  return z
}

describe('remonter en haut, retrouver sa place (24/11/2026)', () => {
  it('garde et remet la place de chaque page', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    const z = zone()
    z.scrollTop = 640; garderPlace('transactions', z)
    z.scrollTop = 0;   garderPlace('accueil', z)
    remettrePlace('transactions', z); expect(z.scrollTop).toBe(640)
    remettrePlace('accueil', z);      expect(z.scrollTop).toBe(0)
    remettrePlace('jamais-vue', z);   expect(z.scrollTop).toBe(0)
  })
  it('réessaie tant que la page n\'est pas assez longue (contenu chargé après coup)', () => {
    const images = []
    vi.stubGlobal('requestAnimationFrame', (fn) => images.push(fn))
    const z = zone(800)
    _places.set('liste', 900)
    remettrePlace('liste', z)
    expect(z.scrollTop).toBe(100)      // pas encore assez long
    z.scrollHeight = 3000; images.shift()()
    expect(z.scrollTop).toBe(900)
  })
  it('remonte en douceur, ou d\'un coup si le téléphone réduit les animations', () => {
    const z = zone()
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    remonter(z); expect(z.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' })
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    remonter(z); expect(z.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'auto' })
  })
})
