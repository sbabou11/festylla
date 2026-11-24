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

// Écran 13 (24/11/2026) : toute la carte, avantages d'abord sur les plus chers, le reste sur le solde
describe('repartirCommande (avantages + solde)', () => {
  const { repartirCommande } = require('./benevole.js')
  const carte = new Map([
    ['plat', { nom: 'Plat athiéké poisson', prix: 1500, stock: 10, typeConsommation: 'repas', standId: 's1' }],
    ['bissap', { nom: 'Bissap 50 cl', prix: 300, stock: 10, typeConsommation: 'boisson', standId: 's2' }],
    ['cafe', { nom: 'Café', prix: 150, stock: 10, typeConsommation: 'boisson', standId: 's2' }],
    ['eau', { nom: "Bouteille d'eau", prix: 100, stock: 10, typeConsommation: 'eau', standId: 's2' }],
    ['biere', { nom: 'Bière 25 cl', prix: 400, stock: 10, standId: 's2' }],
  ])
  const stands = [{ id: 's1', numero: 1 }, { id: 's2', numero: 2 }]
  // Repas épuisés, 2 boissons et 1 eau restantes (exemple de la maquette)
  const piercillia = { droits: { repas: 2, boisson: 3, eau: 2 }, consommation: { repas: 2, boisson: 1, eau: 1 } }

  it('la commande de la maquette : 23 € dont 4 € offerts, 19 € sur le solde', () => {
    const r = repartirCommande({ benev: piercillia, jour: 'j', menuById: carte, stands, standBenev: stand,
      lignes: [{ id: 'plat', qty: 1 }, { id: 'bissap', qty: 1 }, { id: 'biere', qty: 1 }, { id: 'eau', qty: 1 }] })
    expect(r.valeurOfferte).toBe(400)
    expect(r.totalPaye).toBe(1900)
    expect(r.offerts.map(i => i.id).sort()).toEqual(['bissap', 'eau'])
    expect(r.payes.map(i => i.id).sort()).toEqual(['biere', 'plat'])
    expect(r.champs).toEqual({ 'consommation.boisson': 1, 'consommation.eau': 1 })
  })
  it('les avantages vont aux articles les plus chers', () => {
    const r = repartirCommande({ benev: piercillia, jour: 'j', menuById: carte, stands, standBenev: stand,
      lignes: [{ id: 'cafe', qty: 2 }, { id: 'bissap', qty: 1 }] })
    // 2 boissons offertes : le bissap (3 €) et un café ; l'autre café est payé
    expect(r.valeurOfferte).toBe(450)
    expect(r.totalPaye).toBe(150)
  })
  it('offerts au stand des bénévoles, payés à leur stand ; tout article est possible', () => {
    const r = repartirCommande({ benev: piercillia, jour: 'j', menuById: carte, stands, standBenev: stand,
      lignes: [{ id: 'eau', qty: 1 }, { id: 'biere', qty: 2 }] })
    expect(r.offerts[0]).toMatchObject({ id: 'eau', standId: 's7', total: 0 })
    expect(r.payes[0]).toMatchObject({ id: 'biere', standId: 's2', total: 800 })
  })
  it('sans avantage restant, tout est payé', () => {
    const r = repartirCommande({ benev: { droits: {}, consommation: {} }, jour: 'j', menuById: carte, stands, standBenev: stand, lignes: [{ id: 'bissap', qty: 2 }] })
    expect(r.valeurOfferte).toBe(0); expect(r.totalPaye).toBe(600); expect(r.champs).toEqual({})
  })
})
