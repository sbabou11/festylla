import { describe, it, expect } from 'vitest'
import { LARGEUR, colonnes, encoder, sansAccents, lignesTicket, octetsTicket, ticketsDeCommande } from './escpos'
import { ticketsParStand } from '../menu/organiser'

const stands = [{ id: 's4', numero: 4, nom: 'Grillades' }, { id: 's2', numero: 2, nom: 'Bar' }]
const items = [
  { nom: 'Burger Ylla', qty: 1, prix: 900, standId: 's4' },
  { nom: 'Coca 33 cl', qty: 2, prix: 300, standId: 's2' },
]

describe('ticket papier de la borne', () => {
  it('deux colonnes sur 48 caractères, libellé coupé si besoin', () => {
    expect(colonnes('1 x Burger', '9,00')).toHaveLength(LARGEUR)
    expect(colonnes('1 x Burger', '9,00').endsWith('9,00')).toBe(true)
    const long = colonnes('2 x ' + 'x'.repeat(80), '10,00')
    expect(long).toHaveLength(LARGEUR)
    expect(long.endsWith(' 10,00')).toBe(true)
  })
  it('accents en Windows-1252, ou retirés', () => {
    expect(encoder('é€')).toEqual([0xe9, 0x80])
    expect(sansAccents('Bénévole · 9,00 € — œuf')).toBe('Benevole - 9,00 EUR - oeuf')
    expect(encoder('é€', { accents: false })).toEqual([...'eEUR'].map(c => c.charCodeAt(0)))
  })
  it('un ticket par stand, avec le numéro commande-stand et le sous-total', () => {
    const t = ticketsDeCommande(ticketsParStand(items, stands, 47), { festival: 'Festylla', paiement: 'Payé avec le solde', date: '12/07/2026 18:42' })
    expect(t.map(x => x.numero)).toEqual(['47-2', '47-4'])
    expect(t[1]).toMatchObject({ standNumero: 4, standNom: 'Grillades', totalLabel: 'Sous-total', totalValeur: '9,00 EUR' })
    const textes = lignesTicket(t[1]).filter(l => !l.sep).map(l => l.t)
    expect(textes).toContain('N° 4')
    expect(textes).toContain('47-4')
    expect(textes.some(x => x.startsWith('1 x Burger Ylla') && x.endsWith('9,00'))).toBe(true)
  })
  it('bénévole ou artiste : pas de prix, « OFFERT »', () => {
    const [t] = ticketsDeCommande(ticketsParStand([items[0]], stands, 52), { mention: 'ARTISTE · Les Zygomatiques', offert: 'Avantages artiste' })
    expect(t.totalValeur).toBe('OFFERT')
    expect(lignesTicket(t).filter(l => !l.sep).some(l => /9,00/.test(l.t))).toBe(false)
  })
  it('commence par la remise à zéro et finit par la coupe du papier', () => {
    const [t] = ticketsDeCommande(ticketsParStand([items[0]], stands, 47), {})
    const o = octetsTicket(t)
    expect([...o.slice(0, 2)]).toEqual([0x1b, 0x40])
    expect([...o.slice(-4)]).toEqual([0x1d, 0x56, 66, 0])
    expect(octetsTicket(t, { accents: false }).every(x => x < 0x80)).toBe(true)
  })
})
