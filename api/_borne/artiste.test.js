import { describe, it, expect } from 'vitest'
import { avantagesDe, dejaPris, restantsArtiste, preparerCommandeArtiste } from './artiste'

const menuById = new Map([
  ['burger', { nom: 'Burger', prix: 900, stock: 10, standId: 's1', typeConsommation: 'repas' }],
  ['coca', { nom: 'Coca', prix: 300, stock: 1, standId: 's2', typeConsommation: 'boisson' }],
  ['sansStand', { nom: 'Frites', prix: 400, stock: 5, typeConsommation: 'repas' }],
  ['biere', { nom: 'Bière', prix: 500, stock: 5, standId: 's2', typeConsommation: 'boisson' }],
])
const standById = new Map([['s1', { id: 's1', numero: 1 }], ['s2', { id: 's2', numero: 2 }]])

describe('avantages d\'un artiste à la borne', () => {
  it('créneau du planning : totaux et articles du créneau', () => {
    const a = avantagesDe({ creneau: { avantages: { meals: 2, drinks: 3, eaux: 0, mealIds: ['burger'], drinkIds: ['coca'] } }, menuById })
    expect(a.total).toEqual({ meal: 2, drink: 3, eau: 0 })
    expect(a.typeDe.get('burger')).toBe('meal')
    expect(a.typeDe.get('biere')).toBeUndefined()
  })
  it('fiche Event Manager : avantages du jour et articles offerts selon leur type', () => {
    const a = avantagesDe({ em: { avantagesJours: { '2026-07-10': { repas: 1, boisson: 2 } } }, jour: '2026-07-10', offerts: ['burger', 'biere'], menuById })
    expect(a.total).toEqual({ meal: 1, drink: 2, eau: 0 })
    expect(a.typeDe.get('biere')).toBe('drink')
  })
  it('déduit les consommations et les anciennes réservations en attente', () => {
    const pris = dejaPris({ consos: [{ type: 'drink' }, { type: 'meal' }], resasEnAttente: [{ items: [{ type: 'drink' }] }] })
    expect(restantsArtiste({ meal: 2, drink: 3, eau: 0 }, pris)).toEqual({ meal: 1, drink: 1, eau: 0 })
  })
  it('prépare un article par stand de retrait', () => {
    const typeDe = new Map([['burger', 'meal'], ['coca', 'drink']])
    const r = preparerCommandeArtiste({ lignes: [{ id: 'burger', qty: 1 }, { id: 'coca', qty: 1 }], menuById, typeDe, restants: { meal: 1, drink: 1, eau: 0 }, standById })
    expect(r.items.map(i => i.standNumero)).toEqual([1, 2])
    expect(r.parType).toEqual({ meal: 1, drink: 1 })
  })
  it('refuse hors avantages, au-delà des droits, sans stand ou sans stock', () => {
    const typeDe = new Map([['burger', 'meal'], ['coca', 'drink'], ['sansStand', 'meal']])
    const base = { menuById, typeDe, restants: { meal: 1, drink: 5, eau: 0 }, standById }
    expect(() => preparerCommandeArtiste({ ...base, lignes: [{ id: 'biere', qty: 1 }] })).toThrow(/avantages/)
    expect(() => preparerCommandeArtiste({ ...base, lignes: [{ id: 'burger', qty: 2 }] })).toThrow(/il en reste 1/)
    expect(() => preparerCommandeArtiste({ ...base, lignes: [{ id: 'sansStand', qty: 1 }] })).toThrow(/stand de retrait/)
    expect(() => preparerCommandeArtiste({ ...base, lignes: [{ id: 'coca', qty: 2 }] })).toThrow(/Plus assez/)
  })
})
