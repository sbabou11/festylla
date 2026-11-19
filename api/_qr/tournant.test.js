import { describe, it, expect } from 'vitest'
import { jeton, lireJeton, jetonValable, lireSecours, nouveauSecours, PERIODE_MS } from './tournant'
import { jetonTournant, parseQrTournant, parseSecours, specIdDuQrTournant } from '../../src/utils/qrTournant'

const base = { cle: 'a'.repeat(32), ev: 'festylla-2027', specId: 'FY-K7Q3NP' }
const t0 = Date.UTC(2027, 4, 14, 18, 0, 0)

describe('QR tournant', () => {
  it('le téléphone et le serveur calculent le même jeton', async () => {
    expect(await jetonTournant({ ...base, ms: t0 })).toBe(jeton({ ...base, ms: t0 }))
  })
  it('valable sur le moment, refusé après quelques fenêtres', () => {
    const lu = lireJeton(jeton({ ...base, ms: t0 }))
    expect(lu.specId).toBe('FY-K7Q3NP')
    expect(jetonValable({ lu, ...base, ms: t0 + 20 * 1000 })).toBe(true)
    expect(jetonValable({ lu, ...base, ms: t0 + 2 * PERIODE_MS })).toBe(true)     // horloge un peu décalée
    expect(jetonValable({ lu, ...base, ms: t0 + 4 * PERIODE_MS })).toBe(false)    // capture d'écran réutilisée
  })
  it('refuse une autre clé, un autre compte ou un autre événement', () => {
    const lu = lireJeton(jeton({ ...base, ms: t0 }))
    expect(jetonValable({ lu, ...base, cle: 'b'.repeat(32), ms: t0 })).toBe(false)
    expect(jetonValable({ lu, ...base, ev: 'autre', ms: t0 })).toBe(false)
    expect(jetonValable({ lu: { ...lu, specId: 'FY-AB2C3D' }, ...base, ms: t0 })).toBe(false)
    expect(jetonValable({ lu, ...base, cle: '', ms: t0 })).toBe(false)
  })
  it('se lit dans une lecture de lecteur, pas dans un ancien code FY-', () => {
    const j = jeton({ ...base, ms: t0 })
    expect(parseQrTournant('?&é"', j.toLowerCase())).toBe(j)
    expect(parseQrTournant('FY-K7Q3NP', 'https://x.fr/solde?id=FY-K7Q3NP&k=abc')).toBeNull()
    expect(lireJeton('FY-K7Q3NP')).toBeNull()
  })
  it("contrôle d'entrée : le QR de l'espace désigne le même billet", () => {
    expect(specIdDuQrTournant(jeton({ ...base, ms: t0 }))).toBe('FY-K7Q3NP')
    expect(specIdDuQrTournant('FY-K7Q3NP')).toBeNull()
  })
  it('code de secours : 2 lettres et 4 chiffres, distinct d\'un code de commande', () => {
    expect(lireSecours('kt 4821')).toBe('KT-4821')
    expect(parseSecours('KT4821')).toBe('KT-4821')
    expect(lireSecours('482913')).toBeNull()
    expect(nouveauSecours()).toMatch(/^[A-HJ-NP-Z]{2}-\d{4}$/)
  })
})
