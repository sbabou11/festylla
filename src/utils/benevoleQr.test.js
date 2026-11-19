import { describe, it, expect } from 'vitest'
import { parseBenevoleQr } from './benevoleQr'

const cle = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'

describe('parseBenevoleQr', () => {
  it('lit la fiche et la clé du lien personnel', () => {
    expect(parseBenevoleQr(`https://festishop.festylla.com/benevole?id=em-u31&ev=ev1&k=${cle}`))
      .toEqual({ id: 'em-u31', cle, ev: 'ev1' })
  })
  it('essaie chaque lecture et refuse un lien sans clé ou un autre QR', () => {
    expect(parseBenevoleQr('https:!!festishop.festylla.com!benevole_id', `https://x/benevole?id=b1&k=${cle}`)).toEqual({ id: 'b1', cle, ev: null })
    expect(parseBenevoleQr('https://x/benevole?id=b1')).toBeNull()
    expect(parseBenevoleQr('https://x/solde?id=FY-K7Q3NP')).toBeNull()
  })
})

describe('QR de l\'espace artiste', () => {
  it('lit le créneau et la clé du lien personnel', async () => {
    const { parseArtisteQr } = await import('./benevoleQr')
    const k = 'a'.repeat(32)
    expect(parseArtisteQr(`https://x.fr/artiste?ev=e1&cr=em-12&k=${k}`)).toEqual({ id: 'em-12', cle: k, ev: 'e1' })
    expect(parseArtisteQr('{"ev":"e1","cr":"em-12","type":"artiste"}')).toBeNull()
    expect(parseArtisteQr(`https://x.fr/benevole?ev=e1&id=b1&k=${k}`)).toBeNull()
  })
})
