/**
 * pages/public/SoldePage.jsx — v4
 * Espace spectateur responsive mobile-first
 * Onglets : Accueil | Historique | Réserver | Mes résa
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'qrcode'
import { Search, Wallet, Clock, Bookmark, LayoutList, BarChart2, CalendarDays } from 'lucide-react'
import { db } from '../../firebase/config'
import { getSettings } from '../../firebase/service'
import {
  collection, query, where, getDocs, addDoc, onSnapshot,
  updateDoc, doc, getDoc, serverTimestamp, runTransaction, orderBy, increment
} from 'firebase/firestore'
import { fmt, nowStr } from '../../utils/helpers'
import { useNotifications } from '../../hooks/useNotifications'
import NotifBell from '../../components/NotifBell'
import ThemeToggle from '../../components/ThemeToggle'
import { useTheme } from '../../hooks/useTheme'
import { APP_FULL_LABEL } from '../../utils/buildInfo'
import CheckUpdateButton from '../../components/CheckUpdateButton'
import PageTransition from '../../components/PageTransition'

const BRAND   = '#1a6b7a'  // défaut — remplacé dynamiquement par themeColor
const BRAND_L = '#E1F5EE'
const BRAND_D = '#0d4f5c'
const AMBER   = '#BA7517'
const AMBER_L = '#FAEEDA'
const RED     = '#A32D2D'
const RED_L   = '#FCEBEB'
const GREEN   = '#065f46'
const GREEN_L = '#d1fae5'
const PURPLE  = '#534AB7'
const PURPLE_L= '#EDE9FE'
const PAGE_SIZE = 15

let _rc = 300
const resaCode = (id) => { _rc++; return id.replace('FY-','') + '-' + String(_rc).padStart(2,'0') }

// Icône et couleur selon le type de transaction
function txStyle(type) {
  if (type === 'credit')      return { icon:'💳', bg:GREEN_L,   color:GREEN,  sign:'+' }
  if (type === 'reservation') return { icon:'⏳', bg:AMBER_L,   color:AMBER,  sign:''  }
  if (type === 'annulation')  return { icon:'↩️', bg:'#f1f5f9', color:'#64748b', sign:'' }
  if (type === 'debit')       return { icon:'🛒', bg:RED_L,     color:RED,    sign:'−' }
  return                             { icon:'💰', bg:BRAND_L,   color:BRAND_D, sign:'' }
}



// ── Composant planning espace spectateur ──────────────────────────────
const TYPES_SPEC = {
  musical:           { icon: '🎵', label: 'Musical',    color: '#1a6b7a' },
  litteraire:        { icon: '📚', label: 'Littéraire', color: '#534AB7' },
  cinematographique: { icon: '🎬', label: 'Cinéma',     color: '#BA7517' },
  autre:             { icon: '🎭', label: 'Autre',       color: '#6b6b6b' },
}

function countdownSpec(ts, now) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  const diff = Math.max(0, Math.round((d.getTime() - now) / 1000))
  if (isNaN(diff) || diff < 0) return ''
  if (diff === 0) return 'Maintenant'
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  if (h > 0) return 'Dans ' + h + 'h' + String(m).padStart(2, '0')
  if (m > 0) return 'Dans ' + m + 'min'
  return 'Dans ' + diff + 's'
}

function dureeRestanteSpec(fin, now) {
  if (!fin) return ''
  const f = fin.toDate ? fin.toDate() : new Date(fin)
  const diff = Math.max(0, Math.round((f.getTime() - now) / 1000))
  if (isNaN(diff)) return ''
  if (diff === 0) return 'Termine maintenant'
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  if (h > 0) return 'Encore ' + h + 'h' + String(m).padStart(2, '0')
  return 'Encore ' + m + 'min'
}

function autoStatutSpec(cr) {
  if (cr.statut === 'annule') return 'annule'
  const now = Date.now()
  const d = cr.debut?.toDate ? cr.debut.toDate().getTime() : cr.debut ? new Date(cr.debut).getTime() : NaN
  const f = cr.fin?.toDate   ? cr.fin.toDate().getTime()   : cr.fin   ? new Date(cr.fin).getTime()   : NaN
  // Si dates invalides, se fier au statut Firestore
  if (isNaN(d) || isNaN(f)) return cr.statut || 'a-venir'
  if (now < d) return 'a-venir'
  if (now >= d && now <= f) return 'en-cours'
  return 'termine'
}

function fmt2Spec(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// ── Carte artiste spectateur ──────────────────────────────────────────
function CarteArtisteSpec({ cr, onClose, isFav, onToggleFav, themeColor }) {
  const ti = TYPES_SPEC[cr.type] || TYPES_SPEC.autre
  const [mapLoaded, setMapLoaded] = React.useState(false)
  const [now, setNow] = React.useState(Date.now())
  const hasLocation = cr.latitude && cr.longitude

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const st      = autoStatutSpec(cr)
  const timer   = st === 'en-cours' ? dureeRestanteSpec(cr.fin, now) : st === 'a-venir' ? countdownSpec(cr.debut, now) : ''

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()}
      style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,.65)', display:'flex', alignItems:'flex-end', justifyContent:'center', padding:0 }}>
      <div style={{ background:'var(--bg)', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:460, maxHeight:'90vh', overflowY:'auto' }}>

        {/* Photo ou header coloré */}
        {cr.photo ? (
          <div style={{ height:220, position:'relative', flexShrink:0 }}>
            <img loading="lazy" src={cr.photo} alt={cr.artiste} style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition: cr.photoPosition || 'center center' }}/>
            <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top,rgba(0,0,0,.65) 0%,transparent 55%)' }}/>
            <button onClick={onClose} style={{ position:'absolute', top:12, right:12, width:34, height:34, borderRadius:'50%', background:'rgba(0,0,0,.4)', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>✕</button>
            {/* Bouton favori */}
            <button onClick={e=>{e.stopPropagation();onToggleFav(cr.id)}}
              style={{ position:'absolute', top:12, left:12, width:34, height:34, borderRadius:'50%', background:'rgba(0,0,0,.4)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>
              {isFav ? '❤️' : '🤍'}
            </button>
            <div style={{ position:'absolute', bottom:14, left:16, right:60 }}>
              <div style={{ fontSize:22, fontWeight:800, color:'#fff', lineHeight:1.2 }}>{cr.artiste}</div>
              {cr.titre && <div style={{ fontSize:13, color:'rgba(255,255,255,.85)', marginTop:3 }}>{cr.titre}</div>}
            </div>
          </div>
        ) : (
          <div style={{ background:ti.color, padding:'20px 20px 18px', position:'relative', borderRadius:'20px 20px 0 0' }}>
            <button onClick={onClose} style={{ position:'absolute', top:12, right:12, width:34, height:34, borderRadius:'50%', background:'rgba(255,255,255,.2)', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>✕</button>
            <button onClick={e=>{e.stopPropagation();onToggleFav(cr.id)}}
              style={{ position:'absolute', top:12, left:12, width:34, height:34, borderRadius:'50%', background:'rgba(255,255,255,.2)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>
              {isFav ? '❤️' : '🤍'}
            </button>
            <div style={{ fontSize:32, marginBottom:8 }}>{ti.icon}</div>
            <div style={{ fontSize:22, fontWeight:800, color:'#fff' }}>{cr.artiste}</div>
            {cr.titre && <div style={{ fontSize:13, color:'rgba(255,255,255,.8)', marginTop:3 }}>{cr.titre}</div>}
          </div>
        )}

        {/* Contenu */}
        <div style={{ padding:'16px 20px 28px' }}>
          {/* Méta */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14 }}>
            <span style={{ fontSize:12, fontWeight:700, padding:'4px 12px', borderRadius:20, background:ti.color+'22', color:ti.color }}>{ti.icon} {ti.label}</span>
            <span style={{ fontSize:12, color:'var(--muted)', display:'flex', alignItems:'center', gap:4 }}>🕐 {fmt2Spec(cr.debut)} → {fmt2Spec(cr.fin)}</span>
            {cr.scene && <span style={{ fontSize:12, color:'var(--muted)', display:'flex', alignItems:'center', gap:4 }}>📍 {cr.scene}</span>}
            {/* Badges statut + timer */}
            {st === 'en-cours' && <span style={{ fontSize:10, fontWeight:800, padding:'3px 9px', borderRadius:10, background:'#d1fae5', color:'#065f46' }}>▶ EN COURS</span>}
            {st === 'en-cours' && timer && <span style={{ fontSize:11, color:'#065f46', fontWeight:700 }}>{timer}</span>}
            {st === 'a-venir' && cr.statut !== 'annule' && timer && <span style={{ fontSize:10, fontWeight:800, padding:'3px 9px', borderRadius:10, background:(themeColor||'#1a6b7a')+'22', color:themeColor||'#1a6b7a' }}>⏳ {timer}</span>}
            {st === 'termine' && cr.statut !== 'annule' && <span style={{ fontSize:10, fontWeight:600, padding:'3px 9px', borderRadius:10, background:'var(--bg2)', color:'var(--muted)' }}>Terminé</span>}
            {cr.statut === 'annule' && <span style={{ fontSize:10, fontWeight:800, padding:'3px 9px', borderRadius:10, background:'#FCEBEB', color:'#A32D2D' }}>ANNULÉ</span>}
          </div>

          {/* Bio */}
          {cr.bio && <p style={{ fontSize:14, color:'var(--text)', lineHeight:1.75, marginBottom:12 }}>{cr.bio}</p>}
          {cr.description && <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, marginBottom:14 }}>{cr.description}</p>}

          {/* Liens */}
          {cr.liens && Object.entries(cr.liens).some(([,v])=>v) && (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
              {Object.entries(cr.liens).filter(([,v])=>v).map(([k,v])=>(
                <a key={k} href={v} target="_blank" rel="noreferrer"
                  style={{ fontSize:12, fontWeight:700, padding:'6px 14px', borderRadius:10, background:'var(--bg2)', border:'0.5px solid var(--border)', color:'#1a6b7a', textDecoration:'none', textTransform:'capitalize' }}>
                  {k} ↗
                </a>
              ))}
            </div>
          )}

          {/* Partager + Agenda */}
          <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
            <button onClick={() => {
              const text = cr.artiste + (cr.titre ? ' — ' + cr.titre : '') + '\n🕐 ' + fmt2Spec(cr.debut) + (cr.scene ? ' · 📍 ' + cr.scene : '')
              if (navigator.share) {
                navigator.share({ title: cr.artiste, text, url: window.location.href }).catch(() => {})
              } else {
                navigator.clipboard?.writeText(text + '\n' + window.location.href).then(() => alert('Lien copié !')).catch(() => {})
              }
            }}
              style={{ flex:'1 1 140px', display:'flex', alignItems:'center', gap:6, padding:'8px 12px', background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:10, fontSize:13, fontWeight:600, color:'var(--text)', cursor:'pointer', fontFamily:'system-ui', justifyContent:'center' }}>
              📤 Partager
            </button>
            <button onClick={() => {
              const fmtDate = (d) => {
                const dt = d?.toDate ? d.toDate() : new Date(d)
                return dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
              }
              const uid = (cr.id || Date.now()) + '@yllacash'
              const ics = [
                'BEGIN:VCALENDAR',
                'VERSION:2.0',
                'PRODID:-//YllaCash//Planning//FR',
                'BEGIN:VEVENT',
                'UID:' + uid,
                'DTSTAMP:' + fmtDate(new Date()),
                'DTSTART:' + fmtDate(cr.debut),
                'DTEND:' + fmtDate(cr.fin),
                'SUMMARY:' + (cr.artiste + (cr.titre ? ' — ' + cr.titre : '')),
                cr.scene ? 'LOCATION:' + cr.scene : '',
                cr.bio ? 'DESCRIPTION:' + cr.bio.replace(/\n/g, '\\n') : '',
                'END:VEVENT',
                'END:VCALENDAR'
              ].filter(Boolean).join('\r\n')
              const blob = new Blob([ics], { type: 'text/calendar' })
              const url  = URL.createObjectURL(blob)
              const a    = document.createElement('a')
              a.href = url
              a.download = (cr.artiste || 'evenement').replace(/[^a-z0-9]/gi,'_') + '.ics'
              document.body.appendChild(a)
              a.click()
              document.body.removeChild(a)
              URL.revokeObjectURL(url)
            }}
              style={{ flex:'1 1 140px', display:'flex', alignItems:'center', gap:6, padding:'8px 12px', background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:10, fontSize:13, fontWeight:600, color:'var(--text)', cursor:'pointer', fontFamily:'system-ui', justifyContent:'center' }}>
              📅 Ajouter à l'agenda
            </button>
          </div>

          {/* Map localisation festival */}
          {hasLocation && (
            <div style={{ marginTop:8 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                📍 Lieu du festival
              </div>
              <div style={{ borderRadius:14, overflow:'hidden', border:'1px solid var(--border)', height:200 }}>
                <iframe
                  title="Localisation festival"
                  width="100%"
                  height="200"
                  style={{ border:'none', display:'block' }}
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${cr.longitude-0.005}%2C${cr.latitude-0.005}%2C${cr.longitude+0.005}%2C${cr.latitude+0.005}&layer=mapnik&marker=${cr.latitude}%2C${cr.longitude}`}
                  onLoad={() => setMapLoaded(true)}
                />
              </div>
              <a href={`https://www.openstreetmap.org/?mlat=${cr.latitude}&mlon=${cr.longitude}#map=16/${cr.latitude}/${cr.longitude}`}
                target="_blank" rel="noreferrer"
                style={{ fontSize:11, color:'var(--brand)', textDecoration:'none', display:'block', marginTop:6, textAlign:'right' }}>
                Ouvrir dans Maps ↗
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── PlanningSpec ───────────────────────────────────────────────────────
function PlanningSpec({ planning, eventId, specId, themeColor }) {
  const [carteOpen, setCarteOpen]   = React.useState(null)
  const [search, setSearch]         = React.useState('')
  const [filterType, setFilterType] = React.useState('tous')
  const [filterScene, setFilterScene] = React.useState('tous')
  const [now, setNow]               = React.useState(Date.now())
  const currentRef                  = React.useRef(null)
  const [favs, setFavs]             = React.useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('yllacash-favs-'+specId) || '[]')) }
    catch { return new Set() }
  })
  // Mode d'affichage : list (défaut) | compact | grid
  const [viewMode, setViewMode]     = React.useState(() => {
    try {
      const saved = localStorage.getItem('yllacash-planningspec-view')
      if (['list','compact','grid'].includes(saved)) return saved
    } catch {}
    return 'list'
  })
  React.useEffect(() => {
    try { localStorage.setItem('yllacash-planningspec-view', viewMode) } catch {}
  }, [viewMode])

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Scroll automatique désactivé : la page ne saute plus toute seule au créneau en cours.
  // (Auparavant : useEffect qui appelait scrollIntoView sur le créneau actif au chargement.)

  const toggleFav = (id) => {
    setFavs(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      try { localStorage.setItem('yllacash-favs-'+specId, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  const FILTERS = [
    { value: 'tous',             label: 'Tous',       icon: '🎭' },
    { value: 'favoris',          label: 'Favoris',    icon: '❤️' },
    { value: 'musical',          label: 'Musical',    icon: '🎵' },
    { value: 'litteraire',       label: 'Littéraire', icon: '📚' },
    { value: 'cinematographique',label: 'Cinéma',     icon: '🎬' },
    { value: 'autre',            label: 'Autre',      icon: '🎭' },
  ]

  // Liste des scènes uniques pour le filtre
  const scenes = [...new Set(planning.map(p => p.scene).filter(Boolean))]

  const filtered = planning.filter(cr => {
    const matchSearch = !search || cr.artiste.toLowerCase().includes(search.toLowerCase()) || (cr.titre||'').toLowerCase().includes(search.toLowerCase()) || (cr.scene||'').toLowerCase().includes(search.toLowerCase())
    const matchType   = filterType === 'tous' ? true
                      : filterType === 'favoris' ? favs.has(cr.id)
                      : cr.type === filterType
    const matchScene  = filterScene === 'tous' || cr.scene === filterScene
    return matchSearch && matchType && matchScene
  })

  if (planning.length === 0) return (
    <div style={{ textAlign:'center', padding:'32px 20px', color:'var(--muted)', fontSize:14 }}>
      <div style={{ fontSize:32, marginBottom:10 }}>📅</div>
      Le programme n'est pas encore disponible.
    </div>
  )

  return (
    <div>
      {/* En-tête */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>Programme</div>
        {eventId && (
          <a href={'/live?ev='+eventId} target="_blank" rel="noreferrer"
            style={{ fontSize:11, color:'var(--brand)', textDecoration:'none', fontWeight:600 }}>
            Vue plein écran ↗
          </a>
        )}
      </div>

      {/* Sélecteur de mode d'affichage */}
      <div style={{ display:'flex', gap:6, marginBottom:10, padding:4, background:'var(--bg2)', borderRadius:10, border:'1px solid var(--border)' }}>
        {[
          { v:'list',    l:'Liste',   icon:'☰' },
          { v:'compact', l:'Compact', icon:'≡' },
          { v:'grid',    l:'Grille',  icon:'▦' },
        ].map(m => {
          const active = viewMode === m.v
          return (
            <button key={m.v} onClick={() => setViewMode(m.v)}
              style={{
                flex:1, padding:'8px 4px', minHeight:36,
                background: active ? themeColor : 'transparent',
                color: active ? '#fff' : 'var(--muted)',
                border:'none', borderRadius:8,
                fontSize:12, fontWeight:700,
                cursor:'pointer', fontFamily:'inherit',
                display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                WebkitTapHighlightColor:'transparent',
              }}>
              <span style={{ fontSize:14 }}>{m.icon}</span> {m.l}
            </button>
          )
        })}
      </div>

      {/* Barre de recherche */}
      <div style={{ position:'relative', marginBottom:10 }}>
        <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:16, pointerEvents:'none' }}>🔍</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un artiste, un lieu…"
          style={{ width:'100%', minHeight:42, padding:'0 14px 0 38px', border:'1.5px solid var(--border2)', borderRadius:12, fontSize:13, color:'var(--text)', outline:'none', background:'var(--bg)', fontFamily:'system-ui', boxSizing:'border-box' }}
        />
        {search && (
          <button onClick={() => setSearch('')}
            style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:16, padding:4 }}>
            ✕
          </button>
        )}
      </div>

      {/* Filtres */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14, overflowX:'auto', paddingBottom:2 }}>
        {FILTERS.map(f => (
          <button key={f.value} onClick={() => setFilterType(f.value)}
            style={{ padding:'5px 12px', borderRadius:20, border:'1px solid var(--border)', background: filterType===f.value ? (f.value==='favoris'?'#e11d48':'var(--brand)') : 'var(--bg)', color: filterType===f.value ? '#fff' : 'var(--muted)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'system-ui', whiteSpace:'nowrap', flexShrink:0, display:'flex', alignItems:'center', gap:4 }}>
            {f.icon} {f.label}
          </button>
        ))}
      </div>

      {/* Filtre par scène (uniquement si plusieurs scènes) */}
      {scenes.length > 1 && (
        <div style={{ display:'flex', gap:6, marginBottom:12, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ fontSize:11, color:'var(--muted)', fontWeight:600 }}>📍 Scène :</span>
          <select value={filterScene} onChange={e => setFilterScene(e.target.value)}
            style={{ flex:'1 1 140px', minWidth:0, boxSizing:'border-box', minHeight:32, padding:'0 8px', border:'1px solid var(--border)', borderRadius:8, fontSize:12, color:'var(--text)', background:'var(--bg)', fontFamily:'system-ui', cursor:'pointer', outline:'none' }}>
            <option value="tous">Toutes les scènes</option>
            {scenes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      {/* Résultats */}
      {filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'24px 0', color:'var(--muted)', fontSize:13 }}>
          {filterType === 'favoris' ? 'Aucun favori pour le moment. Appuyez sur ❤️ pour en ajouter.' : 'Aucun résultat pour cette recherche.'}
        </div>
      ) : (
        <div style={
          viewMode === 'grid'
            ? { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:10 }
            : { display:'flex', flexDirection:'column', gap: viewMode === 'compact' ? 4 : 8 }
        }>
          {filtered.map(cr => {
            const ti  = TYPES_SPEC[cr.type] || TYPES_SPEC.autre
            const st  = autoStatutSpec(cr)
            const dim = st === 'termine' || cr.statut === 'annule'
            const fav = favs.has(cr.id)

            // ─── MODE COMPACT : ligne épurée ────────────────────────────
            if (viewMode === 'compact') {
              return (
                <div key={cr.id}
                  ref={!currentRef.current && (st==='en-cours' || st==='a-venir') ? currentRef : null}
                  onClick={() => setCarteOpen(cr)}
                  style={{
                    display:'flex', alignItems:'center', gap:10,
                    padding:'10px 12px',
                    background:'var(--bg)',
                    border:`1px solid ${st==='en-cours' ? ti.color+'88' : 'var(--border)'}`,
                    borderRadius:10, cursor:'pointer', opacity:dim?.55:1,
                    boxShadow: st==='en-cours' ? '0 2px 8px '+ti.color+'33' : 'none',
                  }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:ti.color+'22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>
                    {ti.icon}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {cr.artiste}
                    </div>
                    <div style={{ fontSize:11, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      🕐 {fmt2Spec(cr.debut)}{cr.fin ? '–'+fmt2Spec(cr.fin) : ''}{cr.scene ? ' · '+cr.scene : ''}
                    </div>
                  </div>
                  {st === 'en-cours' && (
                    <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:8, background:'#d1fae5', color:'#065f46', whiteSpace:'nowrap' }}>▶ EN COURS</span>
                  )}
                  <button onClick={e=>{e.stopPropagation();toggleFav(cr.id)}}
                    style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, padding:2, lineHeight:1 }}>
                    {fav ? '❤️' : '🤍'}
                  </button>
                </div>
              )
            }

            // ─── MODE GRID : carte verticale compacte ────────────────────
            if (viewMode === 'grid') {
              return (
                <div key={cr.id}
                  ref={!currentRef.current && (st==='en-cours' || st==='a-venir') ? currentRef : null}
                  onClick={() => setCarteOpen(cr)}
                  style={{
                    background:'var(--bg)',
                    border:`1.5px solid ${st==='en-cours' ? ti.color+'88' : 'var(--border)'}`,
                    borderRadius:12, cursor:'pointer', opacity:dim?.55:1,
                    overflow:'hidden',
                    boxShadow: st==='en-cours' ? '0 4px 12px '+ti.color+'33' : 'none',
                    display:'flex', flexDirection:'column',
                  }}>
                  <div style={{ aspectRatio:'1/1', width:'100%', background:ti.color+'22', position:'relative', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32 }}>
                    {cr.photo
                      ? <img loading="lazy" src={cr.photo} alt={cr.artiste} style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition: cr.photoPosition || 'center center' }}/>
                      : <span>{ti.icon}</span>}
                    {st === 'en-cours' && (
                      <span style={{ position:'absolute', top:6, left:6, fontSize:9, fontWeight:800, padding:'2px 8px', borderRadius:8, background:'#d1fae5', color:'#065f46' }}>▶ EN COURS</span>
                    )}
                    <button onClick={e=>{e.stopPropagation();toggleFav(cr.id)}}
                      style={{ position:'absolute', top:4, right:4, background:'rgba(255,255,255,0.85)', border:'none', cursor:'pointer', fontSize:14, padding:'4px 6px', borderRadius:6, lineHeight:1 }}>
                      {fav ? '❤️' : '🤍'}
                    </button>
                  </div>
                  <div style={{ padding:'8px 10px' }}>
                    <div style={{ fontSize:12, fontWeight:800, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {cr.artiste}
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      🕐 {fmt2Spec(cr.debut)}
                    </div>
                    {cr.scene && (
                      <div style={{ fontSize:10, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        📍 {cr.scene}
                      </div>
                    )}
                  </div>
                </div>
              )
            }

            // ─── MODE LIST (par défaut) ──────────────────────────────────
            return (
              <div key={cr.id}
                ref={!currentRef.current && (st==='en-cours' || st==='a-venir') ? currentRef : null}
                style={{ display:'flex', alignItems:'center', gap:16, padding:'18px 16px', background:'var(--bg)', border:`1.5px solid ${st==='en-cours'?ti.color+'88':'var(--border)'}`, borderRadius:16, cursor:'pointer', opacity:dim?.55:1, transition:'opacity .2s', boxShadow: st==='en-cours'?'0 4px 16px '+ti.color+'33':'none', position:'relative' }}>
                {/* Photo/icône */}
                <div onClick={() => setCarteOpen(cr)}
                  style={{ width:72, height:72, borderRadius:12, overflow:'hidden', flexShrink:0, background:ti.color+'22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, position:'relative' }}>
                  {cr.photo ? <img loading="lazy" src={cr.photo} alt={cr.artiste} style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition: cr.photoPosition || 'center center' }}/> : ti.icon}
                  {st==='en-cours' && <div style={{ position:'absolute', top:4, right:4, width:10, height:10, borderRadius:'50%', background:'#22c55e', border:'2px solid #fff' }}/>}
                </div>
                {/* Infos + statut + timer */}
                <div style={{ flex:1, minWidth:0 }} onClick={() => setCarteOpen(cr)}>
                  <div style={{ fontSize:16, fontWeight:800, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:4 }}>{cr.artiste}</div>
                  {cr.titre && <div style={{ fontSize:13, color:'var(--muted)', marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cr.titre}</div>}
                  <div style={{ fontSize:13, color:'var(--muted)', display:'flex', gap:8, flexWrap:'wrap', marginBottom:6 }}>
                    <span>🕐 {fmt2Spec(cr.debut)}{cr.fin ? ' → '+fmt2Spec(cr.fin) : ''}</span>
                    {cr.scene && <span>📍 {cr.scene}</span>}
                  </div>
                  {/* Statut + timer sous les infos */}
                  <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                    {st==='en-cours' && (
                      <>
                        <span style={{ fontSize:10, fontWeight:800, padding:'3px 9px', borderRadius:10, background:'#d1fae5', color:'#065f46', whiteSpace:'nowrap' }}>▶ EN COURS</span>
                        <span style={{ fontSize:11, color:'#065f46', fontWeight:700, whiteSpace:'nowrap' }}>{dureeRestanteSpec(cr.fin, now)}</span>
                      </>
                    )}
                    {cr.statut==='annule' && <span style={{ fontSize:10, fontWeight:800, padding:'3px 9px', borderRadius:10, background:'#FCEBEB', color:'#A32D2D' }}>ANNULÉ</span>}
                    {st==='termine' && cr.statut!=='annule' && <span style={{ fontSize:10, fontWeight:600, padding:'3px 9px', borderRadius:10, background:'var(--bg2)', color:'var(--muted)' }}>Terminé</span>}
                    {st==='a-venir' && cr.statut!=='annule' && countdownSpec(cr.debut, now) && (
                      <span style={{ fontSize:10, fontWeight:800, padding:'3px 9px', borderRadius:10, background:themeColor+'22', color:themeColor, whiteSpace:'nowrap', display:'inline-block' }}>
                        ⏳ {countdownSpec(cr.debut, now)}
                      </span>
                    )}
                  </div>
                </div>
                {/* Droite : favori uniquement */}
                <div style={{ flexShrink:0 }}>
                  <button onClick={e=>{e.stopPropagation();toggleFav(cr.id)}}
                    style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, padding:4, lineHeight:1 }}>
                    {fav ? '❤️' : '🤍'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {carteOpen && <CarteArtisteSpec cr={carteOpen} onClose={() => setCarteOpen(null)} isFav={favs.has(carteOpen.id)} onToggleFav={toggleFav} themeColor={themeColor}/>}
    </div>
  )
}

// ── Composant graphe interactif ───────────────────────────────
function SoldeChart({ timeline, maxBal, hoverIdx, setHoverIdx, zoom, setZoom, fmt }) {
  const W = 50  // px par point
  const H = 160 // hauteur SVG
  const PL = 52 // padding left (axe Y)
  const PR = 12
  const PT = 20 // padding top
  const PB = 30 // padding bottom
  const innerH = H - PT - PB
  const innerW = (n) => Math.max(n * W, 280)
  const n = timeline.length

  if (n < 2) return (
    <div style={{ textAlign:'center', padding:24, color:'var(--muted)', fontSize:13 }}>
      Au moins 2 transactions nécessaires pour afficher le graphe
    </div>
  )

  const totalW = PL + innerW(n) + PR
  const minBal = Math.min(...timeline.map(t => t.balanceAfter), 0)
  const range  = maxBal - minBal || 1
  const yOf    = (val) => PT + innerH - ((val - minBal) / range) * innerH

  // Niveaux de grille
  const gridLevels = 4
  const gridVals = Array.from({length: gridLevels + 1}, (_, i) =>
    minBal + (range / gridLevels) * i
  )

  const cx = (i) => PL + i * W + W / 2

  // Points de la courbe
  const points = timeline.map((t, i) => `${cx(i)},${yOf(t.balanceAfter)}`).join(' ')

  // Aire sous la courbe
  const areaPoints = `${cx(0)},${PT + innerH} ${points} ${cx(n-1)},${PT + innerH}`

  const GREEN  = '#065f46'
  const GREEN_L= '#d1fae5'
  const RED    = '#A32D2D'
  const BRAND  = '#1a6b7a'
  const AMBER  = '#BA7517'

  const typeColor = (type) =>
    type === 'credit' ? GREEN :
    type === 'annulation' ? '#94a3b8' :
    RED

  const svgContent = (
    <svg
      width={totalW}
      height={H}
      viewBox={`0 0 ${totalW} ${H}`}
      style={{ display:'block', minWidth: totalW }}
    >
      {/* Aire sous la courbe */}
      <polygon
        points={areaPoints}
        fill={BRAND} opacity="0.08"
      />

      {/* Lignes de grille horizontales + labels axe Y */}
      {gridVals.map((val, i) => (
        <g key={i}>
          <line
            x1={PL} y1={yOf(val)} x2={totalW - PR} y2={yOf(val)}
            stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 3"
          />
          <text x={PL - 6} y={yOf(val) + 4} textAnchor="end"
            fontSize="10" fill="#94a3b8" fontFamily="system-ui">
            {(val / 100).toFixed(0)}€
          </text>
        </g>
      ))}

      {/* Ligne de base (0€) */}
      <line
        x1={PL} y1={yOf(0)} x2={totalW - PR} y2={yOf(0)}
        stroke="#cbd5e1" strokeWidth="1.5"
      />

      {/* Courbe principale */}
      <polyline
        fill="none" stroke={BRAND} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round"
        points={points}
      />

      {/* Points interactifs */}
      {timeline.map((t, i) => {
        const isHover = hoverIdx === i
        const col = typeColor(t.type)
        return (
          <g key={i}>
            {/* Zone de touch/hover élargie */}
            <rect
              x={cx(i) - W/2} y={PT} width={W} height={innerH + PB}
              fill="transparent"
              style={{ cursor:'pointer' }}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              onTouchStart={() => setHoverIdx(i)}
              onTouchEnd={() => setTimeout(() => setHoverIdx(null), 2000)}
            />
            {/* Ligne verticale au survol */}
            {isHover && (
              <line
                x1={cx(i)} y1={PT} x2={cx(i)} y2={PT + innerH}
                stroke={col} strokeWidth="1" strokeDasharray="3 3" opacity="0.6"
              />
            )}
            {/* Point */}
            <circle
              cx={cx(i)} cy={yOf(t.balanceAfter)}
              r={isHover ? 7 : 5}
              fill={col} stroke="#fff" strokeWidth="2"
              style={{ transition:'r .1s' }}
            />
          </g>
        )
      })}

      {/* Tooltip au survol */}
      {hoverIdx !== null && (() => {
        const t   = timeline[hoverIdx]
        const x   = cx(hoverIdx)
        const y   = yOf(t.balanceAfter)
        const col = typeColor(t.type)
        const TW  = 120
        const TH  = 52
        const tx  = Math.min(Math.max(x - TW/2, PL), totalW - PR - TW)
        const ty  = y - TH - 12 < PT ? y + 14 : y - TH - 12
        return (
          <g>
            <rect x={tx} y={ty} width={TW} height={TH}
              rx="8" fill="white" stroke={col} strokeWidth="1.5"
              filter="url(#shadow)"
            />
            <text x={tx + TW/2} y={ty + 16} textAnchor="middle"
              fontSize="11" fontWeight="700" fill={col} fontFamily="system-ui">
              {t.type === 'credit' ? '+' : t.type === 'annulation' ? '—' : '−'}{(t.montant||0)/100 < 0.005 ? '0.00' : ((t.montant||0)/100).toFixed(2)}€
            </text>
            <text x={tx + TW/2} y={ty + 30} textAnchor="middle"
              fontSize="10" fill="#64748b" fontFamily="system-ui">
              Solde après : {(t.balanceAfter/100).toFixed(2)}€
            </text>
            <text x={tx + TW/2} y={ty + 45} textAnchor="middle"
              fontSize="9" fill="#94a3b8" fontFamily="system-ui">
              {t.date}{t.heure ? ' · '+t.heure : ''}
            </text>
          </g>
        )
      })()}

      {/* Filtre ombre pour tooltip */}
      <defs>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.12"/>
        </filter>
      </defs>

      {/* Labels axe X (dates) — afficher 1 sur N pour éviter surcharge */}
      {timeline.map((t, i) => {
        const skip = n > 10 ? Math.ceil(n / 8) : 1
        if (i % skip !== 0 && i !== n - 1) return null
        return (
          <text key={i} x={cx(i)} y={H - 6} textAnchor="middle"
            fontSize="9" fill="#94a3b8" fontFamily="system-ui">
            {(t.date||'').slice(0,5)}
          </text>
        )
      })}
    </svg>
  )

  return (
    <>
      {/* Bouton agrandir */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:6 }}>
        <button onClick={() => setZoom(true)}
          style={{ fontSize:11, color:'var(--muted)', background:'none', border:'0.5px solid var(--border)', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontFamily:'system-ui' }}>
          ⛶ Agrandir
        </button>
      </div>

      {/* Graphe scrollable */}
      <div style={{ overflowX:'auto', background:'var(--bg2)', borderRadius:10, padding:'10px 4px 4px' }}>
        {svgContent}
      </div>

      {/* Légende */}
      <div style={{ display:'flex', gap:14, marginTop:8, fontSize:11, color:'var(--muted)', flexWrap:'wrap' }}>
        <span><span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:GREEN, marginRight:4 }}/>Recharge</span>
        <span><span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:RED, marginRight:4 }}/>Dépense</span>
        <span><span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:'#94a3b8', marginRight:4 }}/>Annulation</span>
      </div>
      <div style={{ fontSize:11, color:'var(--muted)', marginTop:6, fontStyle:'italic' }}>
        💡 Touchez un point pour voir le détail
      </div>

      {/* Modale zoom plein écran */}
      {zoom && (
        <div style={{ position:'fixed', inset:0, zIndex:400, background:'var(--bg)', display:'flex', flexDirection:'column', padding:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>📈 Évolution du solde</div>
            <button onClick={() => setZoom(false)}
              style={{ padding:'6px 16px', background:BRAND, color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'system-ui' }}>
              Fermer ✕
            </button>
          </div>
          <div style={{ flex:1, overflowX:'auto', overflowY:'auto', background:'var(--bg2)', borderRadius:12, padding:12 }}>
            <svg
              width={totalW * 1.4}
              height={H * 2}
              viewBox={`0 0 ${totalW} ${H}`}
              style={{ display:'block', width:'100%', height:'auto', minWidth: totalW }}
            >
              {/* même contenu que le SVG inline mais en plus grand via viewBox scale */}
              {/* Grille */}
              {gridVals.map((val, i) => (
                <g key={i}>
                  <line x1={PL} y1={yOf(val)} x2={totalW-PR} y2={yOf(val)} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 3"/>
                  <text x={PL-6} y={yOf(val)+4} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="system-ui">
                    {(val/100).toFixed(0)}€
                  </text>
                </g>
              ))}
              <polygon points={areaPoints} fill={BRAND} opacity="0.08"/>
              <line x1={PL} y1={yOf(0)} x2={totalW-PR} y2={yOf(0)} stroke="#cbd5e1" strokeWidth="1.5"/>
              <polyline fill="none" stroke={BRAND} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={points}/>
              {timeline.map((t,i) => {
                const isHover = hoverIdx === i
                const col = typeColor(t.type)
                return (
                  <g key={i}>
                    <rect x={cx(i)-W/2} y={PT} width={W} height={innerH+PB} fill="transparent" style={{ cursor:'pointer' }}
                      onMouseEnter={()=>setHoverIdx(i)} onMouseLeave={()=>setHoverIdx(null)}
                      onTouchStart={()=>setHoverIdx(i)} onTouchEnd={()=>setTimeout(()=>setHoverIdx(null),2000)}/>
                    {isHover && <line x1={cx(i)} y1={PT} x2={cx(i)} y2={PT+innerH} stroke={col} strokeWidth="1" strokeDasharray="3 3" opacity="0.6"/>}
                    <circle cx={cx(i)} cy={yOf(t.balanceAfter)} r={isHover?7:5} fill={col} stroke="#fff" strokeWidth="2"/>
                  </g>
                )
              })}
              {hoverIdx !== null && (() => {
                const t = timeline[hoverIdx]
                const x = cx(hoverIdx)
                const y = yOf(t.balanceAfter)
                const col = typeColor(t.type)
                const TW2=130; const TH2=56
                const tx = Math.min(Math.max(x-TW2/2,PL), totalW-PR-TW2)
                const ty = y-TH2-12 < PT ? y+14 : y-TH2-12
                return (
                  <g>
                    <rect x={tx} y={ty} width={TW2} height={TH2} rx="8" fill="white" stroke={col} strokeWidth="1.5" filter="url(#shadow2)"/>
                    <text x={tx+TW2/2} y={ty+17} textAnchor="middle" fontSize="12" fontWeight="700" fill={col} fontFamily="system-ui">
                      {t.type==='credit'?'+':t.type==='annulation'?'—':'−'}{((t.montant||0)/100).toFixed(2)}€
                    </text>
                    <text x={tx+TW2/2} y={ty+32} textAnchor="middle" fontSize="10" fill="#64748b" fontFamily="system-ui">
                      Solde après : {(t.balanceAfter/100).toFixed(2)}€
                    </text>
                    <text x={tx+TW2/2} y={ty+47} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="system-ui">
                      {t.date}{t.heure?' · '+t.heure:''}
                    </text>
                  </g>
                )
              })()}
              <defs>
                <filter id="shadow2" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.12"/>
                </filter>
              </defs>
              {timeline.map((t,i) => {
                const skip = n>10 ? Math.ceil(n/8) : 1
                if (i%skip!==0 && i!==n-1) return null
                return <text key={i} x={cx(i)} y={H-6} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="system-ui">{(t.date||'').slice(0,5)}</text>
              })}
            </svg>
          </div>
          <div style={{ display:'flex', gap:14, marginTop:10, fontSize:12, color:'var(--muted)', flexWrap:'wrap' }}>
            <span><span style={{ display:'inline-block', width:9, height:9, borderRadius:'50%', background:GREEN, marginRight:4 }}/>Recharge</span>
            <span><span style={{ display:'inline-block', width:9, height:9, borderRadius:'50%', background:RED, marginRight:4 }}/>Dépense</span>
            <span><span style={{ display:'inline-block', width:9, height:9, borderRadius:'50%', background:'#94a3b8', marginRight:4 }}/>Annulation</span>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:6, fontStyle:'italic' }}>💡 Touchez un point pour voir le détail</div>
        </div>
      )}
    </>
  )
}

// Son de notification (Web Audio API)
function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4)
  } catch {}
}

export default function SoldePage() {
  useTheme()
  const params  = new URLSearchParams(window.location.search)
  const urlId   = (params.get('id') || '').toUpperCase()
  const eventId = params.get('ev') || null
  const fromArtiste = params.get('from') === 'artiste'
  const artisteCreneauId = params.get('cr') || null

  const specCol  = (db) => eventId ? collection(db,'events',eventId,'spectateurs')  : collection(db,'spectateurs')
  const txCol    = (db) => eventId ? collection(db,'events',eventId,'transactions') : collection(db,'transactions')
  const resaCol  = (db) => eventId ? collection(db,'events',eventId,'reservations') : collection(db,'reservations')
  const menuCol  = (db) => eventId ? collection(db,'events',eventId,'menu')         : collection(db,'menu')

  const [inputId, setInputId]         = useState(urlId)
  const [spec, setSpec]               = useState(null)
  const [specDocId, setSpecDocId]     = useState(null)
  const [txs, setTxs]                 = useState([])
  const [resas, setResas]             = useState([]
  )
  const [menu, setMenu]               = useState([])
  const [loading, setLoading]         = useState(false)
  const [err, setErr]                 = useState('')
  const [tab, setTab]                 = useState('accueil')
  const [qtys, setQtys]               = useState({})
  const [resaLoading, setResaLoading] = useState(false)
  const [resaDone, setResaDone]       = useState(null)
  const [resaErr, setResaErr]         = useState('')
  const [qrDataUrl, setQrDataUrl]     = useState(null)
  const [qrOpen, setQrOpen]           = useState(false)
  const [chartMode, setChartMode]     = useState(false)   // false=liste true=graphe
  const [planningData, setPlanningData] = useState(() => {
    try {
      const cached = localStorage.getItem('yllacash-planning-' + eventId)
      if (cached) {
        const parsed = JSON.parse(cached)
        return parsed.map(cr => ({ ...cr, debut: cr.debut ? new Date(cr.debut) : null, fin: cr.fin ? new Date(cr.fin) : null }))
      }
    } catch {}
    return []
  })
  const [chartZoom, setChartZoom]     = useState(false)   // graphe plein écran
  const [hoverIdx, setHoverIdx]       = useState(null)    // index point survolé
  const [txPage, setTxPage]           = useState(1)       // pagination historique
  const [resaPage, setResaPage]       = useState(1)       // pagination mes résa
  const [eventMeta, setEventMeta]     = useState(null)
  const [themeColor, setThemeColor]   = useState('#1a6b7a')
  const unsubsRef                     = useRef([])

  const { notifications, nonLuCount, marquerToutLu } = useNotifications({
    specId: spec?.id || null, isStaff: false, eventId,
  })

  useEffect(() => {
    getDocs(menuCol(db)).then(s => setMenu(s.docs.map(d => ({ ...d.data(), id: d.id })))).catch(() => {})
  }, [])

  // Compteur de notifs planning non-lues (pour badge sur onglet Programme)
  const nonLuPlanning = notifications.filter(n => n.type === 'PLANNING_MODIF' && !n.lu).length

  // Son quand une notif planning arrive
  const prevNonLuRef = React.useRef(nonLuCount)
  useEffect(() => {
    if (nonLuCount > prevNonLuRef.current) {
      const hasPlanning = notifications.some(n => n.type === 'PLANNING_MODIF' && !n.lu)
      if (hasPlanning) playNotifSound()
    }
    prevNonLuRef.current = nonLuCount
  }, [nonLuCount, notifications])

  // Charger le planning en temps réel si eventId connu
  useEffect(() => {
    if (!eventId) return
    const { onSnapshot: onSnap, query: q, collection: col, orderBy: ob } = { onSnapshot, query, collection, orderBy }
    const unsub = onSnapshot(
      query(collection(db, 'events', eventId, 'planning'), orderBy('debut', 'asc')),
      snap => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id }))
      setPlanningData(data)
      try { localStorage.setItem('yllacash-planning-' + eventId, JSON.stringify(data.map(cr => ({
        ...cr, debut: cr.debut?.toDate ? cr.debut.toDate().toISOString() : cr.debut,
        fin: cr.fin?.toDate ? cr.fin.toDate().toISOString() : cr.fin
      })))) } catch {}
    }
    )
    return unsub
  }, [eventId])

  useEffect(() => {
    if (!eventId) return
    getDoc(doc(db,'events',eventId)).then(snap => { if (snap.exists()) setEventMeta(snap.data()) }).catch(() => {})
    // Charger le thème de l'événement
    getSettings(eventId).then(s => {
      if (s?.theme?.brand) {
        setThemeColor(s.theme.brand)
        document.documentElement.style.setProperty('--brand', s.theme.brand)
        const hex = s.theme.brand.replace('#','')
        const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16)
        const dk = '#'+[r,g,b].map(v=>Math.max(0,Math.round(v*.8)).toString(16).padStart(2,'0')).join('')
        const lt = '#'+[r,g,b].map(v=>Math.min(255,Math.round(v+(255-v)*.88)).toString(16).padStart(2,'0')).join('')
        document.documentElement.style.setProperty('--brand-dark', dk)
        document.documentElement.style.setProperty('--brand-light', lt+'33')
      }
    }).catch(() => {})
  }, [eventId])

  const clearListeners = () => { unsubsRef.current.forEach(u => u()); unsubsRef.current = [] }
  useEffect(() => () => clearListeners(), [])

  const findSpec = async (id = inputId.trim().toUpperCase()) => {
    if (!id) return
    setLoading(true); setErr(''); clearListeners()
    try {
      const snap = await getDocs(query(specCol(db), where('id','==',id)))
      if (snap.empty) { setErr('Aucun compte trouvé pour : ' + id); setLoading(false); return }
      const d = snap.docs[0]
      setSpec(d.data()); setSpecDocId(d.id); setLoading(false)

      const unsubSpec = onSnapshot(query(specCol(db), where('id','==',id)),
        snap => { if (!snap.empty) setSpec(snap.docs[0].data()) })

      const unsubTx = onSnapshot(
        query(txCol(db), where('specId','==',id), orderBy('createdAt','desc')),
        snap => setTxs(snap.docs.map(x => x.data())),
        () => onSnapshot(query(txCol(db), where('specId','==',id)),
          snap => setTxs(snap.docs.map(x => x.data())))
      )

      const unsubResa = onSnapshot(query(resaCol(db), where('specId','==',id)),
        snap => setResas(snap.docs.map(x => ({ ...x.data(), id: x.id }))))

      unsubsRef.current = [unsubSpec, unsubTx, unsubResa]
    } catch { setErr('Erreur de connexion.'); setLoading(false) }
  }

  useEffect(() => { if (urlId) findSpec(urlId) }, [urlId, eventId])

  useEffect(() => {
    if (!spec?.id) return
    const url = `${window.location.origin}/solde?id=${spec.id}${eventId ? '&ev='+eventId : ''}`
    QRCode.toDataURL(url, { width:400, margin:2, color:{ dark:themeColor, light:'#ffffff' } })
      .then(u => setQrDataUrl(u)).catch(() => {})
  }, [spec?.id])

  const openQr  = useCallback(async () => { setQrOpen(true) }, [])
  const closeQr = useCallback(() => setQrOpen(false), [])

  const changeQty = (id, d) => setQtys(q => ({ ...q, [id]: Math.max(0,(q[id]||0)+d) }))
  const cartItems = Object.entries(qtys).filter(([,q])=>q>0).map(([id,qty])=>({ ...menu.find(x=>x.id===id), qty }))
  const cartTotal = cartItems.reduce((a,i) => a+(i.prix||0)*i.qty, 0)

  const doResa = async () => {
    if (!spec || !cartItems.length) return
    setResaLoading(true); setResaErr('')
    try {
      const specRef = eventId ? doc(db,'events',eventId,'spectateurs',specDocId) : doc(db,'spectateurs',specDocId)
      const code    = resaCode(spec.id)
      await runTransaction(db, async txn => {
        const sd = await txn.get(specRef)
        if (sd.data().solde < cartTotal) throw new Error('Solde insuffisant')
        txn.set(doc(resaCol(db)), {
          specId:spec.id, specNom:spec.nom,
          items:cartItems.map(i=>({ id:i.id, nom:i.nom, prix:i.prix, qty:i.qty })),
          total:cartTotal, status:'pending', code, date:nowStr(), createdAt:serverTimestamp()
        })
        txn.set(doc(txCol(db)), {
          specId:spec.id, type:'reservation',
          label:'Résa: '+cartItems.map(i=>i.nom+(i.qty>1?` ×${i.qty}`:'')).join(', '),
          montant:cartTotal, staff:'—', date:nowStr(), createdAt:serverTimestamp()
        })
      })
      setResaDone({ code, items:cartItems, total:cartTotal }); setQtys({})
      const notifCol = eventId ? collection(db,'events',eventId,'notifications') : collection(db,'notifications')
      await addDoc(notifCol, {
        type:'RESA_CREEE', titre:'🛒 Nouvelle réservation',
        message:`${spec.nom} a réservé : ${cartItems.map(i=>i.nom+(i.qty>1?` x${i.qty}`:'')).join(', ')}`,
        specId:spec.id, resaCode:code, lu:false,
        timestamp:new Date().toISOString(), createdAt:serverTimestamp(),
      })
    } catch(e) { setResaErr(e.message||'Erreur') }
    finally { setResaLoading(false) }
  }

  const annuler = async (resaId) => {
    if (!window.confirm('Annuler cette réservation ?')) return
    const resaRef2 = eventId ? doc(db,'events',eventId,'reservations',resaId) : doc(db,'reservations',resaId)
    // Récupérer la résa avant annulation pour rembourser le stock
    let resaItems = []
    try {
      const resaSnap = await getDoc(resaRef2)
      if (resaSnap.exists() && resaSnap.data().status !== 'cancelled' && resaSnap.data().status !== 'collected') {
        resaItems = resaSnap.data().items || []
      }
    } catch {}
    await updateDoc(resaRef2, {
      status:'cancelled', cancelledBy:spec?.nom||'Spectateur',
      cancelledByRole:'spectateur', cancelledAt:new Date().toISOString(), motifAnnulation:'Annulé par le client',
    })
    // Rembourser le stock menu pour chaque article
    for (const it of resaItems) {
      if (!it.id) continue
      try {
        const menuRef = eventId
          ? doc(db, 'events', eventId, 'menu', it.id)
          : doc(db, 'menu', it.id)
        await updateDoc(menuRef, { stock: increment(it.qty || 1) })
      } catch (e) {
        console.warn('Refund stock error for ' + it.id + ':', e)
      }
    }
    try {
      const auditCol = eventId ? collection(db,'events',eventId,'audit') : collection(db,'audit')
      await addDoc(auditCol, {
        action:'ANNULATION_RESA_SPEC', specId:spec?.id, specNom:spec?.nom, resaId,
        userType:'spectateur', label:`Annulation réservation par ${spec?.nom||'spectateur'}`,
        date:new Date().toLocaleString('fr-FR'), timestamp:new Date().toISOString(), createdAt:serverTimestamp(),
      })
    } catch {}
    await addDoc(txCol(db), {
      specId:spec.id, type:'annulation', label:'Annulation',
      montant:0, staff:'—', date:nowStr(), createdAt:serverTimestamp()
    })
  }

  // ── Calculs dérivés ────────────────────────────────────────────
  const totalRecharge  = txs.filter(t=>t.type==='credit').reduce((a,t)=>a+(t.montant||0),0)
  const totalDepense   = txs.filter(t=>['debit','reservation'].includes(t.type)).reduce((a,t)=>a+(t.montant||0),0)
  const nbResas        = resas.length
  const activeResas    = resas.filter(r=>r.status!=='collected'&&r.status!=='cancelled')
  // Tri explicite du plus récent au plus ancien (createdAt.seconds ou date string)
  const txTriees = [...txs].sort((a, b) => {
    const ta = a.createdAt?.seconds ?? a.createdAt?.toMillis?.() ?? (a.date ? new Date(a.date.split('/').reverse().join('-')).getTime()/1000 : 0)
    const tb = b.createdAt?.seconds ?? b.createdAt?.toMillis?.() ?? (b.date ? new Date(b.date.split('/').reverse().join('-')).getTime()/1000 : 0)
    return tb - ta
  })
  const resasTriees    = [...resas].sort((a,b)=>(b.date||'').localeCompare(a.date||''))

  // Pagination historique transactions
  const txTotal  = txTriees.length
  const txPages  = Math.max(1, Math.ceil(txTotal / PAGE_SIZE))
  const txSlice  = txTriees.slice((txPage-1)*PAGE_SIZE, txPage*PAGE_SIZE)

  // Pagination mes résa
  const resaTotal = resasTriees.length
  const resaPages = Math.max(1, Math.ceil(resaTotal / PAGE_SIZE))
  const resaSlice = resasTriees.slice((resaPage-1)*PAGE_SIZE, resaPage*PAGE_SIZE)

  // Timeline pour graphe — reconstitution à partir du solde actuel (centimes)
  const timeline = (() => {
    if (!txTriees.length) return []
    // Partir du solde actuel et remonter à rebours pour trouver le solde après chaque tx
    const currentSolde = spec?.solde || 0  // solde actuel en centimes
    let bal = currentSolde
    // Calculer soldeAprès en remontant du plus récent au plus ancien
    const withBalance = txTriees.map(t => {
      const soldeApres = bal
      // Annuler la transaction pour trouver le solde avant
      if (t.type === 'credit')                                    bal -= (t.montant||0)
      else if (['debit','reservation'].includes(t.type))          bal += (t.montant||0)
      return { ...t, balanceAfter: soldeApres }
    })
    // Remettre dans l'ordre chronologique (plus ancien en premier)
    return withBalance.reverse()
  })()
  const maxBal = Math.max(...timeline.map(t=>t.balanceAfter), 0, 1)
  const minBal = Math.min(...timeline.map(t=>t.balanceAfter), 0)

  // ── Styles ────────────────────────────────────────────────────
  const s = {
    page:    { minHeight:'100vh', background:'var(--bg2)', fontFamily:'system-ui,-apple-system,sans-serif', overflowX:'hidden' },
    header:  { background:themeColor, padding:'20px 16px 56px', textAlign:'center', color:'#fff' },
    wrap:    { maxWidth:460, margin:'-32px auto 0', padding:'0 12px 60px', position:'relative', zIndex:1, boxSizing:'border-box', width:'100%' },
    card:    { background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:16, padding:16, marginBottom:12, boxSizing:'border-box' },
    inp:     { width:'100%', minHeight:48, padding:'0 14px', border:'1.5px solid var(--border2)', borderRadius:12, fontSize:16, color:'var(--text)', outline:'none', background:'var(--bg)', WebkitAppearance:'none', boxSizing:'border-box', fontFamily:'system-ui' },
    btnPrim: { width:'100%', minHeight:52, background:themeColor, color:'#fff', border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'system-ui' },
    btnSec:  { width:'100%', minHeight:48, background:'var(--bg)', color:'var(--text)', border:'1px solid var(--border)', borderRadius:12, fontSize:14, fontWeight:500, cursor:'pointer', fontFamily:'system-ui' },
    tab:     (t) => ({ flex:1, minHeight:48, border:'none', borderBottom:`3px solid ${tab===t?BRAND:'transparent'}`, background:'var(--bg2)', color:tab===t?BRAND_D:'var(--muted)', fontWeight:tab===t?700:400, fontSize:12, cursor:'pointer', padding:'0 2px', fontFamily:'system-ui', position:'relative' }),
    qtyBtn:  (active, primary) => ({ width:44, height:44, borderRadius:10, border:primary?`1.5px solid ${active?BRAND:'var(--border)'}`:'1.5px solid var(--border)', background:primary&&active?BRAND:'var(--bg)', cursor:active?'pointer':'not-allowed', fontSize:20, display:'flex', alignItems:'center', justifyContent:'center', color:primary&&active?'#fff':'var(--muted)', fontWeight:700, flexShrink:0 }),
    pgBtn:   (active) => ({ minWidth:32, height:32, border:'0.5px solid var(--border)', borderRadius:8, background:active?BRAND:'var(--bg)', color:active?'#fff':'var(--text)', fontSize:13, fontWeight:active?700:400, cursor:'pointer', fontFamily:'system-ui', padding:'0 10px' }),
  }

  // ── Composants helpers ────────────────────────────────────────
  const Pagination = ({ page, pages, onChange }) => pages <= 1 ? null : (
    <div style={{ display:'flex', justifyContent:'center', gap:6, marginTop:14, flexWrap:'wrap' }}>
      <button style={s.pgBtn(false)} onClick={() => onChange(Math.max(1,page-1))} disabled={page===1}>‹</button>
      {Array.from({length:pages},(_,i)=>i+1).map(p => (
        <button key={p} style={s.pgBtn(p===page)} onClick={() => onChange(p)}>{p}</button>
      ))}
      <button style={s.pgBtn(false)} onClick={() => onChange(Math.min(pages,page+1))} disabled={page===pages}>›</button>
    </div>
  )

  const TxRow = ({ t, i, last }) => {
    const st = txStyle(t.type)
    const isCredit = t.type === 'credit'
    const isAnnul  = t.type === 'annulation'
    return (
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:last?'none':'0.5px solid var(--border)' }}>
        <div style={{ width:38, height:38, borderRadius:10, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, background:st.bg, color:st.color }}>
          {st.icon}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.label||t.type}</div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>{t.date}{t.heure ? ' · '+t.heure : ''}</div>
        </div>
        <div style={{ fontSize:14, fontWeight:700, flexShrink:0, color:isAnnul?'var(--muted)':isCredit?GREEN:st.color }}>
          {isAnnul ? '—' : `${st.sign}${fmt(t.montant||0)}`}
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...s.page, '--brand': themeColor }}>
      {/* Header dégradé Maison Ylla */}
      <div style={{ background:'var(--grad-signature)', padding:'12px 16px 52px', color:'#fff' }}>
        {/* Ligne 1 : Logo + actions */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:'rgba(255,255,255,.2)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <img src="/logo.png" alt="YllaCash" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e=>e.target.style.display='none'}/>
            </div>
            <span style={{ fontSize:18, fontWeight:800 }}>YllaCash</span>
            {eventMeta && (
              <div style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:6, background:'rgba(255,255,255,.18)', maxWidth:120, overflow:'hidden' }}>
                {eventMeta.logoSrc
                  ? <img src={eventMeta.logoSrc} alt="" style={{ width:12, height:12, borderRadius:2, objectFit:'cover', flexShrink:0 }}/>
                  : <span style={{ fontSize:10, flexShrink:0 }}>{eventMeta.emoji||'🎵'}</span>}
                <span style={{ fontSize:11, fontWeight:700, color:'#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{eventMeta.nom}</span>
              </div>
            )}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            {fromArtiste && artisteCreneauId && eventId && (
              <button onClick={() => { window.location.href = '/artiste?ev=' + eventId + '&cr=' + artisteCreneauId }}
                title="Retour à mon espace artiste"
                style={{ width:34, height:34, borderRadius:8, border:'1px solid rgba(255,255,255,.3)', background:'rgba(255,255,255,.15)', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>
                🎤
              </button>
            )}
            {spec && <NotifBell notifications={notifications} nonLuCount={nonLuCount} onMarkAllRead={marquerToutLu}/>}
            <ThemeToggle variant="dark"/>
          </div>
        </div>
      </div>

      <div style={s.wrap}>
        {/* ── Identification ── */}
        {!spec && (
          <div style={{ ...s.card, boxShadow:'0 4px 24px rgba(0,0,0,.1)' }}>
            <div style={{ fontSize:20, fontWeight:800, color:'var(--text)', marginBottom:6 }}>Consultez votre solde</div>
            <div style={{ fontSize:14, color:'var(--muted)', marginBottom:20, lineHeight:1.5 }}>Entrez l'identifiant de votre QR code festival</div>
            {loading ? (
              <div style={{ textAlign:'center', padding:'24px 0', color:'var(--muted)' }}>Recherche…</div>
            ) : (
              <>
                <div style={{ display:'flex', gap:10, marginBottom:12 }}>
                  <input value={inputId} onChange={e=>setInputId(e.target.value.toUpperCase())}
                    onKeyDown={e=>e.key==='Enter'&&findSpec()} placeholder="FY-XXXX"
                    autoCapitalize="characters"
                    style={{ ...s.inp, flex:1, letterSpacing:'.08em', fontWeight:700, fontSize:18 }}/>
                  <button onClick={()=>findSpec()} style={{ minHeight:48, width:52, background:themeColor, color:'#fff', border:'none', borderRadius:12, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Search size={20}/>
                  </button>
                </div>
                {err && <div style={{ padding:'12px 14px', background:RED_L, borderRadius:10, fontSize:14, color:RED, fontWeight:500 }}>{err}</div>}
              </>
            )}
          </div>
        )}

        {spec && (
          <React.Fragment>

            {/* ── Tabs ── */}
            <style>{`
              .yllacash-tab-label { display: inline; }
              .yllacash-tabs button { display: flex; align-items: center; justify-content: center; }
              @media (max-width: 480px) {
                .yllacash-tab-label { display: block; font-size: 9px !important; margin-top: 3px; line-height: 1.1; }
                .yllacash-tabs button {
                  flex-direction: column !important;
                  min-height: 58px !important;
                  padding: 6px 2px !important;
                  gap: 0 !important;
                }
                .yllacash-tabs button svg { width: 18px !important; height: 18px !important; flex-shrink: 0; }
                .yllacash-tabs button span[style*='font-size:16'] { font-size: 18px !important; line-height: 1; }
                .yllacash-tabs button span[style*='fontSize:16'] { font-size: 18px !important; line-height: 1; }
                .yllacash-tabs button span[style*='marginLeft'] { margin-left: 0 !important; }
              }
            `}</style>
            <div className="yllacash-tabs" style={{ display:'flex', background:'var(--bg)', borderRadius:12, marginBottom:12, border:'0.5px solid var(--border)', overflow:'hidden' }}>
              <button style={s.tab('accueil')}    onClick={()=>setTab('accueil')}>
                <span style={{ fontSize:16 }}>🏠</span><span className="yllacash-tab-label"> Accueil</span>
              </button>
              <button style={s.tab('historique')} onClick={()=>setTab('historique')}>
                <Clock size={14}/><span className="yllacash-tab-label" style={{ marginLeft:3 }}>Historique</span>
              </button>
              <button style={s.tab('reserver')} onClick={()=>setTab('reserver')}>
                <span style={{ fontSize:16 }}>🍽️</span><span className="yllacash-tab-label"> Réserver</span>
              </button>
              <button style={s.tab('reservations')} onClick={()=>setTab('reservations')}>
                <Bookmark size={14}/><span className="yllacash-tab-label" style={{ marginLeft:3 }}>Mes résa</span>
              </button>
              <button style={s.tab('programme')} onClick={() => { setTab('programme'); if (nonLuPlanning > 0) marquerToutLu() }}>
                <CalendarDays size={14}/><span className="yllacash-tab-label" style={{ marginLeft:3 }}>Programme</span>
                {nonLuPlanning > 0 && (
                  <span style={{ position:'absolute', top:6, right:6, minWidth:15, height:15, padding:'0 4px', borderRadius:8, background:themeColor, color:'#fff', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 6px rgba(0,0,0,.2)' }}>
                    {nonLuPlanning}
                  </span>
                )}
              </button>
            </div>

            {/* Contenu — animation entre les onglets */}
            <PageTransition pageKey={tab}>

            {/* ══════════════════════════════════
                ONGLET ACCUEIL
            ══════════════════════════════════ */}
            {tab === 'accueil' && (
              <>
                {/* Carte profil + QR */}
                <div style={{ ...s.card, textAlign:'center', boxShadow:'0 4px 24px rgba(0,0,0,.1)', padding:'20px 16px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:4 }}>
                    <div style={{ fontSize:18, fontWeight:800, color:'var(--text)' }}>{spec.nom}</div>
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)', fontFamily:'monospace', marginBottom:14 }}>{spec.id}</div>
                  {qrDataUrl && (
                    <div style={{ display:'flex', justifyContent:'center', marginBottom:12 }}>
                      <img src={qrDataUrl} alt="QR" onClick={openQr}
                        style={{ width:130, height:130, borderRadius:14, cursor:'pointer' }}/>
                    </div>
                  )}
                  <div style={{ display:'inline-flex', alignItems:'center', gap:10, background:BRAND_L, borderRadius:16, padding:'14px 28px', marginBottom:8 }}>
                    <Wallet size={24} style={{ color:'var(--brand-dark)', flexShrink:0 }}/>
                    <span style={{ fontSize:32, fontWeight:800, color:'var(--brand-dark)' }}>{fmt(spec.solde||0)}</span>
                  </div>
                  <div style={{ fontSize:13, color:'var(--muted)', marginBottom:14 }}>solde disponible</div>
                  <button onClick={()=>{ setSpec(null); setInputId(''); setTxs([]); setResas([]); setQtys({}) }}
                    style={{ fontSize:13, color:'var(--muted)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', padding:8 }}>
                    Changer de compte
                  </button>
                </div>

                {/* Résumé financier */}
                <div style={s.card}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:12 }}>Résumé du compte</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    {[
                      { label:'Total rechargé',   value:fmt(totalRecharge),  color:GREEN,   bg:GREEN_L  },
                      { label:'Total dépensé',     value:fmt(totalDepense),   color:RED,     bg:RED_L    },
                      { label:'Transactions',      value:txTotal,             color:BRAND_D, bg:BRAND_L  },
                      { label:'Réservations',      value:nbResas,             color:PURPLE,  bg:PURPLE_L },
                    ].map(({ label, value, color, bg }) => (
                      <div key={label} style={{ background:bg, borderRadius:12, padding:'12px 14px' }}>
                        <div style={{ fontSize:11, fontWeight:600, color, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>{label}</div>
                        <div style={{ fontSize:20, fontWeight:800, color }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bascule liste / graphe + aperçu */}
                <div style={s.card}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>Activité récente</div>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={()=>setChartMode(false)}
                        style={{ display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:8, border:'0.5px solid var(--border)', background:!chartMode?BRAND:'var(--bg)', color:!chartMode?'#fff':'var(--muted)', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                        <LayoutList size={13}/> Liste
                      </button>
                      <button onClick={()=>setChartMode(true)}
                        style={{ display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:8, border:'0.5px solid var(--border)', background:chartMode?BRAND:'var(--bg)', color:chartMode?'#fff':'var(--muted)', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                        <BarChart2 size={13}/> Graphe
                      </button>
                    </div>
                  </div>

                  {txs.length === 0 ? (
                    <div style={{ textAlign:'center', padding:'24px 0', color:'var(--muted)', fontSize:14 }}>Aucune transaction</div>
                  ) : chartMode ? (
                    /* Vue graphe interactif */
                    <SoldeChart
                      timeline={timeline}
                      maxBal={maxBal}
                      hoverIdx={hoverIdx}
                      setHoverIdx={setHoverIdx}
                      zoom={chartZoom}
                      setZoom={setChartZoom}
                      fmt={fmt}
                    />
                  ) : (
                    /* Vue liste — 5 dernières transactions */
                    <>
                      {txTriees.slice(0,5).map((t,i) => (
                        <TxRow key={i} t={t} i={i} last={i===Math.min(4,txs.length-1)}/>
                      ))}
                      {txs.length > 5 && (
                        <button onClick={()=>setTab('historique')}
                          style={{ marginTop:10, width:'100%', padding:'8px', border:'0.5px solid var(--border)', borderRadius:10, background:'var(--bg2)', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:'system-ui' }}>
                          Voir tout l'historique ({txTotal} transactions) →
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}

            {/* ══════════════════════════════════
                ONGLET HISTORIQUE
            ══════════════════════════════════ */}
            {tab === 'historique' && (
              <div style={s.card}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>Historique des transactions</div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{txTotal} au total</div>
                </div>
                {txTotal === 0 ? (
                  <div style={{ textAlign:'center', padding:'24px 0', color:'var(--muted)', fontSize:14 }}>Aucune transaction</div>
                ) : (
                  <>
                    {txSlice.map((t,i) => (
                      <TxRow key={i} t={t} i={i} last={i===txSlice.length-1}/>
                    ))}
                    <div style={{ fontSize:11, color:'var(--muted)', textAlign:'center', marginTop:10 }}>
                      {(txPage-1)*PAGE_SIZE+1}–{Math.min(txPage*PAGE_SIZE,txTotal)} sur {txTotal}
                    </div>
                    <Pagination page={txPage} pages={txPages} onChange={p=>{setTxPage(p);window.scrollTo(0,0)}}/>
                  </>
                )}
              </div>
            )}

            {/* ══════════════════════════════════
                ONGLET RÉSERVER
            ══════════════════════════════════ */}
            {tab === 'reserver' && (
              <>
                <div style={{ padding:'12px 14px', background:AMBER_L, border:`0.5px solid #EF9F27`, borderRadius:12, fontSize:13, color:'#633806', marginBottom:12, lineHeight:1.5 }}>
                  Commandez à l'avance. Le stand prépare, vous récupérez quand c'est prêt — paiement au retrait.
                </div>
                {resaDone ? (
                  <div style={s.card}>
                    <div style={{ textAlign:'center', padding:'8px 0 16px' }}>
                      <div style={{ fontSize:40, marginBottom:8 }}>✅</div>
                      <div style={{ fontSize:18, fontWeight:800, color:'var(--text)', marginBottom:4 }}>Réservation confirmée !</div>
                      <div style={{ fontFamily:'monospace', fontSize:14, color:'var(--muted)', marginBottom:16 }}>Code : <strong>{resaDone.code}</strong></div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      <button onClick={()=>{ setResaDone(null); setTab('reservations') }} style={s.btnSec}>Voir mes réservations</button>
                      <button onClick={()=>setResaDone(null)} style={s.btnPrim}>Réserver encore</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {[...new Set(menu.map(m=>m.cat))].map(cat=>(
                      <div key={cat} style={s.card}>
                        <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:12 }}>{cat}</div>
                        {menu.filter(m=>m.cat===cat).map((m,mi,arr)=>(
                          <div key={m.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:mi<arr.length-1?'0.5px solid #f1f5f9':'none', opacity:(m.stock||0)===0?0.4:1 }}>
                            <div style={{ flex:1, minWidth:0, paddingRight:12 }}>
                              <div style={{ fontSize:15, fontWeight:600, color:'var(--text)' }}>{m.nom}</div>
                              <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:3 }}>
                                <span style={{ fontSize:15, fontWeight:800, color:BRAND_D }}>{fmt(m.prix||0)}</span>
                                {(m.stock||0)===0
                                  ? <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:10, background:RED_L, color:RED }}>Rupture</span>
                                  : (m.stock||0)<=10
                                  ? <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:10, background:AMBER_L, color:AMBER }}>{m.stock} restant{(m.stock||0)>1?'s':''}</span>
                                  : null}
                              </div>
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                              <button onClick={()=>changeQty(m.id,-1)} disabled={(qtys[m.id]||0)===0} style={s.qtyBtn((qtys[m.id]||0)>0,false)}>−</button>
                              <span style={{ width:28, textAlign:'center', fontSize:17, fontWeight:800, color:'var(--text)' }}>{qtys[m.id]||0}</span>
                              <button onClick={()=>changeQty(m.id,1)} disabled={(m.stock||0)===0||(qtys[m.id]||0)>=(m.stock||0)} style={s.qtyBtn((m.stock||0)>0&&(qtys[m.id]||0)<(m.stock||0),true)}>+</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                    {cartItems.length>0 && (
                      <div style={{ ...s.card, border:`2px solid ${BRAND}` }}>
                        <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:12 }}>Ma réservation</div>
                        {cartItems.map(i=>(
                          <div key={i.id} style={{ display:'flex', justifyContent:'space-between', fontSize:14, padding:'5px 0', borderBottom:'0.5px solid #f1f5f9', color:'var(--text)' }}>
                            <span>{i.nom} <span style={{ color:'var(--muted)' }}>×{i.qty}</span></span>
                            <span style={{ fontWeight:700 }}>{fmt((i.prix||0)*i.qty)}</span>
                          </div>
                        ))}
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:18, fontWeight:800, margin:'14px 0 10px', color:'var(--text)' }}>
                          <span>Total</span>
                          <span style={{ color:BRAND_D }}>{fmt(cartTotal)}</span>
                        </div>
                        {resaErr && <div style={{ padding:'10px 12px', background:RED_L, borderRadius:10, fontSize:13, color:RED, marginBottom:12 }}>{resaErr}</div>}
                        <button onClick={doResa} disabled={resaLoading} style={{ ...s.btnPrim, opacity:resaLoading?.7:1 }}>
                          {resaLoading?'Réservation en cours…':'Confirmer la réservation'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* ══════════════════════════════════
                ONGLET PROGRAMME
            ══════════════════════════════════ */}
            {tab === 'programme' && (
              <PlanningSpec planning={planningData} eventId={eventId} specId={spec?.id} themeColor={themeColor} />
            )}

            {/* ══════════════════════════════════
                ONGLET MES RÉSA
            ══════════════════════════════════ */}
            {tab === 'reservations' && (
              <div style={s.card}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>Mes réservations</div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{resaTotal} au total</div>
                </div>
                {resaTotal === 0 ? (
                  <div style={{ textAlign:'center', padding:'24px 0', color:'var(--muted)', fontSize:14 }}>Aucune réservation</div>
                ) : (
                  <>
                    {resaSlice.map(r => {
                      const statusMap = {
                        ready:     { label:'✅ Prête !',         color:BRAND_D,    bg:BRAND_L,   border:'#5DCAA5' },
                        processing:{ label:'👨‍🍳 En préparation', color:PURPLE,     bg:PURPLE_L,  border:PURPLE    },
                        collected: { label:'📦 Retirée',         color:'#64748b',  bg:'#f8fafc', border:'#e2e8f0' },
                        cancelled: { label:'❌ Annulée',         color:RED,        bg:RED_L,     border:RED       },
                        pending:   { label:'🕐 En attente',      color:AMBER,      bg:AMBER_L,   border:'#EF9F27' },
                      }
                      const st = statusMap[r.status] || statusMap.pending
                      return (
                        <div key={r.id} style={{ border:`1px solid ${st.border}`, borderRadius:12, padding:14, marginBottom:10, background:st.bg }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6, gap:8 }}>
                            <span style={{ fontWeight:700, fontSize:14, color:'var(--text)', lineHeight:1.3 }}>
                              {(r.items||[]).map(i=>i.nom+(i.qty>1?` ×${i.qty}`:'')).join(', ')}
                            </span>
                            <span style={{ fontSize:11, fontWeight:800, flexShrink:0, color:st.color }}>{st.label}</span>
                          </div>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:r.status==='pending'?10:0 }}>
                            <span style={{ fontSize:12, fontFamily:'monospace', color:'var(--muted)' }}>Code : <strong>{r.code}</strong></span>
                            <span style={{ fontWeight:800, color:'var(--text)', fontSize:16 }}>{fmt(r.total||0)}</span>
                          </div>
                          {r.date && <div style={{ fontSize:11, color:'var(--muted)', marginBottom:r.status==='pending'?8:0 }}>{r.date}</div>}
                          {r.status==='ready' && (
                            <div style={{ fontSize:13, color:BRAND_D, fontWeight:600, marginTop:6, lineHeight:1.4 }}>
                              Présentez votre QR code au stand pour récupérer et payer.
                            </div>
                          )}
                          {r.status==='pending' && (
                            <button onClick={()=>annuler(r.id)}
                              style={{ minHeight:40, padding:'0 16px', background:RED_L, color:RED, border:`1px solid #F09595`, borderRadius:10, fontSize:13, cursor:'pointer', fontWeight:600 }}>
                              Annuler
                            </button>
                          )}
                        </div>
                      )
                    })}
                    <div style={{ fontSize:11, color:'var(--muted)', textAlign:'center', marginTop:10 }}>
                      {(resaPage-1)*PAGE_SIZE+1}–{Math.min(resaPage*PAGE_SIZE,resaTotal)} sur {resaTotal}
                    </div>
                    <Pagination page={resaPage} pages={resaPages} onChange={p=>{setResaPage(p);window.scrollTo(0,0)}}/>
                    <button onClick={()=>setTab('reserver')} style={{ ...s.btnPrim, marginTop:12 }}>+ Nouvelle réservation</button>
                  </>
                )}
              </div>
            )}

            </PageTransition>

            {/* Modale QR agrandi */}
            {qrOpen && qrDataUrl && (
              <div onClick={closeQr} style={{ position:'fixed', inset:0, zIndex:300, background:'var(--bg)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:20 }}>
                <div style={{ fontSize:14, fontWeight:700, color:BRAND_D, marginBottom:8 }}>{spec?.nom}</div>
                <div style={{ fontSize:12, fontFamily:'monospace', color:'var(--muted)', marginBottom:20 }}>{spec?.id}</div>
                <img src={qrDataUrl} alt="QR" style={{ width:'min(85vw,380px)', height:'min(85vw,380px)', borderRadius:16 }}/>
                <div style={{ marginTop:24, fontSize:13, color:'var(--muted)' }}>Appuyez n'importe où pour fermer</div>
                <button onClick={closeQr} style={{ marginTop:16, padding:'10px 28px', background:BRAND, color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer' }}>Fermer</button>
              </div>
            )}

          </React.Fragment>
        )}
      </div>

      {/* Footer À propos */}
      <div style={{ textAlign:'center', padding:'20px 16px 32px', fontFamily:'system-ui,sans-serif' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,.5)' }}>{APP_FULL_LABEL}</div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,.35)', marginTop:2 }}>
          Développée par <strong style={{ color:'rgba(255,255,255,.5)' }}>Maison Ylla</strong>
        </div>
        <div style={{ marginTop: 8 }}>
          <CheckUpdateButton variant="compact"/>
        </div>
        <div style={{ fontSize:10, color:'rgba(255,255,255,.25)', marginTop:6, fontStyle:'italic', maxWidth:280, margin:'6px auto 0' }}>
          "Toute la gestion financière de votre événement en un seul endroit, et bien plus encore"
        </div>
      </div>
    </div>
  )
}
