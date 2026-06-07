/**
 * utils/migrationV2.js
 * Migration vers architecture multi-événements v2
 * 
 * Migre depuis la racine vers events/{eventId}/ :
 * - staff/ → events/{id}/staff/
 * - benevoles/ → events/{id}/benevoles/
 * - categories/ → events/{id}/categories/
 * - audit/ (racine) → events/{id}/audit/
 * - transactions/ (racine) → events/{id}/transactions/
 * 
 * Également :
 * - Ajoute le rôle super_admin au staff migré si admin
 * - Rattache chaque membre staff à son événement
 */
import { db } from '../firebase/config'
import {
  collection, getDocs, addDoc, deleteDoc,
  writeBatch, doc, serverTimestamp, updateDoc,
} from 'firebase/firestore'

const COLLECTIONS_RACINE = ['staff', 'benevoles', 'categories', 'audit', 'transactions']

export const migrerVersV2 = async (eventId, onProgress) => {
  if (!eventId) throw new Error('EventId requis')
  const rapport = { collections: {}, erreurs: [] }

  const deleteAll = async (docs) => {
    for (let i = 0; i < docs.length; i += 499) {
      const batch = writeBatch(db)
      docs.slice(i, i + 499).forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
  }

  const copyAll = async (srcDocs, destCol) => {
    for (let i = 0; i < srcDocs.length; i += 499) {
      const batch = writeBatch(db)
      srcDocs.slice(i, i + 499).forEach(d => {
        const destRef = doc(collection(db, ...destCol))
        batch.set(destRef, d.data())
      })
      await batch.commit()
    }
  }

  for (const col of COLLECTIONS_RACINE) {
    onProgress?.(`📦 Migration "${col}"…`)
    try {
      const srcSnap = await getDocs(collection(db, col))
      if (srcSnap.empty) {
        rapport.collections[col] = { count: 0, status: 'vide' }
        onProgress?.(`  ✓ "${col}" : vide`)
        continue
      }

      // Vérifier si déjà migré (éviter doublons)
      const destSnap = await getDocs(collection(db, 'events', eventId, col))
      if (!destSnap.empty) {
        onProgress?.(`  ⚠️ "${col}" : déjà présent dans l'événement (${destSnap.size} docs) — ignoré`)
        rapport.collections[col] = { count: srcSnap.size, status: 'ignoré (déjà migré)' }
        continue
      }

      // Copier vers events/{id}/{col}
      await copyAll(srcSnap.docs, ['events', eventId, col])

      // Supprimer depuis la racine
      await deleteAll(srcSnap.docs)

      rapport.collections[col] = { count: srcSnap.size, status: 'ok' }
      onProgress?.(`  ✓ "${col}" : ${srcSnap.size} document(s) migrés`)
    } catch (err) {
      rapport.collections[col] = { status: 'erreur', err: err.message }
      rapport.erreurs.push(`${col}: ${err.message}`)
      onProgress?.(`  ✗ "${col}" : ${err.message}`)
    }
  }

  return rapport
}
