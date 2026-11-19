import { describe, it, expect } from 'vitest'
import { planRemboursement as client } from './remboursementPlan'
import { planRemboursement as serveur } from '../../api/_paiement/remboursement'

describe('aperçu du remboursement dans l\'espace spectateur', () => {
  it('donne la même répartition que le serveur', () => {
    const cas = [
      { solde: 2750, txs: [{ type: 'credit', moyen: 'en-ligne', stripePaiement: 'pi_1', montant: 1500, timestamp: '2026-07-12T19:00:00Z' }, { type: 'credit', moyen: 'cb', montant: 750, staff: 'Paul' }, { type: 'credit', moyen: 'especes', montant: 1000 }] },
      { solde: 900, txs: [{ type: 'credit', moyen: 'en-ligne', stripePaiement: 'pi_1', montant: 1500 }, { type: 'remboursement', stripePaiement: 'pi_1', montant: 1000 }] },
      { solde: 0, txs: [] },
    ]
    cas.forEach(c => expect(client(c)).toEqual(serveur(c)))
  })
})
