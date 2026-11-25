/**
 * firebase/config.js — v8 debug
 *
 * Init Firebase + persistance Firestore offline.
 *
 * La persistance offline change tout l'UX :
 *   - Au reload, les données déjà chargées sont disponibles INSTANTANÉMENT
 *     (lecture depuis IndexedDB local, pas de réseau)
 *   - Le sync avec le serveur se fait en arrière-plan, transparent
 *   - L'app reste utilisable même hors-ligne
 *
 * Limites :
 *   - IndexedDB ne fonctionne pas en navigation privée Firefox/Safari → on
 *     attrape l'erreur et on continue sans cache (mode dégradé)
 *   - persistentMultipleTabManager permet plusieurs onglets simultanés
 */

import { initializeApp }   from 'firebase/app'
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
} from 'firebase/firestore'
import { getAuth }         from 'firebase/auth'
import { getStorage }      from 'firebase/storage'
import { getMessaging, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  // Sur le site Fest'Ylla, la connexion Microsoft passe par le site lui-même (/__/auth, relayé
  // vers Firebase par vercel.json) : sinon les navigateurs qui isolent les sites tiers perdent
  // la connexion au retour de Microsoft.
  authDomain:        (typeof window !== 'undefined' && /(^|\.)festylla\.com$/.test(window.location.hostname))
                       ? window.location.host
                       : import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

// ── Espaces personnels : connexion séparée de celle de l'équipe (25/11/2026) ──
// Choix de l'organisateur : sur un même téléphone, l'appli de l'équipe et celle d'un espace
// (spectateur, bénévole, artiste) doivent marcher côte à côte sans conflit. Sur Android, elles
// partagent la mémoire de Chrome : avec une seule connexion Firebase, ouvrir l'une fermait l'autre.
// Ces espaces utilisent donc une instance Firebase à part (« espace ») : sa connexion est rangée
// séparément de celle de l'équipe. Ils ne gardent pas non plus de copie de la base sur le téléphone
// (une copie ancienne bloquait l'ouverture : « chargement infini » du 25/11) ; ils lisent toujours
// les données à jour. La borne et l'appli de l'équipe gardent l'instance et la copie habituelles.
const ESPACE_PERSO = /^\/(solde|balance|spectateur|benevole|artiste)(\/|$)/
export const espacePerso = typeof window !== 'undefined' && ESPACE_PERSO.test(window.location.pathname)

const app = espacePerso ? initializeApp(firebaseConfig, 'espace') : initializeApp(firebaseConfig)

// ── Firestore avec persistance IndexedDB (équipe, borne) ─────────────
// Si IndexedDB indisponible (navigation privée…), on retombe sur le mode
// sans cache — plus lent au reload mais fonctionnel.
let db
if (espacePerso) {
  db = initializeFirestore(app, { localCache: memoryLocalCache() })
} else try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  })
} catch (e) {
  console.warn('Persistance Firestore indisponible, mode dégradé :', e?.message)
  db = getFirestore(app)
}

export { db }
export const auth    = getAuth(app)
export const storage = getStorage(app)

export let messaging = null
isSupported().then(supported => {
  if (supported) messaging = getMessaging(app)
}).catch(() => {})

export default app
