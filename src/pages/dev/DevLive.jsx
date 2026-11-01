/**
 * pages/dev/DevLive.jsx — aperçu du planning live avec une programmation d'exemple
 * Développement uniquement (route /ui/live). Aucune lecture Firestore.
 * Les horaires sont calés sur l'heure d'ouverture de la page : un concert est toujours en cours.
 */
import React, { useMemo } from 'react'
import LivePlanning from '../public/LivePlanning'

const at = (min) => {
  const d = new Date(Date.now() + min * 60000)
  d.setMinutes(Math.round(d.getMinutes() / 15) * 15, 0, 0)
  return d
}

function buildDemo() {
  const slot = (id, artiste, scene, from, dur, type = 'musical', titre = '') =>
    ({ id, artiste, scene, titre, type, debut: at(from), fin: at(from + dur), statut: 'a-venir' })
  return {
    eventMeta: { nom: 'Festylla 2027' },
    planning: [
      slot('c1', 'Les Ondes Courtes', 'Scène A', -150, 60),
      slot('c2', 'Nadia K.', 'Scène A', -45, 75, 'musical', 'Set acoustique'),
      slot('c3', 'Brass Kolektif', 'Scène A', 45, 60),
      slot('c4', 'DJ Ylla', 'Scène A', 120, 120),
      slot('c5', 'Lecture : Les nuits du port', 'Chapiteau', -90, 45, 'litteraire'),
      slot('c6', 'Courts métrages', 'Chapiteau', 15, 90, 'cinematographique'),
      slot('c7', 'Sola', 'Scène B', -60, 50),
      slot('c8', 'Tambours du Sud', 'Scène B', 30, 60),
      slot('c9', 'Clôture', 'Scène B', 24 * 60, 90),
    ],
  }
}

export default function DevLive() {
  const demo = useMemo(buildDemo, [])
  return <LivePlanning demo={demo} />
}
