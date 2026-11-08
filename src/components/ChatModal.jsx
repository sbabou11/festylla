/**
 * components/ChatModal.jsx — v8 (design system)
 * Modale du chat équipe — style messagerie, feuille qui monte du bas sur mobile.
 * - Affichage des messages (texte, voice notes, images) en bulles
 * - Avatar + nom + rôle (badge couleur)
 * - Input texte + push-to-talk + image
 * - Indicateur "X en train d'écrire"
 * - Auto-scroll bas
 * - Suppression : auteur (ses messages) ou admin/super_admin (tous), confirmée dans la feuille
 * - Séparateurs de date entre jours
 * Styles : ChatModal.module.css (tokens uniquement, s'adapte au clair, sombre et plein soleil).
 */
import React, { useState, useRef, useEffect, useMemo } from 'react'
import clsx from 'clsx'
import { X, Send, Mic, Image as ImageIcon, Trash2, Play, Pause, AlertCircle, Volume2, VolumeX, MessageCircle } from 'lucide-react'
import { Button } from '../ui'
import { friendlyError } from '../utils/errors'
import s from './ChatModal.module.css'

const ROLE_COLORS = {
  super_admin:          'var(--coral)',   // Coral — pouvoir max
  admin:                'var(--coral)',   // Coral aussi
  directeur_artistique: '#5EB8E4',        // Bleu clair (cohérent avec la sidebar)
  billetterie:          'var(--green)',   // Vert teal foncé
  stand:                'var(--gold)',    // Or
  consultation:         'var(--muted)',   // Gris
  benevole:             'var(--brand)',   // Teal signature
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

function formatDuration(sec) {
  if (!sec || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return m + ':' + String(s).padStart(2, '0')
}

// ─── Lecteur audio inline (couleurs : héritées de la bulle) ────────
function VoicePlayer({ url, duration }) {
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
    <div className={s.voice}>
      <button type="button" className={s.play} onClick={toggle} aria-label={playing ? 'Mettre en pause le vocal' : 'Écouter le vocal'}>
        {playing ? <Pause size={14} aria-hidden="true"/> : <Play size={14} aria-hidden="true"/>}
      </button>
      <div className={s.track} aria-hidden="true">
        <span style={{ width: progress + '%' }}/>
      </div>
      <span className={s.dur}>{formatDuration(duration)}</span>
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
  const [toDelete, setToDelete] = useState(null)   // message en attente de confirmation
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
    catch (e) { setErr(friendlyError(e, "Le message n'est pas parti.")) }
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
          catch (e) { setErr(friendlyError(e, "Le message vocal n'est pas parti.")) }
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
      setErr(friendlyError(e, "Le micro n'est pas accessible, vérifie l'autorisation du navigateur."))
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
    catch (e) { setErr(friendlyError(e, "L'image n'est pas partie.")) }
    finally { setSending(false) }
  }

  // Suppression : demande de confirmation dans la feuille (au-dessus de la saisie)
  const handleDelete = (m) => {
    const isOwn = m.author?.uid === uid
    if (!isOwn && !isAdmin) return
    setErr('')
    setToDelete(m)
  }
  const confirmDelete = async () => {
    const m = toDelete
    setToDelete(null)
    if (!m) return
    // Erreur affichée dans le bandeau du chat : un toast passerait sous la feuille
    try { await remove(m.id) } catch (e) { setErr(friendlyError(e, "Le message n'a pas pu être supprimé.")) }
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

  const visibleCount = messages.filter(m => !m.deletedAt).length
  const subtitle = othersTyping.length > 0
    ? (othersTyping.length === 1
        ? othersTyping[0].nom + ' en train d\'écrire…'
        : othersTyping.length + ' personnes en train d\'écrire…')
    : (visibleCount + ' message' + (messages.length > 1 ? 's' : ''))

  return (
    <>
      <div className={s.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className={s.panel} role="dialog" aria-modal="true" aria-label="Chat équipe">
          {/* En-tête */}
          <header className={s.head}>
            <div className={s.headText}>
              <h2 className={s.title}><MessageCircle size={16} aria-hidden="true"/> Chat équipe</h2>
              <p className={clsx(s.sub, othersTyping.length > 0 && s.typing)} aria-live="polite">{subtitle}</p>
            </div>
            <div className={s.headBtns}>
              {onToggleWalkieMute && (
                <button type="button" className={s.headBtn} onClick={onToggleWalkieMute}
                  aria-pressed={walkieMuted}
                  aria-label={walkieMuted ? 'Réactiver le talkie' : 'Couper le son du talkie'}
                  title={walkieMuted ? 'Réactiver le talkie' : 'Couper le son du talkie'}>
                  {walkieMuted ? <VolumeX size={18} aria-hidden="true"/> : <Volume2 size={18} aria-hidden="true"/>}
                </button>
              )}
              <button type="button" className={s.headBtn} onClick={onClose} aria-label="Fermer le chat">
                <X size={18} aria-hidden="true"/>
              </button>
            </div>
          </header>

          {/* Messages */}
          <div ref={messagesScrollRef} className={s.list}>
            {messages.length === 0 && (
              <div className={s.empty}>
                <span className={s.emptyIcon}><MessageCircle size={22} aria-hidden="true"/></span>
                <b>Aucun message pour le moment</b>
                <p>Soyez le premier à écrire !</p>
              </div>
            )}
            {renderItems.map(item => {
              if (item.kind === 'sep') {
                return (
                  <div key={item.key} className={s.sep}><span>{item.label}</span></div>
                )
              }
              const m = item.m
              const isMine = m.author?.uid === uid
              const canDelete = isMine || isAdmin
              const roleCol = ROLE_COLORS[m.author?.role] || 'var(--muted)'
              const roleLab = ROLE_LABELS[m.author?.role] || m.author?.role || ''
              const isDeleted = !!m.deletedAt

              return (
                <div key={m.id} className={clsx(s.row, isMine && s.mine)}>
                  <div className={s.col}>
                    {!isMine && !isDeleted && (
                      <div className={s.author}>
                        <b>{m.author?.nom || '—'}</b>
                        {roleLab && <span className={s.role} style={{ '--role': roleCol }}>{roleLab}</span>}
                      </div>
                    )}
                    <div className={clsx(s.bubble, isDeleted && s.deleted, !isDeleted && m.type === 'image' && s.image)}>
                      {isDeleted && <><Trash2 size={13} aria-hidden="true"/> Message supprimé</>}
                      {!isDeleted && m.type === 'text' && m.content}
                      {!isDeleted && m.type === 'voice' && (
                        <VoicePlayer url={m.audioUrl} duration={m.duration}/>
                      )}
                      {!isDeleted && m.type === 'image' && (
                        <button type="button" className={s.imgBtn} onClick={() => setFullImage(m.imageUrl)} aria-label="Agrandir l'image">
                          <img src={m.imageUrl}
                            alt={'Image envoyée par ' + (m.author?.nom || 'un membre')}
                            onLoad={() => {
                              const el = messagesScrollRef.current
                              if (el) el.scrollTop = el.scrollHeight
                            }}/>
                        </button>
                      )}
                    </div>
                    <div className={s.meta}>
                      <span>{fmtHour(m.createdAt || m.timestamp)}</span>
                      {canDelete && !isDeleted && (
                        <button type="button" className={s.del} onClick={() => handleDelete(m)}
                          aria-label="Supprimer ce message" title="Supprimer">
                          <Trash2 size={13} aria-hidden="true"/>
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
            <div className={s.err} role="alert">
              <AlertCircle size={14} aria-hidden="true"/> <span>{err}</span>
            </div>
          )}

          {/* Confirmation de suppression, ou saisie */}
          {toDelete ? (
            <div className={s.confirm} role="alertdialog" aria-labelledby="chat-del-title">
              <p><b id="chat-del-title">{toDelete.author?.uid === uid ? 'Supprimer votre message ?' : 'Supprimer ce message ?'}</b>
                Il sera remplacé par « Message supprimé » pour toute l'équipe.</p>
              <div className={s.confirmBtns}>
                <Button variant="secondary" onClick={() => setToDelete(null)}>Garder</Button>
                <Button variant="danger" icon={Trash2} autoFocus onClick={confirmDelete}>Supprimer</Button>
              </div>
            </div>
          ) : (
          <div className={s.composer}>
            {recording ? (
              <>
                <button type="button" className={clsx(s.tool, s.cancelRec)} onClick={cancelRecord} aria-label="Annuler l'enregistrement">
                  <X size={18} aria-hidden="true"/>
                </button>
                <div className={s.rec} role="status">
                  <span className={s.recDot} aria-hidden="true"/>
                  <span className={s.recTime}>{formatDuration(recordSec)}</span>
                  <span className={s.recHint}>Enregistrement…</span>
                </div>
                <button type="button" className={clsx(s.tool, s.sendBtn)} onClick={stopRecord} aria-label="Envoyer le vocal">
                  <Send size={18} aria-hidden="true"/>
                </button>
              </>
            ) : (
              <>
                <button type="button" className={clsx(s.tool, s.attach)} onClick={() => fileInputRef.current?.click()}
                  aria-label="Joindre une image" title="Joindre une image" disabled={sending}>
                  <ImageIcon size={18} aria-hidden="true"/>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className={s.hidden}
                  onChange={handleImagePick} tabIndex={-1} aria-hidden="true"/>
                <input ref={inputRef}
                  className={s.input}
                  value={text}
                  onChange={(e) => { setText(e.target.value); notifyTyping() }}
                  onKeyDown={handleKey}
                  placeholder="Écrire un message…"
                  aria-label="Message"
                  enterKeyHint="send"
                  disabled={sending}/>
                {text.trim() ? (
                  <button type="button" className={clsx(s.tool, s.sendBtn)} onClick={handleSend} disabled={sending} aria-label="Envoyer le message">
                    <Send size={18} aria-hidden="true"/>
                  </button>
                ) : (
                  <button type="button" className={clsx(s.tool, s.mic)} onMouseDown={startRecord} onTouchStart={startRecord}
                    aria-label="Appuyer pour enregistrer un vocal" title="Appuyer pour enregistrer un vocal">
                    <Mic size={18} aria-hidden="true"/>
                  </button>
                )}
              </>
            )}
          </div>
          )}
        </div>
      </div>

      {/* Image plein écran */}
      {fullImage && (
        <button type="button" className={s.viewer} onClick={() => setFullImage(null)} aria-label="Fermer l'image" autoFocus>
          <img src={fullImage} alt="Image du chat en grand"/>
          <span className={s.viewerClose} aria-hidden="true"><X size={20}/></span>
        </button>
      )}
    </>
  )
}
