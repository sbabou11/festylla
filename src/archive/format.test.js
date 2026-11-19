import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zipSync, unzipSync, strToU8 } from 'fflate'
import {
  ARCHIVE_COLLECTIONS, HORS_ARCHIVE, encodeValue, decodeValue, stripSecrets, findStorageUrls, replaceUrls,
  storagePathFromUrl, checkArchive, sha256, ARCHIVE_FORMAT,
} from './format'
import { setReadOnlyEvents, assertWritable, withArchiveWrites, writeBatch } from '../firebase/guardedFirestore'

// Faux types Firestore pour les tests (mêmes champs que le SDK)
class FakeTs { constructor(s, n) { this.seconds = s; this.nanoseconds = n } toMillis() { return this.seconds * 1000 } }
const MAKE = { timestamp: (s, n) => new FakeTs(s, n), geo: (lat, lng) => ({ lat, lng }), ref: (p) => ({ path: p }), bytes: (b) => b }

const URL_A = 'https://firebasestorage.googleapis.com/v0/b/demo.app/o/events%2FE1%2Fmenu%2Fm1%2Fphoto.jpg?alt=media&token=abc'

describe('encodage des données', () => {
  it('conserve les dates, tableaux et objets à l\'aller-retour', () => {
    const data = { nom: 'Riz thiep', prix: 1500, createdAt: new FakeTs(1748000000, 5), items: [{ qty: 2, at: new FakeTs(1, 0) }], vide: null }
    const json = JSON.parse(JSON.stringify(encodeValue(data)))
    expect(json.createdAt).toEqual({ $t: 'ts', s: 1748000000, n: 5 })
    const back = decodeValue(json, MAKE)
    expect(back.createdAt).toBeInstanceOf(FakeTs)
    expect(back.createdAt.seconds).toBe(1748000000)
    expect(back.items[0].at.seconds).toBe(1)
    expect(back.nom).toBe('Riz thiep')
  })

  it('retire les mots de passe', () => {
    expect(stripSecrets({ nom: 'Awa', password: 'x', passwordHash: 'y' })).toEqual({ nom: 'Awa' })
  })
})

describe('fichiers stockés', () => {
  it('trouve les adresses Firebase Storage dans les données', () => {
    const urls = findStorageUrls({ a: { photoUrl: URL_A }, b: ['texte', `voir ${URL_A}`] })
    expect([...urls]).toEqual([URL_A])
    expect(storagePathFromUrl(URL_A)).toBe('events/E1/menu/m1/photo.jpg')
  })

  it('remplace les anciennes adresses après restauration', () => {
    const map = new Map([['events/E1/menu/m1/photo.jpg', 'https://nouvelle/adresse']])
    expect(replaceUrls({ photoUrl: URL_A, autre: 'inchangé' }, map)).toEqual({ photoUrl: 'https://nouvelle/adresse', autre: 'inchangé' })
  })

  it('ne touche pas aux dates en remplaçant les adresses', () => {
    const ts = new FakeTs(10, 0)
    const out = replaceUrls({ at: ts, photoUrl: URL_A }, new Map())
    expect(out.at).toBe(ts)
  })
})

describe('contrôle d\'une archive', () => {
  const build = async (tamper) => {
    const data = strToU8(JSON.stringify([{ id: 'a', data: { nom: 'x' } }]))
    const manifest = { format: ARCHIVE_FORMAT, version: 1, parts: { 'data/menu.json': { sha256: await sha256(data) } } }
    const files = { 'manifest.json': strToU8(JSON.stringify(manifest)), 'data/menu.json': tamper ? strToU8('modifié') : data }
    return unzipSync(zipSync(files))
  }
  it('accepte une archive intacte', async () => {
    expect((await checkArchive(await build(false))).problems).toEqual([])
  })
  it('refuse une archive modifiée', async () => {
    expect((await checkArchive(await build(true))).problems[0]).toMatch(/abîmée/)
  })
  it('refuse un ZIP qui n\'est pas une archive YllaCash', async () => {
    expect((await checkArchive(unzipSync(zipSync({ 'photo.jpg': strToU8('x') })))).problems[0]).toMatch(/pas une archive/)
  })
})

describe('liste des collections archivées', () => {
  it('couvre toutes les sous-collections d\'événement utilisées dans le code', () => {
    const src = join(__dirname, '..')
    const used = new Set()
    const walk = (dir) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(js|jsx)$/.test(f) && !f.endsWith('.test.js')) {
          for (const m of readFileSync(p, 'utf8').matchAll(/(?:collection|doc)\(\s*db\s*,\s*'events'\s*,\s*[^,]+,\s*'([\w-]+)'/g)) used.add(m[1])
        }
      }
    }
    walk(src)
    const missing = [...used].filter(c => !ARCHIVE_COLLECTIONS.includes(c) && !HORS_ARCHIVE.includes(c))
    expect(missing).toEqual([])
  })
})

describe('verrou lecture seule', () => {
  const ref = (path) => ({ path })
  it('refuse d\'écrire dans une édition archivée', () => {
    setReadOnlyEvents(['ARCH'])
    expect(() => assertWritable(ref('events/ARCH/transactions/t1'))).toThrow(/lecture seule/)
    expect(() => assertWritable(ref('events/LIVE/transactions/t1'))).not.toThrow()
    // Le document de l'événement (drapeau « actif ») reste modifiable
    expect(() => assertWritable(ref('events/ARCH'))).not.toThrow()
  })
  it('laisse passer les opérations d\'archivage', async () => {
    setReadOnlyEvents(['ARCH'])
    await withArchiveWrites(async () => { expect(() => assertWritable(ref('events/ARCH/menu/m1'))).not.toThrow() })
    expect(() => assertWritable(ref('events/ARCH/menu/m1'))).toThrow()
  })
})
