import { describe, it, expect } from 'vitest'
import { checkEntree, describeEntree, parisNow } from './entree'

const billet = (b = {}) => ({ id: 'FY-K7Q3NP', nom: 'Awa Exemple', billet: { code: 'K7Q3NP', jours: 2, annule: false, entrees: {}, commande: '1058', ...b } })
const J1 = '2027-05-15', J2 = '2027-05-16', J3 = '2027-05-17'

describe('contrôle des billets à l\'entrée : les cinq réponses', () => {
  it('billet inconnu : aucun compte, ou un compte sans billet', () => {
    expect(checkEntree(null, J1).status).toBe('inconnu')
    expect(checkEntree({ id: 'FY-4A2B', nom: 'Sur place' }, J1).status).toBe('inconnu')
  })
  it('billet annulé', () => {
    expect(checkEntree(billet({ annule: true }), J1)).toEqual({ status: 'annule', commande: '1058' })
  })
  it('déjà entré aujourd\'hui, avec l\'heure', () => {
    expect(checkEntree(billet({ entrees: { [J1]: '14:02' } }), J1)).toEqual({ status: 'deja', heure: '14:02' })
  })
  it('billet déjà utilisé quand tous les jours du pass sont pris', () => {
    const r = checkEntree(billet({ entrees: { [J2]: '18:00', [J1]: '14:02' } }), J3)
    expect(r).toEqual({ status: 'epuise', jours: [J1, J2] })
    expect(describeEntree(r).detail).toBe('Entré les 15 mai, 16 mai.')
  })
  it('billet valable, et un pass 2 jours se prend sur deux jours au choix', () => {
    expect(checkEntree(billet(), J1)).toEqual({ status: 'valable', rang: 1, total: 2 })
    expect(checkEntree(billet({ entrees: { [J1]: '14:02' } }), J3)).toEqual({ status: 'valable', rang: 2, total: 2 })
  })
})

describe('heure de Paris', () => {
  it('explique un refus (essai B1)', () => {
    expect(describeEntree({ status: 'inconnu', specId: 'FY-K7Q3NP', evenement: "Fest'Ylla 2027" }).detail)
      .toBe("FY-K7Q3NP n'existe pas pour l'événement « Fest'Ylla 2027 ». Vérifiez l'événement choisi dans l'appli.")
    expect(describeEntree({ status: 'pas-billet', lu: 'https://exemple.fr/promo' }).title).toBe("Ce QR n'est pas un billet")
    expect(describeEntree({ status: 'pas-billet', lu: 'https://exemple.fr/promo' }).detail).toContain('« https://exemple.fr/promo »')
    expect(describeEntree({ status: 'erreur', raison: 'Pas de réseau.' })).toMatchObject({ title: 'Contrôle impossible', detail: 'Pas de réseau.' })
    expect(describeEntree({ status: 'inconnu' }).detail).toBe('Ce code ne correspond à aucun billet.')
  })

  it('donne le jour et l\'heure de Paris', () => {
    // 15 mai 2027, 22:30 UTC = 16 mai 00:30 à Paris (heure d'été)
    expect(parisNow(new Date('2027-05-15T22:30:00Z'))).toEqual({ jour: '2027-05-16', heure: '00:30' })
  })
})
