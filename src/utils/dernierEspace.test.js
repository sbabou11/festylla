import { describe, it, expect, beforeEach } from 'vitest'
import { retenirEspace, oublierEspace, espaceARouvrir } from './dernierEspace'

// Faux navigateur minimal (le projet teste sans jsdom)
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
let enIcone = true
globalThis.window = {
  location: { origin: 'https://cash.example', pathname: '/', search: '' },
  matchMedia: () => ({ matches: enIcone }),
  navigator: {},
}
const aller = (chemin) => { const u = new URL(chemin, 'https://cash.example'); window.location.pathname = u.pathname; window.location.search = u.search }

describe('dernierEspace (essai A7)', () => {
  beforeEach(() => { store.clear(); enIcone = true; aller('/') })

  it("rouvre le dernier espace quand l'appli démarre sur « / » depuis l'icône", () => {
    retenirEspace('https://cash.example/solde?id=FY-K7Q3NP&ev=ev1&k=abc')
    expect(espaceARouvrir()).toBe('/solde?id=FY-K7Q3NP&ev=ev1&k=abc')
  })

  it("ne fait rien dans le navigateur (pas lancée depuis l'icône)", () => {
    retenirEspace('/benevole?id=b1&ev=ev1')
    enIcone = false
    expect(espaceARouvrir()).toBeNull()
  })

  it('ne fait rien sur une autre page que « / »', () => {
    retenirEspace('/benevole?id=b1&ev=ev1')
    aller('/accueil')
    expect(espaceARouvrir()).toBeNull()
  })

  it("après l'équipe, l'icône rouvre la connexion", () => {
    retenirEspace('/artiste?ev=ev1&cr=c1')
    oublierEspace()
    expect(espaceARouvrir()).toBeNull()
  })

  it('refuse un lien qui ne mène pas à un espace personnel', () => {
    store.set('yllacash-dernier-espace', '/accueil')
    expect(espaceARouvrir()).toBeNull()
    store.clear()
    retenirEspace('https://ailleurs.example/solde?id=FY-1')
    expect(espaceARouvrir()).toBeNull()
  })
})
