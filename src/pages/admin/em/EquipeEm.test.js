import { describe, it, expect, vi } from 'vitest'
vi.mock('../../../firebase/config', () => ({ db: {} }))
vi.mock('../../../firebase/session', () => ({ apiFetch: vi.fn() }))
vi.mock('../../../firebase/publicSession', () => ({ linkFor: vi.fn(), renewLinkKey: vi.fn() }))
import { lignesLecture, resumeChangement, statutAcces } from './EquipeEm.jsx'

const T = (h, m, j = 28) => new Date(2026, 10, j, h, m).getTime()
const NOW = T(20, 6)

describe('en-tête Bénévoles et Artistes', () => {
  it('normal : vérifié, dernier changement atténué', () => {
    const ev = { emLecture: { verifieMs: T(20, 5), copieMs: T(20, 5), echec: null }, emEquipe: { majMs: T(0, 32, 27) } }
    expect(lignesLecture(ev, 'benevoles', NOW)).toEqual([
      { ton: '', texte: 'Vérifié dans Event Manager à 20:05' },
      { ton: 'attenue', texte: 'Dernier changement le 27 nov. à 00:32' },
    ])
  })
  it('juste après un changement : résumé', () => {
    const ev = { emLecture: { verifieMs: T(20, 5), echec: null }, emEquipe: { majMs: T(20, 5), changement: { benevoles: { ajoutes: 1, retires: 0 } } } }
    expect(lignesLecture(ev, 'benevoles', NOW)[1]).toEqual({ ton: 'change', texte: 'Changé à 20:05 · 1 bénévole ajouté' })
    expect(lignesLecture(ev, 'artistes', NOW)[1].texte).toBe('Changé à 20:05')
  })
  it('en panne : depuis quand, et la liste gardée', () => {
    const ev = { emLecture: { verifieMs: null, copieMs: T(19, 35), echec: { type: 'panne', depuisMs: T(19, 40) } }, emEquipe: { majMs: T(0, 32) } }
    expect(lignesLecture(ev, 'benevoles', NOW)).toEqual([
      { ton: 'echec', texte: 'Event Manager injoignable depuis 19:40' },
      { ton: 'attenue', texte: 'Liste de 19:35, en attendant' },
    ])
    ev.emLecture.copieMs = T(19, 35, 27); ev.emLecture.echec.type = 'refus'
    expect(lignesLecture(ev, 'benevoles', NOW).map(l => l.texte)).toEqual(['Clé refusée par Event Manager depuis 19:40', 'Liste du 27 nov. à 19:35, en attendant'])
  })
  it('avant la première lecture du nouveau serveur : ancien libellé', () => {
    expect(lignesLecture({ emEquipe: { majMs: T(0, 32) } }, 'benevoles', NOW)).toEqual([{ ton: '', texte: 'Lu dans Event Manager à 00:32' }])
  })
  it('résumé au pluriel', () => {
    expect(resumeChangement({ ajoutes: 2, retires: 3 }, 'artiste')).toBe('2 artistes ajoutés · 3 retirés')
  })
})

describe('statut de l’accès envoyé par Event Manager', () => {
  const f = { id: 'em-u1', emId: 'u1' }
  it('non activé, envoyé, en attente, fiche locale', () => {
    expect(statutAcces(f, { actif: false })).toMatchObject({ tone: 'neutral', label: 'Accès non envoyé' })
    expect(statutAcces({ ...f, accesEm: { empreinte: 'x', envoyeMs: T(14, 12) } }, { actif: true }).label).toBe('Accès envoyé le 28 nov.')
    expect(statutAcces(f, { actif: true, echec: { status: 403 } })).toMatchObject({ tone: 'warning', label: 'Accès en attente', aide: 'En attendant, lien à donner à la main.' })
    expect(statutAcces({ id: 'b-local' }, { actif: true })).toBeNull()
  })
})
