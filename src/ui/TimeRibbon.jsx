/**
 * ui/TimeRibbon.jsx — ruban horaire avec une ligne « maintenant »
 *
 * <TimeRibbon start={Date} end={Date} items={[{ id, lane, start, end, label, sub, color, active, dim, onClick }]}
 *             lanes={[{ id, label }]} hourWidth={96} />
 *
 * Sans hourWidth, le ruban tient dans la largeur (vue compacte d'un créneau).
 * Avec hourWidth, il défile horizontalement et se place sur l'heure actuelle à l'ouverture.
 */
import React, { useEffect, useMemo, useRef } from 'react'
import clsx from 'clsx'
import s from './TimeRibbon.module.css'

const HOUR = 3600000
const hourLabel = (d) => `${d.getHours()}h`

export default function TimeRibbon({
  start, end, items = [], lanes, now = Date.now(), hourWidth, tickEvery, nowLabel = 'Maintenant', className,
}) {
  const scrollRef = useRef(null)
  const t0 = start.getTime()
  const span = Math.max(HOUR / 4, end.getTime() - t0)
  const pct = (t) => ((t - t0) / span) * 100
  const hours = span / HOUR
  const fit = !hourWidth
  const every = tickEvery || (fit ? Math.max(1, Math.ceil(hours / 5)) : 1)

  const ticks = useMemo(() => {
    const list = []
    const first = new Date(t0)
    first.setMinutes(0, 0, 0)
    if (first.getTime() < t0) first.setTime(first.getTime() + HOUR)
    for (let t = first.getTime(), i = 0; t <= t0 + span; t += HOUR, i++) {
      if (i % every === 0) list.push(t)
    }
    return list
  }, [t0, span, every])

  const nowIn = now >= t0 && now <= t0 + span
  const laneList = lanes?.length ? lanes : [{ id: '__all__' }]
  const byLane = (id) => items.filter(it => (lanes?.length ? it.lane === id : true))

  // Défilement vers l'heure actuelle (un tiers depuis la gauche) à l'ouverture
  useEffect(() => {
    const el = scrollRef.current
    if (!el || fit || !nowIn) return
    const x = (pct(now) / 100) * el.scrollWidth - el.clientWidth / 3
    el.scrollLeft = Math.max(0, x)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, t0, span])

  return (
    <div className={clsx(s.ribbon, fit && s.fit, className)}>
      <div className={s.scroll} ref={scrollRef}>
        <div className={s.inner} style={fit ? undefined : { width: Math.max(1, hours) * hourWidth }}>
          <div className={s.ticks} aria-hidden="true">
            {ticks.map(t => (
              <span key={t} className={s.tick} style={{ left: `${pct(t)}%` }}>{hourLabel(new Date(t))}</span>
            ))}
          </div>

          {laneList.map(lane => (
            <div key={lane.id} className={s.lane}>
              {lane.label && <span className={s.laneLabel}>{lane.label}</span>}
              <div className={s.track}>
                {ticks.map(t => <i key={t} className={s.grid} style={{ left: `${pct(t)}%` }} aria-hidden="true" />)}
                {byLane(lane.id).map(it => {
                  const a = Math.max(0, pct(it.start.getTime()))
                  const b = Math.min(100, pct(it.end.getTime()))
                  if (b <= 0 || a >= 100) return null
                  const Tag = it.onClick ? 'button' : 'div'
                  return (
                    <Tag
                      key={it.id}
                      type={it.onClick ? 'button' : undefined}
                      onClick={it.onClick}
                      className={clsx(s.item, it.active && s.active, it.dim && s.dim)}
                      style={{ left: `${a}%`, width: `${Math.max(b - a, 1.5)}%`, '--item-color': it.color || 'var(--brand)' }}
                      title={[it.label, it.sub].filter(Boolean).join(' · ')}
                    >
                      <b>{it.label}</b>
                      {it.sub && <span>{it.sub}</span>}
                    </Tag>
                  )
                })}
              </div>
            </div>
          ))}

          {nowIn && (
            <div className={s.now} style={{ left: `${pct(now)}%` }}>
              <span>{nowLabel}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
