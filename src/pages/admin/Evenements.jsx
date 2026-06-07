/**
 * pages/admin/Evenements.jsx — responsive mobile-first
 * - Icône = logo de l'événement (logoSrc) ou emoji fallback
 * - Bouton "Nouvel événement" en bas (FAB sur mobile)
 * - Layout adaptatif
 */
import React, { useState, useEffect } from 'react'
import useEventStore from '../../store/useEventStore'
import { compressImage } from '../../utils/imageUtils'
import useAuthStore  from '../../store/useAuthStore'
import useAppStore   from '../../store/useAppStore'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import {
  Plus, Pencil, Trash2, Copy, X, Save,
  Calendar, MapPin, CheckCircle, ArrowRight,
} from 'lucide-react'

const COULEURS = [
  '#1a6b7a','#534AB7','#BA7517','#0F6E56','#A32D2D',
  '#2563EB','#7C3AED','#D97706','#059669','#DC2626',
]
const EMOJI_OPTIONS = ['🎵','🎪','🎭','🎨','🎤','🥁','🎸','🎺','🎻','🎹','🎡','🎢','🎠','🏟️','⭐']

const formatDate = (d) => {
  if (!d) return null
  try { return new Date(d).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' }) }
  catch { return d }
}

// ── Icône de l'événement : logo si dispo, sinon emoji ───────────
const EventIcon = ({ event, size = 44 }) => {
  const couleur = event.couleur || '#1a6b7a'
  const logoSrc = event.logoSrc || null
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.27,
      background: couleur + '22',
      border: `1.5px solid ${couleur}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', flexShrink: 0,
    }}>
      {logoSrc
        ? <img src={logoSrc} alt={event.nom} style={{ width:'100%', height:'100%', objectFit:'cover' }}
            onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }}/>
        : null
      }
      <span style={{ fontSize: size * 0.5, display: logoSrc ? 'none' : 'flex' }}>
        {event.emoji || '🎵'}
      </span>
    </div>
  )
}

// ── Carte événement ──────────────────────────────────────────────
const EventCard = ({ event, isActive, onSelect, onEdit, onDelete, onDuplicate, isMobile }) => {
  const couleur = event.couleur || '#1a6b7a'
  return (
    <div style={{
      background: 'var(--bg)',
      border: `2px solid ${isActive ? couleur : 'var(--border)'}`,
      borderRadius: 16,
      padding: isMobile ? '14px 14px 14px 18px' : '20px 20px 20px 24px',
      marginBottom: 12,
      boxShadow: isActive ? `0 0 0 3px ${couleur}18` : '0 1px 4px rgba(0,0,0,.06)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Bande couleur gauche */}
      <div style={{ position:'absolute', left:0, top:0, bottom:0, width:4, background:couleur, borderRadius:'2px 0 0 2px' }}/>

      {/* Header : icône + nom + badge actif */}
      <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:10 }}>
        <EventIcon event={event} size={isMobile ? 40 : 48}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:3 }}>
            <span style={{ fontSize: isMobile ? 15 : 16, fontWeight:800, color:'var(--text)', lineHeight:1.2 }}>
              {event.nom}
            </span>
            {isActive && (
              <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:couleur, color:'#fff', flexShrink:0 }}>
                Actif
              </span>
            )}
          </div>
          {event.description && (
            <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace: isMobile ? 'nowrap' : 'normal' }}>
              {event.description}
            </div>
          )}
          {/* Infos date + lieu */}
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:6 }}>
            {event.date && (
              <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'var(--muted)' }}>
                <Calendar size={11}/> {formatDate(event.date)}
                {event.dateFin && ` → ${formatDate(event.dateFin)}`}
              </span>
            )}
            {event.lieu && (
              <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'var(--muted)' }}>
                <MapPin size={11}/> {event.lieu}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        {!isActive ? (
          <button onClick={() => onSelect(event.id)} className="btn-primary"
            style={{ fontSize:13, padding:'0 14px', height:36, gap:6 }}>
            <ArrowRight size={13}/> Activer
          </button>
        ) : (
          <span style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:700, color:couleur }}>
            <CheckCircle size={14}/> Actif
          </span>
        )}
        <button onClick={() => onEdit(event)} className="btn-secondary"
          style={{ fontSize:13, padding:'0 12px', height:36, gap:5 }}>
          <Pencil size={12}/> {!isMobile && 'Modifier'}
        </button>
        <button onClick={() => onDuplicate(event)} className="btn-secondary"
          title="Dupliquer" style={{ fontSize:13, padding:'0 12px', height:36 }}>
          <Copy size={12}/>
        </button>
        <button onClick={() => onDelete(event)} className="btn-danger"
          style={{ fontSize:13, padding:'0 12px', height:36, marginLeft:'auto' }}>
          <Trash2 size={12}/>
        </button>
      </div>
    </div>
  )
}

// ── Formulaire ──────────────────────────────────────────────────
const EventForm = ({ initial, onSave, onCancel, isMobile }) => {
  const { theme } = useAppStore()
  const [form, setForm] = useState({
    nom:         initial?.nom         || '',
    description: initial?.description || '',
    date:        initial?.date        || '',
    dateFin:     initial?.dateFin     || '',
    lieu:        initial?.lieu        || '',
    couleur:     initial?.couleur     || COULEURS[0],
    emoji:       initial?.emoji       || '🎵',
    logoSrc:     initial?.logoSrc     || (theme?.logoSrc || null),
  })
  const [saving, setSaving] = useState(false)

  const inp = {
    width:'100%', minHeight:44, padding:'0 12px',
    border:'1.5px solid var(--border2)', borderRadius:10,
    fontSize:14, fontFamily:'var(--font)', color:'var(--text)',
    background:'var(--bg)', outline:'none', boxSizing:'border-box',
  }

  const handleSave = async () => {
    if (!form.nom.trim()) { alert('Le nom est requis'); return }
    setSaving(true)
    try { await onSave(form) }
    finally { setSaving(false) }
  }

  return (
    <div className="card" style={{ border:'2px solid var(--brand)', marginBottom:16, boxSizing:'border-box', overflow:'hidden' }}>
      <div style={{ fontSize:16, fontWeight:700, color:'var(--text)', marginBottom:18 }}>
        {initial ? 'Modifier l\'événement' : 'Nouvel événement'}
      </div>

      {/* Icône + Nom */}
      <div style={{ display:'flex', gap:10, marginBottom:12 }}>
        <div>
          <label style={{ fontSize:12, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Icône</label>
          <select value={form.emoji} onChange={e => setForm(f => ({...f, emoji:e.target.value}))}
            style={{ ...inp, width:60, textAlign:'center', fontSize:22, padding:'0 4px' }}>
            {EMOJI_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div style={{ flex:1 }}>
          <label style={{ fontSize:12, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Nom *</label>
          <input value={form.nom} onChange={e => setForm(f => ({...f,nom:e.target.value}))}
            placeholder="ex : Fest'Ylla 2026" style={inp}/>
        </div>
      </div>

      <div style={{ marginBottom:12 }}>
        <label style={{ fontSize:12, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Description</label>
        <input value={form.description} onChange={e => setForm(f => ({...f,description:e.target.value}))}
          placeholder="Festival afro de Strasbourg" style={inp}/>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:10, marginBottom:12 }}>
        <div>
          <label style={{ fontSize:12, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Début</label>
          <input type="date" value={form.date} onChange={e => setForm(f => ({...f,date:e.target.value}))} style={inp}/>
        </div>
        <div>
          <label style={{ fontSize:12, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Fin</label>
          <input type="date" value={form.dateFin} onChange={e => setForm(f => ({...f,dateFin:e.target.value}))} style={inp}/>
        </div>
      </div>

      <div style={{ marginBottom:14 }}>
        <label style={{ fontSize:12, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Lieu</label>
        <input value={form.lieu} onChange={e => setForm(f => ({...f,lieu:e.target.value}))}
          placeholder="Strasbourg, Bas-Rhin" style={inp}/>
      </div>

      {/* Logo — fichier ou URL */}
      <div style={{ marginBottom:14 }}>
        <label style={{ fontSize:12, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>
          Logo / Icône de l'événement
        </label>

        {/* Aperçu */}
        {form.logoSrc && (
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10, padding:'10px 14px', background:'var(--bg2)', borderRadius:10 }}>
            <img src={form.logoSrc} alt="Logo"
              style={{ width:52, height:52, borderRadius:12, objectFit:'cover', border:'1px solid var(--border)' }}
              onError={e => e.target.style.display='none'}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Logo chargé</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>Cliquez sur "Changer" pour modifier</div>
            </div>
            <button onClick={() => setForm(f => ({...f, logoSrc:null}))}
              style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red)', fontSize:12, minHeight:'auto', padding:4 }}>
              Supprimer
            </button>
          </div>
        )}

        {/* Bouton upload fichier */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <label style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'8px 14px', background:'var(--brand)', color:'#fff', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
              style={{ display:'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const src = await compressImage(file, 256, 0.85)
                  setForm(f => ({...f, logoSrc: src}))
                } catch { alert('Erreur lors du chargement du fichier') }
                e.target.value = ''
              }}
            />
            📁 {form.logoSrc ? 'Changer' : 'Choisir un fichier'}
          </label>

          {/* Ou par URL */}
          <input value={form.logoSrc?.startsWith('data:') ? '' : (form.logoSrc || '')}
            onChange={e => setForm(f => ({...f, logoSrc:e.target.value||null}))}
            placeholder="Ou coller une URL https://…"
            style={{ ...inp, flex:1, minWidth:180 }}/>
        </div>
        <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>
          PNG, JPG, SVG — recommandé 256×256px minimum
        </div>
      </div>

      {/* Couleur */}
      <div style={{ marginBottom:18 }}>
        <label style={{ fontSize:12, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:6 }}>Couleur principale</label>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', overflowX:'hidden' }}>
          {COULEURS.map(c => (
            <button key={c} onClick={() => setForm(f => ({...f,couleur:c}))}
              style={{ width:28, height:28, borderRadius:'50%', background:c, border:form.couleur===c?'3px solid var(--text)':'2px solid transparent', cursor:'pointer', transform:form.couleur===c?'scale(1.15)':'scale(1)', transition:'all .12s', outline:'none', flexShrink:0 }}/>
          ))}
          <input type="color" value={form.couleur} onChange={e => setForm(f => ({...f,couleur:e.target.value}))}
            style={{ width:28, height:28, borderRadius:'50%', border:'2px solid var(--border2)', cursor:'pointer', padding:2, background:'none' }}/>
        </div>
      </div>

      {/* Aperçu */}
      <div style={{ padding:'12px 16px', background:'var(--bg2)', borderRadius:10, marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
        <EventIcon event={form} size={40}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {form.nom || 'Nom de l\'événement'}
          </div>
          {form.lieu && <div style={{ fontSize:12, color:'var(--muted)' }}>{form.lieu}</div>}
        </div>
        <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:20, background:form.couleur, color:'#fff', flexShrink:0 }}>
          Aperçu
        </span>
      </div>

      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <button onClick={handleSave} disabled={saving} className="btn-primary"
          style={{ flex: isMobile ? 1 : 'none' }}>
          <Save size={13}/> {saving ? 'Sauvegarde…' : initial ? 'Enregistrer' : 'Créer'}
        </button>
        <button onClick={onCancel} className="btn-secondary"
          style={{ flex: isMobile ? 1 : 'none' }}>
          <X size={13}/> Annuler
        </button>
      </div>
    </div>
  )
}

// ── Page principale ──────────────────────────────────────────────
export default function Evenements() {
  const { events, currentEventId, eventLoading, watchEvents,
          selectEvent, createEvent, updateEvent, deleteEvent, duplicateEvent } = useEventStore()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState(null)
  const { isMobile }            = useBreakpoint()

  useEffect(() => {
    const unsub = watchEvents()
    return () => unsub?.()
  }, [])

  const handleCreate = async (data) => {
    const id = await createEvent(data)
    setShowForm(false)
    if (events.filter(e => !e.deleted).length === 0) selectEvent(id)
  }

  const handleUpdate = async (data) => {
    await updateEvent(editing.id, data)
    setEditing(null)
  }

  const handleDelete = async (evt) => {
    if (!window.confirm(`Supprimer "${evt.nom}" ?\n\nToutes ses données seront désactivées.`)) return
    await deleteEvent(evt.id)
  }

  const handleDuplicate = async (evt) => {
    const nom = prompt(`Nom de la copie de "${evt.nom}" :`, `${evt.nom} — Copie`)
    if (!nom) return
    await duplicateEvent(evt.id, { ...evt, nom, actif:false, id:undefined })
  }

  const visible = events.filter(e => !e.deleted)

  if (eventLoading) return (
    <div style={{ padding:40, textAlign:'center', color:'var(--muted)', fontSize:14 }}>Chargement…</div>
  )

  const activeEvent = visible.find(e => e.id === currentEventId)

  return (
    <div style={{ maxWidth:640, paddingBottom: isMobile ? 88 : 0 }}>

      {/* Bannière événement actif */}
      {activeEvent && (
        <div style={{
          padding: isMobile ? '12px 14px' : '14px 20px',
          background:`linear-gradient(135deg, ${activeEvent.couleur||'#1a6b7a'}22, ${activeEvent.couleur||'#1a6b7a'}06)`,
          border:`1.5px solid ${activeEvent.couleur||'#1a6b7a'}44`,
          borderRadius:14, marginBottom:16,
          display:'flex', alignItems:'center', gap:12,
        }}>
          <EventIcon event={activeEvent} size={isMobile ? 36 : 44}/>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:activeEvent.couleur||'#1a6b7a', marginBottom:2 }}>
              Événement actif
            </div>
            <div style={{ fontSize: isMobile ? 14 : 16, fontWeight:800, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {activeEvent.nom}
            </div>
            {activeEvent.lieu && (
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>📍 {activeEvent.lieu}</div>
            )}
          </div>
          <CheckCircle size={20} style={{ color:activeEvent.couleur||'#1a6b7a', flexShrink:0 }}/>
        </div>
      )}

      {/* Formulaires */}
      {showForm && <EventForm onSave={handleCreate} onCancel={() => setShowForm(false)} isMobile={isMobile}/>}
      {editing   && <EventForm initial={editing} onSave={handleUpdate} onCancel={() => setEditing(null)} isMobile={isMobile}/>}

      {/* Liste */}
      {visible.length === 0 && !showForm && !editing ? (
        <div style={{ padding:'56px 20px', textAlign:'center', color:'var(--muted)' }}>
          <div style={{ fontSize:52, marginBottom:14 }}>🎵</div>
          <div style={{ fontSize:17, fontWeight:700, color:'var(--text)', marginBottom:6 }}>Aucun événement</div>
          <div style={{ fontSize:13, lineHeight:1.5 }}>
            Appuyez sur le bouton <strong>+</strong> pour créer votre premier événement
          </div>
        </div>
      ) : (
        visible.map(evt => (
          <EventCard
            key={evt.id}
            event={evt}
            isActive={evt.id === currentEventId}
            onSelect={selectEvent}
            onEdit={setEditing}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            isMobile={isMobile}
          />
        ))
      )}

      {/* Info isolation */}
      {visible.length > 0 && !showForm && !editing && (
        <div className="alert alert-info" style={{ marginTop:8, fontSize:12 }}>
          <strong>Isolation complète</strong> — spectateurs, transactions, réservations, menu et staff sont séparés par événement.
        </div>
      )}

      {/* ── Bouton "Nouvel événement" — FAB mobile / bouton bas desktop ── */}
      {!showForm && !editing && (
        isMobile ? (
          /* FAB fixe en bas sur mobile */
          <button
            onClick={() => setShowForm(true)}
            style={{
              position: 'fixed', bottom: 24, right: 20,
              width: 56, height: 56,
              borderRadius: '50%',
              background: 'var(--brand)',
              color: '#fff',
              border: 'none',
              boxShadow: '0 4px 20px rgba(26,107,122,.45)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 50,
              WebkitTapHighlightColor: 'transparent',
            }}
            title="Nouvel événement"
          >
            <Plus size={26}/>
          </button>
        ) : (
          /* Bouton en bas de la liste sur desktop */
          <div style={{ marginTop:16 }}>
            <button onClick={() => setShowForm(true)} className="btn-primary"
              style={{ width:'100%', justifyContent:'center', gap:8 }}>
              <Plus size={16}/> Nouvel événement
            </button>
          </div>
        )
      )}
    </div>
  )
}
