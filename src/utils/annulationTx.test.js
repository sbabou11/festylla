import { describe, it, expect } from 'vitest'
import { planAnnulation } from './annulationTx'
import { expectedTill } from './analyticsData'

const base = { specId: 'FY-K7Q3NP', montant: 2000, label: 'Recharge 20€' }

describe('annulation d\'une transaction', () => {
  it('recharge au guichet : le solde baisse et la caisse rend l\'argent', () => {
    const p = planAnnulation({ ...base, type: 'credit', moyen: 'especes' })
    expect(p.delta).toBe(-2000)
    expect(p.contre).toMatchObject({ type: 'remboursement', surPlace: true, moyen: 'especes' })
    expect(p.caisse).toEqual({ sens: 'moins', moyen: 'especes' })
  })
  it('la clôture retombe à zéro après l\'annulation d\'une recharge', () => {
    const t = '2026-11-20T10:00:00.000Z'
    const recharge = { ...base, type: 'credit', moyen: 'especes', staff: 'Paul', timestamp: t }
    const contre = { ...base, ...planAnnulation(recharge).contre, staff: 'Paul', timestamp: t }
    const r = expectedTill([recharge, contre], { from: Date.parse(t) - 1000, to: Date.parse(t) + 1000, staff: 'Paul' })
    expect(r.especes.total).toBe(0)
  })
  it('vente à la caisse : le solde est recrédité, la caisse n\'est pas touchée', () => {
    const p = planAnnulation({ ...base, type: 'debit', label: 'Bière' })
    expect(p).toMatchObject({ delta: 2000, contre: { type: 'annulation' }, caisse: null })
  })
  it('remboursement de solde et corrections', () => {
    expect(planAnnulation({ ...base, type: 'remboursement', surPlace: true, moyen: 'cb' })).toMatchObject({ delta: 2000, contre: { type: 'credit', moyen: 'cb' }, caisse: { sens: 'plus', moyen: 'cb' } })
    expect(planAnnulation({ ...base, type: 'remboursement' })).toMatchObject({ delta: 2000, contre: { type: 'credit_correction' }, caisse: null })
    expect(planAnnulation({ ...base, type: 'credit_correction' }).delta).toBe(-2000)
    expect(planAnnulation({ ...base, type: 'debit_correction' }).delta).toBe(2000)
  })
  it('refuse ce qui se traite ailleurs ou ne s\'annule pas', () => {
    expect(() => planAnnulation({ ...base, type: 'credit', moyen: 'en-ligne' })).toThrow(/en ligne/)
    expect(() => planAnnulation({ ...base, type: 'debit', commandeNumero: 47 })).toThrow(/ticket/)
    expect(() => planAnnulation({ ...base, type: 'remboursement', demandeId: 'd1' })).toThrow(/spectateur/)
    expect(() => planAnnulation({ ...base, type: 'credit', annulee: true })).toThrow(/déjà annulée/)
    expect(() => planAnnulation({ ...base, type: 'remboursement', annuleTx: 'x' })).toThrow(/annulation/)
    expect(() => planAnnulation({ ...base, type: 'artist-gift' })).toThrow(/ne s'annule pas/)
    expect(() => planAnnulation({ ...base, specId: null, type: 'debit' })).toThrow(/aucun compte/)
  })
})
