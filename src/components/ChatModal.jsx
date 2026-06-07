/**
 * components/ChatModal.jsx — v7
 * Modale du chat équipe — style Messenger/WhatsApp.
 * - Affichage des messages (texte, voice notes, images) en bulles
 * - Avatar + nom + rôle (badge couleur)
 * - Input texte + push-to-talk + image
 * - Indicateur "X en train d'écrire"
 * - Auto-scroll bas
 * - Suppression : auteur (ses messages) ou admin/super_admin (tous)
 * - Séparateurs de date entre jours
 */
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { X, Send, Mic, Image as ImageIcon, Trash2, Play, Pause, AlertCircle, Volume2, VolumeX } from 'lucide-react'

const ROLE_COLORS = {
  super_admin:          '#F07848',  // Coral — pouvoir max
  admin:                '#F07848',  // Coral aussi
  directeur_artistique: '#5EB8E4',  // Bleu clair (cohérent avec la sidebar)
  billetterie:          '#0E8D7A',  // Vert teal foncé
  stand:                '#D89030',  // Or
  consultation:         '#888780',  // Gris chaud
  benevole:             '#009090',  // Teal signature
}
const ROLE_LABELS = {
  super_admin:          'Super Admin',
  admin:                'Admin',
  directeur_artistique: 'Directeur artistique',
  billetterie:          'Billetterie',
  stand:                'Stand',
  consultation:         'Consultation',
  benevole:             'Bénévole',
}

function fmtHour(ts) {
  if (!ts) return ''
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function fmtDateSep(ts) {
  if (!ts) return ''
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yest = new Date(now); yest.setDate(yest.getDate() - 1)
  const isYesterday = d.toDateString() === yest.toDateString()
  if (isToday) return "Aujourd'hui"
  if (isYesterday) return 'Hier'
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function dayKey(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toDateString()
}

function getInitials(nom) {
  return (nom || '?').split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase()
}

function formatDuration(sec) {
  if (!sec || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return m + ':' + String(s).padStart(2, '0')
}

// ─── Lecteur audio inline ─────────────────────────────────────────
function VoicePlayer({ url, duration, color }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const audioRef = useRef(null)

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onTime = () => setProgress(a.duration ? (a.currentTime / a.duration) * 100 : 0)
    const onEnd  = () => { setPlaying(false); setProgress(0) }
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('ended', onEnd)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('ended', onEnd)
    }
  }, [])

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else { a.play(); setPlaying(true) }
  }

  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, minWidth: 180 }}>
      <button onClick={toggle}
        style={{ width: 34, height: 34, borderRadius:'50%', border:'none', background: color, color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        {playing ? <Pause size={14}/> : <Play size={14}/>}
      </button>
      <div style={{ flex:1, height: 4, background:'rgba(0,0,0,.1)', borderRadius:2, overflow:'hidden', minWidth: 60 }}>
        <div style={{ width: progress + '%', height:'100%', background: color, transition: 'width .1s linear' }}/>
      </div>
      <span style={{ fontSize:11, color:'inherit', opacity:.7, fontFamily:'monospace', minWidth: 32 }}>
        {formatDuration(duration)}
      </span>
      <audio ref={audioRef} src={url} preload="metadata"/>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────
export default function ChatModal({
  open, onClose,
  messages, othersTyping,
  currentUser, brandColor,
  isAdmin,
  send, sendVoice, sendImage, remove, notifyTyping,
  walkieMuted = false,
  onToggleWalkieMute,
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSec, setRecordSec] = useState(0)
  const [err, setErr] = useState('')
  const [fullImage, setFullImage] = useState(null)
  const recRef = useRef(null)        // MediaRecorder
  const chunksRef = useRef([])
  const recTimerRef = useRef(null)
  const recordSecRef = useRef(0)
  const messagesEndRef = useRef(null)
  const messagesScrollRef = useRef(null)
  const fileInputRef = useRef(null)
  const inputRef = useRef(null)

  const uid = currentUser?.uid || currentUser?.id

  // Auto-scroll vers le bas à chaque nouveau message (ou ouverture)
  // Approche robuste : scroller directement le conteneur en multiples passes
  // pour gérer le délai de rendu, le chargement des images/audio, etc.
  useEffect(() => {
    if (!open) return
    const scrollToBottom = () => {
      const el = messagesScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
    // Passe immédiate
    scrollToBottom()
    // Plusieurs passes différées pour gérer le rendu progressif (images en cours de chargement, etc.)
    const t1 = setTimeout(scrollToBottom, 50)
    const t2 = setTimeout(scrollToBottom, 200)
    const t3 = setTimeout(scrollToBottom, 500)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [messages, open])

  // Focus input à l'ouverture
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 250)
  }, [open])

  const handleSend = async () => {
    if (!text.trim() || sending) return
    setSending(true); setErr('')
    try { await send(text); setText('') }
    catch (e) { setErr(e.message || 'Erreur') }
    finally { setSending(false) }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Push-to-talk
  const startRecord = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
                : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
                : ''
      const recOpts = mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 }
      const rec = new MediaRecorder(stream, recOpts)
      chunksRef.current = []
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' })
        const dur = recordSecRef.current
        if (dur >= 1 && blob.size > 0) {
          setSending(true)
          try { await sendVoice(blob, dur) }
          catch (e) { setErr(e.message || 'Erreur envoi vocal') }
          finally { setSending(false) }
        }
      }
      rec.start()
      recRef.current = rec
      setRecording(true)
      setRecordSec(0)
      recordSecRef.current = 0
      if (navigator.vibrate) navigator.vibrate(10)
      recTimerRef.current = setInterval(() => {
        recordSecRef.current += 1
        setRecordSec(recordSecRef.current)
        // Limite 60s
        if (recordSecRef.current >= 45) stopRecord()
      }, 1000)
    } catch (e) {
      setErr('Micro non accessible : ' + (e.message || ''))
    }
  }
  const stopRecord = () => {
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null }
    if (recRef.current && recRef.current.state !== 'inactive') {
      try { recRef.current.stop() } catch {}
    }
    setRecording(false)
  }

  const cancelRecord = () => {
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null }
    if (recRef.current && recRef.current.state !== 'inactive') {
      try {
        recRef.current.onstop = null
        recRef.current.stop()
        recRef.current.stream?.getTracks().forEach(t => t.stop())
      } catch {}
    }
    setRecording(false)
    setRecordSec(0)
  }

  // Image upload
  const handleImagePick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setSending(true); setErr('')
    try { await sendImage(file) }
    catch (e) { setErr(e.message || 'Erreur envoi image') }
    finally { setSending(false) }
  }

  // Suppression
  const handleDelete = async (m) => {
    const isOwn = m.author?.uid === uid
    if (!isOwn && !isAdmin) return
    if (!window.confirm(isOwn ? 'Supprimer votre message ?' : 'Supprimer ce message ?')) return
    try { await remove(m.id) } catch (e) { alert('Erreur : ' + e.message) }
  }

  // Préparer les messages avec séparateurs de date
  const renderItems = useMemo(() => {
    const out = []
    let prevDay = null
    messages.forEach(m => {
      const k = dayKey(m.createdAt || m.timestamp)
      if (k !== prevDay) {
        out.push({ kind: 'sep', key: 'sep-' + k, label: fmtDateSep(m.createdAt || m.timestamp) })
        prevDay = k
      }
      out.push({ kind: 'msg', m })
    })
    return out
  }, [messages])

  if (!open) return null

  return (
    <>
      <div onClick={(e) => e.target === e.currentTarget && onClose()}
        style={{
          position:'fixed', inset:0, zIndex: 1000,
          background:'rgba(0,0,0,.45)',
          display:'flex', alignItems:'flex-end', justifyContent:'center',
          fontFamily:'var(--font)',
        }}>
        <div style={{
          width:'100%', maxWidth: 540,
          height:'min(680px, 92vh)',
          background:'var(--bg)',
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          display:'flex', flexDirection:'column',
          boxShadow:'0 -10px 40px rgba(0,0,0,.2)',
          overflow:'hidden',
        }}>
          {/* Header — marine du logo */}
          <div style={{
            padding:'14px 18px',
            background: '#003048',
            color:'#fff',
            display:'flex', alignItems:'center', justifyContent:'space-between',
            flexShrink: 0,
          }}>
            <div>
              <div style={{ fontSize:15, fontWeight:800 }}>💬 Chat équipe</div>
              <div style={{ fontSize:11, opacity:.80 }}>
                {othersTyping.length > 0
                  ? (othersTyping.length === 1
                      ? othersTyping[0].nom + ' en train d\'écrire…'
                      : othersTyping.length + ' personnes en train d\'écrire…')
                  : (messages.filter(m => !m.deletedAt).length + ' message' + (messages.length > 1 ? 's' : ''))
                }
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
              {onToggleWalkieMute && (
                <button onClick={onToggleWalkieMute}
                  title={walkieMuted ? 'Réactiver le talkie' : 'Couper le son du talkie'}
                  style={{
                    background:'rgba(255,255,255,.18)', border:'none', color:'#fff',
                    width: 34, height: 34, borderRadius: 8, cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    minHeight: 'auto',
                  }}>
                  {walkieMuted ? <VolumeX size={16}/> : <Volume2 size={16}/>}
                </button>
              )}
              <button onClick={onClose} style={{
                background:'rgba(255,255,255,.18)', border:'none', color:'#fff',
                width: 34, height: 34, borderRadius: 8, cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
                minHeight: 'auto',
              }}>
                <X size={18}/>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={messagesScrollRef} style={{
            flex: 1, overflow:'auto',
            background:'var(--bg2)',
            padding:'14px 12px',
            display:'flex', flexDirection:'column', gap: 6,
          }}>
            {messages.length === 0 && (
              <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--muted)' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>💬</div>
                <div style={{ fontSize: 13 }}>Aucun message pour le moment.<br/>Soyez le premier à écrire !</div>
              </div>
            )}
            {renderItems.map(item => {
              if (item.kind === 'sep') {
                return (
                  <div key={item.key} style={{ display:'flex', justifyContent:'center', margin:'8px 0' }}>
                    <span style={{ fontSize:10, fontWeight:700, color:'var(--muted)', background:'var(--bg)', padding:'4px 12px', borderRadius:6, border:'0.5px solid var(--border)', textTransform:'uppercase', letterSpacing:'.05em' }}>
                      {item.label}
                    </span>
                  </div>
                )
              }
              const m = item.m
              const isMine = m.author?.uid === uid
              const canDelete = isMine || isAdmin
              const roleCol = ROLE_COLORS[m.author?.role] || '#888'
              const roleLab = ROLE_LABELS[m.author?.role] || m.author?.role || ''
              const isDeleted = !!m.deletedAt

              return (
                <div key={m.id} style={{
                  display:'flex',
                  justifyContent: isMine ? 'flex-end' : 'flex-start',
                  marginTop: 2,
                }}>
                  <div style={{
                    maxWidth:'82%',
                    display:'flex', flexDirection:'column',
                    alignItems: isMine ? 'flex-end' : 'flex-start',
                    gap: 2,
                  }}>
                    {!isMine && !isDeleted && (
                      <div style={{ fontSize:10, color:'var(--muted)', display:'flex', alignItems:'center', gap:6, marginLeft: 4 }}>
                        <span style={{ fontWeight:700 }}>{m.author?.nom || '—'}</span>
                        <span style={{ background: roleCol + '22', color: roleCol, padding:'1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>{roleLab}</span>
                      </div>
                    )}
                    <div style={{
                      background: isDeleted ? 'var(--bg2)' : (isMine ? 'var(--brand)' : 'var(--bg)'),
                      color:      isDeleted ? 'var(--muted)' : (isMine ? '#fff' : 'var(--text)'),
                      border: isMine ? 'none' : '0.5px solid var(--border)',
                      borderRadius: 12,
                      borderBottomLeftRadius:  !isMine ? 4 : 12,
                      borderBottomRightRadius:  isMine ? 4 : 12,
                      padding: m.type === 'image' ? 4 : '8px 12px',
                      fontSize: 14,
                      lineHeight: 1.45,
                      wordBreak: 'break-word',
                      fontStyle: isDeleted ? 'italic' : 'normal',
                      position:'relative',
                      maxWidth: '100%',
                    }}>
                      {isDeleted && '🗑 Message supprimé'}
                      {!isDeleted && m.type === 'text' && m.content}
                      {!isDeleted && m.type === 'voice' && (
                        <VoicePlayer url={m.audioUrl} duration={m.duration} color={isMine ? '#fff' : 'var(--brand)'}/>
                      )}
                      {!isDeleted && m.type === 'image' && (
                        <img src={m.imageUrl}
                          alt=""
                          onClick={() => setFullImage(m.imageUrl)}
                          onLoad={() => {
                            const el = messagesScrollRef.current
                            if (el) el.scrollTop = el.scrollHeight
                          }}
                          style={{ maxWidth: 240, width:'100%', maxHeight: 320, borderRadius: 10, display:'block', cursor:'pointer' }}/>
                      )}
                    </div>
                    <div style={{ fontSize:9, color:'var(--muted)', display:'flex', alignItems:'center', gap: 6, paddingX: 4 }}>
                      <span>{fmtHour(m.createdAt || m.timestamp)}</span>
                      {canDelete && !isDeleted && (
                        <button onClick={() => handleDelete(m)}
                          title="Supprimer"
                          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding: 0, display:'flex', alignItems:'center' }}>
                          <Trash2 size={11}/>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef}/>
          </div>

          {/* Erreur */}
          {err && (
            <div style={{ padding:'6px 14px', background:'var(--red-light)', color:'var(--red-dark)', fontSize:11, display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
              <AlertCircle size={12}/> {err}
            </div>
          )}

          {/* Input */}
          <div style={{
            padding:'10px 12px',
            background:'var(--bg)',
            borderTop:'0.5px solid var(--border)',
            display:'flex', alignItems:'center', gap: 6,
            flexShrink: 0,
          }}>
            {recording ? (
              <>
                <button onClick={cancelRecord}
                  style={{ width: 38, height: 38, borderRadius: 8, border:'none', background:'var(--red-light)', color:'var(--red-dark)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <X size={18}/>
                </button>
                <div style={{ flex: 1, display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'var(--bg2)', borderRadius: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius:'50%', background:'#D83030', animation:'pulse 1s infinite' }}/>
                  <span style={{ fontSize: 13, color:'var(--text)', fontFamily:'monospace' }}>{formatDuration(recordSec)}</span>
                  <span style={{ fontSize: 11, color:'var(--muted)', marginLeft:'auto' }}>Enregistrement…</span>
                </div>
                <button onClick={stopRecord}
                  style={{ width: 38, height: 38, borderRadius: 8, border:'none', background: 'var(--brand)', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Send size={18}/>
                </button>
              </>
            ) : (
              <>
                <button onClick={() => fileInputRef.current?.click()}
                  title="Joindre une image"
                  style={{ width: 38, height: 38, borderRadius: 8, border:'1px solid var(--border2)', background:'var(--bg2)', color:'var(--muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <ImageIcon size={18}/>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*"
                  onChange={handleImagePick}
                  style={{ display:'none' }}/>
                <input ref={inputRef}
                  value={text}
                  onChange={(e) => { setText(e.target.value); notifyTyping() }}
                  onKeyDown={handleKey}
                  placeholder="Écrire un message…"
                  disabled={sending}
                  style={{
                    flex: 1, minWidth: 0, boxSizing: 'border-box',
                    minHeight: 38, padding: '0 14px',
                    border: '1px solid var(--border2)', borderRadius: 8,
                    fontSize: 14, color: 'var(--text)',
                    background: 'var(--bg)', outline: 'none',
                    fontFamily: 'var(--font)',
                  }}/>
                {text.trim() ? (
                  <button onClick={handleSend} disabled={sending}
                    style={{ width: 38, height: 38, borderRadius: 8, border:'none', background: 'var(--brand)', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Send size={18}/>
                  </button>
                ) : (
                  <button onMouseDown={startRecord} onTouchStart={startRecord}
                    title="Appuyer pour enregistrer un vocal"
                    style={{ width: 38, height: 38, borderRadius: 8, border:'none', background: '#F07848', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Mic size={18}/>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <style>{`
          @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: .3 } }
        `}</style>
      </div>

      {/* Image plein écran */}
      {fullImage && (
        <div onClick={() => setFullImage(null)}
          style={{ position:'fixed', inset:0, zIndex: 1100, background:'rgba(0,0,0,.92)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', padding: 20 }}>
          <img src={fullImage} style={{ maxWidth:'100%', maxHeight:'100%', borderRadius: 10 }}/>
        </div>
      )}
    </>
  )
}
