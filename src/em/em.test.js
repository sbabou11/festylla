import { describe, it, expect } from 'vitest'
import { festDay, nextDay, dayLabel, quotasDuJour } from './jour'
import { adaptArtisteEm, duJour } from './artiste'

describe('journée de festival (coupure à 6 h, heure de Paris)', () => {
  it('une boisson prise à 1 h compte pour la veille, à 7 h pour le jour même', () => {
    expect(festDay(Date.parse('2027-05-15T23:30:00Z'))).toBe('2027-05-15')   // 1 h 30 à Paris le 16
    expect(festDay(Date.parse('2027-05-16T03:59:00Z'))).toBe('2027-05-15')   // 5 h 59 à Paris
    expect(festDay(Date.parse('2027-05-16T04:00:00Z'))).toBe('2027-05-16')   // 6 h à Paris
    expect(festDay({ toMillis: () => Date.parse('2027-05-16T10:00:00Z') })).toBe('2027-05-16')
  })
  it('jour suivant et libellé', () => {
    expect(nextDay('2027-05-31')).toBe('2027-06-01')
    expect(dayLabel('2027-05-15')).toBe('samedi 15 mai')
  })
  it('quotas : du jour pour une fiche Event Manager, totaux sinon', () => {
    const em = { source: 'event-manager', droitsJours: { '2027-05-15': { repas: 1 } }, consoJours: { '2027-05-15': { repas: 1 } } }
    expect(quotasDuJour(em, '2027-05-15')).toEqual({ droits: { repas: 1 }, conso: { repas: 1 } })
    expect(quotasDuJour(em, '2027-05-16')).toEqual({ droits: {}, conso: {} })
    expect(quotasDuJour({ droits: { eau: 3 }, consommation: { eau: 1 } })).toEqual({ droits: { eau: 3 }, conso: { eau: 1 } })
  })
})

describe('fiche artiste Event Manager présentée comme un créneau', () => {
  const menu = [
    { id: 'm1', typeConsommation: 'repas' }, { id: 'm3', typeConsommation: 'boisson' }, { id: 'm5', typeConsommation: 'eau' }, { id: 'x', typeConsommation: null },
  ]
  const a = { id: 'em-a7', nom: 'Awa Exemple', avantagesJours: { '2027-05-15': { repas: 2, boisson: 4, eau: 0 } } }
  const programme = [{ artiste: 'awa exemple ', titre: 'Concert', scene: 'Grande scène', type: 'musical', debut: Date.parse('2027-05-15T18:30:00Z'), fin: Date.parse('2027-05-15T19:30:00Z') }]

  it('avantages du jour et articles offerts répartis par type', () => {
    const c = adaptArtisteEm(a, { jour: '2027-05-15', offerts: ['m1', 'm3', 'm5', 'x'], menu, programme })
    expect(c).toMatchObject({ artiste: 'Awa Exemple', titre: 'Concert', scene: 'Grande scène', type: 'musical', _em: true })
    expect(c.avantages).toEqual({ drinks: 4, meals: 2, eaux: 0, drinkIds: ['m3'], mealIds: ['m1'], eauIds: ['m5'] })
    expect(c.debut).toBe(programme[0].debut)
  })
  it('un jour sans passage ni avantage', () => {
    const c = adaptArtisteEm(a, { jour: '2027-05-16', offerts: [], menu, programme })
    expect(c.debut).toBeNull()
    expect(c.avantages).toMatchObject({ drinks: 0, meals: 0, eaux: 0 })
  })
  it('ne compte que la journée en cours pour une fiche Event Manager', () => {
    const c = { _em: true, _jour: '2027-05-15' }
    const consos = [{ servedAt: Date.parse('2027-05-15T20:00:00Z') }, { servedAt: Date.parse('2027-05-16T08:00:00Z') }]
    expect(duJour(consos, c, 'servedAt')).toHaveLength(1)
    expect(duJour(consos, { id: 'cr1' }, 'servedAt')).toHaveLength(2)
  })
})
