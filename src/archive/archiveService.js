/**
 * archive/archiveService.js — archiver, vérifier, supprimer et restaurer une édition
 *
 * - buildArchive(eventId)        → Blob ZIP + manifeste (données, fichiers, classeur lisible)
 * - verifyArchiveForPurge(file)  → l'archive choisie correspond-elle bien aux données en base ?
 * - purgeEvent(eventId)          → suppression définitive (données + fichiers + événement)
 * - restoreArchive(file)         → remet l'édition en base, en lecture seule
 *
 * Les fichiers stockés (photos, justificatifs) sont téléchargés via /api/archive-file :
 * Firebase Storage refuse les téléchargements directs depuis le navigateur.
 */
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import {
  collection, doc, getDoc, getDocs, writeBatch, setDoc, deleteDoc,
  Timestamp, GeoPoint, Bytes, serverTimestamp, withArchiveWrites,
} from 'firebase/firestore'
import { ref as sref, listAll, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../firebase/config'
import {
  ARCHIVE_FORMAT, ARCHIVE_VERSION, ARCHIVE_COLLECTIONS, encodeValue, decodeValue, stripSecrets,
  findStorageUrls, storagePathFromUrl, replaceUrls, sha256, safeFileName, checkArchive,
} from './format'
import { buildReadableWorkbook } from './readable'
import { APP_VERSION_LABEL } from '../utils/buildInfo'

const step = (onProgress, label, ratio) => onProgress?.({ label, ratio })

async function listStorageRecursive(path, acc = []) {
  const res = await listAll(sref(storage, path))
  for (const it of res.items) acc.push(it.fullPath)
  for (const p of res.prefixes) await listStorageRecursive(p.fullPath, acc)
  return acc
}

async function downloadStorageFile(path) {
  const r = await fetch(`/api/archive-file?path=${encodeURIComponent(path)}`)
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(j.error || `erreur ${r.status}`)
  }
  return { bytes: new Uint8Array(await r.arrayBuffer()), contentType: r.headers.get('content-type') || 'application/octet-stream' }
}

// ── 1. Création de l'archive ──────────────────────────────────────────────────
export async function buildArchive(eventId, { onProgress } = {}) {
  step(onProgress, 'Lecture de l\'événement', 0)
  const evSnap = await getDoc(doc(db, 'events', eventId))
  if (!evSnap.exists()) throw new Error('Événement introuvable.')
  const event = evSnap.data()

  const zipFiles = {}
  const parts = {}
  const counts = {}
  const raw = {}           // données décodées, pour le classeur lisible
  const urls = new Set()
  const put = async (name, bytes, extra = {}) => {
    zipFiles[name] = bytes
    parts[name] = { sha256: await sha256(bytes), size: bytes.length, ...extra }
  }

  await put('data/event.json', strToU8(JSON.stringify({ id: eventId, data: encodeValue(event) })))
  findStorageUrls(event, urls)

  for (const [i, name] of ARCHIVE_COLLECTIONS.entries()) {
    step(onProgress, `Lecture des données (${name})`, 0.05 + 0.45 * (i / ARCHIVE_COLLECTIONS.length))
    const snap = await getDocs(collection(db, 'events', eventId, name))
    if (!snap.size) continue
    const docs = snap.docs.map(d => ({ id: d.id, data: stripSecrets(d.data()) }))
    docs.forEach(d => findStorageUrls(d.data, urls))
    raw[name] = docs
    counts[name] = docs.length
    await put(`data/${name}.json`, strToU8(JSON.stringify(docs.map(d => ({ id: d.id, data: encodeValue(d.data) })))), { count: docs.length })
  }

  // Fichiers : tout ce qui est rangé sous events/{id}/ + les adresses trouvées dans les données
  step(onProgress, 'Inventaire des fichiers', 0.5)
  const paths = new Set()
  try { (await listStorageRecursive(`events/${eventId}`)).forEach(p => paths.add(p)) } catch (e) { console.warn('listAll', e) }
  urls.forEach(u => { const p = storagePathFromUrl(u); if (p) paths.add(p) })

  const fileList = [], missingFiles = []
  let k = 0
  for (const p of paths) {
    step(onProgress, `Téléchargement des fichiers (${++k}/${paths.size})`, 0.5 + 0.35 * (k / Math.max(paths.size, 1)))
    try {
      const { bytes, contentType } = await downloadStorageFile(p)
      await put(`files/${p}`, bytes, { contentType })
      fileList.push({ path: p, contentType, size: bytes.length })
    } catch (e) {
      missingFiles.push({ path: p, reason: e.message })
    }
  }

  step(onProgress, 'Création du classeur Excel', 0.88)
  const readableName = `lisible/${safeFileName(event.nom)}.xlsx`
  try {
    await put(readableName, new Uint8Array(await buildReadableWorkbook(event, raw)))
  } catch (e) { console.warn('classeur lisible', e) }

  const manifest = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    createdAt: new Date().toISOString(),
    appVersion: APP_VERSION_LABEL,
    event: { id: eventId, nom: event.nom || '', date: event.date || '', dateFin: event.dateFin || '', lieu: event.lieu || '' },
    counts,
    totalDocuments: Object.values(counts).reduce((a, b) => a + b, 0),
    files: fileList,
    missingFiles,
    secretsRemoved: true,
    parts,
  }
  zipFiles['manifest.json'] = strToU8(JSON.stringify(manifest, null, 1))
  zipFiles['LISEZMOI.txt'] = strToU8(
    `Archive YllaCash de l'édition « ${manifest.event.nom} », créée le ${new Date().toLocaleString('fr-FR')}.\r\n\r\n`
    + `- lisible/ : un classeur Excel à ouvrir directement.\r\n`
    + `- data/ et files/ : la copie complète, pour réafficher l'édition dans YllaCash\r\n`
    + `  (page Événements → « Consulter une archive »).\r\n\r\n`
    + `Les mots de passe du personnel et des bénévoles ne sont pas conservés.\r\n`
    + `Ne modifiez pas les fichiers de data/ : l'appli refuserait l'archive.\r\n`)

  step(onProgress, 'Compression', 0.95)
  const zipped = zipSync(zipFiles, { level: 6 })
  step(onProgress, 'Terminé', 1)
  const fileName = `Archive YllaCash - ${safeFileName(event.nom)} - ${new Date().toISOString().slice(0, 10)}.zip`
  return { blob: new Blob([zipped], { type: 'application/zip' }), fileName, manifest }
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = fileName
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// ── 2. Lecture et contrôle d'un fichier ZIP choisi par l'utilisateur ─────────
export async function readArchiveFile(file) {
  let files
  try { files = unzipSync(new Uint8Array(await file.arrayBuffer())) } catch { throw new Error('Ce fichier n\'est pas un ZIP lisible.') }
  const { manifest, problems } = await checkArchive(files)
  return { files, manifest, problems }
}

/**
 * Avant une suppression définitive : l'archive est-elle complète pour cet événement ?
 * Compare le nombre d'éléments de chaque collection avec ce qui est en base maintenant.
 */
export async function verifyArchiveForPurge(file, eventId) {
  const { manifest, problems } = await readArchiveFile(file)
  if (!manifest) return { ok: false, problems }
  if (manifest.event?.id !== eventId) problems.push(`Cette archive concerne « ${manifest.event?.nom || 'un autre événement'} », pas l'événement à supprimer.`)
  for (const name of ARCHIVE_COLLECTIONS) {
    const snap = await getDocs(collection(db, 'events', eventId, name))
    const inZip = manifest.counts?.[name] || 0
    if (snap.size > inZip) problems.push(`${name} : ${snap.size - inZip} élément(s) ajouté(s) depuis l'archive. Refaites une archive.`)
  }
  if (manifest.missingFiles?.length) problems.push(`${manifest.missingFiles.length} fichier(s) n'ont pas pu être mis dans l'archive.`)
  return { ok: problems.length === 0, problems, manifest }
}

// ── 3. Suppression définitive ────────────────────────────────────────────────
async function deleteCollections(eventId, onProgress) {
  for (const [i, name] of ARCHIVE_COLLECTIONS.entries()) {
    step(onProgress, `Suppression des données (${name})`, 0.05 + 0.7 * (i / ARCHIVE_COLLECTIONS.length))
    const snap = await getDocs(collection(db, 'events', eventId, name))
    for (let j = 0; j < snap.docs.length; j += 400) {
      const batch = writeBatch(db)
      snap.docs.slice(j, j + 400).forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
  }
}

export async function purgeEvent(eventId, { onProgress } = {}) {
  await withArchiveWrites(async () => {
    await deleteCollections(eventId, onProgress)
    step(onProgress, 'Suppression des fichiers', 0.8)
    let paths = []
    try { paths = await listStorageRecursive(`events/${eventId}`) } catch (e) { console.warn('listAll', e) }
    for (const p of paths) { try { await deleteObject(sref(storage, p)) } catch (e) { console.warn('deleteObject', p, e) } }
    step(onProgress, 'Suppression de l\'événement', 0.95)
    await deleteDoc(doc(db, 'events', eventId))
  })
  step(onProgress, 'Terminé', 1)
}

// ── 4. Restauration en lecture seule ─────────────────────────────────────────
const MAKE = {
  timestamp: (s, n) => new Timestamp(s, n),
  geo: (lat, lng) => new GeoPoint(lat, lng),
  ref: (path) => doc(db, path),
  bytes: (b64) => Bytes.fromBase64String(b64),
}

export async function restoreArchive(file, { onProgress } = {}) {
  step(onProgress, 'Lecture de l\'archive', 0)
  const { files, manifest, problems } = await readArchiveFile(file)
  if (!manifest || problems.length) throw new Error(problems.join(' '))
  const eventId = manifest.event.id
  const existing = await getDoc(doc(db, 'events', eventId))
  if (existing.exists()) {
    throw new Error(existing.data()?.archive?.readOnly
      ? 'Cette archive est déjà ouverte : elle figure dans la liste des événements.'
      : 'Cet événement est encore dans la base : l\'archive ne peut pas le remplacer.')
  }

  try {
    await withArchiveWrites(async () => {
      // Fichiers d'abord : leurs nouvelles adresses remplacent les anciennes dans les données
      const urlMap = new Map()
      const list = manifest.files || []
      for (const [i, f] of list.entries()) {
        step(onProgress, `Remise en place des fichiers (${i + 1}/${list.length})`, 0.05 + 0.3 * (i / Math.max(list.length, 1)))
        const r = sref(storage, f.path)
        await uploadBytes(r, files[`files/${f.path}`], { contentType: f.contentType })
        urlMap.set(f.path, await getDownloadURL(r))
      }
      const load = (name) => JSON.parse(strFromU8(files[name]))
      const ev = load('data/event.json')
      const names = Object.keys(manifest.counts || {})
      for (const [i, name] of names.entries()) {
        step(onProgress, `Remise en place des données (${name})`, 0.35 + 0.6 * (i / names.length))
        const docs = load(`data/${name}.json`)
        for (let j = 0; j < docs.length; j += 400) {
          const batch = writeBatch(db)
          for (const d of docs.slice(j, j + 400)) {
            batch.set(doc(db, 'events', eventId, name, d.id), decodeValue(replaceUrls(d.data, urlMap), MAKE))
          }
          await batch.commit()
        }
      }
      // L'événement en dernier : il n'apparaît dans la liste qu'une fois complet
      const evData = decodeValue(replaceUrls(ev.data, urlMap), MAKE)
      await setDoc(doc(db, 'events', eventId), {
        ...evData,
        actif: false,
        deleted: false,
        archive: { readOnly: true, archivedAt: manifest.createdAt, restoredAt: serverTimestamp() },
      })
    })
  } catch (e) {
    // Restauration interrompue : on retire ce qui a été écrit
    try { await purgeEvent(eventId) } catch {}
    throw e
  }
  step(onProgress, 'Terminé', 1)
  return manifest
}
