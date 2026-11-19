import { describe, it, expect } from 'vitest'
import { organiserCarte, ticketsParStand, lireNumeroTicket } from './organiser'

const stands = [{ id: 's4', numero: 4, nom: 'Cuisine' }, { id: 's2', numero: 2, nom: 'Bar' }]
const rayons = [{ id: 'rB', nom: 'Boissons', ordre: 2 }, { id: 'rP', nom: 'Plats', ordre: 1 }]
const categories = [
  { id: 'c1', nom: 'Plat viande', rayonId: 'rP', ordre: 2 },
  { id: 'c2', nom: 'Accompagnements', rayonId: 'rP', ordre: 1 },
  { id: 'c3', nom: 'Sans alcool', rayonId: 'rB', ordre: 3 },
  { id: 'c4', nom: 'Desserts', rayonId: 'disparu', ordre: 4 },
  { id: 'c5', nom: 'Vide', rayonId: 'rB', ordre: 5 },
]
const menu = [
  { id: 'a', nom: 'Thieb', cat: 'Plat viande', standId: 's4' },
  { id: 'b', nom: 'Alloco', cat: 'accompagnements ', standId: 's4' },
  { id: 'c', nom: 'Bissap', cat: 'Sans alcool', standId: 's2' },
  { id: 'd', nom: 'Sans stand', cat: 'Sans alcool' },
  { id: 'e', nom: 'Thiakry', cat: 'Desserts', standId: 's4' },
  { id: 'f', nom: 'Retiré', cat: 'Plat viande', standId: 's4', actif: false },
]

describe('organiserCarte', () => {
  it('rayons dans l’ordre, catégories rangées, articles sans stand et vides écartés', () => {
    const r = organiserCarte({ menu, categories, rayons, stands })
    expect(r.rayons.map(x => x.nom)).toEqual(['Plats', 'Boissons', 'Autres'])
    expect(r.rayons[0].cats.map(c => c.nom)).toEqual(['Accompagnements', 'Plat viande'])
    expect(r.rayons[1].cats.map(c => c.items.map(i => i.nom))).toEqual([['Bissap']])
    expect(r.rayons[2].cats[0].nom).toBe('Desserts')
    expect(r.items.map(i => i.id)).toEqual(['a', 'b', 'c', 'e'])
  })
  it('sans stand ni rayon : toute la carte, un seul groupe', () => {
    const r = organiserCarte({ menu, categories })
    expect(r.rayons).toHaveLength(1)
    expect(r.rayons[0].nom).toBe('')
    expect(r.items).toHaveLength(5)
  })
})

describe('ticketsParStand', () => {
  it('un ticket par stand, triés par numéro, numéro commande-stand et sous-total', () => {
    const t = ticketsParStand([
      { nom: 'Thieb', qty: 2, prix: 900, standId: 's4' },
      { nom: 'Bissap', qty: 1, prix: 300, standId: 's2' },
      { nom: 'Alloco', qty: 1, prix: 250, standId: 's4' },
    ], stands, 47)
    expect(t.map(x => x.numero)).toEqual(['47-2', '47-4'])
    expect(t[1].sousTotal).toBe(2050)
    expect(t[1].lignes.map(l => l.nom)).toEqual(['Thieb', 'Alloco'])
  })
  it('aucun stand : un seul ticket', () => {
    const t = ticketsParStand([{ nom: 'X', qty: 1, prix: 100 }], [], 12)
    expect(t).toEqual([{ stand: null, lignes: [{ nom: 'X', qty: 1, prix: 100 }], numero: '12', sousTotal: 100 }])
  })
})

describe('lireNumeroTicket', () => {
  it('commande-stand, commande seule, et saisies refusées', () => {
    expect(lireNumeroTicket('47-4')).toEqual({ numero: 47, standNumero: 4 })
    expect(lireNumeroTicket(' #47 - 4 ')).toEqual({ numero: 47, standNumero: 4 })
    expect(lireNumeroTicket('12')).toEqual({ numero: 12, standNumero: null })
    expect(lireNumeroTicket('BRN-ABC')).toBeNull()
    expect(lireNumeroTicket('')).toBeNull()
  })
})
