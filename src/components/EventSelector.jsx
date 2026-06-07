/**
 * components/EventSelector.jsx
 * Écran affiché si aucun événement n'est sélectionné
 * Permet de choisir ou créer un événement avant d'accéder à l'app
 */
import React, { useEffect, useState } from 'react'
import useEventStore from '../store/useEventStore'
import { Calendar, Plus, ArrowRight, CheckCircle } from 'lucide-react'
import { setCurrentEvent } from '../firebase/service'

const formatDate = (d) => {
  if (!d) return null
  try { return new Date(d).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' }) }
  catch { return d }
}

export default function EventSelector({ onSelect }) {
  const { events, currentEventId, eventLoading, watchEvents, selectEvent, createEvent } = useEventStore()
  const [creating, setCreating] = useState(false)
  const [nom, setNom]           = useState('')
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    const unsub = watchEvents()
    return () => unsub?.()
  }, [])

  const handleSelect = (id) => {
    selectEvent(id)
    setCurrentEvent(id)
    onSelect?.(id)
  }

  const handleCreate = async () => {
    if (!nom.trim()) return
    setSaving(true)
    try {
      const id = await createEvent({ nom: nom.trim(), emoji: '🎵', couleur: '#1a6b7a' })
      handleSelect(id)
    } finally { setSaving(false) }
  }

  const visible = (events || []).filter(e => !e.deleted)

  if (eventLoading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui' }}>
      <div style={{ textAlign:'center', color:'#6b6b6b' }}>Chargement…</div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg, #0d3d47 0%, #1a6b7a 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:'system-ui,sans-serif' }}>
      <div style={{ width:'100%', maxWidth:480 }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:64, height:64, borderRadius:18, background:'rgba(255,255,255,.15)', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Calendar size={32} color="#fff"/>
          </div>
          <div style={{ fontSize:26, fontWeight:800, color:'#fff' }}>YllaCash</div>
          <div style={{ fontSize:14, color:'rgba(255,255,255,.75)', marginTop:4 }}>Choisissez un événement pour continuer</div>
        </div>

        <div style={{ background:'#fff', borderRadius:20, padding:24, boxShadow:'0 20px 60px rgba(0,0,0,.25)' }}>

          {visible.length > 0 ? (
            <>
              <div style={{ fontSize:15, fontWeight:700, color:'#0f172a', marginBottom:14 }}>
                Vos événements
              </div>
              {visible.map(ev => {
                const c = ev.couleur || '#1a6b7a'
                const isActive = ev.id === currentEventId
                return (
                  <button key={ev.id} onClick={() => handleSelect(ev.id)}
                    style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:12, border:`1.5px solid ${isActive?c:'#e2e8f0'}`, background:isActive?c+'08':'#f8fafc', cursor:'pointer', marginBottom:8, fontFamily:'system-ui', textAlign:'left', transition:'all .12s', minHeight:'auto' }}>
                    <div style={{ width:44, height:44, borderRadius:11, background:c+'22', border:`1.5px solid ${c}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>
                      {ev.emoji || '🎵'}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>{ev.nom}</div>
                      {(ev.lieu || ev.date) && (
                        <div style={{ fontSize:12, color:'#6b6b6b', marginTop:2 }}>
                          {ev.lieu}{ev.lieu && ev.date ? ' · ' : ''}{formatDate(ev.date)}
                        </div>
                      )}
                    </div>
                    {isActive
                      ? <CheckCircle size={18} style={{ color:c, flexShrink:0 }}/>
                      : <ArrowRight size={16} style={{ color:'#94a3b8', flexShrink:0 }}/>
                    }
                  </button>
                )
              })}
              <div style={{ borderTop:'1px solid #e2e8f0', marginTop:16, paddingTop:16 }}>
                {!creating ? (
                  <button onClick={() => setCreating(true)}
                    style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'10px 0', border:'1.5px dashed #94a3b8', borderRadius:12, background:'none', color:'#64748b', fontSize:14, fontWeight:500, cursor:'pointer', fontFamily:'system-ui', minHeight:'auto' }}>
                    <Plus size={15}/> Créer un nouvel événement
                  </button>
                ) : (
                  <div style={{ display:'flex', gap:8 }}>
                    <input value={nom} onChange={e=>setNom(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleCreate()}
                      placeholder="Nom de l'événement…" autoFocus
                      style={{ flex:1, minHeight:44, padding:'0 12px', border:'1.5px solid #1a6b7a', borderRadius:10, fontSize:14, outline:'none', fontFamily:'system-ui' }}/>
                    <button onClick={handleCreate} disabled={!nom.trim()||saving}
                      style={{ minHeight:44, padding:'0 16px', background:'#1a6b7a', color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'system-ui', flexShrink:0 }}>
                      {saving ? '…' : 'Créer'}
                    </button>
                    <button onClick={()=>setCreating(false)}
                      style={{ minHeight:44, padding:'0 12px', background:'#f1f5f9', border:'none', borderRadius:10, cursor:'pointer', fontFamily:'system-ui', flexShrink:0, color:'#64748b' }}>
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div style={{ textAlign:'center', padding:'20px 0 24px' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🎵</div>
                <div style={{ fontSize:16, fontWeight:700, color:'#0f172a', marginBottom:6 }}>Aucun événement</div>
                <div style={{ fontSize:13, color:'#6b6b6b', marginBottom:20 }}>Créez votre premier événement pour commencer</div>
                <div style={{ display:'flex', gap:8 }}>
                  <input value={nom} onChange={e=>setNom(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleCreate()}
                    placeholder="Nom de l'événement…" autoFocus
                    style={{ flex:1, minHeight:48, padding:'0 14px', border:'1.5px solid #1a6b7a', borderRadius:12, fontSize:15, outline:'none', fontFamily:'system-ui' }}/>
                  <button onClick={handleCreate} disabled={!nom.trim()||saving}
                    style={{ minHeight:48, padding:'0 20px', background:'#1a6b7a', color:'#fff', border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'system-ui', flexShrink:0 }}>
                    {saving ? '…' : 'Créer →'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
