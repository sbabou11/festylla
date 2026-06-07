/**
 * components/TeamChat.jsx — v7 palier 2
 * Combine ChatFab + ChatModal + WalkieOverlay + hook useTeamChat + hook useWalkie.
 */
import React, { useEffect, useRef, useState } from 'react'
import ChatFab       from './ChatFab'
import ChatModal     from './ChatModal'
import WalkieOverlay from './WalkieOverlay'
import { useTeamChat } from '../hooks/useTeamChat'
import { useWalkie }   from '../hooks/useWalkie'

const BEEP_HZ = 880
const VIBRATE_PATTERN = [200, 80, 200, 80, 200]

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = BEEP_HZ
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + 0.35)
  } catch {}
}

const MUTE_KEY = 'walkie-muted'

export default function TeamChat({ eventId, currentUser, brandColor = '#1a6b7a', isAdmin = false }) {
  const enabled = !!(eventId && currentUser && (currentUser.uid || currentUser.id))

  // Mute walkie (persisté localStorage)
  const [walkieMuted, setWalkieMuted] = useState(() => {
    try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false }
  })
  const toggleMute = () => {
    setWalkieMuted(m => {
      const next = !m
      try { localStorage.setItem(MUTE_KEY, next ? '1' : '0') } catch {}
      return next
    })
  }

  const chat   = useTeamChat({ eventId, currentUser, enabled })
  const walkie = useWalkie({ eventId, currentUser, enabled, muted: walkieMuted })

  const knownIdsRef = useRef(new Set())
  const initialLoad = useRef(true)

  // Notif sur nouveaux messages chat
  useEffect(() => {
    if (!enabled) return
    const uid = currentUser?.uid || currentUser?.id
    chat.messages.forEach(m => {
      if (knownIdsRef.current.has(m.id)) return
      knownIdsRef.current.add(m.id)
      if (initialLoad.current) return
      if (m.author?.uid === uid) return
      const ts = m.createdAt?.toMillis ? m.createdAt.toMillis() : new Date(m.timestamp || 0).getTime()
      if (ts && (Date.now() - ts) > 30000) return
      if (chat.open) {
        if (navigator.vibrate) navigator.vibrate(60)
        return
      }
      playBeep()
      if (navigator.vibrate) navigator.vibrate(VIBRATE_PATTERN)
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          const body = m.type === 'text' ? (m.content || '').substring(0, 80)
                     : m.type === 'voice' ? '🎤 Message vocal'
                     : m.type === 'image' ? '📷 Photo'
                     : 'Nouveau message'
          new Notification('💬 ' + (m.author?.nom || 'Équipe'), { body, tag: 'chat-' + m.id, silent: false })
        } catch {}
      }
    })
    initialLoad.current = false
  }, [chat.messages, chat.open, enabled, currentUser])

  // Vibration courte quand quelqu'un commence à parler (annonce du flux)
  const lastFloorUidRef = useRef(null)
  useEffect(() => {
    if (!enabled) return
    const currentTalker = walkie.floor?.holder?.uid || null
    if (currentTalker && currentTalker !== lastFloorUidRef.current) {
      // Nouveau locuteur
      const myUid = currentUser?.uid || currentUser?.id
      if (currentTalker !== myUid && navigator.vibrate) {
        navigator.vibrate(40)
      }
    }
    lastFloorUidRef.current = currentTalker
  }, [walkie.floor, enabled, currentUser])

  // Demander permission notif au montage
  useEffect(() => {
    if (!enabled) return
    if ('Notification' in window && Notification.permission === 'default') {
      try { Notification.requestPermission().catch(() => {}) } catch {}
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <>
      <ChatFab
        uid={currentUser.uid || currentUser.id}
        color={brandColor}
        nonLuCount={chat.nonLuCount}
        onOpenChat={() => chat.setOpen(true)}
        onWalkieStart={walkie.startTalk}
        onWalkieStop={walkie.stopTalk}
        iAmTalking={walkie.iAmTalking}
        someoneElseTalking={walkie.someoneElseTalking}
        talkDuration={walkie.talkDuration}
      />
      <ChatModal
        open={chat.open}
        onClose={() => chat.setOpen(false)}
        messages={chat.messages}
        othersTyping={chat.othersTyping}
        currentUser={currentUser}
        brandColor={brandColor}
        isAdmin={isAdmin}
        send={chat.send}
        sendVoice={chat.sendVoice}
        sendImage={chat.sendImage}
        remove={chat.remove}
        notifyTyping={chat.notifyTyping}
        walkieMuted={walkieMuted}
        onToggleWalkieMute={toggleMute}
      />
      <WalkieOverlay
        iAmTalking={walkie.iAmTalking}
        someoneElseTalking={walkie.someoneElseTalking}
        talkerName={walkie.floor?.holder?.nom || ''}
        muted={walkieMuted}
        onToggleMute={toggleMute}
      />
    </>
  )
}
