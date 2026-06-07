/**
 * pages/public/LivePlanning.jsx — v5
 * Affichage live du planning — URL publique /live?ev=EVENT_ID
 */
import React, { useState, useEffect } from 'react'
import { db } from '../../firebase/config'
import { getSettings } from '../../firebase/service'
import { collection, query, orderBy, onSnapshot, getDoc, doc } from 'firebase/firestore'
import { MapPin, Clock, ChevronRight, X, Search, Rows3, GitCommitVertical, Ticket, LayoutGrid, Image as ImageIcon } from 'lucide-react'
import ThemeToggle from '../../components/ThemeToggle'
import { useTheme } from '../../hooks/useTheme'
import { APP_FULL_LABEL } from '../../utils/buildInfo'

const BRAND  = '#1a6b7a'
const TYPES  = {
  musical:           { icon: '🎵', label: 'Musical',    color: '#1a6b7a' },
  litteraire:        { icon: '📚', label: 'Littéraire', color: '#534AB7' },
  cinematographique: { icon: '🎬', label: 'Cinéma',     color: '#BA7517' },
  autre:             { icon: '🎭', label: 'Autre',       color: '#6b6b6b' },
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
  if (m >= 60) return Math.floor(m/60) + 'h' + (m%60 > 0 ? String(m%60).padStart(2,'0') : '')
  return m + 'min'
}

// Date "Vendredi 12 juin" pour les séparateurs de jour (vue timeline)
function fmtDate(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Clé jour pour regrouper (YYYY-MM-DD)
function dayKey(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')
}

function countdown(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  const diff = Math.max(0, Math.round((d.getTime() - Date.now()) / 1000))
  if (isNaN(diff)) return ''
  if (diff === 0) return 'Maintenant'
  const j = Math.floor(diff / 86400)
  const h = Math.floor((diff % 86400) / 3600)
  const m = Math.floor((diff % 3600) / 60)
  if (j > 0) {
    // ≥ 24h → format "Dans 1j 02h05" (ou "Dans 1j 02h" si pile)
    const hh = String(h).padStart(2, '0')
    const mm = String(m).padStart(2, '0')
    return 'Dans ' + j + 'j ' + hh + 'h' + (m > 0 ? mm : '')
  }
  if (h > 0) return 'Dans ' + h + 'h' + String(m).padStart(2, '0')
  if (m > 0) return 'Dans ' + m + 'min'
  return 'Dans ' + diff + 's'
}

function autoStatut(cr) {
  if (cr.statut === 'annule') return 'annule'
  const now = Date.now()
  const d = cr.debut?.toDate ? cr.debut.toDate().getTime() : cr.debut ? new Date(cr.debut).getTime() : NaN
  const f = cr.fin?.toDate   ? cr.fin.toDate().getTime()   : cr.fin   ? new Date(cr.fin).getTime()   : NaN
  if (isNaN(d) || isNaN(f)) return cr.statut || 'a-venir'
  if (now < d) return 'a-venir'
  if (now >= d && now <= f) return 'en-cours'
  return 'termine'
}

// ════════════════════════════════════════════════════════════════
// COMPOSANTS DE CARTE — un par mode de vue
// ════════════════════════════════════════════════════════════════

// 1 — Compact : bordure latérale couleur + heure à gauche
function CardCompact({ cr, st, dim, ti, onOpen }) {
  const isLive = st === 'en-cours'
  return (
    <div onClick={onOpen} style={{
      background:'var(--bg)', borderRadius:'var(--radius-lg)',
      border:'1px solid ' + (isLive ? ti.color + '88' : 'var(--border)'),
      borderLeft:'4px solid ' + ti.color,
      opacity: dim ? .55 : 1,
      display:'flex', alignItems:'stretch', cursor:'pointer',
      transition:'opacity .2s',
      boxShadow: isLive ? '0 4px 16px ' + ti.color + '22' : 'none',
      overflow:'hidden',
    }}>
      <div style={{ padding:'12px 10px', minWidth:72, textAlign:'center', borderRight:'1px dashed var(--border)', background:'var(--bg2)', display:'flex', flexDirection:'column', justifyContent:'center' }}>
        <div style={{ fontSize:18, fontWeight:800, color:'var(--text)', lineHeight:1, fontVariantNumeric:'tabular-nums', textDecoration: dim ? 'line-through' : 'none' }}>{fmt2(cr.debut)}</div>
        {duree(cr.debut, cr.fin) && <div style={{ fontSize:10, color:'var(--muted)', marginTop:3, fontWeight:600 }}>{duree(cr.debut, cr.fin)}</div>}
      </div>
      <div style={{ flex:1, padding:'12px 14px', minWidth:0 }}>
        {isLive && <span style={{ fontSize:9, fontWeight:800, padding:'1px 6px', borderRadius:4, background:'var(--green-light)', color:'var(--green-dark)', letterSpacing:'0.05em', display:'inline-block', marginBottom:4 }}>▶ EN COURS</span>}
        {cr.statut === 'annule' && <span style={{ fontSize:9, fontWeight:800, padding:'1px 6px', borderRadius:4, background:'var(--red-light)', color:'var(--red-dark)', display:'inline-block', marginBottom:4 }}>ANNULÉ</span>}
        <div style={{ fontSize:15, fontWeight:800, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', lineHeight:1.2 }}>{cr.artiste}</div>
        <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, display:'flex', gap:8, flexWrap:'wrap' }}>
          <span style={{ color: ti.color, fontWeight:700 }}>{ti.icon} {ti.label}</span>
          {cr.scene && <span>· {cr.scene}</span>}
        </div>
        {st === 'a-venir' && cr.statut !== 'annule' && countdown(cr.debut) && (
          <div style={{ fontSize:11, color:'var(--brand)', fontWeight:700, marginTop:4 }}>{countdown(cr.debut)}</div>
        )}
      </div>
    </div>
  )
}

// 2 — Photo dominante (vue par défaut)
function CardPhoto({ cr, st, dim, ti, onOpen }) {
  const isLive = st === 'en-cours'
  const hasPhoto = !!cr.photo
  return (
    <div onClick={onOpen} style={{
      background:'var(--bg)', borderRadius:'var(--radius-lg)', overflow:'hidden',
      border:'1px solid ' + (isLive ? ti.color + 'AA' : 'var(--border)'),
      opacity: dim ? .55 : 1, cursor:'pointer',
      boxShadow: isLive ? '0 6px 20px ' + ti.color + '33' : '0 1px 3px rgba(0,48,72,0.04)',
    }}>
      <div style={{
        position:'relative',
        height: hasPhoto ? 140 : 92,
        background: hasPhoto ? '#000' : 'linear-gradient(135deg, ' + ti.color + ' 0%, ' + ti.color + 'CC 100%)',
        display:'flex', alignItems:'flex-end',
      }}>
        {hasPhoto && (
          <img loading="lazy" src={cr.photo} alt={cr.artiste}
            style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', objectPosition: cr.photoPosition || 'center center' }}/>
        )}
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg, rgba(0,0,0,0.10) 0%, transparent 35%, rgba(0,0,0,0.60) 100%)' }}/>
        <div style={{ position:'absolute', top:10, left:10, display:'flex', gap:6, flexWrap:'wrap' }}>
          {isLive && <span style={{ background:'var(--green-light)', color:'var(--green-dark)', fontSize:9, fontWeight:800, padding:'3px 8px', borderRadius:4 }}>▶ EN COURS</span>}
          {cr.statut === 'annule' && <span style={{ background:'var(--red-light)', color:'var(--red-dark)', fontSize:9, fontWeight:800, padding:'3px 8px', borderRadius:4 }}>ANNULÉ</span>}
          {st === 'a-venir' && cr.statut !== 'annule' && countdown(cr.debut) && (
            <span style={{ background:'rgba(255,248,242,0.95)', color:'var(--brand-dark)', fontSize:9, fontWeight:800, padding:'3px 8px', borderRadius:4 }}>{countdown(cr.debut).toUpperCase()}</span>
          )}
        </div>
        <span style={{ position:'absolute', top:10, right:10, background:'rgba(255,248,242,0.95)', color:'var(--text)', fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:4 }}>{ti.icon} {ti.label}</span>
        {!hasPhoto && <div style={{ position:'absolute', top:14, left:'50%', transform:'translateX(-50%)', fontSize:32, opacity:0.50 }}>{ti.icon}</div>}
        <div style={{ position:'relative', padding:'12px 14px', color:'#fff', zIndex:1, width:'100%', minWidth:0 }}>
          <div style={{ fontSize: hasPhoto ? 18 : 15, fontWeight:800, lineHeight:1.15, marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textShadow:'0 1px 2px rgba(0,0,0,0.4)' }}>{cr.artiste}</div>
          <div style={{ fontSize:11, opacity:0.95, display:'flex', gap:10, flexWrap:'wrap', textShadow:'0 1px 2px rgba(0,0,0,0.4)' }}>
            <span>🕐 {fmt2(cr.debut)} → {fmt2(cr.fin)}{duree(cr.debut, cr.fin) ? ' · ' + duree(cr.debut, cr.fin) : ''}</span>
            {cr.scene && <span>📍 {cr.scene}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

// 3 — Item timeline (la ligne verticale est gérée par le wrapper parent)
function CardTimeline({ cr, st, dim, ti, onOpen }) {
  const isLive = st === 'en-cours'
  return (
    <div style={{ position:'relative', paddingLeft:38, marginBottom:14, opacity: dim ? .55 : 1 }}>
      <div style={{
        position:'absolute', left: isLive ? 5 : 7, top:8,
        width: isLive ? 18 : 14, height: isLive ? 18 : 14,
        borderRadius:'50%',
        background: isLive ? ti.color : (dim ? 'var(--bg)' : ti.color),
        border: isLive ? '3px solid var(--bg)' : '2px solid var(--bg)',
        boxShadow: isLive ? '0 0 0 2px ' + ti.color + ', 0 0 0 6px ' + ti.color + '33' : 'none',
      }}>
        {dim && <div style={{ position:'absolute', inset:1, borderRadius:'50%', background:'var(--bg)', border:'1px solid var(--border)' }}/>}
      </div>
      <div style={{ fontSize:11, fontWeight:700, color: isLive ? ti.color : 'var(--muted)', marginBottom:3, letterSpacing:isLive?'0.05em':'normal', textTransform:isLive?'uppercase':'none' }}>
        {isLive ? '▶ MAINTENANT · ' : ''}{fmt2(cr.debut)}
        {st === 'a-venir' && countdown(cr.debut) && <span style={{ color:'var(--brand)', marginLeft:6 }}>· {countdown(cr.debut)}</span>}
        {cr.statut === 'annule' && <span style={{ color:'var(--red-dark)', marginLeft:6 }}>· Annulé</span>}
      </div>
      <div onClick={onOpen} style={{
        background:'var(--bg)', borderRadius:'var(--radius-md)', cursor:'pointer',
        border: isLive ? '1.5px solid ' + ti.color : '1px solid var(--border)',
        boxShadow: isLive ? '0 2px 12px ' + ti.color + '33' : 'none',
        padding:'10px 12px',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {cr.photo && (
            <img loading="lazy" src={cr.photo} alt="" style={{ width:36, height:36, borderRadius:6, objectFit:'cover', objectPosition: cr.photoPosition || 'center center', flexShrink:0 }}/>
          )}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textDecoration: dim ? 'line-through' : 'none' }}>{cr.artiste}</div>
            <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>
              {ti.icon} {duree(cr.debut, cr.fin) && duree(cr.debut, cr.fin) + ' · '}{cr.scene || ti.label}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// 4 — Ticket de festival déchiré
function CardTicket({ cr, st, dim, ti, onOpen }) {
  const isLive  = st === 'en-cours'
  const jourTxt = cr.debut ? (cr.debut.toDate ? cr.debut.toDate() : new Date(cr.debut)).toLocaleDateString('fr-FR', { weekday:'long' }).toUpperCase() : ''
  return (
    <div onClick={onOpen} style={{
      cursor:'pointer', opacity: dim ? .55 : 1,
      filter: isLive ? 'drop-shadow(0 4px 14px ' + ti.color + '55)' : 'drop-shadow(0 2px 8px rgba(0,48,72,0.08))',
    }}>
      <div style={{
        background:'var(--bg)', borderRadius:10,
        border:'1px solid ' + (isLive ? ti.color + 'AA' : 'var(--border)'),
        overflow:'hidden', display:'flex',
      }}>
        <div style={{
          background: ti.color, color:'#fff',
          padding:'14px 8px', minWidth:80, textAlign:'center',
          display:'flex', flexDirection:'column', justifyContent:'center',
        }}>
          <div style={{ fontSize:9, fontWeight:700, opacity:0.85, letterSpacing:'0.08em', marginBottom:2 }}>{jourTxt}</div>
          <div style={{ fontSize:24, fontWeight:800, lineHeight:1, fontVariantNumeric:'tabular-nums', textDecoration: dim ? 'line-through' : 'none' }}>{fmt2(cr.debut)}</div>
          <div style={{ fontSize:10, opacity:0.85, marginTop:2 }}>→ {fmt2(cr.fin)}</div>
        </div>
        <div style={{ width:0, position:'relative', flexShrink:0 }}>
          <div style={{ position:'absolute', top:0, bottom:0, left:-6, width:12, background:'var(--bg2)' }}>
            <div style={{ position:'absolute', top:-7, left:0, width:12, height:12, borderRadius:'50%', background:'var(--bg2)' }}/>
            <div style={{ position:'absolute', bottom:-7, left:0, width:12, height:12, borderRadius:'50%', background:'var(--bg2)' }}/>
            <div style={{ position:'absolute', top:10, bottom:10, left:5, width:2, backgroundImage:'linear-gradient(180deg, var(--border2) 50%, transparent 50%)', backgroundSize:'2px 6px' }}/>
          </div>
        </div>
        <div style={{ flex:1, padding:'12px 14px', minWidth:0 }}>
          <div style={{ display:'flex', gap:5, alignItems:'center', marginBottom:5, flexWrap:'wrap' }}>
            {isLive && <span style={{ background:'var(--green-light)', color:'var(--green-dark)', fontSize:9, fontWeight:800, padding:'1px 6px', borderRadius:4 }}>▶ EN COURS</span>}
            {cr.statut === 'annule' && <span style={{ background:'var(--red-light)', color:'var(--red-dark)', fontSize:9, fontWeight:800, padding:'1px 6px', borderRadius:4 }}>ANNULÉ</span>}
            {st === 'a-venir' && cr.statut !== 'annule' && countdown(cr.debut) && (
              <span style={{ background:'var(--brand-light)', color:'var(--brand-dark)', fontSize:9, fontWeight:800, padding:'1px 6px', borderRadius:4 }}>{countdown(cr.debut).toUpperCase()}</span>
            )}
            <span style={{ fontSize:9, color:'var(--muted)', fontWeight:700, letterSpacing:'0.05em' }}>{ti.icon} {ti.label.toUpperCase()}</span>
          </div>
          <div style={{ fontSize:15, fontWeight:800, color:'var(--text)', lineHeight:1.15, marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cr.artiste}</div>
          {cr.scene && <div style={{ fontSize:11, color:'var(--muted)' }}>📍 {cr.scene}</div>}
        </div>
      </div>
    </div>
  )
}

// 5 — Grille 2 colonnes (cartes carrées)
function CardGrid({ cr, st, dim, ti, onOpen }) {
  const isLive = st === 'en-cours'
  const hasPhoto = !!cr.photo
  return (
    <div onClick={onOpen} style={{
      background:'var(--bg)', borderRadius:10, overflow:'hidden',
      border: isLive ? '1.5px solid ' + ti.color : '1px solid var(--border)',
      opacity: dim ? .55 : 1, cursor:'pointer',
      boxShadow: isLive ? '0 2px 10px ' + ti.color + '33' : 'none',
      display:'flex', flexDirection:'column',
    }}>
      <div style={{
        height:84, position:'relative',
        background: hasPhoto ? '#000' : 'linear-gradient(135deg, ' + ti.color + ' 0%, ' + ti.color + 'CC 100%)',
        display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:6,
      }}>
        {hasPhoto && (
          <img loading="lazy" src={cr.photo} alt=""
            style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', objectPosition: cr.photoPosition || 'center center' }}/>
        )}
        {!hasPhoto && <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, opacity:0.50 }}>{ti.icon}</div>}
        <div style={{ position:'relative', zIndex:1, display:'flex', gap:4 }}>
          {isLive && <span style={{ background:'#fff', color:'var(--green-dark)', fontSize:8, fontWeight:800, padding:'1px 5px', borderRadius:3 }}>▶ LIVE</span>}
          {cr.statut === 'annule' && <span style={{ background:'#fff', color:'var(--red-dark)', fontSize:8, fontWeight:800, padding:'1px 5px', borderRadius:3 }}>ANNULÉ</span>}
        </div>
        <span style={{ position:'relative', zIndex:1, background:'rgba(0,0,0,0.45)', color:'#fff', fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:3 }}>{ti.icon}</span>
      </div>
      <div style={{ padding:'8px 10px 10px', minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', fontVariantNumeric:'tabular-nums', lineHeight:1, textDecoration: dim ? 'line-through' : 'none' }}>{fmt2(cr.debut)}</div>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--text)', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cr.artiste}</div>
        {cr.scene && <div style={{ fontSize:9, color:'var(--muted)', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cr.scene}</div>}
      </div>
    </div>
  )
}

// ── Carte modale artiste ──────────────────────────────────────────────
function CarteArtiste({ cr, onClose }) {
  const ti = TYPES[cr.type] || TYPES.autre
  const latNum = parseFloat(cr.latitude)
  const lngNum = parseFloat(cr.longitude)
  const hasLocation = !isNaN(latNum) && !isNaN(lngNum) && (latNum !== 0 || lngNum !== 0)
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,.7)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'var(--bg)', borderRadius:'var(--radius-xl)', width:'100%', maxWidth:400, overflow:'hidden', boxShadow:'0 24px 80px rgba(0,0,0,.4)', border:'0.5px solid var(--border)' }}>
        {cr.photo ? (
          <div style={{ height:220, overflow:'hidden', position:'relative' }}>
            <img loading="lazy" src={cr.photo} alt={cr.artiste} style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition: cr.photoPosition || 'center center' }}/>
            <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top, rgba(0,0,0,.65) 0%, transparent 55%)' }}/>
            <button onClick={onClose} style={{ position:'absolute', top:12, right:12, width:32, height:32, borderRadius:8, background:'rgba(0,0,0,.45)', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <X size={16}/>
            </button>
            <div style={{ position:'absolute', bottom:14, left:16, right:16 }}>
              <div style={{ fontSize:22, fontWeight:800, color:'#fff' }}>{cr.artiste}</div>
              {cr.titre && <div style={{ fontSize:13, color:'rgba(255,255,255,.85)' }}>{cr.titre}</div>}
            </div>
          </div>
        ) : (
          <div style={{ background: ti.color, padding:'20px 20px 16px', position:'relative' }}>
            <button onClick={onClose} style={{ position:'absolute', top:12, right:12, width:32, height:32, borderRadius:8, background:'rgba(255,255,255,.20)', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <X size={16}/>
            </button>
            <div style={{ fontSize:36, marginBottom:8 }}>{ti.icon}</div>
            <div style={{ fontSize:22, fontWeight:800, color:'#fff' }}>{cr.artiste}</div>
            {cr.titre && <div style={{ fontSize:13, color:'rgba(255,255,255,.85)' }}>{cr.titre}</div>}
          </div>
        )}
        <div style={{ padding:'16px 20px 20px' }}>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom: cr.bio ? 12 : 0 }}>
            <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:6, background: ti.color + '22', color: ti.color }}>{ti.icon} {ti.label}</span>
            <span style={{ fontSize:11, color:'var(--muted)', display:'flex', alignItems:'center', gap:4 }}><Clock size={11}/>{fmt2(cr.debut)} → {fmt2(cr.fin)}</span>
            {cr.scene && <span style={{ fontSize:11, color:'var(--muted)', display:'flex', alignItems:'center', gap:4 }}><MapPin size={11}/>{cr.scene}</span>}
          </div>
          {cr.bio && <p style={{ fontSize:13, color:'var(--text)', lineHeight:1.7, marginBottom: cr.description ? 10 : 0 }}>{cr.bio}</p>}
          {cr.description && <p style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6, marginBottom:12 }}>{cr.description}</p>}
          {cr.liens && Object.entries(cr.liens).some(([,v]) => v) && (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom: hasLocation ? 12 : 0 }}>
              {Object.entries(cr.liens).filter(([,v]) => v).map(([k,v]) => (
                <a key={k} href={v} target="_blank" rel="noreferrer"
                  style={{ fontSize:12, fontWeight:700, padding:'6px 12px', borderRadius:8, background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--brand)', textDecoration:'none', textTransform:'capitalize' }}>
                  {k} ↗
                </a>
              ))}
            </div>
          )}
          {hasLocation && (() => {
            // Coordonnées peuvent venir en string depuis Firestore — toujours parser
            const lat = parseFloat(cr.latitude)
            const lng = parseFloat(cr.longitude)
            if (isNaN(lat) || isNaN(lng)) return null
            // Bbox autour du point (zoom équivalent ~15)
            const d = 0.005
            const bbox = (lng - d) + ',' + (lat - d) + ',' + (lng + d) + ',' + (lat + d)
            const src = 'https://www.openstreetmap.org/export/embed.html?bbox=' + encodeURIComponent(bbox) + '&layer=mapnik&marker=' + lat + ',' + lng
            const openUrl = 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lng + '#map=16/' + lat + '/' + lng
            return (
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', marginBottom:6 }}>📍 Lieu du festival</div>
                <iframe
                  title="Localisation"
                  width="100%" height="180"
                  loading="lazy"
                  style={{ border:'none', borderRadius:12, display:'block' }}
                  src={src}
                />
                <a href={openUrl} target="_blank" rel="noreferrer"
                  style={{ display:'inline-flex', alignItems:'center', gap:4, marginTop:6, fontSize:11, color:'var(--brand)', fontWeight:600, textDecoration:'none' }}>
                  Ouvrir dans une carte ↗
                </a>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────────────
export default function LivePlanning() {
  useTheme()

  // Mode sombre forcé pour la vue grand écran (lisible la nuit)
  React.useEffect(() => {
    const html = document.documentElement
    const prev = html.getAttribute('data-theme')
    html.setAttribute('data-theme', 'dark')
    return () => {
      if (prev) html.setAttribute('data-theme', prev)
      else html.removeAttribute('data-theme')
    }
  }, [])
  const params  = new URLSearchParams(window.location.search)
  const eventId = params.get('ev') || null

  const [planning, setPlanning]     = useState(() => {
    try {
      const cached = localStorage.getItem('yllacash-planning-' + eventId)
      if (cached) {
        const parsed = JSON.parse(cached)
        return parsed.map(cr => ({ ...cr, debut: cr.debut ? new Date(cr.debut) : null, fin: cr.fin ? new Date(cr.fin) : null }))
      }
    } catch {}
    return []
  })
  const [themeColor, setThemeColor] = useState(BRAND)
  const [now, setNow]               = useState(Date.now())
  const [carteOpen, setCarteOpen]   = useState(null)
  const [filterType, setFilterType] = useState('tous')
  const [search, setSearch]         = useState('')
  const [eventMeta, setEventMeta]   = useState(null)
  const [viewMode, setViewMode]     = useState(() => {
    try {
      const saved = localStorage.getItem('yllacash-planning-view')
      // 5 vues : 'compact' (Piste 1) | 'photo' (Piste 2, défaut) | 'timeline' (Piste 3) | 'ticket' (Piste 4) | 'grid' (Piste 5)
      if (['compact','photo','timeline','ticket','grid'].includes(saved)) return saved
    } catch {}
    return 'photo'
  })
  const listRef  = React.useRef(null)

  // Persiste le choix de vue
  useEffect(() => {
    try { localStorage.setItem('yllacash-planning-view', viewMode) } catch {}
  }, [viewMode])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Charger le thème
  useEffect(() => {
    if (!eventId) return
    getSettings(eventId).then(s => {
      if (s?.theme?.brand) {
        setThemeColor(s.theme.brand)
        document.documentElement.style.setProperty('--brand', s.theme.brand)
      }
    }).catch(() => {})
  }, [eventId])

  // Charger le planning
  useEffect(() => {
    if (!eventId) return
    const col = collection(db, 'events', eventId, 'planning')
    const q   = query(col, orderBy('debut', 'asc'))
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id }))
      setPlanning(data)
      try {
        const serializable = data.map(cr => ({
          ...cr,
          debut: cr.debut?.toDate ? cr.debut.toDate().toISOString() : cr.debut,
          fin:   cr.fin?.toDate   ? cr.fin.toDate().toISOString()   : cr.fin
        }))
        localStorage.setItem('yllacash-planning-' + eventId, JSON.stringify(serializable))
      } catch {}
    })
    return unsub
  }, [eventId])

  // Charger les méta de l'événement
  useEffect(() => {
    if (!eventId) return
    getDoc(doc(db, 'events', eventId)).then(s => s.exists() && setEventMeta(s.data())).catch(() => {})
  }, [eventId])

  const enCours  = planning.filter(c => autoStatut(c) === 'en-cours')
  const aVenir   = planning.filter(c => autoStatut(c) === 'a-venir')
  const prochain = aVenir[0] || null

  const allTypes = [...new Set(planning.map(p => p.type).filter(Boolean))]

  // Filtre type
  const baseFiltered = filterType === 'tous' ? planning : planning.filter(p => p.type === filterType)

  // Filtre recherche : normalise (lowercase + sans accents) et cherche dans plusieurs champs
  const normalize = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const q = normalize(search.trim())
  const filtered = q
    ? baseFiltered.filter(cr => {
        const haystack = normalize([cr.artiste, cr.titre, cr.scene, cr.description, cr.bio].filter(Boolean).join(' '))
        return haystack.includes(q)
      })
    : baseFiltered

  if (!eventId) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui', background:'var(--bg2)', color:'var(--muted)', flexDirection:'column', gap:12 }}>
        <div style={{ fontSize:40 }}>📅</div>
        <div style={{ fontSize:16, fontWeight:600 }}>Aucun événement sélectionné</div>
        <div style={{ fontSize:13 }}>Utilisez l'URL <code>/live?ev=EVENT_ID</code></div>
      </div>
    )
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg2)', fontFamily:'var(--font)' }}>
      {/* Header dégradé Maison Ylla — compact, sur 2 lignes en mobile */}
      <div style={{ background:'var(--grad-signature)', padding:'14px 16px 48px', color:'#fff', position:'relative' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap', rowGap:10 }}>
          {/* Identité */}
          <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0, flex:'1 1 auto' }}>
            <div style={{ width:40, height:40, borderRadius:10, background:'rgba(255,255,255,.20)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              {eventMeta?.logo
                ? <img src={eventMeta.logo} alt={eventMeta.nom} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                : <img src="/logo.png" alt="YllaCash" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => e.target.style.display='none'}/>
              }
            </div>
            <div style={{ minWidth:0, flex:'1 1 auto' }}>
              <div style={{ fontSize:'clamp(14px, 4vw, 18px)', fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{eventMeta?.nom || 'YllaCash'}</div>
              <div style={{ fontSize:11, opacity:.80 }}>Planning en direct</div>
            </div>
          </div>
          {/* Actions */}
          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            <div style={{ fontSize:13, fontWeight:700, background:'rgba(255,255,255,.18)', padding:'4px 10px', borderRadius:6, fontVariantNumeric:'tabular-nums' }}>
              {new Date(now).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}
            </div>
            <ThemeToggle variant="dark"/>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:640, margin:'-28px auto 0', padding:'0 14px 40px', position:'relative', zIndex:1 }}>
        {/* En cours */}
        {enCours.length > 0 && (
          <div style={{ marginBottom:16 }}>
            {enCours.map(cr => {
              const ti = TYPES[cr.type] || TYPES.autre
              return (
                <div key={cr.id} style={{ background: ti.color, borderRadius:'var(--radius-xl)', padding:20, color:'#fff', boxShadow: '0 8px 32px ' + ti.color + '66', position:'relative', overflow:'hidden' }}>
                  <div style={{ fontSize:11, fontWeight:800, letterSpacing:'.1em', opacity:.85, marginBottom:8, textTransform:'uppercase' }}>▶ En cours</div>
                  <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                    {cr.photo && (
                      <img loading="lazy" src={cr.photo} alt={cr.artiste} onClick={() => setCarteOpen(cr)}
                        style={{ width:72, height:72, borderRadius:10, objectFit:'cover', objectPosition: cr.photoPosition || 'center center', cursor:'pointer', border:'2px solid rgba(255,255,255,.30)', flexShrink:0 }}/>
                    )}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:22, fontWeight:800, cursor:'pointer', marginBottom:4 }} onClick={() => setCarteOpen(cr)}>{cr.artiste}</div>
                      {cr.titre && <div style={{ fontSize:14, opacity:.85, marginBottom:6 }}>{cr.titre}</div>}
                      <div style={{ display:'flex', gap:12, fontSize:12, opacity:.8, flexWrap:'wrap' }}>
                        <span>🕐 {fmt2(cr.debut)} → {fmt2(cr.fin)} {duree(cr.debut, cr.fin) && '(' + duree(cr.debut, cr.fin) + ')'}</span>
                        {cr.scene && <span>📍 {cr.scene}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Prochain */}
        {prochain && enCours.length === 0 && (
          <div style={{ background:'var(--bg)', borderRadius:'var(--radius-lg)', padding:16, marginBottom:16, border:'2px solid var(--brand)', boxShadow:'0 4px 20px rgba(0,48,72,.05)' }}>
            <div style={{ fontSize:11, fontWeight:800, color:'var(--brand)', letterSpacing:'.08em', marginBottom:8, textTransform:'uppercase' }}>⏭ Prochain</div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }} onClick={() => setCarteOpen(prochain)}>
              <div style={{ width:52, height:52, borderRadius:10, overflow:'hidden', flexShrink:0, background: (TYPES[prochain.type] || TYPES.autre).color + '22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>
                {prochain.photo
                  ? <img loading="lazy" src={prochain.photo} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition: prochain.photoPosition || 'center center' }}/>
                  : (TYPES[prochain.type] || TYPES.autre).icon
                }
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:16, fontWeight:800, color:'var(--text)' }}>{prochain.artiste}</div>
                <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{fmt2(prochain.debut)} · {countdown(prochain.debut)}</div>
              </div>
              <ChevronRight size={20} style={{ color: themeColor }}/>
            </div>
          </div>
        )}

        {/* Recherche */}
        {planning.length > 0 && (
          <div style={{ position:'relative', marginBottom:10, maxWidth:360 }}>
            <Search size={15} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--muted)', pointerEvents:'none' }}/>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un artiste, un titre…"
              aria-label="Rechercher dans le planning"
              style={{
                width:'100%', boxSizing:'border-box',
                minHeight:38, padding:'0 36px 0 34px',
                border:'1px solid var(--border)',
                borderRadius:'var(--radius)',
                background:'var(--bg)', color:'var(--text)',
                fontSize:13, fontFamily:'var(--font)',
                outline:'none',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,144,144,0.12)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Effacer la recherche"
                title="Effacer"
                style={{
                  position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
                  width:22, height:22, borderRadius:6, border:'none',
                  background:'var(--bg2)', color:'var(--muted)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  cursor:'pointer', minHeight:'auto', padding:0,
                }}>
                <X size={13}/>
              </button>
            )}
          </div>
        )}

        {/* Filtres type + sélecteur de vue (même rangée si possible) */}
        {(allTypes.length > 1 || planning.length > 0) && (
          <div style={{ display:'flex', gap:8, marginBottom:12, alignItems:'center', flexWrap:'wrap' }}>
            {allTypes.length > 1 && (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', flex:'1 1 auto' }}>
                {[{ value:'tous', label:'Tous', icon:'🎭' }, ...allTypes.map(t => ({ value: t, label: TYPES[t]?.label || t, icon: TYPES[t]?.icon || '🎭' }))].map(t => (
                  <button key={t.value} onClick={() => setFilterType(t.value)}
                    style={{ padding:'5px 12px', borderRadius:8, border:'1px solid var(--border)', background: filterType === t.value ? 'var(--brand)' : 'var(--bg)', color: filterType === t.value ? '#fff' : 'var(--muted)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)', minHeight:'auto' }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            )}
            {planning.length > 0 && (
              <div role="radiogroup" aria-label="Choisir la vue"
                style={{ display:'flex', gap:2, padding:2, background:'var(--bg2)', borderRadius:8, border:'1px solid var(--border)', flexShrink:0, marginLeft:allTypes.length > 1 ? 'auto' : 0 }}>
                {[
                  { id:'compact',  Icon: Rows3,              label:'Compact' },
                  { id:'photo',    Icon: ImageIcon,          label:'Photo' },
                  { id:'timeline', Icon: GitCommitVertical,  label:'Timeline' },
                  { id:'ticket',   Icon: Ticket,             label:'Ticket' },
                  { id:'grid',     Icon: LayoutGrid,         label:'Grille' },
                ].map(v => {
                  const Icon = v.Icon
                  const active = viewMode === v.id
                  return (
                    <button key={v.id}
                      onClick={() => setViewMode(v.id)}
                      role="radio" aria-checked={active}
                      title={v.label}
                      aria-label={'Vue ' + v.label}
                      style={{
                        width:30, height:28, padding:0,
                        borderRadius:6, border:'none', cursor:'pointer',
                        background: active ? 'var(--bg)' : 'transparent',
                        color: active ? 'var(--brand)' : 'var(--muted)',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        boxShadow: active ? '0 1px 2px rgba(0,48,72,0.10)' : 'none',
                        minHeight:'auto', transition:'background .12s, color .12s',
                      }}>
                      <Icon size={15}/>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Liste — change de layout selon viewMode */}
        {viewMode === 'grid' ? (
          /* Mode grille : 2 colonnes */
          <div ref={listRef} style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:8 }}>
            {filtered.map(cr => {
              const ti  = TYPES[cr.type] || TYPES.autre
              const st  = autoStatut(cr)
              const dim = st === 'termine' || cr.statut === 'annule'
              return <CardGrid key={cr.id} cr={cr} st={st} dim={dim} ti={ti} onOpen={() => setCarteOpen(cr)}/>
            })}
          </div>
        ) : viewMode === 'timeline' ? (
          /* Mode timeline : ligne verticale continue, groupé par jour */
          <div ref={listRef}>
            {(() => {
              const items = []
              let lastDay = null
              filtered.forEach((cr, idx) => {
                const k = dayKey(cr.debut)
                if (k && k !== lastDay) {
                  items.push(
                    <div key={'day-' + k} style={{ fontSize:11, fontWeight:800, color:'var(--text)', letterSpacing:'.06em', margin: idx === 0 ? '0 0 10px 0' : '14px 0 10px 0', paddingBottom:8, borderBottom:'1px solid var(--border)', textTransform:'uppercase' }}>
                      {fmtDate(cr.debut)}
                    </div>
                  )
                  lastDay = k
                }
                const ti  = TYPES[cr.type] || TYPES.autre
                const st  = autoStatut(cr)
                const dim = st === 'termine' || cr.statut === 'annule'
                items.push(<CardTimeline key={cr.id} cr={cr} st={st} dim={dim} ti={ti} onOpen={() => setCarteOpen(cr)}/>)
              })
              return (
                <div style={{ position:'relative' }}>
                  {/* Ligne verticale */}
                  {filtered.length > 0 && <div style={{ position:'absolute', left:14, top:0, bottom:0, width:2, background:'linear-gradient(180deg, var(--border2) 0%, var(--border) 100%)' }}/>}
                  {items}
                </div>
              )
            })()}
          </div>
        ) : (
          /* Modes compact / photo / ticket : liste verticale standard */
          <div ref={listRef} style={{ display:'flex', flexDirection:'column', gap: viewMode === 'photo' ? 12 : 8 }}>
            {filtered.map(cr => {
              const ti  = TYPES[cr.type] || TYPES.autre
              const st  = autoStatut(cr)
              const dim = st === 'termine' || cr.statut === 'annule'
              const props = { cr, st, dim, ti, onOpen: () => setCarteOpen(cr) }
              if (viewMode === 'compact') return <CardCompact key={cr.id} {...props}/>
              if (viewMode === 'ticket')  return <CardTicket  key={cr.id} {...props}/>
              return <CardPhoto key={cr.id} {...props}/>
            })}
          </div>
        )}

        {planning.length === 0 && (
          <div style={{ textAlign:'center', padding:'48px 20px', color:'var(--muted)', fontSize:14 }}>
            <div style={{ fontSize:36, marginBottom:12 }}>📅</div>
            Le programme n'est pas encore disponible.
          </div>
        )}

        {planning.length > 0 && filtered.length === 0 && (
          <div style={{ textAlign:'center', padding:'32px 20px', color:'var(--muted)', fontSize:13 }}>
            <div style={{ fontSize:30, marginBottom:10 }}>🔍</div>
            <div style={{ fontWeight:600, color:'var(--text)', marginBottom:4 }}>Aucun résultat</div>
            <div>
              {search.trim()
                ? <>Aucun créneau ne correspond à <strong>« {search.trim()} »</strong></>
                : 'Aucun créneau pour ce filtre.'}
            </div>
            {(search.trim() || filterType !== 'tous') && (
              <button
                onClick={() => { setSearch(''); setFilterType('tous') }}
                style={{ marginTop:14, padding:'8px 18px', borderRadius:'var(--radius)', border:'1px solid var(--border)', background:'var(--bg)', color:'var(--brand)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)', minHeight:'auto' }}>
                Réinitialiser
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign:'center', padding:'28px 0 0', marginTop:16, borderTop:'0.5px solid var(--border)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)' }}>{APP_FULL_LABEL}</div>
          <div style={{ fontSize:10, color:'var(--muted)', opacity:.6, marginTop:2 }}>Développée par <strong>Maison Ylla</strong></div>
        </div>
      </div>

      {carteOpen && <CarteArtiste cr={carteOpen} onClose={() => setCarteOpen(null)}/>}
    </div>
  )
}
