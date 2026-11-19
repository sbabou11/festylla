import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const { ROUTES, routeOf } = require('../[route].js')

describe('point d\'entrée unique des fonctions serveur', () => {
  it('chaque traitement de api/_routes est servi, et se charge', () => {
    const fichiers = readdirSync(here).filter(f => f.endsWith('.js') && !f.endsWith('.test.js')).map(f => f.slice(0, -3)).sort()
    expect(Object.keys(ROUTES).sort()).toEqual(fichiers)
    for (const nom of fichiers) expect(typeof ROUTES[nom]()).toBe('function')
  })
  it('lit la route depuis Vercel ou depuis l\'adresse', () => {
    expect(routeOf({ query: { route: 'session' } })).toBe('session')
    expect(routeOf({ url: '/api/process-entrees?x=1' })).toBe('process-entrees')
  })
  it('reste sous la limite de 12 fonctions du plan Hobby', () => {
    const fonctions = readdirSync(join(here, '..')).filter(f => !f.startsWith('_') && !f.startsWith('.') && /\.(js|py|ts)$/.test(f))
    expect(fonctions.length).toBeLessThanOrEqual(12)
  })
})
