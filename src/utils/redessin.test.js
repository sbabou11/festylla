import { describe, it, expect, afterEach, vi } from 'vitest'
import { estIOS, forcerRedessin } from './redessin'

const ua = (texte, touches = 0) => {
  vi.stubGlobal('navigator', { userAgent: texte, maxTouchPoints: touches })
}
afterEach(() => vi.unstubAllGlobals())

describe('redessin pour Safari sur iPhone (24/11/2026)', () => {
  it('reconnaît iPhone et iPad, pas Android ni un vrai Mac', () => {
    ua('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15'); expect(estIOS()).toBe(true)
    ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5); expect(estIOS()).toBe(true)   // iPadOS
    ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0); expect(estIOS()).toBe(false)
    ua('Mozilla/5.0 (Linux; Android 14; SM-A115F) AppleWebKit/537.36 Chrome/130'); expect(estIOS()).toBe(false)
  })

  it('remet l\'opacité d\'origine après une image', async () => {
    ua('iPhone')
    const el = { style: { opacity: '' }, offsetHeight: 10 }
    let image = null
    vi.stubGlobal('requestAnimationFrame', (fn) => { image = fn })
    vi.stubGlobal('document', {})
    forcerRedessin([el])
    expect(el.style.opacity).toBe('0.999')
    image(); image()
    expect(el.style.opacity).toBe('')
  })

  it('ne fait rien hors iOS', () => {
    ua('Android')
    const el = { style: { opacity: '' } }
    vi.stubGlobal('document', {})
    forcerRedessin([el])
    expect(el.style.opacity).toBe('')
  })
})
