import { describe, it, expect } from 'vitest'
import { jwtClaims, microsoftEmail, microsoftErrorMessage, pickAccountByEmail, tenantAllowed } from './msAccount'

const TENANT = '11111111-2222-3333-4444-555555555555'
const jwt = (claims) => 'x.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.y'

describe('connexion Microsoft : recherche de la fiche par e-mail', () => {
  const groups = [
    { kind: 'staff', docs: [{ id: 'r1', data: { email: 'Caisse@FestYlla.com', role: 'stand' } }] },
    { kind: 'staff', eventId: 'ev1', docs: [{ id: 's1', data: { email: 'awa@festylla.com', role: 'admin' } }] },
    { kind: 'benevole', eventId: 'ev1', docs: [{ id: 'b1', data: { email: 'moussa@festylla.com' } }, { id: 'b2', data: { email: 'awa@festylla.com' } }] },
  ]

  it("retrouve une fiche sans tenir compte des majuscules", () => {
    expect(pickAccountByEmail(groups, ' caisse@festylla.COM ')).toMatchObject({ id: 'r1', kind: 'staff', eventId: null })
  })
  it('préfère la fiche staff à la fiche bénévole de la même personne', () => {
    expect(pickAccountByEmail(groups, 'awa@festylla.com')).toMatchObject({ id: 's1', kind: 'staff', eventId: 'ev1' })
  })
  it('retrouve un bénévole', () => {
    expect(pickAccountByEmail(groups, 'moussa@festylla.com')).toMatchObject({ id: 'b1', kind: 'benevole' })
  })
  it("refuse une adresse inconnue ou vide : aucun accès n'est créé", () => {
    expect(pickAccountByEmail(groups, 'inconnu@festylla.com')).toBeNull()
    expect(pickAccountByEmail(groups, '')).toBeNull()
    expect(pickAccountByEmail([{ kind: 'staff', docs: [{ id: 'x', data: {} }] }], '')).toBeNull()
  })
})

describe('connexion Microsoft : compte et annuaire', () => {
  it("lit l'adresse du compte, à défaut l'adresse de connexion", () => {
    expect(microsoftEmail({ user: { email: 'Awa@FestYlla.com' } })).toBe('awa@festylla.com')
    expect(microsoftEmail({ user: { email: null }, profile: { userPrincipalName: 'Moussa@festylla.com' } })).toBe('moussa@festylla.com')
    expect(microsoftEmail({ user: {}, claims: { preferred_username: 'b@festylla.com' } })).toBe('b@festylla.com')
  })
  it("n'accepte que l'annuaire Fest'Ylla", () => {
    expect(tenantAllowed({ claims: jwtClaims(jwt({ tid: TENANT })) }, TENANT)).toBe(true)
    expect(tenantAllowed({ claims: jwtClaims(jwt({ tid: '99999999-2222-3333-4444-555555555555' })) }, TENANT)).toBe(false)
    expect(tenantAllowed({ profile: { tid: TENANT.toUpperCase() } }, TENANT)).toBe(true)
    expect(tenantAllowed({ claims: { tid: TENANT } }, '')).toBe(false)
  })
  it('un jeton illisible ne fait pas planter la connexion', () => {
    expect(jwtClaims('nimporte quoi')).toEqual({})
    expect(jwtClaims(undefined)).toEqual({})
  })
  it('fermer la fenêtre Microsoft ne déclenche aucun message', () => {
    expect(microsoftErrorMessage('auth/popup-closed-by-user')).toBeNull()
    expect(microsoftErrorMessage('auth/popup-blocked')).toMatch(/bloqué/)
    expect(microsoftErrorMessage('autre')).toMatch(/mot de passe/)
  })
})
