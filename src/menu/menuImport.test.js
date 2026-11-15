import { describe, it, expect } from 'vitest'
import { mapHeader, parsePriceCents, matchAllergen, parseMenuRows, COLUMNS } from './menuImport'

const HEADER = COLUMNS.map(c => c.title)

describe('import de la carte', () => {
  it('reconnaît les colonnes du modèle, même dans un autre ordre', () => {
    expect(mapHeader(HEADER)).toMatchObject({ nom: 0, cat: 1, prix: 2, stock: 3, seuil: 4, type: 5, composition: 6, allergenes: 7, autres: 8, image: 9 })
    expect(mapHeader(['Prix', 'Article', 'Allergenes'])).toEqual({ prix: 0, nom: 1, allergenes: 2 })
  })

  it('lit les prix à la française', () => {
    expect(parsePriceCents('12,50 €')).toBe(1250)
    expect(parsePriceCents(3)).toBe(300)
    expect(parsePriceCents('gratuit')).toBeNull()
  })

  it('reconnaît les allergènes, y compris au singulier ou mal orthographiés', () => {
    expect(matchAllergen('Poissons')).toMatchObject({ code: 'poissons', exact: true })
    expect(matchAllergen('arachide')).toMatchObject({ code: 'arachides', exact: false })
    expect(matchAllergen('Celeri')).toMatchObject({ code: 'celeri', exact: true })
    expect(matchAllergen('piment')).toBeNull()
  })

  it('prépare les articles et signale les problèmes', () => {
    const table = [
      HEADER,
      COLUMNS.map(c => c.example),
      ['Riz thiep', 'Plats', '12,50', '', '', 'repas', 'Riz, poisson', 'Poisson, céleri, piment', '', ''],
      ['Bissap', 'Boissons', 3, 50, 5, 'Boisson', '', '', '', 'Non'],
      ['Sans prix', '', '', '', '', '', '', '', '', ''],
      ['riz THIEP', '', 10, '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
    ]
    const { rows, missingColumns } = parseMenuRows(table, [{ id: 'm9', nom: 'Bissap' }])
    expect(missingColumns).toEqual([])
    expect(rows).toHaveLength(4)
    const [thiep, bissap, sansPrix, doublon] = rows
    expect(thiep.data).toMatchObject({ prix: 1250, stock: 100, seuilAlerte: 10, typeConsommation: 'repas', allergenes: ['poissons', 'celeri'], allergenesCustom: ['piment'] })
    expect(thiep.errors).toEqual([])
    expect(thiep.line).toBe(3)
    expect(thiep.generateImage).toBe(true)
    expect(bissap.existingId).toBe('m9')
    expect(bissap.generateImage).toBe(false)
    expect(sansPrix.errors).toContain('Prix manquant')
    expect(doublon.errors[0]).toMatch(/Doublon de la ligne 3/)
  })

  it('refuse un fichier sans les colonnes obligatoires', () => {
    expect(parseMenuRows([['Article', 'Stock'], ['Coca', 10]]).missingColumns).toEqual(['Prix (€)'])
  })
})
