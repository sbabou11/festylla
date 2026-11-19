import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { restants, preparerCommande, standBenevoles } = require('./benevole.js')

const menuById = new Map([
  ['m1', { nom: 'Yassa poulet', prix: 900, stock: 10, typeConsommation: 'repas' }],
  ['m2', { nom: 'Bissap', prix: 300, stock: 1, typeConsommation: 'boisson' }],
  ['m3', { nom: 'Bière', prix: 500, stock: 50 }],
])
const stand = { id: 's7', numero: 7, nom: 'Bénévoles', benevoles: true }
const em = { source: 'event-manager', droitsJours: { '2027-05-15': { repas: 1, boisson: 2 } }, consoJours: { '2027-05-15': { boisson: 1 } } }
const local = { droits: { repas: 2, eau: 1 }, consommation: { repas: 1 } }

describe('droits du jour', () => {
  it("Event Manager : par jour ; YllaCash : totaux de l'événement", () => {
    expect(restants(em, '2027-05-15')).toEqual({ repas: 1, boisson: 1, eau: 0 })
    expect(restants(em, '2027-05-16')).toEqual({ repas: 0, boisson: 0, eau: 0 })
    expect(restants(local, 'peu-importe')).toEqual({ repas: 1, boisson: 0, eau: 1 })
  })
})

describe('preparerCommande', () => {
  it('décompte par type, sur le stand des bénévoles', () => {
    const r = preparerCommande({ benev: em, jour: '2027-05-15', lignes: [{ id: 'm1', qty: 1 }, { id: 'm2', qty: 1 }], menuById, standBenev: stand })
    expect(r.champs).toEqual({ 'consoJours.2027-05-15.repas': 1, 'consoJours.2027-05-15.boisson': 1 })
    expect(r.items.every(i => i.standNumero === 7)).toBe(true)
    expect(r.valeur).toBe(1200)
  })
  it('refuse : droits dépassés, article non bénévole, stock insuffisant', () => {
    expect(() => preparerCommande({ benev: em, jour: '2027-05-15', lignes: [{ id: 'm1', qty: 2 }], menuById })).toThrow(/Droits insuffisants pour repas/)
    expect(() => preparerCommande({ benev: em, jour: '2027-05-15', lignes: [{ id: 'm3', qty: 1 }], menuById })).toThrow(/pas proposé aux bénévoles/)
    expect(() => preparerCommande({ benev: { ...em, droitsJours: { '2027-05-15': { boisson: 5 } } }, jour: '2027-05-15', lignes: [{ id: 'm2', qty: 2 }], menuById })).toThrow(/Plus assez/)
  })
  it('fiche saisie dans YllaCash : champ consommation', () => {
    const r = preparerCommande({ benev: local, jour: 'x', lignes: [{ id: 'm1', qty: 1 }], menuById })
    expect(r.champs).toEqual({ 'consommation.repas': 1 })
  })
  it('stand des bénévoles', () => {
    expect(standBenevoles({ stands: [{ id: 'a', numero: 1 }, stand] })).toBe(stand)
    expect(standBenevoles({})).toBeNull()
  })
})
