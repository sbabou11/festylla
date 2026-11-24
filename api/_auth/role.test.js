import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { posteRole, bornes, creneauxDuRole, fenetreRole, claimsRole, roleActif, avecException, exceptionActive } = require('./role.js')

const MIN = 60000
// 15 mai 2027 : heure d'été, Paris = UTC+2
const paris = (h, m = 0, d = 15) => Date.UTC(2027, 4, d, h - 2, m)

const posts = { pb: { nom: 'Billetterie', role: 'billetterie' }, pe: { nom: 'Porte', controleBillets: true }, bar: { nom: 'Bar' } }
const shifts = [
  { date: '2027-05-15', debut: '12:35', fin: '15:35', postes: { pb: { assignments: ['b1'] } } },
  { date: '2027-05-15', debut: '20:00', fin: '01:30', postes: { pb: { assignments: ['b1'] } } },
  { date: '2027-05-15', debut: '16:00', fin: '18:00', postes: { bar: { assignments: ['b1'] }, pe: { assignments: ['b2'] } } },
  { date: '', debut: '', fin: '', postes: { pb: { assignments: ['b1'] } } },   // créneau non daté
]

describe('onglet de rôle (écran 11)', () => {
  it('rôle d\'un poste : nouveau réglage, ancien « contrôle les billets », rien', () => {
    expect(posteRole(posts.pb)).toBe('billetterie')
    expect(posteRole(posts.pe)).toBe('controle_entree')
    expect(posteRole(posts.bar)).toBe('')
    expect(posteRole({ role: 'admin' })).toBe('')
  })
  it('heure de Paris et passage de minuit', () => {
    expect(bornes('2027-05-15', '12:35', '15:35')).toEqual({ debut: paris(12, 35), fin: paris(15, 35) })
    expect(bornes('2027-05-15', '20:00', '01:30').fin).toBe(paris(1, 30, 16))
    expect(bornes('', '12:00', '13:00')).toBeNull()
  })
  it('ne garde que les créneaux du bénévole sur un poste de son rôle', () => {
    const c = creneauxDuRole({ shifts, posts, benevId: 'b1', role: 'billetterie' })
    expect(c.map(x => x.poste)).toEqual(['Billetterie', 'Billetterie'])
    expect(creneauxDuRole({ shifts, posts, benevId: 'b2', role: 'controle_entree' })).toHaveLength(1)
    expect(creneauxDuRole({ shifts, posts, benevId: 'b1', role: 'controle_entree' })).toHaveLength(0)
  })
  it('les six moments de la maquette', () => {
    const c = creneauxDuRole({ shifts, posts, benevId: 'b1', role: 'billetterie' })
    expect(fenetreRole(c, 'billetterie', paris(12, 10))).toMatchObject({ etat: 'tot', ouvreA: paris(12, 20) })
    expect(fenetreRole(c, 'billetterie', paris(12, 22))).toMatchObject({ etat: 'ouvert', fin: paris(15, 35), jusqua: paris(15, 45) })
    expect(fenetreRole(c, 'billetterie', paris(13, 10)).etat).toBe('ouvert')
    expect(fenetreRole(c, 'billetterie', paris(15, 50))).toMatchObject({ etat: 'cloture', jusqua: paris(16, 5) })
    expect(fenetreRole(c, 'billetterie', paris(16, 10)).etat).toBe('tot')   // le créneau du soir arrive
    expect(fenetreRole(c, 'billetterie', paris(2, 10, 16)).etat).toBe('ferme')
  })
  it('pas de clôture après la fin pour les autres rôles', () => {
    const c = creneauxDuRole({ shifts, posts, benevId: 'b2', role: 'controle_entree' })
    expect(fenetreRole(c, 'controle_entree', paris(18, 10)).etat).toBe('ferme')
  })
  it('ouverture exceptionnelle (écran 12) : hors créneau, jusqu\'à l\'heure choisie', () => {
    const c = creneauxDuRole({ shifts, posts, benevId: 'b1', role: 'billetterie' })
    const fiche = { roleException: { jusqua: paris(17, 40), le: paris(16, 40), parNom: 'Samba', motif: 'Renfort' } }
    const f = avecException(fenetreRole(c, 'billetterie', paris(17)), fiche, paris(17))
    expect(f).toMatchObject({ etat: 'ouvert', fin: paris(17, 40), jusqua: paris(17, 50), exception: { parNom: 'Samba' } })
    expect(claimsRole({}, { role: 'billetterie', fenetre: f }).roleExc).toBe(true)
    expect(avecException(fenetreRole(c, 'billetterie', paris(17, 45)), fiche, paris(17, 45)).etat).toBe('tot')   // expirée
    expect(exceptionActive({}, paris(17))).toBeNull()
    // Pendant un créneau qui va plus loin, le créneau l'emporte
    expect(avecException(fenetreRole(c, 'billetterie', paris(13)), { roleException: { jusqua: paris(14) } }, paris(13)).fin).toBe(paris(15, 35))
  })
  it('jetons : l\'accès s\'arrête à l\'heure prévue, la clôture n\'ouvre pas tout', () => {
    const base = { yc: 1, type: 'benevole', role: 'benevole', eventIds: ['ev'], fiche: 'events/ev/benevoles/b1' }
    const ouvert = claimsRole(base, { role: 'billetterie', fenetre: { etat: 'ouvert', fin: paris(15, 35), jusqua: paris(15, 45) } })
    expect(ouvert).toMatchObject({ type: 'benevole', roleEquipe: 'billetterie', roleMode: 'complet', roleJusqua: paris(15, 45) })
    expect(roleActif(ouvert, paris(15, 44))).toBe(true)
    expect(roleActif(ouvert, paris(15, 45))).toBe(false)
    const cloture = claimsRole(base, { role: 'billetterie', fenetre: { etat: 'cloture', fin: paris(15, 35), jusqua: paris(16, 5) } })
    expect(roleActif(cloture, paris(15, 50))).toBe(false)
    expect(roleActif(base, paris(13))).toBe(false)
  })
})
