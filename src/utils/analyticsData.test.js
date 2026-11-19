import { describe, it, expect } from 'vitest'
import { expectedTill, countTotal } from './analyticsData'
import { makeResaCode } from './helpers'

const H = 3600 * 1000
const day = Date.UTC(2027, 5, 12, 4) // une journée de festival (début arbitraire)
const tx = (h, montant, moyen, staff = 'Caisse Awa', type = 'credit') =>
  ({ type, montant, moyen, staff, timestamp: new Date(day + h * H).toISOString() })

describe('clôture : montant attendu par mode de paiement', () => {
  const logs = [
    tx(1, 2000, 'especes'), tx(2, 3000, 'cb'), tx(3, 1000, 'especes', 'Caisse Karim'),
    tx(4, 500, undefined),                    // recharge ancienne, sans mode enregistré
    tx(5, 900, 'especes', 'Caisse Awa', 'debit'), // un encaissement n'entre pas dans la caisse billetterie
    { ...tx(6, 1200, 'especes'), type: 'debit', surPlace: true }, // commande sur place payée à la billetterie
    { ...tx(7, 800, 'cb'), type: 'debit', surPlace: true },
    { ...tx(8, 300, 'especes'), type: 'remboursement', surPlace: true }, // ticket remboursé en espèces
    { ...tx(9, 5000, 'especes'), type: 'remboursement' },                 // remboursement de solde : hors de ce calcul
    tx(30, 7000, 'especes'),                  // hors de la période
  ]

  it('additionne les recharges de la période, par mode', () => {
    const r = expectedTill(logs, { from: day, to: day + 24 * H })
    expect(r.especes).toEqual({ n: 3, total: 3900 })
    expect(r.cb).toEqual({ n: 2, total: 3800 })
    expect(r.inconnu).toEqual({ n: 1, total: 500 })
  })
  it('ne compte que la caisse choisie', () => {
    const r = expectedTill(logs, { from: day, to: day + 24 * H, staff: 'Caisse Karim' })
    expect(r.especes.total).toBe(1000)
    expect(r.cb.total).toBe(0)
  })
})

describe('clôture : comptage des espèces', () => {
  it('multiplie chaque coupure par son nombre', () => {
    expect(countTotal({ 5000: 2, 2000: 1, 50: 3 })).toBe(12150)
  })
  it('ignore les saisies vides ou invalides', () => {
    expect(countTotal({ 1000: '', 500: 'x', 200: 2 })).toBe(400)
    expect(countTotal()).toBe(0)
  })
})

describe('codes de réservation', () => {
  it('commencent par la fin du code spectateur et restent uniques', () => {
    const codes = new Set(Array.from({ length: 500 }, () => makeResaCode('FY-4A2B')))
    expect(codes.size).toBe(500)
    for (const c of codes) expect(c).toMatch(/^4A2B-[A-Z0-9]{5}$/)
  })
})
