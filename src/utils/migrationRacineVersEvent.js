/**
 * utils/migrationRacineVersEvent.js
 * Migre toutes les collections racine vers events/{eventId}/
 * Collections migrées : spectateurs, transactions, reservations, menu, notifications, audit
 * Collections qui restent en racine : staff, categories, roles, settings, events
 */
import { db } from '../firebase/config'
import {
  collection, getDocs, addDoc, deleteDoc,
  serverTimestamp, writeBatch, doc,
} from 'firebase/firestore'

const COLLECTIONS_A_MIGRER = [
  'spectateurs',
  'transactions',
  'reservations',
  'menu',
  'notifications',
  'audit',
]

export const migrerVersEvenement = async (eventId, onProgress) => {
  if (!eventId) throw new Error('EventId requis')

  const rapport = { total: 0, migres: 0, erreurs: 0, details: {} }

  for (const colName of COLLECTIONS_A_MIGRER) {
    onProgress?.(`Lecture de "${colName}"…`)

    try {
      // Lire les documents en racine
      const rootSnap = await getDocs(collection(db, colName))
      if (rootSnap.empty) {
        rapport.details[colName] = { count: 0, status: 'vide' }
        onProgress?.(`"${colName}" : vide, ignoré`)
        continue
      }

      const docs = rootSnap.docs
      rapport.details[colName] = { count: docs.length, status: 'en cours' }
      onProgress?.(`"${colName}" : ${docs.length} document(s) à migrer…`)

      // Écrire dans events/{eventId}/{colName} par batch de 499
      const BATCH_SIZE = 499
      let migres = 0

      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = writeBatch(db)
        const chunk = docs.slice(i, i + BATCH_SIZE)

        chunk.forEach(d => {
          const destRef = doc(collection(db, 'events', eventId, colName))
          batch.set(destRef, d.data())
        })

        await batch.commit()
        migres += chunk.length
        onProgress?.(`"${colName}" : ${migres}/${docs.length} migrés…`)
      }

      // Supprimer les documents racine après migration réussie
      onProgress?.(`"${colName}" : suppression des données racine…`)
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = writeBatch(db)
        docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref))
        await batch.commit()
      }

      rapport.details[colName] = { count: docs.length, status: 'ok' }
      rapport.migres += docs.length
      rapport.total  += docs.length
      onProgress?.(`✓ "${colName}" : ${docs.length} document(s) migrés`)

    } catch (err) {
      rapport.details[colName] = { count: 0, status: 'erreur', err: err.message }
      rapport.erreurs++
      onProgress?.(`✗ "${colName}" : erreur — ${err.message}`)
    }
  }

  return rapport
}
