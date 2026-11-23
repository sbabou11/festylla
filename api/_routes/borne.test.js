/**
 * Borne (23/11/2026) : QR tournant des espaces bénévole et artiste, refus de l'ancien QR avec clé.
 * La base et la session de la borne sont simulées ; le reste du traitement est le vrai.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const EV = 'festylla-2027'
const CLE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const docs = new Map()

// Firestore réduit à ce que lit « ouvrir » : get / set sur des chemins
const docRef = (path) => ({
  path,
  get: async () => ({ exists: docs.has(path), id: path.split('/').pop(), data: () => docs.get(path) }),
  set: async (d) => { docs.set(path, d) },
  collection: (name) => colRef(`${path}/${name}`),
})
const colRef = (path) => ({ doc: (id) => docRef(`${path}/${id}`) })
const fausseDb = { collection: colRef }

let handler, espace
beforeAll(() => {
  const serverPath = require.resolve('../_auth/server')
  require.cache[serverPath] = {
    id: serverPath, filename: serverPath, loaded: true,
    exports: {
      admin: { firestore: { FieldValue: {} } },
      getDb: () => fausseDb,
      clientIp: () => '10.0.0.1',
      verifyCaller: async () => ({ type: 'borne', eventIds: [EV] }),
    },
  }
  delete require.cache[require.resolve('./borne')]
  handler = require('./borne')
  espace = require('../_qr/espace')
})

async function appel(body) {
  let status = 0, json = null
  const res = { status(s) { status = s; return this }, json(j) { json = j; return this } }
  await handler({ method: 'POST', body: { ev: EV, ...body }, headers: {} }, res)
  return { status, json }
}

describe('borne : QR des bénévoles et des artistes', () => {
  beforeAll(() => {
    docs.set(`events/${EV}/liens/benevole-em-u31`, { cle: CLE })
    docs.set(`events/${EV}/benevoles/em-u31`, { prenom: 'Awa', nom: 'Diallo' })
  })

  it("refuse l'ancien QR imprimé (lien avec clé), même avec la bonne clé", async () => {
    for (const body of [
      { action: 'ouvrir', id: 'em-u31', cle: CLE },
      { action: 'commander', id: 'em-u31', cle: CLE, lignes: [] },
      { action: 'ouvrir', artiste: true, id: 'cr1', cle: CLE },
      { action: 'commander', artiste: true, id: 'cr1', cle: CLE, lignes: [] },
    ]) {
      const r = await appel(body)
      expect(r.status).toBe(410)
      expect(r.json.error).toMatch(/Ce QR imprimé n'est plus accepté/)
    }
  })

  it('ouvre avec le QR tournant en cours et remet un passage', async () => {
    const qr = espace.jeton({ kind: 'benevole', cle: CLE, ev: EV, id: 'em-u31', ms: Date.now() })
    const r = await appel({ action: 'ouvrir', qr })
    expect(r.status).toBe(200)
    expect(r.json.benevole).toEqual({ id: 'em-u31', nom: 'Awa Diallo' })
    expect(espace.passageValable({ passage: r.json.passage, cle: CLE, ev: EV, ms: Date.now() })).toBe(true)
  })

  it("refuse un QR périmé (photo), signé avec une autre clé, ou d'un autre type", async () => {
    const vieux = espace.jeton({ kind: 'benevole', cle: CLE, ev: EV, id: 'em-u31', ms: Date.now() - 5 * 60 * 1000 })
    expect((await appel({ action: 'ouvrir', qr: vieux })).status).toBe(401)
    const faux = espace.jeton({ kind: 'benevole', cle: 'b'.repeat(32), ev: EV, id: 'em-u31', ms: Date.now() })
    expect((await appel({ action: 'ouvrir', qr: faux })).status).toBe(401)
    const benevQr = espace.jeton({ kind: 'benevole', cle: CLE, ev: EV, id: 'em-u31', ms: Date.now() })
    expect((await appel({ action: 'ouvrir', artiste: true, qr: benevQr })).status).toBe(400)
  })

  it('refuse un passage falsifié pour commander', async () => {
    const p = espace.nouveauPassage({ kind: 'benevole', cle: 'b'.repeat(32), ev: EV, id: 'em-u31', ms: Date.now() })
    const r = await appel({ action: 'commander', passage: p, lignes: [] })
    expect(r.status).toBe(401)
  })
})
