import { describe, it, expect } from 'vitest'
import { planRemboursement } from './remboursement'

const credit = (montant, moyen, extra = {}) => ({ type: 'credit', montant, moyen, timestamp: extra.ts || '2026-07-12T19:00:00Z', ...extra })

describe('répartition du remboursement d\'un solde', () => {
  it('exemple de 27,50 € : 15 € Stripe, 7,50 € SumUp, 5 € espèces', () => {
    const txs = [
      credit(1500, 'en-ligne', { stripePaiement: 'pi_1' }),
      credit(750, 'cb', { date: '12/07/2026', heure: '21:14:00', staff: 'Paul' }),
      credit(1000, 'especes'),
    ]
    const r = planRemboursement({ solde: 2750, txs })
    expect(r.stripe).toEqual([{ paiement: 'pi_1', montant: 1500 }])
    expect(r.stripeTotal).toBe(1500)
    expect(r.sumup).toBe(750)
    expect(r.sumupRecharges[0]).toMatchObject({ montant: 750, staff: 'Paul' })
    expect(r.especes).toBe(500)
  })
  it('jamais plus que le solde, et les paiements en ligne les plus récents d\'abord', () => {
    const txs = [
      credit(2000, 'en-ligne', { stripePaiement: 'pi_vieux', ts: '2026-07-11T10:00:00Z' }),
      credit(1000, 'en-ligne', { stripePaiement: 'pi_recent', ts: '2026-07-12T10:00:00Z' }),
    ]
    const r = planRemboursement({ solde: 1800, txs })
    expect(r.stripe).toEqual([{ paiement: 'pi_recent', montant: 1000 }, { paiement: 'pi_vieux', montant: 800 }])
    expect(r.sumup + r.especes).toBe(0)
  })
  it('tient compte de ce qui a déjà été rendu', () => {
    const txs = [
      credit(1500, 'en-ligne', { stripePaiement: 'pi_1' }),
      { type: 'remboursement', montant: 1000, stripePaiement: 'pi_1' },
      credit(500, 'cb'),
      { type: 'remboursement', surPlace: true, moyen: 'cb', montant: 500 },
    ]
    const r = planRemboursement({ solde: 1200, txs })
    expect(r.stripeTotal).toBe(500)
    expect(r.sumup).toBe(0)
    expect(r.especes).toBe(700)
  })
  it('solde nul : rien à rembourser', () => {
    expect(planRemboursement({ solde: 0, txs: [credit(1500, 'en-ligne', { stripePaiement: 'pi_1' })] }).total).toBe(0)
  })
})
