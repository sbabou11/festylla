/**
 * utils/shiftTime.js — créneaux bénévoles dans le temps
 * Un créneau : { date: 'YYYY-MM-DD', debut: 'HH:MM', fin: 'HH:MM', postes, libres, presences }
 * Une fin plus tôt que le début veut dire que le créneau passe minuit.
 */

const MIN = 60000

const at = (date, hhmm) => {
  if (!date || !hhmm) return null
  const d = new Date(`${date}T${hhmm}:00`)
  return isNaN(d) ? null : d
}

// { start, end } en Date, ou null si le créneau n'a pas d'horaires
export function shiftRange(shift) {
  const start = at(shift?.date, shift?.debut)
  let end = at(shift?.date, shift?.fin)
  if (!start) return null
  if (!end) end = new Date(start.getTime() + 2 * 60 * MIN)
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * MIN)
  return { start, end }
}

// Où est le bénévole sur ce créneau : id du poste, '__free__' (polyvalent) ou null
export function positionOn(shift, benevId) {
  if (!shift || !benevId) return null
  const found = Object.entries(shift.postes || {}).find(([, p]) => (p.assignments || []).includes(benevId))
  if (found) return found[0]
  if ((shift.libres || []).includes(benevId)) return '__free__'
  return null
}

// Créneaux du bénévole, triés, avec leurs horaires
export function myShifts(shifts, benevId) {
  return (shifts || [])
    .map(s => ({ shift: s, postId: positionOn(s, benevId), range: shiftRange(s) }))
    .filter(x => x.postId && x.range)
    .sort((a, b) => a.range.start - b.range.start)
}

// Créneau en cours, sinon le prochain, sinon null
export function currentOrNext(shifts, benevId, now = Date.now()) {
  const mine = myShifts(shifts, benevId)
  return mine.find(x => x.range.end.getTime() > now) || null
}

const hm = (d) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')
export const fmtHour = hm

const fmtDuration = (ms) => {
  const m = Math.max(1, Math.round(ms / MIN))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`
}

// Libellé relatif : « Dans 20 min », « En cours · fin dans 1h10 », « Demain 18h », « Terminé »
export function relativeLabel(range, now = Date.now()) {
  if (!range) return { text: '', tone: 'neutral' }
  const s = range.start.getTime()
  const e = range.end.getTime()
  if (now >= e) return { text: 'Terminé', tone: 'neutral' }
  if (now >= s) return { text: `En cours · fin dans ${fmtDuration(e - now)}`, tone: 'success' }
  const diff = s - now
  if (diff < 12 * 60 * MIN) return { text: `Dans ${fmtDuration(diff)}`, tone: diff < 60 * MIN ? 'warning' : 'brand' }
  const day = range.start.toLocaleDateString('fr-FR', { weekday: 'long' })
  return { text: `${day.charAt(0).toUpperCase() + day.slice(1)} ${hm(range.start)}`, tone: 'brand' }
}

// Fenêtre de pointage : d'une heure avant le début jusqu'à la fin
export const CHECKIN_EARLY_MIN = 60
export function canCheckIn(range, now = Date.now()) {
  if (!range) return false
  return now >= range.start.getTime() - CHECKIN_EARLY_MIN * MIN && now < range.end.getTime()
}

// Contenu du QR d'un poste, et lecture d'un QR ou d'un code saisi
export const postQrText = (eventId, postId) => `YLLACASH-POSTE:${eventId}:${postId}`
export const postShortCode = (postId) => String(postId || '').slice(-4).toUpperCase()

export function parsePostScan(text, posts, eventId) {
  const raw = String(text || '').trim()
  const m = raw.match(/^YLLACASH-POSTE:([^:]+):(.+)$/i)
  if (m) {
    if (eventId && m[1].toLowerCase() !== String(eventId).toLowerCase()) return { error: 'Ce QR appartient à un autre événement.' }
    const post = posts.find(p => p.id.toLowerCase() === m[2].toLowerCase())
    return post ? { post } : { error: 'Poste inconnu. Demandez un nouveau QR au responsable.' }
  }
  const code = raw.toUpperCase()
  const post = code.length >= 4 && posts.find(p => postShortCode(p.id) === code)
  return post ? { post } : { error: 'Code de poste introuvable.' }
}
