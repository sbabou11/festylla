/**
 * api/_em/retour.js — retour de YllaCash vers Event Manager (fonctions pures)
 *
 * Règle d'échange Event Manager ↔ YllaCash v1.1, §7 (validé le 18/11/2026) :
 *  - consommations : quantités servies par personne (identifiant d'Event Manager) et par jour ;
 *  - bilan : totaux de l'événement en euros, calculés comme le « Rapport Excel » (api/rapport.js),
 *    les offerts (bénévoles, artistes) valorisés au prix de la carte et sortis des ventes.
 * Chaque message porte l'état complet : Event Manager remplace ce qu'il avait reçu.
 * Limites d'Event Manager (docs/api-billetterie.md, commit ae9e396) : 31 jours au plus, chaque ligne
 * dans un jour envoyé, quantités entières de 0 à 9 999, 5 000 lignes par liste, 200 catégories aux
 * noms distincts (majuscules ignorées), 31 jours dans parJour.
 */
const crypto = require('crypto')

const DAY_CUT_MS = 6 * 3600_000
const parisDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
const toMs = (ts) => {
  if (ts == null) return null
  if (typeof ts === 'number') return ts
  if (ts.toMillis) return ts.toMillis()
  if (ts.toDate) return ts.toDate().getTime()
  const ms = new Date(ts).getTime()
  return Number.isNaN(ms) ? null : ms
}
/** Journée de festival (coupure à 6 h, heure de Paris), comme côté appli (src/em/jour.js) */
const festDay = (ts) => { const ms = toMs(ts); return ms == null ? null : parisDate.format(new Date(ms - DAY_CUT_MS)) }

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const euros = (c) => Math.round(num(c)) / 100
const KEY = { repas: 'repas', boisson: 'boissons', eau: 'eau', meal: 'repas', drink: 'boissons' }

/** Date d'une transaction : createdAt, sinon timestamp ISO */
const txMs = (t) => toMs(t.createdAt) ?? toMs(t.timestamp)

/**
 * Consommations par personne et par jour.
 * benevoles : fiches { id (docId em-…), emId } ; artistes : idem ;
 * resas : réservations (bénévoles « retirées » seulement) ; consos : artist-consumptions.
 * jours : jours de l'événement (instantané), complétés par ceux où quelque chose a été servi.
 */
function consommations({ benevoles = [], artistes = [], resas = [], consos = [], jours = [] }) {
  const emB = new Map(benevoles.filter(b => b.emId).map(b => [b.id, b.emId]))
  const emA = new Map(artistes.filter(a => a.emId).map(a => [a.id, a.emId]))
  const add = (map, id, jour, type, qty) => {
    const k = `${id}|${jour}`
    const cur = map.get(k) || { id, jour, repas: 0, boissons: 0, eau: 0 }
    cur[type] += qty
    map.set(k, cur)
  }
  const b = new Map()
  for (const r of resas) {
    if (!r.isBenev && !r.benevoleId) continue
    if (r.status !== 'collected' || !emB.has(r.benevoleId)) continue
    const jour = r.jourConso || festDay(r.createdAt)
    if (!jour) continue
    for (const it of r.items || []) {
      const t = KEY[it.typeConsommation]
      if (t) add(b, emB.get(r.benevoleId), jour, t, Math.max(1, Math.round(num(it.qty) || 1)))
    }
  }
  const a = new Map()
  for (const c of consos) {
    if (!emA.has(c.creneauId)) continue
    const jour = festDay(c.servedAt)
    const t = KEY[c.type]
    if (jour && t) add(a, emA.get(c.creneauId), jour, t, 1)
  }
  const tri = (x, y) => (x.jour + x.id).localeCompare(y.jour + y.id)
  const benevolesOut = [...b.values()].sort(tri)
  const artistesOut = [...a.values()].sort(tri)
  const tousJours = [...new Set([...jours, ...benevolesOut.map(x => x.jour), ...artistesOut.map(x => x.jour)])].sort().slice(-31)
  // Chaque ligne doit appartenir à un jour envoyé ; quantités bornées comme chez Event Manager
  const garde = new Set(tousJours)
  const borne = (l) => ({ ...l, repas: Math.min(l.repas, 9999), boissons: Math.min(l.boissons, 9999), eau: Math.min(l.eau, 9999) })
  const liste = (l) => l.filter(x => garde.has(x.jour)).map(borne).slice(0, 5000)
  return { jours: tousJours, benevoles: liste(benevolesOut), artistes: liste(artistesOut) }
}

/**
 * Bilan financier, comme le « Rapport Excel » : transactions (centimes), soldes des spectateurs, menu.
 * Ventes payées = encaissements (debit) + retraits de réservation (retrait), ventilées par catégorie
 * de la carte (champ cat de l'article du même nom). Offerts : retraits bénévoles (prix de la carte)
 * et cadeaux aux artistes (articles valorisés au prix de la carte).
 */
function bilan({ transactions = [], spectateurs = [], menu = [] }) {
  const byNom = new Map(menu.map(m => [String(m.nom || '').trim().toLowerCase(), m]))
  const article = (nom) => byNom.get(String(nom || '').trim().toLowerCase())
  const sum = (type) => transactions.filter(t => t.type === type).reduce((s, t) => s + num(t.montant), 0)
  const cats = new Map()
  const jours = new Map()
  const jourDe = (t) => festDay(txMs(t))
  const addJour = (t, field, c) => {
    const j = jourDe(t)
    if (!j) return
    const cur = jours.get(j) || { jour: j, recharges: 0, ventes: 0, remboursements: 0 }
    cur[field] += c
    jours.set(j, cur)
  }
  let offertsArtistes = 0
  for (const t of transactions) {
    if (t.type === 'credit') addJour(t, 'recharges', num(t.montant))
    if (t.type === 'remboursement') addJour(t, 'remboursements', num(t.montant))
    if (t.type === 'debit' || t.type === 'retrait') {
      addJour(t, 'ventes', num(t.montant))
      for (const it of t.items || []) {
        const qty = num(it.qty) || 1
        const montant = it.total != null ? num(it.total) : num(it.prixUnit ?? it.prix) * qty
        const nomCat = article(it.nom)?.cat || 'Supprimé du menu'
        const k = nomCat.trim().toLowerCase()   // noms distincts sans tenir compte des majuscules
        const cur = cats.get(k) || { nom: nomCat.trim(), montant: 0, unites: 0 }
        cur.montant += montant; cur.unites += qty
        cats.set(k, cur)
      }
    }
    if (t.type === 'artist-gift') {
      for (const it of t.items || []) offertsArtistes += num(article(it.nom)?.prix) * (num(it.qty) || 1)
    }
  }
  return {
    recharges: euros(sum('credit')),
    ventes: euros(sum('debit') + sum('retrait')),
    remboursements: euros(sum('remboursement')),
    soldesRestants: euros(spectateurs.reduce((s, x) => s + num(x.solde), 0)),
    offertsBenevoles: euros(sum('benev-retrait')),
    offertsArtistes: euros(offertsArtistes),
    categories: [...cats.values()].map(c => ({ nom: c.nom.slice(0, 120), montant: euros(c.montant), unites: Math.round(c.unites) }))
      .sort((x, y) => y.montant - x.montant).slice(0, 200),
    parJour: [...jours.values()].sort((x, y) => x.jour.localeCompare(y.jour)).slice(-31)
      .map(j => ({ jour: j.jour, recharges: euros(j.recharges), ventes: euros(j.ventes), remboursements: euros(j.remboursements) })),
  }
}

/** Empreinte d'un contenu (ordre des champs indifférent) : on n'envoie que ce qui a changé */
const stable = (v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'
  : Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : JSON.stringify(v))
const empreinte = (v) => crypto.createHash('sha256').update(stable(v)).digest('hex').slice(0, 32)

/** Date d'envoi ISO avec le décalage de Paris (« 2027-05-15T23:10:00+02:00 ») */
function parisIso(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]))
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  const off = Math.round((local - Math.floor(ms / 1000) * 1000) / 60000)
  const sign = off >= 0 ? '+' : '-'
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0'), mm = String(Math.abs(off) % 60).padStart(2, '0')
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${sign}${hh}:${mm}`
}

const INTERVAL_MS = 5 * 60_000

/**
 * Faut-il préparer un envoi maintenant ?
 * state : liaisons-em/{ev}.retour ; nouveau : il s'est passé quelque chose depuis le dernier calcul ;
 * cloture : date de la dernière clôture de caisse (ms) ou null.
 */
function envoiDu(state, { now, nouveau, clotureMs }) {
  const s = state || {}
  const final = clotureMs != null && clotureMs > (s.clotureMs || 0)
  if (final) return { du: true, final: true }
  if (!nouveau && s.consoHash && s.bilanHash && !s.echec) return { du: false }
  if (s.essaiMs && now - s.essaiMs < INTERVAL_MS) return { du: false }
  return { du: true, final: false }
}

module.exports = { consommations, bilan, empreinte, parisIso, envoiDu, festDay, INTERVAL_MS }
