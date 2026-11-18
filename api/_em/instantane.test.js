import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { normalizeSnapshot, lectureDue, classify, nextLecture, INTERVAL_MS } = require('./instantane.js')
const { refreshEvent } = require('./lecture.js')

const V = '0123456789abcdef0123456789abcdef'
const sample = () => ({
  version: V,
  genere: '2027-05-15T14:02:00+02:00',
  evenement: { nom: "Fest'Ylla 2027", jours: ['2027-05-16', '2027-05-15'] },
  programme: [
    { id: 'p2', jour: '2027-05-16', debut: '18:00', fin: '19:00', scene: '', titre: 'Danse', artiste: '' },
    { id: 'p12', jour: '2027-05-15', debut: '20:30', fin: '21:30', scene: 'Grande scène', titre: 'Concert', artiste: 'Awa Exemple', cachet: 900, note: 'interne' },
  ],
  artistes: [{ id: 'a7', nom: 'Awa Exemple', statut: 'confirme', jours: ['2027-05-15'], telephone: '0600000000',
    avantages: [{ jour: '2027-05-15', repas: 2, boissons: 4, eau: 4 }, { jour: '2027-05-16', repas: 0, boissons: 0, eau: 0 }] }],
  benevoles: [{ id: 'u31', prenom: 'Malik', nom: 'Exemple', email: 'x@y.z',
    droits: [{ jour: '2027-05-15', repas: 1, boissons: 2, eau: 3 }], controleBillets: ['2027-05-15', 'mauvais'] }],
})

describe('normalizeSnapshot', () => {
  it('garde seulement les champs prévus, et range le programme', () => {
    const r = normalizeSnapshot(sample())
    expect(r.ok).toBe(true)
    expect(r.data.evenement.jours).toEqual(['2027-05-15', '2027-05-16'])
    expect(r.data.programme.map(p => p.id)).toEqual(['p12', 'p2'])
    expect(r.data.programme[0]).not.toHaveProperty('cachet')
    expect(r.data.programme[0]).not.toHaveProperty('note')
    expect(r.data.artistes[0]).not.toHaveProperty('telephone')
    expect(r.data.artistes[0].avantages).toEqual([{ jour: '2027-05-15', repas: 2, boissons: 4, eau: 4 }])
    expect(r.data.benevoles[0]).not.toHaveProperty('email')
    expect(r.data.benevoles[0].controleBillets).toEqual(['2027-05-15'])
  })
  it('refuse une réponse incomplète', () => {
    expect(normalizeSnapshot(null).ok).toBe(false)
    expect(normalizeSnapshot({ ...sample(), version: undefined }).ok).toBe(false)
    expect(normalizeSnapshot({ ...sample(), benevoles: 'x' }).ok).toBe(false)
    expect(normalizeSnapshot({ ...sample(), evenement: null }).ok).toBe(false)
  })
  it('écarte les éléments sans identifiant et les doublons, borne les nombres', () => {
    const s = sample()
    s.benevoles.push({ prenom: 'Sans id' }, { id: 'u31', prenom: 'Doublon' }, { id: 'a/b', prenom: 'Chemin' })
    s.artistes[0].avantages = [{ jour: '2027-05-15', repas: -3, boissons: 2.5, eau: 500 }]
    const r = normalizeSnapshot(s)
    expect(r.data.benevoles.map(b => b.prenom)).toEqual(['Malik'])
    expect(r.data.artistes[0].avantages).toEqual([{ jour: '2027-05-15', repas: 0, boissons: 0, eau: 99 }])
  })
})

describe('rythme et état de lecture', () => {
  it('relit toutes les 5 minutes, ou tout de suite si demandé', () => {
    expect(lectureDue(null, 1000)).toBe(true)
    expect(lectureDue({ essaiMs: 1000 }, 1000 + INTERVAL_MS - 1)).toBe(false)
    expect(lectureDue({ essaiMs: 1000 }, 1000 + INTERVAL_MS)).toBe(true)
    expect(lectureDue({ essaiMs: 1000 }, 1001, true)).toBe(true)
  })
  it('classe les réponses', () => {
    expect([200, 304, 401, 403, 429, 500, 0].map(classify)).toEqual(['ok', 'inchange', 'refus', 'refus', 'panne', 'panne', 'panne'])
  })
  it('garde la date de la dernière copie et le début de la série d’échecs', () => {
    const a = nextLecture(null, { kind: 'ok', version: V, comptes: { programme: 2 } }, 100)
    expect(a).toMatchObject({ okMs: 100, version: V, echec: null })
    const b = nextLecture(a, { kind: 'panne', detail: '500' }, 200)
    const c = nextLecture(b, { kind: 'panne', detail: '502' }, 300)
    expect(c).toMatchObject({ okMs: 100, version: V, comptes: { programme: 2 }, echec: { type: 'panne', depuisMs: 200, detail: '502' } })
    const d = nextLecture(c, { kind: 'refus', detail: '401' }, 400)
    expect(d.echec).toMatchObject({ type: 'refus', depuisMs: 400 })
    const e = nextLecture(d, { kind: 'inchange' }, 500)
    expect(e).toMatchObject({ okMs: 500, version: V, echec: null, comptes: { programme: 2 } })
    expect(nextLecture(a, { kind: 'format', detail: 'x' }, 600).echec).toMatchObject({ type: 'panne', format: true })
  })
})

// Base en mémoire, juste ce que lecture.js utilise
function memoryDb(initial) {
  const docs = new Map(Object.entries(initial))
  const ref = (path) => ({
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    set: async (v) => { docs.set(path, v) },
    update: async (v) => { docs.set(path, { ...docs.get(path), ...v }) },
  })
  return { docs, collection: (c) => ({ doc: (id) => ref(`${c}/${id}`) }) }
}
const reply = (status, body) => async (url, opts) => { reply.last = opts; return { status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) } }

describe('refreshEvent', () => {
  let db
  beforeEach(() => { db = memoryDb({ 'liaisons-em/ev1': { cle: 'cle-em-essai-1234567890' } }) })

  it('sans clé, ne fait rien', async () => {
    expect(await refreshEvent(memoryDb({}), 'ev1', { fetchImpl: reply(200, sample()) })).toEqual({ lu: false })
  })
  it('range la copie et note la version, puis envoie la version au tour suivant', async () => {
    const r = await refreshEvent(db, 'ev1', { now: 1000, fetchImpl: reply(200, sample()) })
    expect(r.lecture).toMatchObject({ okMs: 1000, version: V, comptes: { programme: 2, artistes: 1, benevoles: 1 }, echec: null })
    expect(db.docs.get('em-instantanes/ev1').programme).toHaveLength(2)
    expect(reply.last.headers).toMatchObject({ 'x-ylla': '1', Authorization: 'Bearer cle-em-essai-1234567890' })
    expect(reply.last.headers['If-None-Match']).toBeUndefined()

    expect((await refreshEvent(db, 'ev1', { now: 2000, fetchImpl: reply(304, '') })).lu).toBe(false) // trop tôt
    const r2 = await refreshEvent(db, 'ev1', { now: 2000, force: true, fetchImpl: reply(304, '') })
    expect(reply.last.headers['If-None-Match']).toBe(`"${V}"`)
    expect(r2.lecture).toMatchObject({ okMs: 2000, echec: null })
  })
  it('en panne ou clé refusée : la copie précédente reste', async () => {
    await refreshEvent(db, 'ev1', { now: 1000, fetchImpl: reply(200, sample()) })
    const r = await refreshEvent(db, 'ev1', { now: 2000, force: true, fetchImpl: reply(401, { error: 'Clé absente, inconnue ou supprimée.' }) })
    expect(r.lecture.echec).toMatchObject({ type: 'refus', detail: '401 : Clé absente, inconnue ou supprimée.' })
    expect(r.lecture.okMs).toBe(1000)
    expect(db.docs.get('em-instantanes/ev1').programme).toHaveLength(2)
    const down = async () => { throw new Error('fetch failed') }
    const r2 = await refreshEvent(db, 'ev1', { now: 3000, force: true, fetchImpl: down })
    expect(r2.lecture.echec).toMatchObject({ type: 'panne', depuisMs: 3000, detail: 'fetch failed' })
  })
  it('réponse illisible : rien n’est remplacé', async () => {
    const r = await refreshEvent(db, 'ev1', { now: 1000, fetchImpl: reply(200, '<html>') })
    expect(r.lecture.echec).toMatchObject({ type: 'panne', format: true })
    expect(db.docs.has('em-instantanes/ev1')).toBe(false)
  })
  it('304 sans copie locale : relecture complète au tour suivant', async () => {
    db.docs.set('liaisons-em/ev1', { cle: 'cle-em-essai-1234567890', lecture: { version: V, essaiMs: 0, okMs: 0 } })
    const r = await refreshEvent(db, 'ev1', { now: 1000, force: true, fetchImpl: reply(304, '') })
    expect(r.lecture.version).toBeNull()
    expect(r.lecture.echec.type).toBe('panne')
  })
})
