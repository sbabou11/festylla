/**
 * firebase/publicSession.js — sessions des pages publiques (sécurité, lot 2)
 *
 * - ensureSpectatorSession : compte spectateur (/solde, inscription), par code + clé du billet ou du compte
 * - ensureLinkSession      : lien personnel (bénévole, artiste) ou appareil (borne, écran)
 * - linkFor                : pour l'équipe, lien avec clé à donner (crée la clé si elle n'existe pas)
 *
 * Un appareil où l'équipe est connectée garde sa session : elle voit déjà tout.
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './config'
import { apiFetch, openFirebaseSession, waitForSession } from './session'

async function claims() {
  const u = await waitForSession()
  if (!u) return null
  const r = await u.getIdTokenResult().catch(() => null)
  return r?.claims?.yc ? r.claims : null
}

const keyStore = (ev, id) => `yllacash-cle-${ev}-${id}`
export const rememberedKey = (ev, id) => { try { return localStorage.getItem(keyStore(ev, id)) || '' } catch { return '' } }
const rememberKey = (ev, id, cle) => { try { if (cle) localStorage.setItem(keyStore(ev, id), cle) } catch {} }

/** Adresse publique du compte, avec sa clé si on la connaît */
export function soldeUrl(ev, id, cle = rememberedKey(ev, id)) {
  return `${window.location.origin}/solde?id=${id}${ev ? `&ev=${ev}` : ''}${cle ? `&k=${cle}` : ''}`
}

/**
 * Ouvre (ou garde) une session sur le compte `id`. Renvoie { ok, error?, staff? }.
 * La clé vient de l'adresse (&k=) ou du téléphone, qui la retient après la première ouverture.
 */
export async function ensureSpectatorSession({ ev, id, cle }) {
  const c = await claims()
  if (c?.type === 'staff') return { ok: true, staff: true }
  if (c?.type === 'spectateur' && c.specId === id && (c.eventIds || []).includes(ev)) return { ok: true }
  const key = (cle || rememberedKey(ev, id) || '').toLowerCase()
  try {
    const r = await apiFetch('/api/session', { body: { mode: 'compte', ev, id, cle: key || undefined } })
    await openFirebaseSession(r.token)
    rememberKey(ev, id, r.compte?.cle || key)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.status ? e.message : 'Connexion impossible : vérifiez le réseau et réessayez.' }
  }
}

/** Session d'un lien personnel ou d'un appareil. kind : 'benevole' | 'artiste' | 'borne' | 'ecran' */
export async function ensureLinkSession({ kind, ev, id = '', cle }) {
  const c = await claims()
  if (c?.type === 'staff') return { ok: true, staff: true }
  const same = c && (c.eventIds || []).includes(ev) && (
    (kind === 'benevole' && c.type === 'benevole' && String(c.fiche || '').endsWith(`/${id}`)) ||
    (kind === 'artiste' && c.type === 'artiste' && c.creneauId === id) ||
    ((kind === 'borne' || kind === 'ecran') && c.type === kind))
  if (same) return { ok: true }
  if (!cle) return { ok: false, error: 'Ce lien est incomplet : demandez un nouveau lien à l\'organisation.' }
  try {
    const r = await apiFetch('/api/session', { body: { mode: 'lien', kind, ev, id, cle: cle.toLowerCase() } })
    await openFirebaseSession(r.token)
    return { ok: true, compte: r.compte }
  } catch (e) {
    return { ok: false, error: e.status ? e.message : 'Connexion impossible : vérifiez le réseau et réessayez.' }
  }
}

const randomKey = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')
const linkDocId = (kind, id) => (kind === 'borne' || kind === 'ecran') ? kind : `${kind}-${id}`

/** Équipe connectée : clé du lien (créée au premier besoin), rangée dans events/{ev}/liens */
export async function linkKey(ev, kind, id = '') {
  const ref = doc(db, 'events', ev, 'liens', linkDocId(kind, id))
  const snap = await getDoc(ref)
  if (snap.exists() && snap.data().cle) return snap.data().cle
  const cle = randomKey()
  await setDoc(ref, { cle, kind, id: id || null, creeLe: serverTimestamp(), creePar: auth.currentUser?.uid || null })
  return cle
}

/** Nouvelle clé : les anciens liens (perdus, partagés par erreur) ne marchent plus */
export async function renewLinkKey(ev, kind, id = '') {
  const cle = randomKey()
  await setDoc(doc(db, 'events', ev, 'liens', linkDocId(kind, id)), { cle, kind, id: id || null, creeLe: serverTimestamp(), creePar: auth.currentUser?.uid || null })
  return cle
}

/** Adresse complète d'un lien personnel ou d'appareil */
export async function linkFor(ev, kind, id = '', extra = '') {
  const cle = await linkKey(ev, kind, id)
  const base = window.location.origin
  if (kind === 'benevole') return `${base}/benevole?id=${id}&ev=${ev}&k=${cle}`
  if (kind === 'artiste') return `${base}/artiste?ev=${ev}&cr=${id}&k=${cle}`
  return `${base}/${kind}?ev=${ev}${extra}&k=${cle}`
}
