import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// La file d'encaissement parle au store et au journal d'audit : on les remplace par des doublures
const debiter = vi.fn(async () => {})
vi.mock('../store/useAppStore', () => ({ default: { getState: () => ({ debiter }) } }))
vi.mock('../firebase/service', () => ({ addAuditLog: vi.fn() }))

const store = new Map()
vi.stubGlobal('localStorage', {
  getItem: k => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, v),
  removeItem: k => store.delete(k),
})
let online = true
vi.stubGlobal('navigator', { get onLine() { return online } })

const sale = { specId: 'FY-4A2B', specNom: 'Léa', items: [{ id: 'm1', nom: 'Bissap', prix: 300, qty: 2 }], total: 600, staffNom: 'Bar A', eventId: 'ev1' }

describe('encaissement retenu 10 secondes', () => {
  let ps
  beforeEach(async () => {
    vi.useFakeTimers()
    debiter.mockClear()
    store.clear()
    online = true
    vi.resetModules()
    ps = await import('./pendingSales')
  })
  afterEach(() => vi.useRealTimers())

  it("n'écrit rien pendant le délai, puis écrit une seule fois", async () => {
    ps.holdSale(sale)
    await vi.advanceTimersByTimeAsync(ps.HOLD_MS - 100)
    expect(debiter).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(debiter).toHaveBeenCalledTimes(1)
    // l'identifiant de vente sert d'identifiant de transaction : un renvoi ne débite pas deux fois
    expect(debiter.mock.calls[0][4]).toEqual({ txId: expect.stringMatching(/^pos-/) })
  })

  it("annuler pendant le délai : rien n'est débité", async () => {
    const id = ps.holdSale(sale)
    expect(ps.cancelSale(id)).toBe(true)
    await vi.advanceTimersByTimeAsync(ps.HOLD_MS + 1000)
    expect(debiter).not.toHaveBeenCalled()
  })

  it('hors ligne : la vente attend le réseau au lieu de partir', async () => {
    online = false
    const seen = []
    ps.subscribe(list => seen.push(list.map(x => x.status)))
    ps.holdSale(sale)
    await vi.advanceTimersByTimeAsync(ps.HOLD_MS + 100)
    expect(debiter).not.toHaveBeenCalled()
    expect(seen.at(-1)).toEqual(['waiting-network'])
  })

  it('prévient quand la vente est réellement écrite', async () => {
    const done = vi.fn()
    ps.subscribeCommitted(done)
    ps.holdSale(sale)
    await vi.advanceTimersByTimeAsync(ps.HOLD_MS + 100)
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ total: 600, specId: 'FY-4A2B' }))
  })
})
