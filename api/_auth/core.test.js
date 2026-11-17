import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { hashPassword, checkPassword, passwordFields, validateNewPassword, legacyHash, blockedMinutes, afterFailure, LIMIT, sessionFor, publicAccount, counterKey } = require('./core.js')

const DEL = Symbol('supprimer')

describe('mots de passe', () => {
  it('empreinte forte : vraie pour le bon mot de passe, fausse sinon, sel différent à chaque fois', () => {
    const h = hashPassword('festival2027')
    expect(h).toMatch(/^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/)
    expect(hashPassword('festival2027')).not.toBe(h)
    expect(checkPassword({ motDePasseHash: h }, 'festival2027')).toEqual({ ok: true, upgrade: false })
    expect(checkPassword({ motDePasseHash: h }, 'festival2028').ok).toBe(false)
  })
  it('accepte une dernière fois les anciens formats, puis demande leur remplacement', () => {
    expect(checkPassword({ password: 'alice123' }, 'alice123')).toEqual({ ok: true, upgrade: true })
    expect(checkPassword({ pwd: 'x1' }, 'x1')).toEqual({ ok: true, upgrade: true })
    expect(checkPassword({ passwordHash: legacyHash('awa123') }, 'awa123')).toEqual({ ok: true, upgrade: true })
    expect(checkPassword({ password: 'alice123' }, 'alice124').ok).toBe(false)
  })
  it('une fiche passée à l\'empreinte forte n\'accepte plus l\'ancien mot de passe en clair', () => {
    expect(checkPassword({ motDePasseHash: hashPassword('nouveau1'), password: 'ancien' }, 'ancien').ok).toBe(false)
  })
  it('les champs écrits retirent tout ancien mot de passe', () => {
    const f = passwordFields('nouveau1', DEL)
    expect(f.password).toBe(DEL); expect(f.pwd).toBe(DEL); expect(f.passwordHash).toBe(DEL)
    expect(checkPassword({ motDePasseHash: f.motDePasseHash }, 'nouveau1').ok).toBe(true)
  })
  it('refuse un mot de passe trop court', () => {
    expect(validateNewPassword('abc')).toMatch(/au moins 6/)
    expect(validateNewPassword('abcdef')).toBeNull()
  })
})

describe('limite des essais de connexion', () => {
  it('bloque 15 minutes après 8 échecs en 15 minutes', () => {
    let rec = null, t = 0
    for (let i = 0; i < LIMIT.fails - 1; i++) { rec = afterFailure(rec, t); t += 1000 }
    expect(blockedMinutes(rec, t)).toBe(0)
    rec = afterFailure(rec, t)
    expect(blockedMinutes(rec, t)).toBe(15)
    expect(blockedMinutes(rec, t + LIMIT.blockMs + 1)).toBe(0)
  })
  it('repart de zéro après 15 minutes sans échec', () => {
    const rec = afterFailure({ echecs: 7, debutMs: 0 }, LIMIT.windowMs + 1)
    expect(rec.echecs).toBe(1)
  })
  it('ne garde ni l\'adresse réseau ni l\'identifiant en clair', () => {
    expect(counterKey('ip', '82.1.2.3')).not.toContain('82.1.2.3')
  })
})

describe('session', () => {
  it('donne le rôle et l\'événement de la fiche, sans jamais renvoyer de mot de passe', () => {
    const acc = { kind: 'staff', id: 's1', eventId: 'EV1', path: 'events/EV1/staff/s1', data: { nom: 'Awa', role: 'billetterie', eventId: 'EV1', password: 'x', motDePasseHash: 'y', passwordHash: 'z' } }
    expect(sessionFor(acc)).toEqual({ uid: 'staff:EV1:s1', claims: { yc: 1, type: 'staff', role: 'billetterie', eventIds: ['EV1'], fiche: 'events/EV1/staff/s1' } })
    const pub = publicAccount(acc)
    expect(pub).not.toHaveProperty('password'); expect(pub).not.toHaveProperty('motDePasseHash'); expect(pub).not.toHaveProperty('passwordHash')
    expect(sessionFor({ ...acc, kind: 'benevole', data: { role: 'admin' } }).claims.role).toBe('benevole')
  })
})

describe('sessions des pages publiques', () => {
  const { sameKey, accountKey, spectatorSession, deviceSession, linkDocId, newKey, afterFailure, blockedMinutes, PUBLIC_LIMIT } = require('./core.js')
  it('la clé du billet prime sur celle du compte, et un ancien compte n\'en a pas', () => {
    expect(accountKey({ billet: { cle: 'a'.repeat(32) }, cle: 'b'.repeat(32) })).toBe('a'.repeat(32))
    expect(accountKey({ cle: 'b'.repeat(32) })).toBe('b'.repeat(32))
    expect(accountKey({ id: 'FY-4A2B' })).toBe('')
  })
  it('compare les clés et refuse une clé vide ou mal formée', () => {
    const k = newKey()
    expect(k).toMatch(/^[0-9a-f]{32}$/)
    expect(sameKey(k, k)).toBe(true)
    expect(sameKey('', '')).toBe(false)
    expect(sameKey('zz', 'zz')).toBe(false)
    expect(sameKey(newKey(), k)).toBe(false)
  })
  it('une session spectateur ne porte que son compte et son événement', () => {
    expect(spectatorSession('EV1', 'FY-K7Q3NP', { id: 'FY-K7Q3NP' })).toEqual({
      uid: 'spectateur:EV1:FY-K7Q3NP',
      claims: { yc: 1, type: 'spectateur', role: 'spectateur', eventIds: ['EV1'], specId: 'FY-K7Q3NP', specDoc: 'FY-K7Q3NP' },
    })
  })
  it('liens d\'appareils et liens personnels', () => {
    expect(linkDocId('borne', 'x')).toBe('borne')
    expect(linkDocId('artiste', 'cr1')).toBe('artiste-cr1')
    expect(deviceSession('artiste', 'EV1', 'cr1').claims).toEqual({ yc: 1, type: 'artiste', role: 'artiste', eventIds: ['EV1'], creneauId: 'cr1' })
    expect(deviceSession('ecran', 'EV1').uid).toBe('ecran:EV1')
  })
  it('essayer des codes en série depuis un appareil le bloque 30 minutes', () => {
    let rec = null
    for (let i = 0; i < PUBLIC_LIMIT.fails; i++) rec = afterFailure(rec, 1000 + i, PUBLIC_LIMIT)
    expect(blockedMinutes(rec, 2000)).toBe(30)
  })
})
