/**
 * pages/admin/planning/TimelineView.jsx — frise horaire du planning, une par jour
 * Glisser un bloc le déplace, tirer ses bords le redimensionne (précision 1 min).
 */
import React from 'react'
import clsx from 'clsx'
import { Calendar } from 'lucide-react'
import { Empty } from '../../../ui'
import s from './planning.module.css'

export default function TimelineView({ planning, conflicts, onEdit, onUpdateDebut }) {
  // Couleurs de type : données, transmises au CSS par --c
  const TYPES = {
    musical:           { icon: '🎵', color: '#1a6b7a' },
    litteraire:        { icon: '📚', color: '#534AB7' },
    cinematographique: { icon: '🎬', color: '#BA7517' },
    autre:             { icon: '🎭', color: '#6b6b6b' },
  }

  // State drag — utilise ref pour accès dans onEnd, et state pour le rendu live
  const draggedRef = React.useRef(false)
  const dragStateRef = React.useRef(null)
  const [dragState, setDragState] = React.useState(null)
  // dragState: { id, debut, fin, mode: 'move' | 'resize-left' | 'resize-right' }

  // Survol — pour afficher heure début/fin du créneau survolé (utile pour les courts créneaux où le label ne tient pas)
  const [hoveredId, setHoveredId] = React.useState(null)

  // Détecter mobile vs desktop
  const [isMobile, setIsMobile] = React.useState(typeof window !== 'undefined' && window.innerWidth < 640)
  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const toDate = (ts) => {
    if (!ts) return null
    return ts?.toDate ? ts.toDate() : new Date(ts)
  }

  const dayKey = (d) => {
    if (!d || isNaN(d.getTime())) return null
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')
  }

  const dayLabel = (key) => {
    const [y, m, dd] = key.split('-')
    const date = new Date(parseInt(y), parseInt(m)-1, parseInt(dd))
    return date.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })
  }

  const fmtHour = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })

  // Démarrer un drag (move, resize-left, resize-right)
  const startDrag = (e, cr, mode, totalMs, minTime, trackEl) => {
    if (!onUpdateDebut) return
    e.stopPropagation()
    e.preventDefault()
    const isTouch = e.type === 'touchstart'
    const startX = isTouch ? e.touches[0].clientX : e.clientX
    const trackWidth = trackEl.getBoundingClientRect().width
    const origDebut = toDate(cr.debut).getTime()
    const origFin   = toDate(cr.fin).getTime()
    const minDuration = 60000 // 1 minute minimum
    const PRECISION_MS = 60000 // 1 minute (précision)

    draggedRef.current = false
    dragStateRef.current = { id: cr.id, debut: origDebut, fin: origFin, mode }
    setDragState(dragStateRef.current)

    const onMove = (ev) => {
      const cx = ev.type === 'touchmove' ? ev.touches[0].clientX : ev.clientX
      const dx = cx - startX
      if (Math.abs(dx) > 3) draggedRef.current = true
      const deltaMs = (dx / trackWidth) * totalMs
      const rounded = Math.round(deltaMs / PRECISION_MS) * PRECISION_MS

      let newDebut = origDebut
      let newFin   = origFin

      if (mode === 'move') {
        newDebut = origDebut + rounded
        newFin   = origFin   + rounded
      } else if (mode === 'resize-left') {
        newDebut = Math.min(origDebut + rounded, origFin - minDuration)
      } else if (mode === 'resize-right') {
        newFin   = Math.max(origFin + rounded, origDebut + minDuration)
      }

      const ns = { id: cr.id, debut: newDebut, fin: newFin, mode }
      dragStateRef.current = ns
      setDragState(ns)
    }

    const onEnd = async () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)

      const final = dragStateRef.current
      if (draggedRef.current && final && final.id === cr.id) {
        // Sauvegarder en Firestore
        const changedDebut = final.debut !== origDebut
        const changedFin   = final.fin   !== origFin
        if (changedDebut || changedFin) {
          try {
            await onUpdateDebut(cr.id, new Date(final.debut), new Date(final.fin))
          } catch (err) {
            console.error('Erreur sauvegarde drag:', err)
          }
        }
      }
      dragStateRef.current = null
      setDragState(null)
      // Reset draggedRef après court délai pour bloquer onClick
      setTimeout(() => { draggedRef.current = false }, 150)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
  }

  // Grouper par jour
  const byDay = {}
  planning.forEach(cr => {
    const d = toDate(cr.debut)
    const key = dayKey(d)
    if (!key) return
    if (!byDay[key]) byDay[key] = []
    byDay[key].push(cr)
  })
  const dayKeys = Object.keys(byDay).sort()

  if (dayKeys.length === 0) {
    return <Empty icon={Calendar} title="Aucun créneau à afficher dans la frise" />
  }

  return (
    <div className={clsx(s.timeline, isMobile && s.tlMobile)}>
      {dayKeys.map(key => {
        const dayCrs = byDay[key].sort((a, b) => toDate(a.debut).getTime() - toDate(b.debut).getTime())
        const allTimes = dayCrs.flatMap(p => [toDate(p.debut), toDate(p.fin)].filter(Boolean))
        const MARGIN_MS = 600000 // 10 minutes de marge de chaque côté
        const minTime = Math.min(...allTimes.map(d => d.getTime())) - MARGIN_MS
        const maxTime = Math.max(...allTimes.map(d => d.getTime())) + MARGIN_MS
        const totalMs = Math.max(maxTime - minTime, 3600000)
        const pct = (ms) => Math.max(0, Math.min(100, ((ms - minTime) / totalMs) * 100))

        const hourStep = isMobile ? 7200000 : 3600000
        const hourLabels = []
        const startH = new Date(minTime); startH.setMinutes(0, 0, 0)
        for (let t = startH.getTime(); t <= maxTime + hourStep; t += hourStep) {
          const p = pct(t)
          if (p >= 0 && p <= 100) {
            hourLabels.push({ pct: p, label: new Date(t).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }) })
          }
        }

        return (
          <section key={key} className={s.tlDay}>
            <h3 className={s.tlDayTitle}>
              <Calendar size={15} aria-hidden="true" />
              {dayLabel(key)}
              <span className={s.tlDayCount}>{dayCrs.length} créneau{dayCrs.length > 1 ? 'x' : ''}</span>
            </h3>

            <div className={s.tlBoard}>
              {/* Axe horaire */}
              <div className={s.tlAxis}>
                {hourLabels.map((h, i) => (
                  <div key={i} className={s.tlHour} style={{ left: h.pct + '%' }}>{h.label}</div>
                ))}
              </div>

              {/* Lignes par artiste */}
              {dayCrs.map(cr => {
                const isDragging = dragState && dragState.id === cr.id
                const d  = isDragging ? dragState.debut : toDate(cr.debut).getTime()
                const f  = isDragging ? dragState.fin   : toDate(cr.fin).getTime()
                const left  = pct(d)
                const width = Math.max(pct(f) - left, 1.5)
                const ti    = TYPES[cr.type] || TYPES.autre
                const isConflict = conflicts?.has(cr.id)
                const isHovered = hoveredId === cr.id
                // Annulé > chevauchement > couleur du type
                const fill   = cr.statut === 'annule' ? 'var(--red)' : isConflict ? 'var(--gold)' : ti.color
                const stroke = cr.statut === 'annule' ? 'var(--red-dark)' : isConflict ? 'var(--gold-dark)' : ti.color

                return (
                  <div key={cr.id} className={s.tlRow}>
                    <div className={s.tlLabel}>
                      <div className={s.tlArtist}>{ti.icon} {cr.artiste}</div>
                      {cr.scene && !isMobile && <div className={s.tlScene}>{cr.scene}</div>}
                    </div>

                    {/* Frise */}
                    <div ref={el => { if (el) el._trackEl = el }} className={s.tlTrack}>
                      {hourLabels.map((h, i) => (
                        <div key={i} className={s.tlGrid} style={{ left: h.pct + '%' }} />
                      ))}

                      {/* Bloc créneau */}
                      <div
                        onClick={(e) => { if (!draggedRef.current) onEdit(cr) }}
                        onMouseDown={(e) => startDrag(e, cr, 'move', totalMs, minTime, e.currentTarget.parentElement)}
                        onTouchStart={(e) => startDrag(e, cr, 'move', totalMs, minTime, e.currentTarget.parentElement)}
                        onMouseEnter={() => setHoveredId(cr.id)}
                        onMouseLeave={() => setHoveredId(curr => curr === cr.id ? null : curr)}
                        title={fmtHour(d) + ' → ' + fmtHour(f) + (cr.scene ? ' · ' + cr.scene : '')}
                        className={clsx(
                          s.tlBlock,
                          onUpdateDebut && s.tlDraggable,
                          isHovered && s.tlHovered,
                          isDragging && s.tlDragging,
                          cr.statut === 'annule' && s.tlAnnule,
                        )}
                        style={{ left: left + '%', width: width + '%', '--c': fill, '--c-border': stroke }}
                      >
                        {/* Info-bulle heure début → fin au survol (pas pendant le drag, qui a ses propres curseurs) */}
                        {isHovered && !isDragging && (
                          <div className={s.tlTip}>{fmtHour(d)} → {fmtHour(f)}</div>
                        )}
                        {/* Poignée gauche (resize) */}
                        {onUpdateDebut && (
                          <div
                            className={clsx(s.tlHandle, s.tlHandleL)}
                            onMouseDown={(e) => startDrag(e, cr, 'resize-left', totalMs, minTime, e.currentTarget.parentElement.parentElement)}
                            onTouchStart={(e) => startDrag(e, cr, 'resize-left', totalMs, minTime, e.currentTarget.parentElement.parentElement)}
                          />
                        )}

                        {/* Heure dans le bloc (si assez large) */}
                        {width > 8 && (
                          <span className={s.tlTime}>{fmtHour(d)}{!isMobile && ' → ' + fmtHour(f)}</span>
                        )}

                        {/* Curseur heure début (visible pendant drag) */}
                        {isDragging && (dragState.mode === 'move' || dragState.mode === 'resize-left') && (
                          <div className={clsx(s.tlCursor, s.tlCursorL)}>{fmtHour(d)}</div>
                        )}
                        {/* Curseur heure fin (visible pendant drag) */}
                        {isDragging && (dragState.mode === 'move' || dragState.mode === 'resize-right') && (
                          <div className={clsx(s.tlCursor, s.tlCursorR)}>{fmtHour(f)}</div>
                        )}

                        {/* Poignée droite (resize) */}
                        {onUpdateDebut && (
                          <div
                            className={clsx(s.tlHandle, s.tlHandleR)}
                            onMouseDown={(e) => startDrag(e, cr, 'resize-right', totalMs, minTime, e.currentTarget.parentElement.parentElement)}
                            onTouchStart={(e) => startDrag(e, cr, 'resize-right', totalMs, minTime, e.currentTarget.parentElement.parentElement)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      <p className={s.tlLegend}>
        <span>Glissez un bloc pour le déplacer · Tirez les bords pour redimensionner (précision 1 min)</span>
        <span className={s.tlLegendWarn}>⚠ Orange = chevauchement</span>
      </p>
    </div>
  )
}
