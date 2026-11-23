import { describe, it, expect } from 'vitest'
import {
  jeton, lireJetonEspace, jetonEspaceValable, jetonsAVenir, nouveauPassage, passageValable, PERIODE_MS, PASSAGE_MS,
} from './espace'
import { lireJeton } from './tournant'
import { jetonEspace, parseQrEspace } from '../../src/utils/qrEspace'
import { parseQrTournant } from '../../src/utils/qrTournant'
import { createWedge } from '../../src/utils/scanWedge'

const cle = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const benev = { kind: 'benevole', cle, ev: 'festylla-2027', id: 'em-u31' }
const artiste = { kind: 'artiste', cle, ev: 'festylla-2027', id: 'Xy7_kLm0pQ2rS3tU4vW5' }
const t0 = Date.UTC(2027, 4, 14, 18, 0, 0)

describe('QR tournant des espaces bénévole et artiste', () => {
  it('le téléphone et le serveur calculent le même jeton', async () => {
    for (const b of [benev, artiste]) {
      for (const ms of [t0, t0 + 31 * 1000, t0 + 3600 * 1000]) {
        expect(await jetonEspace({ ...b, ms })).toBe(jeton({ ...b, ms }))
      }
    }
    // Clé en majuscules (adresse recopiée) : même jeton
    expect(await jetonEspace({ ...benev, cle: cle.toUpperCase(), ms: t0 })).toBe(jeton({ ...benev, ms: t0 }))
  })
  it('préfixes distincts, que des majuscules, des chiffres et des tirets', () => {
    const jb = jeton({ ...benev, ms: t0 }), ja = jeton({ ...artiste, ms: t0 })
    expect(jb).toMatch(/^YB-[A-Z2-7]+-[0-9A-Z]+-[A-Z2-7]{12}$/)
    expect(ja).toMatch(/^YA-[A-Z2-7]+-[0-9A-Z]+-[A-Z2-7]{12}$/)
  })
  it("retrouve la fiche ou le créneau, casse d'origine comprise", () => {
    const ja = jeton({ ...artiste, ms: t0 })
    expect(lireJetonEspace(ja)).toMatchObject({ kind: 'artiste', id: artiste.id })
    expect(parseQrEspace('?&é"', ja.toLowerCase())).toEqual({ kind: 'artiste', id: artiste.id, jeton: ja })
    expect(parseQrEspace(jeton({ ...benev, ms: t0 }))).toMatchObject({ kind: 'benevole', id: 'em-u31' })
  })
  it('valable sur le moment, refusé après quelques fenêtres', () => {
    const lu = lireJetonEspace(jeton({ ...benev, ms: t0 }))
    expect(jetonEspaceValable({ lu, ...benev, ms: t0 + 20 * 1000 })).toBe(true)
    expect(jetonEspaceValable({ lu, ...benev, ms: t0 + 2 * PERIODE_MS })).toBe(true)    // horloge un peu décalée
    expect(jetonEspaceValable({ lu, ...benev, ms: t0 - 2 * PERIODE_MS })).toBe(true)
    expect(jetonEspaceValable({ lu, ...benev, ms: t0 + 4 * PERIODE_MS })).toBe(false)   // photo réutilisée
    expect(jetonEspaceValable({ lu, ...benev, ms: t0 - 4 * PERIODE_MS })).toBe(false)
  })
  it('refuse une autre clé, un autre événement, une autre fiche ou un autre type', () => {
    const lu = lireJetonEspace(jeton({ ...benev, ms: t0 }))
    expect(jetonEspaceValable({ lu, ...benev, cle: 'b'.repeat(32), ms: t0 })).toBe(false)
    expect(jetonEspaceValable({ lu, ...benev, ev: 'autre', ms: t0 })).toBe(false)
    expect(jetonEspaceValable({ lu: { ...lu, id: 'em-u32' }, ...benev, ms: t0 })).toBe(false)
    expect(jetonEspaceValable({ lu: { ...lu, kind: 'artiste' }, ...benev, ms: t0 })).toBe(false)
    expect(jetonEspaceValable({ lu, ...benev, cle: '', ms: t0 })).toBe(false)
    // Le jeton d'un spectateur calculé avec la même clé n'est pas un jeton d'espace
    expect(lireJetonEspace('YQ-K7Q3NP-1ABCD-ABCDEFGHIJKL')).toBeNull()
  })
  it("ne se confond pas avec le QR d'un spectateur ni avec un ancien lien", () => {
    const jb = jeton({ ...benev, ms: t0 })
    expect(parseQrTournant(jb)).toBeNull()
    expect(lireJeton(jb)).toBeNull()
    expect(parseQrEspace(`https://x.fr/benevole?id=em-u31&ev=e1&k=${cle}`)).toBeNull()
    expect(parseQrEspace('YQ-K7Q3NP-1ABCD-ABCDEFGHIJKL')).toBeNull()
  })
  it("le lecteur de la borne le reconnaît avant un code « FY-… » qu'il contiendrait par hasard", () => {
    // Fenêtre dont l'écriture en base 36 finit par « FY » : le jeton contient « FY-<signature> »
    const f0 = Math.floor(t0 / PERIODE_MS)
    const f = Array.from({ length: 2000 }, (_, i) => f0 + i).find(x => x.toString(36).toUpperCase().endsWith('FY'))
    const id = benev.id
    const j = jeton({ ...benev, ms: f * PERIODE_MS })
    expect(j).toMatch(/FY-[A-Z2-7]{12}$/)
    const vus = []
    let t = 0
    const w = createWedge({ onEspace: (q) => vus.push(['espace', q]), onScan: (c) => vus.push(['billet', c]), onTournant: () => vus.push(['tournant']), now: () => (t += 5) })
    for (const ch of j) w.feed({ key: ch, code: /[A-Z]/.test(ch) ? `Key${ch}` : /\d/.test(ch) ? `Digit${ch}` : 'Minus', shiftKey: /[A-Z]/.test(ch) })
    w.feed({ key: 'Enter', code: 'Enter' })
    expect(vus).toEqual([['espace', { kind: 'benevole', id, jeton: j }]])
  })
  it('repli sans clé sur le téléphone : jetons des prochaines fenêtres, identiques', () => {
    const liste = jetonsAVenir({ ...benev, ms: t0, n: 10 })
    expect(liste).toHaveLength(10)
    liste.forEach((x, i) => expect(x.jeton).toBe(jeton({ ...benev, ms: t0 + i * PERIODE_MS })))
  })
  it('passage de la borne : signé, limité dans le temps, propre à la fiche', () => {
    const p = nouveauPassage({ ...benev, ms: t0 })
    expect(passageValable({ passage: p, cle, ev: benev.ev, ms: t0 + 60 * 1000 })).toBe(true)
    expect(passageValable({ passage: p, cle, ev: benev.ev, ms: t0 + PASSAGE_MS + 1 })).toBe(false)
    expect(passageValable({ passage: { ...p, id: 'em-u32' }, cle, ev: benev.ev, ms: t0 })).toBe(false)
    expect(passageValable({ passage: { ...p, kind: 'artiste' }, cle, ev: benev.ev, ms: t0 })).toBe(false)
    expect(passageValable({ passage: { ...p, exp: p.exp + 60 * 60 * 1000 }, cle, ev: benev.ev, ms: t0 })).toBe(false)
    expect(passageValable({ passage: p, cle: 'b'.repeat(32), ev: benev.ev, ms: t0 })).toBe(false)   // nouveau lien
    expect(passageValable({ passage: p, cle, ev: 'autre', ms: t0 })).toBe(false)
  })
})
