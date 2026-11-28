import { describe, it, expect } from 'vitest'
import { etapeDeArticle, etapeRemplie, prochaineSuggestion, categorieSuggeree } from './etapes'

const rayons = [
  { id: 'rP', nom: 'Plats', cats: [{ key: 'c1', items: [{ id: 'm4' }] }, { key: 'c4', items: [{ id: 'm7' }] }] },
  { id: 'rB', nom: 'Boissons', cats: [{ key: 'c6', items: [{ id: 'm1', alcool: true }] }, { key: 'c5', items: [{ id: 'm2' }, { id: 'm3', stock: 0 }] }] },
  { id: 'rA', nom: 'Bar', cats: [{ key: 'c9', items: [{ id: 'm9', alcool: true }] }] },
  { id: 'rD', nom: 'Desserts', cats: [{ key: 'c8', items: [{ id: 'm8' }] }] },
]

describe('commande par étapes', () => {
  it('étape d’un article, étape remplie', () => {
    expect(etapeDeArticle(rayons, 'm2')).toBe(1)
    expect(etapeDeArticle(rayons, 'x')).toBe(-1)
    expect(etapeRemplie(rayons[0], { m4: 1 })).toBe(true)
    expect(etapeRemplie(rayons[0], { m4: 0 })).toBe(false)
  })
  it('suggère la prochaine étape vide, jamais une étape qui n’a que de l’alcool', () => {
    expect(prochaineSuggestion(rayons, { courante: 0, qtys: { m4: 1 } })).toBe(1)
    expect(prochaineSuggestion(rayons, { courante: 0, qtys: { m4: 1, m2: 1 } })).toBe(3)   // « Bar » sauté
    expect(prochaineSuggestion(rayons, { courante: 0, qtys: { m4: 1 }, refus: { 1: true } })).toBe(3)
    expect(prochaineSuggestion(rayons, { courante: 3, qtys: { m8: 1 } })).toBe(0)        // repart au début
    expect(prochaineSuggestion(rayons, { courante: 0, qtys: { m4: 1, m2: 1, m8: 1 } })).toBeNull()
    expect(prochaineSuggestion([rayons[0]], { courante: 0, qtys: { m4: 1 } })).toBeNull()
  })
  it('la suggestion de boissons ouvre une catégorie sans alcool', () => {
    expect(categorieSuggeree(rayons[1])).toBe('c5')
    expect(categorieSuggeree(rayons[0])).toBe('c1')
  })
})
