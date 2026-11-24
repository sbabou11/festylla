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
// La copie tient dans un seul document Firestore (1 Mo) : le programme, plus lourd, est borné plus bas
const LIMITS = { programme: 500, artistes: 1000, benevoles: 3000, jours: 31 }
const TYPES = ['musical', 'litteraire', 'cinematographique', 'autre']
const LINKS = ['spotify', 'instagram', 'facebook', 'tiktok', 'youtube', 'site']

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
const httpsUrl = (v) => {
  const t = text(v, 500)
  if (!t) return ''
  try { const u = new URL(t); return u.protocol === 'https:' ? u.href : '' } catch { return '' }
}
const links = (v) => {
  const out = {}
  if (isObj(v)) for (const k of LINKS) { const u = httpsUrl(v[k]); if (u) out[k] = u }
  return out
}
// Version 1.2 (§3.2, 24/11/2026) : créneaux des postes qui ouvrent un rôle de YllaCash.
// Créneau incomplet : jour, debut ou fin à null (horaire manquant). Seul `role` fait foi.
const ROLES_CRENEAU = ['billetterie', 'controle_entree', 'consultation']
const creneaux = (v) => (Array.isArray(v) ? v : [])
  .filter(c => isObj(c) && ROLES_CRENEAU.includes(c.role))
  .slice(0, 200)
  .map(c => ({
    jour: typeof c.jour === 'string' && DAY.test(c.jour) ? c.jour : null,
    debut: typeof c.debut === 'string' && HOUR.test(c.debut) ? c.debut : null,
    fin: typeof c.fin === 'string' && HOUR.test(c.fin) ? c.fin : null,
    poste: text(c.poste, 80), role: c.role,
  }))
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
      // Version 1.1 (§3.1) : facultatifs
      type: TYPES.includes(p.type) ? p.type : 'autre',
      photo: httpsUrl(p.photo), presentation: text(p.presentation, 600), liens: links(p.liens),
    }
  })).sort((a, b) => (a.jour + a.debut).localeCompare(b.jour + b.debut))

  const artistes = uniqueById(json.artistes.map(a => {
    if (!isObj(a) || !id(a.id)) return null
    return { id: id(a.id), nom: text(a.nom, 120), statut: text(a.statut, 20), jours: days(a.jours), avantages: perDay(a.avantages) }
  }))

  const benevoles = uniqueById(json.benevoles.map(b => {
    if (!isObj(b) || !id(b.id)) return null
    return {
      id: id(b.id), prenom: text(b.prenom, 60), nom: text(b.nom, 80), droits: perDay(b.droits), controleBillets: days(b.controleBillets),
      // Version 1.2 (§3.2) : présent seulement si Event Manager l'envoie (sinon YllaCash attend)
      ...(Array.isArray(b.creneaux) ? { creneaux: creneaux(b.creneaux) } : {}),
    }
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

/**
 * Date et heure de Paris → instant (ms). Gère l'heure d'été sans bibliothèque :
 * on lit le décalage de Paris à l'instant approché, puis on corrige.
 */
function parisToMs(jour, heure) {
  const [y, mo, d] = jour.split('-').map(Number)
  const [h, mi] = heure.split(':').map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const offset = (ms) => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms))
    const g = (t) => Number(parts.find(x => x.type === t).value)
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - ms
  }
  const first = guess - offset(guess)
  return guess - offset(first)
}

const docId = (id) => (/^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : 'h' + require('crypto').createHash('sha256').update(id).digest('hex').slice(0, 24))

/**
 * Passages du programme au format des créneaux affichés par l'espace spectateur et /live
 * (mêmes champs que la collection planning). Renvoie [{ docId, data }] avec debutMs et finMs ;
 * le serveur ajoute debut et fin en dates Firestore.
 */
function programmeDocs(programme) {
  return programme.filter(p => p.debut).map(p => {
    const debutMs = parisToMs(p.jour, p.debut)
    let finMs = p.fin ? parisToMs(p.jour, p.fin) : debutMs
    if (finMs < debutMs) finMs += 24 * 3600_000   // le passage finit après minuit
    return {
      docId: docId(p.id),
      data: {
        emId: p.id, jour: p.jour, debutMs, finMs,
        scene: p.scene, titre: p.titre, artiste: p.artiste,
        type: p.type || 'autre', photo: p.photo || '', bio: p.presentation || '', description: '',
        liens: p.liens || {}, statut: 'a-venir', source: 'event-manager',
      },
    }
  })
}

/** Droits par jour → { 'AAAA-MM-JJ': { repas, boisson, eau } } (les clés de YllaCash : « boisson » au singulier) */
const parJour = (list) => Object.fromEntries((list || []).map(d => [d.jour, { repas: d.repas, boisson: d.boissons, eau: d.eau }]))

/**
 * Bénévoles et artistes de l'instantané, au format des fiches de YllaCash (lot C).
 * Identifiants préfixés « em- » : jamais confondus avec les fiches saisies dans YllaCash.
 */
function equipeDocs(data) {
  return {
    benevoles: data.benevoles.map(b => ({
      docId: 'em-' + docId(b.id),
      data: { emId: b.id, prenom: b.prenom, nom: b.nom, droitsJours: parJour(b.droits), controleBillets: b.controleBillets,
        // Version 1.2 : créneaux des postes à rôle (onglet de rôle de l'espace bénévole, écran 11)
        ...(b.creneaux ? { creneauxEm: b.creneaux } : {}) },
    })),
    artistes: data.artistes.map(a => ({
      docId: 'em-' + docId(a.id),
      data: { emId: a.id, nom: a.nom, statut: a.statut, jours: a.jours, avantagesJours: parJour(a.avantages) },
    })),
  }
}

module.exports = { normalizeSnapshot, comptes, lectureDue, classify, nextLecture, parisToMs, programmeDocs, equipeDocs, INTERVAL_MS, LIMITS }
