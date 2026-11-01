/**
 * src/firebase/service.js — v2 STABLE
 *
 * Principe fondamental : AUCUNE variable globale mutable pour l'eventId.
 * Chaque fonction qui a besoin d'un eventId le lit depuis le store Zustand
 * de manière synchrone via getEventId(). Pas de race condition possible.
 *
 * Structure Firestore : events/{eventId}/{collection}/...
 * Exceptions (globales) : events/, roles/, categories/
 */

import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  deleteDoc, query, where, orderBy, limit, onSnapshot,
  serverTimestamp, increment, runTransaction, writeBatch,
  arrayUnion} from 'firebase/firestore'
import { db }        from './config'
import { nowStr, uid, makeResaCode } from '../utils/helpers'

const SEUIL_STOCK = 10

// ── Lecture de l'eventId — TOUJOURS depuis le localStorage ──────────
// Synchrone, fiable, pas de race condition
const getEventId = () => {
  try {
    // 1. Lire depuis le store Zustand en mémoire (le plus fiable)
    const storeId = window.__yllacash_stores__?.eventStore?.getState?.()?.currentEventId
    if (storeId) return storeId

    // 2. Fallback : lire depuis le localStorage
    const raw = localStorage.getItem('yllacash-event')
    if (!raw) return null
    return JSON.parse(raw)?.state?.currentEventId || null
  } catch { return null }
}

// ── Helpers collections ──────────────────────────────────────────────
// evId optionnel : si fourni, l'utilise ; sinon lit le localStorage
const eCol = (name, evId) => {
  const id = evId || getEventId()
  if (!id) throw new Error(`Aucun événement actif (col: ${name})`)
  return collection(db, 'events', id, name)
}
const eDoc = (name, docId, evId) => {
  const id = evId || getEventId()
  if (!id) throw new Error(`Aucun événement actif (doc: ${name}/${docId})`)
  return doc(db, 'events', id, name, docId)
}

// Collections liées à l'événement
const specCol  = (evId) => eCol('spectateurs',  evId)
const txCol    = (evId) => eCol('transactions',  evId)
const resaCol  = (evId) => eCol('reservations',  evId)
const menuCol  = (evId) => eCol('menu',          evId)
const staffCol = (evId) => eCol('staff',         evId)
const notifCol = (evId) => eCol('notifications', evId)
const auditCol = (evId) => eCol('audit',         evId)

// Collections globales (hors événement)
const settingsDoc = () => doc(db, 'settings', 'global')

// setCurrentEvent conservé pour compatibilité (ne fait rien — on lit le localStorage)
export const setCurrentEvent    = (_id) => {}
export const getCurrentEventId  = () => getEventId()

// ── Helpers internes ─────────────────────────────────────────────────
const audit = async (action, details = {}) => {
  try {
    const authStore   = window.__yllacash_stores__?.authStore
    const currentUser = authStore?.getState?.()?.user
    const staffEmail  = currentUser?.email || details.staffEmail || null

    // Nettoyer les undefined — Firestore refuse les valeurs undefined
    const cleanDetails = Object.fromEntries(
      Object.entries({ ...details, staffEmail }).map(([k, v]) => [k, v === undefined ? null : v])
    )
    await addDoc(collection(db, 'events', getEventId(), 'audit'), {
      action, ...cleanDetails,
      date: nowStr(), timestamp: new Date().toISOString(),
      heure: new Date().toLocaleTimeString('fr-FR'),
      createdAt: serverTimestamp(),
    })
  } catch {}
}
export const addAuditLog = audit

const notif = async (type, titre, message, extra = {}) => {
  try {
    await addDoc(collection(db, 'events', getEventId(), 'notifications'), {
      type, titre, message,
      specId:      extra.specId      || null,
      benevoleId:  extra.benevoleId  || null,
      excludeStaffId: extra.excludeStaffId || null,
      resaId:      extra.resaId      || null,
      resaCode:    extra.resaCode    || null,
      lu: false,
      date: nowStr(), timestamp: new Date().toISOString(),
      createdAt: serverTimestamp(),
    })
  } catch {}
}

// ════════════════════════════════════════════════════════════════════
// SPECTATEURS
// ════════════════════════════════════════════════════════════════════

export const // Limité à 1000 spectateurs pour la performance
watchSpectateurs = (callback, evId) =>
  onSnapshot(collection(db, 'events', evId || getEventId(), 'spectateurs'), snap =>
    callback(snap.docs.map(d => ({ ...d.data(), _docId: d.id })))
  )

export const getSpectateur = async (id, evId) => {
  const snap = await getDocs(query(collection(db, 'events', getEventId(), 'spectateurs'), where('id', '==', id)))
  if (snap.empty) return null
  return { ...snap.docs[0].data(), _docId: snap.docs[0].id }
}

export const createSpectateur = async (nom, soldeEuros, staffNom = 'Billetterie') => {
  const id    = uid()
  const solde = soldeEuros * 100
  await addDoc(collection(db, 'events', getEventId(), 'spectateurs'), { id, nom, solde, avatar: null, createdAt: serverTimestamp() })
  if (solde > 0) {
    await addDoc(collection(db, 'transactions'), {
      specId: id, specNom: nom, type: 'credit',
      label: 'Recharge initiale', montant: solde, staff: staffNom,
      date: nowStr(), timestamp: new Date().toISOString(),
      createdAt: serverTimestamp(),
    })
  }
  await audit('CREATION_SPECTATEUR', { specId: id, specNom: nom, montant: solde, staff: staffNom, userType: 'spectateur', label: `Nouveau spectateur : ${nom}` })
  return id
}

export const updateSpecAvatar = async (specDocId, avatarUrl) =>
  updateDoc(doc(db, 'events', getEventId(), 'spectateurs', specDocId), { avatar: avatarUrl })

export const updateSpecNom = async (specDocId, nom) => {
  await updateDoc(doc(db, 'events', getEventId(), 'spectateurs', specDocId), { nom })
  await audit('MODIF_SPECTATEUR', { specDocId, specNom: nom, userType: 'spectateur', label: `Modification spectateur : ${nom}` })
}

// ════════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ════════════════════════════════════════════════════════════════════

export const addTransaction = async (tx) =>
  addDoc(collection(db, 'events', getEventId(), 'transactions'), { ...tx, date: tx.date || nowStr(), createdAt: serverTimestamp() })

export const watchTransactions = (callback, evId) =>
  onSnapshot(query(collection(db, 'events', evId || getEventId(), 'transactions'), orderBy('createdAt', 'desc'), limit(500)), snap =>
    callback(snap.docs.map(d => ({ ...d.data(), _docId: d.id })))
  )

// ════════════════════════════════════════════════════════════════════
// CRÉDITER
// ════════════════════════════════════════════════════════════════════

export const crediter = async (specId, montantEuros, staffNom = 'Billetterie', evId = null) => {
  const pts  = montantEuros * 100
  const eid = evId || getEventId()
  const snap = await getDocs(query(collection(db, 'events', eid, 'spectateurs'), where('id', '==', specId)))
  if (snap.empty) throw new Error('Spectateur introuvable')
  const specRef = snap.docs[0].ref

  await runTransaction(db, async (txn) => {
    const specDoc     = await txn.get(specRef)
    const soldeBefore = specDoc.data().solde || 0
    const soldeAfter  = soldeBefore + pts
    const now         = new Date()
    txn.update(specRef, { solde: increment(pts) })
    txn.set(doc(collection(db, 'events', eid, 'transactions')), {
      specId, specNom: specDoc.data().nom || '—', type: 'credit',
      label: `Recharge ${montantEuros}€`, montant: pts, staff: staffNom,
      soldeBefore, soldeAfter,
      date: nowStr(), timestamp: now.toISOString(),
      heure: now.toLocaleTimeString('fr-FR'), createdAt: serverTimestamp(),
    })
  })
  await audit('CREDIT', { specId, montant: pts, staff: staffNom, label: `Recharge ${montantEuros}€` })
  // Notif spectateur : compte crédité
  const snapSpec = await getDocs(query(collection(db, 'events', eid, 'spectateurs'), where('id', '==', specId)))
  if (!snapSpec.empty) {
    const specNom = snapSpec.docs[0].data().nom || ''
    await notif('CREDIT', '💳 Compte crédité', `${montantEuros}€ ont été ajoutés à votre compte.`, { specId })
    // Vérifier si solde bas après crédit (cas rare mais possible)
    const newSolde = (snapSpec.docs[0].data().solde || 0) + pts
    if (newSolde < 1500) { // < 15€
      await notif('SOLDE_BAS', '⚠️ Solde faible', `Votre solde est de ${(newSolde/100).toFixed(2)}€. Pensez à recharger.`, { specId })
    }
  }
  return pts
}

// ════════════════════════════════════════════════════════════════════
// DÉBITER
// ════════════════════════════════════════════════════════════════════

// txId (optionnel) : identifiant fixe de la transaction. Si une transaction avec cet
// identifiant existe déjà, rien n'est débité une seconde fois (encaissement rejoué
// après un rechargement de page ou une coupure réseau).
export const debiter = async (specId, items, staffNom = 'Stand', evId = null, { txId = null } = {}) => {
  const total = items.reduce((a, i) => a + i.prix * i.qty, 0)
  const label = items.map(i => i.nom + (i.qty > 1 ? ` ×${i.qty}` : '')).join(', ')
  const eid = evId || getEventId()
  const snap  = await getDocs(query(collection(db, 'events', eid, 'spectateurs'), where('id', '==', specId)))
  if (snap.empty) throw new Error('Spectateur introuvable')
  const specRef = snap.docs[0].ref
  const txRef   = txId
    ? doc(db, 'events', eid, 'transactions', txId)
    : doc(collection(db, 'events', eid, 'transactions'))
  let alreadyDone = false

  await runTransaction(db, async (txn) => {
    if (txId && (await txn.get(txRef)).exists()) { alreadyDone = true; return }
    const specDoc     = await txn.get(specRef)
    const soldeBefore = specDoc.data().solde || 0
    if (soldeBefore < total) throw new Error('Solde insuffisant')
    const soldeAfter = soldeBefore - total
    await decrementStocks(txn, items)
    txn.update(specRef, { solde: increment(-total) })
    const now = new Date()
    txn.set(txRef, {
      specId, specNom: specDoc.data().nom || '—', type: 'debit', label,
      items: items.map(i => ({ nom: i.nom, qty: i.qty, prixUnit: i.prix, total: i.prix * i.qty })),
      montant: total, staff: staffNom, soldeBefore, soldeAfter,
      date: nowStr(), timestamp: now.toISOString(),
      heure: now.toLocaleTimeString('fr-FR'), createdAt: serverTimestamp(),
    })
  })
  if (alreadyDone) return total
  await audit('DEBIT', { specId, montant: total, staff: staffNom, label })
  await checkStockAlertes(items)
  // Vérifier solde bas après débit
  const snapAfter = await getDocs(query(collection(db, 'events', getEventId(), 'spectateurs'), where('id', '==', specId)))
  if (!snapAfter.empty) {
    const soldeFinal = snapAfter.docs[0].data().solde || 0
    if (soldeFinal < 1500 && soldeFinal > 0) { // Entre 0 et 15€
      await notif('SOLDE_BAS', '⚠️ Solde faible', `Votre solde est de ${(soldeFinal/100).toFixed(2)}€. Pensez à recharger.`, { specId })
    }
  }
  return total
}

// ════════════════════════════════════════════════════════════════════
// RÉSERVATIONS
// ════════════════════════════════════════════════════════════════════


export const creerReservation = async (specId, specNom, items) => {
  const total = items.reduce((a, i) => a + i.prix * i.qty, 0)
  const snap  = await getDocs(query(collection(db, 'events', getEventId(), 'spectateurs'), where('id', '==', specId)))
  if (snap.empty) throw new Error('Spectateur introuvable')
  if (snap.docs[0].data().solde < total) throw new Error('Solde insuffisant')

  const code = makeResaCode(specId)
  const resa = { specId, specNom, items, total, status: 'pending', code, date: nowStr(), createdAt: serverTimestamp() }

  let resaDocId
  await runTransaction(db, async (txn) => {
    await decrementStocks(txn, items)
    const ref = doc(resaCol())
    resaDocId = ref.id
    txn.set(ref, resa)
  })

  await addDoc(collection(db, 'events', getEventId(), 'transactions'), {
    specId, specNom, type: 'reservation',
    label: `Résa #${code}: ` + items.map(i => i.nom + (i.qty > 1 ? ` ×${i.qty}` : '')).join(', '),
    montant: total, staff: '—', resaId: resaDocId,
    date: nowStr(), timestamp: new Date().toISOString(), createdAt: serverTimestamp(),
  })
  await audit('RESERVATION', { specId, specNom, montant: total, label: `Résa #${code}` })
  await notif('RESA_CREEE', '🛒 Nouvelle réservation',
    `${specNom} a réservé : ${items.map(i=>i.nom).join(', ')}`,
    { specId, resaCode: code }
  )
  return { id: resaDocId, ...resa }
}

export const watchReservations = (callback, evId) =>
  onSnapshot(query(collection(db, 'events', evId || getEventId(), 'reservations'), orderBy('createdAt', 'desc')), snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  )

// Prise en charge : pending → processing
export const prendreEnCharge = async (resaId, staffNom, staffId) => {
  const resaRef = doc(db, 'events', getEventId(), 'reservations', resaId)
  const resaDoc = await getDoc(resaRef)
  if (!resaDoc.exists()) throw new Error('Réservation introuvable')
  const resa = resaDoc.data()
  if (resa.status !== 'pending') throw new Error('Réservation déjà prise en charge')
  await updateDoc(resaRef, {
    status:          'processing',
    assignedStaffId: staffId,
    assignedStaff:   staffNom,
    assignedAt:      serverTimestamp(),
  })
  // Notif : commande en préparation (spectateur ou bénévole)
  await notif('RESA_PRISE', '👨‍🍳 Commande en préparation',
    `Votre commande est en cours de préparation par notre équipe.`,
    { specId: resa.specId || null, benevoleId: resa.benevoleId || null, resaId, resaCode: resa.code }
  )
  // Notif staff : prise en charge par un collègue (sauf le staff qui a pris en charge)
  const items = (resa.items||[]).map(i => i.nom + (i.qty>1?` x${i.qty}`:'')).join(', ')
  await notif('RESA_PRISE_STAFF', `👨‍🍳 Pris en charge par ${staffNom}`,
    `Résa #${resa.code} de ${resa.specNom||''} (${items}) prise en charge par ${staffNom}.`,
    { specId: resa.specId || null, resaId, resaCode: resa.code, excludeStaffId: staffId }
  )
  await audit('RESA_PRISE_EN_CHARGE', { resaId, specId: resa.specId || null, staff: staffNom })
}

// Marquer prête : processing → ready (seul le staff assigné ou admin)
export const marquerResaPrete = async (resaId, staffNom, staffId, isAdmin = false) => {
  const resaRef = doc(db, 'events', getEventId(), 'reservations', resaId)
  const resaDoc = await getDoc(resaRef)
  if (!resaDoc.exists()) throw new Error('Réservation introuvable')
  const resa  = resaDoc.data()
  if (resa.status !== 'processing') throw new Error('La réservation doit être en préparation')
  if (!isAdmin && resa.assignedStaffId !== staffId) throw new Error('Seul le staff assigné peut marquer cette commande comme prête')
  const label = (resa.items||[]).map(i => i.nom + (i.qty>1?` ×${i.qty}`:'')).join(', ')
  await updateDoc(resaRef, { status: 'ready', readyAt: serverTimestamp() })
  await notif('RESA_PRETE', '✅ Votre commande est prête !',
    `Venez retirer votre commande au stand : ${label}`,
    { specId: resa.specId || null, benevoleId: resa.benevoleId || null, resaId, resaCode: resa.code }
  )
  await audit('RESA_PRETE', { resaId, specId: resa.specId || null, staff: staffNom })
}

export const validerRetrait = async (resaId, staffNom = 'Stand') => {
  const resaRef = doc(db, 'events', getEventId(), 'reservations', resaId)
  const resaDoc = await getDoc(resaRef)
  if (!resaDoc.exists()) throw new Error('Réservation introuvable')
  const resa = resaDoc.data()
  if (resa.status === 'collected') throw new Error('Déjà retiré')

  // Cas bénévole — pas de débit de solde, juste marquer collected
  if (resa.isBenev || resa.benevoleId) {
    await updateDoc(resaRef, { status: 'collected', collectedAt: serverTimestamp(), collectedBy: staffNom })
    await audit('RETRAIT_BENEV', { resaId, benevoleId: resa.benevoleId, montant: resa.total || 0, staff: staffNom })
    const items = (resa.items||[]).map(i => i.nom + (i.qty>1?` x${i.qty}`:'')).join(', ')
    const beneficiaire = resa.benevoleNom || ''
    // Transaction bénévole retrait
    const nowRetrait = new Date()
    await addDoc(collection(db, 'events', getEventId(), 'transactions'), {
      benevoleId:  resa.benevoleId || null,
      benevoleNom: resa.benevoleNom || '—',
      specId:      null,
      specNom:     null,
      type:        'benev-retrait',
      label:       `Retrait bénévole #${resa.code} : ${items}`,
      items:       resa.items || [],
      montant:     resa.total || 0,
      staff:       staffNom,
      resaId,
      resaCode:    resa.code,
      date:        nowStr(),
      timestamp:   nowRetrait.toISOString(),
      heure:       nowRetrait.toLocaleTimeString('fr-FR'),
      createdAt:   serverTimestamp(),
    })
    await notif('RESA_RETIREE', '📦 Commande bénévole retirée',
      `${beneficiaire} a retiré sa commande #${resa.code} : ${items}`,
      { benevoleId: resa.benevoleId || null, resaCode: resa.code }
    )
    await notif('RESA_RETIREE_SPEC', '✅ Commande retirée',
      `Votre commande #${resa.code} a bien été retirée. Bonne dégustation !`,
      { benevoleId: resa.benevoleId || null, resaCode: resa.code }
    )
    return
  }

  // Cas spectateur — débit du solde
  const snap = await getDocs(query(collection(db, 'events', getEventId(), 'spectateurs'), where('id', '==', resa.specId)))
  if (snap.empty) throw new Error('Spectateur introuvable')
  const specRef = snap.docs[0].ref

  await runTransaction(db, async (txn) => {
    const specDoc     = await txn.get(specRef)
    const soldeBefore = specDoc.data().solde || 0
    if (soldeBefore < resa.total) throw new Error('Solde insuffisant')
    const soldeAfter = soldeBefore - resa.total
    const now = new Date()
    txn.update(specRef, { solde: increment(-resa.total) })
    txn.update(resaRef, { status: 'collected', collectedAt: serverTimestamp(), collectedBy: staffNom })
    txn.set(doc(collection(db, 'events', getEventId(), 'transactions')), {
      specId: resa.specId, specNom: resa.specNom || '—', type: 'retrait',
      label: `Retrait résa #${resa.code}`, items: resa.items,
      montant: resa.total, staff: staffNom, resaId, resaCode: resa.code,
      soldeBefore, soldeAfter,
      date: nowStr(), timestamp: now.toISOString(),
      heure: now.toLocaleTimeString('fr-FR'), createdAt: serverTimestamp(),
    })
  })
  await audit('RETRAIT', { resaId, specId: resa.specId || null, montant: resa.total, staff: staffNom })
  const items = (resa.items||[]).map(i => i.nom + (i.qty>1?` x${i.qty}`:'')).join(', ')
  const beneficiaire = resa.benevoleNom || resa.specNom || ''
  await notif('RESA_RETIREE', '📦 Commande retirée',
    `${beneficiaire} a retiré sa commande #${resa.code} : ${items}`,
    { specId: resa.specId || null, benevoleId: resa.benevoleId || null, resaCode: resa.code }
  )
  await notif('RESA_RETIREE_SPEC', '✅ Commande retirée',
    `Votre commande #${resa.code} a bien été retirée. Bonne dégustation !`,
    { specId: resa.specId || null, benevoleId: resa.benevoleId || null, resaCode: resa.code }
  )
}

export const annulerReservation = async (resaId, staffNom = '—', staffId = null, isAdmin = false, motif = '', cancelledByRole = 'stand') => {
  const resaRef = doc(db, 'events', getEventId(), 'reservations', resaId)
  const resaDoc = await getDoc(resaRef)
  if (!resaDoc.exists()) return
  const resa = resaDoc.data()
  if (resa.status === 'collected' || resa.status === 'cancelled') return
  // Vérifier les droits si en processing
  if (resa.status === 'processing' && !isAdmin && resa.assignedStaffId !== staffId) {
    throw new Error('Seul le staff assigné ou un admin peut annuler cette réservation')
  }
  const batch = writeBatch(db)
  // Rembourser le stock menu
  ;(resa.items||[]).forEach(item => {
    if (item.id) batch.update(doc(db, 'events', getEventId(), 'menu', item.id), { stock: increment(item.qty||1) })
  })
  // Annuler la réservation
  batch.update(resaRef, {
    status:          'cancelled',
    cancelledBy:     staffNom,
    cancelledByRole: cancelledByRole,
    cancelledAt:     new Date().toISOString(),
    motifAnnulation: motif || '',
  })
  await batch.commit()
  // Rembourser le quota bénévole — SÉPARÉ du batch car plusieurs updates sur le même doc
  if ((resa.isBenev || resa.benevoleId) && resa.benevoleId) {
    const bRef = doc(db, 'events', getEventId(), 'benevoles', resa.benevoleId)
    // Regrouper par typeConsommation pour éviter les conflits de batch
    const quotaUpdates = {}
    ;(resa.items||[]).forEach(item => {
      if (item.typeConsommation) {
        quotaUpdates[item.typeConsommation] = (quotaUpdates[item.typeConsommation] || 0) + (item.qty || 1)
      }
    })
    if (Object.keys(quotaUpdates).length > 0) {
      const updateData = {}
      Object.entries(quotaUpdates).forEach(([type, qty]) => {
        updateData[`consommation.${type}`] = increment(-qty)
      })
      await updateDoc(bRef, updateData)
    }
  }
  // Filtrer les undefined explicitement avant addDoc (Firestore refuse undefined)
  const isBenev = !!(resa.isBenev || resa.benevoleId)
  const txData = Object.fromEntries(Object.entries({
    specId:     resa.specId     ?? null,
    specNom:    resa.specNom    ?? null,
    benevoleId: resa.benevoleId ?? null,
    benevoleNom: resa.benevoleNom ?? null,
    type:       isBenev ? 'benev-annulation' : 'annulation',
    label:      `Annulation résa #${resa.code}${resa.benevoleNom ? ' — ' + resa.benevoleNom : resa.specNom ? ' — ' + resa.specNom : ''}`,
    montant:    resa.total ?? 0,
    staff:      staffNom,
    resaCode:   resa.code ?? null,
    date:       nowStr(),
    timestamp:  new Date().toISOString(),
    heure:      new Date().toLocaleTimeString('fr-FR'),
    createdAt:  serverTimestamp(),
  }).map(([k, v]) => [k, v === undefined ? null : v]))
  await addDoc(collection(db, 'events', getEventId(), 'transactions'), txData)
  await audit('ANNULATION_RESA', {
    resaId, resaCode: resa.code ?? null,
    specId: resa.specId ?? null, specNom: resa.specNom ?? null,
    benevoleId: resa.benevoleId ?? null, benevoleNom: resa.benevoleNom ?? null,
    motif: motif || '', staff: staffNom, cancelledByRole: cancelledByRole ?? null,
    montant: resa.total ?? 0,
    userType: resa.isBenev ? 'benevole' : 'spectateur',
    label: `Annulation résa #${resa.code ?? ''} — ${motif || 'Sans motif'}`,
  })
  // Notif spectateur/bénévole : réservation annulée avec motif
  const motifMsg = motif || 'Votre réservation a été annulée.'
  await notif('RESA_ANNULEE_SPEC',
    '❌ Réservation annulée',
    `Votre réservation #${resa.code} a été annulée. Motif : ${motifMsg}`,
    { specId: resa.specId || null, benevoleId: resa.benevoleId || null, resaCode: resa.code }
  )
  // Notif staff : confirmation annulation (audience staff)
  await notif('RESA_RETIREE',
    '❌ Résa annulée — ' + (resa.specNom||''),
    `La réservation #${resa.code} de ${resa.specNom||''} a été annulée par ${staffNom}. Motif : ${motifMsg}`,
    { specId: resa.specId || null, benevoleId: resa.benevoleId || null, resaCode: resa.code }
  )
}

export const deleteReservation = async (resaId) => {
  const resaRef = doc(db, 'events', getEventId(), 'reservations', resaId)
  const resaDoc = await getDoc(resaRef)
  if (!resaDoc.exists()) return
  const resa = resaDoc.data()
  // Autoriser la suppression uniquement si annulée ou collected
  if (resa.status !== 'cancelled' && resa.status !== 'collected') {
    throw new Error('Seules les réservations annulées ou retirées peuvent être supprimées')
  }
  await audit('SUPPRESSION_RESA', {
    resaId, resaCode: resa.code ?? null,
    specId: resa.specId ?? null, specNom: resa.specNom ?? null,
    benevoleId: resa.benevoleId ?? null,
    userType: resa.isBenev ? 'benevole' : 'spectateur',
    label: `Suppression résa #${resa.code ?? ''}`,
  })
  await deleteDoc(resaRef)
}

// ════════════════════════════════════════════════════════════════════
// MENU
// ════════════════════════════════════════════════════════════════════

const decrementStocks = async (txn, items) => {
  const refs = items.map(i => doc(db, 'events', getEventId(), 'menu', i.id))
  const docs = await Promise.all(refs.map(r => txn.get(r)))
  for (let i = 0; i < items.length; i++) {
    const data = docs[i].data()
    if (!data) throw new Error(`Article "${items[i].nom}" introuvable`)
    if ((data.stock||0) < items[i].qty)
      throw new Error(`Stock insuffisant pour "${items[i].nom}" (${data.stock} dispo)`)
  }
  for (let i = 0; i < items.length; i++) {
    txn.update(refs[i], { stock: (docs[i].data().stock||0) - items[i].qty })
  }
}

// Décrémente le stock hors transaction (pour artistes, bénévoles sans transaction)
const decrementStocksSimple = async (items, evId = null) => {
  const eventId = evId || getEventId()
  for (const it of items) {
    if (!it.id) continue
    const qty = it.qty || 1
    try {
      const ref = doc(db, 'events', eventId, 'menu', it.id)
      await updateDoc(ref, { stock: increment(-qty) })
    } catch (e) {
      console.warn('decrementStocksSimple error for ' + it.id + ':', e)
    }
  }
}

const checkStockAlertes = async (items) => {
  for (const item of items) {
    try {
      const snap = await getDoc(doc(db, 'events', getEventId(), 'menu', item.id))
      if (!snap.exists()) continue
      const stock = snap.data().stock || 0
      if (stock <= SEUIL_STOCK) {
        await notif('ALERTE', `⚠️ Stock bas — ${item.nom}`,
          `Il ne reste que ${stock} unité${stock>1?'s':''} de "${item.nom}".`, {})
      }
    } catch {}
  }
}

export const watchMenu = (callback, evId) =>
  onSnapshot(collection(db, 'events', evId || getEventId(), 'menu'), snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  )

export const addMenuItem    = async (item) => {
  const ref = await addDoc(collection(db, 'events', getEventId(), 'menu'), { stock: 100, ...item })
  await audit('CREATION_ARTICLE', { articleId: ref.id, nom: item.nom, prix: item.prix, cat: item.cat, userType: 'staff', label: `Nouvel article : ${item.nom}` })
  return ref
}
export const updateMenuItem = async (id, patch) => {
  await updateDoc(doc(db, 'events', getEventId(), 'menu', id), patch)
  await audit('MODIF_ARTICLE', { articleId: id, patch: JSON.stringify(patch).slice(0, 200), userType: 'staff', label: `Modification article #${id}` })
}
export const deleteMenuItem = async (id) => {
  await audit('SUPPRESSION_ARTICLE', { articleId: id, userType: 'staff', label: `Suppression article #${id}` })
  await deleteDoc(doc(db, 'events', getEventId(), 'menu', id))
}

// ════════════════════════════════════════════════════════════════════
// STAFF (global — hors événement)
// ════════════════════════════════════════════════════════════════════

export const watchStaff = (callback, evId) => {
  const col = evId
    ? collection(db, 'events', evId, 'staff')
    : collection(db, 'staff') // fallback racine
  return onSnapshot(col, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  )
}

export const addStaff = (membre, evId) => {
  const col = evId
    ? collection(db, 'events', evId, 'staff')
    : collection(db, 'staff')
  return addDoc(col, { avatar: null, ...membre })
}
export const updateStaffRole = (id, role, evId) => {
  const ref = evId ? doc(db, 'events', evId, 'staff', id) : doc(db, 'staff', id)
  return updateDoc(ref, { role })
}
export const updateStaffAvatar = (id, avatar, evId) => {
  const ref = evId ? doc(db, 'events', evId, 'staff', id) : doc(db, 'staff', id)
  return updateDoc(ref, { avatar })
}
export const updateStaffEvents = (id, data, evId) => {
  const ref = evId ? doc(db, 'events', evId, 'staff', id) : doc(db, 'staff', id)
  return updateDoc(ref, data)
}
export const deleteStaffMember = (id, evId) => {
  const ref = evId ? doc(db, 'events', evId, 'staff', id) : doc(db, 'staff', id)
  return deleteDoc(ref)
}

// ════════════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════════════

export const getSettings = async (evId) => {
  try {
    const ref = evId
      ? doc(db, 'events', evId, 'settings', 'global')
      : settingsDoc()
    const snap = await getDoc(ref)
    return snap.exists() ? snap.data() : {}
  } catch { return {} }
}

export const saveSettings = async (data, evId) => {
  try {
    const { setDoc } = await import('firebase/firestore')
    const ref = evId
      ? doc(db, 'events', evId, 'settings', 'global')
      : settingsDoc()
    const snap = await getDoc(ref)
    if (snap.exists()) {
      await updateDoc(ref, data)
    } else {
      await setDoc(ref, data)
    }
  } catch (e) { console.warn('saveSettings error:', e) }
  try { await audit('MODIF_SETTINGS', { userType: 'admin', label: 'Modification des paramètres événement' }) } catch {}
}

// ════════════════════════════════════════════════════════════════════
// RÔLES (global)
// ════════════════════════════════════════════════════════════════════

export const watchRoles    = (cb)       => onSnapshot(collection(db, 'roles'), snap => cb(snap.docs.map(d => ({ ...d.data(), id: d.id }))))
export const createRole    = async (role) => {
  const ref = await addDoc(collection(db, 'roles'), { ...role, createdAt: serverTimestamp() })
  await audit('CREATION_ROLE', { roleId: ref.id, nom: role.nom, userType: 'admin', label: `Nouveau rôle : ${role.nom}` })
  return ref
}
export const updateRole    = async (id, p) => {
  await updateDoc(doc(db, 'roles', id), p)
  await audit('MODIF_ROLE', { roleId: id, nom: p.nom, userType: 'admin', label: `Modification rôle : ${p.nom || id}` })
}
export const deleteRole    = async (id) => {
  await audit('SUPPRESSION_ROLE', { roleId: id, userType: 'admin', label: `Suppression rôle #${id}` })
  await deleteDoc(doc(db, 'roles', id))
}

// ════════════════════════════════════════════════════════════════════
// CATÉGORIES (global)
// ════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// CATÉGORIES — stockées UNIQUEMENT en racine Firestore
// Raison : indépendantes des événements, partagées entre éditions
// Chemin : events/{eventId}/categories/{id}
// ═══════════════════════════════════════════════════════════════════

export const watchCategories = (cb, evId) =>
  onSnapshot(
    collection(db, 'categories'),
    snap => cb(
      snap.docs
        .map(d => ({ ...d.data(), id: d.id }))
        .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
    )
  )

export const createCategory = async (cat, evId) => {
  const ref = await addDoc(collection(db, 'categories'), { ...cat, createdAt: serverTimestamp() })
  await audit('CREATION_CATEGORIE', { categorieId: ref.id, nom: cat.nom, userType: 'admin', label: `Nouvelle catégorie : ${cat.nom}` })
  return ref
}

export const updateCategory = async (id, patch, evId) => {
  await updateDoc(doc(db, 'categories', id), patch)
  await audit('MODIF_CATEGORIE', { categorieId: id, nom: patch.nom, userType: 'admin', label: `Modification catégorie #${id}` })
}

export const deleteCategory = async (id, evId) => {
  await audit('SUPPRESSION_CATEGORIE', { categorieId: id, userType: 'admin', label: `Suppression catégorie #${id}` })
  await deleteDoc(doc(db, 'categories', id))
}

// ════════════════════════════════════════════════════════════════════
// NOTIFICATIONS (helper externe)
// ════════════════════════════════════════════════════════════════════

export const pushNotificationFromService = async ({ type, titre, message, specId = null, resaCode = null }) => {
  await notif(type, titre, message, { specId, resaCode })
}

// ════════════════════════════════════════════════════════════════════
// PLANNING
// ════════════════════════════════════════════════════════════════════

export const watchPlanning = (callback, evId) =>
  onSnapshot(
    query(collection(db, 'events', evId || getEventId(), 'planning'), orderBy('debut', 'asc')),
    snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  )

export const addCreneau = async (data) => {
  const ref = await addDoc(collection(db, 'events', getEventId(), 'planning'), {
    ...data,
    statut: 'a-venir',
    modifie: false,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export const updateCreneau = async (id, data, notifier = false) => {
  const ref = doc(db, 'events', getEventId(), 'planning', id)
  // Récupérer l'ancien créneau pour comparer
  let prev = null
  try {
    const prevSnap = await getDoc(ref)
    if (prevSnap.exists()) prev = prevSnap.data()
  } catch {}

  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() })

  const oldAvantages = prev?.avantages || null
  const newAvantages = data.avantages || null

  // Comparaison avantages champ par champ
  const eqArr = (a, b) => {
    const sa = [...(a || [])].sort()
    const sb = [...(b || [])].sort()
    return sa.length === sb.length && sa.every((v, i) => v === sb[i])
  }
  const avChanged = !!newAvantages && (
    (oldAvantages?.drinks || 0) !== (newAvantages.drinks || 0) ||
    (oldAvantages?.meals  || 0) !== (newAvantages.meals  || 0) ||
    (oldAvantages?.eaux   || 0) !== (newAvantages.eaux   || 0) ||
    !eqArr(oldAvantages?.drinkIds, newAvantages.drinkIds) ||
    !eqArr(oldAvantages?.mealIds,  newAvantages.mealIds)  ||
    !eqArr(oldAvantages?.eauIds,   newAvantages.eauIds)
  )

  // Détection d'un changement sur le créneau (hors avantages) : heures, scène, statut, artiste...
  const toMs = (x) => {
    if (!x) return null
    if (x?.toDate) return x.toDate().getTime()
    if (x instanceof Date) return x.getTime()
    const t = new Date(x).getTime()
    return isNaN(t) ? null : t
  }
  const creneauChanged = !!prev && (
    (data.debut   !== undefined && toMs(data.debut) !== toMs(prev.debut)) ||
    (data.fin     !== undefined && toMs(data.fin)   !== toMs(prev.fin))   ||
    (data.scene   !== undefined && (data.scene   || '') !== (prev.scene   || '')) ||
    (data.statut  !== undefined && (data.statut  || '') !== (prev.statut  || '')) ||
    (data.artiste !== undefined && (data.artiste || '') !== (prev.artiste || '')) ||
    (data.titre   !== undefined && (data.titre   || '') !== (prev.titre   || '')) ||
    (data.type    !== undefined && (data.type    || '') !== (prev.type    || ''))
  )

  const evId = getEventId()
  const notifCol = collection(db, 'events', evId, 'notifications')
  const artistLabel = data.artiste || prev?.artiste || data.titre || prev?.titre || 'Un artiste'

  // 1. Avantages changés → notif spécifique à l'artiste
  if (avChanged) {
    await addDoc(notifCol, {
      type: 'DROITS_MODIFIES',
      titre: '🎁 Vos avantages ont été mis à jour',
      message: 'Les avantages liés à votre créneau ont été modifiés. Consultez votre espace.',
      creneauId: id,
      lu: false,
      timestamp: new Date().toISOString(),
      createdAt: serverTimestamp(),
    })
  }

  // 2. Créneau changé (heures/scène/statut/etc.) → notif TOUJOURS à l'artiste concerné
  if (creneauChanged) {
    await addDoc(notifCol, {
      type: 'PLANNING_MODIF_MOI',
      titre: '⚠️ Votre créneau a été modifié',
      message: `Les détails de votre créneau ont changé. Consultez votre programme.`,
      creneauId: id,
      lu: false,
      timestamp: new Date().toISOString(),
      createdAt: serverTimestamp(),
    })
  }

  // 3. Si l'admin a coché "Notifier", notif aussi à tous (spectateurs + staff)
  if (notifier && (creneauChanged || avChanged)) {
    await addDoc(notifCol, {
      type: 'PLANNING_MODIF',
      titre: '📅 Changement de programme',
      message: `Le créneau "${artistLabel}" a été modifié.`,
      lu: false,
      timestamp: new Date().toISOString(),
      createdAt: serverTimestamp(),
    })
  }
}

export const deleteCreneau = async (id) => {
  await deleteDoc(doc(db, 'events', getEventId(), 'planning', id))
}

// Lier le créneau artiste à un compte spectateur (par son ID public, ex: SPEC-12345)
export const linkArtistToSpec = async (creneauId, specId, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement actif')
  if (!specId) throw new Error('Numéro spectateur requis')
  const cleanId = specId.trim().toUpperCase()
  // Vérifier que le spectateur existe dans l'événement
  const snap = await getDocs(query(collection(db, 'events', eventId, 'spectateurs'), where('id', '==', cleanId)))
  if (snap.empty) throw new Error('Aucun compte spectateur trouvé avec ce numéro.')
  const specData = snap.docs[0].data()
  const crRef = doc(db, 'events', eventId, 'planning', creneauId)
  await updateDoc(crRef, { linkedSpecId: cleanId, linkedSpecNom: specData.nom || null })
  return { specId: cleanId, specNom: specData.nom || null }
}

export const unlinkArtistFromSpec = async (creneauId, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement actif')
  const crRef = doc(db, 'events', eventId, 'planning', creneauId)
  await updateDoc(crRef, { linkedSpecId: null, linkedSpecNom: null })
}

// ── Avantages artistes ────────────────────────────────────────────────

export const creerReservationArtiste = async (creneau, items, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement actif')
  if (!items || items.length === 0) throw new Error('Aucun article sélectionné')
  const col = collection(db, 'events', eventId, 'artist-reservations')
  const data = {
    creneauId:  creneau.id,
    artisteNom: creneau.artiste || '',
    items:      items.map(i => ({ id: i.id, nom: i.nom, type: i._type || i.type })),
    statut:     'pending',
    createdAt:  serverTimestamp(),
    timestamp:  new Date().toISOString(),
  }
  const ref = await addDoc(col, data)
  // Décrémenter le stock des articles réservés
  await decrementStocksSimple(items.map(i => ({ id: i.id, qty: 1 })), eventId)
  // Notif staff
  const notifColArt = collection(db, 'events', eventId, 'notifications')
  const itemsLabel = items.map(i => i.nom).join(', ')
  await addDoc(notifColArt, {
    type: 'ARTISTE_RESA_NOUVELLE',
    titre: '🎁 Réservation artiste',
    message: `${creneau.artiste || 'Un artiste'} a réservé : ${itemsLabel}`,
    creneauId: creneau.id,
    resaId:    ref.id,
    lu:        false,
    timestamp: new Date().toISOString(),
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export const watchArtistReservations = (callback, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) return () => {}
  const col = collection(db, 'events', eventId, 'artist-reservations')
  return onSnapshot(col, snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))))
}

export const servirReservationArtiste = async (resa, staffNom, staffId, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement actif')
  // Récupérer le créneau pour le snapshot
  const crRef = doc(db, 'events', eventId, 'planning', resa.creneauId)
  const crSnap = await getDoc(crRef)
  const creneau = crSnap.exists() ? { ...crSnap.data(), id: crSnap.id } : { id: resa.creneauId, artiste: resa.artisteNom }
  // Créer une consommation pour chaque item
  const consCol = collection(db, 'events', eventId, 'artist-consumptions')
  for (const it of (resa.items || [])) {
    await addDoc(consCol, {
      creneauId:   resa.creneauId,
      artisteNom:  resa.artisteNom || creneau.artiste || '',
      articleId:   it.id,
      articleNom:  it.nom,
      type:        it.type,
      servedBy:    { uid: staffId || null, name: staffNom || 'Stand' },
      servedAt:    serverTimestamp(),
      fromResaId:  resa.id,
    })
  }
  // Marquer la résa comme servie
  const resaRef = doc(db, 'events', eventId, 'artist-reservations', resa.id)
  await updateDoc(resaRef, {
    statut:    'servie',
    servedBy:  { uid: staffId || null, name: staffNom || 'Stand' },
    servedAt:  serverTimestamp(),
  })
  // Transaction (offert artiste — visible dans l'onglet Transactions)
  const itemsLabel = (resa.items || []).map(i => i.nom).join(', ')
  const nowSrv = new Date()
  await addDoc(collection(db, 'events', eventId, 'transactions'), {
    type:        'artist-gift',
    label:       `Avantage artiste — ${resa.artisteNom || creneau.artiste || ''} : ${itemsLabel}`,
    items:       (resa.items || []).map(i => ({ nom: i.nom, qty: 1, type: i.type })),
    artisteNom:  resa.artisteNom || creneau.artiste || '',
    creneauId:   resa.creneauId,
    benevoleId:  null,
    specId:      null,
    benevoleNom: null,
    specNom:     null,
    montant:     0,
    staff:       staffNom || 'Stand',
    resaId:      resa.id,
    date:        nowStr(),
    timestamp:   nowSrv.toISOString(),
    heure:       nowSrv.toLocaleTimeString('fr-FR'),
    createdAt:   serverTimestamp(),
  })
  // Notif à l'artiste : sa réservation a été servie
  const notifColRA = collection(db, 'events', eventId, 'notifications')
  await addDoc(notifColRA, {
    type: 'ARTISTE_RESA_SERVIE',
    titre: '✅ Votre réservation a été servie',
    message: itemsLabel ? `Servi par ${staffNom || 'le stand'} : ${itemsLabel}` : `Votre réservation a été servie par ${staffNom || 'le stand'}.`,
    creneauId: resa.creneauId,
    resaId: resa.id,
    lu: false,
    timestamp: new Date().toISOString(),
    createdAt: serverTimestamp(),
  })
}

export const annulerReservationArtiste = async (resaId, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement actif')
  const resaRef = doc(db, 'events', eventId, 'artist-reservations', resaId)
  // Récupérer la résa pour rembourser le stock
  let items = []
  try {
    const snap = await getDoc(resaRef)
    if (snap.exists() && snap.data().statut === 'pending') {
      items = snap.data().items || []
    }
  } catch {}
  await updateDoc(resaRef, {
    statut:      'annulee',
    cancelledAt: serverTimestamp(),
  })
  // Rembourser le stock pour chaque item de la résa annulée
  for (const it of items) {
    if (!it.id) continue
    try {
      const ref = doc(db, 'events', eventId, 'menu', it.id)
      await updateDoc(ref, { stock: increment(1) })
    } catch {}
  }
}

export const watchArtistConsumptions = (callback, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) return () => {}
  const col = collection(db, 'events', eventId, 'artist-consumptions')
  return onSnapshot(col, snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))))
}

export const serveArtistItem = async (creneau, article, type, staffNom, staffId, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement actif')
  const col = collection(db, 'events', eventId, 'artist-consumptions')
  const docData = {
    creneauId:   creneau.id,
    artisteNom:  creneau.artiste || '',
    articleId:   article.id,
    articleNom:  article.nom || '',
    type:        type, // 'drink' | 'meal' | 'eau'
    servedBy:    { uid: staffId || null, name: staffNom || 'Stand' },
    servedAt:    serverTimestamp(),
  }
  const ref = await addDoc(col, docData)
  // Décrémenter le stock de l'article
  await decrementStocksSimple([{ id: article.id, qty: 1 }], eventId)
  // Transaction artiste (visible dans onglet Transactions)
  const nowSrv = new Date()
  await addDoc(collection(db, 'events', eventId, 'transactions'), {
    type:        'artist-gift',
    label:       `Avantage artiste — ${creneau.artiste || ''} : ${article.nom || ''}`,
    items:       [{ nom: article.nom || '', qty: 1, type }],
    artisteNom:  creneau.artiste || '',
    creneauId:   creneau.id,
    benevoleId:  null,
    specId:      null,
    benevoleNom: null,
    specNom:     null,
    montant:     0,
    staff:       staffNom || 'Stand',
    date:        nowStr(),
    timestamp:   nowSrv.toISOString(),
    heure:       nowSrv.toLocaleTimeString('fr-FR'),
    createdAt:   serverTimestamp(),
  })
  return ref
}

export const getArtistConsumptions = async (creneauId, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) return []
  const col = collection(db, 'events', eventId, 'artist-consumptions')
  const q   = query(col, where('creneauId', '==', creneauId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ ...d.data(), id: d.id }))
}

// ════════════════════════════════════════════════════════════════════
// CHAT ÉQUIPE (v7)
// ════════════════════════════════════════════════════════════════════

const chatColRef = (evId) => collection(db, 'events', evId || getEventId(), 'team-chat')
const typingColRef = (evId) => collection(db, 'events', evId || getEventId(), 'team-chat-typing')

// Envoyer un message texte
export const sendChatMessage = async (text, author, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement actif')
  if (!text || !text.trim()) throw new Error('Message vide')
  const ref = await addDoc(chatColRef(eventId), {
    type: 'text',
    content: text.trim(),
    author: { uid: author.uid, nom: author.nom, role: author.role || 'staff' },
    readBy: [author.uid],
    createdAt: serverTimestamp(),
    timestamp: new Date().toISOString(),
    deletedAt: null,
  })
  return ref.id
}

// Envoyer un message vocal (URL déjà uploadée)
export const sendChatVoice = async (audioUrl, duration, author, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement actif')
  const ref = await addDoc(chatColRef(eventId), {
    type: 'voice',
    audioUrl,
    duration: duration || 0,
    author: { uid: author.uid, nom: author.nom, role: author.role || 'staff' },
    readBy: [author.uid],
    createdAt: serverTimestamp(),
    timestamp: new Date().toISOString(),
    deletedAt: null,
  })
  return ref.id
}

// Envoyer une image (URL déjà uploadée)
export const sendChatImage = async (imageUrl, author, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement actif')
  const ref = await addDoc(chatColRef(eventId), {
    type: 'image',
    imageUrl,
    author: { uid: author.uid, nom: author.nom, role: author.role || 'staff' },
    readBy: [author.uid],
    createdAt: serverTimestamp(),
    timestamp: new Date().toISOString(),
    deletedAt: null,
  })
  return ref.id
}

// Écouter les messages (200 derniers, ordre chronologique inverse côté Firestore puis on inverse côté UI)
export const watchChatMessages = (callback, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) return () => {}
  const q = query(chatColRef(eventId), orderBy('createdAt', 'desc'), limit(200))
  return onSnapshot(q, snap => {
    const list = snap.docs.map(d => ({ ...d.data(), id: d.id }))
    // Inverser pour avoir du plus ancien au plus récent
    list.reverse()
    callback(list)
  }, err => console.warn('watchChatMessages error:', err))
}

// Marquer un message comme lu
export const markChatMessageRead = async (msgId, uid, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId || !uid) return
  try {
    const ref = doc(db, 'events', eventId, 'team-chat', msgId)
    await updateDoc(ref, { readBy: arrayUnion(uid) })
  } catch (e) {
    console.warn('markChatMessageRead error:', e)
  }
}

// Marquer tous les messages visibles comme lus (batch)
export const markAllChatMessagesRead = async (msgIds, uid, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId || !uid || !msgIds || msgIds.length === 0) return
  const promises = msgIds.map(id => {
    const ref = doc(db, 'events', eventId, 'team-chat', id)
    return updateDoc(ref, { readBy: arrayUnion(uid) }).catch(() => {})
  })
  await Promise.all(promises)
}

// Supprimer un message (soft delete)
export const deleteChatMessage = async (msgId, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement actif')
  const ref = doc(db, 'events', eventId, 'team-chat', msgId)
  await updateDoc(ref, {
    deletedAt: serverTimestamp(),
    content: null,
    audioUrl: null,
    imageUrl: null,
  })
}

// Indicateur "en train d'écrire" (heartbeat)
export const setChatTyping = async (uid, nom, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId || !uid) return
  try {
    const { setDoc } = await import('firebase/firestore')
    const ref = doc(typingColRef(eventId), uid)
    await setDoc(ref, { uid, nom, at: serverTimestamp() }, { merge: true })
  } catch (e) {
    console.warn('setChatTyping error:', e)
  }
}

export const clearChatTyping = async (uid, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId || !uid) return
  try {
    const { deleteDoc } = await import('firebase/firestore')
    const ref = doc(typingColRef(eventId), uid)
    await deleteDoc(ref).catch(() => {})
  } catch {}
}

// Écouter qui est en train d'écrire (filtre les entrées > 8 secondes)
export const watchChatTyping = (callback, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) return () => {}
  return onSnapshot(typingColRef(eventId), snap => {
    const now = Date.now()
    const list = snap.docs
      .map(d => d.data())
      .filter(d => {
        if (!d.at) return false
        const ms = d.at?.toMillis ? d.at.toMillis() : new Date(d.at).getTime()
        return (now - ms) < 8000 // actif si heartbeat < 8s
      })
    callback(list)
  }, err => console.warn('watchChatTyping error:', err))
}

// Purge des messages > 30 jours (appelé au démarrage du chat)
export const purgeOldChatMessages = async (evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) return
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const { deleteDoc, getDocs } = await import('firebase/firestore')
    const oldQuery = query(chatColRef(eventId), where('createdAt', '<', cutoff), limit(50))
    const snap = await getDocs(oldQuery)
    if (snap.empty) return
    const promises = snap.docs.map(d => deleteDoc(doc(db, 'events', eventId, 'team-chat', d.id)).catch(() => {}))
    await Promise.all(promises)
    console.log('Chat purge: ' + snap.size + ' messages supprimés')
  } catch (e) {
    console.warn('purgeOldChatMessages error:', e)
  }
}

// Upload d'une voice note ou image : base64 dans Firestore (évite la dépendance Storage)
// Voice notes : conservées en WebM (~3KB/s) → 60s = ~240KB base64 << limite Firestore 1MB
// Images : redimensionnées à 1280px max + JPEG q=0.75 avant base64
export const uploadChatMedia = async (file, type, evId = null) => {
  if (!file) throw new Error('Fichier manquant')
  if (type === 'voice') {
    // Lire le blob audio en base64
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => resolve(e.target.result)
      reader.onerror = () => reject(new Error('Lecture audio impossible'))
      reader.readAsDataURL(file)
    })
  }
  // Image : compresser via canvas avant base64
  return await new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      try {
        const MAX = 1280
        let { width, height } = img
        if (width > MAX || height > MAX) {
          const ratio = Math.min(MAX / width, MAX / height)
          width  = Math.round(width  * ratio)
          height = Math.round(height * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75)
        URL.revokeObjectURL(url)
        if (dataUrl.length > 900000) {
          // Plus de 900KB → re-compresser à qualité plus basse
          const dataUrl2 = canvas.toDataURL('image/jpeg', 0.55)
          resolve(dataUrl2)
        } else {
          resolve(dataUrl)
        }
      } catch (e) {
        URL.revokeObjectURL(url)
        reject(e)
      }
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')) }
    img.src = url
  })
}


// ════════════════════════════════════════════════════════════════════
// TALKIE-WALKIE (v7 palier 2) — base64 dans Firestore, pas de Storage
// ════════════════════════════════════════════════════════════════════

const walkieFloorRef = (evId) => doc(db, 'events', evId || getEventId(), 'walkie-state', 'floor')
const walkieChunksRef = (evId) => collection(db, 'events', evId || getEventId(), 'walkie-chunks')

// Tenter de prendre le floor (push-to-talk).
// Renvoie {ok: true, sessionId} si pris, {ok: false, holder} si déjà occupé.
export const requestWalkieFloor = async (uid, nom, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement actif')
  const ref = walkieFloorRef(eventId)
  const sessionId = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  try {
    return await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref)
      const now  = Date.now()
      const data = snap.exists() ? snap.data() : null
      // Si quelqu'un parle ET son heartbeat < 3s, on est refusé
      if (data && data.holder && data.holder.uid && data.holder.uid !== uid) {
        const last = data.heartbeat?.toMillis ? data.heartbeat.toMillis() : 0
        if ((now - last) < 3000) {
          return { ok: false, holder: data.holder }
        }
      }
      const { setDoc } = await import('firebase/firestore')
      txn.set(ref, {
        holder: { uid, nom },
        sessionId,
        startedAt: serverTimestamp(),
        heartbeat: serverTimestamp(),
      })
      return { ok: true, sessionId }
    })
  } catch (e) {
    console.warn('requestWalkieFloor error:', e)
    return { ok: false, error: e.message }
  }
}

// Heartbeat pendant qu'on parle (toutes les ~1s)
export const heartbeatWalkieFloor = async (uid, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) return
  const ref = walkieFloorRef(eventId)
  try {
    const snap = await getDoc(ref)
    if (snap.exists() && snap.data().holder?.uid === uid) {
      await updateDoc(ref, { heartbeat: serverTimestamp() })
    }
  } catch {}
}

// Libérer le floor
export const releaseWalkieFloor = async (uid, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) return
  const ref = walkieFloorRef(eventId)
  try {
    const snap = await getDoc(ref)
    if (snap.exists() && snap.data().holder?.uid === uid) {
      const { setDoc } = await import('firebase/firestore')
      await setDoc(ref, { holder: null, sessionId: null, endedAt: serverTimestamp() })
    }
  } catch (e) { console.warn('releaseWalkieFloor error:', e) }
}

// Écouter qui détient le floor (qui parle)
export const watchWalkieFloor = (callback, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) return () => {}
  return onSnapshot(walkieFloorRef(eventId), snap => {
    if (!snap.exists()) { callback(null); return }
    const data = snap.data()
    if (!data.holder || !data.holder.uid) { callback(null); return }
    // Vérifier que le heartbeat est récent
    const now = Date.now()
    const last = data.heartbeat?.toMillis ? data.heartbeat.toMillis() : 0
    if ((now - last) > 4000) {
      // Heartbeat stale → considérer floor libre
      callback(null)
      return
    }
    callback({ holder: data.holder, sessionId: data.sessionId })
  }, err => console.warn('watchWalkieFloor error:', err))
}

// Envoyer un chunk audio (base64)
export const sendWalkieChunk = async (sessionId, seq, base64Audio, uid, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) return
  try {
    await addDoc(walkieChunksRef(eventId), {
      sessionId,
      seq,
      data: base64Audio,
      author: uid,
      createdAt: serverTimestamp(),
      timestamp: Date.now(),
    })
  } catch (e) { console.warn('sendWalkieChunk error:', e) }
}

// Écouter les chunks audio (limité aux 50 derniers, filtré par sessionId à l'usage)
export const watchWalkieChunks = (callback, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) return () => {}
  // On récupère les 30 derniers chunks (suffisant pour une transmission de ~24s à 800ms/chunk)
  const q = query(walkieChunksRef(eventId), orderBy('createdAt', 'desc'), limit(30))
  return onSnapshot(q, snap => {
    const chunks = snap.docs.map(d => ({ ...d.data(), id: d.id }))
    chunks.reverse() // ordre chronologique
    callback(chunks)
  }, err => console.warn('watchWalkieChunks error:', err))
}

// Purge des chunks > 2 minutes (appelée occasionnellement)
export const purgeOldWalkieChunks = async (evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) return
  try {
    const cutoff = Date.now() - 2 * 60 * 1000
    const { getDocs, deleteDoc } = await import('firebase/firestore')
    const q = query(walkieChunksRef(eventId), where('timestamp', '<', cutoff), limit(50))
    const snap = await getDocs(q)
    if (snap.empty) return
    const promises = snap.docs.map(d => deleteDoc(doc(db, 'events', eventId, 'walkie-chunks', d.id)).catch(() => {}))
    await Promise.all(promises)
  } catch (e) { console.warn('purgeOldWalkieChunks error:', e) }
}

/* ════════════════════════════════════════════════════════════════
   PLANNING BÉNÉVOLES — collections shifts (créneaux) et posts (postes)
   ════════════════════════════════════════════════════════════════

   Structure :
   events/{evId}/volunteer-posts/{postId}  → { nom, emoji, couleur, ordre }
   events/{evId}/volunteer-shifts/{shiftId} → {
     date: 'YYYY-MM-DD',
     label: 'Midi' | 'Soir' | etc.,
     debut: 'HH:MM',
     fin:   'HH:MM',
     // Affectations : { postId: { target: N, assignments: [benevoleId, ...] } }
     // Plus benevolesLibres: [benevoleId, ...] pour ceux qui sont là sans poste fixe
     postes: { [postId]: { target: 3, assignments: ['benev1','benev2'] } },
     libres: ['benev3'],
     // Auto-inscriptions en attente (Niveau 4) :
     pending: ['benev4'],
   }
*/

// ── Postes (Bar, Caisse, Accueil, etc.) ───────────────────────────
export const watchVolunteerPosts = (cb, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) { cb([]); return () => {} }
  return onSnapshot(collection(db, 'events', eventId, 'volunteer-posts'), (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99))
    cb(list)
  }, () => cb([]))
}
export const addVolunteerPost = (post, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) return Promise.reject(new Error('Aucun événement courant'))
  return addDoc(collection(db, 'events', eventId, 'volunteer-posts'), {
    nom: post.nom || 'Poste',
    emoji: post.emoji || '🎯',
    couleur: post.couleur || '#009090',
    ordre: post.ordre ?? Date.now(),
    createdAt: serverTimestamp(),
  })
}
export const updateVolunteerPost = (id, patch, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) return Promise.reject(new Error('Aucun événement courant'))
  return updateDoc(doc(db, 'events', eventId, 'volunteer-posts', id), patch)
}
export const deleteVolunteerPost = (id, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) return Promise.reject(new Error('Aucun événement courant'))
  return deleteDoc(doc(db, 'events', eventId, 'volunteer-posts', id))
}

// ── Shifts (créneaux : jour + plage horaire) ──────────────────────
export const watchVolunteerShifts = (cb, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) { cb([]); return () => {} }
  return onSnapshot(collection(db, 'events', eventId, 'volunteer-shifts'), (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        // Tri par date puis heure début
        const ka = (a.date || '') + ' ' + (a.debut || '')
        const kb = (b.date || '') + ' ' + (b.debut || '')
        return ka.localeCompare(kb)
      })
    cb(list)
  }, () => cb([]))
}
export const addVolunteerShift = (shift, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) return Promise.reject(new Error('Aucun événement courant'))
  return addDoc(collection(db, 'events', eventId, 'volunteer-shifts'), {
    date: shift.date,
    label: shift.label || '',
    debut: shift.debut || '',
    fin: shift.fin || '',
    postes: shift.postes || {},   // { postId: { target, assignments: [] } }
    libres: shift.libres || [],
    pending: shift.pending || [],
    createdAt: serverTimestamp(),
  })
}
export const updateVolunteerShift = (id, patch, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) return Promise.reject(new Error('Aucun événement courant'))
  return updateDoc(doc(db, 'events', eventId, 'volunteer-shifts', id), patch)
}
export const deleteVolunteerShift = (id, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) return Promise.reject(new Error('Aucun événement courant'))
  return deleteDoc(doc(db, 'events', eventId, 'volunteer-shifts', id))
}

// Affecter un bénévole à un poste sur un shift (transaction pour éviter conflits)
export const assignBenevoleToPost = async (shiftId, benevoleId, postId, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement courant')
  const ref = doc(db, 'events', eventId, 'volunteer-shifts', shiftId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Créneau introuvable')
    const data = snap.data()
    const postes = { ...(data.postes || {}) }
    // Retirer le bénévole de tous les autres postes ET de libres ET pending (un bénévole = un seul slot par shift)
    Object.keys(postes).forEach(pid => {
      const p = postes[pid] || {}
      const assigns = (p.assignments || []).filter(id => id !== benevoleId)
      postes[pid] = { ...p, assignments: assigns }
    })
    const libres = (data.libres || []).filter(id => id !== benevoleId)
    const pending = (data.pending || []).filter(id => id !== benevoleId)
    // Ajouter au poste demandé
    if (postId === '__free__') {
      libres.push(benevoleId)
    } else if (postId && postId !== '__remove__') {
      const target = postes[postId]?.target ?? 1
      const existing = postes[postId]?.assignments || []
      postes[postId] = { target, assignments: [...existing, benevoleId] }
    }
    tx.update(ref, { postes, libres, pending })
  })
}
