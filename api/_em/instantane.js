/**
 * api/_em/instantane.js — lecture de l'instantané d'Ylla Event Manager (fonctions pures)
 *
 * Règle d'échange Event Manager ↔ YllaCash v1.0 (docs/echanges-event-manager.md), §2 et §3.
 * Event Manager est la référence ; YllaCash n'en garde qu'une copie de lecture, remplacée en entier
 * à chaque instantané reçu. Ce module :
 *  - vérifie et nettoie l'instantané reçu (seuls les champs prévus sont gardés) ;
 *  - décide quand relire (toutes les 5 minutes, ou tout de suite sur « Actualiser ») ;
 *  - tient l'état affiché dans la fenêtre « Liaisons » (à jour, injoignable, clé refusée).
 */

const INTERVAL_MS = 5 * 60_000
const LIMITS = { programme: 3000, artistes: 1000, benevoles: 3000, jours: 31 }

const DAY = /^\d{4}-\d{2}-\d{2}$/
const HOUR = /^([01]\d|2[0-3]):[0-5]\d$/
const VERSION = /^[0-9a-f]{8,64}$/i

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const id = (v) => {
  const s = typeof v === 'number' && Number.isFinite(v) ? String(v) : text(v, 100)
  return s && !/[/]/.test(s) ? s : null
}
const count = (v) => (Number.isInteger(v) && v >= 0 ? Math.min(v, 99) : 0)
const days = (v) => (Array.isArray(v) ? [...new Set(v.filter(d => typeof d === 'string' && DAY.test(d)))].sort().slice(0, LIMITS.jours) : [])
const perDay = (v) => {
  if (!Array.isArray(v)) return []
  const out = new Map()
  for (const x of v) {
    if (!isObj(x) || typeof x.jour !== 'string' || !DAY.test(x.jour)) continue
    const r = { jour: x.jour, repas: count(x.repas), boissons: count(x.boissons), eau: count(x.eau) }
    if (r.repas || r.boissons || r.eau) out.set(x.jour, r)
  }
  return [...out.values()].sort((a, b) => a.jour.localeCompare(b.jour)).slice(0, LIMITS.jours)
}
const uniqueById = (list) => {
  const seen = new Set()
  return list.filter(x => x && !seen.has(x.id) && seen.add(x.id))
}

/**
 * Vérifie l'instantané reçu et ne garde que les champs prévus par la règle (§3).
 * Renvoie { ok: true, data } ou { ok: false, error }.
 */
function normalizeSnapshot(json) {
  if (!isObj(json)) return { ok: false, error: "Réponse d'Event Manager illisible." }
  if (typeof json.version !== 'string' || !VERSION.test(json.version)) return { ok: false, error: 'Version absente de la réponse.' }
  if (!isObj(json.evenement)) return { ok: false, error: 'Événement absent de la réponse.' }
  for (const k of ['programme', 'artistes', 'benevoles']) {
    if (!Array.isArray(json[k])) return { ok: false, error: `Liste « ${k} » absente de la réponse.` }
    if (json[k].length > LIMITS[k]) return { ok: false, error: `Liste « ${k} » trop longue (${json[k].length}).` }
  }

  const programme = uniqueById(json.programme.map(p => {
    if (!isObj(p) || !id(p.id) || !DAY.test(p.jour || '')) return null
    return {
      id: id(p.id), jour: p.jour,
      debut: HOUR.test(p.debut || '') ? p.debut : '', fin: HOUR.test(p.fin || '') ? p.fin : '',
      scene: text(p.scene, 80), titre: text(p.titre, 120), artiste: text(p.artiste, 120),
    }
  })).sort((a, b) => (a.jour + a.debut).localeCompare(b.jour + b.debut))

  const artistes = uniqueById(json.artistes.map(a => {
    if (!isObj(a) || !id(a.id)) return null
    return { id: id(a.id), nom: text(a.nom, 120), statut: text(a.statut, 20), jours: days(a.jours), avantages: perDay(a.avantages) }
  }))

  const benevoles = uniqueById(json.benevoles.map(b => {
    if (!isObj(b) || !id(b.id)) return null
    return { id: id(b.id), prenom: text(b.prenom, 60), nom: text(b.nom, 80), droits: perDay(b.droits), controleBillets: days(b.controleBillets) }
  }))

  return {
    ok: true,
    data: {
      version: json.version.toLowerCase(),
      genere: text(json.genere, 40),
      evenement: { nom: text(json.evenement.nom, 120), jours: days(json.evenement.jours) },
      programme, artistes, benevoles,
    },
  }
}

const comptes = (data) => ({ programme: data.programme.length, artistes: data.artistes.length, benevoles: data.benevoles.length })

/** Faut-il relire maintenant ? (toutes les 5 minutes, ou tout de suite si demandé) */
function lectureDue(lecture, now, force = false) {
  if (force) return true
  const last = lecture && typeof lecture.essaiMs === 'number' ? lecture.essaiMs : null
  return last === null || now - last >= INTERVAL_MS
}

/** Classe la réponse : 'ok' (200), 'inchange' (304), 'refus' (clé à vérifier), 'panne' (le reste). */
function classify(status) {
  if (status === 200) return 'ok'
  if (status === 304) return 'inchange'
  if (status === 401 || status === 403) return 'refus'
  return 'panne'
}

/**
 * Nouvel état de lecture après une tentative.
 * prev : état précédent ; result : { kind: 'ok'|'inchange'|'refus'|'panne'|'format', detail?, comptes?, version? }
 * L'état garde la date de la dernière copie valable (okMs) et le début de la série d'échecs (echec.depuisMs).
 */
function nextLecture(prev, result, now) {
  const p = isObj(prev) ? prev : {}
  if (result.kind === 'ok' || result.kind === 'inchange') {
    return {
      essaiMs: now, okMs: now, echec: null,
      version: result.version || p.version || null,
      comptes: result.comptes || p.comptes || null,
    }
  }
  const type = result.kind === 'refus' ? 'refus' : 'panne'
  const sameStreak = isObj(p.echec) && p.echec.type === type
  return {
    essaiMs: now, okMs: p.okMs ?? null, version: p.version ?? null, comptes: p.comptes ?? null,
    echec: {
      type,
      format: result.kind === 'format',
      depuisMs: sameStreak ? p.echec.depuisMs : now,
      detail: String(result.detail || '').slice(0, 200),
    },
  }
}

module.exports = { normalizeSnapshot, comptes, lectureDue, classify, nextLecture, INTERVAL_MS, LIMITS }
