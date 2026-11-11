import { describe, it, expect } from 'vitest'
import { fuzzyMatch, highlight } from './fuzzy'

describe('recherche approximative (Ctrl K)', () => {
  it('trouve les lettres dans l\'ordre, même espacées', () => {
    expect(fuzzyMatch('Remboursement', 'rmb')?.indices).toEqual([0, 2, 3])
    expect(fuzzyMatch('Paramètres', 'prm')).not.toBeNull()
  })
  it('ignore accents et majuscules', () => {
    expect(fuzzyMatch('Clôture de caisse', 'cloture')).not.toBeNull()
    expect(fuzzyMatch('Équipe', 'equ')).not.toBeNull()
  })
  it('refuse les lettres absentes ou dans le désordre', () => {
    expect(fuzzyMatch('Alertes', 'zz')).toBeNull()
    expect(fuzzyMatch('Menu', 'unem')).toBeNull()
  })
  it('classe un début de mot avant une lettre isolée', () => {
    expect(fuzzyMatch('Encaisser', 'enc').score).toBeGreaterThan(fuzzyMatch('Retrait commande', 'enc')?.score ?? -1)
  })
  it('découpe le texte pour surligner les lettres trouvées', () => {
    expect(highlight('Rembours', [0, 2, 3])).toEqual([
      { text: 'R', hit: true }, { text: 'e', hit: false }, { text: 'mb', hit: true }, { text: 'ours', hit: false },
    ])
  })
})
