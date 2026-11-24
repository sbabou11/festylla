import { describe, it, expect } from 'vitest'
import { repartirPanier, bilanBenevoles } from './avantagesBenevole'

describe('rapports des bénévoles (écran 13)', () => {
  it('offert et acheté comptés à part, soldes suivis', () => {
    const spectateurs = [{ id: 'FY-BVAAAAAA', solde: 1050, porteMonnaieBenevole: true }, { id: 'FY-K7Q3NP', solde: 900 }]
    const logs = [
      { type: 'benev-retrait', montant: 400, items: [{ qty: 1 }, { qty: 1 }] },
      { type: 'debit', specId: 'FY-BVAAAAAA', achatBenevole: true, montant: 1900, items: [{ qty: 1 }, { qty: 1 }] },
      { type: 'credit', specId: 'FY-BVAAAAAA', moyen: 'especes', montant: 2000 },
      { type: 'credit', specId: 'FY-BVAAAAAA', moyen: 'en-ligne', montant: 950 },
      { type: 'debit', specId: 'FY-K7Q3NP', montant: 500 },   // spectateur : ignoré
    ]
    expect(bilanBenevoles(logs, spectateurs)).toEqual({
      offertes: { n: 2, valeur: 400 }, achetees: { n: 2, montant: 1900 },
      recharges: { billetterie: 2000, enLigne: 950 }, depense: 1900, restant: 1050, comptes: 1,
    })
  })
})

// Mêmes cas que api/_borne/benevole.test.js (le serveur et l'écran doivent donner les mêmes chiffres)
const plat = { id: 'plat', nom: 'Plat athiéké poisson', prix: 1500, typeConsommation: 'repas' }
const bissap = { id: 'bissap', nom: 'Bissap 50 cl', prix: 300, typeConsommation: 'boisson' }
const cafe = { id: 'cafe', nom: 'Café', prix: 150, typeConsommation: 'boisson' }
const eau = { id: 'eau', nom: "Bouteille d'eau", prix: 100, typeConsommation: 'eau' }
const biere = { id: 'biere', nom: 'Bière 25 cl', prix: 400 }
const restants = { repas: 0, boisson: 2, eau: 1 }

describe('panier du bénévole (écran 13)', () => {
  it('la commande de la maquette : 23 € dont 4 € offerts, 19 € sur le solde', () => {
    const r = repartirPanier([{ ...plat, qty: 1 }, { ...bissap, qty: 1 }, { ...biere, qty: 1 }, { ...eau, qty: 1 }], restants)
    expect(r.total).toBe(2300); expect(r.valeurOfferte).toBe(400); expect(r.totalPaye).toBe(1900)
    expect(r.offertsPar).toEqual({ bissap: 1, eau: 1 })
    expect(r.reste).toEqual({ repas: 0, boisson: 1, eau: 0 })
  })
  it('les avantages vont aux articles les plus chers', () => {
    const r = repartirPanier([{ ...cafe, qty: 2 }, { ...bissap, qty: 1 }], restants)
    expect(r.valeurOfferte).toBe(450); expect(r.totalPaye).toBe(150)
  })
  it('panier vide : rien', () => {
    expect(repartirPanier([], restants)).toMatchObject({ total: 0, valeurOfferte: 0, totalPaye: 0 })
  })
})
