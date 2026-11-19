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
  // Rayons, stands et catégories de l'organisateur (lot 4)
  carte: {
    rayons: [{ id: 'rP', nom: 'Plats', icon: 'utensils', ordre: 1 }, { id: 'rB', nom: 'Boissons', icon: 'beer', ordre: 2 }],
    stands: [{ id: 's2', numero: 2, nom: 'Bar' }, { id: 's4', numero: 4, nom: 'Cuisine' }],
  },
  categories: [
    { id: 'c1', nom: 'Plat viande', icon: 'utensils', couleur: '#F07848', rayonId: 'rP', ordre: 1 },
    { id: 'c2', nom: 'Plat poisson', icon: 'utensils', couleur: '#009090', rayonId: 'rP', ordre: 2 },
    { id: 'c3', nom: 'Accompagnements', icon: 'sandwich', couleur: '#D89030', rayonId: 'rP', ordre: 3 },
    { id: 'c4', nom: 'Desserts', icon: 'cookie', couleur: '#7C3AED', rayonId: 'rP', ordre: 4 },
    { id: 'c5', nom: 'Sans alcool', icon: 'coffee', couleur: '#0E8D7A', rayonId: 'rB', ordre: 5 },
    { id: 'c6', nom: 'Bières', icon: 'beer', couleur: '#B8470F', rayonId: 'rB', ordre: 6 },
  ],
  codes: [
    { code: '482913', origine: 'en-ligne', statut: 'en_attente', total: 1250, timestamp: new Date(now - 9 * 60000).toISOString(),
      items: [{ nom: 'Thiéboudienne', qty: 1, prixUnit: 900 }, { nom: 'Bissap', qty: 1, prixUnit: 350 }] },
  ],
  menu: [
    { id: 'm1', nom: 'Bière pression', prix: 500, stock: 42, cat: 'Bières', standId: 's2' },
    { id: 'm2', nom: 'Bissap', prix: 350, stock: 6, cat: 'Sans alcool', standId: 's2' },
    { id: 'm3', nom: 'Soda', prix: 250, stock: 0, cat: 'Sans alcool', standId: 's2' },
    { id: 'm4', nom: 'Yassa poulet', prix: 900, stock: 40, cat: 'Plat viande', standId: 's4' },
    { id: 'm5', nom: 'Thiéboudienne', prix: 900, stock: 30, cat: 'Plat poisson', standId: 's4' },
    { id: 'm6', nom: 'Alloco', prix: 300, stock: 50, cat: 'Accompagnements', standId: 's4' },
    { id: 'm7', nom: 'Thiakry', prix: 300, stock: 20, cat: 'Desserts', standId: 's4' },
    { id: 'm8', nom: 'Sans stand (caché)', prix: 100, stock: 9, cat: 'Desserts' },
  ],
}

export default function DevSolde() {
  return <SoldePage demo={DEMO} />
}
