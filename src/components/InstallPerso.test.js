import { describe, it, expect } from 'vitest'
import { adresseFiche, estAppareilApple } from './InstallPerso'
import { ficheEspace } from '../../api/_routes/manifest'

describe('installation d\'un espace personnel (solution B, 25/11/2026)', () => {
  it('fiche du site pour l\'espace, jamais la clé', () => {
    expect(adresseFiche('https://x.fr/solde?ev=e1&id=FY-AB12&k=secret&recharge=cs_1'))
      .toBe('/api/manifest?p=solde&ev=e1&id=FY-AB12')
    expect(adresseFiche('https://x.fr/artiste?ev=e1&cr=c9&k=secret')).toBe('/api/manifest?p=artiste&ev=e1&cr=c9')
    expect(adresseFiche('https://x.fr/borne?ev=e1&k=secret')).toBe('/api/manifest?p=borne&ev=e1')
    expect(adresseFiche('https://x.fr/solde?ev=e1')).toBeNull()          // compte inconnu : fiche de l'appli
    expect(adresseFiche('https://x.fr/caisse?ev=e1')).toBeNull()
  })
  it('le serveur fabrique une fiche par espace, démarrant sans clé', () => {
    const f = ficheEspace({ p: 'benevole', ev: 'e1', id: 'b9', k: 'secret' })
    expect(f.start_url).toBe('/benevole?ev=e1&id=b9')
    expect(f.id).toBe('/benevole?ev=e1&id=b9')
    expect(f.name).toBe('Espace bénévole')
    expect(JSON.stringify(f)).not.toContain('secret')
    expect(ficheEspace({ p: 'balance', ev: 'e1', id: 'FY-1' }).start_url).toBe('/solde?ev=e1&id=FY-1')
    expect(ficheEspace({ p: 'caisse', ev: 'e1' })).toBeNull()
    expect(ficheEspace({ p: 'solde', ev: 'e1', id: '<x>' })).toBeNull()
  })
  it('reconnaît iPhone et iPad', () => {
    expect(estAppareilApple({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' })).toBe(true)
    expect(estAppareilApple({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
    expect(estAppareilApple({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' })).toBe(false)
  })
})
