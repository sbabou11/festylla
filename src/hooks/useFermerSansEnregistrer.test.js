import { describe, it, expect } from 'vitest'
import { lireChamps } from './useFermerSansEnregistrer'

// Zone factice : une liste de champs comme querySelectorAll les renverrait
const zone = (champs) => ({ querySelectorAll: () => champs.map(c => ({ closest: () => null, ...c })) })

describe('« Fermer sans enregistrer ? » (24/11/2026)', () => {
  it('prend l\'empreinte des textes, listes et cases', () => {
    const a = lireChamps(zone([{ type: 'text', value: 'Bissap' }, { type: 'number', value: '3.5' }, { type: 'checkbox', checked: true }]))
    const b = lireChamps(zone([{ type: 'text', value: 'Bissap' }, { type: 'number', value: '3.5' }, { type: 'checkbox', checked: true }]))
    const c = lireChamps(zone([{ type: 'text', value: 'Bissap' }, { type: 'number', value: '4' }, { type: 'checkbox', checked: true }]))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
  it('ignore la recherche, les fichiers et les champs marqués « sans question »', () => {
    const base = [{ type: 'text', value: 'x' }]
    const a = lireChamps(zone([...base, { type: 'search', value: 'abc' }, { type: 'file', value: 'photo.jpg' }]))
    const b = lireChamps(zone([...base, { type: 'search', value: 'zzz' }, { type: 'file', value: '' }]))
    expect(a).toBe(b)
    const marque = { type: 'text', value: 'libre', closest: () => ({}) }
    expect(lireChamps(zone([...base, marque]))).toBe(lireChamps(zone(base)))
  })
})
