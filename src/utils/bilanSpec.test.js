import { describe, it, expect } from 'vitest'
import { bilanSpec, depenseDe, filtrerBracelet } from './bilanSpec'

const menu = [
  { nom: 'Bière', cat: 'Boissons', standId: 'bar' },
  { nom: 'Burger', cat: 'Repas', standId: 'food' },
  { nom: 'Crêpe', cat: 'Desserts', standId: 'food' },
]
const stands = [{ id: 'bar', nom: 'Bar Scène A', numero: 1 }, { id: 'food', nom: 'Food-truck', numero: 2 }]
const jourDe = (t) => ({ key: t.jour, label: t.jour })
const txs = [
  { type: 'credit', montant: 4000, jour: 'J1' },
  { type: 'debit', montant: 1100, jour: 'J1', items: [{ nom: 'Bière', qty: 2, prixUnit: 550, total: 1100 }] },
  { type: 'debit', montant: 1300, jour: 'J2', bracelet: 'R4TW8HNE', braceletPrenom: 'Léa', items: [{ nom: 'Burger', qty: 1, total: 900 }, { nom: 'Crêpe', qty: 1, total: 400 }] },
  { type: 'annulation', montant: 400, jour: 'J2' },
  { type: 'debit', montant: 500, jour: 'J2', label: 'Ancien achat sans détail' },
]

describe('bilan du spectateur', () => {
  it('dépenses : achats moins annulations, recharges à part', () => {
    expect(depenseDe({ type: 'credit', montant: 1 })).toBe(0)
    const b = bilanSpec(txs, { menu, stands, jourDe })
    expect(b.depense).toBe(1100 + 1300 - 400 + 500)
    expect(b.recharge).toBe(4000)
    expect(b.parJour).toEqual([{ key: 'J1', label: 'J1', montant: 1100, fois: 0 }, { key: 'J2', label: 'J2', montant: 1400, fois: 0 }])
  })
  it('par catégorie, par bracelet, stands les plus fréquentés', () => {
    const b = bilanSpec(txs, { menu, stands, jourDe })
    expect(b.parCategorie.map(c => [c.nom, c.montant])).toEqual([['Boissons', 1100], ['Repas', 900], ['Desserts', 400], ['Autres', 100]])
    expect(b.parBracelet.map(x => [x.nom, x.montant])).toEqual([['Léa', 1300], ['Téléphone ou code', 1200]])
    expect(b.stands.map(s => [s.nom, s.fois, s.montant])).toEqual([['Food-truck', 1, 1300], ['Bar Scène A', 1, 1100]])
  })
  it('filtre par bracelet', () => {
    expect(filtrerBracelet(txs, 'R4TW8HNE')).toHaveLength(1)
    expect(filtrerBracelet(txs, '')).toHaveLength(5)
  })
})
