/**
 * pages/public/spectateur/PlanningSpec.jsx — programme du festival côté spectateur
 * (fiche artiste, favoris, filtres). Déplacé tel quel depuis SoldePage.jsx (lot 3).
 */
import React, { useEffect } from 'react'
import { fmt } from '../../../utils/helpers'
import { toast } from '../../../ui'
import { BRAND, AMBER, RED, GREEN, GREEN_L } from './colors'

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
                navigator.clipboard?.writeText(text + '\n' + window.location.href).then(() => toast.success('Lien copié')).catch(() => {})
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
            <button key={m.v} onClick={() => setViewMode(m.v)} aria-pressed={active}
              style={{
                flex:1, padding:'8px 4px', minHeight:36,
                background: active ? 'var(--brand)' : 'transparent',
                color: active ? 'var(--on-brand)' : 'var(--muted)',
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


export default PlanningSpec
