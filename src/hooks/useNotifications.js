/**
 * hooks/useNotifications.js
 * Notifications in-app temps réel + push PWA.
 *
 * IMPORTANT : les notifications sont écrites par service.js dans
 * events/{eventId}/notifications via col('notifications').
 * Ce hook écoute le même chemin.
 *
 * Audience :
 *   staff  → voit les notifs de type staff/both
 *   spec   → voit uniquement ses propres notifs (filtré par specId)
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { db }         from '../firebase/config'
import useEventStore  from '../store/useEventStore'
import {
  collection, addDoc, onSnapshot, query,
  orderBy, serverTimestamp, writeBatch, doc,
} from 'firebase/firestore'

// ── Helper pour écrire une notif depuis n'importe où ─────────────
const getEventIdFromStorage = () => {
  try {
    const raw = localStorage.getItem('yllatok-event')
    return raw ? JSON.parse(raw)?.state?.currentEventId || null : null
  } catch { return null }
}

export const pushNotification = async ({ type, titre, message, specId = null, resaId = null, resaCode = null }) => {
  try {
    const eventId = getEventIdFromStorage()
    const targetCol = eventId
      ? collection(db, 'events', eventId, 'notifications')
      : collection(db, 'notifications')
    await addDoc(targetCol, {
      type, titre, message, specId, resaId, resaCode,
      lu: false,
      timestamp: new Date().toISOString(),
      createdAt: serverTimestamp(),
    })
  } catch (e) {
    console.warn('pushNotification error:', e)
  }
}

// ── Types ─────────────────────────────────────────────────────────
export const NOTIF_TYPES = {
  // Staff (stand + admin)
  RESA_CREEE:   { icon: '🛒', label: 'Nouvelle réservation',        color: '#1a6b7a', audience: 'staff' },
  RESA_RETIREE: { icon: '📦', label: 'Réservation retirée/annulée', color: '#92400e', audience: 'staff' },
  ALERTE:            { icon: '⚠️', label: 'Alerte stock',                 color: '#991b1b', audience: 'staff' },
  RESA_PRISE_STAFF:  { icon: '👨‍🍳', label: 'Résa prise en charge',           color: '#534AB7', audience: 'staff' },
  // Tous (staff + spectateurs)
  PLANNING_MODIF: { icon: '📅', label: 'Changement de programme', color: '#1a6b7a', audience: 'planning' },

  // Spectateur uniquement
  RESA_PRISE:   { icon: '👨‍🍳', label: 'Commande en préparation',    color: '#534AB7', audience: 'spec'  },
  RESA_PRETE:   { icon: '✅', label: 'Commande prête !',            color: '#065f46', audience: 'spec'  },
  CREDIT:       { icon: '💳', label: 'Compte crédité',              color: '#1a6b7a', audience: 'spec'  },
  SOLDE_BAS:        { icon: '⚠️', label: 'Solde faible',       color: '#BA7517', audience: 'spec'  },
  RESA_RETIREE_SPEC:  { icon: '✅', label: 'Commande retirée',      color: '#065f46', audience: 'spec'  },
  RESA_ANNULEE_SPEC:  { icon: '❌', label: 'Réservation annulée',    color: '#DC2626', audience: 'spec'  },

  // Artistes
  ARTISTE_RESA_NOUVELLE: { icon: '🎁', label: 'Réservation artiste',       color: '#7c3aed', audience: 'staff'   },
  PLANNING_MODIF_MOI:    { icon: '⚠️', label: 'Votre créneau modifié',    color: '#DC2626', audience: 'artiste' },
  DROITS_MODIFIES:       { icon: '🎁', label: 'Vos avantages mis à jour', color: '#1a6b7a', audience: 'artiste' },
  ARTISTE_RESA_SERVIE:   { icon: '✅', label: 'Réservation servie',         color: '#065f46', audience: 'artiste' },
}

// ── Hook ──────────────────────────────────────────────────────────
export function useNotifications({ specId = null, isStaff = false, staffId = null, staffRole = null, eventId: explicitEventId = null, creneauId = null } = {}) {
  const [notifications, setNotifications] = useState([])
  const [permGranted, setPermGranted]     = useState(false)
  const knownIds     = useRef(new Set())
  const sessionStart = useRef(Date.now())
  const { currentEventId: storeEventId } = useEventStore()
  const currentEventId = explicitEventId || storeEventId

  // Demander permission push au montage
  useEffect(() => {
    if (!('Notification' in window)) return
    if (Notification.permission === 'granted') {
      setPermGranted(true)
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => setPermGranted(p === 'granted'))
    }
  }, [])

  const sendPushRef = useRef(null)
  const sendPush = useCallback((titre, body) => {
    // Son de notification
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.3)
    } catch {}

    // Vibration (mobile)
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200])

    // Badge sur l'onglet
    try {
      if ('setAppBadge' in navigator) navigator.setAppBadge()
    } catch {}

    // Notification native si permission accordée
    if (!permGranted || Notification.permission !== 'granted') return
    try {
      const n = new Notification(titre, {
        body, icon: '/logo-192.png', badge: '/logo-192.png',
        vibrate: [200, 100, 200], tag: 'yllatok', renotify: true,
      })
      n.onclick = () => { window.focus(); n.close() }
    } catch {}
  }, [permGranted])

  // Garder sendPushRef à jour sans recréer le listener
  useEffect(() => { sendPushRef.current = sendPush }, [sendPush])

  // Écouter les notifications dans l'event courant
  useEffect(() => {
    // Construire le chemin correct
    // Pour les bénévoles (page publique), eventId vient de explicitEventId
    const notifCol = currentEventId
      ? collection(db, 'events', currentEventId, 'notifications')
      : collection(db, 'notifications')

    const unsub = onSnapshot(
      query(notifCol, orderBy('createdAt', 'desc')),
      snap => {
        const all = snap.docs.map(d => ({ ...d.data(), id: d.id }))

        // Filtrer selon le profil
        const relevant = all.filter(n => {
          const cfg = NOTIF_TYPES[n.type]
          if (!cfg) return false
          // Staff (stand + admin) : voit RESA_CREEE, RESA_RETIREE, RESA_PRISE, ALERTE
          if (isStaff) {
            // Planning : admin, super_admin, directeur_artistique
            if (cfg.audience === 'planning') {
              return staffRole === 'admin' || staffRole === 'super_admin' || staffRole === 'directeur_artistique'
            }
            if (cfg.audience !== 'staff' && cfg.audience !== 'both') return false
            if (n.excludeStaffId && n.excludeStaffId === staffId) return false
            return true
          }
          // Spectateur ou bénévole
          if (specId) {
            // Notifs planning → visibles par tous les spectateurs (pas de filtre specId)
            if (cfg.audience === 'planning') return true
            if (cfg.audience !== 'spec' && cfg.audience !== 'both') return false
            return n.specId === specId || n.benevoleId === specId
          }
          // Artiste (filtré par creneauId)
          if (creneauId) {
            // Notifs planning générales : visibles par tous
            if (cfg.audience === 'planning') return true
            // Notifs ciblées artiste : seulement si c'est SON créneau
            if (cfg.audience === 'artiste') return n.creneauId === creneauId
            return false
          }
          return false
        })

        // Uniquement depuis le début de la session
        // Notifs des 2 dernières heures maximum
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
        const sessionNotifs = relevant.filter(n =>
          !n.timestamp || new Date(n.timestamp).getTime() >= twoHoursAgo
        )

        setNotifications(sessionNotifs)

        // Push native pour les nouvelles
        sessionNotifs.forEach(n => {
          if (knownIds.current.has(n.id)) return
          knownIds.current.add(n.id)
          if (n.timestamp && new Date(n.timestamp).getTime() < sessionStart.current) return
          sendPushRef.current?.(n.titre, n.message)
        })
      },
      err => console.warn('notifications listener error:', err)
    )

    return unsub
  }, [specId, isStaff, currentEventId, creneauId])

  // Marquer tout comme lu
  const marquerToutLu = useCallback(async () => {
    const nonLus = notifications.filter(n => !n.lu)
    if (!nonLus.length) return
    const notifCol = currentEventId
      ? collection(db, 'events', currentEventId, 'notifications')
      : collection(db, 'notifications')
    try {
      const batch = writeBatch(db)
      nonLus.forEach(n => batch.update(doc(notifCol, n.id), { lu: true }))
      await batch.commit()
      setNotifications(prev => prev.map(n => ({ ...n, lu: true })))
    } catch {}
  }, [notifications, currentEventId])

  return {
    notifications,
    nonLuCount: notifications.filter(n => !n.lu).length,
    marquerToutLu,
    sendPush,
    permGranted,
  }
}
