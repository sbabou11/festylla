import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { normalizeSnapshot, lectureDue, classify, nextLecture, parisToMs, programmeDocs, INTERVAL_MS } = require('./instantane.js')
const { refreshEvent } = require('./lecture.js')

const V = '0123456789abcdef0123456789abcdef'
const sample = () => ({
  version: V,
  genere: '2027-05-15T14:02:00+02:00',
  evenement: { nom: "Fest'Ylla 2027", jours: ['2027-05-16', '2027-05-15'] },
  programme: [
    { id: 'p2', jour: '2027-05-16', debut: '23:30', fin: '00:30', scene: '', titre: 'Danse', artiste: '', type: 'inconnu', photo: 'http://x.fr/a.jpg',
      liens: { instagram: 'https://instagram.com/x', site: 'javascript:alert(1)', autre: 'https://a.fr' } },
    { id: 'p12', jour: '2027-05-15', debut: '20:30', fin: '21:30', scene: 'Grande scène', titre: 'Concert', artiste: 'Awa Exemple', cachet: 900, note: 'interne',
      type: 'musical', photo: 'https://gestion.maisonylla.com/p/awa.jpg', presentation: 'Chanteuse.' },
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

describe('programme (v1.1)', () => {
  it('garde type, photo, présentation et liens sûrs seulement', () => {
    const [p12, p2] = normalizeSnapshot(sample()).data.programme
    expect(p12).toMatchObject({ type: 'musical', photo: 'https://gestion.maisonylla.com/p/awa.jpg', presentation: 'Chanteuse.', liens: {} })
    expect(p2).toMatchObject({ type: 'autre', photo: '', presentation: '', liens: { instagram: 'https://instagram.com/x' } })
  })
  it("heure de Paris, été comme hiver", () => {
    expect(new Date(parisToMs('2027-05-15', '20:30')).toISOString()).toBe('2027-05-15T18:30:00.000Z')
    expect(new Date(parisToMs('2027-01-15', '20:30')).toISOString()).toBe('2027-01-15T19:30:00.000Z')
  })
  it('au format des créneaux, fin après minuit comprise', () => {
    const docs = programmeDocs(normalizeSnapshot(sample()).data.programme)
    const p2 = docs.find(d => d.docId === 'p2').data
    expect(p2.finMs - p2.debutMs).toBe(3600_000)
    expect(docs.find(d => d.docId === 'p12').data).toMatchObject({ artiste: 'Awa Exemple', bio: 'Chanteuse.', statut: 'a-venir', source: 'event-manager' })
    expect(programmeDocs([{ id: 'a.b c', jour: '2027-05-15', debut: '10:00', fin: '', scene: '', titre: '', artiste: '' }])[0].docId).toMatch(/^h[0-9a-f]{24}$/)
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

// Base en mémoire, juste ce que lecture.js utilise (chemins texte, sous-collections comprises)
function memoryDb(initial) {
  const docs = new Map(Object.entries(initial))
  const ref = (path) => ({
    id: path.split('/').pop(),
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    update: async (v) => { docs.set(path, { ...docs.get(path), ...v }) },
    set: async (v, opt) => { docs.set(path, opt?.merge ? { ...docs.get(path), ...v } : v) },
    delete: async () => { docs.delete(path) },
    collection: (c) => col(`${path}/${c}`),
  })
  const col = (base) => ({
    where: (field, op, value) => ({ get: async () => {
      const all = await col(base).get()
      return { docs: all.docs.filter(d => d.data()[field] === value) }
    } }),
    doc: (id) => ref(`${base}/${id}`),
    get: async () => ({ docs: [...docs.keys()].filter(k => k.startsWith(base + '/') && !k.slice(base.length + 1).includes('/'))
      .map(k => ({ id: k.split('/').pop(), ref: ref(k), data: () => docs.get(k) })) }),
  })
  return { docs, collection: (c) => col(c) }
}
const reply = (status, body) => async (url, opts) => { reply.last = opts; return { status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) } }

describe('refreshEvent', () => {
  let db
  beforeEach(() => { db = memoryDb({ 'liaisons-em/ev1': { cle: 'cle-em-essai-1234567890' }, 'events/ev1': { nom: 'Fest' } }) })

  it('sans clé, ne fait rien', async () => {
    expect(await refreshEvent(memoryDb({}), 'ev1', { toDate: (ms) => ms, fetchImpl: reply(200, sample()) })).toEqual({ lu: false })
  })
  it('range la copie et note la version, puis envoie la version au tour suivant', async () => {
    const r = await refreshEvent(db, 'ev1', { now: 1000, toDate: (ms) => ms, fetchImpl: reply(200, sample()) })
    expect(r.lecture).toMatchObject({ okMs: 1000, version: V, comptes: { programme: 2, artistes: 1, benevoles: 1 }, echec: null })
    expect(db.docs.get('em-instantanes/ev1').programme).toHaveLength(2)
    expect(db.docs.get('events/ev1/programme-em/p12')).toMatchObject({ artiste: 'Awa Exemple', debut: Date.parse('2027-05-15T18:30:00Z') })
    expect(db.docs.get('events/ev1').emProgramme).toEqual({ majMs: 1000, nb: 2 })
    expect(reply.last.headers).toMatchObject({ 'x-ylla': '1', Authorization: 'Bearer cle-em-essai-1234567890' })
    expect(reply.last.headers['If-None-Match']).toBeUndefined()

    expect((await refreshEvent(db, 'ev1', { now: 2000, toDate: (ms) => ms, fetchImpl: reply(304, '') })).lu).toBe(false) // trop tôt
    const r2 = await refreshEvent(db, 'ev1', { now: 2000, force: true, toDate: (ms) => ms, fetchImpl: reply(304, '') })
    expect(reply.last.headers['If-None-Match']).toBe(`"${V}"`)
    expect(r2.lecture).toMatchObject({ okMs: 2000, echec: null })
  })
  it('en panne ou clé refusée : la copie précédente reste', async () => {
    await refreshEvent(db, 'ev1', { now: 1000, toDate: (ms) => ms, fetchImpl: reply(200, sample()) })
    const r = await refreshEvent(db, 'ev1', { now: 2000, force: true, toDate: (ms) => ms, fetchImpl: reply(401, { error: 'Clé absente, inconnue ou supprimée.' }) })
    expect(r.lecture.echec).toMatchObject({ type: 'refus', detail: '401 : Clé absente, inconnue ou supprimée.' })
    expect(r.lecture.okMs).toBe(1000)
    expect(db.docs.get('em-instantanes/ev1').programme).toHaveLength(2)
    const down = async () => { throw new Error('fetch failed') }
    const r2 = await refreshEvent(db, 'ev1', { now: 3000, force: true, fetchImpl: down })
    expect(r2.lecture.echec).toMatchObject({ type: 'panne', depuisMs: 3000, detail: 'fetch failed' })
  })
  it('réponse illisible : rien n’est remplacé', async () => {
    const r = await refreshEvent(db, 'ev1', { now: 1000, toDate: (ms) => ms, fetchImpl: reply(200, '<html>') })
    expect(r.lecture.echec).toMatchObject({ type: 'panne', format: true })
    expect(db.docs.has('em-instantanes/ev1')).toBe(false)
  })
  it('304 sans copie locale : relecture complète au tour suivant', async () => {
    db.docs.set('liaisons-em/ev1', { cle: 'cle-em-essai-1234567890', lecture: { version: V, essaiMs: 0, okMs: 0 } })
    const r = await refreshEvent(db, 'ev1', { now: 1000, force: true, toDate: (ms) => ms, fetchImpl: reply(304, '') })
    expect(r.lecture.version).toBeNull()
    expect(r.lecture.echec.type).toBe('panne')
  })

  it('le programme public suit Event Manager : modifié, retiré, inchangé', async () => {
    await refreshEvent(db, 'ev1', { now: 1000, toDate: (ms) => ms, fetchImpl: reply(200, sample()) })
    const next = sample()
    next.version = 'f'.repeat(32)
    next.programme = [{ ...next.programme[1], debut: '21:00' }]
    const writes = []
    const orig = db.docs.set.bind(db.docs)
    db.docs.set = (k, v) => { writes.push(k); return orig(k, v) }
    await refreshEvent(db, 'ev1', { now: 2000, force: true, toDate: (ms) => ms, fetchImpl: reply(200, next) })
    expect(db.docs.has('events/ev1/programme-em/p2')).toBe(false)
    expect(db.docs.get('events/ev1/programme-em/p12').debut).toBe(Date.parse('2027-05-15T19:00:00Z'))
    writes.length = 0
    await refreshEvent(db, 'ev1', { now: 3000, force: true, toDate: (ms) => ms, fetchImpl: reply(200, { ...next, version: 'e'.repeat(32) }) })
    expect(writes.filter(k => k.includes('programme-em'))).toEqual([])
  })

  it("publie bénévoles et artistes sans écraser les consommations, et retire ceux qui disparaissent", async () => {
    await refreshEvent(db, 'ev1', { now: 1000, toDate: (ms) => ms, fetchImpl: reply(200, sample()) })
    expect(db.docs.get('events/ev1/benevoles/em-u31')).toMatchObject({
      prenom: 'Malik', source: 'event-manager', actif: true, createdAt: 1000,
      droitsJours: { '2027-05-15': { repas: 1, boisson: 2, eau: 3 } }, controleBillets: ['2027-05-15'],
    })
    expect(db.docs.get('events/ev1/benevoles-annuaire/em-u31')).toEqual({ prenom: 'Malik', nom: 'Exemple', poste: '' })
    expect(db.docs.get('events/ev1/artistes/em-a7')).toMatchObject({ nom: 'Awa Exemple', avantagesJours: { '2027-05-15': { repas: 2, boisson: 4, eau: 4 } } })
    expect(db.docs.get('events/ev1').emEquipe).toEqual({ majMs: 1000, benevoles: 1, artistes: 1 })

    // L'appli a noté une consommation ; Event Manager change les droits puis retire Malik
    db.docs.set('events/ev1/benevoles/em-u31', { ...db.docs.get('events/ev1/benevoles/em-u31'), consoJours: { '2027-05-15': { repas: 1 } } })
    db.docs.set('events/ev1/benevoles/b-local', { prenom: 'Saisi dans YllaCash' })
    const next = sample(); next.version = 'f'.repeat(32); next.benevoles[0].droits[0].repas = 2
    await refreshEvent(db, 'ev1', { now: 2000, force: true, toDate: (ms) => ms, fetchImpl: reply(200, next) })
    expect(db.docs.get('events/ev1/benevoles/em-u31')).toMatchObject({ consoJours: { '2027-05-15': { repas: 1 } }, droitsJours: { '2027-05-15': { repas: 2 } } })
    next.version = 'e'.repeat(32); next.benevoles = []
    await refreshEvent(db, 'ev1', { now: 3000, force: true, toDate: (ms) => ms, fetchImpl: reply(200, next) })
    expect(db.docs.get('events/ev1/benevoles/em-u31')).toMatchObject({ actif: false, consoJours: { '2027-05-15': { repas: 1 } } })
    expect(db.docs.has('events/ev1/benevoles-annuaire/em-u31')).toBe(false)
    expect(db.docs.get('events/ev1/benevoles/b-local')).toEqual({ prenom: 'Saisi dans YllaCash' })
  })
})
