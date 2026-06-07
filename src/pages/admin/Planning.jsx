/**
 * pages/admin/Planning.jsx — v5
 * Gestion du planning festival : créneaux, artistes, scènes
 * Accessible aux rôles admin et super_admin
 */
import React, { useState, useEffect, useRef, useMemo } from 'react'
import useAppStore from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import useAuthStore from '../../store/useAuthStore'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { addCreneau, updateCreneau, deleteCreneau, watchArtistConsumptions, watchCachets, getSettings } from '../../firebase/service'
import { db } from '../../firebase/config'
import { collection, onSnapshot } from 'firebase/firestore'
import { compressImage } from '../../utils/imageUtils'
import { APP_VERSION_LABEL, APP_FULL_LABEL } from '../../utils/buildInfo'
import {
  Plus, Pencil, Trash2, Copy, Bell, X, Save, ChevronDown, ChevronUp,
  Music, BookOpen, Film, Calendar, Clock, MapPin, ExternalLink,
  AlertCircle, CheckCircle, Eye
} from 'lucide-react'

const TYPES = [
  { value: 'musical',        label: 'Musical',        icon: '🎵', color: '#1a6b7a' },
  { value: 'litteraire',     label: 'Littéraire',     icon: '📚', color: '#534AB7' },
  { value: 'cinematographique', label: 'Cinéma',      icon: '🎬', color: '#BA7517' },
  { value: 'autre',          label: 'Autre',          icon: '🎭', color: '#6b6b6b' },
]

const STATUTS = [
  { value: 'a-venir',  label: 'À venir',    color: '#534AB7', bg: '#EDE9FE' },
  { value: 'en-cours', label: 'En cours',   color: '#065f46', bg: '#d1fae5' },
  { value: 'termine',  label: 'Terminé',    color: '#64748b', bg: '#f1f5f9' },
  { value: 'annule',   label: 'Annulé',     color: '#A32D2D', bg: '#FCEBEB' },
]

const EMPTY_FORM = {
  artiste: '', titre: '', type: 'musical', scene: '',
  debut: '', fin: '', description: '', bio: '', photo: '',
  // Balance optionnelle (admin peut la remplir ou laisser vide)
  balanceDebut: '', balanceFin: '', balanceScene: '',
  avantages: { drinks: 0, meals: 0, eaux: 0, drinkIds: [], mealIds: [], eauIds: [] },
  liens: { spotify: '', instagram: '', facebook: '', tiktok: '', youtube: '', site: '' },
  statut: 'a-venir',
}

// Convertit un Timestamp Firestore en string compatible datetime-local (heure locale)
function toLocalDatetimeString(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  // Compenser l offset UTC pour avoir l heure locale dans le champ datetime-local
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

// Détecte les chevauchements sur la même scène
function detectChevauchements(planning) {
  const conflicts = new Set()
  for (let i = 0; i < planning.length; i++) {
    for (let j = i + 1; j < planning.length; j++) {
      const a = planning[i], b = planning[j]
      if (!a.scene || !b.scene || a.scene !== b.scene) continue
      const ad = a.debut?.toDate ? a.debut.toDate().getTime() : new Date(a.debut).getTime()
      const af = a.fin?.toDate   ? a.fin.toDate().getTime()   : new Date(a.fin).getTime()
      const bd = b.debut?.toDate ? b.debut.toDate().getTime() : new Date(b.debut).getTime()
      const bf = b.fin?.toDate   ? b.fin.toDate().getTime()   : new Date(b.fin).getTime()
      if (isNaN(ad)||isNaN(af)||isNaN(bd)||isNaN(bf)) continue
      if (ad < bf && af > bd) { conflicts.add(a.id); conflicts.add(b.id) }
    }
  }
  return conflicts
}

function fmt2(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function duree(debut, fin) {
  if (!debut || !fin) return ''
  const d = debut.toDate ? debut.toDate() : new Date(debut)
  const f = fin.toDate   ? fin.toDate()   : new Date(fin)
  const m = Math.round((f - d) / 60000)
  if (m <= 0) return ''
  return m >= 60 ? `${Math.floor(m/60)}h${m%60>0?String(m%60).padStart(2,'0'):''}` : `${m}min`
}


// ── Composant Timeline ────────────────────────────────────────────────
function TimelineView({ planning, conflicts, onEdit, onUpdateDebut }) {
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
    return (
      <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--muted)', fontSize:14 }}>
        Aucun créneau à afficher dans la timeline.
      </div>
    )
  }

  const labelWidth = isMobile ? 80 : 140
  const rowHeight  = isMobile ? 38 : 34
  const fontMain   = isMobile ? 11 : 12
  const fontSub    = isMobile ? 9  : 10

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, width:'100%' }}>
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
          <div key={key} style={{ width:'100%' }}>
            <div style={{ fontSize: isMobile ? 13 : 14, fontWeight:800, color:'var(--text)', marginBottom:10, textTransform:'capitalize' }}>
              📅 {dayLabel(key)}
              <span style={{ fontSize:11, fontWeight:600, color:'var(--muted)', marginLeft:8 }}>
                ({dayCrs.length} créneau{dayCrs.length > 1 ? 'x' : ''})
              </span>
            </div>

            <div style={{ border:'0.5px solid var(--border)', borderRadius:10, background:'var(--bg)', padding: isMobile ? '8px' : '10px 12px 12px', width:'100%', boxSizing:'border-box' }}>
              {/* Axe horaire */}
              <div style={{ position:'relative', height:20, marginLeft: labelWidth + 4, marginBottom:6 }}>
                {hourLabels.map((h, i) => (
                  <div key={i} style={{ position:'absolute', left:h.pct+'%', fontSize: fontSub, color:'var(--muted)', transform:'translateX(-50%)', whiteSpace:'nowrap', fontWeight:600 }}>
                    {h.label}
                  </div>
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

                return (
                  <div key={cr.id} style={{ display:'flex', alignItems:'center', marginBottom:6, width:'100%' }}>
                    <div style={{ width: labelWidth, flexShrink:0, paddingRight:6, textAlign:'right', overflow:'hidden' }}>
                      <div style={{ fontSize: fontMain, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {ti.icon} {cr.artiste}
                      </div>
                      {cr.scene && !isMobile && <div style={{ fontSize:9, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cr.scene}</div>}
                    </div>

                    {/* Frise */}
                    <div ref={el => { if (el) el._trackEl = el }} style={{ flex:1, position:'relative', height: rowHeight, background:'var(--bg2)', borderRadius:6, border:'0.5px solid var(--border)', minWidth:0 }}>
                      {hourLabels.map((h, i) => (
                        <div key={i} style={{ position:'absolute', left:h.pct+'%', top:0, bottom:0, width:'0.5px', background:'var(--border)', opacity:.6 }}/>
                      ))}

                      {/* Bloc créneau */}
                      <div
                        onClick={(e) => { if (!draggedRef.current) onEdit(cr) }}
                        onMouseDown={(e) => startDrag(e, cr, 'move', totalMs, minTime, e.currentTarget.parentElement)}
                        onTouchStart={(e) => startDrag(e, cr, 'move', totalMs, minTime, e.currentTarget.parentElement)}
                        onMouseEnter={() => setHoveredId(cr.id)}
                        onMouseLeave={() => setHoveredId(curr => curr === cr.id ? null : curr)}
                        title={fmtHour(d) + ' → ' + fmtHour(f) + (cr.scene ? ' · ' + cr.scene : '')}
                        style={{
                          position:'absolute', left:left+'%', width:width+'%',
                          top:4, bottom:4, borderRadius:5,
                          background: cr.statut === 'annule' ? '#A32D2D' : isConflict ? '#EF9F27' : ti.color,
                          border:'1.5px solid ' + (cr.statut === 'annule' ? '#7A1F1F' : isConflict ? '#BA7517' : ti.color),
                          cursor: onUpdateDebut ? (isDragging ? 'grabbing' : 'grab') : 'pointer', overflow:'visible',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          opacity: cr.statut === 'annule' ? 0.7 : 1,
                          boxShadow: isDragging ? '0 4px 16px rgba(0,0,0,.3)' : (hoveredId === cr.id ? '0 2px 10px rgba(0,0,0,.2)' : '0 1px 3px rgba(0,0,0,.1)'),
                          zIndex: isDragging ? 10 : (hoveredId === cr.id ? 5 : 1),
                          userSelect: 'none', touchAction: 'pan-y',
                          transition: isDragging ? 'none' : 'box-shadow .15s',
                        }}>
                        {/* Tooltip heure début → fin au survol (pas pendant le drag, qui a ses propres curseurs) */}
                        {hoveredId === cr.id && !isDragging && (
                          <div style={{
                            position:'absolute', left:'50%', top:-28,
                            transform:'translateX(-50%)',
                            background:'#003048', color:'#FFF8F2',
                            padding:'4px 9px', borderRadius:5,
                            fontSize:11, fontWeight:700, fontVariantNumeric:'tabular-nums',
                            whiteSpace:'nowrap', pointerEvents:'none',
                            boxShadow:'0 4px 12px rgba(0,0,0,.25)',
                            zIndex: 20,
                          }}>
                            {fmtHour(d)} → {fmtHour(f)}
                            {/* Petite flèche pointant vers le bloc */}
                            <div style={{
                              position:'absolute', left:'50%', bottom:-4, transform:'translateX(-50%) rotate(45deg)',
                              width:8, height:8, background:'#003048',
                            }}/>
                          </div>
                        )}
                        {/* Poignée gauche (resize) */}
                        {onUpdateDebut && (
                          <div
                            onMouseDown={(e) => startDrag(e, cr, 'resize-left', totalMs, minTime, e.currentTarget.parentElement.parentElement)}
                            onTouchStart={(e) => startDrag(e, cr, 'resize-left', totalMs, minTime, e.currentTarget.parentElement.parentElement)}
                            style={{
                              position:'absolute', left:-2, top:0, bottom:0, width:8,
                              cursor:'ew-resize', background:'rgba(255,255,255,.0)',
                              borderTopLeftRadius:5, borderBottomLeftRadius:5,
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,.3)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,.0)'}
                          />
                        )}

                        {/* Label heure dans le bloc (si assez large) */}
                        {width > 8 && (
                          <span style={{ fontSize: fontSub, fontWeight:700, color:'#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', padding:'0 8px' }}>
                            {fmtHour(d)}{!isMobile && ' → ' + fmtHour(f)}
                          </span>
                        )}

                        {/* Curseur heure début (visible pendant drag) */}
                        {isDragging && (dragState.mode === 'move' || dragState.mode === 'resize-left') && (
                          <div style={{
                            position:'absolute', left:-2, top:-22, fontSize:10, fontWeight:800,
                            background:'#222', color:'#fff', padding:'2px 6px', borderRadius:4,
                            whiteSpace:'nowrap', transform:'translateX(-50%)', pointerEvents:'none',
                            boxShadow:'0 2px 6px rgba(0,0,0,.3)',
                          }}>
                            {fmtHour(d)}
                          </div>
                        )}
                        {/* Curseur heure fin (visible pendant drag) */}
                        {isDragging && (dragState.mode === 'move' || dragState.mode === 'resize-right') && (
                          <div style={{
                            position:'absolute', right:-2, top:-22, fontSize:10, fontWeight:800,
                            background:'#222', color:'#fff', padding:'2px 6px', borderRadius:4,
                            whiteSpace:'nowrap', transform:'translateX(50%)', pointerEvents:'none',
                            boxShadow:'0 2px 6px rgba(0,0,0,.3)',
                          }}>
                            {fmtHour(f)}
                          </div>
                        )}

                        {/* Poignée droite (resize) */}
                        {onUpdateDebut && (
                          <div
                            onMouseDown={(e) => startDrag(e, cr, 'resize-right', totalMs, minTime, e.currentTarget.parentElement.parentElement)}
                            onTouchStart={(e) => startDrag(e, cr, 'resize-right', totalMs, minTime, e.currentTarget.parentElement.parentElement)}
                            style={{
                              position:'absolute', right:-2, top:0, bottom:0, width:8,
                              cursor:'ew-resize', background:'rgba(255,255,255,.0)',
                              borderTopRightRadius:5, borderBottomRightRadius:5,
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,.3)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,.0)'}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textAlign:'center', padding:'0 10px' }}>
        Glissez un bloc pour le déplacer · Tirez les bords pour redimensionner (précision 1 min)
        <span style={{ color:'#BA7517', fontWeight:700, marginLeft:10 }}>⚠ Orange = chevauchement</span>
      </div>
    </div>
  )
}


// ── Composant Avantages Artiste ───────────────────────────────────────
function AvantagesArtisteBlock({ form, setForm, menuItems }) {
  const [open, setOpen] = React.useState(
    !!(form.avantages?.drinks || form.avantages?.meals || form.avantages?.eaux)
  )

  const av = form.avantages || { drinks:0, meals:0, eaux:0, drinkIds:[], mealIds:[], eauIds:[] }

  // Articles disponibles par catégorie (basé sur typeConsommation)
  const drinkArticles = menuItems.filter(m => m.typeConsommation === 'boisson')
  const mealArticles  = menuItems.filter(m => m.typeConsommation === 'repas')
  const eauArticles   = menuItems.filter(m => m.typeConsommation === 'eau')

  const setQty = (key, val) => {
    setForm(f => ({ ...f, avantages: { ...f.avantages, [key]: Math.max(0, parseInt(val) || 0) } }))
  }
  const toggleId = (listKey, id) => {
    setForm(f => {
      const cur = f.avantages?.[listKey] || []
      const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
      return { ...f, avantages: { ...f.avantages, [listKey]: next } }
    })
  }

  const Section = ({ icon, label, qtyKey, idsKey, articles }) => {
    const qty = av[qtyKey] || 0
    const selected = av[idsKey] || []
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
          <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{icon} {label}</span>
          <input type="number" min="0" value={qty} onChange={e => setQty(qtyKey, e.target.value)}
            style={{ width:60, minHeight:30, padding:'0 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:12, color:'var(--text)', background:'var(--bg)', textAlign:'center', outline:'none' }}/>
          <span style={{ fontSize:11, color:'var(--muted)' }}>offert{qty > 1 ? 's' : ''}</span>
        </div>
        {qty > 0 && (
          <div style={{ paddingLeft:12, paddingTop:4 }}>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>Articles autorisés :</div>
            {articles.length === 0 ? (
              <div style={{ fontSize:11, color:'var(--muted)', fontStyle:'italic' }}>
                Aucun article de cette catégorie dans le menu. Configurez-en dans Menu &gt; Articles avec « Type consommation bénévole = {label} ».
              </div>
            ) : (
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {articles.map(a => {
                  const isSel = selected.includes(a.id)
                  return (
                    <button type="button" key={a.id} onClick={() => toggleId(idsKey, a.id)}
                      style={{ padding:'4px 10px', borderRadius:14, border:'1px solid ' + (isSel ? 'var(--brand)' : 'var(--border)'), background: isSel ? 'var(--brand)' : 'var(--bg)', color: isSel ? '#fff' : 'var(--muted)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
                      {isSel ? '✓ ' : ''}{a.nom}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 16, border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width:'100%', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--bg2)', border:'none', cursor:'pointer', fontFamily:'var(--font)', color:'var(--text)' }}>
        <span style={{ fontSize:13, fontWeight:700 }}>🎁 Avantages artiste</span>
        <span style={{ fontSize:12, color:'var(--muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding:'12px 14px' }}>
          <Section icon="☕" label="Boissons" qtyKey="drinks" idsKey="drinkIds" articles={drinkArticles}/>
          <Section icon="🍽" label="Repas"    qtyKey="meals"  idsKey="mealIds"  articles={mealArticles}/>
          <Section icon="💧" label="Eau"      qtyKey="eaux"   idsKey="eauIds"   articles={eauArticles}/>
        </div>
      )}
    </div>
  )
}



// ── Panneau Avantages & Consos (dans liste dépliée) ───────────────────
function CreneauAvantagesPanel({ creneau, consumptions, menuItems }) {
  const av = creneau.avantages || { drinks: 0, meals: 0, eaux: 0, drinkIds: [], mealIds: [], eauIds: [] }
  const totalQty = (av.drinks || 0) + (av.meals || 0) + (av.eaux || 0)
  if (totalQty === 0) return null

  const crConsos = consumptions.filter(c => c.creneauId === creneau.id)
  const consDrinks = crConsos.filter(c => c.type === 'drink').length
  const consMeals  = crConsos.filter(c => c.type === 'meal').length
  const consEaux   = crConsos.filter(c => c.type === 'eau').length

  const fmtH = (ts) => {
    if (!ts) return '—'
    const d = ts?.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
  }

  const nameOf = (id) => {
    const a = menuItems.find(m => m.id === id)
    return a?.nom || '—'
  }

  const Row = ({ icon, label, total, used, ids }) => {
    if (total === 0) return null
    const remain = Math.max(0, total - used)
    const pct = Math.min(100, (used / total) * 100)
    const allUsed = remain === 0
    return (
      <div style={{ marginBottom:8 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
          <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{icon} {label}</span>
          <span style={{ fontSize:11, fontWeight:700, color: allUsed ? '#A32D2D' : 'var(--brand)' }}>
            {used}/{total} {allUsed && '· Épuisé'}
          </span>
        </div>
        <div style={{ height:6, background:'var(--bg)', borderRadius:3, overflow:'hidden', marginBottom:4 }}>
          <div style={{ width:pct+'%', height:'100%', background: allUsed ? '#A32D2D' : 'var(--brand)', transition:'width .3s' }}/>
        </div>
        {ids && ids.length > 0 && (
          <div style={{ fontSize:10, color:'var(--muted)' }}>
            Éligibles : {ids.map(nameOf).join(', ')}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginTop:10, padding:'10px 12px', background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:10 }}>
      <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.05em' }}>
        🎁 Avantages artiste (temps réel)
      </div>
      <Row icon="☕" label="Boissons" total={av.drinks || 0} used={consDrinks} ids={av.drinkIds || []}/>
      <Row icon="🍽" label="Repas"    total={av.meals  || 0} used={consMeals}  ids={av.mealIds  || []}/>
      <Row icon="💧" label="Eau"      total={av.eaux   || 0} used={consEaux}   ids={av.eauIds   || []}/>

      {crConsos.length > 0 && (
        <div style={{ marginTop:10, paddingTop:8, borderTop:'0.5px dashed var(--border)' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:4, textTransform:'uppercase' }}>
            Historique ({crConsos.length})
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:3, maxHeight:120, overflowY:'auto' }}>
            {[...crConsos].sort((a, b) => {
              const ta = a.servedAt?.toMillis ? a.servedAt.toMillis() : 0
              const tb = b.servedAt?.toMillis ? b.servedAt.toMillis() : 0
              return tb - ta
            }).map(c => {
              const icn = c.type === 'drink' ? '☕' : c.type === 'meal' ? '🍽' : '💧'
              return (
                <div key={c.id} style={{ fontSize:10, color:'var(--muted)', display:'flex', gap:6 }}>
                  <span>{icn}</span>
                  <span style={{ flex:1, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.articleNom}</span>
                  <span>{fmtH(c.servedAt)}</span>
                  {c.servedBy?.name && <span>· {c.servedBy.name}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Modale Suivi Consommations ────────────────────────────────────────
function ConsommationsModal({ consumptions, planning, onClose }) {
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
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = 'consommations-artistes-' + new Date().toISOString().slice(0,10) + '.csv'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:'clamp(8px, 3vw, 20px)' }}>
      <div style={{ background:'var(--bg)', borderRadius:16, padding:'clamp(14px, 4vw, 24px)', width:'100%', maxWidth:720, boxSizing:'border-box', marginTop:20, marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div style={{ fontSize:16, fontWeight:800, color:'var(--text)' }}>📊 Consommations artistes</div>
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={exportCsv}
              style={{ padding:'6px 12px', background:'var(--brand)', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'var(--font)' }}>
              📥 CSV
            </button>
            <button onClick={onClose}
              style={{ width:32, height:32, background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:8, cursor:'pointer', color:'var(--muted)' }}>
              ✕
            </button>
          </div>
        </div>

        {/* Totaux */}
        <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
          <div style={{ flex:'1 1 100px', padding:'10px 14px', background:'var(--bg2)', borderRadius:10, textAlign:'center' }}>
            <div style={{ fontSize:24 }}>☕</div>
            <div style={{ fontSize:18, fontWeight:800, color:'var(--brand)' }}>{totalDrinks}</div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>Boissons</div>
          </div>
          <div style={{ flex:'1 1 100px', padding:'10px 14px', background:'var(--bg2)', borderRadius:10, textAlign:'center' }}>
            <div style={{ fontSize:24 }}>🍽</div>
            <div style={{ fontSize:18, fontWeight:800, color:'var(--brand)' }}>{totalMeals}</div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>Repas</div>
          </div>
          <div style={{ flex:'1 1 100px', padding:'10px 14px', background:'var(--bg2)', borderRadius:10, textAlign:'center' }}>
            <div style={{ fontSize:24 }}>💧</div>
            <div style={{ fontSize:18, fontWeight:800, color:'var(--brand)' }}>{totalEaux}</div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>Eau</div>
          </div>
        </div>

        {/* Détail par artiste */}
        {creneauList.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--muted)', fontSize:13 }}>
            Aucune consommation enregistrée.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {creneauList.map(({ creneau, consos }) => (
              <div key={creneau.id} style={{ border:'0.5px solid var(--border)', borderRadius:10, padding:'10px 12px' }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:6 }}>
                  {creneau.artiste} <span style={{ fontSize:11, color:'var(--muted)', fontWeight:400 }}>· {fmtDate(creneau.debut)} {fmtHour(creneau.debut)}</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {consos.map(c => {
                    const icon = c.type === 'drink' ? '☕' : c.type === 'meal' ? '🍽' : '💧'
                    return (
                      <div key={c.id} style={{ fontSize:12, color:'var(--muted)', display:'flex', gap:8 }}>
                        <span>{icon}</span>
                        <span style={{ flex:1, color:'var(--text)' }}>{c.articleNom}</span>
                        <span>{fmtHour(c.servedAt)} · {c.servedBy?.name || '—'}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


// ── Génération fiche artiste imprimable (1 page garantie) ──────────
async function printArtisteSheet(form, creneauId, eventId) {
  const url = window.location.origin + '/artiste?ev=' + eventId + '&cr=' + creneauId
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=' + encodeURIComponent(JSON.stringify({ ev: eventId, cr: creneauId, type: 'artiste' }))

  // Charger thème + meta événement
  let brand = '#1a6b7a'
  let eventNom = ''
  let logoSrc = ''
  try {
    const settings = await getSettings(eventId)
    if (settings?.theme?.brand) brand = settings.theme.brand
    if (settings?.theme?.logoSrc) logoSrc = settings.theme.logoSrc
  } catch {}
  try {
    const { doc, getDoc } = await import('firebase/firestore')
    const { db } = await import('../../firebase/config')
    const snap = await getDoc(doc(db, 'events', eventId))
    if (snap.exists()) {
      eventNom = snap.data().nom || ''
      if (!logoSrc) logoSrc = snap.data().logoSrc || ''
    }
  } catch {}

  // Variantes de couleur
  const hex = brand.replace('#','')
  const r = parseInt(hex.slice(0,2), 16)
  const g = parseInt(hex.slice(2,4), 16)
  const b = parseInt(hex.slice(4,6), 16)
  const brandDark  = '#' + [r,g,b].map(v => Math.max(0, Math.round(v*.7)).toString(16).padStart(2,'0')).join('')
  const brandLight = 'rgba(' + r + ',' + g + ',' + b + ',0.08)'
  const brandMid   = 'rgba(' + r + ',' + g + ',' + b + ',0.18)'

  const artiste = form.artiste || '—'
  const titre = form.titre || ''
  const type = form.type || ''
  const typeLabels = { musical:'🎵 Musical', litteraire:'📚 Littéraire', cinematographique:'🎬 Cinéma', autre:'🎭 Autre' }
  const scene = form.scene || ''
  const fmtDt = (d) => {
    if (!d) return '—'
    const dt = new Date(d)
    if (isNaN(dt)) return '—'
    return dt.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
  }
  const fmtHr = (d) => {
    if (!d) return '—'
    const dt = new Date(d)
    return isNaN(dt) ? '—' : dt.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
  }
  const liens = form.liens || {}
  const liensFiltres = Object.entries(liens).filter(([_, v]) => v && v.trim())
  const labels = { spotify:'Spotify', instagram:'Instagram', facebook:'Facebook', tiktok:'TikTok', youtube:'YouTube', site:'Site web' }
  const icons  = { spotify:'🎧', instagram:'📷', facebook:'👥', tiktok:'🎵', youtube:'▶️', site:'🌐' }
  const safe = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  let html = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Fiche artiste — ' + safe(artiste) + '</title>'
  html += '<style>'
  html += '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
  html += 'html,body{margin:0;padding:0}'
  html += 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1a1a1a;background:#f5f5f7;padding:16px;line-height:1.45}'
  html += '.sheet{max-width:720px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.06)}'
  // Header compact
  html += '.header{background:linear-gradient(135deg,' + brand + ' 0%,' + brandDark + ' 100%);color:#fff;padding:18px 28px;position:relative;overflow:hidden}'
  html += '.header::before{content:"";position:absolute;top:-30px;right:-30px;width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,.08)}'
  html += '.header::after{content:"";position:absolute;bottom:-50px;left:-50px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.06)}'
  html += '.header-content{position:relative;z-index:1;display:flex;align-items:center;gap:14px}'
  html += '.logo-circle{width:44px;height:44px;border-radius:11px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;font-size:20px}'
  html += '.logo-circle img{width:100%;height:100%;object-fit:cover}'
  html += '.event-info{flex:1;min-width:0}'
  html += '.event-name{font-size:10px;font-weight:600;opacity:.85;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px}'
  html += '.event-tag{font-size:18px;font-weight:800;letter-spacing:-.01em}'
  // Body compact
  html += '.body{padding:22px 28px}'
  html += '.artist-block{text-align:center;margin-bottom:18px}'
  html += '.artist-name{font-size:30px;font-weight:800;color:#1a1a1a;line-height:1.1;margin:0 0 4px;letter-spacing:-.02em}'
  html += '.artist-subtitle{font-size:13px;color:#666;font-style:italic}'
  // Pills
  html += '.pills{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:14px}'
  html += '.pill{display:inline-flex;align-items:center;gap:5px;background:' + brandLight + ';color:' + brandDark + ';padding:5px 12px;border-radius:24px;font-size:11px;font-weight:600;border:1px solid ' + brandMid + '}'
  html += '.pill-icon{font-size:12px}'
  // Section QR + URL côte à côte pour gagner de la place
  html += '.qr-row{display:flex;gap:14px;align-items:stretch;margin:18px 0 12px}'
  html += '.qr-section{flex:0 0 auto;background:linear-gradient(135deg,#fafafa 0%,#f0f0f3 100%);border-radius:14px;padding:14px;text-align:center;border:1px solid #eaeaef;display:flex;flex-direction:column;align-items:center;justify-content:center}'
  html += '.qr-card{background:#fff;padding:10px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.06);line-height:0}'
  html += '.qr-card img{display:block;width:180px;height:180px}'
  html += '.qr-code{font-family:"SF Mono",Menlo,Consolas,monospace;font-size:11px;color:' + brand + ';font-weight:700;letter-spacing:.05em;background:#fff;padding:4px 10px;border-radius:6px;display:inline-block;border:1px dashed ' + brandMid + ';margin-top:10px}'
  html += '.qr-side{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:10px}'
  html += '.qr-label{font-size:9px;font-weight:700;color:' + brand + ';text-transform:uppercase;letter-spacing:.12em}'
  html += '.qr-hint{font-size:12px;color:#555;line-height:1.45}'
  html += '.qr-hint strong{color:' + brand + '}'
  html += '.url-block{background:#fafafa;border:1px solid #eaeaef;border-left:3px solid ' + brand + ';border-radius:8px;padding:8px 12px;font-family:"SF Mono",Menlo,Consolas,monospace;font-size:9px;color:#444;word-break:break-all;line-height:1.5}'
  html += '.url-label{font-size:9px;font-weight:700;color:' + brand + ';text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px;font-family:-apple-system,sans-serif}'
  // Liens
  html += '.section-title{font-size:10px;font-weight:700;color:' + brand + ';text-transform:uppercase;letter-spacing:.12em;margin:16px 0 8px;display:flex;align-items:center;gap:8px}'
  html += '.section-title::after{content:"";flex:1;height:1px;background:linear-gradient(to right,' + brandMid + ',transparent)}'
  html += '.liens{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:7px}'
  html += '.lien{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fafafa;border:1px solid #eaeaef;border-radius:10px;text-decoration:none;color:#333;font-size:11px;font-weight:600}'
  html += '.lien-icon{font-size:14px;flex-shrink:0}'
  html += '.lien-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
  // Foot
  html += '.foot{background:#fafafa;border-top:1px solid #eaeaef;padding:10px 28px;text-align:center;font-size:9px;color:#888;line-height:1.5}'
  html += '.foot strong{color:' + brand + '}'
  // Impression : 1 SEULE PAGE GARANTIE
  html += '@page{size:A4 portrait;margin:8mm}'
  html += '@media print {'
  html += '  html,body{background:#fff!important}'
  html += '  body{padding:0}'
  html += '  .sheet{box-shadow:none;border-radius:0;max-width:100%}'
  // Bloque toute coupure de page
  html += '  *{page-break-inside:avoid!important;break-inside:avoid!important}'
  html += '}'
  html += '</style></head><body>'

  html += '<div class="sheet" id="sheet">'

  // Header
  html += '<div class="header"><div class="header-content">'
  html += '<div class="logo-circle">'
  if (logoSrc) html += '<img src="' + safe(logoSrc) + '" alt=""/>'
  else html += '🎭'
  html += '</div>'
  html += '<div class="event-info">'
  html += '<div class="event-name">Fiche artiste · Espace personnel</div>'
  html += '<div class="event-tag">' + safe(eventNom || 'Festival') + '</div>'
  html += '</div>'
  html += '</div></div>'

  // Body
  html += '<div class="body">'

  // Artiste
  html += '<div class="artist-block">'
  html += '<h1 class="artist-name">' + safe(artiste) + '</h1>'
  if (titre) html += '<div class="artist-subtitle">' + safe(titre) + '</div>'
  html += '<div class="pills">'
  if (form.debut) html += '<div class="pill"><span class="pill-icon">📅</span>' + safe(fmtDt(form.debut)) + '</div>'
  if (form.debut || form.fin) html += '<div class="pill"><span class="pill-icon">🕐</span>' + safe(fmtHr(form.debut)) + (form.fin ? ' → ' + safe(fmtHr(form.fin)) : '') + '</div>'
  if (type)  html += '<div class="pill"><span class="pill-icon">' + (typeLabels[type] || '').slice(0, 2) + '</span>' + safe((typeLabels[type] || type).slice(2).trim()) + '</div>'
  if (scene) html += '<div class="pill"><span class="pill-icon">📍</span>' + safe(scene) + '</div>'
  html += '</div>'
  html += '</div>'

  // QR + URL côte à côte
  html += '<div class="qr-row">'
  html += '<div class="qr-section">'
  html += '<div class="qr-card"><img src="' + qrUrl + '" alt="QR Code"/></div>'
  html += '<div><span class="qr-code">ART-' + creneauId.slice(-6).toUpperCase() + '</span></div>'
  html += '</div>'
  html += '<div class="qr-side">'
  html += '<div>'
  html += '<div class="qr-label">Espace personnel artiste</div>'
  html += '<div class="qr-hint" style="margin-top:6px">Scannez le QR ou ouvrez le lien pour accéder à votre <strong>créneau</strong>, vos <strong>droits aux avantages</strong> (boissons / repas / eau) et présenter le QR au stand.</div>'
  html += '</div>'
  html += '<div class="url-block">'
  html += '<div class="url-label">🔗 Lien direct</div>'
  html += safe(url)
  html += '</div>'
  html += '</div>'
  html += '</div>'

  // Liens artiste
  if (liensFiltres.length > 0) {
    html += '<div class="section-title">🌍 Retrouvez l\'artiste</div>'
    html += '<div class="liens">'
    liensFiltres.forEach(([k, v]) => {
      html += '<a class="lien" href="' + safe(v) + '" target="_blank">'
      html += '<span class="lien-icon">' + (icons[k] || '🔗') + '</span>'
      html += '<span class="lien-label">' + (labels[k] || k) + '</span>'
      html += '</a>'
    })
    html += '</div>'
  }

  html += '</div>' // body

  // Foot
  html += '<div class="foot">'
  html += 'YllaCash ' + APP_VERSION_LABEL + ' — Édité le ' + new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })
  html += ' à ' + new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
  html += ' — Développée par <strong>Maison Ylla</strong>'
  html += '</div>'

  html += '</div>' // sheet

  // Script qui mesure la hauteur et applique un scale si nécessaire pour tenir sur 1 page A4
  html += '<script>'
  html += 'window.addEventListener("load", function() {'
  html += '  setTimeout(function() {'
  // A4 portrait = 210mm × 297mm. À 96dpi : ~794px × ~1123px. Marge 8mm = ~30px de chaque côté.
  // Surface utile : ~734px × ~1063px (hauteur exploitable)
  html += '    var sheet = document.getElementById("sheet");'
  html += '    var maxH = 1063;' // px disponibles en hauteur sur A4 avec marge 8mm
  html += '    var h = sheet.offsetHeight;'
  html += '    if (h > maxH) {'
  html += '      var scale = (maxH / h) * 0.98;' // 2% de marge de sécurité
  html += '      sheet.style.transform = "scale(" + scale + ")";'
  html += '      sheet.style.transformOrigin = "top center";'
  html += '    }'
  html += '    window.print();'
  html += '  }, 800);'
  html += '});'
  html += '</script>'

  html += '</body></html>'

  const w = window.open('', '_blank')
  if (!w) {
    alert('Veuillez autoriser les pop-ups pour imprimer la fiche.')
    return
  }
  w.document.write(html)
  w.document.close()
  // L'impression est déclenchée par le script interne après mesure
}


export default function Planning({ onNavigate }) {
  const { planning } = useAppStore()
  const { currentEventId } = useEventStore()
  const { user } = useAuthStore()
  const { isMobile } = useBreakpoint()
  const canManageAvantages = user?.role === 'admin' || user?.role === 'super_admin'

  const [form, setForm]         = useState(EMPTY_FORM)
  const [editing, setEditing]   = useState(null)   // id du créneau en édition
  const [showForm, setShowForm] = useState(false)
  const [notifier, setNotifier] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [err, setErr]           = useState('')
  const [success, setSuccess]   = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [filterType, setFilterType] = useState('tous')
  const [detailOpen, setDetailOpen] = useState(null) // id créneau ouvert
  const [viewMode, setViewMode]     = useState('liste') // 'liste' | 'timeline'
  const [dragging, setDragging]     = useState(null)    // id créneau draggé
  const [search, setSearch]         = useState('')
  const [sortBy, setSortBy]         = useState('debut') // 'debut' | 'artiste' | 'scene' | 'type'
  const [menuItems, setMenuItems]   = useState([])
  const [artistConsumptions, setArtistConsumptions] = useState([])
  const [cachets, setCachets]       = useState([])
  const [showConsoModal, setShowConsoModal] = useState(false)
  const fileRef = useRef()

  // Charger les articles du menu pour le sélecteur d'avantages
  useEffect(() => {
    if (!currentEventId) return
    const col = collection(db, 'events', currentEventId, 'menu')
    const unsub = onSnapshot(col,
      snap => setMenuItems(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      err  => console.warn('Menu items listener:', err)
    )
    return unsub
  }, [currentEventId])

  // Charger les consommations artistes
  useEffect(() => {
    if (!currentEventId) return
    const unsub = watchArtistConsumptions(setArtistConsumptions, currentEventId)
    return unsub
  }, [currentEventId])

  // Charger les cachets pour afficher le statut sur chaque créneau
  useEffect(() => {
    if (!currentEventId) return
    const unsub = watchCachets(setCachets, currentEventId)
    return unsub
  }, [currentEventId])

  // Map creneauId → statut cachet ('paye' | 'planifie' | 'aucun' | 'annule')
  const cachetStatusByCreneau = useMemo(() => {
    const map = {}
    cachets.forEach(c => {
      if (!c.creneauId) return
      const existing = map[c.creneauId]
      // Priorité d'affichage : payé > planifié > annulé
      if (!existing || (c.statut === 'paye' && existing !== 'paye')) {
        map[c.creneauId] = c.statut
      }
    })
    return map
  }, [cachets])

  const scenes   = [...new Set(planning.map(p => p.scene).filter(Boolean))]

  let filtered = filterType === 'tous'
    ? [...planning]
    : planning.filter(p => p.type === filterType)
  // Recherche textuelle (artiste, titre, scène)
  if (search.trim()) {
    const q = search.toLowerCase().trim()
    filtered = filtered.filter(p =>
      (p.artiste || '').toLowerCase().includes(q) ||
      (p.titre   || '').toLowerCase().includes(q) ||
      (p.scene   || '').toLowerCase().includes(q)
    )
  }
  // Tri
  filtered.sort((a, b) => {
    if (sortBy === 'artiste') return (a.artiste || '').localeCompare(b.artiste || '')
    if (sortBy === 'scene')   return (a.scene || '').localeCompare(b.scene || '')
    if (sortBy === 'type')    return (a.type || '').localeCompare(b.type || '')
    // Par défaut : debut
    const ad = a.debut?.toDate ? a.debut.toDate().getTime() : new Date(a.debut || 0).getTime()
    const bd = b.debut?.toDate ? b.debut.toDate().getTime() : new Date(b.debut || 0).getTime()
    return ad - bd
  })

  const conflicts = detectChevauchements(filtered)

  // Calculer le statut automatique selon l'heure
  const autoStatut = (c) => {
    if (c.statut === 'annule') return 'annule'
    const now = Date.now()
    const d = c.debut?.toDate ? c.debut.toDate().getTime() : c.debut ? new Date(c.debut).getTime() : 0
    const f = c.fin?.toDate   ? c.fin.toDate().getTime()   : c.fin   ? new Date(c.fin).getTime()   : 0
    if (now < d) return 'a-venir'
    if (now >= d && now <= f) return 'en-cours'
    return 'termine'
  }

  const openCreate = () => {
    setEditing(null)
    // Pré-remplir lat/lng depuis le premier créneau qui en a
    const ref = planning.find(p => p.latitude && p.longitude)
    setForm({ ...EMPTY_FORM, latitude: ref?.latitude || '', longitude: ref?.longitude || '' })
    setPhotoFile(null)
    setPhotoPreview('')
    setNotifier(false)
    setShowForm(true)
  }

  const openDuplicate = (cr) => {
    // Demander si on duplique le même artiste (set 2, par ex.) ou si c'est un nouveau créneau vierge
    // OK = même artiste (garde infos), Annuler = nouveau (vide tout sauf horaires/type/scène)
    const sameArtist = window.confirm(
      "Dupliquer le même artiste sur un nouveau créneau ?\n\n" +
      "OK : garde l'artiste, le titre, la bio, la description, les liens (utile pour un 2e set).\n" +
      "Annuler : créneau vierge (garde uniquement le type, la scène et les horaires).\n\n" +
      "Dans tous les cas, la photo et la localisation ne sont pas recopiées."
    )
    setEditing(null) // pas d'édition, c'est une création
    setNotifier(false)
    setForm({
      // Toujours conservés : type, scène, horaires
      type:     cr.type    || 'musical',
      scene:    cr.scene   || '',
      debut:    toLocalDatetimeString(cr.debut),
      fin:      toLocalDatetimeString(cr.fin),
      statut:   'a-venir',
      // Infos artiste : selon le choix
      artiste:     sameArtist ? (cr.artiste || '') : '',
      titre:       sameArtist ? (cr.titre   || '') : '',
      bio:         sameArtist ? (cr.bio || '') : '',
      description: sameArtist ? (cr.description || '') : '',
      liens:       sameArtist ? { ...(cr.liens || {}) } : {},
      // Toujours vidés : photo, position, lat/lng, avantages
      // (l'admin re-uploadera une photo si besoin, et ré-attribuera les avantages)
      photo:         '',
      photoPosition: 'center center',
      latitude:      '',
      longitude:     '',
      avantages: {
        drinks:   0, meals: 0, eaux: 0,
        drinkIds: [], mealIds: [], eauIds: [],
      },
    })
    setErr('')
    setShowForm(true)
  }

  const openEdit = (cr) => {
    setEditing(cr.id)
    setForm({
      artiste:     cr.artiste || '',
      titre:       cr.titre   || '',
      type:        cr.type    || 'musical',
      scene:       cr.scene   || '',
      debut:       cr.debut ? toLocalDatetimeString(cr.debut) : '',
      fin:         cr.fin   ? toLocalDatetimeString(cr.fin)   : '',
      // Balance optionnelle
      balanceDebut: cr.balanceDebut ? toLocalDatetimeString(cr.balanceDebut) : '',
      balanceFin:   cr.balanceFin   ? toLocalDatetimeString(cr.balanceFin)   : '',
      balanceScene: cr.balanceScene || '',
      description: cr.description || '',
      bio:         cr.bio    || '',
      photo:       cr.photo  || '',
      photoPosition: cr.photoPosition || 'center center',
      latitude:      cr.latitude  || '',
      longitude:     cr.longitude || '',
      liens:       cr.liens  || { spotify:'', instagram:'', facebook:'', tiktok:'', youtube:'', site:'' },
      statut:      cr.statut || 'a-venir',
      avantages: {
        drinks:   cr.avantages?.drinks   || 0,
        meals:    cr.avantages?.meals    || 0,
        eaux:     cr.avantages?.eaux     || 0,
        drinkIds: cr.avantages?.drinkIds || [],
        mealIds:  cr.avantages?.mealIds  || [],
        eauIds:   cr.avantages?.eauIds   || [],
      },
    })
    setPhotoFile(null)
    setPhotoPreview(cr.photo || '')
    setNotifier(false)
    setShowForm(true)
  }

  const uploadPhoto = async () => {
    if (!photoFile) return form.photo
    // Compresse en JPEG max 800px et < 800 ko (évite l'erreur Firestore > 1 MB).
    // L'image source peut faire n'importe quelle taille — la fonction se débrouille.
    try {
      return await compressImage(photoFile, 800, 0.80)
    } catch (e) {
      console.warn('Compression image impossible, conserve l\'ancienne :', e)
      return form.photo
    }
  }

  const handleSubmit = async () => {
    if (!form.artiste.trim()) { setErr('Le nom de l\'artiste est requis'); return }
    if (!form.debut)           { setErr('L\'heure de début est requise');  return }
    if (!form.fin)             { setErr('L\'heure de fin est requise');    return }
    const dDebut = new Date(form.debut).getTime()
    const dFin   = new Date(form.fin).getTime()
    if (isNaN(dDebut) || isNaN(dFin)) { setErr('Dates invalides'); return }
    if (dFin <= dDebut) { setErr('L\'heure de fin doit être après l\'heure de début'); return }
    setLoading(true); setErr('')
    try {
      const photoUrl = await uploadPhoto()
      // Convertit lat/lng en number propre (Firestore + calculs futurs)
      const latParsed = form.latitude !== '' && form.latitude != null ? parseFloat(String(form.latitude).replace(',', '.')) : NaN
      const lngParsed = form.longitude !== '' && form.longitude != null ? parseFloat(String(form.longitude).replace(',', '.')) : NaN
      const payload = {
        ...form,
        photo:  photoUrl,
        debut:  new Date(form.debut),
        fin:    new Date(form.fin),
        // Balance : convertit en Date si renseignée, sinon null pour effacer
        balanceDebut: form.balanceDebut ? new Date(form.balanceDebut) : null,
        balanceFin:   form.balanceFin   ? new Date(form.balanceFin)   : null,
        balanceScene: form.balanceScene || '',
        liens:  form.liens,
        // Stocke en number ; sinon chaîne vide (pas de coordonnées)
        latitude:  !isNaN(latParsed) ? latParsed : '',
        longitude: !isNaN(lngParsed) ? lngParsed : '',
        avantages: {
          drinks:   parseInt(form.avantages?.drinks)   || 0,
          meals:    parseInt(form.avantages?.meals)    || 0,
          eaux:     parseInt(form.avantages?.eaux)     || 0,
          drinkIds: form.avantages?.drinkIds || [],
          mealIds:  form.avantages?.mealIds  || [],
          eauIds:   form.avantages?.eauIds   || [],
        },
      }
      if (editing) {
        await updateCreneau(editing, payload, notifier)
      } else {
        await addCreneau(payload)
      }
      setSuccess(editing ? 'Créneau mis à jour !' : 'Créneau ajouté !')
      setTimeout(() => setSuccess(''), 3000)
      setShowForm(false)
    } catch(e) { console.error('Planning submit:', e); setErr(e?.message || 'Erreur inconnue — vérifiez la console') }
    finally { setLoading(false) }
  }

  const handleDelete = async (id, artiste) => {
    if (!window.confirm(`Supprimer le créneau de "${artiste}" ?`)) return
    await deleteCreneau(id)
  }

  const printPlanning = () => {
    // Grouper par jour
    const toDate = (ts) => ts?.toDate ? ts.toDate() : new Date(ts)
    const byDay = {}
    filtered.forEach(cr => {
      const d = toDate(cr.debut)
      if (!d || isNaN(d.getTime())) return
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')
      if (!byDay[key]) byDay[key] = []
      byDay[key].push(cr)
    })
    const dayLabel = (key) => {
      const [y, m, dd] = key.split('-')
      const date = new Date(parseInt(y), parseInt(m)-1, parseInt(dd))
      return date.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    }
    const fmtHour = (d) => toDate(d).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })

    const typeLabel = { musical: 'Musical', litteraire: 'Littéraire', cinematographique: 'Cinéma', autre: 'Autre' }

    let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Planning Festival</title>'
    html += '<style>'
    html += 'body{font-family:system-ui,sans-serif;color:#222;padding:20px;max-width:900px;margin:0 auto}'
    html += 'h1{color:#1a6b7a;font-size:22px;margin:0 0 6px}'
    html += '.sub{color:#666;font-size:12px;margin-bottom:20px}'
    html += 'h2{color:#1a6b7a;font-size:16px;margin:24px 0 8px;text-transform:capitalize;border-bottom:2px solid #1a6b7a;padding-bottom:4px}'
    html += 'table{width:100%;border-collapse:collapse;margin-bottom:14px}'
    html += 'th,td{padding:8px 10px;text-align:left;font-size:13px;border-bottom:0.5px solid #ddd}'
    html += 'th{background:#f5f5f5;font-weight:700;font-size:11px;text-transform:uppercase;color:#666}'
    html += '.annule{text-decoration:line-through;color:#999}'
    html += '.foot{margin-top:30px;padding-top:14px;border-top:1px solid #ddd;text-align:center;font-size:10px;color:#888}'
    html += '@media print { body { padding: 10mm; } h2 { page-break-after: avoid; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }'
    html += '</style></head><body>'
    html += '<h1>📅 Planning Festival</h1>'
    html += '<div class="sub">Édité le ' + new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' }) + ' à ' + new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }) + ' · ' + filtered.length + ' créneau' + (filtered.length > 1 ? 'x' : '') + '</div>'

    const dayKeys = Object.keys(byDay).sort()
    dayKeys.forEach(key => {
      const crs = byDay[key].sort((a,b) => toDate(a.debut).getTime() - toDate(b.debut).getTime())
      html += '<h2>📅 ' + dayLabel(key) + '</h2>'
      html += '<table>'
      html += '<thead><tr><th>Heure</th><th>Artiste</th><th>Type</th><th>Scène</th><th>Statut</th></tr></thead><tbody>'
      crs.forEach(cr => {
        const cls = cr.statut === 'annule' ? 'annule' : ''
        html += '<tr class="' + cls + '">'
        html += '<td><strong>' + fmtHour(cr.debut) + ' → ' + fmtHour(cr.fin) + '</strong></td>'
        html += '<td>' + (cr.artiste || '') + (cr.titre ? ' <em>(' + cr.titre + ')</em>' : '') + '</td>'
        html += '<td>' + (typeLabel[cr.type] || cr.type || '—') + '</td>'
        html += '<td>' + (cr.scene || '—') + '</td>'
        html += '<td>' + (cr.statut === 'annule' ? '❌ Annulé' : cr.statut === 'en-cours' ? '▶ En cours' : '—') + '</td>'
        html += '</tr>'
      })
      html += '</tbody></table>'
    })

    html += '<div class="foot">' + APP_FULL_LABEL + ' — Développée par <strong>Maison Ylla</strong></div>'
    html += '</body></html>'

    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 300)
  }

  const handleStatut = async (id, statut) => {
    await updateCreneau(id, { statut }, statut === 'annule')
  }

  const typeInfo = (t) => TYPES.find(x => x.value === t) || TYPES[3]
  const statutInfo = (s) => STATUTS.find(x => x.value === s) || STATUTS[0]

  if (!currentEventId) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
      Sélectionnez un événement pour gérer le planning.
    </div>
  )

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>

      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Planning Festival</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
            {planning.length} créneau{planning.length !== 1 ? 'x' : ''} · <a href={"/live?ev=" + (currentEventId || "")} target="_blank" style={{ color: 'var(--brand)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}><ExternalLink size={11}/> Vue live</a>
          </div>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <div style={{ display:'flex', background:'var(--bg2)', borderRadius:8, border:'0.5px solid var(--border)', overflow:'hidden' }}>
            {[['liste','☰', 'Liste'],['timeline','⏱', 'Timeline']].map(([mode, icon, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)}
                title={label}
                style={{ padding: isMobile ? '6px 10px' : '6px 12px', border:'none', background: viewMode===mode ? 'var(--brand)' : 'transparent', color: viewMode===mode ? '#fff' : 'var(--muted)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
                {icon}{!isMobile && ' ' + label}
              </button>
            ))}
          </div>
          {canManageAvantages && (
            <button onClick={() => setShowConsoModal(true)}
              title="Consommations artistes"
              style={{ padding: '6px 10px', background: 'var(--bg2)', color: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              📊
            </button>
          )}
          <button onClick={printPlanning}
            title="Imprimer / Exporter PDF"
            style={{ padding: '6px 10px', background: 'var(--bg2)', color: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            🖨️
          </button>
          <button onClick={openCreate}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: isMobile ? '8px 12px' : '8px 16px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>
          <Plus size={15}/>{isMobile ? 'Ajouter' : 'Ajouter un créneau'}
        </button>
      </div>

      {/* Feedback */}
      {conflicts.size > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'#FAEEDA', borderRadius:10, fontSize:13, color:'#854F0B', marginBottom:12, border:'1px solid #FAC77544' }}>
          ⚠️ <strong>{conflicts.size / 2}</strong> chevauchement{conflicts.size > 2 ? 's' : ''} détecté{conflicts.size > 2 ? 's' : ''} sur une même scène. Vérifiez les créneaux en surbrillance.
        </div>
      )}
      {success && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#d1fae5', borderRadius: 10, fontSize: 13, color: '#065f46', marginBottom: 12 }}>
          <CheckCircle size={15}/> {success}
        </div>
      )}

      {/* Bandeau filtres unifié */}
      <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 12, padding: isMobile ? '10px 12px' : '12px 14px', marginBottom: 14, display: 'flex', gap: isMobile ? 8 : 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Recherche */}
        <div style={{ flex: '1 1 220px', minWidth: 0, position: 'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Rechercher par artiste, titre ou scène..."
            style={{ width:'100%', minWidth:0, boxSizing:'border-box', minHeight: 36, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--bg2)', fontFamily: 'var(--font)', outline: 'none' }}/>
          {search && (
            <button onClick={() => setSearch('')} title="Effacer"
              style={{ position:'absolute', right: 6, top: '50%', transform:'translateY(-50%)', width:24, height:24, border:'none', background:'transparent', cursor:'pointer', color:'var(--muted)', fontSize: 16, padding:0 }}>×</button>
          )}
        </div>
        {/* Tri */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          title="Trier par"
          style={{ minHeight: 36, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)', background: 'var(--bg2)', fontFamily: 'var(--font)', cursor: 'pointer', outline: 'none' }}>
          <option value="debut">⏱ Heure</option>
          <option value="artiste">🎤 Artiste</option>
          <option value="scene">📍 Scène</option>
          <option value="type">🎭 Type</option>
        </select>
        {/* Séparateur */}
        {!isMobile && <div style={{ width:1, height:24, background:'var(--border)', flexShrink:0 }}/>}
        {/* Filtres par type */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {[{ value: 'tous', label: 'Tous', icon: '🎭' }, ...TYPES].map(t => (
            <button key={t.value} onClick={() => setFilterType(t.value)}
              style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid var(--border)', background: filterType === t.value ? 'var(--brand)' : 'var(--bg2)', color: filterType === t.value ? '#fff' : 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Timeline ── */}
      {viewMode === 'timeline' && <TimelineView planning={filtered} conflicts={conflicts} onEdit={openEdit} onDelete={handleDelete} onStatut={handleStatut} onUpdateDebut={async (id, newDebut, newFin) => { await updateCreneau(id, { debut: newDebut, fin: newFin }, true) }} />}

      {viewMode === 'liste' && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: 'var(--bg)', borderRadius: 14, border: '0.5px solid var(--border)', color: 'var(--muted)', fontSize: 14 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
          Aucun créneau pour le moment.<br/>
          {canManageAvantages && (
            <button onClick={() => setShowConsoModal(true)}
              title="Consommations artistes"
              style={{ padding: '6px 10px', background: 'var(--bg2)', color: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              📊
            </button>
          )}
          <button onClick={printPlanning}
            title="Imprimer / Exporter PDF"
            style={{ padding: '6px 10px', background: 'var(--bg2)', color: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            🖨️
          </button>
          <button onClick={openCreate} style={{ marginTop: 14, padding: '8px 20px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            Ajouter le premier créneau
          </button>
        </div>
      )}

      {viewMode === 'liste' && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(cr => {
            const ti   = typeInfo(cr.type)
            const st   = autoStatut(cr)
            const stI  = statutInfo(cr.statut === 'annule' ? 'annule' : st)
            const open = detailOpen === cr.id
            return (
              <div key={cr.id} style={{ background: 'var(--bg)', border: `1px solid ${conflicts.has(cr.id)?'#EF9F27':cr.statut==='annule'?'#F09595':st==='en-cours'?'#5DCAA5':'var(--border)'}`, borderRadius: 14, overflow: 'hidden', transition: 'border-color .2s' }}>
                {/* Ligne principale */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: isMobile ? '10px 12px' : '12px 14px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                  <div style={{ width: isMobile ? 44 : 48, height: isMobile ? 44 : 48, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: ti.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 20 : 22, cursor: cr.photo ? 'pointer' : 'default' }}
                    onClick={() => cr.photo && setDetailOpen(open ? null : cr.id)}>
                    {cr.photo ? <img src={cr.photo} alt={cr.artiste} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: cr.photoPosition || 'center center' }}/> : ti.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', cursor: 'pointer' }}
                        onClick={() => setDetailOpen(open ? null : cr.id)}>
                        {cr.artiste}
                      </span>
                      {cr.titre && <span style={{ fontSize: 12, color: 'var(--muted)' }}>— {cr.titre}</span>}
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: stI.bg, color: stI.color }}>{stI.label}</span>
                      {conflicts.has(cr.id) && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#FAEEDA', color: '#854F0B' }}>⚠️ Chevauchement</span>}
                      {/* Pastille statut cachet */}
                      {(() => {
                        const st = cachetStatusByCreneau[cr.id]
                        if (st === 'paye') return <span title="Cachet payé" style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--green-light)', color: 'var(--green)' }}>💰 Payé</span>
                        if (st === 'planifie') return <span title="Cachet à payer" style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--gold-light)', color: 'var(--gold)' }}>💰 À payer</span>
                        if (st === 'annule') return null // pas d'affichage
                        return <span title="Aucun cachet enregistré pour cet artiste" style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#f5f5f5', color: 'var(--muted)' }}>💰 Aucun</span>
                      })()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11}/> {fmt2(cr.debut)} → {fmt2(cr.fin)} {duree(cr.debut,cr.fin) && '('+duree(cr.debut,cr.fin)+')'}</span>
                      {cr.scene && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11}/> {cr.scene}</span>}
                      <span style={{ color: ti.color, fontWeight: 600 }}>{ti.icon} {ti.label}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 6, flexShrink: 0, marginLeft: isMobile ? 'auto' : 0, flexBasis: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'flex-end' : 'flex-start', paddingTop: isMobile ? 8 : 0, borderTop: isMobile ? '0.5px dashed var(--border)' : 'none' }}>
                    {(() => { const sz = isMobile ? 44 : 30; const ic = isMobile ? 18 : 13; return (<>
                    <button onClick={() => setDetailOpen(open ? null : cr.id)}
                      title="Voir détails" style={{ width: sz, height: sz, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg2)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>
                      {open ? <ChevronUp size={ic}/> : <ChevronDown size={ic}/>}
                    </button>
                    <button onClick={() => openEdit(cr)}
                      title="Modifier" style={{ width: sz, height: sz, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg2)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>
                      <Pencil size={ic}/>
                    </button>
                    <button onClick={() => openDuplicate(cr)}
                      title="Dupliquer" style={{ width: sz, height: sz, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg2)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>
                      <Copy size={ic}/>
                    </button>
                    <button onClick={() => handleDelete(cr.id, cr.artiste)}
                      title="Supprimer" style={{ width: sz, height: sz, border: '1px solid #F09595', borderRadius: 8, background: '#FCEBEB', color: '#A32D2D', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>
                      <Trash2 size={ic}/>
                    </button>
                    </>) })()}
                  </div>
                </div>
                {open && (
                  <div style={{ borderTop: '0.5px solid var(--border)', padding: '12px 14px', background: 'var(--bg2)' }}>
                    {cr.bio && <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginBottom: 10 }}>{cr.bio}</p>}
                    {cr.description && <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 10 }}>{cr.description}</p>}
                    {cr.liens && Object.entries(cr.liens).some(([,v])=>v) && (
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                        {Object.entries(cr.liens).filter(([,v])=>v).map(([k,v])=>(
                          <a key={k} href={v} target="_blank" rel="noreferrer"
                            style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: 'var(--bg)', border: '0.5px solid var(--border)', color: 'var(--brand)', textDecoration: 'none', textTransform: 'capitalize' }}>
                            {k} ↗
                          </a>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>Statut :</span>
                      {STATUTS.map(s => (
                        <button key={s.value} onClick={() => handleStatut(cr.id, s.value)}
                          style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 8, border: '1px solid '+s.color+'44', background: cr.statut===s.value ? s.color : s.bg, color: cr.statut===s.value ? '#fff' : s.color, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                          {s.label}
                        </button>
                      ))}
                    </div>

                    {/* Avantages artiste + consos temps réel — réservé aux admins */}
                    {canManageAvantages && (
                      <CreneauAvantagesPanel creneau={cr} consumptions={artistConsumptions} menuItems={menuItems}/>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modale formulaire */}
      {showForm && (
        <div onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 'clamp(8px, 3vw, 20px)' }}>
          <div style={{ background: 'var(--bg)', borderRadius: 20, padding: 'clamp(14px, 4vw, 24px)', width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,.3)', marginTop: 20, marginBottom: 20, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>
                {editing ? 'Modifier le créneau' : 'Nouveau créneau'}
              </div>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}>
                <X size={18}/>
              </button>
            </div>

            {/* Photo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{ width: 72, height: 72, borderRadius: 12, overflow: 'hidden', background: 'var(--bg2)', border: '1.5px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                onClick={() => fileRef.current?.click()}>
                {photoPreview
                  ? <img src={photoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                  : <span style={{ fontSize: 28 }}>📷</span>}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Photo de l'artiste</div>
                <button onClick={() => fileRef.current?.click()}
                  style={{ fontSize: 12, padding: '5px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg2)', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                  Choisir une photo
                </button>
                {photoPreview && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Position de la photo</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
                      {[['top','Haut'],['center','Milieu'],['bottom','Bas']].map(([pos, label]) => (
                        <button key={pos} type="button" onClick={() => setForm(f => ({ ...f, photoPosition: 'center ' + pos }))}
                          style={{ padding: '4px 6px', borderRadius: 6, border: '1.5px solid ' + (form.photoPosition === 'center ' + pos ? 'var(--brand)' : 'var(--border)'), background: form.photoPosition === 'center ' + pos ? 'var(--brand-light)' : 'var(--bg)', color: form.photoPosition === 'center ' + pos ? 'var(--brand-dark)' : 'var(--muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files[0]
                    if (!f) return
                    setPhotoFile(f)
                    const r = new FileReader()
                    r.onload = ev => setPhotoPreview(ev.target.result)
                    r.readAsDataURL(f)
                  }}/>
              </div>
            </div>

            {/* Champs */}
            {[
              { key: 'artiste',     label: 'Nom artiste / intervenant *', placeholder: 'ex : Samba Babou' },
              { key: 'titre',       label: 'Titre du set / œuvre',        placeholder: 'ex : Live acoustique' },
              { key: 'scene',       label: 'Scène / lieu',                placeholder: 'ex : Scène principale', list: scenes },
            ].map(({ key, label, placeholder, list }) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</label>
                <input list={list ? `dl-${key}` : undefined}
                  value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ width: '100%', minWidth: 0, minHeight: 42, padding: '0 12px', border: '1.5px solid var(--border2)', borderRadius: 10, fontSize: 14, color: 'var(--text)', outline: 'none', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box' }}/>
                {list && <datalist id={`dl-${key}`}>{list.map(l => <option key={l} value={l}/>)}</datalist>}
              </div>
            ))}

            {/* Type */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>Type d'activité</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TYPES.map(t => (
                  <button key={t.value} type="button" onClick={() => setForm(f => ({ ...f, type: t.value }))}
                    style={{ padding: '6px 12px', borderRadius: 8, border: `1.5px solid ${form.type===t.value ? t.color : 'var(--border)'}`, background: form.type===t.value ? t.color+'22' : 'var(--bg)', color: form.type===t.value ? t.color : 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Horaires prestation — grille responsive (2 cols si dispo, sinon 1) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 10,
              marginBottom: 12,
            }}>
              {[['debut','Début *'],['fin','Fin *']].map(([key, label]) => (
                <div key={key} style={{ minWidth: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</label>
                  <input type="datetime-local" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ width: '100%', minWidth: 0, maxWidth: '100%', minHeight: 42, padding: '0 10px', border: '1.5px solid var(--border2)', borderRadius: 10, fontSize: 13, color: 'var(--text)', outline: 'none', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box' }}/>
                </div>
              ))}
            </div>

            {/* Balance (optionnelle) — l'artiste recevra des rappels 15min et 5min avant */}
            <div style={{ marginBottom: 12, padding: 12, background: 'var(--bg2)', border: '1px dashed var(--border2)', borderRadius: 10 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  🎤 Balance (optionnel)
                </label>
                {(form.balanceDebut || form.balanceFin || form.balanceScene) && (
                  <button type="button" onClick={() => setForm(f => ({ ...f, balanceDebut: '', balanceFin: '', balanceScene: '' }))}
                    style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'var(--font)' }}>
                    Effacer
                  </button>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.4 }}>
                Si renseignée, l'artiste reçoit un rappel par notification (son + popup) 15 min et 5 min avant la balance.
              </div>
              {/* Grille adaptative : 2 colonnes si l'écran tient au moins 200px par champ,
                  sinon 1 colonne empilée. Évite le débordement sur mobile étroit. */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 8,
                marginBottom: 8,
              }}>
                <div style={{ minWidth: 0 }}>
                  <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Début</label>
                  <input type="datetime-local" value={form.balanceDebut || ''}
                    onChange={e => setForm(f => ({ ...f, balanceDebut: e.target.value }))}
                    style={{ width: '100%', minWidth: 0, maxWidth: '100%', minHeight: 38, padding: '0 10px', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12, color: 'var(--text)', outline: 'none', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box' }}/>
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Fin</label>
                  <input type="datetime-local" value={form.balanceFin || ''}
                    onChange={e => setForm(f => ({ ...f, balanceFin: e.target.value }))}
                    style={{ width: '100%', minWidth: 0, maxWidth: '100%', minHeight: 38, padding: '0 10px', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12, color: 'var(--text)', outline: 'none', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box' }}/>
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Scène/Lieu de la balance (laisser vide pour reprendre la scène de prestation)</label>
                <input type="text" value={form.balanceScene || ''}
                  onChange={e => setForm(f => ({ ...f, balanceScene: e.target.value }))}
                  placeholder={form.scene || 'Ex: Studio, Régie, Scène principale...'}
                  style={{ width: '100%', minWidth: 0, maxWidth: '100%', minHeight: 38, padding: '0 10px', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12, color: 'var(--text)', outline: 'none', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box' }}/>
              </div>
            </div>

            {/* Raccourci vers Cachets — visible uniquement en édition */}
            {editing && (
              <div style={{
                marginBottom: 12, padding: 10,
                background: 'var(--gold-light)',
                border: '1px dashed var(--gold)',
                borderRadius: 10,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  flexShrink: 0, width: 32, height: 32, borderRadius: 8,
                  background: 'var(--gold)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                }}>💰</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--marine)' }}>
                    Cachet de cet artiste
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                    Ouvrir la page Cachets pour gérer la rémunération
                  </div>
                </div>
                <button type="button" onClick={() => {
                  setShowForm(false)
                  setEditing(null)
                  if (typeof onNavigate === 'function') onNavigate('cachets')
                }}
                  style={{
                    padding: '8px 12px', background: 'var(--gold)', color: '#fff',
                    border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}>
                  Gérer →
                </button>
              </div>
            )}

            {/* Bio */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>Biographie</label>
              <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                placeholder="Présentation de l'artiste..."
                rows={3}
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border2)', borderRadius: 10, fontSize: 13, color: 'var(--text)', outline: 'none', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box', resize: 'vertical' }}/>
            </div>

            {/* Localisation GPS */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>Localisation GPS (optionnel)</label>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Renseigner pour afficher la carte du festival dans la fiche artiste. Format décimal (la virgule est convertie en point automatiquement).</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {['latitude', 'longitude'].map(k => (
                  <div key={k}>
                    <input
                      value={form[k]}
                      inputMode="decimal"
                      onChange={e => {
                        // Accepte virgule française, espaces accidentels — stocke en string propre.
                        // La conversion finale en number se fait à l'enregistrement.
                        const v = e.target.value.replace(',', '.').replace(/\s/g, '')
                        setForm(f => ({ ...f, [k]: v }))
                      }}
                      placeholder={k === 'latitude' ? 'ex: 48.5734' : 'ex: 7.7521'}
                      style={{ width: '100%', minWidth: 0, minHeight: 38, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)', outline: 'none', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box' }}/>
                  </div>
                ))}
              </div>
            </div>

            {/* Liens */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>Liens</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                {['spotify','instagram','facebook','tiktok','youtube','site'].map(k => (
                  <input key={k} value={form.liens[k]} onChange={e => setForm(f => ({ ...f, liens: { ...f.liens, [k]: e.target.value } }))}
                    placeholder={k.charAt(0).toUpperCase() + k.slice(1)}
                    style={{ width:'100%', minWidth:0, minHeight: 38, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)', outline: 'none', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box' }}/>
                ))}
              </div>
            </div>

            {/* Avantages artiste — réservé aux admins */}
            {canManageAvantages && (
              <AvantagesArtisteBlock form={form} setForm={setForm} menuItems={menuItems}/>
            )}

            {/* Lien espace artiste — réservé aux admins/super_admins (pas au directeur artistique) */}
            {editing && canManageAvantages && (
              <div style={{ marginBottom: 16, padding:'10px 14px', background:'var(--bg2)', borderRadius:10, border:'0.5px solid var(--border)' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:6, textTransform:'uppercase' }}>🔗 Lien espace artiste</div>
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                  <input readOnly value={window.location.origin + '/artiste?ev=' + currentEventId + '&cr=' + editing}
                    onClick={e => e.target.select()}
                    style={{ flex:'1 1 200px', minWidth:0, boxSizing:'border-box', minHeight: 32, padding: '0 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'monospace', outline: 'none' }}/>
                  <button type="button" onClick={() => {
                    const url = window.location.origin + '/artiste?ev=' + currentEventId + '&cr=' + editing
                    navigator.clipboard?.writeText(url).then(() => setSuccess('Lien copié !'))
                    setTimeout(() => setSuccess(''), 2000)
                  }}
                    style={{ padding: '6px 10px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    📋 Copier
                  </button>
                  <button type="button" onClick={() => printArtisteSheet(form, editing, currentEventId)}
                    style={{ padding: '6px 10px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    🖨️ Imprimer la fiche
                  </button>
                </div>
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:6 }}>
                  Envoyez ce lien à l'artiste ou imprimez sa fiche (QR + liens) à remettre en main propre.
                </div>
              </div>
            )}

            {/* Notifier */}
            {editing && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--amber-light)', borderRadius: 10, cursor: 'pointer', marginBottom: 14 }}>
                <input type="checkbox" checked={notifier} onChange={e => setNotifier(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--brand)' }}/>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber-dark)' }}>Notifier les spectateurs</div>
                  <div style={{ fontSize: 11, color: 'var(--amber)' }}>Envoie une notification de changement de programme</div>
                </div>
              </label>
            )}

            {err && <div style={{ marginBottom: 12, padding: '10px 14px', background: '#FCEBEB', borderRadius: 10, fontSize: 13, color: '#A32D2D', display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={14}/>{err}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowForm(false)}
                style={{ flex: 1, minHeight: 44, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg2)', color: 'var(--muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                Annuler
              </button>
              <button onClick={handleSubmit} disabled={loading}
                style={{ flex: 2, minHeight: 44, border: 'none', borderRadius: 10, background: 'var(--brand)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? .7 : 1 }}>
                <Save size={15}/> {loading ? 'Enregistrement…' : editing ? 'Mettre à jour' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale suivi consommations artistes */}
      {canManageAvantages && showConsoModal && (
        <ConsommationsModal
          consumptions={artistConsumptions}
          planning={planning}
          onClose={() => setShowConsoModal(false)}/>
      )}
    </div>
    </div>
  )
}
