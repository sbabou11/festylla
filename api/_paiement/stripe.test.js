import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import crypto from 'node:crypto'
const require = createRequire(import.meta.url)
const { montantValide, retourValide, formEncode, paramsSession, verifierSignature, rechargeDepuisEvenement } = require('./stripe.js')

describe('recharge Stripe : contrôles', () => {
  it('montant entier de 5 € à 200 €', () => {
    expect(montantValide(2000)).toBe(2000)
    expect(montantValide(499)).toBeNull()
    expect(montantValide(20001)).toBeNull()
    expect(montantValide(12.5)).toBeNull()
    expect(montantValide('abc')).toBeNull()
  })
  it("retour : même site, page de l'espace spectateur, sans ancien « recharge »", () => {
    expect(retourValide('https://festishop.festylla.com/solde?id=FY-4F2A&ev=e1&k=ab&recharge=cs_1', 'festishop.festylla.com'))
      .toBe('https://festishop.festylla.com/solde?id=FY-4F2A&ev=e1&k=ab')
    expect(retourValide('https://autre.site/solde?id=x', 'festishop.festylla.com')).toBeNull()
    expect(retourValide('https://festishop.festylla.com/admin', 'festishop.festylla.com')).toBeNull()
    expect(retourValide('http://festishop.festylla.com/solde', 'festishop.festylla.com')).toBeNull()
  })
  it('paramètres de la page de paiement', () => {
    const p = paramsSession({ montant: 2000, ev: 'e1', specId: 'FY-4F2A', specDoc: 'FY-4F2A', retour: 'https://x/solde?id=FY-4F2A' })
    expect(p.success_url).toBe('https://x/solde?id=FY-4F2A&recharge={CHECKOUT_SESSION_ID}')
    const body = formEncode(p)
    expect(body).toContain('line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=2000')
    expect(body).toContain('metadata%5BspecId%5D=FY-4F2A')
    expect(body).not.toContain('payment_method_types')
  })
})

describe('notification Stripe', () => {
  const secret = 'whsec_test'
  const raw = JSON.stringify({ type: 'checkout.session.completed' })
  const signe = (t, corps = raw) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${corps}`).digest('hex')}`
  it('signature valide, récente', () => {
    expect(verifierSignature(raw, signe(1000), secret, 1100)).toBe(true)
  })
  it('refuse un corps modifié, une mauvaise clé ou un vieux message', () => {
    expect(verifierSignature(raw + ' ', signe(1000), secret, 1100)).toBe(false)
    expect(verifierSignature(raw, signe(1000), 'whsec_autre', 1100)).toBe(false)
    expect(verifierSignature(raw, signe(1000), secret, 1000 + 301)).toBe(false)
    expect(verifierSignature(raw, 't=1000', secret, 1000)).toBe(false)
  })
  it('ne crédite que les paiements réglés de YllaCash', () => {
    const s = { id: 'cs_1', payment_status: 'paid', currency: 'eur', amount_total: 2000,
      metadata: { objet: 'recharge-yllacash', ev: 'e1', specId: 'FY-4F2A', specDoc: 'FY-4F2A' } }
    expect(rechargeDepuisEvenement({ type: 'checkout.session.completed', data: { object: s } }))
      .toMatchObject({ sessionId: 'cs_1', ev: 'e1', specId: 'FY-4F2A', montant: 2000 })
    expect(rechargeDepuisEvenement({ type: 'checkout.session.completed', data: { object: { ...s, payment_status: 'unpaid' } } })).toBeNull()
    expect(rechargeDepuisEvenement({ type: 'checkout.session.completed', data: { object: { ...s, metadata: {} } } })).toBeNull()
    expect(rechargeDepuisEvenement({ type: 'payment_intent.created', data: { object: s } })).toBeNull()
  })
})
