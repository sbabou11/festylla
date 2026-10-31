/**
 * pages/dev/DevSolde.jsx — aperçu de l'espace spectateur avec un compte d'exemple
 * Développement uniquement (route /ui/spectateur). Aucune écriture Firestore.
 */
import React from 'react'
import SoldePage from '../public/SoldePage'

const now = Date.now()
const at = (minAgo) => {
  const d = new Date(now - minAgo * 60000)
  return {
    createdAt: { seconds: Math.floor(d.getTime() / 1000) },
    date: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
    heure: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  }
}

const DEMO = {
  eventMeta: { nom: 'Festylla 2026' },
  spec: { id: 'FY-4F2A', nom: 'Léa Martin', solde: 2750 },
  txs: [
    { type: 'debit',  label: 'Bar Scène A · 2 Bière, 1 Eco-cup', montant: 1100, ...at(28) },
    { type: 'credit', label: 'Recharge 30€',                     montant: 3000, ...at(155) },
    { type: 'reservation', label: 'Résa: Burger ×2',             montant: 1800, ...at(190) },
    { type: 'debit',  label: 'Stand Crêpes · 1 Crêpe',           montant: 400,  ...at(240) },
    { type: 'credit', label: 'Recharge initiale',                montant: 1000, ...at(300) },
    { type: 'debit',  label: 'Bar Scène B · 1 Limonade',         montant: 350,  ...at(320) },
  ],
  resas: [
    { id: 'r1', code: '4F2A-301', status: 'ready',   total: 1800, date: '20/06 22:40', items: [{ nom: 'Burger', qty: 2 }] },
    { id: 'r2', code: '4F2A-302', status: 'pending', total: 350,  date: '20/06 23:05', items: [{ nom: 'Limonade maison', qty: 1 }] },
  ],
  menu: [
    { id: 'm1', nom: 'Bière pression', prix: 500, stock: 42, cat: 'Boissons' },
    { id: 'm2', nom: 'Limonade maison', prix: 350, stock: 6, cat: 'Boissons' },
    { id: 'm3', nom: 'Soda', prix: 250, stock: 0, cat: 'Boissons' },
    { id: 'm4', nom: 'Burger', prix: 900, stock: 40, cat: 'Food' },
    { id: 'm5', nom: 'Crêpe', prix: 400, stock: 60, cat: 'Food' },
  ],
}

export default function DevSolde() {
  return <SoldePage demo={DEMO} />
}
