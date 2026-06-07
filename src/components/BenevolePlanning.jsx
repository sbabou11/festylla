/**
 * components/BenevolePlanning.jsx — v8 debug
 *
 * Onglet "Planning" dans l'espace bénévole mobile.
 * Mise à jour majeure (v8 debug) :
 *   - Vue grille par jour (même structure que l'admin) au lieu de cartes verticales
 *   - Bug corrigé : myId tolère benev._id ET benev.id (BenevoleApp utilise _id)
 *   - Mises à jour temps réel automatiques (listeners Firestore)
 *   - Modale d'inscription en bottom sheet (cohérent avec l'admin)
 *   - Plus ergonomique : moins de bruit visuel, focus sur l'action
 */

import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  watchVolunteerPosts, watchVolunteerShifts, assignBenevoleToPost,
} from '../firebase/service'
import {
  Users, Check, Plus, AlertCircle, X, Calendar,
  CheckCircle2, AlertTriangle, Zap,
} from 'lucide-react'

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
  const [error, setError]   = useState('')
  const [assigning, setAssigning] = useState(null) // { shiftId, postId, postOverride? }

  // L'id du bénévole peut être stocké en _id (BenevoleApp) ou id. On normalise.
  const myId = benev?._id || benev?.id || null

  // Listeners temps réel
  useEffect(() => {
    if (!eventId) return
    const u1 = watchVolunteerPosts(setPosts, eventId)
    const u2 = watchVolunteerShifts(setShifts, eventId)
    return () => { u1?.(); u2?.() }
  }, [eventId])

  // Map id → bénévole pour afficher les noms
  const benevsById = useMemo(() => {
    const m = {}
    ;(benevoles || []).forEach(b => { m[b.id] = b })
    return m
  }, [benevoles])

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

  // Calcul du nombre de créneaux où je suis affecté
  const myShiftsCount = shifts.filter(s => {
    const inPost = Object.values(s.postes || {}).some(p => (p.assignments || []).includes(myId))
    const inLibres = (s.libres || []).includes(myId)
    return inPost || inLibres
  }).length

  return (
    <div>
      {/* Résumé personnel */}
      <div style={{ background:'var(--brand-light)', border:'1px solid var(--brand)', borderRadius:'var(--radius-lg)', padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'center', gap:10 }}>
        <Users size={16} style={{ color:'var(--brand-dark)', flexShrink:0 }}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--brand-dark)' }}>
            {myShiftsCount === 0 ? 'Aucun créneau choisi' : `${myShiftsCount} créneau${myShiftsCount>1?'x':''} sélectionné${myShiftsCount>1?'s':''}`}
          </div>
          <div style={{ fontSize:11, color:'var(--brand-dark)', opacity:.85, marginTop:1 }}>
            Cliquez sur une cellule pour vous inscrire ou modifier votre poste.
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
          <AlertCircle size={14}/>{error}
        </div>
      )}

      {/* Grille par jour */}
      <BenevoleDayGrids
        shifts={shifts}
        posts={posts}
        myId={myId}
        onCellClick={(shiftId, postId, postOverride) => setAssigning({ shiftId, postId, postOverride })}
      />

      <div style={{ fontSize:11, color:'var(--muted)', textAlign:'center', marginTop:12, padding:'8px 12px', lineHeight:1.5 }}>
        💡 Cliquez sur une cellule pour vous inscrire à un poste, ou cliquez sur la cellule où vous êtes (✓) pour vous désinscrire.
      </div>

      {/* Modale inscription/désinscription */}
      {assigning && (
        <BenevoleAssignModal
          shifts={shifts}
          posts={posts}
          shiftId={assigning.shiftId}
          postId={assigning.postId}
          postOverride={assigning.postOverride}
          myId={myId}
          eventId={eventId}
          benevsById={benevsById}
          onClose={() => setAssigning(null)}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   GRILLES PAR JOUR — vue identique à l'admin avec mise en évidence
   du bénévole connecté (✓ MOI sur les cellules où il est inscrit)
   ═══════════════════════════════════════════════════════════════ */
function BenevoleDayGrids({ shifts, posts, myId, onCellClick }) {
  // Regroupement par jour
  const byDay = useMemo(() => {
    const m = {}
    shifts.forEach(s => {
      const k = s.date || 'sans-date'
      if (!m[k]) m[k] = []
      m[k].push(s)
    })
    Object.values(m).forEach(arr => arr.sort((a,b) => (a.debut || '').localeCompare(b.debut || '')))
    return m
  }, [shifts])

  const days = Object.keys(byDay).sort()
  const [collapsed, setCollapsed] = useState({})
  const toggle = (day) => setCollapsed(c => ({ ...c, [day]: !c[day] }))

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {days.map(day => {
        const dayShifts = byDay[day]
        const isCollapsed = !!collapsed[day]
        // Compte combien de créneaux de ce jour j'occupe
        let myCount = 0
        dayShifts.forEach(s => {
          const inPost = Object.values(s.postes || {}).some(p => (p.assignments || []).includes(myId))
          const inLibres = (s.libres || []).includes(myId)
          if (inPost || inLibres) myCount++
        })

        return (
          <div key={day} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
            {/* Header jour repliable */}
            <button onClick={() => toggle(day)} style={{
              width:'100%', display:'flex', alignItems:'center', gap:10,
              padding:'12px 14px', background:'var(--bg2)', border:'none',
              borderBottom: isCollapsed ? 'none' : '1px solid var(--border)',
              cursor:'pointer', fontFamily:'var(--font)', textAlign:'left',
              minHeight:'auto', WebkitTapHighlightColor:'transparent',
            }}>
              <span style={{ fontSize:14, color:'var(--muted)', transition:'transform .15s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)' }}>▾</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', textTransform:'uppercase', letterSpacing:'.03em' }}>
                  {fmtDate(day)}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                  {dayShifts.length} créneau{dayShifts.length>1?'x':''}
                </div>
              </div>
              {myCount > 0 && (
                <span style={{ background:'var(--brand)', color:'#fff', fontSize:10, fontWeight:800, padding:'3px 8px', borderRadius:5, display:'inline-flex', alignItems:'center', gap:3, flexShrink:0 }}>
                  <Check size={10}/> {myCount}
                </span>
              )}
            </button>

            {!isCollapsed && (
              <BenevoleDayGrid shifts={dayShifts} posts={posts} myId={myId} onCellClick={onCellClick}/>
            )}
          </div>
        )
      })}
    </div>
  )
}

function BenevoleDayGrid({ shifts, posts, myId, onCellClick }) {
  // Filtre les postes qui ont au moins une cible > 0 sur ce jour
  const visiblePosts = posts.filter(p => shifts.some(s => (s.postes?.[p.id]?.target ?? 0) > 0))

  if (visiblePosts.length === 0) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
        Aucun poste ouvert pour ce jour.
      </div>
    )
  }

  // Helper : choisit une icône selon l'heure de début du créneau
  // (matin / midi / après-midi / soir / nuit)
  const periodInfo = (debut) => {
    const h = parseInt((debut || '0').split(':')[0], 10) || 0
    if (h < 6)  return { label: 'Nuit',         icon: '🌙', color: '#534AB7' }
    if (h < 12) return { label: 'Matin',        icon: '🌅', color: '#BA7517' }
    if (h < 14) return { label: 'Midi',         icon: '☀️', color: '#EF9F27' }
    if (h < 18) return { label: 'Après-midi',   icon: '🌤️', color: '#BA7517' }
    if (h < 22) return { label: 'Soir',         icon: '🌆', color: '#993C1D' }
    return            { label: 'Nuit',         icon: '🌙', color: '#534AB7' }
  }

  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {shifts.map(shift => {
        const period = periodInfo(shift.debut)
        // Postes ouverts pour CE créneau (target > 0)
        const slotPosts = visiblePosts.filter(p => (shift.postes?.[p.id]?.target ?? 0) > 0)
        const libres   = shift.libres || []
        const isMineLibre = libres.includes(myId)

        return (
          <div key={shift.id} style={{
            background: 'var(--bg2)',
            borderRadius: 12,
            padding: '12px 14px',
            border: '0.5px solid var(--border)',
          }}>
            {/* En-tête du créneau */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginBottom: 10, paddingBottom: 8,
              borderBottom: '0.5px solid var(--border)',
            }}>
              <span style={{ fontSize: 18 }}>{period.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                  {shift.label || period.label} · {shift.debut}–{shift.fin}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
                  {slotPosts.length} poste{slotPosts.length > 1 ? 's' : ''} ouvert{slotPosts.length > 1 ? 's' : ''}
                </div>
              </div>
            </div>

            {/* Liste des postes pour ce créneau */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {slotPosts.map(post => {
                const slot = shift.postes?.[post.id] || { target: 0, assignments: [] }
                const target = slot.target ?? 0
                const assigned = slot.assignments || []
                const n = assigned.length
                const isMine = assigned.includes(myId)
                const full = n >= target

                // Détermine le style de la carte poste
                let bg, color, badge
                if (isMine) {
                  bg = 'var(--brand-light)'
                  color = 'var(--brand-dark)'
                  badge = { txt: '✓ Inscrit', bg: 'var(--brand)', color: '#fff' }
                } else if (full) {
                  bg = 'var(--bg3, var(--bg))'
                  color = 'var(--muted)'
                  badge = { txt: 'Complet', bg: 'transparent', color: 'var(--muted)', border: true }
                } else if (n === 0) {
                  bg = 'var(--red-light)'
                  color = 'var(--red-dark)'
                  badge = { txt: `0/${target} ⚠`, bg: 'rgba(255,255,255,0.5)', color: 'var(--red-dark)' }
                } else {
                  bg = 'var(--gold-light)'
                  color = 'var(--gold-dark)'
                  badge = { txt: `${n}/${target}`, bg: 'rgba(255,255,255,0.5)', color: 'var(--gold-dark)' }
                }

                return (
                  <button
                    key={post.id}
                    onClick={() => onCellClick(shift.id, post.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px',
                      background: bg,
                      border: isMine ? '1.5px solid var(--brand)' : '0.5px solid transparent',
                      borderRadius: 10,
                      cursor: 'pointer',
                      fontFamily: 'inherit', textAlign: 'left',
                      minHeight: 44,
                      transition: 'transform .1s, box-shadow .1s',
                      WebkitTapHighlightColor: 'transparent',
                      opacity: full && !isMine ? 0.6 : 1,
                    }}
                    onMouseEnter={e => {
                      if (!isMine) e.currentTarget.style.transform = 'translateX(2px)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'translateX(0)'
                    }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{post.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 600, color,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {post.nom}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                        {isMine
                          ? `${n}/${target} · Vous y êtes`
                          : full
                            ? `${n}/${target} · complet`
                            : `${n}/${target} inscrit${n > 1 ? 's' : ''}`
                        }
                      </div>
                    </div>
                    {/* Bouton d'action explicite — visible et tactile */}
                    {/* Note : c'est un <span> volontairement (pas <button>) car la carte entière
                        est déjà un bouton. Un button imbriqué dans button casserait l'HTML. */}
                    {isMine ? (
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        padding: '5px 11px',
                        borderRadius: 999,
                        background: 'transparent',
                        color: 'var(--red-dark)',
                        border: '0.5px solid var(--red)',
                        whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        Quitter
                      </span>
                    ) : full ? (
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        padding: '5px 12px',
                        borderRadius: 999,
                        background: 'transparent',
                        color: 'var(--muted)',
                        border: '0.5px solid var(--border2)',
                        whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        Complet
                      </span>
                    ) : (
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        padding: '5px 12px',
                        borderRadius: 999,
                        background: 'var(--brand)',
                        color: '#fff',
                        whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        S'inscrire
                      </span>
                    )}
                  </button>
                )
              })}

              {/* Polyvalent — toujours présent */}
              <button
                onClick={() => onCellClick(shift.id, '__free__', { id: '__free__', nom: 'Polyvalent', emoji: '🆓' })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px',
                  background: isMineLibre ? 'var(--brand-light)' : 'var(--bg)',
                  border: isMineLibre ? '1.5px solid var(--brand)' : '0.5px dashed var(--border)',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontFamily: 'inherit', textAlign: 'left',
                  minHeight: 44,
                  WebkitTapHighlightColor: 'transparent',
                }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>🆓</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600,
                    color: isMineLibre ? 'var(--brand-dark)' : 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    Polyvalent
                  </div>
                  <div style={{
                    fontSize: 10,
                    color: isMineLibre ? 'var(--brand-dark)' : 'var(--muted)',
                    opacity: 0.85, marginTop: 1,
                  }}>
                    Disponible sur tous les postes
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  padding: '5px 12px',
                  borderRadius: 999,
                  background: isMineLibre ? 'transparent' : 'var(--brand)',
                  color: isMineLibre ? 'var(--red-dark)' : '#fff',
                  border: isMineLibre ? '0.5px solid var(--red)' : 'none',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {isMineLibre ? 'Quitter' : "S'inscrire"}
                </span>
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MODALE INSCRIPTION/DÉSINSCRIPTION — bottom sheet
   ═══════════════════════════════════════════════════════════════ */
function BenevoleAssignModal({ shifts, posts, shiftId, postId, postOverride, myId, eventId, benevsById, onClose, onError }) {
  const [busy, setBusy] = useState(false)

  // Lecture en direct du shift (pas figé)
  const shift = shifts.find(s => s.id === shiftId)
  const post = postOverride || posts.find(p => p.id === postId)
  if (!shift || !post) return null

  const isFreeMode = post.id === '__free__'
  const assigned = isFreeMode ? (shift.libres || []) : (shift.postes?.[post.id]?.assignments || [])
  const target = isFreeMode ? null : (shift.postes?.[post.id]?.target ?? 0)
  const iAmHere = assigned.includes(myId)

  // Mes affectations actuelles sur ce shift (autres postes)
  const myCurrentPostId = useMemo(() => {
    const found = Object.entries(shift.postes || {}).find(([, p]) => (p.assignments || []).includes(myId))
    if (found) return found[0]
    if ((shift.libres || []).includes(myId)) return '__free__'
    return null
  }, [shift, myId])

  const handleAction = async (action) => {
    if (!myId) {
      onError?.('Compte non identifié — rechargez la page.')
      return
    }
    setBusy(true)
    try {
      // action = 'join' (s'inscrire ici) | 'leave' (se désinscrire)
      const target = action === 'leave' ? '__remove__' : post.id
      await assignBenevoleToPost(shift.id, myId, target, eventId)
      onClose()
    } catch (e) {
      console.warn(e)
      onError?.('Impossible de mettre à jour. Réessayez.')
    }
    setBusy(false)
  }

  // Noms des autres affectés (pas moi)
  const otherNames = assigned.filter(id => id !== myId).map(id => benevsById[id]).filter(Boolean)
  const full = target !== null && assigned.length >= target

  // Rendu via createPortal pour échapper au contexte de PageTransition
  // (qui a will-change:transform sur son wrapper, ce qui transforme position:fixed
  //  en absolute par rapport au parent — cause de modale mal centrée).
  return createPortal(
    <div onClick={onClose}
      style={{
        position:'fixed', inset:0, zIndex:300,
        background:'rgba(0,0,0,.55)',
        display:'flex',
        // Centrée verticalement et horizontalement (au lieu de collée en bas)
        alignItems:'center', justifyContent:'center',
        // Padding pour ne pas que la modale touche les bords sur petit écran
        padding: 16,
        // Animation fade-in de l'overlay
        animation: 'ycFadeIn .18s ease-out',
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          background:'var(--bg)',
          // Coins arrondis sur TOUS les côtés (carte centrale, pas bottom sheet)
          borderRadius:'var(--radius-xl, 16px)',
          width:'100%',
          // Largeur max plus restreinte pour un effet "carte centrale" sur desktop
          maxWidth:420,
          maxHeight:'85vh',
          display:'flex', flexDirection:'column',
          border:'1px solid var(--border)',
          // Ombre douce tout autour pour décoller du fond
          boxShadow:'0 16px 48px rgba(0,0,0,0.25)',
          // Animation de scale-up légère (vs slide-up)
          animation: 'ycScaleIn .22s cubic-bezier(.2,.8,.2,1)',
        }}>
        {/* Header */}
        <div style={{ padding:'16px 18px 14px', borderBottom:'1px solid var(--border)', flexShrink:0, display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
          <div style={{ minWidth:0, flex:1 }}>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:3 }}>
              {fmtDate(shift.date)} · {shift.debut} → {shift.fin}{shift.label ? ' · ' + shift.label : ''}
            </div>
            <div style={{ fontSize:17, fontWeight:700, color:'var(--text)', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontSize:22 }}>{post.emoji}</span>
              <span style={{ minWidth:0, overflow:'hidden', textOverflow:'ellipsis' }}>{post.nom}</span>
              {target !== null && (
                <span style={{ fontSize:12, color: full ? 'var(--red-dark)' : 'var(--muted)', fontWeight:500 }}>
                  · {assigned.length} / {target}
                </span>
              )}
            </div>
          </div>
          {/* Bouton fermer en croix */}
          <button onClick={onClose}
            aria-label="Fermer"
            style={{
              background: 'transparent', border: 'none', padding: 4, cursor: 'pointer',
              color: 'var(--muted)', flexShrink: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 6,
            }}>
            <X size={18}/>
          </button>
        </div>

        {/* Body : liste des affectés + actions */}
        <div style={{ padding:'14px 18px', overflowY:'auto', flex:1 }}>
          {/* Affichage de mon statut sur ce créneau (autre poste éventuel) */}
          {myCurrentPostId && myCurrentPostId !== post.id && (
            <div className="alert alert-warning" style={{ marginBottom:14 }}>
              ⚠ Vous êtes déjà inscrit à un autre poste sur ce créneau ({
                myCurrentPostId === '__free__'
                  ? 'Polyvalent'
                  : (posts.find(p => p.id === myCurrentPostId)?.nom || 'autre poste')
              }). Rejoindre ici vous désinscrira automatiquement de l'autre.
            </div>
          )}

          <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>
            {assigned.length === 0 ? 'Personne pour le moment' : `${assigned.length} inscrit${assigned.length>1?'s':''}`}
          </div>

          {assigned.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:14 }}>
              {/* Moi en premier si présent */}
              {iAmHere && (
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px 10px 14px', background:'var(--brand-light)', border:'1.5px solid var(--brand)', borderRadius:8, minHeight:44 }}>
                  <Check size={16} style={{ color:'var(--brand-dark)', flexShrink:0 }}/>
                  <span style={{ flex:1, fontSize:14, color:'var(--brand-dark)', fontWeight:700 }}>Vous</span>
                </div>
              )}
              {/* Autres */}
              {otherNames.map(b => (
                <div key={b.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px 10px 14px', background:'var(--bg2)', borderRadius:8, minHeight:44 }}>
                  <Users size={14} style={{ color:'var(--muted)', flexShrink:0 }}/>
                  <span style={{ flex:1, fontSize:14, color:'var(--text)', fontWeight:600, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {b.prenom} {b.nom}
                  </span>
                  {b.poste && <span style={{ fontSize:10, color:'var(--muted)', flexShrink:0 }}>{b.poste}</span>}
                </div>
              ))}
            </div>
          )}

          {/* État disponibilité */}
          {!iAmHere && full && (
            <div className="alert alert-error" style={{ marginBottom:8 }}>
              Ce poste est complet. Désistez-vous d'un autre créneau ou choisissez un autre poste.
            </div>
          )}

          {/* Message d'engagement avant inscription */}
          {!iAmHere && !full && (
            <div style={{
              background: 'var(--brand-light)',
              border: '0.5px solid var(--brand)',
              borderRadius: 8,
              padding: '10px 12px',
              marginTop: 4,
              fontSize: 12,
              color: 'var(--brand-dark)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}>
              <span style={{ fontSize: 14, lineHeight: 1, marginTop: 1 }}>ℹ️</span>
              <span>
                En vous inscrivant, vous vous engagez à être présent sur ce créneau.
              </span>
            </div>
          )}
        </div>

        {/* Footer : actions */}
        <div style={{ padding:'12px 18px max(env(safe-area-inset-bottom), 14px)', borderTop:'1px solid var(--border)', flexShrink:0, background:'var(--bg)', display:'flex', gap:8 }}>
          {iAmHere ? (
            <>
              <button onClick={onClose} className="btn-secondary" style={{ flex:1, minHeight:44 }}>Fermer</button>
              <button onClick={() => handleAction('leave')} disabled={busy} className="btn-danger" style={{ flex:1, minHeight:44 }}>
                <X size={14}/> Se désinscrire
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="btn-secondary" style={{ flex:1, minHeight:44 }}>Annuler</button>
              <button onClick={() => handleAction('join')} disabled={busy || (target !== null && full)} className="btn-primary" style={{ flex:1, minHeight:44 }}>
                <Check size={14}/> {busy ? 'Inscription…' : 'Confirmer'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
