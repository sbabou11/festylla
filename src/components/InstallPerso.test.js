import { describe, it, expect } from 'vitest'
import { fichePerso, lienDemarrage } from './InstallPerso'

describe('installation d\'un espace personnel', () => {
  it('démarre sur le lien complet, sans les mentions de retour de paiement', () => {
    expect(lienDemarrage('https://x.fr/solde?ev=e1&id=AB12&k=cle&recharge=cs_1#haut'))
      .toBe('https://x.fr/solde?ev=e1&id=AB12&k=cle')
  })
  it('fiche propre à l\'espace, sans la clé dans son identifiant', () => {
    const f = fichePerso('https://x.fr/benevole?ev=e1&id=b9&k=secret', 'Espace bénévole')
    expect(f.start_url).toBe('https://x.fr/benevole?ev=e1&id=b9&k=secret')
    expect(f.id).toBe('https://x.fr/benevole?ev=e1&id=b9')
    expect(f.name).toBe('Espace bénévole')
    expect(f.icons[0].src).toBe('https://x.fr/logo-192.png')
  })
})
