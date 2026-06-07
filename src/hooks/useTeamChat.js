/**
 * hooks/useTeamChat.js — v7
 * Hook qui gère la conversation team-chat :
 * - écoute messages temps réel
 * - calcule le compteur de non-lus pour l'utilisateur courant
 * - send / send-voice / send-image / delete
 * - typing indicator
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  watchChatMessages, watchChatTyping,
  sendChatMessage, sendChatVoice, sendChatImage,
  deleteChatMessage, markAllChatMessagesRead,
  setChatTyping, clearChatTyping,
  uploadChatMedia, purgeOldChatMessages,
} from '../firebase/service'

export function useTeamChat({ eventId, currentUser, enabled = true }) {
  const [messages, setMessages]   = useState([])
  const [typingUsers, setTypingUsers] = useState([])
  const [open, setOpen]           = useState(false)
  const typingTimeoutRef = useRef(null)

  // Listener messages
  useEffect(() => {
    if (!enabled || !eventId) return
    const unsub = watchChatMessages(setMessages, eventId)
    return unsub
  }, [enabled, eventId])

  // Listener typing
  useEffect(() => {
    if (!enabled || !eventId) return
    const unsub = watchChatTyping(setTypingUsers, eventId)
    return unsub
  }, [enabled, eventId])

  // Purge auto au montage (1× par session)
  useEffect(() => {
    if (!enabled || !eventId) return
    purgeOldChatMessages(eventId)
  }, [enabled, eventId])

  // Compteur non-lus
  const uid = currentUser?.uid || currentUser?.id
  const nonLuCount = messages.filter(m =>
    !m.deletedAt &&
    m.author?.uid !== uid &&
    !(m.readBy || []).includes(uid)
  ).length

  // Marquer tous comme lus à l'ouverture
  useEffect(() => {
    if (!open || !uid || messages.length === 0) return
    const unread = messages.filter(m => !(m.readBy || []).includes(uid) && m.author?.uid !== uid)
    if (unread.length > 0) {
      markAllChatMessagesRead(unread.map(m => m.id), uid, eventId)
    }
  }, [open, messages, uid, eventId])

  // Handlers
  const send = useCallback(async (text) => {
    if (!currentUser || !text?.trim()) return
    await sendChatMessage(text, { uid, nom: currentUser.nom, role: currentUser.role }, eventId)
    clearChatTyping(uid, eventId)
  }, [currentUser, uid, eventId])

  const sendVoice = useCallback(async (blob, duration) => {
    if (!currentUser || !blob) return
    const url = await uploadChatMedia(blob, 'voice', eventId)
    await sendChatVoice(url, duration, { uid, nom: currentUser.nom, role: currentUser.role }, eventId)
  }, [currentUser, uid, eventId])

  const sendImage = useCallback(async (file) => {
    if (!currentUser || !file) return
    const url = await uploadChatMedia(file, 'image', eventId)
    await sendChatImage(url, { uid, nom: currentUser.nom, role: currentUser.role }, eventId)
  }, [currentUser, uid, eventId])

  const remove = useCallback(async (msgId) => {
    await deleteChatMessage(msgId, eventId)
  }, [eventId])

  // Typing heartbeat
  const notifyTyping = useCallback(() => {
    if (!uid) return
    setChatTyping(uid, currentUser?.nom || '', eventId)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      clearChatTyping(uid, eventId)
    }, 5000)
  }, [uid, currentUser, eventId])

  // Cleanup typing on unmount
  useEffect(() => {
    return () => {
      if (uid) clearChatTyping(uid, eventId)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [uid, eventId])

  // Filtrer les autres utilisateurs (pas moi-même) pour typing
  const othersTyping = typingUsers.filter(t => t.uid !== uid)

  return {
    messages,
    nonLuCount,
    open,
    setOpen,
    send,
    sendVoice,
    sendImage,
    remove,
    notifyTyping,
    othersTyping,
  }
}
