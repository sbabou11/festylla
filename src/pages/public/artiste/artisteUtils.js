/**
 * pages/public/artiste/artisteUtils.js — libellés, icônes et formats partagés de l'espace artiste
 */
import { Music, BookOpen, Clapperboard, Drama, Coffee, UtensilsCrossed, Droplets } from 'lucide-react'

// tone : classe CSS de couleur (tokens), jamais de couleur codée en dur
export const TYPES = {
  musical:           { icon: Music,        label: 'Musical',    tone: 'brand' },
  litteraire:        { icon: BookOpen,     label: 'Littéraire', tone: 'gold'  },
  cinematographique: { icon: Clapperboard, label: 'Cinéma',     tone: 'coral' },
  autre:             { icon: Drama,        label: 'Autre',      tone: 'neutral' },
}

// Avantages : boisson / repas / eau
export const CONSO = {
  drink: { icon: Coffee,          label: 'Boisson', tone: 'gold'  },
  meal:  { icon: UtensilsCrossed, label: 'Repas',   tone: 'coral' },
  eau:   { icon: Droplets,        label: 'Eau',     tone: 'brand' },
}
export const consoOf = (type) => CONSO[type] || CONSO.eau

export function fmtHour(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function fmtDate(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function fmtDateShort(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}
