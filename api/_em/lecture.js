/**
 * api/_em/lecture.js — lit l'instantané d'Event Manager pour un événement et range la copie
 *
 * Règle d'échange Event Manager ↔ YllaCash v1.0, §2 :
 *   GET https://gestion.maisonylla.com/api/public/yllacash
 *   Authorization: Bearer <clé YllaCash de l'événement>, x-ylla: 1, If-None-Match: <version>
 * La clé est celle de la fenêtre « Liaisons » (liaisons-em/{événement}), la même que pour l'envoi des entrées.
 *
 * Rangement (collections racine réservées au serveur par les règles) :
 *   em-instantanes/{événement}   la dernière copie valable, remplacée en entier
 *   liaisons-em/{événement}.lecture   l'état affiché dans « Liaisons »
 * Et, lisibles par tous (pages publiques) :
 *   events/{événement}/programme-em/{passage}   le programme, au format des créneaux du planning
 *   events/{événement}.emProgramme             { majMs, nb } : l'espace spectateur et /live lisent alors ce programme
 * Si Event Manager ne répond pas, la copie précédente reste : le festival continue.
 * YLLA_EM_LECTURE_URL (facultatif) remplace l'adresse, pour un essai.
 */
const { normalizeSnapshot, comptes, lectureDue, classify, nextLecture, programmeDocs } = require('./instantane')

// Comparaison indépendante de l'ordre des champs (Firestore ne le garde pas)
const stable = (v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'
  : Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : JSON.stringify(v))

/**
 * Remplace le programme public par celui de l'instantané : écrit ce qui a changé, retire ce qui manque.
 * toDate : ms → date Firestore (remplaçable pour les tests).
 */
async function syncProgramme(db, ev, programme, { now, toDate }) {
  const evRef = db.collection('events').doc(ev)
  const col = evRef.collection('programme-em')
  const wanted = new Map(programmeDocs(programme).map(x => [x.docId, x.data]))
  const existing = await col.get()
  const ops = []
  for (const d of existing.docs) {
    const w = wanted.get(d.id)
    if (!w) { ops.push(() => d.ref.delete()); continue }
    const { debut, fin, ...rest } = d.data()
    if (stable(rest) === stable(w)) wanted.delete(d.id)
  }
  for (const [id, data] of wanted) {
    ops.push(() => col.doc(id).set({ ...data, debut: toDate(data.debutMs), fin: toDate(data.finMs) }))
  }
  for (const op of ops) await op()
  await evRef.update({ emProgramme: { majMs: now, nb: programme.length } })
  return ops.length
}

const defaultToDate = (ms) => require('firebase-admin').firestore.Timestamp.fromMillis(ms)

const EM_LECTURE_URL = 'https://gestion.maisonylla.com/api/public/yllacash'
const TIMEOUT_MS = 10_000
const MAX_BYTES = 3_000_000

async function fetchSnapshot(url, key, version, fetchImpl = fetch) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const headers = { 'x-ylla': '1', Authorization: `Bearer ${key}`, Accept: 'application/json' }
    if (version) headers['If-None-Match'] = `"${version}"`
    const r = await fetchImpl(url, { method: 'GET', headers, signal: ctrl.signal })
    const body = r.status === 304 ? '' : await r.text().catch(() => '')
    return { status: r.status, body }
  } catch (e) {
    return { status: 0, body: e.name === 'AbortError' ? 'Délai dépassé (10 s)' : (e.message || 'Réseau indisponible') }
  } finally { clearTimeout(t) }
}

const shortError = (body) => {
  try { const j = JSON.parse(body); if (j && typeof j.error === 'string') return j.error } catch { /* texte brut */ }
  return String(body || '').slice(0, 200)
}

/**
 * Lit l'instantané d'un événement si c'est le moment (ou tout de suite avec force).
 * Renvoie { lu: false } si rien n'a été tenté, sinon { lu: true, lecture }.
 */
async function refreshEvent(db, ev, { force = false, now = Date.now(), fetchImpl, toDate = defaultToDate } = {}) {
  const emRef = db.collection('liaisons-em').doc(ev)
  const emSnap = await emRef.get()
  const em = emSnap.exists ? emSnap.data() : null
  if (!em || !em.cle) return { lu: false }
  if (!lectureDue(em.lecture, now, force)) return { lu: false }

  const url = process.env.YLLA_EM_LECTURE_URL || EM_LECTURE_URL
  const prev = em.lecture || {}
  const r = await fetchSnapshot(url, em.cle, prev.version, fetchImpl)
  let kind = classify(r.status)
  let result = { kind }

  if (kind === 'ok') {
    let json = null
    if (r.body.length <= MAX_BYTES) { try { json = JSON.parse(r.body) } catch { json = null } }
    const n = r.body.length > MAX_BYTES ? { ok: false, error: 'Réponse trop volumineuse.' } : normalizeSnapshot(json)
    if (n.ok) {
      await db.collection('em-instantanes').doc(ev).set({ ...n.data, lueMs: now })
      await syncProgramme(db, ev, n.data.programme, { now, toDate })
      result = { kind: 'ok', version: n.data.version, comptes: comptes(n.data) }
    } else {
      result = { kind: 'format', detail: n.error }
    }
  } else if (kind === 'inchange') {
    // Rien n'a changé, à condition d'avoir bien la copie correspondante
    const copy = await db.collection('em-instantanes').doc(ev).get()
    if (!copy.exists) {
      // Copie perdue : on relira sans version au prochain tour
      result = { kind: 'panne', detail: 'Copie locale absente, relecture complète au prochain tour.' }
      prev.version = null
    }
  } else {
    result = { kind, detail: r.status ? `${r.status} : ${shortError(r.body)}` : r.body }
  }

  const lecture = nextLecture(prev, result, now)
  await emRef.update({ lecture })
  return { lu: true, lecture }
}

module.exports = { refreshEvent, fetchSnapshot, syncProgramme, EM_LECTURE_URL }
