/**
 * pages/admin/planning/ConsommationsModal.jsx — suivi des consommations artistes
 * Totaux par type, détail par créneau, export CSV.
 */
import React, { useState } from 'react'
import clsx from 'clsx'
import { Coffee, UtensilsCrossed, Droplet, Download, Receipt } from 'lucide-react'
import { Dialog, Button, Stat, Empty } from '../../../ui'
import ConsoArtisteDetail from '../../../components/ConsoArtisteDetail'
import tap from '../../../components/CarteCliquable.module.css'
import s from './planning.module.css'

export default function ConsommationsModal({ consumptions, planning, onClose }) {
  // Détail d'une consommation (23/11/2026) : { conso, creneau }
  const [ouverte, setOuverte] = useState(null)
  // Grouper par créneau
  const byCreneau = {}
  consumptions.forEach(c => {
    const k = c.creneauId
    if (!byCreneau[k]) byCreneau[k] = []
    byCreneau[k].push(c)
  })

  const creneauList = Object.keys(byCreneau).map(crId => {
    const cr = planning.find(p => p.id === crId)
    return { id: crId, creneau: cr, consos: byCreneau[crId] }
  }).filter(x => x.creneau).sort((a,b) => {
    const ta = a.creneau.debut?.toDate ? a.creneau.debut.toDate().getTime() : 0
    const tb = b.creneau.debut?.toDate ? b.creneau.debut.toDate().getTime() : 0
    return tb - ta
  })

  const totalDrinks = consumptions.filter(c => c.type === 'drink').length
  const totalMeals  = consumptions.filter(c => c.type === 'meal').length
  const totalEaux   = consumptions.filter(c => c.type === 'eau').length

  const fmtHour = (ts) => {
    if (!ts) return '—'
    const d = ts?.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
  }
  const fmtDate = (ts) => {
    if (!ts) return '—'
    const d = ts?.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString('fr-FR', { day:'numeric', month:'short' })
  }

  const exportCsv = () => {
    const rows = [['Artiste', 'Créneau', 'Article', 'Type', 'Date', 'Heure', 'Servi par']]
    creneauList.forEach(({ creneau, consos }) => {
      consos.forEach(c => {
        rows.push([
          creneau.artiste || '',
          fmtDate(creneau.debut) + ' ' + fmtHour(creneau.debut),
          c.articleNom || '',
          c.type === 'drink' ? 'Boisson' : c.type === 'meal' ? 'Repas' : 'Eau',
          fmtDate(c.servedAt),
          fmtHour(c.servedAt),
          c.servedBy?.name || ''
        ])
      })
    })
    const csv = rows.map(r => r.map(c => '"' + (c||'').toString().replace(/"/g, '""') + '"').join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = 'consommations-artistes-' + new Date().toISOString().slice(0,10) + '.csv'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open onClose={onClose} title="Consommations artistes" className={s.wideDialog}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Fermer</Button>
        <Button variant="secondary" icon={Download} onClick={exportCsv}>Exporter CSV</Button>
      </>}>
      {/* Totaux */}
      <div className={s.totals}>
        <Stat label="Boissons" value={totalDrinks} icon={Coffee} />
        <Stat label="Repas" value={totalMeals} icon={UtensilsCrossed} tone="coral" />
        <Stat label="Eau" value={totalEaux} icon={Droplet} tone="success" />
      </div>

      {/* Détail par artiste */}
      {creneauList.length === 0 ? (
        <Empty icon={Receipt} title="Aucune consommation enregistrée">Les boissons, repas et eau servis aux artistes apparaîtront ici.</Empty>
      ) : (
        <div className={s.consoList}>
          {creneauList.map(({ creneau, consos }) => (
            <div key={creneau.id} className={s.consoCard}>
              <div className={s.consoHead}>
                {creneau.artiste} <span>· {fmtDate(creneau.debut)} {fmtHour(creneau.debut)}</span>
              </div>
              {consos.map(c => {
                const icon = c.type === 'drink' ? '☕' : c.type === 'meal' ? '🍽' : '💧'
                return (
                  <button type="button" key={c.id} className={clsx(tap.tap, s.consoRow)} style={{ width: '100%', minHeight: 36, alignItems: 'center' }}
                    onClick={() => setOuverte({ conso: c, creneau })} aria-haspopup="dialog"
                    aria-label={`Détail : ${c.articleNom || 'article'} servi à ${creneau.artiste || "l'artiste"} à ${fmtHour(c.servedAt)}`}>
                    <span aria-hidden="true">{icon}</span>
                    <span className={s.histName}>{c.articleNom}</span>
                    <span className={s.num}>{fmtHour(c.servedAt)} · {c.servedBy?.name || '—'}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
      <ConsoArtisteDetail conso={ouverte?.conso || null} onClose={() => setOuverte(null)}
        artiste={ouverte?.creneau?.artiste}
        creneau={ouverte?.creneau ? `${fmtDate(ouverte.creneau.debut)} ${fmtHour(ouverte.creneau.debut)}${ouverte.creneau.scene ? ' · ' + ouverte.creneau.scene : ''}` : null} />
    </Dialog>
  )
}
