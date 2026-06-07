/**
 * utils/migrateCats.js
 * Exécuté une fois depuis la console du navigateur.
 * Copie les catégories de la racine vers l'événement actif.
 * Usage : importé et appelé depuis Settings.jsx (bouton admin)
 */
import { db } from '../firebase/config'
import {
  collection, getDocs, addDoc, deleteDoc,
  serverTimestamp
} from 'firebase/firestore'

export const migrerCategories = async (eventId) => {
  if (!eventId) throw new Error('Aucun événement sélectionné')

  // Lire les catégories en racine
  const rootSnap = await getDocs(collection(db, 'categories'))
  if (rootSnap.empty) return { migrated: 0, message: 'Aucune catégorie en racine' }

  // Lire celles déjà dans l'événement (pour éviter les doublons)
  const eventSnap = await getDocs(collection(db, 'events', eventId, 'categories'))
  const eventNoms  = new Set(eventSnap.docs.map(d => d.data().nom))

  let migrated = 0
  for (const d of rootSnap.docs) {
    const data = d.data()
    if (!eventNoms.has(data.nom)) {
      // Copier dans l'événement
      await addDoc(collection(db, 'events', eventId, 'categories'), {
        ...data,
        createdAt: serverTimestamp(),
      })
      migrated++
    }
    // Supprimer de la racine
    await deleteDoc(d.ref)
  }

  return { migrated, message: `${migrated} catégorie(s) migrée(s) vers l'événement` }
}
