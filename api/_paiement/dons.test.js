import { describe, it, expect } from 'vitest'
import * as serveur from './dons'
import * as appli from '../../src/utils/dons'

const jour = (ms) => new Date(ms).toISOString().slice(0, 10)

describe('dons à l\'ONG Ylla et date limite de remboursement', () => {
  it('date limite : deux mois après le dernier jour, fin de journée', () => {
    expect(jour(serveur.limiteRemboursement({ date: '2027-06-06', dateFin: '2027-06-08' }))).toBe('2027-08-08')
    expect(jour(serveur.limiteRemboursement({ date: '2027-06-06' }))).toBe('2027-08-06')
    expect(serveur.limiteRemboursement({})).toBe(null)
    // Événement terminé avant la mise en service : pas de date limite, donc jamais de délai dépassé
    expect(serveur.limiteRemboursement({ date: '2026-06-06', dateFin: '2026-06-08' })).toBe(null)
    expect(serveur.delaiDepasse({ date: '2026-06-06' }, Date.UTC(2030, 0, 1))).toBe(false)
  })
  it('date limite : jour inexistant ramené à la fin du mois, passage d\'année', () => {
    expect(jour(serveur.limiteRemboursement({ date: '2026-12-31' }))).toBe('2027-02-28')
    expect(jour(serveur.limiteRemboursement({ date: '2026-11-21' }))).toBe('2027-01-21')
  })
  it('délai dépassé seulement après la date limite', () => {
    const ev = { date: '2027-06-05', dateFin: '2027-06-06' }
    expect(serveur.delaiDepasse(ev, Date.UTC(2027, 7, 6, 12))).toBe(false)
    expect(serveur.delaiDepasse(ev, Date.UTC(2027, 7, 7, 12))).toBe(true)
    expect(serveur.delaiDepasse({}, Date.UTC(2030, 0, 1))).toBe(false)
  })
  it('reversement : jamais pour un événement terminé avant la mise en service, ni deux fois', () => {
    const tard = Date.UTC(2030, 0, 1)
    expect(serveur.reversementApplicable({ date: '2026-06-06', dateFin: '2026-06-08' }, tard)).toBe(false)
    expect(serveur.reversementApplicable({ date: '2027-06-05', dateFin: '2027-06-06' }, tard)).toBe(true)
    expect(serveur.reversementApplicable({ date: '2027-06-05', soldesReverses: { le: 'x' } }, tard)).toBe(false)
    expect(serveur.reversementApplicable({ date: '2027-06-05' }, Date.UTC(2027, 6, 1))).toBe(false)
    expect(serveur.reversementApplicable({}, tard)).toBe(false)
  })
  it('montant du don : entier, 1 € au moins, jamais plus que le solde', () => {
    expect(serveur.montantDon(1000, 2750)).toBe(1000)
    expect(serveur.montantDon(2750, 2750)).toBe(2750)
    expect(serveur.montantDon(2751, 2750)).toBe(0)
    expect(serveur.montantDon(99, 2750)).toBe(0)
    expect(serveur.montantDon(10.5, 2750)).toBe(0)
    expect(serveur.montantDon('1000', 2750)).toBe(1000)
    expect(serveur.montantDon(-500, 2750)).toBe(0)
  })
  it('l\'appli et le serveur appliquent les mêmes règles', () => {
    const evs = [{ date: '2026-06-06', dateFin: '2026-06-08' }, { date: '2026-12-31' }, { date: '2027-06-05' }, {}]
    const t = Date.UTC(2027, 8, 1)
    for (const ev of evs) {
      expect(appli.limiteRemboursement(ev)).toBe(serveur.limiteRemboursement(ev))
      expect(appli.delaiDepasse(ev, t)).toBe(serveur.delaiDepasse(ev, t))
      expect(appli.reversementApplicable(ev, t)).toBe(serveur.reversementApplicable(ev, t))
    }
    for (const [m, s] of [[1000, 2750], [99, 2750], [2751, 2750], [100, 100]]) expect(appli.montantDon(m, s)).toBe(serveur.montantDon(m, s))
    expect(appli.DON_MIN).toBe(serveur.DON_MIN)
    expect(appli.EN_SERVICE_DEPUIS).toBe(serveur.EN_SERVICE_DEPUIS)
  })
})
