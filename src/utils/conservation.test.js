import { describe, it, expect } from 'vitest'
import { finDuJourApres, calendrierEdition, editionsAEffacer } from './conservation'

const ev = { id: 'fy27', date: '2027-07-04', dateFin: '2027-07-06' }
const t = (s) => Date.parse(s)

describe('conservation des données (24/11/2026)', () => {
  it('calcule 2 mois, 4 mois et 10 ans après le dernier jour', () => {
    const c = calendrierEdition(ev, t('2027-08-01T12:00:00Z'))
    expect(new Date(c.remboursements).toISOString()).toBe('2027-09-06T23:59:59.000Z')
    expect(new Date(c.effacement).toISOString()).toBe('2027-11-06T23:59:59.000Z')
    expect(new Date(c.archive).toISOString()).toBe('2037-07-06T23:59:59.000Z')
  })
  it('ramène au dernier jour du mois (31 octobre + 4 mois = 28 février)', () => {
    expect(new Date(finDuJourApres('2027-10-31', 4)).toISOString()).toBe('2028-02-29T23:59:59.000Z')
    expect(new Date(finDuJourApres('2026-10-31', 4)).toISOString()).toBe('2027-02-28T23:59:59.000Z')
  })
  it('suit les étapes et le niveau du rappel', () => {
    expect(calendrierEdition(ev, t('2027-07-05T12:00:00Z')).etape).toBe(0)
    expect(calendrierEdition(ev, t('2027-08-01T12:00:00Z'))).toMatchObject({ etape: 1, niveau: 'conservation' })
    expect(calendrierEdition(ev, t('2027-09-20T12:00:00Z'))).toMatchObject({ etape: 2, niveau: 'conservation' })
    expect(calendrierEdition(ev, t('2027-10-16T12:00:00Z'))).toMatchObject({ etape: 3, niveau: 'bientot', jours: 22 })
    expect(calendrierEdition(ev, t('2027-11-10T12:00:00Z'))).toMatchObject({ etape: 3, niveau: 'depasse' })
    expect(calendrierEdition({ id: 'x' })).toBeNull()
  })
  it('rappelle seulement les éditions passées, ni active ni archive consultée', () => {
    const now = t('2027-11-10T12:00:00Z')
    const liste = [ev, { ...ev, id: 'active', actif: true }, { ...ev, id: 'arch', archive: true }, { id: 'futur', date: '2028-07-01' }]
    const r = editionsAEffacer(liste, { now, estArchive: e => !!e.archive })
    expect(r.map(x => x.event.id)).toEqual(['fy27'])
  })
})
