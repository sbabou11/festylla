import { describe, it, expect } from 'vitest'
const { limitesBracelet, depenseDuJour, resteDuJour, verifierPanier } = require('./bracelet.js')

const menu = new Map([
  ['crepe', { nom: 'Crêpe', prix: 300, stock: 50, standId: 's1' }],
  ['jus', { nom: "Jus d'orange", prix: 200, stock: 50 }],
  ['biere', { nom: 'Bière pression', prix: 500, stock: 50, alcool: true }],
  ['burger', { nom: 'Burger', prix: 900, stock: 1 }],
])
const lea = limitesBracelet({ numero: 'R4TW8HNE', prenom: 'Léa', mineur: true, plafondJour: 20, codeHash: null })

describe('bracelet limité à la borne (28/11/2026)', () => {
  it('limites : mineur sans code → 10 € par achat ; adulte sans plafond → parcours habituel', () => {
    expect(lea).toEqual({ numero: 'R4TW8HNE', prenom: 'Léa', mineur: true, plafondJour: 2000, achatMax: 1000, avecCode: false })
    expect(limitesBracelet({ numero: 'X', mineur: true, plafondJour: 30, codeHash: 'h' }).achatMax).toBeNull()
    expect(limitesBracelet({ numero: 'X', mineur: false, plafondJour: null, codeHash: 'h' })).toBeNull()
  })
  it('panier accepté : prix et stand du menu, jamais ceux envoyés par la borne', () => {
    const r = verifierPanier({ lignes: [{ id: 'crepe', qty: 1, prix: 1 }, { id: 'jus', qty: 1 }], menuById: menu, standById: new Map([['s1', { id: 's1', numero: 3 }]]), limites: lea })
    expect(r.total).toBe(500)
    expect(r.items[0]).toMatchObject({ id: 'crepe', prixUnit: 300, standId: 's1', standNumero: 3 })
  })
  it('alcool refusé à un mineur, accepté à un adulte plafonné', () => {
    expect(() => verifierPanier({ lignes: [{ id: 'biere', qty: 1 }], menuById: menu, limites: lea })).toThrow(/alcool/)
    const adulte = limitesBracelet({ numero: 'X', mineur: false, plafondJour: 50, codeHash: 'h' })
    expect(verifierPanier({ lignes: [{ id: 'biere', qty: 1 }], menuById: menu, limites: adulte }).total).toBe(500)
  })
  it('10 € par achat sans code, puis le plafond du jour', () => {
    expect(() => verifierPanier({ lignes: [{ id: 'crepe', qty: 4 }], menuById: menu, limites: lea })).toThrow(/10,00 € au plus/)
    expect(() => verifierPanier({ lignes: [{ id: 'crepe', qty: 2 }], menuById: menu, limites: lea, depense: 1600 })).toThrow(/il reste 4,00 €/)
    expect(verifierPanier({ lignes: [{ id: 'crepe', qty: 1 }], menuById: menu, limites: lea, depense: 1600 }).total).toBe(300)
  })
  it('stock et articles inconnus', () => {
    expect(() => verifierPanier({ lignes: [{ id: 'burger', qty: 2 }], menuById: menu, limites: null })).toThrow(/Stock insuffisant/)
    expect(() => verifierPanier({ lignes: [{ id: 'x', qty: 1 }], menuById: menu, limites: null })).toThrow(/plus disponible/)
    expect(() => verifierPanier({ lignes: [], menuById: menu, limites: null })).toThrow(/vide/)
  })
  it('dépense du jour : débits de ce jour seulement', () => {
    const jourDe = (iso) => String(iso).slice(0, 10)
    const txs = [
      { type: 'debit', montant: 400, timestamp: '2027-05-15T12:00:00Z' },
      { type: 'debit', montant: 300, timestamp: '2027-05-14T12:00:00Z' },
      { type: 'recharge', montant: 1000, timestamp: '2027-05-15T12:00:00Z' },
    ]
    expect(depenseDuJour(txs, '2027-05-15', jourDe)).toBe(400)
    expect(resteDuJour(lea, 400)).toBe(1600)
    expect(resteDuJour(lea, 2500)).toBe(0)
  })
})
