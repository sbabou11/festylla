/**
 * components/BenevolePlanning.jsx
 *
 * Onglet "Planning" dans l'espace bénévole mobile.
 * Le bénévole voit les créneaux du festival et peut s'inscrire / se désinscrire
 * sur les postes qui ont encore de la place.
 *
 * Comportement :
 *   - Vue groupée par jour, puis par créneau horaire
 *   - Chaque poste affiche le compteur (X/Y) et la liste des affectés
 *   - Un bénévole = un seul poste par créneau (changement réaffecte automatiquement)
 *   - Auto-validation : l'inscription est immédiate, pas d'attente admin
 *   - Poste "Libre" (polyvalent) toujours disponible sans cible d'effectif
 */

import React, { useState, useEffect, useMemo } from 'react'
import {
  watchVolunteerPosts, watchVolunteerShifts, assignBenevoleToPost,
} from '../firebase/service'
import { Users, Check, Plus, AlertCircle, X, Calendar } from 'lucide-react'

// "YYYY-MM-DD" → "Vendredi 12 juin"
function fmtDate(yyyymmdd) {
  if (!yyyymmdd) return ''
  const d = new Date(yyyymmdd + 'T12:00:00')
  if (isNaN(d)) return yyyymmdd
  const s = d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function BenevolePlanning({ benev, eventId, benevoles }) {
  const [posts, setPosts]   = useState([])
  const [shifts, setShifts] = useState([])
  const [busy, setBusy]     = useState(null)  // { shiftId, postId } en cours d'écriture
  const [error, setError]   = useState('')

  // Listeners temps réel
  useEffect(() => {
    if (!eventId) return
    const u1 = watchVolunteerPosts(setPosts, eventId)
    const u2 = watchVolunteerShifts(setShifts, eventId)
    return () => { u1?.(); u2?.() }
  }, [eventId])

  // Map id → nom pour afficher les autres bénévoles
  const benevsById = useMemo(() => {
    const m = {}
    ;(benevoles || []).forEach(b => { m[b.id] = b })
    return m
  }, [benevoles])

  // Groupement shifts par date
  const shiftsByDay = useMemo(() => {
    const groups = {}
    shifts.forEach(s => {
      const k = s.date || 'sans-date'
      if (!groups[k]) groups[k] = []
      groups[k].push(s)
    })
    // Tri intérieur par heure début
    Object.values(groups).forEach(arr => arr.sort((a,b) => (a.debut || '').localeCompare(b.debut || '')))
    return groups
  }, [shifts])

  // Pour chaque shift, où est positionné le bénévole courant ? ('postId' | '__free__' | null)
  const myPositionOn = (shift) => {
    if (!benev?.id || !shift) return null
    const found = Object.entries(shift.postes || {}).find(([, p]) => (p.assignments || []).includes(benev.id))
    if (found) return found[0]
    if ((shift.libres || []).includes(benev.id)) return '__free__'
    return null
  }

  // Action : s'inscrire / changer de poste / se désinscrire
  const handleToggle = async (shift, postId) => {
    if (!benev?.id || !eventId) return
    setError('')
    setBusy({ shiftId: shift.id, postId })
    try {
      const current = myPositionOn(shift)
      // Si je clique sur mon poste actuel → désinscription
      const target = current === postId ? '__remove__' : postId
      await assignBenevoleToPost(shift.id, benev.id, target, eventId)
    } catch (e) {
      console.warn(e)
      setError('Impossible de mettre à jour. Réessayez.')
    }
    setBusy(null)
  }

  if (!eventId) return null

  if (shifts.length === 0) {
    return (
      <div style={{ background:'var(--bg)', borderRadius:'var(--radius-lg)', padding:'32px 20px', textAlign:'center' }}>
        <Calendar size={36} style={{ color:'var(--muted)', marginBottom:10 }}/>
        <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:4 }}>Planning à venir</div>
        <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.5 }}>
          L'organisation n'a pas encore publié les créneaux. Revenez bientôt.
        </div>
      </div>
    )
  }

  // Calcul de mes propres créneaux pour le résumé
  const myShifts = shifts.filter(s => myPositionOn(s) !== null)

  return (
    <div>
      {/* Résumé personnel */}
      <div style={{ background:'var(--brand-light)', border:'1px solid var(--brand)', borderRadius:'var(--radius-lg)', padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'center', gap:10 }}>
        <Users size={16} style={{ color:'var(--brand-dark)', flexShrink:0 }}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--brand-dark)' }}>
            {myShifts.length === 0 ? 'Aucun créneau choisi' : `${myShifts.length} créneau${myShifts.length>1?'x':''} sélectionné${myShifts.length>1?'s':''}`}
          </div>
          <div style={{ fontSize:11, color:'var(--brand-dark)', opacity:.85, marginTop:1 }}>
            {myShifts.length === 0 ? 'Inscrivez-vous ci-dessous sur les postes disponibles.' : "Cliquez sur votre poste actif pour vous désinscrire."}
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
          <AlertCircle size={14}/>{error}
        </div>
      )}

      {/* Groupes par jour */}
      {Object.keys(shiftsByDay).sort().map(day => (
        <div key={day} style={{ marginBottom:18 }}>
          <div style={{ fontSize:11, fontWeight:800, color:'var(--text)', letterSpacing:'.06em', marginBottom:8, paddingBottom:6, borderBottom:'1px solid var(--border)', textTransform:'uppercase' }}>
            {fmtDate(day)}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {shiftsByDay[day].map(shift => {
              const myPos = myPositionOn(shift)
              return (
                <ShiftCard
                  key={shift.id}
                  shift={shift}
                  posts={posts}
                  benevsById={benevsById}
                  myId={benev?.id}
                  myPos={myPos}
                  busy={busy}
                  onToggle={handleToggle}
                />
              )
            })}
          </div>
        </div>
      ))}

      <div style={{ fontSize:11, color:'var(--muted)', textAlign:'center', marginTop:8, padding:'8px 12px', lineHeight:1.5 }}>
        💡 Cliquez sur un poste pour vous inscrire. Cliquez à nouveau pour vous désinscrire.
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Carte d'un créneau — montre tous les postes et leur état
   ═══════════════════════════════════════════════════════════════ */
function ShiftCard({ shift, posts, benevsById, myId, myPos, busy, onToggle }) {
  const isMyShift = myPos !== null
  return (
    <div style={{
      background:'var(--bg)',
      borderRadius:'var(--radius-lg)',
      border:'1px solid ' + (isMyShift ? 'var(--brand)' : 'var(--border)'),
      overflow:'hidden',
      boxShadow: isMyShift ? '0 2px 10px rgba(0,144,144,0.12)' : 'none',
    }}>
      {/* Header créneau */}
      <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', background: isMyShift ? 'var(--brand-light)' : 'var(--bg2)', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>
            {shift.label || (shift.debut + ' → ' + shift.fin)}
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:1, fontVariantNumeric:'tabular-nums' }}>
            {shift.debut} → {shift.fin}
          </div>
        </div>
        {isMyShift && (
          <span style={{ background:'var(--brand)', color:'#fff', fontSize:10, fontWeight:800, padding:'3px 8px', borderRadius:6, display:'inline-flex', alignItems:'center', gap:3 }}>
            <Check size={10}/> INSCRIT
          </span>
        )}
      </div>

      {/* Liste des postes */}
      <div style={{ padding:8, display:'flex', flexDirection:'column', gap:4 }}>
        {posts.length === 0 ? (
          <div style={{ fontSize:12, color:'var(--muted)', textAlign:'center', padding:'12px 8px' }}>
            Aucun poste défini sur ce créneau.
          </div>
        ) : (
          posts.map(p => {
            const slot = shift.postes?.[p.id] || { target: 0, assignments: [] }
            const target = slot.target ?? 0
            const assigned = slot.assignments || []
            // Si pas de cible définie, on n'affiche pas ce poste (il n'est pas ouvert)
            if (target === 0) return null
            const isMine = myPos === p.id
            const full = assigned.length >= target
            const canJoin = !full || isMine
            const isBusy = busy?.shiftId === shift.id && busy?.postId === p.id

            return (
              <PostRow
                key={p.id}
                post={p}
                assigned={assigned}
                benevsById={benevsById}
                myId={myId}
                target={target}
                isMine={isMine}
                canJoin={canJoin}
                isBusy={isBusy}
                onClick={() => onToggle(shift, p.id)}
              />
            )
          })
        )}

        {/* Toujours proposer "Polyvalent / Libre" pour les bénévoles flexibles */}
        <PostRow
          post={{ id: '__free__', nom: 'Polyvalent', emoji: '🆓', couleur: '#D89030' }}
          assigned={shift.libres || []}
          benevsById={benevsById}
          myId={myId}
          target={null}
          isMine={myPos === '__free__'}
          canJoin
          isBusy={busy?.shiftId === shift.id && busy?.postId === '__free__'}
          onClick={() => onToggle(shift, '__free__')}
          freeMode
        />
      </div>
    </div>
  )
}

/* Ligne d'un poste dans un créneau */
function PostRow({ post, assigned, benevsById, myId, target, isMine, canJoin, isBusy, onClick, freeMode }) {
  const full = target != null && assigned.length >= target
  const otherNames = assigned.filter(id => id !== myId).map(id => benevsById[id]?.prenom).filter(Boolean)

  // Couleur de fond selon état
  let bg = 'var(--bg2)'
  let border = '1px solid var(--border)'
  if (isMine) {
    bg = 'var(--brand-light)'
    border = '1.5px solid var(--brand)'
  } else if (freeMode) {
    bg = 'var(--gold-light)'
    border = '1px dashed var(--gold)'
  } else if (full) {
    bg = 'var(--bg3)'
  }

  return (
    <button onClick={canJoin ? onClick : undefined} disabled={!canJoin || isBusy}
      style={{
        display:'flex', alignItems:'center', gap:10,
        padding:'12px 12px', borderRadius:'var(--radius)',
        background: bg, border,
        cursor: canJoin ? 'pointer' : 'not-allowed',
        opacity: isBusy ? 0.5 : 1,
        fontFamily:'var(--font)', textAlign:'left',
        minHeight:56,
        transition:'background .15s, transform .1s',
        WebkitTapHighlightColor:'transparent',
        width:'100%',
      }}>
      {/* Emoji + nom poste */}
      <div style={{ display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0 }}>
        <span style={{ fontSize:22, flexShrink:0 }}>{post.emoji}</span>
        <div style={{ minWidth:0, flex:1 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {post.nom}
            {freeMode && <span style={{ fontSize:10, color:'var(--gold-dark)', marginLeft:6, fontWeight:600 }}>(sans poste fixe)</span>}
          </div>
          {otherNames.length > 0 ? (
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              Avec : {otherNames.slice(0, 4).join(', ')}{otherNames.length > 4 ? ` +${otherNames.length-4}` : ''}
            </div>
          ) : (
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, fontStyle:'italic' }}>
              {assigned.length === 0 ? 'Personne pour le moment' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Compteur + état */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', flexShrink:0, gap:3 }}>
        {target != null ? (
          <span style={{
            fontSize:11, fontWeight:800,
            padding:'2px 7px', borderRadius:5, fontVariantNumeric:'tabular-nums',
            background: full && !isMine ? 'var(--bg3)' : (isMine ? 'var(--brand)' : (assigned.length === 0 ? 'var(--red-light)' : 'var(--gold-light)')),
            color:    full && !isMine ? 'var(--muted)' : (isMine ? '#fff' : (assigned.length === 0 ? 'var(--red-dark)' : 'var(--gold-dark)')),
          }}>
            {assigned.length} / {target}
          </span>
        ) : (
          <span style={{ fontSize:10, color:'var(--muted)', fontWeight:700 }}>{assigned.length} inscrits</span>
        )}
        {isMine ? (
          <span style={{ fontSize:9, fontWeight:700, color:'var(--brand-dark)', display:'flex', alignItems:'center', gap:2 }}>
            <Check size={9}/> MOI
          </span>
        ) : full ? (
          <span style={{ fontSize:9, fontWeight:700, color:'var(--muted)' }}>COMPLET</span>
        ) : (
          <span style={{ fontSize:9, fontWeight:700, color:'var(--brand)', display:'flex', alignItems:'center', gap:2 }}>
            <Plus size={9}/> REJOINDRE
          </span>
        )}
      </div>
    </button>
  )
}
