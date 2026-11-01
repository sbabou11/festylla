/**
 * pages/dev/DevBenevole.jsx — aperçu de l'espace bénévole avec un profil d'exemple
 * Développement uniquement (route /ui/benevole). Aucune écriture Firestore.
 * Le créneau d'Awa commence 20 minutes après l'ouverture de la page : le pointage est ouvert.
 */
import React, { useMemo } from 'react'
import BenevoleApp from '../public/BenevoleApp'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hm  = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

// Créneau qui commence dans `inMin` minutes et dure `durH` heures
function shift(id, inMin, durH, label, postes, extra = {}) {
  const start = new Date(Date.now() + inMin * 60000)
  start.setMinutes(Math.round(start.getMinutes() / 5) * 5, 0, 0)
  const end = new Date(start.getTime() + durH * 3600000)
  return { id, date: ymd(start), debut: hm(start), fin: hm(end), label, postes, libres: [], ...extra }
}

function buildDemo() {
  const posts = [
    { id: 'p-accueil', nom: 'Accueil', emoji: '🎫', couleur: '#009090' },
    { id: 'p-bar',     nom: 'Bar',     emoji: '🍻', couleur: '#F07848' },
    { id: 'p-caisse',  nom: 'Caisse',  emoji: '💳', couleur: '#D89030' },
  ]
  const shifts = [
    shift('s1', -300, 2, 'Montage', { 'p-bar': { target: 2, assignments: ['b-awa', 'b-moussa'] } }),
    shift('s2', 20, 3, 'Soirée', {
      'p-accueil': { target: 3, assignments: ['b-awa', 'b-lina'] },
      'p-bar':     { target: 4, assignments: ['b-moussa'] },
    }),
    shift('s3', 24 * 60, 4, 'Samedi soir', {
      'p-caisse': { target: 2, assignments: [] },
      'p-accueil': { target: 2, assignments: ['b-lina'] },
    }),
  ]
  return {
    eventMeta: { nom: 'Festylla 2027', emoji: '🎵' },
    benev: {
      _id: 'b-awa', id: 'b-awa', prenom: 'Awa', nom: 'Diallo', poste: 'Accueil', username: 'awa', password: 'awa123',
      droits: { repas: 3, boisson: 6, eau: 1 },
      consommation: { repas: 2, boisson: 2, eau: 1 },
    },
    benevoles: [
      { id: 'b-awa', prenom: 'Awa', nom: 'Diallo' },
      { id: 'b-moussa', prenom: 'Moussa', nom: 'Keita' },
      { id: 'b-lina', prenom: 'Lina', nom: 'Martin' },
    ],
    posts,
    shifts,
    menu: [
      { id: 'm1', nom: 'Burger', prix: 900, stock: 40, cat: 'Food', typeConsommation: 'repas' },
      { id: 'm2', nom: 'Crêpe', prix: 400, stock: 60, cat: 'Food', typeConsommation: 'repas' },
      { id: 'm3', nom: 'Café', prix: 150, stock: 80, cat: 'Boissons', typeConsommation: 'boisson' },
      { id: 'm4', nom: 'Limonade maison', prix: 350, stock: 6, cat: 'Boissons', typeConsommation: 'boisson' },
      { id: 'm5', nom: "Bouteille d'eau", prix: 100, stock: 100, cat: 'Boissons', typeConsommation: 'eau' },
    ],
    resas: [
      { id: 'r1', code: 'BNV-7KQ2M', status: 'ready', total: 900, date: '19/06 19:05', items: [{ nom: 'Burger', qty: 1, typeConsommation: 'repas' }] },
      { id: 'r2', code: 'BNV-3HX9P', status: 'collected', total: 150, date: '19/06 17:40', items: [{ nom: 'Café', qty: 1, typeConsommation: 'boisson' }] },
    ],
  }
}

export default function DevBenevole() {
  const demo = useMemo(buildDemo, [])
  return <BenevoleApp demo={demo} />
}
