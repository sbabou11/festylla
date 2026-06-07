/**
 * store/useEventStore.js
 * Gestion de l'événement actif — persisté dans localStorage
 * Structure Firestore : events/{eventId}/... (toutes les collections)
 * Collection globale : events/ { nom, description, date, lieu, logo, couleur, actif, createdAt }
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { db } from '../firebase/config'
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy, getDoc, getDocs,
} from 'firebase/firestore'

const useEventStore = create(
  persist(
    (set, get) => ({
      events:         [],
      currentEventId: null,   // ID de l'événement actif
      eventLoading:   true,

      // Retourne le chemin de base pour les sous-collections
      eventPath: () => {
        const id = get().currentEventId
        if (!id) throw new Error('Aucun événement sélectionné')
        return `events/${id}`
      },

      // Retourne une sous-collection de l'événement actif
      subCol: (name) => {
        const id = get().currentEventId
        if (!id) throw new Error('Aucun événement sélectionné')
        return collection(db, 'events', id, name)
      },

      // Écouter tous les événements en temps réel
      watchEvents: (callback) => {
        const unsub = onSnapshot(
          query(collection(db, 'events'), orderBy('createdAt', 'desc')),
          snap => {
            const evts    = snap.docs.map(d => ({ ...d.data(), id: d.id })).filter(e => !e.deleted)
            const current = get().currentEventId

            // Auto-sélectionner l'événement actif (actif: true) en priorité
            // Si aucun actif, prendre le premier de la liste
            const activeEvent  = evts.find(e => e.actif === true)
            const stillValid   = current && evts.some(e => e.id === current)

            if (!stillValid && evts.length > 0) {
              set({ currentEventId: (activeEvent || evts[0]).id })
            } else if (stillValid && activeEvent && activeEvent.id !== current) {
              // L'admin a changé l'événement actif — synchroniser tous les appareils
              set({ currentEventId: activeEvent.id })
            }

            set({ events: evts, eventLoading: false })
            callback?.(evts)
          },
          () => set({ eventLoading: false })
        )
        return unsub
      },

      // Sélectionner un événement
      selectEvent: async (id) => {
        set({ currentEventId: id })
        // Marquer cet événement comme actif dans Firebase
        // et désactiver tous les autres — synchronise tous les appareils
        try {
          const snap = await getDocs(collection(db, 'events'))
          const batch = (await import('firebase/firestore')).writeBatch(db)
          snap.docs.forEach(d => {
            batch.update(d.ref, { actif: d.id === id })
          })
          await batch.commit()
        } catch (e) { console.warn('selectEvent sync error:', e) }
      },

      // Créer un nouvel événement
      createEvent: async (data) => {
        const ref = await addDoc(collection(db, 'events'), {
          ...data,
          actif: false,
          createdAt: serverTimestamp(),
        })
        // Initialiser les settings de l'événement
        await addDoc(collection(db, 'events', ref.id, 'settings'), {
          festName: data.nom,
          theme: {},
          createdAt: serverTimestamp(),
        })
        return ref.id
      },

      // Modifier un événement
      updateEvent: async (id, patch) => {
        await updateDoc(doc(db, 'events', id), patch)
      },

      // Supprimer un événement (et toutes ses données)
      deleteEvent: async (id) => {
        // Firestore ne supprime pas les sous-collections automatiquement
        // On marque comme supprimé et un admin nettoiera via console si besoin
        await updateDoc(doc(db, 'events', id), { deleted: true, deletedAt: serverTimestamp() })
        if (get().currentEventId === id) set({ currentEventId: null })
      },

      // Dupliquer un événement (copie le menu et le staff)
      duplicateEvent: async (sourceId, newData) => {
        const newId = await get().createEvent(newData)
        // Copier le menu
        const menuSnap = await import('firebase/firestore').then(({ getDocs }) =>
          getDocs(collection(db, 'events', sourceId, 'menu'))
        )
        const { getDocs } = await import('firebase/firestore')
        const batch = (await import('firebase/firestore')).writeBatch(db)
        menuSnap.docs.forEach(d => {
          const ref = doc(collection(db, 'events', newId, 'menu'))
          batch.set(ref, d.data())
        })
        await batch.commit()
        return newId
      },

      currentEvent: () => {
        const { events, currentEventId } = get()
        return events.find(e => e.id === currentEventId) || null
      },
    }),
    {
      name: 'yllatok-event',
      // Persiste l'ID actif + un cache léger des events de base (id, nom, dates,
      // logo, couleur) pour permettre un affichage immédiat au reload, en
      // attendant que Firestore livre la version fraîche du cache offline.
      partialize: (s) => ({
        currentEventId: s.currentEventId,
        events: (s.events || []).map(e => ({
          id: e.id, nom: e.nom, date: e.date, dateFin: e.dateFin,
          logoSrc: e.logoSrc, couleur: e.couleur, actif: e.actif,
        })),
      }),
    }
  )
)

export default useEventStore

// Registre global pour accès inter-modules sans import circulaire
if (typeof window !== 'undefined') {
  window.__yllatok_stores__ = window.__yllatok_stores__ || {}
  window.__yllatok_stores__.eventStore = useEventStore
}
