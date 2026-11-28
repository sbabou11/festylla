import { describe, it, expect } from 'vitest'
const { preparerAcces, executerAcces, empreinteLien, lienBenevole } = require('./envoiAcces.js')

const BASE = 'https://festylla.vercel.app'
const ok = { ok: true, status: 200, text: '' }

function io({ fiches, cles = {}, state = { actif: true }, reponse = ok }) {
  const posts = [], marques = {}, creees = []
  const o = {
    state,
    fiches: async () => fiches,
    cles: async () => cles,
    creerCles: async (l) => { creees.push(...l) },
    post: async (b) => { posts.push(b); return reponse },
    marquer: async (id, a) => { marques[id] = a },
    save: async (n) => { o.saved = n },
  }
  return { o, posts, marques, creees }
}

describe('accès des bénévoles vers Event Manager (règle 1.3)', () => {
  it('rien tant que l’organisateur n’a pas activé', async () => {
    const t = io({ fiches: [{ id: 'em-u1', emId: 'u1', actif: true }], state: { actif: false } })
    expect(await executerAcces(t.o, { ev: 'ev1', base: BASE })).toEqual({ envoye: false })
    expect(t.posts).toHaveLength(0)
  })
  it('envoie l’id d’Event Manager et le lien, crée la clé manquante, puis ne renvoie pas', async () => {
    const t = io({ fiches: [{ id: 'em-u1', emId: 'u1', actif: true }, { id: 'b-local', actif: true }], cles: {} })
    const r = await executerAcces(t.o, { ev: 'ev1', base: BASE, now: 1000, newId: () => 'a'.repeat(32) })
    expect(r.envoye).toBe(true)
    expect(t.creees).toHaveLength(1)
    const cle = t.creees[0].cle
    expect(cle).toMatch(/^[0-9a-f]{32}$/)
    const lien = lienBenevole(BASE, 'ev1', 'em-u1', cle)
    expect(t.posts[0]).toEqual({ id: 'a'.repeat(32), type: 'acces', acces: [{ id: 'u1', lien }] })
    expect(lien.startsWith('https://')).toBe(true)
    expect(t.marques['em-u1']).toEqual({ envoyeMs: 1000, empreinte: empreinteLien(lien) })
    expect(t.o.saved).toMatchObject({ envoyes: 1, attente: 0, dernierEnvoiMs: 1000, echec: null, verifMs: 1000 })
    // Rien n'est gardé du lien lui-même
    expect(JSON.stringify(t.o.saved)).not.toContain(cle)

    const p = preparerAcces([{ id: 'em-u1', emId: 'u1', actif: true, accesEm: t.marques['em-u1'] }], () => cle, { base: BASE, ev: 'ev1' })
    expect(p.aEnvoyer).toHaveLength(0)
    expect(p.comptes).toEqual({ envoyes: 1, attente: 0 })
  })
  it('lien renouvelé : renvoyé ; bénévole retiré : accès retiré une fois', () => {
    const vieux = empreinteLien(lienBenevole(BASE, 'ev1', 'em-u1', 'b'.repeat(32)))
    const p = preparerAcces([
      { id: 'em-u1', emId: 'u1', actif: true, accesEm: { empreinte: vieux } },
      { id: 'em-u2', emId: 'u2', actif: false, accesEm: { empreinte: 'x' } },
      { id: 'em-u3', emId: 'u3', actif: false, accesEm: { empreinte: null } },
    ], () => 'c'.repeat(32), { base: BASE, ev: 'ev1' })
    expect(p.aEnvoyer.map(x => x.item)).toEqual([{ id: 'u1', lien: lienBenevole(BASE, 'ev1', 'em-u1', 'c'.repeat(32)) }, { id: 'u2', lien: null }])
  })
  it('refus d’Event Manager : noté, rien de marqué, nouvel essai au tour suivant', async () => {
    const t = io({ fiches: [{ id: 'em-u1', emId: 'u1', actif: true }], cles: { 'em-u1': 'd'.repeat(32) }, reponse: { ok: false, status: 403, text: 'Clé de type site' } })
    const r = await executerAcces(t.o, { ev: 'ev1', base: BASE, now: 2000 })
    expect(r.echec).toMatchObject({ status: 403 })
    expect(t.marques).toEqual({})
    expect(t.o.saved).toMatchObject({ envoyes: 0, attente: 1, echec: { status: 403, depuisMs: 2000 } })
  })
  it('toutes les 5 minutes, sauf à l’activation', async () => {
    const t = io({ fiches: [{ id: 'em-u1', emId: 'u1', actif: true }], state: { actif: true, verifMs: 1000 } })
    expect((await executerAcces(t.o, { ev: 'ev1', base: BASE, now: 60_000 })).envoye).toBe(false)
    expect((await executerAcces(t.o, { ev: 'ev1', base: BASE, now: 60_000, force: true })).envoye).toBe(true)
  })
  it('500 au plus par message', async () => {
    const fiches = Array.from({ length: 501 }, (_, i) => ({ id: `em-u${i}`, emId: `u${i}`, actif: true }))
    const t = io({ fiches })
    await executerAcces(t.o, { ev: 'ev1', base: BASE })
    expect(t.posts.map(p => p.acces.length)).toEqual([500, 1])
  })
})
