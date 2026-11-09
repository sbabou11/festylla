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
} from 'firebase/firestore'
import { getAuth }         from 'firebase/auth'
import { getStorage }      from 'firebase/storage'
import { getMessaging, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

// ── Firestore avec persistance IndexedDB ────────────────────────────
// Si IndexedDB indisponible (navigation privée…), on retombe sur le mode
// sans cache — plus lent au reload mais fonctionnel.
let db
try {
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
