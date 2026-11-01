/**
 * Carte de chaleur des ventes : stands ou caissiers en lignes, heures de la journée festival en colonnes
 */
import React, { useMemo, useState } from 'react'
import { Card, Tabs, Empty, Skeleton } from '../../../ui'
import { fmt } from '../../../utils/helpers'
import { dayStart } from '../../../utils/dashboardData'
import { festivalDays, salesHeatmap } from '../../../utils/analyticsData'
import { usePeriodTransactions } from '../../../hooks/usePeriodTransactions'
import useAppStore from '../../../store/useAppStore'
import s from './analytics.module.css'

const DAY = 24 * 3600 * 1000

const dayLabel = (start, today) => {
  if (start === today) return "Aujourd'hui"
  if (start === today - DAY) return 'Hier'
  const t = new Date(start).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export default function SalesHeatmap() {
  const { logs } = useAppStore()
  const today = dayStart(Date.now())
  const days = useMemo(() => {
    const list = festivalDays(logs || [])
    return list.includes(today) ? list : [today, ...list]
  }, [logs, today])
  const [day, setDay] = useState(today)
  const [mode, setMode] = useState('montant')
  const { transactions, loading, partial } = usePeriodTransactions(day, day + DAY)
  const map = useMemo(() => salesHeatmap(transactions, day, mode), [transactions, day, mode])
  const show = (v) => (mode === 'montant' ? fmt(v) : String(v))
  const short = (v) => (mode === 'montant' ? (v >= 10000 ? Math.round(v / 100) + '€' : (v / 100).toFixed(0) + '€') : String(v))

  return (
    <Card
      title="Carte de chaleur des ventes"
      subtitle={map.peak ? `Pic ${map.peak.label} · ${show(map.peak.value)} · total ${show(map.total)}` : 'Ventes par heure et par stand'}
      actions={<Tabs size="sm" label="Mesure" value={mode} onChange={setMode}
        items={[{ value: 'montant', label: 'Montant' }, { value: 'nombre', label: 'Ventes' }]} />}
    >
      <div className={s.chips} role="tablist" aria-label="Journée">
        {days.slice(0, 7).map(d => (
          <button key={d} type="button" role="tab" aria-selected={d === day}
            className={d === day ? `${s.chip} ${s.chipOn}` : s.chip} onClick={() => setDay(d)}>
            {dayLabel(d, today)}
          </button>
        ))}
      </div>

      {loading ? <Skeleton height={160} /> : map.rows.length === 0 ? (
        <Empty title="Aucune vente sur cette journée" />
      ) : (
        <div className={s.heatWrap}>
          <table className={s.heat}>
            <thead>
              <tr>
                <th scope="col" className={s.heatName}>Stand / caissier</th>
                {map.hours.map(h => <th key={h.index} scope="col">{h.label}</th>)}
                <th scope="col" className={s.heatTotal}>Total</th>
              </tr>
            </thead>
            <tbody>
              {map.rows.map(r => (
                <tr key={r.staff}>
                  <th scope="row" className={s.heatName}>{r.staff}</th>
                  {r.values.map((v, i) => {
                    const p = map.max ? Math.round((v / map.max) * 100) : 0
                    return (
                      <td key={i} title={`${r.staff} · ${map.hours[i].label} : ${show(v)}`}
                        style={{ '--heat': `${v ? Math.max(8, p) : 0}%` }}
                        className={p > 55 ? `${s.cell} ${s.cellHot}` : s.cell}>
                        {v ? short(v) : ''}
                      </td>
                    )
                  })}
                  <td className={s.heatTotal}>{show(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {partial && <p className={s.note}>Hors ligne : calcul sur les 500 dernières transactions seulement.</p>}
    </Card>
  )
}
