/**
 * programme/watchProgramme.js — programme public d'un événement (espace spectateur, /live)
 *
 * Règle d'échange Event Manager ↔ YllaCash v1.1 : quand l'événement est relié à Event Manager,
 * le serveur publie le programme lu dans Event Manager dans events/{ev}/programme-em, au format
 * des créneaux du planning, et le signale par events/{ev}.emProgramme. Sinon (éditions 2026,
 * événement sans liaison), on garde le planning saisi dans YllaCash.
 */
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase/config'

export function watchProgramme(eventId, callback) {
  let source = null
  let inner = null
  const listen = (name) => {
    if (source === name) return
    source = name
    inner?.()
    inner = onSnapshot(
      query(collection(db, 'events', eventId, name), orderBy('debut', 'asc')),
      snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      () => {},
    )
  }
  const outer = onSnapshot(
    doc(db, 'events', eventId),
    snap => listen(snap.data()?.emProgramme ? 'programme-em' : 'planning'),
    () => listen('planning'),
  )
  return () => { outer(); inner?.() }
}
