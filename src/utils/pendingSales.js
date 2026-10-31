/**
 * utils/pendingSales.js — encaissements retenus avant écriture (annulation 10 s)
 *
 * Les transactions Firestore sont immuables et tous les rapports additionnent les
 * débits : plutôt que d'annuler après coup, on retient le débit HOLD_MS avant de
 * l'écrire. Annuler pendant ce délai = rien n'est débité (trace dans l'audit).
 *
 * Chaque vente est gardée dans localStorage jusqu'à confirmation de Firestore :
 *  - elle part même si on change de page (gestionnaire hors React) ;
 *  - après un rechargement, les ventes restantes sont envoyées au démarrage ;
 *  - hors ligne, elle attend le retour du réseau.
 * Son identifiant sert d'id de transaction : un envoi rejoué ne débite pas deux fois.
 */
import useAppStore from '../store/useAppStore'
import { addAuditLog } from '../firebase/service'

export const HOLD_MS = 10_000
const KEY = 'yllacash-pending-sales'

const listeners = new Set()
const timers = new Map()
let sales = load()

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(sales)) } catch {}
  listeners.forEach(fn => fn(sales))
}
function patch(id, change) {
  sales = sales.map(s => s.id === id ? { ...s, ...change } : s)
  save()
}
function remove(id) {
  sales = sales.filter(s => s.id !== id)
  clearTimeout(timers.get(id))
  timers.delete(id)
  save()
}

/** Écoute la liste (pour afficher les ventes en attente / en échec) */
export function subscribe(fn) {
  listeners.add(fn)
  fn(sales)
  return () => listeners.delete(fn)
}

/** Enregistre une vente : elle sera écrite dans HOLD_MS sauf annulation */
export function holdSale({ specId, specNom, items, total, staffNom, eventId }) {
  const id = `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const sale = {
    id, specId, specNom, staffNom, eventId, total,
    // On ne garde que ce que debiter() lit : id, nom, prix, qty
    items: items.map(i => ({ id: i.id, nom: i.nom, prix: i.prix, qty: i.qty })),
    commitAt: Date.now() + HOLD_MS,
    status: 'holding', // holding | sending | waiting-network | failed
  }
  sales = [...sales, sale]
  save()
  schedule(sale)
  return id
}

/** Annule une vente encore retenue. Renvoie false si elle est déjà partie. */
export function cancelSale(id, reason = 'Annulé par le stand') {
  const sale = sales.find(s => s.id === id)
  if (!sale || sale.status === 'sending') return false
  remove(id)
  addAuditLog('ENCAISSEMENT_ANNULE', {
    specId: sale.specId, specNom: sale.specNom ?? null, montant: sale.total,
    staff: sale.staffNom, label: `Encaissement annulé avant écriture — ${reason}`,
  })
  return true
}

/** Retire une vente en échec de la liste (après l'avoir réglée autrement) */
export function dismissSale(id) { remove(id) }

/** Relance immédiatement une vente en échec ou en attente de réseau */
export function retrySale(id) {
  const sale = sales.find(s => s.id === id)
  if (sale) commit(sale)
}

function schedule(sale) {
  clearTimeout(timers.get(sale.id))
  timers.set(sale.id, setTimeout(() => commit(sale), Math.max(0, sale.commitAt - Date.now())))
}

async function commit(sale) {
  const current = sales.find(s => s.id === sale.id)
  if (!current || current.status === 'sending') return
  if (!navigator.onLine) { patch(sale.id, { status: 'waiting-network' }); return }
  patch(sale.id, { status: 'sending' })
  try {
    await useAppStore.getState().debiter(sale.specId, sale.items, sale.staffNom, sale.eventId, { txId: sale.id })
    remove(sale.id)
  } catch (e) {
    // Coupure pendant l'envoi : on réessaiera au retour du réseau (sans double débit)
    if (!navigator.onLine) patch(sale.id, { status: 'waiting-network' })
    else patch(sale.id, { status: 'failed', error: e?.message || 'Erreur inconnue' })
  }
}

function resumeAll() {
  sales.filter(s => s.status !== 'failed').forEach(s => {
    // "sending" au démarrage = page fermée pendant l'envoi : on rejoue, l'id évite le doublon
    if (s.status === 'sending') s.status = 'holding'
    schedule(s)
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', resumeAll)
  // Au chargement : envoyer ce qui restait (stores déjà réhydratés depuis localStorage)
  setTimeout(resumeAll, 1500)
}
