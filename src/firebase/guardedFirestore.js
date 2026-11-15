/**
 * firebase/guardedFirestore.js — Firestore avec verrou « lecture seule » pour les archives
 *
 * Tout le code importe 'firebase/firestore' ; Vite et Vitest redirigent cet import ici
 * (alias dans vite.config.js et vitest.config.js). On réexporte tout le SDK et on
 * remplace les fonctions d'écriture : une écriture dans events/{id}/… est refusée si
 * l'événement {id} est une édition archivée consultée en lecture seule.
 *
 * Le document de l'événement lui-même (events/{id}) reste modifiable : c'est lui qui
 * porte les drapeaux « actif » et « archive ». Les opérations d'archivage (restauration,
 * suppression définitive) passent par withArchiveWrites() pour lever le verrou.
 */
export * from '@firebase/firestore'
import * as fs from '@firebase/firestore'

const readOnlyIds = new Set()
let bypass = 0

export const ARCHIVE_READONLY_MESSAGE = 'Cette édition est une archive consultée en lecture seule : aucune modification possible.'

// Liste des événements en lecture seule (mise à jour par useEventStore)
export function setReadOnlyEvents(ids) {
  readOnlyIds.clear()
  for (const id of ids || []) readOnlyIds.add(id)
}

export function isReadOnlyEvent(id) { return readOnlyIds.has(id) }

// Lève le verrou le temps d'une opération d'archivage
export async function withArchiveWrites(fn) {
  bypass++
  try { return await fn() } finally { bypass-- }
}

export function assertWritable(ref) {
  if (bypass > 0) return
  const seg = String(ref?.path || '').split('/')
  if (seg[0] === 'events' && seg.length >= 3 && readOnlyIds.has(seg[1])) {
    const err = new Error(ARCHIVE_READONLY_MESSAGE)
    err.code = 'archive/read-only'
    throw err
  }
}

const guard = (fn) => (ref, ...rest) => {
  try { assertWritable(ref) } catch (e) { return Promise.reject(e) }
  return fn(ref, ...rest)
}

export const setDoc = guard(fs.setDoc)
export const updateDoc = guard(fs.updateDoc)
export const addDoc = guard(fs.addDoc)
export const deleteDoc = guard(fs.deleteDoc)

// Lots et transactions : chaque opération est contrôlée avant d'être ajoutée
const wrapOps = (target) => {
  for (const m of ['set', 'update', 'delete']) {
    const orig = target[m].bind(target)
    target[m] = (ref, ...rest) => { assertWritable(ref); orig(ref, ...rest); return target }
  }
  return target
}

export function writeBatch(db) { return wrapOps(fs.writeBatch(db)) }

export function runTransaction(db, update, options) {
  return fs.runTransaction(db, (tx) => update(wrapOps(tx)), options)
}
