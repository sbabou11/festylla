/**
 * menu/carte.js — rayons et stands de retrait de la carte
 *
 * Un seul document par événement : events/{ev}/settings/carte
 *   rayons : [{ id, nom, icon, ordre }]   (Plats, Boissons…, en haut de la borne)
 *   stands : [{ id, numero, nom }]        (numéro imprimé en grand sur les tickets)
 * Les catégories portent rayonId, les articles portent standId.
 * Le stand ne s'affiche jamais côté client : il sert à imprimer un ticket par stand.
 */
import { db } from '../firebase/config'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'

const carteRef = (evId) => doc(db, 'events', evId, 'settings', 'carte')

export const newId = () => Math.random().toString(36).slice(2, 10)

/** Lecture en direct ; cb({ rayons, stands }) triés */
export function watchCarte(evId, cb, onError) {
  if (!evId) { cb({ rayons: [], stands: [] }); return () => {} }
  return onSnapshot(carteRef(evId), snap => {
    const d = snap.exists() ? snap.data() : {}
    cb({
      rayons: [...(d.rayons || [])].sort((a, b) => (a.ordre || 0) - (b.ordre || 0)),
      stands: [...(d.stands || [])].sort((a, b) => (a.numero || 0) - (b.numero || 0)),
    })
  }, onError)
}

/** Remplace la liste des rayons ou des stands */
export const saveRayons = (evId, rayons) =>
  setDoc(carteRef(evId), { rayons: rayons.map((r, i) => ({ ...r, ordre: i + 1 })) }, { merge: true })

export const saveStands = (evId, stands) =>
  setDoc(carteRef(evId), { stands }, { merge: true })

export const standLabel = (st) => (st ? `N° ${st.numero} · ${st.nom}` : '')
