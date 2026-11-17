/**
 * archive/format.js — format des archives d'édition (fichier ZIP)
 *
 *   manifest.json          description, nombres d'éléments, empreintes de contrôle
 *   data/event.json        document de l'événement
 *   data/<collection>.json [{ id, data }] pour chaque sous-collection
 *   files/<chemin Storage> photos, justificatifs, décharges…
 *   lisible/<nom>.xlsx     classeur consultable sans l'appli
 *
 * Fonctions pures (sans Firebase) : testées dans format.test.js.
 */

export const ARCHIVE_FORMAT = 'yllacash-archive'
export const ARCHIVE_VERSION = 1

// Toutes les sous-collections d'un événement (events/{id}/…).
// Un test vérifie qu'aucune collection utilisée dans le code n'est oubliée.
export const ARCHIVE_COLLECTIONS = [
  '_counters', 'analysisTables', 'artist-consumptions', 'artist-reservations', 'audit', 'benevoles',
  'cachets', 'categories', 'clotures', 'commandes', 'expositions', 'finances', 'menu', 'notifications',
  'planning', 'reservations', 'scheduled-reminders', 'settings', 'spectateurs', 'staff', 'team-chat',
  'team-chat-typing', 'transactions', 'volunteer-posts', 'volunteer-shifts', 'walkie-chunks', 'walkie-state',
  'entrees', 'billetterie-recus',
]

// Champs jamais archivés : mots de passe du personnel et des bénévoles
export const SECRET_FIELDS = ['password', 'passwordHash']

/**
 * Encode une valeur Firestore en JSON. Les types propres à Firestore sont marqués :
 * { $t: 'ts', s, n } pour une date (Timestamp), { $t: 'geo' }, { $t: 'ref' }, { $t: 'bytes' }.
 */
export function encodeValue(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : { $t: 'num', v: String(v) }
  if (typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map(encodeValue)
  if (typeof v.toMillis === 'function' && 'seconds' in v && 'nanoseconds' in v) return { $t: 'ts', s: v.seconds, n: v.nanoseconds }
  if (v instanceof Date) return { $t: 'ts', s: Math.floor(v.getTime() / 1000), n: (v.getTime() % 1000) * 1e6 }
  if ('latitude' in v && 'longitude' in v && typeof v.isEqual === 'function') return { $t: 'geo', lat: v.latitude, lng: v.longitude }
  if (typeof v.path === 'string' && v.firestore) return { $t: 'ref', path: v.path }
  if (typeof v.toBase64 === 'function') return { $t: 'bytes', b64: v.toBase64() }
  const out = {}
  for (const [k, x] of Object.entries(v)) out[k] = encodeValue(x)
  return out
}

/** Inverse de encodeValue. `make` fournit les constructeurs Firestore (injectés pour les tests). */
export function decodeValue(v, make) {
  if (v === null || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map(x => decodeValue(x, make))
  switch (v.$t) {
    case 'ts': return make.timestamp(v.s, v.n)
    case 'num': return Number(v.v)
    case 'geo': return make.geo(v.lat, v.lng)
    case 'ref': return make.ref(v.path)
    case 'bytes': return make.bytes(v.b64)
    default: {
      const out = {}
      for (const [k, x] of Object.entries(v)) out[k] = decodeValue(x, make)
      return out
    }
  }
}

export function stripSecrets(data) {
  const out = { ...data }
  for (const k of SECRET_FIELDS) delete out[k]
  return out
}

// Adresses de fichiers Firebase Storage présentes dans les données (photos, justificatifs…)
const STORAGE_URL = /https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?"'\s]+)(\?[^"'\s]*)?/g

export function storagePathFromUrl(url) {
  const m = /\/o\/([^?]+)/.exec(url)
  return m ? decodeURIComponent(m[1]) : null
}

export function findStorageUrls(value, acc = new Set()) {
  if (typeof value === 'string') {
    for (const m of value.matchAll(STORAGE_URL)) acc.add(m[0])
  } else if (value && typeof value === 'object') {
    for (const x of Object.values(value)) findStorageUrls(x, acc)
  }
  return acc
}

/** Remplace dans les données les anciennes adresses de fichiers par les nouvelles (après restauration). */
export function replaceUrls(value, map) {
  if (typeof value === 'string') {
    return value.replace(STORAGE_URL, (url) => map.get(storagePathFromUrl(url)) || url)
  }
  if (Array.isArray(value)) return value.map(x => replaceUrls(x, map))
  // Seulement les objets simples : une date Firestore (Timestamp) doit rester intacte
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    const out = {}
    for (const [k, x] of Object.entries(value)) out[k] = replaceUrls(x, map)
    return out
  }
  return value
}

export async function sha256(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export function safeFileName(s) {
  return String(s || 'edition').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w .()'-]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'edition'
}

/**
 * Contrôle d'une archive lue : format, présence et empreinte de chaque partie.
 * `files` : { chemin: Uint8Array } issu de unzipSync. Renvoie { manifest, problems }.
 */
export async function checkArchive(files) {
  const problems = []
  const raw = files['manifest.json']
  if (!raw) return { manifest: null, problems: ['Ce fichier n\'est pas une archive YllaCash (manifest.json absent).'] }
  let manifest
  try { manifest = JSON.parse(new TextDecoder().decode(raw)) } catch { return { manifest: null, problems: ['Le fichier manifest.json est illisible.'] } }
  if (manifest.format !== ARCHIVE_FORMAT) problems.push('Ce fichier n\'est pas une archive YllaCash.')
  if (manifest.version > ARCHIVE_VERSION) problems.push('Archive créée par une version plus récente de YllaCash : mettez l\'appli à jour.')
  for (const [name, part] of Object.entries(manifest.parts || {})) {
    const bytes = files[name]
    if (!bytes) { problems.push(`Partie manquante : ${name}`); continue }
    if (await sha256(bytes) !== part.sha256) problems.push(`Partie abîmée : ${name}`)
  }
  return { manifest, problems }
}
