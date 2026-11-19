import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { checkAuth, validateMessage, handleMessage, nextAttempt, prepareEntrees, RETRY_LIMIT } = require('./core.js')

// Base en mémoire : chemins texte, fusion des objets comme Firestore (merge: true)
function memoryStore(initial = {}) {
  const docs = new Map(Object.entries(initial))
  const merge = (a, b) => {
    const out = { ...(a || {}) }
    for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' ? merge(out[k], v) : v
    return out
  }
  return {
    docs,
    now: () => 'NOW',
    runTransaction: async (fn) => {
      const writes = []
      const r = await fn({
        get: async (p) => ({ exists: docs.has(p), data: docs.get(p) ?? null }),
        set: (p, data, opts) => writes.push([p, data, opts]),
      })
      for (const [p, data, opts] of writes) docs.set(p, opts?.merge ? merge(docs.get(p), data) : data)
      return r
    },
  }
}

const ID = 'a'.repeat(32), ID2 = 'b'.repeat(32), ID3 = 'c'.repeat(32)
const vente = (id = ID) => ({
  id, type: 'vente', evenement: 'EV1', commande: '1058', le: '2027-03-12T10:41:07+01:00',
  billets: [
    { code: 'K7Q3NP', ref: '9c1f4e0a7b2d6c35', cle: 'f'.repeat(32), prenom: 'Awa', nom: 'Exemple', pass: 'Pass 2 jours', jours: 2, prix: 10 },
    { code: 'AB2C3D', ref: '04be71d2c9a8f360', prenom: 'Malik', nom: 'Exemple', pass: 'Pass 1 jour', jours: 1, prix: 6.5 },
  ],
})
const SPEC = 'events/EV1/spectateurs/FY-K7Q3NP'

describe('liaison site → YllaCash : identification', () => {
  it('refuse sans clé réglée (503) et avec une mauvaise clé (401)', () => {
    expect(checkAuth('Bearer x', '')).toMatchObject({ status: 503 })
    expect(checkAuth('Bearer faux', 'secret')).toMatchObject({ status: 401 })
    expect(checkAuth('', 'secret')).toMatchObject({ status: 401 })
    expect(checkAuth('Bearer secret', 'secret')).toBeNull()
  })
  it('refuse un message mal formé (400)', () => {
    expect(validateMessage({ ...vente(), id: 'court' })).toMatch(/id/)
    expect(validateMessage({ ...vente(), billets: [{ ...vente().billets[0], ref: 'zz' }] })).toMatch(/ref/)
    expect(validateMessage({ ...vente(), type: 'autre' })).toMatch(/inconnu/)
    expect(validateMessage({ ...vente(), billets: [{ ...vente().billets[0], cle: 'pas-hexa' }] })).toMatch(/cle/)
    expect(validateMessage({ ...vente(), billets: [{ ...vente().billets[0], cle: '' }] })).toBeNull()
    expect(validateMessage(vente())).toBeNull()
  })
})

describe('réception des ventes et annulations', () => {
  it('crée un compte par billet, avec son bloc billet', async () => {
    const store = memoryStore({ 'events/EV1': { nom: 'Fest' } })
    const r = await handleMessage(store, vente(), { ev: 'EV1', source: 'festylla.com' })
    expect(r).toEqual({ created: 2, status: 201, body: { ok: true, crees: 2, retablis: 0 } })
    expect(store.docs.get(SPEC)).toMatchObject({
      id: 'FY-K7Q3NP', nom: 'Awa Exemple', solde: 0, source: 'festylla.com',
      billet: { code: 'K7Q3NP', ref: '9c1f4e0a7b2d6c35', pass: 'Pass 2 jours', jours: 2, prix: 1000, commande: '1058', annule: false, entrees: {} },
    })
    // Sécurité (20/11/2026) : la clé n'est plus dans la fiche, mais dans la collection réservée au serveur
    expect(store.docs.get(SPEC).billet.cle).toBeUndefined()
    expect(store.docs.get('events/EV1/cles/FY-K7Q3NP')).toEqual({ cle: 'f'.repeat(32) })
    expect(store.docs.get('events/EV1/spectateurs/FY-AB2C3D').billet.prix).toBe(650)
  })

  it('ne traite pas deux fois le même message', async () => {
    const store = memoryStore({ 'events/EV1': {} })
    await handleMessage(store, vente(), { ev: 'EV1', source: 'festylla.com' })
    store.docs.set(SPEC, { ...store.docs.get(SPEC), solde: 1500 })
    const r = await handleMessage(store, vente(), { ev: 'EV1', source: 'festylla.com' })
    expect(r).toEqual({ status: 200, body: { ok: true, duplicate: true } })
    expect(store.docs.get(SPEC).solde).toBe(1500)
  })

  it('annule un billet sans supprimer le compte, et ignore un billet inconnu', async () => {
    const store = memoryStore({ 'events/EV1': {} })
    await handleMessage(store, vente(), { ev: 'EV1', source: 'festylla.com' })
    const r = await handleMessage(store, { id: ID2, type: 'annulation', evenement: 'EV1', commande: '1058', codes: ['K7Q3NP', 'ZZ9Z9Z'] }, { ev: 'EV1', source: 'festylla.com' })
    expect(r.body).toEqual({ ok: true, annules: 1, inconnus: 1 })
    expect(store.docs.get(SPEC).billet.annule).toBe(true)
    expect(store.docs.has('events/EV1/spectateurs/FY-ZZ9Z9Z')).toBe(false)
  })

  it('une vente renvoyée rétablit le billet sans toucher au solde ni aux entrées', async () => {
    const store = memoryStore({ 'events/EV1': {} })
    await handleMessage(store, vente(), { ev: 'EV1', source: 'festylla.com' })
    const s = store.docs.get(SPEC)
    store.docs.set(SPEC, { ...s, solde: 700, billet: { ...s.billet, annule: true, entrees: { '2027-05-15': '14:02' } } })
    const r = await handleMessage(store, vente(ID3), { ev: 'EV1', source: 'festylla.com' })
    expect(r.body).toMatchObject({ crees: 0, retablis: 2 })
    expect(store.docs.get(SPEC)).toMatchObject({ solde: 700, billet: { annule: false, entrees: { '2027-05-15': '14:02' } } })
    expect(store.docs.get('events/EV1/cles/FY-K7Q3NP')).toEqual({ cle: 'f'.repeat(32) })   // la clé d'origine n'est jamais remplacée
  })

  it('répond 404 pour un événement inconnu', async () => {
    const r = await handleMessage(memoryStore(), vente(), { ev: 'EV1', source: 'festylla.com' })
    expect(r.status).toBe(404)
  })
})

describe('envoi des entrées à Event Manager', () => {
  it('réessaie après 1, 5, 30 min puis 2 h, et abandonne après 7 jours', () => {
    const t0 = 1_000_000
    expect(nextAttempt({ tentatives: 0 }, t0)).toMatchObject({ statut: 'attente', tentatives: 1, prochainMs: t0 + 60_000 })
    expect(nextAttempt({ tentatives: 3, premierEssaiMs: t0 }, t0)).toMatchObject({ prochainMs: t0 + 120 * 60_000 })
    expect(nextAttempt({ tentatives: 9, premierEssaiMs: t0 }, t0 + RETRY_LIMIT)).toMatchObject({ statut: 'echec' })
  })
  it('n\'envoie ni une entrée annulée jamais partie, ni une entrée pas encore due', () => {
    const e = (data) => ({ ref: '9c1f4e0a7b2d6c35', jour: '2027-05-15', heure: '14:02', ...data })
    const { toSend, useless } = prepareEntrees([
      { id: 'a', data: e({ envoi: { statut: 'attente' } }) },
      { id: 'b', data: e({ annulee: true, envoi: { statut: 'attente' } }) },
      { id: 'c', data: e({ annulee: true, envoi: { statut: 'attente', dejaEnvoye: true } }) },
      { id: 'd', data: e({ envoi: { statut: 'attente', prochainMs: 9e15 } }) },
    ], 1000)
    expect(toSend.map(x => x.id)).toEqual(['a', 'c'])
    expect(toSend[1].line).toEqual({ ref: '9c1f4e0a7b2d6c35', jour: '2027-05-15', heure: '14:02', annulee: true })
    expect(useless).toEqual(['b'])
  })
})

describe('clés de liaison par événement et par site (v1.3)', () => {
  const { parseKey, keyFromHeader, keyMatches, newKey } = require('./cles.js')
  it("une clé désigne son événement et ne se garde qu'en empreinte", () => {
    const k = newKey('QKwyQQxB60hX')
    expect(k.cle).toMatch(/^QKwyQQxB60hX\.[a-z0-9]{12}\.[A-Za-z0-9_-]{40}$/)
    expect(k.cle).not.toContain(k.empreinte)
    const parsed = keyFromHeader(`Bearer ${k.cle}`)
    expect(parsed).toMatchObject({ ev: 'QKwyQQxB60hX', keyId: k.keyId })
    expect(keyMatches(parsed, { ev: 'QKwyQQxB60hX', empreinte: k.empreinte })).toBe(true)
  })
  it("refuse une clé fausse, d'un autre événement, supprimée ou mal formée", () => {
    const k = newKey('EV1')
    const p = parseKey(k.cle)
    expect(keyMatches({ ...p, secret: p.secret.replace(/.$/, c => c === 'a' ? 'b' : 'a') }, { ev: 'EV1', empreinte: k.empreinte })).toBe(false)
    expect(keyMatches(p, { ev: 'EV2', empreinte: k.empreinte })).toBe(false)
    expect(keyMatches(p, { ev: 'EV1', empreinte: k.empreinte, supprimee: true })).toBe(false)
    expect(keyMatches(p, null)).toBe(false)
    expect(parseKey('EV1.court.secret')).toBeNull()
    expect(keyFromHeader('Bearer ancienne-cle-generale')).toBeNull()
  })
})
