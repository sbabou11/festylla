import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { consommations, bilan, parisIso, envoiDu, INTERVAL_MS } = require('./retour.js')
const { executerRetour } = require('./envoiRetour.js')

const T = (iso) => ({ toMillis: () => Date.parse(iso) })

describe('consommations (§7.2)', () => {
  it('par personne (identifiant Event Manager) et par jour, commandes retirées et service au stand', () => {
    const r = consommations({
      benevoles: [{ id: 'em-u31', emId: 'u31' }],
      artistes: [{ id: 'em-a7', emId: 'a7' }],
      resas: [
        { isBenev: true, benevoleId: 'em-u31', status: 'collected', jourConso: '2027-05-15', items: [{ typeConsommation: 'repas', qty: 1 }, { typeConsommation: 'boisson', qty: 2 }] },
        { isBenev: true, benevoleId: 'em-u31', status: 'cancelled', jourConso: '2027-05-15', items: [{ typeConsommation: 'eau', qty: 5 }] },
        { isBenev: true, benevoleId: 'em-u31', status: 'processing', jourConso: '2027-05-15', items: [{ typeConsommation: 'eau', qty: 1 }] },
        { isBenev: true, benevoleId: 'b-local', status: 'collected', jourConso: '2027-05-15', items: [{ typeConsommation: 'eau', qty: 1 }] },
      ],
      consos: [
        { creneauId: 'em-a7', type: 'drink', servedAt: T('2027-05-15T23:30:00Z') },   // 1 h 30 : compte pour le 15
        { creneauId: 'em-a7', type: 'meal', servedAt: T('2027-05-16T10:00:00Z') },
        { creneauId: 'cr-planning', type: 'meal', servedAt: T('2027-05-16T10:00:00Z') },
      ],
      jours: ['2027-05-15', '2027-05-16'],
    })
    expect(r.jours).toEqual(['2027-05-15', '2027-05-16'])
    expect(r.benevoles).toEqual([{ id: 'u31', jour: '2027-05-15', repas: 1, boissons: 2, eau: 0 }])
    expect(r.artistes).toEqual([
      { id: 'a7', jour: '2027-05-15', repas: 0, boissons: 1, eau: 0 },
      { id: 'a7', jour: '2027-05-16', repas: 1, boissons: 0, eau: 0 },
    ])
  })
})

describe('bilan (§7.3)', () => {
  it('comme le Rapport Excel, offerts valorisés au prix de la carte et hors ventes', () => {
    const r = bilan({
      menu: [{ nom: 'Bissap', cat: 'Boissons', prix: 300 }, { nom: 'Thieb', cat: 'Plats', prix: 900 }],
      spectateurs: [{ solde: 1250 }, { solde: 0 }, { solde: 50 }],
      transactions: [
        { type: 'credit', montant: 2000, createdAt: T('2027-05-15T16:00:00Z') },
        { type: 'credit', montant: 1000, createdAt: T('2027-05-16T16:00:00Z') },
        { type: 'debit', montant: 600, createdAt: T('2027-05-15T18:00:00Z'), items: [{ nom: 'Bissap', qty: 2, prixUnit: 300, total: 600 }] },
        { type: 'retrait', montant: 900, timestamp: '2027-05-15T19:00:00Z', items: [{ nom: 'Thieb', prix: 900, qty: 1 }] },
        { type: 'debit', montant: 200, createdAt: T('2027-05-15T19:30:00Z'), items: [{ nom: 'Ancien', qty: 1, total: 200 }] },
        { type: 'benev-retrait', montant: 1200, items: [{ nom: 'Thieb', qty: 1 }, { nom: 'Bissap', qty: 1 }] },
        { type: 'artist-gift', montant: 0, items: [{ nom: 'Bissap', qty: 1, type: 'drink' }, { nom: 'Thieb', qty: 1, type: 'meal' }] },
        { type: 'remboursement', montant: 700, createdAt: T('2027-05-16T21:00:00Z') },
        { type: 'benev-reservation', montant: 1200 },
      ],
    })
    expect(r).toMatchObject({ recharges: 30, ventes: 17, remboursements: 7, soldesRestants: 13, offertsBenevoles: 12, offertsArtistes: 12 })
    expect(r.categories).toEqual([
      { nom: 'Plats', montant: 9, unites: 1 },
      { nom: 'Boissons', montant: 6, unites: 2 },
      { nom: 'Supprimé du menu', montant: 2, unites: 1 },
    ])
    expect(r.parJour).toEqual([
      { jour: '2027-05-15', recharges: 20, ventes: 17, remboursements: 0 },
      { jour: '2027-05-16', recharges: 10, ventes: 0, remboursements: 7 },
    ])
  })
})

describe('rythme', () => {
  it('date de Paris avec décalage', () => {
    expect(parisIso(Date.parse('2027-05-15T21:10:00Z'))).toBe('2027-05-15T23:10:00+02:00')
    expect(parisIso(Date.parse('2027-01-15T21:10:00Z'))).toBe('2027-01-15T22:10:00+01:00')
  })
  it('rien de neuf : pas d\'envoi ; neuf : au plus toutes les 5 minutes ; clôture : final tout de suite', () => {
    const ok = { consoHash: 'a', bilanHash: 'b', essaiMs: 1000 }
    expect(envoiDu(ok, { now: 1000 + INTERVAL_MS, nouveau: false, clotureMs: null }).du).toBe(false)
    expect(envoiDu(ok, { now: 2000, nouveau: true, clotureMs: null }).du).toBe(false)
    expect(envoiDu(ok, { now: 1000 + INTERVAL_MS, nouveau: true, clotureMs: null })).toEqual({ du: true, final: false })
    expect(envoiDu(ok, { now: 2000, nouveau: false, clotureMs: 1500 })).toEqual({ du: true, final: true })
    expect(envoiDu({ ...ok, clotureMs: 1500 }, { now: 2000, nouveau: false, clotureMs: 1500 }).du).toBe(false)
    expect(envoiDu({ ...ok, echec: 'x' }, { now: 1000 + INTERVAL_MS, nouveau: false, clotureMs: null }).du).toBe(true)
  })
})

describe('executerRetour', () => {
  const data = {
    benevoles: [{ id: 'em-u31', emId: 'u31' }], artistes: [], consos: [], spectateurs: [], menu: [], jours: ['2027-05-15'],
    resas: [{ isBenev: true, benevoleId: 'em-u31', status: 'collected', jourConso: '2027-05-15', items: [{ typeConsommation: 'repas', qty: 1 }] }],
    transactions: [{ type: 'credit', montant: 500 }],
  }
  const io = (over = {}) => {
    const sent = [], saved = []
    return { sent, saved, state: null, nouveau: async () => true, clotureMs: async () => null, charger: async () => data,
      post: async (b) => { sent.push(b); return { ok: true, status: 200, text: '' } }, save: async (s) => { saved.push(s) }, ...over }
  }
  let n = 0
  const newId = () => String(++n).padStart(32, '0')

  it('premier tour : envoie les deux messages, puis rien tant que rien ne change', async () => {
    const x = io()
    const r = await executerRetour(x, { now: Date.parse('2027-05-15T21:10:00Z'), newId })
    expect(r).toMatchObject({ envoye: true, final: false, echecs: [] })
    expect(x.sent.map(m => m.type)).toEqual(['consommations', 'bilan'])
    expect(x.sent[0]).toMatchObject({ le: '2027-05-15T23:10:00+02:00', jours: ['2027-05-15'], benevoles: [{ id: 'u31', repas: 1 }] })
    expect(x.sent[1]).toMatchObject({ final: false, recharges: 5 })
    const state = x.saved[0]
    // Nouvelle transaction, 5 minutes plus tard, mais mêmes chiffres : rien ne part
    const y = io({ state })
    await executerRetour(y, { now: state.calculMs + INTERVAL_MS, newId })
    expect(y.sent).toEqual([])
  })
  it('après une clôture : bilan final, même sans changement', async () => {
    const x = io()
    await executerRetour(x, { now: 1_000_000, newId })
    const y = io({ state: x.saved[0], nouveau: async () => false, clotureMs: async () => 1_000_500 })
    const r = await executerRetour(y, { now: 1_001_000, newId })
    expect(r.final).toBe(true)
    expect(y.sent.find(m => m.type === 'bilan')).toMatchObject({ final: true })
    expect(y.saved[0]).toMatchObject({ clotureMs: 1_000_500, finalMs: 1_001_000 })
  })
  it('refus d\'Event Manager : noté, et renvoyé au tour suivant', async () => {
    const x = io({ post: async (b) => ({ ok: false, status: 400, text: '{"error":"Type inconnu."}' }) })
    const r = await executerRetour(x, { now: 5000, newId })
    expect(r.echecs).toHaveLength(2)
    expect(x.saved[0]).toMatchObject({ echec: expect.stringContaining('400'), essaiMs: 5000, echecDepuisMs: 5000 })
    const y = io({ state: x.saved[0], post: x.post })
    await executerRetour(y, { now: 5000 + INTERVAL_MS, newId })
    expect(y.saved[0].echecDepuisMs).toBe(5000)
    expect(x.saved[0].consoHash).toBeUndefined()
    expect(envoiDu(x.saved[0], { now: 5000 + INTERVAL_MS, nouveau: false, clotureMs: null }).du).toBe(true)
  })
})
