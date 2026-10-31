/**
 * hooks/useWalkie.js — v7 palier 2 (fix audio haché)
 *
 * APPROCHE CORRIGÉE :
 * - MediaRecorder est démarré/arrêté à chaque chunk (toutes les ~1.2s).
 * - Chaque blob obtenu est un fichier WebM AUTONOME (avec header).
 * - On utilise une boucle qui (1) start le recorder, (2) attend chunkMs,
 *   (3) stop le recorder, (4) récupère le blob complet via onstop,
 *   (5) le transmet immédiatement, (6) reboucle.
 * - Le stream micro reste actif tout le long pour éviter la latence
 *   de demande de permission à chaque cycle.
 *
 * Compromis : il y a un mini-trou de ~50-100ms entre chunks (le temps que
 * le recorder s'arrête et redémarre). C'est inaudible en pratique sur de
 * la voix push-to-talk.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  requestWalkieFloor, releaseWalkieFloor, heartbeatWalkieFloor,
  sendWalkieChunk, watchWalkieFloor, watchWalkieChunks,
  purgeOldWalkieChunks,
} from '../firebase/service'

const CHUNK_MS = 1200   // durée de chaque chunk autonome

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.onerror = () => reject(new Error('read'))
  r.readAsDataURL(blob)
})

const pickMime = () => {
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus'
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm'
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4'
  return ''
}

export function useWalkie({ eventId, currentUser, enabled = true, muted = false }) {
  const [floor, setFloor]               = useState(null)
  const [iAmTalking, setIAmTalking]     = useState(false)
  const [error, setError]               = useState('')
  const [talkDuration, setTalkDuration] = useState(0)

  // Refs pour ne pas dépendre des closures React
  const streamRef          = useRef(null)
  const currentRecRef      = useRef(null)
  const isTalkingRef       = useRef(false)
  const seqRef             = useRef(0)
  const sessionIdRef       = useRef(null)
  const heartbeatTimerRef  = useRef(null)
  const durationTimerRef   = useRef(null)
  const chunkLoopActiveRef = useRef(false)
  const playedChunkIdsRef  = useRef(new Set())
  const audioQueueRef      = useRef([])
  const audioPlayingRef    = useRef(false)
  const mutedRef           = useRef(muted)
  const myUidRef           = useRef(null)
  const mimeRef            = useRef('')

  const uid = currentUser?.uid || currentUser?.id
  const nom = currentUser?.nom || 'Inconnu'

  useEffect(() => { mutedRef.current = muted }, [muted])
  useEffect(() => { myUidRef.current = uid }, [uid])

  // ─── Réception : qui parle ? ─────────────────────────────────────
  useEffect(() => {
    if (!enabled || !eventId) return
    const unsub = watchWalkieFloor(setFloor, eventId)
    return unsub
  }, [enabled, eventId])

  // ─── Lecture audio (queue séquentielle) ─────────────────────────
  const playQueue = useCallback(async () => {
    if (audioPlayingRef.current) return
    audioPlayingRef.current = true
    while (audioQueueRef.current.length > 0) {
      const dataUrl = audioQueueRef.current.shift()
      try {
        const audio = new Audio(dataUrl)
        audio.preload = 'auto'
        await new Promise((resolve) => {
          let done = false
          const finish = () => { if (!done) { done = true; resolve() } }
          audio.onended = finish
          audio.onerror = finish
          // Timeout de sécurité au cas où le chunk est corrompu
          setTimeout(finish, 4000)
          audio.play().catch(finish)
        })
      } catch {}
    }
    audioPlayingRef.current = false
  }, [])

  // ─── Réception : chunks audio ────────────────────────────────────
  useEffect(() => {
    if (!enabled || !eventId) return
    const unsub = watchWalkieChunks(chunks => {
      // Garder l'ordre chronologique par seq pour limiter le désordre Firestore
      const sorted = [...chunks].sort((a, b) => {
        if (a.sessionId !== b.sessionId) {
          return (a.timestamp || 0) - (b.timestamp || 0)
        }
        return (a.seq || 0) - (b.seq || 0)
      })
      sorted.forEach(c => {
        if (playedChunkIdsRef.current.has(c.id)) return
        if (c.author === myUidRef.current) {
          playedChunkIdsRef.current.add(c.id)
          return
        }
        const age = Date.now() - (c.timestamp || 0)
        if (age > 15000) {
          // Trop vieux : oublier sans jouer
          playedChunkIdsRef.current.add(c.id)
          return
        }
        playedChunkIdsRef.current.add(c.id)
        if (mutedRef.current) return
        audioQueueRef.current.push(c.data)
        if (!audioPlayingRef.current) playQueue()
      })

      // Nettoyer playedChunkIds des très vieux pour éviter la croissance infinie
      if (playedChunkIdsRef.current.size > 500) {
        const arr = [...playedChunkIdsRef.current].slice(-300)
        playedChunkIdsRef.current = new Set(arr)
      }
    }, eventId)
    return unsub
  }, [enabled, eventId, playQueue])

  // ─── Boucle d'enregistrement par chunks autonomes ───────────────
  const recordChunk = useCallback(() => {
    if (!isTalkingRef.current || !streamRef.current) return
    if (chunkLoopActiveRef.current) return
    chunkLoopActiveRef.current = true

    let recorder
    try {
      recorder = new MediaRecorder(streamRef.current,
        mimeRef.current ? { mimeType: mimeRef.current, audioBitsPerSecond: 24000 }
                        : { audioBitsPerSecond: 24000 })
    } catch (e) {
      console.warn('MediaRecorder ctor error:', e)
      chunkLoopActiveRef.current = false
      return
    }

    const chunks = []
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data)
    }
    recorder.onstop = async () => {
      chunkLoopActiveRef.current = false
      try {
        if (chunks.length === 0) return
        const blob = new Blob(chunks, { type: mimeRef.current || 'audio/webm' })
        const b64 = await blobToBase64(blob)
        const mySeq = seqRef.current++
        const sid   = sessionIdRef.current
        if (sid && isTalkingRef.current) {
          // Envoyer sans bloquer (fire-and-forget)
          sendWalkieChunk(sid, mySeq, b64, uid, eventId).catch(() => {})
        }
      } catch (e) { console.warn('chunk send error:', e) }

      // Enchaîner le prochain chunk si on parle toujours
      if (isTalkingRef.current) recordChunk()
    }

    currentRecRef.current = recorder
    try {
      recorder.start() // pas de timeslice → un seul chunk complet à .stop()
    } catch (e) {
      console.warn('recorder.start error:', e)
      chunkLoopActiveRef.current = false
      return
    }

    // Stop après CHUNK_MS pour finaliser le fichier
    setTimeout(() => {
      try {
        if (recorder.state === 'recording') recorder.stop()
      } catch {}
    }, CHUNK_MS)
  }, [uid, eventId])

  // ─── Émission : start ────────────────────────────────────────────
  const startTalk = useCallback(async () => {
    if (!enabled || !eventId || !uid) return false
    if (isTalkingRef.current) return false
    setError('')
    try {
      // 1. Tenter de prendre le floor
      const res = await requestWalkieFloor(uid, nom, eventId)
      if (!res.ok) {
        setError(res.holder ? (res.holder.nom + ' parle déjà') : 'Floor indisponible')
        return false
      }
      sessionIdRef.current = res.sessionId
      seqRef.current = 0

      // 2. Obtenir le stream micro UNE SEULE FOIS
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })
      streamRef.current = stream
      mimeRef.current = pickMime()

      // 3. Marquer comme en train de parler AVANT de lancer la boucle
      isTalkingRef.current = true
      setIAmTalking(true)

      // 4. Démarrer la boucle d'enregistrement par chunks
      recordChunk()

      // 5. Heartbeat
      heartbeatTimerRef.current = setInterval(() => {
        heartbeatWalkieFloor(uid, eventId)
      }, 1500)

      // 6. Timer affichage durée
      setTalkDuration(0)
      const start = Date.now()
      durationTimerRef.current = setInterval(() => {
        setTalkDuration(Math.floor((Date.now() - start) / 1000))
      }, 250)

      if (navigator.vibrate) navigator.vibrate(40)
      return true
    } catch (e) {
      setError('Micro inaccessible : ' + (e.message || ''))
      isTalkingRef.current = false
      setIAmTalking(false)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      await releaseWalkieFloor(uid, eventId).catch(() => {})
      return false
    }
  }, [enabled, eventId, uid, nom, recordChunk])

  // ─── Émission : stop ─────────────────────────────────────────────
  const stopTalk = useCallback(async () => {
    if (!isTalkingRef.current) return
    isTalkingRef.current = false
    setIAmTalking(false)
    setTalkDuration(0)

    // Stopper le recorder courant (le onstop enverra le dernier chunk)
    try {
      if (currentRecRef.current && currentRecRef.current.state === 'recording') {
        currentRecRef.current.stop()
      }
    } catch {}

    // Libérer le stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    // Cleanup timers
    if (heartbeatTimerRef.current) { clearInterval(heartbeatTimerRef.current); heartbeatTimerRef.current = null }
    if (durationTimerRef.current)  { clearInterval(durationTimerRef.current);  durationTimerRef.current = null }

    await releaseWalkieFloor(uid, eventId).catch(() => {})
  }, [uid, eventId])

  // ─── Purge périodique ───────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !eventId) return
    purgeOldWalkieChunks(eventId)
    const t = setInterval(() => purgeOldWalkieChunks(eventId), 60000)
    return () => clearInterval(t)
  }, [enabled, eventId])

  // ─── Cleanup à l'unmount ────────────────────────────────────────
  useEffect(() => () => {
    isTalkingRef.current = false
    if (currentRecRef.current && currentRecRef.current.state === 'recording') {
      try { currentRecRef.current.stop() } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current)
    if (durationTimerRef.current)  clearInterval(durationTimerRef.current)
    if (uid && eventId) releaseWalkieFloor(uid, eventId).catch(() => {})
  }, [uid, eventId])

  const someoneElseTalking = !!(floor && floor.holder && floor.holder.uid !== uid)

  return {
    floor,
    iAmTalking,
    someoneElseTalking,
    talkDuration,
    error,
    startTalk,
    stopTalk,
  }
}
