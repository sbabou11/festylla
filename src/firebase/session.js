/**
 * firebase/session.js — session Firebase de l'équipe et des bénévoles (sécurité, lot 1)
 *
 * La connexion passe par le serveur (api/connexion.js), qui renvoie un jeton portant le rôle.
 * L'appli ouvre avec lui une session Firebase ; ses appels aux fonctions serveur portent ensuite
 * la preuve de connexion (Authorization: Bearer <jeton>), et les règles de la base pourront
 * s'appuyer dessus (lot 3).
 */
import { signInWithCustomToken, signOut, onAuthStateChanged } from 'firebase/auth'
import { auth } from './config'

/** Appel d'une fonction serveur, avec la session si elle existe. Renvoie le JSON, ou lève une erreur lisible. */
export async function apiFetch(url, { method = 'POST', body, headers = {}, raw = false } = {}) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null
  const resp = await fetch(url, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (raw) {
    if (!resp.ok) throw await httpError(resp)
    return resp
  }
  const data = await resp.json().catch(() => ({}))
  // data : la réponse entière (ex. bracelet : { etat, essais }), pour les écrans qui en ont besoin
  if (!resp.ok) throw Object.assign(new Error(data.error || `Erreur ${resp.status}`), { status: resp.status, data })
  return data
}

async function httpError(resp) {
  const j = await resp.json().catch(() => ({}))
  return Object.assign(new Error(j.error || `Erreur ${resp.status}`), { status: resp.status })
}

/** Ouvre la session Firebase avec le jeton renvoyé par le serveur */
export const openFirebaseSession = (token) => signInWithCustomToken(auth, token)

export const closeFirebaseSession = () => signOut(auth).catch(() => {})

/** Une session YllaCash (jeton signé par le serveur) est-elle ouverte sur cet appareil ? */
export function waitForSession() {
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, (u) => { stop(); resolve(u) })
  })
}

export const hasYllaSession = async () => {
  const u = await waitForSession()
  if (!u) return false
  const r = await u.getIdTokenResult().catch(() => null)
  return !!r?.claims?.yc
}

/**
 * Ajoute la preuve de connexion à tous les appels de l'appli vers ses fonctions serveur
 * (/api/…), y compris ceux écrits avant le lot 1 avec un simple fetch. Installé une fois au démarrage.
 */
export function installApiAuth() {
  if (typeof window === 'undefined' || window.__yllaApiAuth) return
  window.__yllaApiAuth = true
  const nativeFetch = window.fetch.bind(window)
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || ''
    const sameOrigin = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`)
    if (!sameOrigin || !auth.currentUser) return nativeFetch(input, init)
    const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined))
    if (!headers.has('Authorization')) {
      const token = await auth.currentUser.getIdToken().catch(() => null)
      if (token) headers.set('Authorization', `Bearer ${token}`)
    }
    return nativeFetch(input, { ...init, headers })
  }
}
