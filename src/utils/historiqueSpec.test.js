import { describe, it, expect } from 'vitest'
import { effetSolde, signeDe, destinationRemboursement, totauxCompte } from './historiqueSpec'

const txs = [
  { type: 'credit', montant: 3000 },
  { type: 'debit', montant: 900 },
  { type: 'annulation', montant: 900 },                              // ticket remboursé
  { type: 'remboursement', montant: 1500, moyen: 'en-ligne' },
  { type: 'annulation', montant: 0 },                                // ancienne trace sans montant
]

describe('historique de l\'espace spectateur', () => {
  it('chaque opération a son effet sur le solde et son signe', () => {
    expect(txs.map(effetSolde)).toEqual([3000, -900, 900, -1500, 0])
    expect(txs.map(signeDe)).toEqual(['+', '−', '+', '−', ''])
    expect(effetSolde({ type: 'credit_correction', montant: 500 })).toBe(500)
    expect(effetSolde({ type: 'debit_correction', montant: 500 })).toBe(-500)
  })
  it('la somme des effets redonne le solde', () => {
    expect(txs.reduce((a, t) => a + effetSolde(t), 0)).toBe(1500)
  })
  it('totaux : un ticket remboursé ne compte plus comme dépensé', () => {
    expect(totauxCompte(txs)).toEqual({ recharge: 3000, depense: 0, rembourse: 1500 })
  })
  it('dit où est allé un remboursement', () => {
    expect(destinationRemboursement(txs[3])).toBe('sur votre carte')
    expect(destinationRemboursement({ type: 'remboursement', moyen: 'especes' })).toBe('en espèces à la billetterie')
    expect(destinationRemboursement({ type: 'debit' })).toBe('')
  })
})
