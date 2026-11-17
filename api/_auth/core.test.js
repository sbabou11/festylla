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
