/**
 * utils/dashboardData.js — calculs du tableau de bord en direct
 * Une "journée festival" va de 6h à 6h le lendemain (les soirées passent minuit).
 * Tous les montants sont en centimes, comme dans Firestore.
 */

export const DAY_START_HOUR = 6   // début de la journée festival
export const CLOSING_HOUR   = 4   // heure de fermeture utilisée pour la projection

const HOUR = 3600 * 1000
const DAY  = 24 * HOUR

// Types qui comptent comme recette (même règle que computeKPIs)
const SALE_TYPES = ['debit', 'retrait', 'benev-retrait']

/** Horodatage d'une transaction en ms (Firestore createdAt, sinon timestamp ISO) */
export function txTime(t) {
  if (t.createdAt?.seconds) return t.createdAt.seconds * 1000
  if (t.timestamp) {
    const ms = Date.parse(t.timestamp)
    if (!Number.isNaN(ms)) return ms
  }
  return null
}

/** Début de la journée festival contenant `now` */
export function dayStart(now = Date.now()) {
  const d = new Date(now)
  d.setHours(DAY_START_HOUR, 0, 0, 0)
  if (d.getTime() > now) d.setDate(d.getDate() - 1)
  return d.getTime()
}

const isSale   = (t) => SALE_TYPES.includes(t.type)
const isCredit = (t) => t.type === 'credit'
const sum      = (arr) => arr.reduce((a, t) => a + (t.montant || 0), 0)

/** Transactions horodatées entre from (inclus) et to (exclu) */
function between(logs, from, to) {
  return logs.filter(t => {
    const ms = txTime(t)
    return ms != null && ms >= from && ms < to
  })
}

/** Variation en % arrondie, ou null si pas de base de comparaison */
function pct(now, before) {
  if (!before) return null
  return Math.round(((now - before) / before) * 100)
}

/**
 * Indicateurs du jour comparés à la veille à la même heure
 */
export function dayStats(logs = [], now = Date.now()) {
  const start     = dayStart(now)
  const elapsed   = now - start
  const today     = between(logs, start, now)
  const yesterday = between(logs, start - DAY, start - DAY + elapsed)

  const salesToday = today.filter(isSale)
  const salesYest  = yesterday.filter(isSale)
  const debitsToday = today.filter(t => t.type === 'debit')
  const debitsYest  = yesterday.filter(t => t.type === 'debit')

  const revenue     = sum(salesToday)
  const revenueYest = sum(salesYest)
  const basket      = debitsToday.length ? sum(debitsToday) / debitsToday.length : 0
  const basketYest  = debitsYest.length ? sum(debitsYest) / debitsYest.length : 0

  // Courbe des recettes des 8 dernières heures (une valeur par heure)
  const trend = Array.from({ length: 8 }, (_, i) => {
    const to = now - (7 - i) * HOUR
    return sum(between(logs, to - HOUR, to).filter(isSale))
  })

  // Projection jusqu'à la fermeture : rythme moyen des 3 dernières heures
  const closing = start + ((24 - DAY_START_HOUR + CLOSING_HOUR) % 24) * HOUR
  const window  = Math.min(3 * HOUR, elapsed)
  const rate    = window > 0 ? sum(between(logs, now - window, now).filter(isSale)) / window : 0
  const projected = now < closing ? Math.round(revenue + rate * (closing - now)) : revenue

  return {
    revenue,
    revenueDelta: pct(revenue, revenueYest),
    hasYesterday: yesterday.length > 0,
    credits: sum(today.filter(isCredit)),
    basket,
    basketDiff: debitsYest.length ? basket - basketYest : null,
    salesCount: debitsToday.length,
    trend,
    projected,
    closingLabel: `${CLOSING_HOUR}h`,
  }
}

/**
 * Flux de caisse heure par heure pour une journée festival
 * offsetDays : 0 = aujourd'hui, 1 = hier
 * Renvoie les heures entre la première activité (8h de recul minimum) et maintenant + 2h.
 */
export function hourlyFlow(logs = [], now = Date.now(), offsetDays = 0) {
  const start = dayStart(now) - offsetDays * DAY
  const end   = start + DAY
  const day   = between(logs, start, end)

  const buckets = Array.from({ length: 24 }, (_, i) => ({
    hour: (DAY_START_HOUR + i) % 24,
    from: start + i * HOUR,
    credits: 0,
    sales: 0,
  }))
  day.forEach(t => {
    const b = buckets[Math.floor((txTime(t) - start) / HOUR)]
    if (!b) return
    if (isCredit(t)) b.credits += t.montant || 0
    else if (isSale(t)) b.sales += t.montant || 0
  })

  // Solde net cumulé (recharges − dépenses) depuis le début de la journée
  let net = 0
  buckets.forEach(b => { net += b.credits - b.sales; b.net = net })

  const nowIndex = offsetDays === 0 ? Math.floor((now - start) / HOUR) : 23
  const active   = buckets.map((b, i) => (b.credits || b.sales) ? i : -1).filter(i => i >= 0)
  const first    = Math.max(0, Math.min(active[0] ?? nowIndex, nowIndex - 7))
  const last     = offsetDays === 0 ? Math.min(23, nowIndex + 2) : Math.max(nowIndex, ...active)

  return {
    buckets: buckets.slice(first, last + 1).map((b, i) => ({ ...b, future: first + i > nowIndex })),
    nowIndex: nowIndex - first,
    nowTime: offsetDays === 0 ? now : null,
    total: { credits: sum(day.filter(isCredit)), sales: sum(day.filter(isSale)) },
  }
}

/** Ventes par membre du staff aujourd'hui, la plus forte en premier */
export function topSellers(logs = [], now = Date.now()) {
  const by = {}
  between(logs, dayStart(now), now).filter(isSale).forEach(t => {
    const k = t.staff || '—'
    by[k] = (by[k] || 0) + (t.montant || 0)
  })
  return Object.entries(by).map(([staff, total]) => ({ staff, total })).sort((a, b) => b.total - a.total)
}

const ACK_KEY = 'yllacash-alertes-acquittees'

function readAcknowledged() {
  try { return new Set(JSON.parse(localStorage.getItem(ACK_KEY) || '[]')) } catch { return new Set() }
}

/**
 * Alertes à afficher sur le tableau de bord (mêmes identifiants que la page Alertes,
 * pour respecter les alertes déjà acquittées)
 * tone : danger | warning | brand
 */
export function dashboardAlerts({ spectateurs = [], logs = [], menu = [] }) {
  const ack = readAcknowledged()
  const alerts = []

  const negatives = spectateurs.filter(s => (s.solde || 0) < 0 && !ack.has(`neg-${s.id}`))
  if (negatives.length) {
    alerts.push({
      id: 'neg', tone: 'danger', page: 'alertes',
      title: `${negatives.length} solde${negatives.length > 1 ? 's' : ''} négatif${negatives.length > 1 ? 's' : ''}`,
      detail: negatives.reduce((a, s) => a + (s.solde || 0), 0),
    })
  }

  const credits = sum(logs.filter(isCredit))
  const debits  = sum(logs.filter(t => t.type === 'debit'))
  const soldes  = spectateurs.reduce((a, s) => a + (s.solde || 0), 0)
  const ecart   = Math.abs(credits - debits - soldes)
  if (ecart > 200 && credits > 0 && !ack.has('ecart-global')) {
    alerts.push({ id: 'ecart', tone: 'danger', page: 'alertes', title: 'Écart comptable', detail: ecart })
  }

  menu.forEach(m => {
    const stock = m.stock || 0
    if (stock === 0) {
      alerts.push({ id: `rupture-${m.id || m.nom}`, tone: 'danger', page: 'menu', title: `${m.nom} en rupture`, stock: 0 })
    } else if (stock <= (m.seuilAlerte || 10)) {
      alerts.push({ id: `stock-${m.id || m.nom}`, tone: 'warning', page: 'menu', title: `${m.nom} · stock bas`, stock })
    }
  })

  return alerts
}
