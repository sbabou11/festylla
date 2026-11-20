/**
 * billets/entreeService.js — enregistrement des entrées (Firestore)
 *
 * Le compte d'un billet est le document events/{ev}/spectateurs/FY-<code> (créé par api/billets.js).
 * Une entrée valable est écrite dans une transaction : si deux bénévoles scannent le même billet
 * au même instant, un seul obtient « valable ». La transaction note aussi l'entrée dans
 * events/{ev}/entrees, qui sert de journal du jour et de file d'envoi vers Event Manager
 * (voir api/process-entrees.js).
 */
import {
  collection, doc, runTransaction, onSnapshot, query, where, FieldPath, deleteField, serverTimestamp, updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { apiFetch } from '../firebase/session'
import { checkEntree, parisNow } from './entree'

// L'adresse demande une session YllaCash (20/11/2026) : on passe par apiFetch, qui joint le jeton
const nudgeSender = () => { apiFetch('/api/process-entrees').catch(() => {}) }

/** Contrôle un billet et enregistre l'entrée du jour si elle est valable. */
export async function controlerBillet({ eventId, specId, par }) {
  const { jour, heure } = parisNow()
  const specRef = doc(db, 'events', eventId, 'spectateurs', specId)
  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(specRef)
    const spec = snap.exists() ? snap.data() : null
    const r = checkEntree(spec, jour)
    const who = spec ? { nom: spec.nom || '', pass: spec.billet?.pass || '' } : {}
    if (r.status !== 'valable') return { ...r, ...who, specId }
    tx.update(specRef, new FieldPath('billet', 'entrees', jour), heure)
    const entreeRef = doc(collection(db, 'events', eventId, 'entrees'))
    tx.set(entreeRef, {
      specId, nom: who.nom, pass: who.pass, ref: spec.billet.ref || '', jour, heure,
      annulee: false, par: par || null, creeLe: serverTimestamp(), creeMs: Date.now(),
      envoi: { statut: 'attente', tentatives: 0, prochainMs: 0, dejaEnvoye: false },
    })
    return { ...r, ...who, specId, heure, entreeId: entreeRef.id }
  })
  if (result.status === 'valable') nudgeSender()
  return result
}

/** Annule une entrée validée par erreur, le jour même seulement. */
export async function annulerEntree({ eventId, entreeId }) {
  const { jour } = parisNow()
  const entreeRef = doc(db, 'events', eventId, 'entrees', entreeId)
  await runTransaction(db, async (tx) => {
    const e = (await tx.get(entreeRef)).data()
    if (!e || e.annulee) return
    if (e.jour !== jour) throw new Error('Seule une entrée du jour peut être annulée.')
    const specRef = doc(db, 'events', eventId, 'spectateurs', e.specId)
    tx.update(specRef, new FieldPath('billet', 'entrees', e.jour), deleteField())
    tx.update(entreeRef, {
      annulee: true, annuleeLe: serverTimestamp(),
      // Jamais parti : rien à dire à Event Manager ; déjà parti : on envoie l'annulation
      envoi: e.envoi?.dejaEnvoye
        ? { statut: 'attente', tentatives: 0, prochainMs: 0, dejaEnvoye: true }
        : { ...e.envoi, statut: e.envoi?.statut === 'attente' ? 'inutile' : e.envoi?.statut || 'inutile' },
    })
  })
  nudgeSender()
}

/** Entrées du jour, les plus récentes d'abord (journal de l'écran Entrée). */
export function watchEntreesDuJour(eventId, cb) {
  const { jour } = parisNow()
  return onSnapshot(query(collection(db, 'events', eventId, 'entrees'), where('jour', '==', jour)),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.creeMs || 0) - (a.creeMs || 0))),
    () => cb([]))
}

/** Entrées qu'Event Manager a refusées (réglage à corriger) : à signaler à l'équipe. */
export function watchEnvoisEnEchec(eventId, cb) {
  return onSnapshot(query(collection(db, 'events', eventId, 'entrees'), where('envoi.statut', '==', 'echec')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => cb([]))
}

/** Remet en file les envois en échec, une fois le réglage corrigé. */
export async function relancerEnvois(eventId, items) {
  await Promise.all(items.map(e => updateDoc(doc(db, 'events', eventId, 'entrees', e.id), {
    envoi: { statut: 'attente', tentatives: 0, prochainMs: 0, dejaEnvoye: !!e.envoi?.dejaEnvoye },
  })))
  nudgeSender()
}
