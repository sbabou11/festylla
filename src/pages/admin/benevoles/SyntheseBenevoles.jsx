/**
 * pages/admin/benevoles/SyntheseBenevoles.jsx — onglet « Synthèse »
 * Totaux consommés / droits par type, puis tableau récapitulatif par bénévole.
 */
import React from 'react'
import clsx from 'clsx'
import { Users } from 'lucide-react'
import { Stat, Table, Badge } from '../../../ui'
import { ITEM_CFG, countCreneaux } from './constants'
import s from './benevoles.module.css'

export default function SyntheseBenevoles({ benevoles, totalDroits, totalConso }) {
  // Cellule « consommé / droit » : rouge si dépassé, vert si tout est consommé
  const ratio = (b, item) => {
    const cv = b.consommation?.[item] || 0, dv = b.droits?.[item] || 0
    return <span className={clsx(s.ratio, cv > dv ? s.ratioOver : cv === dv && dv > 0 && s.ratioDone)}>{cv}/{dv}</span>
  }

  const columns = [
    { key: 'nom', label: 'Bénévole', card: 'title', render: b => <span className={s.strong}>{b.prenom} {b.nom}</span> },
    { key: 'statut', label: 'Statut', align: 'right', render: b => {
      const c = b.consommation||{}, d = b.droits||{}
      const abus = Object.keys(d).some(k => (c[k]||0) > (d[k]||0))
      return abus ? <Badge tone="danger">Dépassement</Badge> : <Badge tone="success">OK</Badge>
    } },
    { key: 'poste', label: 'Poste', render: b => <span className={s.muted}>{b.poste||'—'}</span> },
    { key: 'creneaux', label: 'Créneaux', render: b => countCreneaux(b.creneaux) },
    ...Object.entries(ITEM_CFG).map(([k, cfg]) => ({ key: k, label: cfg.label, render: b => ratio(b, k) })),
  ]

  return (
    <div className={s.stack}>
      {/* KPIs globaux */}
      <div className={clsx(s.kpis, 'yc-stagger')}>
        <Stat label="Bénévoles" value={benevoles.length} icon={Users}/>
        {Object.entries(ITEM_CFG).map(([k, cfg]) => {
          const restant = (totalDroits[k]||0) - (totalConso[k]||0)
          return (
            <Stat key={k} label={`${cfg.label}s`} icon={cfg.icon} tone={cfg.tone}
              value={`${totalConso[k]||0}/${totalDroits[k]||0}`}
              sub={`${restant} restant${restant>1?'s':''}`}/>
          )
        })}
      </div>

      {/* Tableau récapitulatif */}
      <Table columns={columns} rows={benevoles} empty="Aucun bénévole enregistré"/>
    </div>
  )
}
