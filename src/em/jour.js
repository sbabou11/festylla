/**
 * em/jour.js — journée de festival et droits par jour (règle d'échange Event Manager ↔ YllaCash, lot C)
 *
 * Choix de l'organisateur (18/11/2026) :
 *  - une journée de festival finit à 6 h du matin (une boisson prise à 1 h compte pour la veille) ;
 *  - les droits valent pour le jour seulement : ce qui n'est pas utilisé ne passe pas au lendemain.
 */
export const DAY_CUT_H = 6

const toMs = (ts) => {
  if (ts == null) return Date.now()                       // date du serveur pas encore reçue : maintenant
  if (typeof ts === 'number') return ts
  if (ts.toMillis) return ts.toMillis()
  if (ts.toDate) return ts.toDate().getTime()
  const ms = new Date(ts).getTime()
  return Number.isNaN(ms) ? Date.now() : ms
}

const parisDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })

/** Journée de festival (AAAA-MM-JJ, heure de Paris, coupure à 6 h) d'un instant */
export function festDay(ts) {
  return parisDate.format(new Date(toMs(ts) - DAY_CUT_H * 3600_000))
}

/** « samedi 15 mai » pour une journée AAAA-MM-JJ */
export function dayLabel(jour) {
  const [y, m, d] = String(jour).split('-').map(Number)
  if (!y) return ''
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

/** Le lendemain d'une journée AAAA-MM-JJ */
export function nextDay(jour) {
  const [y, m, d] = String(jour).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

/** Fiche venue d'Event Manager (droits par jour) ? */
export const isEmFiche = (f) => f?.source === 'event-manager'

/**
 * Quotas d'un bénévole pour une journée : { droits, conso } avec les clés repas, boisson, eau.
 * Fiche d'Event Manager : droits et consommations du jour. Fiche saisie dans YllaCash : totaux de l'événement.
 */
export function quotasDuJour(benev, jour = festDay()) {
  if (!benev) return { droits: {}, conso: {} }
  if (!isEmFiche(benev)) return { droits: benev.droits || {}, conso: benev.consommation || {} }
  return { droits: benev.droitsJours?.[jour] || {}, conso: benev.consoJours?.[jour] || {} }
}
