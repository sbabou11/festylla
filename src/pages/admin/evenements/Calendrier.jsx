/**
 * pages/admin/evenements/Calendrier.jsx — calendrier de conservation d'une édition passée
 * (RGPD, décidé le 24/11/2026 ; maquette https://claude.ai/artifact/AySuF3pyLcNviuoNcAwTYs)
 * Festival → remboursements (2 mois) → reversement à l'ONG → effacer la base (4 mois) → archive (10 ans)
 */
import React from 'react'
import clsx from 'clsx'
import { Check } from 'lucide-react'
import { calendrierEdition, dateLongue, moisAnnee } from '../../../utils/conservation'
import { BENEFICIAIRE } from '../../../utils/dons'
import s from './calendrier.module.css'

export function PastilleConservation({ event }) {
  const c = calendrierEdition(event)
  if (!c || c.etape === 0) return null
  if (c.niveau === 'depasse') return <span className={clsx(s.pastille, s.rouge)}>Effacement en retard</span>
  if (c.niveau === 'bientot') return <span className={clsx(s.pastille, s.orange)}>À effacer dans {c.jours} j</span>
  return <span className={clsx(s.pastille, s.vert)}>Conservation en cours</span>
}

export default function Calendrier({ event }) {
  const c = calendrierEdition(event)
  if (!c || c.etape === 0) return null
  const etapes = [
    ['Festival', `terminé le ${dateLongue(c.finFestival)}`],
    ['Remboursements', `jusqu'au ${dateLongue(c.remboursements)} (2 mois)`],
    [`Reversement à l'${BENEFICIAIRE}`, `soldes non réclamés, après le ${dateLongue(c.remboursements)}`],
    ['Effacer la base', `le ${dateLongue(c.effacement)} au plus tard (4 mois)`],
    ['Archive ZIP gardée', `jusqu'en ${moisAnnee(c.archive)} (10 ans), chez vous, en lieu sûr`],
  ]
  // Étape en cours : 1 remboursements, 2 reversement, 3 effacer (dans les 30 jours ou dépassé)
  return (
    <ol className={s.frise} aria-label="Conservation des données de cette édition">
      {etapes.map(([titre, detail], i) => {
        const fait = i < c.etape
        const enCours = i === c.etape
        return (
          <li key={titre} className={clsx(s.etape, fait && s.fait, enCours && s.cours, enCours && c.niveau === 'depasse' && s.retard)}>
            <span className={s.rond} aria-hidden="true">{fait ? <Check size={12} /> : i + 1}</span>
            <span className={s.txt}><b>{titre}</b><span>{detail}</span></span>
          </li>
        )
      })}
    </ol>
  )
}
