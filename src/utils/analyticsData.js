/**
 * utils/analyticsData.js — prévision de stock, carte de chaleur des ventes, attendu de caisse
 * Montants en centimes. Une journée festival va de 6h à 6h (voir dashboardData).
 */
import { txTime, dayStart, DAY_START_HOUR, CLOSING_HOUR } from './dashboardData'

const MIN  = 60 * 1000
const HOUR = 60 * MIN
const DAY  = 24 * HOUR

// Transactions qui sortent des articles du stock
const STOCK_TYPES = ['debit', 'reservation', 'benev-reservation']

/** Prochaine heure de fermeture (CLOSING_HOUR) après `now` */
export function nextClosing(now = Date.now()) {
  const d = new Date(now)
  d.setHours(CLOSING_HOUR, 0, 0, 0)
  if (d.getTime() <= now) d.setDate(d.getDate() + 1)
  return d.getTime()
}

/**
 * Prévision de rupture pour chaque article du menu, d'après le rythme de vente récent.
 * windowMin : fenêtre d'observation (90 min par défaut)
 * status : rupture | avant-fermeture | ok | calme (pas de vente récente) | sans-stock (stock non suivi)
 * Trié du plus urgent au moins urgent.
 */
export function stockForecast(logs = [], menu = [], now = Date.now(), windowMin = 90) {
  const from = now - windowMin * MIN
  const sold = {}
  logs.forEach(t => {
    if (!STOCK_TYPES.includes(t.type) || !Array.isArray(t.items)) return
    const ms = txTime(t)
    if (ms == null || ms < from || ms > now) return
    t.items.forEach(i => {
      const k = (i.nom || '').trim().toLowerCase()
      if (k) sold[k] = (sold[k] || 0) + (i.qty || 1)
    })
  })

  const closing = nextClosing(now)
  const RANK = { rupture: 0, 'avant-fermeture': 1, ok: 2, calme: 3, 'sans-stock': 4 }

  return menu.map(m => {
    const stock = typeof m.stock === 'number' ? m.stock : null
    const qty = sold[(m.nom || '').trim().toLowerCase()] || 0
    const perHour = qty / (windowMin / 60)
    let status, ruptureAt = null
    if (stock == null) status = 'sans-stock'
    else if (stock <= 0) status = 'rupture'
    else if (perHour <= 0) status = 'calme'
    else {
      ruptureAt = now + (stock / perHour) * HOUR
      status = ruptureAt < closing ? 'avant-fermeture' : 'ok'
    }
    // Quantité qui manquera à la fermeture au rythme actuel
    const besoin = perHour > 0 && stock != null ? Math.max(0, Math.ceil(perHour * (closing - now) / HOUR) - Math.max(0, stock)) : 0
    return { id: m.id, nom: m.nom, cat: m.cat, stock, perHour, ruptureAt, status, besoin }
  }).sort((a, b) => RANK[a.status] - RANK[b.status] || (a.ruptureAt ?? Infinity) - (b.ruptureAt ?? Infinity))
}

/** Journées festival présentes dans les transactions (début de journée en ms), la plus récente d'abord */
export function festivalDays(logs = []) {
  const set = new Set()
  logs.forEach(t => { const ms = txTime(t); if (ms != null) set.add(dayStart(ms)) })
  return [...set].sort((a, b) => b - a)
}

/**
 * Carte de chaleur des ventes d'une journée : une ligne par stand ou caissier, une colonne par heure.
 * Seules les heures où il s'est passé quelque chose (plus une marge) sont gardées.
 * mode : 'montant' (centimes) ou 'nombre' (transactions)
 */
export function salesHeatmap(logs = [], start, mode = 'montant') {
  const end = start + DAY
  const rows = {}
  const cols = new Array(24).fill(0)
  logs.forEach(t => {
    if (!['debit', 'retrait', 'benev-retrait'].includes(t.type)) return
    const ms = txTime(t)
    if (ms == null || ms < start || ms >= end) return
    const h = Math.floor((ms - start) / HOUR)
    const k = t.staff || '—'
    if (!rows[k]) rows[k] = new Array(24).fill(0)
    const v = mode === 'nombre' ? 1 : (t.montant || 0)
    rows[k][h] += v
    cols[h] += v
  })

  const used = cols.map((v, i) => (v ? i : -1)).filter(i => i >= 0)
  if (!used.length) return { hours: [], rows: [], max: 0, total: 0, peak: null }
  const first = Math.max(0, used[0] - 1)
  const last  = Math.min(23, used[used.length - 1] + 1)
  const hours = []
  for (let i = first; i <= last; i++) hours.push({ index: i, label: `${(DAY_START_HOUR + i) % 24}h`, total: cols[i] })

  const list = Object.entries(rows)
    .map(([staff, values]) => ({ staff, values: values.slice(first, last + 1), total: values.reduce((a, v) => a + v, 0) }))
    .sort((a, b) => b.total - a.total)
  const max = Math.max(...list.flatMap(r => r.values))
  const peakIdx = cols.indexOf(Math.max(...cols))
  return {
    hours,
    rows: list,
    max,
    total: cols.reduce((a, v) => a + v, 0),
    peak: { label: `${(DAY_START_HOUR + peakIdx) % 24}h–${(DAY_START_HOUR + peakIdx + 1) % 24}h`, value: cols[peakIdx] },
  }
}

// ── Clôture de caisse ─────────────────────────────────────────────

export const MOYENS = {
  especes: { label: 'Espèces' },
  cb:      { label: 'Carte bancaire' },
  inconnu: { label: 'Non renseigné' },
}

/** Mode de paiement normalisé d'une recharge (les anciennes recharges n'en ont pas) */
export const moyenOf = (t) => {
  const m = (t.moyen || '').toLowerCase()
  if (m.startsWith('esp')) return 'especes'
  if (m === 'cb' || m.startsWith('carte')) return 'cb'
  return 'inconnu'
}

/** Caissiers ayant encaissé des recharges sur la période, le plus actif d'abord */
export function cashiers(logs = [], from, to) {
  const by = {}
  logs.forEach(t => {
    if (t.type !== 'credit') return
    const ms = txTime(t)
    if (ms == null || ms < from || ms >= to) return
    const k = t.staff || '—'
    by[k] = (by[k] || 0) + (t.montant || 0)
  })
  return Object.entries(by).sort((a, b) => b[1] - a[1]).map(([nom, total]) => ({ nom, total }))
}

/**
 * Ce que la caisse doit contenir : recharges de la période, par mode de paiement.
 * staff : nom du caissier, ou null pour toutes les caisses
 */
export function expectedTill(logs = [], { from, to, staff = null }) {
  const out = { especes: { n: 0, total: 0 }, cb: { n: 0, total: 0 }, inconnu: { n: 0, total: 0 } }
  logs.forEach(t => {
    if (t.type !== 'credit') return
    if (staff && (t.staff || '—') !== staff) return
    const ms = txTime(t)
    if (ms == null || ms < from || ms >= to) return
    const k = moyenOf(t)
    out[k].n++
    out[k].total += t.montant || 0
  })
  return out
}

// Coupures en centimes, pour le comptage des espèces
export const DENOMINATIONS = [
  { v: 5000, label: '50 €', kind: 'billet' },
  { v: 2000, label: '20 €', kind: 'billet' },
  { v: 1000, label: '10 €', kind: 'billet' },
  { v: 500,  label: '5 €',  kind: 'billet' },
  { v: 200,  label: '2 €',  kind: 'piece' },
  { v: 100,  label: '1 €',  kind: 'piece' },
  { v: 50,   label: '50 c', kind: 'piece' },
  { v: 20,   label: '20 c', kind: 'piece' },
  { v: 10,   label: '10 c', kind: 'piece' },
]
export const countTotal = (counts = {}) => DENOMINATIONS.reduce((a, d) => a + d.v * (Number(counts[d.v]) || 0), 0)
