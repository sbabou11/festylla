/**
 * components/VolunteerPlanning.jsx
 *
 * Outil de gestion du planning bénévoles (Niveau 3 — auto-inscription en Phase B).
 *
 * Architecture :
 *   - posts (postes/stands) : Bar, Caisse, Accueil… avec emoji + couleur
 *   - shifts (créneaux)    : date + plage horaire + affectations { postId → [benevoleIds] }
 *   - Migration douce : les créneaux historiques (Vendredi/Samedi/Dimanche × Midi/Soir)
 *     sont créés automatiquement au premier usage si dates de l'événement disponibles.
 *
 * Vues :
 *   - Grille : tableau croisé posts × shifts avec code couleur effectif
 *   - Liste  : par bénévole, ses affectations
 *   - Postes : CRUD postes (nom, emoji, couleur, effectif cible)
 *   - Shifts : CRUD créneaux (date, horaires)
 */

import React, { useState, useEffect, useMemo } from 'react'
import useAppStore from '../store/useAppStore'
import useEventStore from '../store/useEventStore'
import {
  watchVolunteerPosts, addVolunteerPost, updateVolunteerPost, deleteVolunteerPost,
  watchVolunteerShifts, addVolunteerShift, updateVolunteerShift, deleteVolunteerShift,
  assignBenevoleToPost,
} from '../firebase/service'
import {
  Plus, Trash2, Pencil, X, Save, Grid3x3, List, MapPin,
  Calendar, CheckCircle2, AlertTriangle, Zap, Users, QrCode, Printer,
} from 'lucide-react'
import QRCode from 'qrcode'
import { Dialog, Button, toast } from '../ui'
import { postQrText, postShortCode } from '../utils/shiftTime'

const POST_COLORS = ['#009090','#F07848','#D89030','#6B3FA0','#0E8D7A','#5EB8E4','#A32D2D','#888780']
const POST_EMOJIS = ['🍻','💳','🎫','🛡️','🍔','📦','🚗','🎤','📋','🔧']

// Convertit "YYYY-MM-DD" en label "Vendredi 12 juin"
function fmtDate(yyyymmdd) {
  if (!yyyymmdd) return ''
  const d = new Date(yyyymmdd + 'T12:00:00')
  if (isNaN(d)) return yyyymmdd
  const s = d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'short' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Génère la liste des dates entre deux dates YYYY-MM-DD inclusives
function datesBetween(start, end) {
  if (!start) return []
  const out = []
  const a = new Date(start + 'T12:00:00')
  const b = end ? new Date(end + 'T12:00:00') : a
  if (isNaN(a)) return []
  const cur = new Date(a)
  let safety = 0
  while (cur <= b && safety < 60) {
    out.push(cur.toISOString().slice(0,10))
    cur.setDate(cur.getDate() + 1)
    safety++
  }
  return out
}

export default function VolunteerPlanning({ benevoles }) {
  const { currentEventId, events } = useEventStore()
  const currentEvent = events.find(e => e.id === currentEventId)

  const [posts, setPosts]   = useState([])
  const [shifts, setShifts] = useState([])
  const [tab, setTab]       = useState('grille') // 'grille' | 'postes' | 'shifts'

  // Listeners temps réel
  useEffect(() => {
    if (!currentEventId) return
    const u1 = watchVolunteerPosts(setPosts, currentEventId)
    const u2 = watchVolunteerShifts(setShifts, currentEventId)
    return () => { u1?.(); u2?.() }
  }, [currentEventId])

  if (!currentEventId) {
    return (
      <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--muted)' }}>
        Sélectionnez un événement pour gérer le planning bénévoles.
      </div>
    )
  }

  return (
    <div>
      {/* Sous-onglets */}
      <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' }}>
        {[
          { id:'grille', label:'Grille',   icon: Grid3x3 },
          { id:'postes', label:'Postes',   icon: MapPin  },
          { id:'shifts', label:'Créneaux', icon: Calendar},
        ].map(t => {
          const Ic = t.icon
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                display:'inline-flex', alignItems:'center', gap:6,
                padding:'8px 14px', borderRadius:8,
                border:'1px solid ' + (active ? 'var(--brand)' : 'var(--border)'),
                background: active ? 'var(--brand)' : 'var(--bg)',
                color: active ? '#fff' : 'var(--text)',
                fontSize:13, fontWeight: active ? 700 : 500,
                cursor:'pointer', fontFamily:'var(--font)', minHeight:38,
                WebkitTapHighlightColor:'transparent',
              }}>
              <Ic size={14}/>{t.label}
            </button>
          )
        })}
      </div>

      {tab === 'grille' && <GrilleView posts={posts} shifts={shifts} benevoles={benevoles}/>}
      {tab === 'postes' && <PostesView posts={posts}/>}
      {tab === 'shifts' && <ShiftsView shifts={shifts} currentEvent={currentEvent}/>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   GRILLE — vue croisée posts × shifts avec affectations
   ═══════════════════════════════════════════════════════════════ */
function GrilleView({ posts, shifts, benevoles }) {
  const [assigning, setAssigning] = useState(null) // { shiftId, postId }

  const benevsById = useMemo(() => {
    const m = {}
    benevoles.forEach(b => { m[b.id] = b })
    return m
  }, [benevoles])

  // Calcule la liste des bénévoles non encore affectés sur un shift donné
  const getAvailables = (shift) => {
    if (!shift) return []
    const assigned = new Set()
    Object.values(shift.postes || {}).forEach(p => (p.assignments || []).forEach(id => assigned.add(id)))
    ;(shift.libres || []).forEach(id => assigned.add(id))
    return benevoles.filter(b => !assigned.has(b.id))
  }

  if (shifts.length === 0) {
    return (
      <EmptyState
        icon={<Calendar size={36}/>}
        title="Aucun créneau défini"
        msg="Commencez par créer des créneaux horaires (onglet ‘Créneaux horaires’) puis des postes (onglet ‘Postes / Stands’)."
      />
    )
  }
  if (posts.length === 0) {
    return (
      <EmptyState
        icon={<MapPin size={36}/>}
        title="Aucun poste défini"
        msg="Créez des postes (Bar, Caisse, Accueil…) dans l’onglet ‘Postes / Stands’ avant d’affecter des bénévoles."
      />
    )
  }

  // Compteurs globaux
  let countOk = 0, countSub = 0, countEmpty = 0
  shifts.forEach(s => {
    posts.forEach(p => {
      const slot = s.postes?.[p.id] || { target: 0, assignments: [] }
      const t = slot.target ?? 0
      const a = (slot.assignments || []).length
      if (t === 0) return
      if (a >= t) countOk++
      else if (a === 0) countEmpty++
      else countSub++
    })
  })

  return (
    <div>
      {/* Légende compteurs */}
      <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap', fontSize:11 }}>
        <span style={{ background:'var(--green-light)', color:'var(--green-dark)', padding:'4px 9px', borderRadius:6, fontWeight:700, display:'inline-flex', alignItems:'center', gap:4 }}>
          <CheckCircle2 size={12}/> {countOk} complet{countOk>1?'s':''}
        </span>
        {countSub > 0 && (
          <span style={{ background:'var(--gold-light)', color:'var(--gold-dark)', padding:'4px 9px', borderRadius:6, fontWeight:700, display:'inline-flex', alignItems:'center', gap:4 }}>
            <AlertTriangle size={12}/> {countSub} sous-effectif
          </span>
        )}
        {countEmpty > 0 && (
          <span style={{ background:'var(--red-light)', color:'var(--red-dark)', padding:'4px 9px', borderRadius:6, fontWeight:700, display:'inline-flex', alignItems:'center', gap:4 }}>
            <Zap size={12}/> {countEmpty} vide{countEmpty>1?'s':''}
          </span>
        )}
      </div>

      {/* Tableau */}
      <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', background:'var(--bg)' }}>
        <table style={{ width:'100%', minWidth: 540, borderCollapse:'separate', borderSpacing:4, padding:6, fontSize:12 }}>
          <thead>
            <tr>
              <th style={{ textAlign:'left', padding:'8px 10px', position:'sticky', left:0, background:'var(--bg)', fontSize:11, color:'var(--muted)', minWidth:110, zIndex:2 }}>Poste</th>
              {shifts.map(s => (
                <th key={s.id} style={{ padding:'8px 4px', textAlign:'center', fontSize:10, color:'var(--muted)', fontWeight:700, minWidth:78 }}>
                  <div>{fmtDate(s.date)}</div>
                  <div style={{ marginTop:2, color:'var(--text)' }}>{s.label || (s.debut + '–' + s.fin)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {posts.map(post => (
              <tr key={post.id}>
                <td style={{ padding:'8px 10px', background:'var(--bg2)', borderRadius:8, fontWeight:700, color:'var(--text)', position:'sticky', left:0, zIndex:1, boxShadow:'2px 0 4px rgba(0,48,72,0.05)' }}>
                  <span style={{ marginRight:6 }}>{post.emoji}</span>{post.nom}
                </td>
                {shifts.map(s => {
                  const slot = s.postes?.[post.id] || { target: 0, assignments: [] }
                  const target = slot.target ?? 0
                  const assigned = slot.assignments || []
                  const n = assigned.length
                  let bg, color, status
                  if (target === 0)     { bg = 'var(--bg2)';        color = 'var(--muted)';     status = '—' }
                  else if (n >= target) { bg = 'var(--green-light)';color = 'var(--green-dark)'; status = 'OK' }
                  else if (n === 0)     { bg = 'var(--red-light)';  color = 'var(--red-dark)';   status = 'Vide' }
                  else                  { bg = 'var(--gold-light)'; color = 'var(--gold-dark)';  status = 'Manque ' + (target - n) }
                  return (
                    <td key={s.id} onClick={() => setAssigning({ shift: s, post })}
                      title={status}
                      style={{
                        background: bg, color, borderRadius: 8, padding: '8px 4px',
                        textAlign:'center', cursor:'pointer',
                        transition:'transform .12s',
                      }}>
                      <div style={{ fontSize:13, fontWeight:800 }}>{n} / {target}</div>
                      {assigned.some(id => s.presences?.[id]) && (
                        <div style={{ fontSize:9, marginTop:1, fontWeight:700 }} title="Bénévoles ayant pointé leur arrivée">
                          ✓ {assigned.filter(id => s.presences?.[id]).length} présent{assigned.filter(id => s.presences?.[id]).length > 1 ? 's' : ''}
                        </div>
                      )}
                      {target > 0 && n < target && (
                        <div style={{ fontSize:9, marginTop:1, opacity:0.9 }}>
                          {n === 0 ? '⚡' : '⚠'} {status}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
            {/* Ligne polyvalents */}
            <tr>
              <td style={{ padding:'8px 10px', background:'var(--bg2)', borderRadius:8, fontWeight:700, color:'var(--gold-dark)', position:'sticky', left:0, zIndex:1, boxShadow:'2px 0 4px rgba(0,48,72,0.05)' }}>
                <Users size={13} style={{ verticalAlign:-2, marginRight:4 }}/>Libres
              </td>
              {shifts.map(s => {
                const n = (s.libres || []).length
                return (
                  <td key={s.id} onClick={() => setAssigning({ shift: s, post: { id:'__free__', nom:'Polyvalents', emoji:'🆓' } })}
                    style={{ background: n > 0 ? 'var(--brand-light)' : 'var(--bg2)', color: n > 0 ? 'var(--brand-dark)' : 'var(--muted)', borderRadius:8, padding:'8px 4px', textAlign:'center', cursor:'pointer' }}>
                    <div style={{ fontSize:13, fontWeight:800 }}>{n}</div>
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ fontSize:11, color:'var(--muted)', marginTop:10, lineHeight:1.5 }}>
        💡 <strong>Cliquez sur une cellule</strong> pour affecter des bénévoles. Un bénévole ne peut être que sur un seul poste par créneau.
      </div>

      {/* Modale affectation */}
      {assigning && (
        <AssignModal
          shift={assigning.shift}
          post={assigning.post}
          posts={posts}
          benevoles={benevoles}
          benevsById={benevsById}
          availables={getAvailables(assigning.shift)}
          onClose={() => setAssigning(null)}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MODALE AFFECTATION
   ═══════════════════════════════════════════════════════════════ */
function AssignModal({ shift, post, posts, benevoles, benevsById, availables, onClose }) {
  const { currentEventId } = useEventStore()
  const [busy, setBusy] = useState(null)

  const currentlyAssigned = post.id === '__free__'
    ? (shift.libres || [])
    : (shift.postes?.[post.id]?.assignments || [])

  const target = post.id === '__free__' ? null : (shift.postes?.[post.id]?.target ?? 0)

  const handleToggle = async (benevId, currentlyAssignedToThisPost) => {
    setBusy(benevId)
    try {
      if (currentlyAssignedToThisPost) {
        // Retirer
        await assignBenevoleToPost(shift.id, benevId, '__remove__', currentEventId)
      } else {
        await assignBenevoleToPost(shift.id, benevId, post.id, currentEventId)
      }
    } catch (e) { console.warn('affectation impossible :', e) }
    setBusy(null)
  }

  return (
    <div onClick={onClose}
      style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          background:'var(--bg)',
          borderRadius:'var(--radius-xl) var(--radius-xl) 0 0',
          width:'100%', maxWidth:480,
          maxHeight:'90vh', display:'flex', flexDirection:'column',
          border:'1px solid var(--border)', borderBottom:'none',
          boxShadow:'0 -8px 32px rgba(0,0,0,0.20)',
          animation: 'ycSlideUp .22s cubic-bezier(.2,.8,.2,1)',
        }}>
        {/* Poignée de drag visuelle (mobile feel) */}
        <div style={{ width:36, height:4, borderRadius:2, background:'var(--border2)', margin:'10px auto 4px', flexShrink:0 }}/>

        {/* Header */}
        <div style={{ padding:'8px 18px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'flex-start', gap:10, flexShrink:0 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:2 }}>
              {fmtDate(shift.date)} · {shift.label || (shift.debut + '–' + shift.fin)}
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:'var(--text)', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
              <span>{post.emoji}</span>
              <span style={{ minWidth:0, overflow:'hidden', textOverflow:'ellipsis' }}>{post.nom}</span>
              {target !== null && <span style={{ fontSize:12, color:'var(--muted)', fontWeight:500 }}>· {currentlyAssigned.length} / {target}</span>}
            </div>
          </div>
          <button onClick={onClose} className="btn-icon" style={{ minHeight:'auto', width:34, height:34 }}>
            <X size={16}/>
          </button>
        </div>

        {/* Liste affectés */}
        <div style={{ padding:'10px 18px', overflowY:'auto', flex:1 }}>
          {currentlyAssigned.length > 0 && (
            <>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>
                Affectés ({currentlyAssigned.length})
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:14 }}>
                {currentlyAssigned.map(id => {
                  const b = benevsById[id]
                  if (!b) return null
                  return (
                    <div key={id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px 8px 14px', background:'var(--brand-light)', borderRadius:8, minHeight:44 }}>
                      <span style={{ flex:1, fontSize:14, color:'var(--text)', fontWeight:600, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.prenom} {b.nom}</span>
                      {shift.presences?.[id] && (
                        <span title="Arrivée pointée" style={{ fontSize:11, fontWeight:700, color:'var(--green-dark)', background:'var(--green-light)', padding:'2px 7px', borderRadius:6, flexShrink:0 }}>
                          ✓ {new Date(shift.presences[id].at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}
                        </span>
                      )}
                      <button onClick={() => handleToggle(id, true)} disabled={busy === id}
                        title="Retirer ce bénévole"
                        style={{ background:'transparent', border:'none', cursor:'pointer', color:'var(--red-dark)', padding:0, width:36, height:36, minHeight:'auto', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:6, WebkitTapHighlightColor:'transparent', flexShrink:0 }}>
                        <X size={16}/>
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Disponibles */}
          <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>
            Disponibles ({availables.length})
          </div>
          {availables.length === 0 ? (
            <div style={{ fontSize:12, color:'var(--muted)', textAlign:'center', padding:'16px 0', fontStyle:'italic' }}>
              Tous les bénévoles sont déjà affectés sur ce créneau.
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {availables.map(b => (
                <button key={b.id} onClick={() => handleToggle(b.id, false)} disabled={busy === b.id}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 12px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, cursor:'pointer', fontFamily:'var(--font)', textAlign:'left', minHeight:44, transition:'background .12s', WebkitTapHighlightColor:'transparent' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--brand-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--bg2)'}>
                  <Plus size={16} style={{ color:'var(--brand)', flexShrink:0 }}/>
                  <span style={{ flex:1, fontSize:14, color:'var(--text)', minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.prenom} {b.nom}</span>
                  {b.poste && <span style={{ fontSize:10, color:'var(--muted)', flexShrink:0 }}>{b.poste}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer — sticky pour rester accessible même clavier ouvert */}
        <div style={{ padding:'10px 18px max(env(safe-area-inset-bottom), 12px)', borderTop:'1px solid var(--border)', flexShrink:0, background:'var(--bg)' }}>
          <button onClick={onClose} className="btn-secondary" style={{ width:'100%', minHeight:44 }}>Fermer</button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   POSTES — CRUD
   ═══════════════════════════════════════════════════════════════ */
function PostesView({ posts }) {
  const { currentEventId } = useEventStore()
  const [editing, setEditing] = useState(null)
  const [qrPost, setQrPost] = useState(null)
  const [ask, confirmDialog] = useConfirm()

  const openNew = () => setEditing({ nom:'', emoji: POST_EMOJIS[0], couleur: POST_COLORS[0] })

  const handleSave = async () => {
    if (!editing.nom?.trim()) return
    if (editing.id) {
      await updateVolunteerPost(editing.id, { nom: editing.nom.trim(), emoji: editing.emoji, couleur: editing.couleur }, currentEventId)
    } else {
      await addVolunteerPost({ nom: editing.nom.trim(), emoji: editing.emoji, couleur: editing.couleur, ordre: posts.length }, currentEventId)
    }
    setEditing(null)
  }

  const handleDelete = async (id) => {
    if (!(await ask({ title: 'Supprimer ce poste ?', message: 'Les affectations existantes seront orphelines.', label: 'Supprimer' }))) return
    await deleteVolunteerPost(id, currentEventId)
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
        <div style={{ fontSize:13, color:'var(--muted)', flex:'1 1 200px' }}>{posts.length} poste{posts.length>1?'s':''}</div>
        <button onClick={openNew} className="btn-primary" style={{ padding:'0 14px', minHeight:36 }}>
          <Plus size={14}/> Nouveau
        </button>
      </div>

      <PostQrDialog post={qrPost} eventId={currentEventId} onClose={() => setQrPost(null)}/>
      {confirmDialog}

      {posts.length === 0 && !editing && (
        <EmptyState icon={<MapPin size={36}/>} title="Aucun poste défini" msg="Créez votre premier poste (Bar, Caisse, Accueil…) pour démarrer."/>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {posts.map(p => (
          <div key={p.id} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'10px 12px', display:'flex', alignItems:'center', gap:12, minHeight:60 }}>
            <div style={{ width:40, height:40, borderRadius:8, background: p.couleur + '22', color: p.couleur, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
              {p.emoji}
            </div>
            <div style={{ flex:1, fontSize:14, fontWeight:700, color:'var(--text)', minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.nom}</div>
            <button onClick={() => setQrPost(p)} className="btn-icon" title="QR de pointage" aria-label={'QR de pointage du poste ' + p.nom} style={{ width:40, height:40, minHeight:'auto', flexShrink:0 }}><QrCode size={14}/></button>
            <button onClick={() => setEditing(p)} className="btn-icon" style={{ width:40, height:40, minHeight:'auto', flexShrink:0 }}><Pencil size={14}/></button>
            <button onClick={() => handleDelete(p.id)} className="btn-icon" style={{ width:40, height:40, minHeight:'auto', color:'var(--red-dark)', flexShrink:0 }}><Trash2 size={14}/></button>
          </div>
        ))}
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div onClick={e => e.stopPropagation()} style={{
            background:'var(--bg)', borderRadius:'var(--radius-xl) var(--radius-xl) 0 0',
            padding:'10px 20px max(env(safe-area-inset-bottom), 20px)',
            width:'100%', maxWidth:440, maxHeight:'92vh', overflowY:'auto',
            border:'1px solid var(--border)', borderBottom:'none',
            boxShadow:'0 -8px 32px rgba(0,0,0,0.20)',
            animation: 'ycSlideUp .22s cubic-bezier(.2,.8,.2,1)',
          }}>
            {/* Poignée drag */}
            <div style={{ width:36, height:4, borderRadius:2, background:'var(--border2)', margin:'0 auto 14px' }}/>

            <div style={{ fontSize:16, fontWeight:700, color:'var(--text)', marginBottom:14 }}>{editing.id ? 'Modifier le poste' : 'Nouveau poste'}</div>

            <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:5 }}>Nom</label>
            <input type="text" value={editing.nom} onChange={e => setEditing(f => ({ ...f, nom: e.target.value }))} autoFocus placeholder="ex : Bar, Caisse, Accueil…"
              style={{ width:'100%', boxSizing:'border-box', minHeight:44, padding:'0 14px', border:'1.5px solid var(--border2)', borderRadius:8, fontSize:15, color:'var(--text)', background:'var(--bg2)', fontFamily:'var(--font)', outline:'none', marginBottom:16 }}/>

            <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:5 }}>Icône</label>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(44px, 1fr))', gap:6, marginBottom:16 }}>
              {POST_EMOJIS.map(e => (
                <button key={e} onClick={() => setEditing(f => ({ ...f, emoji: e }))}
                  style={{ height:44, borderRadius:8, border: editing.emoji === e ? '2px solid var(--brand)' : '1px solid var(--border)', background: editing.emoji === e ? 'var(--brand-light)' : 'var(--bg2)', fontSize:20, cursor:'pointer', minHeight:'auto', padding:0, display:'flex', alignItems:'center', justifyContent:'center', WebkitTapHighlightColor:'transparent' }}>
                  {e}
                </button>
              ))}
            </div>

            <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:5 }}>Couleur</label>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
              {POST_COLORS.map(c => (
                <button key={c} onClick={() => setEditing(f => ({ ...f, couleur: c }))}
                  title={c}
                  style={{ width:40, height:40, borderRadius:'50%', border: editing.couleur === c ? '3px solid var(--text)' : '2px solid var(--bg2)', background: c, cursor:'pointer', minHeight:'auto', padding:0, boxShadow: editing.couleur === c ? '0 2px 8px rgba(0,0,0,0.15)' : 'none', transition:'transform .1s', WebkitTapHighlightColor:'transparent' }}/>
              ))}
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setEditing(null)} className="btn-secondary" style={{ flex:1, minHeight:44 }}>Annuler</button>
              <button onClick={handleSave} disabled={!editing.nom?.trim()} className="btn-primary" style={{ flex:1, minHeight:44 }}>
                <Save size={14}/> Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   SHIFTS — CRUD créneaux horaires
   ═══════════════════════════════════════════════════════════════ */
function ShiftsView({ shifts, currentEvent }) {
  const { currentEventId } = useEventStore()
  const [ask, confirmDialog] = useConfirm()
  const [posts, setPosts] = useState([])
  useEffect(() => {
    if (!currentEventId) return
    const u = watchVolunteerPosts(setPosts, currentEventId)
    return () => u?.()
  }, [currentEventId])
  const [editing, setEditing] = useState(null)
  const [bulkOpen, setBulkOpen] = useState(false)

  const eventDates = useMemo(() => {
    return datesBetween(currentEvent?.date, currentEvent?.dateFin)
  }, [currentEvent?.date, currentEvent?.dateFin])

  const openNew = () => setEditing({
    date: eventDates[0] || new Date().toISOString().slice(0,10),
    label: '',
    debut: '12:00',
    fin: '16:00',
    postes: {}, // sera rempli avec targets:0 par défaut pour chaque post
  })

  const handleSave = async () => {
    if (!editing.date || !editing.debut || !editing.fin) return
    // Préserve les targets existants si modification
    const postes = { ...editing.postes }
    posts.forEach(p => {
      if (!postes[p.id]) postes[p.id] = { target: 0, assignments: [] }
    })
    if (editing.id) {
      await updateVolunteerShift(editing.id, { date: editing.date, label: editing.label, debut: editing.debut, fin: editing.fin, postes }, currentEventId)
    } else {
      await addVolunteerShift({ date: editing.date, label: editing.label, debut: editing.debut, fin: editing.fin, postes, libres: [], pending: [] }, currentEventId)
    }
    setEditing(null)
  }

  const handleDelete = async (id) => {
    if (!(await ask({ title: 'Supprimer ce créneau ?', message: 'Toutes ses affectations seront perdues.', label: 'Supprimer' }))) return
    await deleteVolunteerShift(id, currentEventId)
  }

  // Génération en masse : "Midi+Soir" pour chaque date de l'événement
  const handleBulkGen = async () => {
    if (eventDates.length === 0) { toast.error("Définissez d'abord les dates de l'événement dans Événements."); return }
    if (!(await ask({
      title: 'Générer les créneaux ?',
      message: `Créer 2 créneaux par jour (Midi 12h-16h + Soir 18h-23h) sur ${eventDates.length} jour${eventDates.length>1?'s':''} ?`,
      label: 'Générer', variant: 'primary',
    }))) return
    for (const d of eventDates) {
      const postesInit = {}
      posts.forEach(p => { postesInit[p.id] = { target: 0, assignments: [] } })
      await addVolunteerShift({ date: d, label: 'Midi',  debut: '12:00', fin: '16:00', postes: postesInit, libres: [], pending: [] }, currentEventId)
      await addVolunteerShift({ date: d, label: 'Soir',  debut: '18:00', fin: '23:00', postes: postesInit, libres: [], pending: [] }, currentEventId)
    }
  }

  return (
    <div>
      {confirmDialog}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
        <div style={{ fontSize:13, color:'var(--muted)', flex:'1 1 200px' }}>
          {shifts.length} créneau{shifts.length>1?'x':''}
          {eventDates.length > 0 && ` · ${eventDates.length} jour${eventDates.length>1?'s':''}`}
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {shifts.length === 0 && eventDates.length > 0 && (
            <button onClick={handleBulkGen} className="btn-secondary" style={{ padding:'0 12px', minHeight:36, fontSize:12 }}
              title="Créer Midi 12h-16h + Soir 18h-23h pour chaque jour de l'événement">
              ✨ Auto-générer
            </button>
          )}
          <button onClick={openNew} className="btn-primary" style={{ padding:'0 14px', minHeight:36 }}>
            <Plus size={14}/> Nouveau
          </button>
        </div>
      </div>

      {shifts.length === 0 && (
        <EmptyState
          icon={<Calendar size={36}/>}
          title="Aucun créneau défini"
          msg={eventDates.length > 0
            ? "Cliquez sur ‘Générer’ pour créer automatiquement Midi+Soir pour chaque jour de votre événement, ou ‘Nouveau créneau’ pour le faire à la main."
            : "Définissez d'abord les dates de l'événement dans Événements, puis créez vos créneaux."}/>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {shifts.map(s => (
          <div key={s.id} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'10px 12px', display:'flex', alignItems:'center', gap:10, minHeight:60 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {fmtDate(s.date)} {s.label && <span style={{ color:'var(--brand)', marginLeft:6 }}>· {s.label}</span>}
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, fontVariantNumeric:'tabular-nums' }}>
                {s.debut} → {s.fin}
              </div>
            </div>
            <button onClick={() => setEditing(s)} className="btn-icon" style={{ width:40, height:40, minHeight:'auto', flexShrink:0 }}><Pencil size={14}/></button>
            <button onClick={() => handleDelete(s.id)} className="btn-icon" style={{ width:40, height:40, minHeight:'auto', color:'var(--red-dark)', flexShrink:0 }}><Trash2 size={14}/></button>
          </div>
        ))}
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div onClick={e => e.stopPropagation()} style={{
            background:'var(--bg)', borderRadius:'var(--radius-xl) var(--radius-xl) 0 0',
            padding:'10px 20px max(env(safe-area-inset-bottom), 20px)',
            width:'100%', maxWidth:460, maxHeight:'92vh', overflowY:'auto',
            border:'1px solid var(--border)', borderBottom:'none',
            boxShadow:'0 -8px 32px rgba(0,0,0,0.20)',
            animation: 'ycSlideUp .22s cubic-bezier(.2,.8,.2,1)',
          }}>
            {/* Poignée drag */}
            <div style={{ width:36, height:4, borderRadius:2, background:'var(--border2)', margin:'0 auto 14px' }}/>

            <div style={{ fontSize:16, fontWeight:700, color:'var(--text)', marginBottom:14 }}>{editing.id ? 'Modifier le créneau' : 'Nouveau créneau'}</div>

            <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:5 }}>Date</label>
            {eventDates.length > 0 ? (
              <select value={editing.date} onChange={e => setEditing(f => ({ ...f, date: e.target.value }))}
                style={{ width:'100%', boxSizing:'border-box', minHeight:44, padding:'0 12px', border:'1.5px solid var(--border2)', borderRadius:8, fontSize:15, color:'var(--text)', background:'var(--bg2)', fontFamily:'var(--font)', outline:'none', marginBottom:14 }}>
                {eventDates.map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
              </select>
            ) : (
              <input type="date" value={editing.date} onChange={e => setEditing(f => ({ ...f, date: e.target.value }))}
                style={{ width:'100%', boxSizing:'border-box', minHeight:44, padding:'0 14px', border:'1.5px solid var(--border2)', borderRadius:8, fontSize:15, color:'var(--text)', background:'var(--bg2)', fontFamily:'var(--font)', outline:'none', marginBottom:14 }}/>
            )}

            <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:5 }}>Label (optionnel)</label>
            <input type="text" value={editing.label} onChange={e => setEditing(f => ({ ...f, label: e.target.value }))}
              placeholder="ex : Midi, Soir, Brunch…"
              style={{ width:'100%', boxSizing:'border-box', minHeight:44, padding:'0 14px', border:'1.5px solid var(--border2)', borderRadius:8, fontSize:15, color:'var(--text)', background:'var(--bg2)', fontFamily:'var(--font)', outline:'none', marginBottom:14 }}/>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:5 }}>Début</label>
                <input type="time" value={editing.debut} onChange={e => setEditing(f => ({ ...f, debut: e.target.value }))}
                  style={{ width:'100%', boxSizing:'border-box', minHeight:44, padding:'0 12px', border:'1.5px solid var(--border2)', borderRadius:8, fontSize:15, color:'var(--text)', background:'var(--bg2)', fontFamily:'var(--font)', outline:'none' }}/>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:5 }}>Fin</label>
                <input type="time" value={editing.fin} onChange={e => setEditing(f => ({ ...f, fin: e.target.value }))}
                  style={{ width:'100%', boxSizing:'border-box', minHeight:44, padding:'0 12px', border:'1.5px solid var(--border2)', borderRadius:8, fontSize:15, color:'var(--text)', background:'var(--bg2)', fontFamily:'var(--font)', outline:'none' }}/>
              </div>
            </div>

            {/* Effectifs cibles par poste */}
            {posts.length > 0 && (
              <>
                <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:8 }}>Effectifs cibles par poste</label>
                <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:20 }}>
                  {posts.map(p => {
                    const cur = editing.postes?.[p.id]?.target ?? 0
                    return (
                      <div key={p.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'var(--bg2)', borderRadius:8, minHeight:48 }}>
                        <span style={{ fontSize:20, flexShrink:0 }}>{p.emoji}</span>
                        <span style={{ flex:1, fontSize:14, fontWeight:600, color:'var(--text)', minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.nom}</span>
                        {/* Stepper visuel avec ± pour mobile */}
                        <div style={{ display:'flex', alignItems:'center', gap:0, background:'var(--bg)', border:'1px solid var(--border2)', borderRadius:6, overflow:'hidden', flexShrink:0 }}>
                          <button type="button" onClick={() => {
                            const n = Math.max(0, cur - 1)
                            setEditing(f => ({ ...f, postes: { ...f.postes, [p.id]: { ...(f.postes?.[p.id] || { assignments: [] }), target: n } } }))
                          }}
                            style={{ width:36, height:36, border:'none', background:'transparent', cursor:'pointer', fontSize:18, fontWeight:700, color:'var(--muted)', padding:0, minHeight:'auto', WebkitTapHighlightColor:'transparent' }}>
                            −
                          </button>
                          <input type="number" inputMode="numeric" min="0" max="50" value={cur}
                            onChange={e => {
                              const n = Math.max(0, parseInt(e.target.value) || 0)
                              setEditing(f => ({ ...f, postes: { ...f.postes, [p.id]: { ...(f.postes?.[p.id] || { assignments: [] }), target: n } } }))
                            }}
                            style={{ width:36, minHeight:36, padding:0, border:'none', borderLeft:'1px solid var(--border2)', borderRight:'1px solid var(--border2)', fontSize:14, fontWeight:700, color:'var(--text)', background:'var(--bg)', fontFamily:'var(--font)', outline:'none', textAlign:'center', MozAppearance:'textfield' }}/>
                          <button type="button" onClick={() => {
                            const n = Math.min(50, cur + 1)
                            setEditing(f => ({ ...f, postes: { ...f.postes, [p.id]: { ...(f.postes?.[p.id] || { assignments: [] }), target: n } } }))
                          }}
                            style={{ width:36, height:36, border:'none', background:'transparent', cursor:'pointer', fontSize:18, fontWeight:700, color:'var(--brand)', padding:0, minHeight:'auto', WebkitTapHighlightColor:'transparent' }}>
                            +
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setEditing(null)} className="btn-secondary" style={{ flex:1, minHeight:44 }}>Annuler</button>
              <button onClick={handleSave} className="btn-primary" style={{ flex:1, minHeight:44 }}>
                <Save size={14}/> Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   UTIL — état vide
   ═══════════════════════════════════════════════════════════════ */
/* QR de pointage d'un poste : affiché ou imprimé au poste, scanné par le bénévole à son arrivée */
function PostQrDialog({ post, eventId, onClose }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    setSrc(null)
    if (!post || !eventId) return
    QRCode.toDataURL(postQrText(eventId, post.id), { width: 480, margin: 2, color: { dark: '#003048', light: '#ffffff' } })
      .then(setSrc).catch(() => {})
  }, [post?.id, eventId])

  const print = () => {
    const w = window.open('', '_blank')
    if (!w) return
    const esc = (t) => String(t || '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]))
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Pointage ${esc(post.nom)}</title>
      <body style="font-family:system-ui,sans-serif;text-align:center;padding:40px;color:#003048">
      <h1 style="font-size:40px;margin:0">${esc(post.emoji)} ${esc(post.nom)}</h1>
      <p style="font-size:20px">Bénévoles : scannez ce QR pour pointer votre arrivée</p>
      <img src="${src}" style="width:420px;height:420px">
      <p style="font-size:18px">Sans caméra, code du poste : <b style="font-size:28px;letter-spacing:.1em">${postShortCode(post.id)}</b></p>
      <script>window.onload=()=>window.print()<\/script></body>`)
    w.document.close()
  }

  return (
    <Dialog open={!!post} onClose={onClose} title={post ? `QR de pointage · ${post.nom}` : ''}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Fermer</Button>
        <Button icon={Printer} onClick={print} disabled={!src}>Imprimer</Button>
      </>}>
      {post && (
        <div style={{ display:'grid', justifyItems:'center', gap:10, textAlign:'center' }}>
          <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.5 }}>
            Affichez ou imprimez ce QR au poste. Les bénévoles le scannent depuis leur espace pour pointer leur arrivée, d'une heure avant le début jusqu'à la fin de leur créneau.
          </div>
          <div style={{ background:'#fff', borderRadius:12, padding:8, border:'1px solid var(--border)' }}>
            {src ? <img src={src} alt={'QR de pointage du poste ' + post.nom} style={{ width:240, height:240, display:'block' }}/> : <div style={{ width:240, height:240 }}/>}
          </div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>
            Code sans caméra : <b style={{ fontSize:18, letterSpacing:'.1em', color:'var(--text)', fontFamily:'var(--font-display)' }}>{postShortCode(post.id)}</b>
          </div>
        </div>
      )}
    </Dialog>
  )
}

// Confirmation dans une fenêtre (remplace window.confirm)
// const [ask, confirmDialog] = useConfirm() ; if (!(await ask({ title, message, label }))) return
function useConfirm() {
  const [req, setReq] = useState(null) // { title, message, label, variant, resolve }
  const ask = (opts) => new Promise(resolve => setReq({ ...opts, resolve }))
  const answer = (ok) => { req?.resolve(ok); setReq(null) }
  const dialog = (
    <Dialog open={!!req} onClose={() => answer(false)} title={req?.title}
      footer={<>
        <Button variant="secondary" onClick={() => answer(false)}>Annuler</Button>
        <Button variant={req?.variant || 'danger'} onClick={() => answer(true)}>{req?.label || 'Confirmer'}</Button>
      </>}>
      <p style={{ margin:0, fontSize:13, lineHeight:1.5, color:'var(--text)' }}>{req?.message}</p>
    </Dialog>
  )
  return [ask, dialog]
}

function EmptyState({ icon, title, msg }) {
  return (
    <div style={{ background:'var(--bg2)', border:'1px dashed var(--border2)', borderRadius:'var(--radius-lg)', padding:'36px 20px', textAlign:'center' }}>
      <div style={{ color:'var(--muted)', marginBottom:10, display:'flex', justifyContent:'center' }}>{icon}</div>
      <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:4 }}>{title}</div>
      <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.5, maxWidth:360, margin:'0 auto' }}>{msg}</div>
    </div>
  )
}
