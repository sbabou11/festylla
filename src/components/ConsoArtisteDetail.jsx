/**
 * components/ConsoArtisteDetail.jsx — détail d'un avantage servi à un artiste (23/11/2026, maquette validée)
 *
 * Ouvert depuis « Déjà servi » (caisse, mode artiste), la fenêtre « Consommations artistes »
 * et l'historique du créneau (planning). Gabarit commun DetailSheet, lecture seule.
 * Ne montre que ce que ces écrans affichent déjà : article, type, artiste, créneau, heure, servi par ;
 * l'origine (réservation ou service direct) se déduit de fromResaId.
 *
 * props : conso (document artist-consumptions ou null), artiste, creneau (texte), onClose
 */
import React from 'react'
import { Coffee, UtensilsCrossed, Droplets } from 'lucide-react'
import DetailSheet from './DetailSheet'

const TYPE = {
  drink: { label: 'Boisson', icon: Coffee,          color: 'var(--gold)' },
  meal:  { label: 'Repas',   icon: UtensilsCrossed, color: 'var(--coral)' },
  eau:   { label: 'Eau',     icon: Droplets,        color: 'var(--brand)' },
}

const toDate = (ts) => (ts ? (ts.toDate ? ts.toDate() : new Date(ts)) : null)
const heure = (ts) => { const d = toDate(ts); return d && !isNaN(d) ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—' }
const jour  = (ts) => { const d = toDate(ts); return d && !isNaN(d) ? d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : null }

export default function ConsoArtisteDetail({ conso, artiste, creneau, onClose }) {
  const t = TYPE[conso?.type] || TYPE.eau
  return (
    <DetailSheet open={!!conso} onClose={onClose} title="Avantage servi"
      icon={t.icon} color={t.color}
      status={{ label: 'Offert', tone: 'success' }}
      value={conso?.articleNom || '—'}
      sub={artiste || conso?.artisteNom || null}
      sections={conso ? [
        { label: 'Avantage', rows: [
          ['Article', conso.articleNom || '—'],
          ['Type', t.label],
          ['Origine', conso.fromResaId ? "Réservation de l'artiste" : 'Servi directement au stand'],
        ] },
        { label: 'Service', rows: [
          ['Artiste', artiste || conso.artisteNom || '—'],
          ['Créneau', creneau || null],
          ['Servi le', jour(conso.servedAt)],
          ['Heure', heure(conso.servedAt)],
          ['Servi par', conso.servedBy?.name || '—'],
        ] },
      ] : []} />
  )
}
