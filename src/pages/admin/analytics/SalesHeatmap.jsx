/**
 * Carte de chaleur des ventes : stands ou caissiers en lignes, heures de la journée festival en colonnes
 * Téléphone (moins de 641 px, 20/11/2026) : la carte est remplacée par des barres classées, regroupées
 * par stand ou par heure ; chaque barre se déplie pour montrer le détail croisé (mêmes chiffres).
 */
import React, { useMemo, useState } from 'react'
import { Flame, ChevronDown } from 'lucide-react'
import { Card, Tabs, Empty, Skeleton, Field } from '../../../ui'
import { fmt } from '../../../utils/helpers'
import { dayStart } from '../../../utils/dashboardData'
import { festivalDays, salesHeatmap } from '../../../utils/analyticsData'
import { usePeriodTransactions } from '../../../hooks/usePeriodTransactions'
import useAppStore from '../../../store/useAppStore'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import s from './analytics.module.css'

const DAY = 24 * 3600 * 1000

const dayLabel = (start, today) => {
  if (start === today) return "Aujourd'hui"
  if (start === today - DAY) return 'Hier'
  const t = new Date(start).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Tranche horaire d'une colonne (20/11/2026) : « 14h » devient « 14h–15h », comme la phrase du pic
const hourRange = (h) => {
  const n = parseInt(h.label, 10)
  return `${n}h–${(n + 1) % 24}h`
}
const ranked = (list) => list.filter(x => x.value > 0).sort((a, b) => b.value - a.value)

export default function SalesHeatmap() {
  const { isMobile } = useBreakpoint()
  const [group, setGroup] = useState('stand')
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

  // Barres du téléphone (20/11/2026) : totaux déjà calculés par salesHeatmap, sans nouveau calcul
  const bars = useMemo(() => {
    const list = group === 'stand'
      ? map.rows.map(r => ({ key: r.staff, label: r.staff, value: r.total,
          parts: ranked(r.values.map((v, i) => ({ label: hourRange(map.hours[i]), value: v }))) }))
      : map.hours.map((h, i) => ({ key: h.index, label: hourRange(h), value: h.total,
          parts: ranked(map.rows.map(r => ({ label: r.staff, value: r.values[i] }))) }))
    return ranked(list)
  }, [map, group])

  const measure = (
    <Tabs size="sm" label="Mesure" value={mode} onChange={setMode} className={s.measure}
      items={[{ value: 'montant', label: 'Montant' }, { value: 'nombre', label: 'Ventes' }]} />
  )

  // Téléphone (20/11/2026) : listes « Jour » et « Regrouper », puis barres classées
  if (isMobile) {
    const top = bars[0]?.value || 1
    return (
      <section className={s.mobileSales} aria-label="Ventes de la journée">
        <div className={s.sels}>
          <Field label="Jour">
            <select className={s.select} value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {days.slice(0, 7).map(d => <option key={d} value={d}>{dayLabel(d, today)}</option>)}
            </select>
          </Field>
          <Field label="Regrouper">
            <select className={s.select} value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="stand">Par stand</option>
              <option value="heure">Par heure</option>
            </select>
          </Field>
        </div>
        <Card title={group === 'stand' ? 'Ventes par stand' : 'Ventes par heure'} actions={measure}>
          {loading ? <Skeleton height={160} /> : bars.length === 0 ? (
            <Empty icon={Flame} title="Aucune vente sur cette journée">Les ventes par heure et par stand s'afficheront ici dès le premier encaissement.</Empty>
          ) : (
            <>
              <div className={s.hbars}>
                {bars.map(b => (
                  <details key={b.key} className={s.hbar}>
                    <summary>
                      <span className={s.hbarLabel}>{b.label}</span>
                      <span className={s.hbarTrack}><i style={{ width: `${(b.value / top) * 100}%` }} /></span>
                      <b className={s.num}>{show(b.value)}</b>
                      <ChevronDown size={16} aria-hidden="true" className={s.hbarChev} />
                    </summary>
                    <ul className={s.hbarParts}>
                      {b.parts.map(p => (
                        <li key={p.label}><span>{p.label}</span><b className={s.num}>{show(p.value)}</b></li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
              {map.peak && <p className={s.peak}>Pic {map.peak.label} · {show(map.peak.value)} · total {show(map.total)}</p>}
            </>
          )}
          {partial && <p className={s.note}>Hors ligne : calcul sur les 500 dernières transactions seulement.</p>}
        </Card>
      </section>
    )
  }

  return (
    <Card
      title="Carte de chaleur des ventes"
      subtitle={map.peak ? `Pic ${map.peak.label} · ${show(map.peak.value)} · total ${show(map.total)}` : 'Ventes par heure et par stand'}
      actions={measure}
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
        <Empty icon={Flame} title="Aucune vente sur cette journée">Les ventes par heure et par stand s'afficheront ici dès le premier encaissement.</Empty>
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
