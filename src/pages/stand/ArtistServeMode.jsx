/**
 * pages/stand/ArtistServeMode.jsx — v6
 * Mode "Servir un artiste" dans Debit.
 * - Scanner QR ou recherche par nom
 * - Affiche les droits restants
 * - Permet de servir un article éligible (décrément automatique)
 */
import React, { useState, useEffect, useMemo } from 'react'
import { db } from '../../firebase/config'
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore'
import { serveArtistItem, watchArtistReservations, servirReservationArtiste } from '../../firebase/service'
import QrScanner from '../../components/QrScanner'
import { Search, X, Clock, MapPin, CheckCircle, AlertCircle, Bell } from 'lucide-react'

const TYPES = {
  musical:           { icon: '🎵', color: '#1a6b7a' },
  litteraire:        { icon: '📚', color: '#534AB7' },
  cinematographique: { icon: '🎬', color: '#BA7517' },
  autre:             { icon: '🎭', color: '#6b6b6b' },
}

function fmtHour(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

function isSameDay(a, b) {
  if (!a || !b) return false
  const da = a?.toDate ? a.toDate() : new Date(a)
  const db = b?.toDate ? b.toDate() : new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

export default function ArtistServeMode({ eventId, menu, staffNom, staffId }) {
  const [creneau, setCreneau]           = useState(null)
  const [consumptions, setConsumptions] = useState([])
  const [planning, setPlanning]         = useState([])
  const [searchQuery, setSearchQuery]   = useState('')
  const [err, setErr]                   = useState('')
  const [feedback, setFeedback]         = useState('')
  const [loading, setLoading]           = useState(false)
  const [forceServeAnyDay, setForceServeAnyDay] = useState(false)
  const [pendingResas, setPendingResas] = useState([])

  // Charger toute la liste des créneaux pour recherche
  useEffect(() => {
    if (!eventId) return
    const col = collection(db, 'events', eventId, 'planning')
    const unsub = onSnapshot(col, snap => {
      setPlanning(snap.docs.map(d => ({ ...d.data(), id: d.id })))
    })
    return unsub
  }, [eventId])

  // Écouter les réservations artistes en attente
  useEffect(() => {
    if (!eventId) return
    const unsub = watchArtistReservations(list => {
      const pending = list.filter(r => r.statut === 'pending')
      pending.sort((a, b) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0
        return ta - tb
      })
      setPendingResas(pending)
    }, eventId)
    return unsub
  }, [eventId])

  // Écouter les consommations du créneau sélectionné
  useEffect(() => {
    if (!eventId || !creneau?.id) { setConsumptions([]); return }
    const col = collection(db, 'events', eventId, 'artist-consumptions')
    const q   = query(col, where('creneauId', '==', creneau.id))
    const unsub = onSnapshot(q, snap => {
      setConsumptions(snap.docs.map(d => ({ ...d.data(), id: d.id })))
    })
    return unsub
  }, [eventId, creneau?.id])

  // Écouter le créneau lui-même en temps réel (modif admin → mise à jour live)
  useEffect(() => {
    if (!eventId || !creneau?.id) return
    const refDoc = doc(db, 'events', eventId, 'planning', creneau.id)
    const unsub  = onSnapshot(refDoc, snap => {
      if (snap.exists()) {
        setCreneau(prev => prev && prev.id === snap.id ? { ...snap.data(), id: snap.id } : prev)
      }
    })
    return unsub
  }, [eventId, creneau?.id])

  // Décoder le QR : JSON {ev, cr, type:'artiste'} OU directement un creneauId
  const handleScan = async (raw) => {
    setErr(''); setFeedback('')
    let crId = null
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.type === 'artiste' && parsed?.cr) crId = parsed.cr
    } catch {
      // Pas du JSON — peut-être directement un ID
      crId = raw.trim()
    }
    if (!crId) { setErr('QR invalide'); return }
    // On recherche dans le planning déjà chargé (temps réel) — pas besoin de getDoc
    const found = planning.find(p => p.id === crId)
    if (found) {
      setCreneau(found)
    } else {
      // Fallback : si pas encore chargé dans le store local, fetch direct
      try {
        const refDoc = doc(db, 'events', eventId, 'planning', crId)
        const snap   = await getDoc(refDoc)
        if (!snap.exists()) {
          setErr('Créneau introuvable : ' + crId)
          return
        }
        setCreneau({ ...snap.data(), id: snap.id })
      } catch (e) {
        setErr('Erreur : ' + e.message)
      }
    }
  }

  // Résultats de recherche par nom
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase().trim()
    return planning.filter(p =>
      (p.artiste || '').toLowerCase().includes(q) ||
      (p.titre   || '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [searchQuery, planning])

  // Calculs droits
  const av = creneau?.avantages || { drinks: 0, meals: 0, eaux: 0, drinkIds: [], mealIds: [], eauIds: [] }
  const consDrinks = consumptions.filter(c => c.type === 'drink').length
  const consMeals  = consumptions.filter(c => c.type === 'meal').length
  const consEaux   = consumptions.filter(c => c.type === 'eau').length
  const remainDrinks = Math.max(0, (av.drinks || 0) - consDrinks)
  const remainMeals  = Math.max(0, (av.meals  || 0) - consMeals)
  const remainEaux   = Math.max(0, (av.eaux   || 0) - consEaux)

  // Articles éligibles disponibles (filtrés par menu et compteurs restants)
  const eligibleArticles = useMemo(() => {
    if (!creneau) return []
    const out = []
    if (remainDrinks > 0) {
      (av.drinkIds || []).forEach(id => {
        const a = menu.find(m => m.id === id)
        if (a) out.push({ ...a, _type: 'drink', _typeIcon: '☕' })
      })
    }
    if (remainMeals > 0) {
      (av.mealIds || []).forEach(id => {
        const a = menu.find(m => m.id === id)
        if (a) out.push({ ...a, _type: 'meal', _typeIcon: '🍽' })
      })
    }
    if (remainEaux > 0) {
      (av.eauIds || []).forEach(id => {
        const a = menu.find(m => m.id === id)
        if (a) out.push({ ...a, _type: 'eau', _typeIcon: '💧' })
      })
    }
    return out
  }, [creneau, menu, av, remainDrinks, remainMeals, remainEaux])

  const handleServeResa = async (resa) => {
    setLoading(true); setErr(''); setFeedback('')
    try {
      await servirReservationArtiste(resa, staffNom, staffId, eventId)
      setFeedback('✓ Réservation servie : ' + resa.artisteNom)
      setTimeout(() => setFeedback(''), 3000)
    } catch (e) {
      setErr('Erreur : ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleServe = async (article) => {
    if (!creneau) return
    setLoading(true); setErr(''); setFeedback('')
    try {
      await serveArtistItem(creneau, article, article._type, staffNom, staffId, eventId)
      setFeedback('✓ ' + article.nom + ' servi à ' + creneau.artiste)
      setTimeout(() => setFeedback(''), 3000)
    } catch (e) {
      setErr('Erreur : ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setCreneau(null)
    setSearchQuery('')
    setErr('')
    setFeedback('')
    setForceServeAnyDay(false)
  }

  // Vérification du jour
  const today = new Date()
  const isToday = creneau ? isSameDay(creneau.debut, today) : true
  const canServe = isToday || forceServeAnyDay
  const isAnnule = creneau?.statut === 'annule'
  const ti       = creneau ? (TYPES[creneau.type] || TYPES.autre) : null

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {!creneau ? (
        // ── Aucun artiste sélectionné : scan ou recherche ──
        <>
          {/* Réservations en attente */}
          {pendingResas.length > 0 && (
            <div style={{ background:'#FAEEDA', border:'1.5px solid #BA7517', borderRadius:14, padding:14 }}>
              <div style={{ fontSize:13, fontWeight:800, color:'#854F0B', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                <Bell size={14}/> {pendingResas.length} réservation{pendingResas.length > 1 ? 's' : ''} artiste en attente
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {pendingResas.map(r => {
                  const itemsLabel = (r.items || []).map(i => {
                    const ic = i.type === 'drink' ? '☕' : i.type === 'meal' ? '🍽' : '💧'
                    return ic + ' ' + i.nom
                  }).join(', ')
                  return (
                    <div key={r.id} style={{ background:'var(--bg)', borderRadius:10, padding:'10px 12px', display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.artisteNom || '—'}</div>
                        <div style={{ fontSize:11, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{itemsLabel}</div>
                      </div>
                      <button onClick={() => handleServeResa(r)} disabled={loading}
                        style={{ padding:'8px 12px', background:'#065f46', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor: loading ? 'wait' : 'pointer', fontFamily:'var(--font)', whiteSpace:'nowrap' }}>
                        ✓ Servir
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:14, padding:16 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:10 }}>Scanner le QR de l'artiste</div>
            <QrScanner onScan={handleScan}/>
          </div>

          <div style={{ background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:14, padding:16 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:10 }}>Ou rechercher par nom</div>
            <div style={{ position:'relative' }}>
              <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }}/>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Nom de l'artiste..."
                style={{ width:'100%', minWidth:0, boxSizing:'border-box', minHeight:40, padding:'0 10px 0 32px', border:'1px solid var(--border)', borderRadius:10, fontSize:13, background:'var(--bg2)', color:'var(--text)', outline:'none', fontFamily:'var(--font)' }}/>
            </div>
            {searchResults.length > 0 && (
              <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:6, maxHeight:'40vh', overflowY:'auto' }}>
                {searchResults.map(cr => {
                  const ct = TYPES[cr.type] || TYPES.autre
                  return (
                    <button key={cr.id} onClick={() => { setCreneau(cr); setSearchQuery('') }}
                      style={{ padding:'10px 12px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, textAlign:'left', cursor:'pointer', fontFamily:'var(--font)', display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:22 }}>{ct.icon}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{cr.artiste}</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>
                          {fmtDate(cr.debut)} · {fmtHour(cr.debut)} {cr.scene && '· ' + cr.scene}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            {searchQuery && searchResults.length === 0 && (
              <div style={{ marginTop:8, padding:'10px', color:'var(--muted)', fontSize:13, textAlign:'center' }}>
                Aucun artiste trouvé.
              </div>
            )}
          </div>

          {err && (
            <div style={{ padding:'10px 14px', background:'#FCEBEB', color:'#A32D2D', borderRadius:8, fontSize:13, fontWeight:600 }}>
              <AlertCircle size={14} style={{ verticalAlign:-2, marginRight:6 }}/>
              {err}
            </div>
          )}
        </>
      ) : (
        // ── Artiste sélectionné : fiche + actions ──
        <>
          <div style={{ background: ti.color + '22', border:'1.5px solid ' + ti.color, borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:54, height:54, borderRadius:12, overflow:'hidden', flexShrink:0, background:'rgba(255,255,255,.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>
              {creneau.photo
                ? <img src={creneau.photo} alt={creneau.artiste} style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition: creneau.photoPosition || 'center center' }}/>
                : ti.icon
              }
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:16, fontWeight:800, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{creneau.artiste}</div>
              <div style={{ fontSize:11, color:'var(--muted)', display:'flex', gap:8, flexWrap:'wrap', marginTop:2 }}>
                <span><Clock size={11} style={{ verticalAlign:-1 }}/> {fmtDate(creneau.debut)} · {fmtHour(creneau.debut)}</span>
                {creneau.scene && <span><MapPin size={11} style={{ verticalAlign:-1 }}/> {creneau.scene}</span>}
              </div>
            </div>
            <button onClick={reset}
              style={{ background:'rgba(255,255,255,.5)', border:'none', borderRadius:8, width:30, height:30, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)' }}>
              <X size={14}/>
            </button>
          </div>

          {/* Alertes : annulé, mauvais jour */}
          {isAnnule && (
            <div style={{ padding:'10px 14px', background:'#FCEBEB', color:'#A32D2D', borderRadius:10, fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:8 }}>
              <AlertCircle size={16}/> Ce créneau est annulé — service non recommandé.
            </div>
          )}
          {!isToday && !forceServeAnyDay && (
            <div style={{ padding:'10px 14px', background:'#FAEEDA', color:'#854F0B', borderRadius:10, fontSize:13, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <AlertCircle size={16}/>
              <span style={{ flex:1 }}>Ce créneau n'est pas aujourd'hui ({fmtDate(creneau.debut)}). Les avantages sont normalement valables seulement le jour du créneau.</span>
              <button onClick={() => setForceServeAnyDay(true)}
                style={{ padding:'4px 10px', background:'#854F0B', color:'#fff', border:'none', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'var(--font)' }}>
                Forcer
              </button>
            </div>
          )}

          {/* Compteurs droits */}
          <div style={{ background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:12, padding:'12px 14px', display:'flex', gap:10, flexWrap:'wrap', justifyContent:'space-around' }}>
            <DroitMini icon="☕" label="Boissons" remain={remainDrinks} total={av.drinks || 0}/>
            <DroitMini icon="🍽" label="Repas"    remain={remainMeals}  total={av.meals  || 0}/>
            <DroitMini icon="💧" label="Eau"      remain={remainEaux}   total={av.eaux   || 0}/>
          </div>

          {/* Feedback */}
          {feedback && (
            <div style={{ padding:'10px 14px', background:'#d1fae5', color:'#065f46', borderRadius:10, fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:8 }}>
              <CheckCircle size={16}/> {feedback}
            </div>
          )}
          {err && (
            <div style={{ padding:'10px 14px', background:'#FCEBEB', color:'#A32D2D', borderRadius:8, fontSize:13, fontWeight:600 }}>
              <AlertCircle size={14} style={{ verticalAlign:-2, marginRight:6 }}/>
              {err}
            </div>
          )}

          {/* Articles éligibles à servir */}
          <div style={{ background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:14, padding:14 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase' }}>
              Articles disponibles ({eligibleArticles.length})
            </div>
            {!canServe ? (
              <div style={{ textAlign:'center', padding:'20px', color:'var(--muted)', fontSize:13 }}>
                Le service est bloqué (mauvais jour).
              </div>
            ) : eligibleArticles.length === 0 ? (
              <div style={{ textAlign:'center', padding:'20px', color:'var(--muted)', fontSize:13 }}>
                {av.drinks + av.meals + av.eaux === 0
                  ? 'Aucun avantage configuré pour cet artiste.'
                  : 'Tous les avantages ont été utilisés ✓'}
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))', gap:10 }}>
                {eligibleArticles.map(a => (
                  <button key={a.id + '-' + a._type} onClick={() => handleServe(a)} disabled={loading}
                    style={{ padding:'12px 10px', background:'var(--bg2)', border:'1.5px solid var(--border)', borderRadius:12, cursor: loading ? 'wait' : 'pointer', fontFamily:'var(--font)', textAlign:'center', opacity: loading ? 0.6 : 1 }}>
                    <div style={{ fontSize:24, marginBottom:6 }}>{a._typeIcon}</div>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.nom}</div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>Gratuit</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Historique récent */}
          {consumptions.length > 0 && (
            <div style={{ background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:14, padding:14 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', marginBottom:8, textTransform:'uppercase' }}>
                Déjà servi ({consumptions.length})
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {consumptions.map(c => {
                  const icon = c.type === 'drink' ? '☕' : c.type === 'meal' ? '🍽' : '💧'
                  return (
                    <div key={c.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:'var(--bg2)', borderRadius:8, fontSize:12 }}>
                      <span style={{ fontSize:16 }}>{icon}</span>
                      <span style={{ flex:1, color:'var(--text)' }}>{c.articleNom}</span>
                      <span style={{ color:'var(--muted)', fontSize:11 }}>
                        {fmtHour(c.servedAt)} · {c.servedBy?.name || '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DroitMini({ icon, label, remain, total }) {
  if (total === 0) {
    return (
      <div style={{ textAlign:'center', opacity:.4 }}>
        <div style={{ fontSize:20 }}>{icon}</div>
        <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{label}</div>
        <div style={{ fontSize:11, color:'var(--muted)', fontWeight:700 }}>—</div>
      </div>
    )
  }
  const allConsumed = remain === 0
  return (
    <div style={{ textAlign:'center' }}>
      <div style={{ fontSize:20 }}>{icon}</div>
      <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{label}</div>
      <div style={{ fontSize:13, fontWeight:800, color: allConsumed ? '#A32D2D' : 'var(--brand)' }}>
        {remain}/{total}
      </div>
    </div>
  )
}
