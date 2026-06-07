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
  collection, doc, getDoc, getDocs, addDoc, updateDoc, setDoc,
  deleteDoc, query, where, orderBy, limit, onSnapshot,
  serverTimestamp, increment, runTransaction, writeBatch,
  arrayUnion} from 'firebase/firestore'
import { db }        from './config'
import { nowStr, uid } from '../utils/helpers'

const SEUIL_STOCK = 10

// ── Lecture de l'eventId — TOUJOURS depuis le localStorage ──────────
// Synchrone, fiable, pas de race condition
const getEventId = () => {
  try {
    // 1. Lire depuis le store Zustand en mémoire (le plus fiable)
    const storeId = window.__yllatok_stores__?.eventStore?.getState?.()?.currentEventId
    if (storeId) return storeId

    // 2. Fallback : lire depuis le localStorage
    const raw = localStorage.getItem('yllatok-event')
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
    const authStore   = window.__yllatok_stores__?.authStore
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
  const eventId = getEventId()
  try {
    await addDoc(collection(db, 'events', eventId, 'notifications'), {
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

  // ── Vraie push FCM (en plus de la notif Firestore) ────────────────
  // On envoie en best-effort : si ça échoue, la notif Firestore reste,
  // elle sera vue par les clients ouverts au moins.
  try {
    // Récupère les tokens FCM de tout le staff de l'événement (sauf exclu)
    const staffSnap = await getDocs(collection(db, 'events', eventId, 'staff'))
    const tokens = []
    staffSnap.forEach(d => {
      if (extra.excludeStaffId && d.id === extra.excludeStaffId) return
      const arr = d.data().fcmTokens || []
      arr.forEach(t => t && tokens.push(t))
    })
    if (tokens.length === 0) return

    // Appel au backend Vercel
    await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokens,
        title: titre,
        body:  message,
        eventId,
        tag:   type || 'yllacash',
        data: {
          type:    type || '',
          specId:  extra.specId || '',
          resaId:  extra.resaId || '',
          url:     extra.url || '/',
        },
      }),
    }).catch(() => {})
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
  const solde = Math.round((parseFloat(soldeEuros) || 0) * 100)
  const eventId = getEventId()
  await addDoc(collection(db, 'events', eventId, 'spectateurs'), { id, nom, solde, avatar: null, createdAt: serverTimestamp() })
  if (solde > 0) {
    // Bug fix v8 debug : la recharge initiale doit être dans events/{id}/transactions
    // (pas dans /transactions racine, qui ne serait pas comptée dans les stats de l'événement)
    await addDoc(collection(db, 'events', eventId, 'transactions'), {
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
  // Limite à 5000 transactions récentes pour le store temps réel.
  // Note : le rapport de clôture charge l'intégralité des transactions
  // directement depuis Firestore (lecture ponctuelle), il ne dépend pas
  // de cette limite. Voir useRapportCloture.js.
  onSnapshot(query(collection(db, 'events', evId || getEventId(), 'transactions'), orderBy('createdAt', 'desc'), limit(5000)), snap =>
    callback(snap.docs.map(d => ({ ...d.data(), _docId: d.id })))
  )

// ════════════════════════════════════════════════════════════════════
// CRÉDITER
// ════════════════════════════════════════════════════════════════════

export const crediter = async (specId, montantEuros, staffNom = 'Billetterie', evId = null) => {
  // Math.round évite les artefacts flottants (ex: 12.10 * 100 = 1209.9999...)
  const pts  = Math.round((parseFloat(montantEuros) || 0) * 100)
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

export const debiter = async (specId, items, staffNom = 'Stand', evId = null) => {
  const total = items.reduce((a, i) => a + i.prix * i.qty, 0)
  const label = items.map(i => i.nom + (i.qty > 1 ? ` ×${i.qty}` : '')).join(', ')
  const eid = evId || getEventId()
  const snap  = await getDocs(query(collection(db, 'events', eid, 'spectateurs'), where('id', '==', specId)))
  if (snap.empty) throw new Error('Spectateur introuvable')
  const specRef = snap.docs[0].ref

  await runTransaction(db, async (txn) => {
    const specDoc     = await txn.get(specRef)
    const soldeBefore = specDoc.data().solde || 0
    if (soldeBefore < total) throw new Error('Solde insuffisant')
    const soldeAfter = soldeBefore - total
    await decrementStocks(txn, items)
    txn.update(specRef, { solde: increment(-total) })
    const now = new Date()
    txn.set(doc(collection(db, 'events', eid, 'transactions')), {
      specId, specNom: specDoc.data().nom || '—', type: 'debit', label,
      items: items.map(i => ({ nom: i.nom, qty: i.qty, prixUnit: i.prix, total: i.prix * i.qty })),
      montant: total, staff: staffNom, soldeBefore, soldeAfter,
      date: nowStr(), timestamp: now.toISOString(),
      heure: now.toLocaleTimeString('fr-FR'), createdAt: serverTimestamp(),
    })
  })
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

let _resaCounter = 100
const nextResaCode = (specId) => {
  _resaCounter++
  return specId.replace('FY-', '') + '-' + String(_resaCounter).padStart(2, '0')
}

export const creerReservation = async (specId, specNom, items) => {
  const total = items.reduce((a, i) => a + i.prix * i.qty, 0)
  const eventId = getEventId()
  const snap  = await getDocs(query(collection(db, 'events', eventId, 'spectateurs'), where('id', '==', specId)))
  if (snap.empty) throw new Error('Spectateur introuvable')
  if (snap.docs[0].data().solde < total) throw new Error('Solde insuffisant')

  const code = nextResaCode(specId)
  // Attribution d'un numéro court séquentiel (compteur unifié avec les commandes)
  // pour affichage en cuisine. Voir getNextCommandeNumero() pour la logique de reset jour.
  const numero = await getNextCommandeNumero(eventId)
  // Création directement en 'processing' (= "pris en charge automatiquement")
  // pour que la cuisine la voie tout de suite, sans étape "Prendre en charge" préalable.
  const resa = {
    specId, specNom, items, total,
    status: 'processing',
    code, numero,
    assignedStaffId: '__auto__',
    assignedStaff: 'Auto (spectateur)',
    date: nowStr(),
    createdAt: serverTimestamp(),
    processingAt: serverTimestamp(),
  }

  let resaDocId
  await runTransaction(db, async (txn) => {
    await decrementStocks(txn, items)
    const ref = doc(resaCol())
    resaDocId = ref.id
    txn.set(ref, resa)
  })

  await addDoc(collection(db, 'events', eventId, 'transactions'), {
    specId, specNom, type: 'reservation',
    label: `Résa #${numero} (${code}): ` + items.map(i => i.nom + (i.qty > 1 ? ` ×${i.qty}` : '')).join(', '),
    montant: total, staff: '—', resaId: resaDocId,
    date: nowStr(), timestamp: new Date().toISOString(), createdAt: serverTimestamp(),
  })
  await audit('RESERVATION', { specId, specNom, montant: total, label: `Résa #${numero} (${code})` })
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
  // Accepte 'processing' (nouveau workflow) ET 'pending' (rétrocompat avec les
  // réservations créées avant la mise en place du flux unifié résa+commande).
  if (!['processing', 'pending'].includes(resa.status)) {
    throw new Error('La réservation doit être en préparation')
  }
  // Pour les anciennes résas (status 'pending', pas d'assignedStaffId), on autorise tout staff
  // car elles n'ont jamais été assignées.
  const hasAssignment = resa.assignedStaffId && resa.assignedStaffId !== '__auto__'
  if (!isAdmin && hasAssignment && resa.assignedStaffId !== staffId) {
    throw new Error('Seul le staff assigné peut marquer cette commande comme prête')
  }
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
  // Rembourser le stock menu — UNIQUEMENT pour les articles qui existent
  // encore dans le menu. Pour les vieilles résas (jours/semaines), certains
  // articles ont pu être supprimés entre-temps. Sans cette vérification,
  // batch.update planterait avec "No document to update" et bloquerait toute
  // la procédure d'annulation (remboursement quota, transaction, audit, notif).
  //
  // On lit d'abord chaque doc menu en parallèle, puis on n'ajoute au batch
  // que ceux qui existent. Coût Firestore : N lectures supplémentaires, mais
  // c'est marginal et la robustesse vaut largement ça.
  const itemsWithIds = (resa.items||[]).filter(it => it.id)
  if (itemsWithIds.length > 0) {
    const menuChecks = await Promise.all(
      itemsWithIds.map(it => getDoc(doc(db, 'events', getEventId(), 'menu', it.id)))
    )
    menuChecks.forEach((menuSnap, idx) => {
      if (menuSnap.exists()) {
        const it = itemsWithIds[idx]
        batch.update(doc(db, 'events', getEventId(), 'menu', it.id), {
          stock: increment(it.qty || 1),
        })
      }
      // Si l'article n'existe plus dans le menu, on ne fait rien — c'est OK,
      // l'annulation se poursuit sans remboursement de stock pour cet item.
    })
  }
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
  // Supprime la photo associée si présente pour éviter les orphelins Storage
  try {
    const snap = await getDoc(doc(db, 'events', getEventId(), 'menu', id))
    const photoPath = snap.exists() ? snap.data()?.photoPath : null
    if (photoPath) {
      const { ref: sref, deleteObject } = await import('firebase/storage')
      const { storage } = await import('./config')
      try { await deleteObject(sref(storage, photoPath)) } catch {}
    }
  } catch {}
  await deleteDoc(doc(db, 'events', getEventId(), 'menu', id))
}

// ════════════════════════════════════════════════════════════════════
// MENU — Photos d'articles (Lot Image 1)
// ════════════════════════════════════════════════════════════════════
// Upload/remplacement d'une photo d'article. Stockage Firebase Storage.
// Le document menu porte photoUrl (URL publique) + photoPath (chemin Storage).
// Le client est responsable de redimensionner l'image avant upload (cf.
// utils/imageUtils.js déjà utilisé pour le logo) pour éviter de stocker
// des photos pro de 5–10 Mo qui ralentiraient le rendu de la borne.

export const uploadMenuItemPhoto = async (itemId, file, onProgress = null, evId = null) => {
  const { ref: sref, uploadBytesResumable, getDownloadURL, deleteObject } = await import('firebase/storage')
  const { storage } = await import('./config')
  const eid = evId || getEventId()
  if (!eid || !itemId) throw new Error('Paramètres invalides')
  if (!file) throw new Error('Aucun fichier sélectionné')
  if (!file.type || !file.type.startsWith('image/')) throw new Error('Seules les images sont acceptées')
  if (file.size > 5 * 1024 * 1024) throw new Error('Image trop volumineuse (max 5 Mo)')

  // Récupérer l'ancienne photo pour la supprimer après upload réussi
  let oldPath = null
  try {
    const snap = await getDoc(doc(db, 'events', eid, 'menu', itemId))
    oldPath = snap.exists() ? (snap.data()?.photoPath || null) : null
  } catch {}

  const safeName = file.name.replace(/[^\w.\-]+/g, '_')
  const path = `events/${eid}/menu/${itemId}/${Date.now()}-${safeName}`
  const fileRef = sref(storage, path)

  const url = await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(fileRef, file)
    task.on('state_changed',
      (snap) => {
        if (onProgress) onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100))
      },
      (err) => reject(err),
      async () => {
        try { resolve(await getDownloadURL(task.snapshot.ref)) }
        catch (e) { reject(e) }
      }
    )
  })

  // Mettre à jour le document menu avec les nouvelles infos photo
  await updateDoc(doc(db, 'events', eid, 'menu', itemId), {
    photoUrl: url,
    photoPath: path,
  })

  // Nettoyer l'ancienne photo en best-effort (échec non bloquant)
  if (oldPath && oldPath !== path) {
    try { await deleteObject(sref(storage, oldPath)) } catch {}
  }

  await audit('MODIF_ARTICLE', {
    articleId: itemId, userType: 'admin',
    label: `Photo ajoutée à l'article #${itemId} (${(file.size / 1024).toFixed(0)} Ko)`,
  })
  return { url, path }
}

export const deleteMenuItemPhoto = async (itemId, evId = null) => {
  const { ref: sref, deleteObject } = await import('firebase/storage')
  const { storage } = await import('./config')
  const eid = evId || getEventId()
  if (!eid || !itemId) throw new Error('Paramètres invalides')

  // Récupérer le chemin actuel
  const itemRef = doc(db, 'events', eid, 'menu', itemId)
  const snap = await getDoc(itemRef)
  if (!snap.exists()) throw new Error('Article introuvable')
  const path = snap.data()?.photoPath
  if (!path) return // déjà pas de photo

  try { await deleteObject(sref(storage, path)) }
  catch (e) { console.warn('deleteMenuItemPhoto storage:', e.message) }

  await updateDoc(itemRef, { photoUrl: null, photoPath: null })
  await audit('MODIF_ARTICLE', {
    articleId: itemId, userType: 'admin',
    label: `Photo retirée de l'article #${itemId}`,
  })
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
  // Crée les rappels automatiques (balance et/ou prestation)
  try { await upsertCreneauReminders(ref.id, data) } catch (e) { console.warn('Reminder creation failed', e.message) }
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

  // Détection séparée des changements de balance pour un message dédié
  const balanceChanged = !!prev && (
    (data.balanceDebut !== undefined && toMs(data.balanceDebut) !== toMs(prev.balanceDebut)) ||
    (data.balanceFin   !== undefined && toMs(data.balanceFin)   !== toMs(prev.balanceFin))   ||
    (data.balanceScene !== undefined && (data.balanceScene || '') !== (prev.balanceScene || ''))
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

  // 2 bis. Balance changée → notif dédiée à l'artiste (message plus précis)
  if (balanceChanged && !creneauChanged) {
    // Construit un message contextuel selon ce qui a changé
    const balanceAjoutee = !prev?.balanceDebut && data.balanceDebut
    const balanceSupprimee = prev?.balanceDebut && data.balanceDebut === null
    let titre, message
    if (balanceAjoutee) {
      titre = '🎤 Une balance a été ajoutée à votre créneau'
      message = `L'horaire de votre balance technique a été défini. Consultez votre espace.`
    } else if (balanceSupprimee) {
      titre = '🎤 Votre balance a été annulée'
      message = `L'horaire de balance de votre créneau a été retiré.`
    } else {
      titre = '🎤 Votre horaire de balance a changé'
      message = `Les horaires ou le lieu de votre balance ont été modifiés. Consultez votre espace.`
    }
    await addDoc(notifCol, {
      type: 'BALANCE_MODIF_MOI',
      titre,
      message,
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

  // 4. Recalcule les rappels du créneau (les anciens sont supprimés, les nouveaux créés)
  //    Important : on prend les données fusionnées (anciennes + nouvelles) car
  //    data ne contient que les champs modifiés
  try {
    const mergedData = { ...prev, ...data }
    await upsertCreneauReminders(id, mergedData)
  } catch (e) {
    console.warn('Reminder update failed', e.message)
  }
}

export const deleteCreneau = async (id) => {
  // Supprime aussi les rappels associés
  try { await deleteCreneauReminders(id) } catch {}
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

// ═══════════════════════════════════════════════════════════════════════
// RAPPELS PLANIFIÉS (balance + prestation artistes) — v8 debug
// ═══════════════════════════════════════════════════════════════════════
//
// Système hybride :
//   1. Côté client (EspaceArtiste) : timers JS pour bip + popup quand app ouverte
//   2. Côté serveur : GitHub Actions ping /api/process-reminders chaque minute
//      → envoie les push FCM des rappels dus (app fermée)
//
// Stockage : events/{eventId}/scheduled-reminders/{id}
//   { creneauId, artiste, type: 'balance-15'|'balance-5'|'show-15'|'show-5',
//     dueAt: ISO string, sent: bool, sentAt: ISO|null }
//
// Quand un créneau est ajouté/modifié, on (re)calcule ses 4 rappels max
// (balance -15/-5, show -15/-5) et on remplace ses entrées existantes.

const reminderTypes = [
  { type: 'balance-15', minutesBefore: 15, source: 'balanceDebut', title: 'Balance dans 15 min',  pos: '⏰' },
  { type: 'balance-5',  minutesBefore: 5,  source: 'balanceDebut', title: 'Balance dans 5 min',   pos: '⚠️' },
  { type: 'show-15',    minutesBefore: 15, source: 'debut',        title: 'Prestation dans 15 min', pos: '⏰' },
  { type: 'show-5',     minutesBefore: 5,  source: 'debut',        title: 'Prestation dans 5 min',  pos: '🔥' },
]

/**
 * (Re)calcule les 4 rappels d'un créneau et les écrit dans Firestore.
 * Appelé après chaque add/update de créneau.
 */
export const upsertCreneauReminders = async (creneauId, creneauData, evId = null) => {
  const eid = evId || getEventId()
  const remindersRef = collection(db, 'events', eid, 'scheduled-reminders')

  // 1. Supprime les rappels existants de ce créneau (re-création propre)
  try {
    const existing = await getDocs(query(remindersRef, where('creneauId', '==', creneauId)))
    await Promise.all(existing.docs.map(d => deleteDoc(d.ref)))
  } catch (e) {
    console.warn('upsertCreneauReminders: cleanup failed', e.message)
  }

  // 2. Calcule les nouveaux rappels (seulement ceux dans le futur)
  const now = Date.now()
  const toCreate = []
  for (const rt of reminderTypes) {
    const sourceTime = creneauData[rt.source]
    if (!sourceTime) continue // pas de balance définie → on skip
    const t = new Date(sourceTime).getTime()
    if (isNaN(t)) continue
    const dueAt = t - rt.minutesBefore * 60_000
    if (dueAt <= now) continue // déjà passé, inutile de planifier
    toCreate.push({
      creneauId,
      artiste:    creneauData.artiste || '—',
      artisteId:  creneauData.artisteId || null,
      type:       rt.type,
      title:      rt.title,
      icon:       rt.pos,
      scene:      rt.source === 'balanceDebut' ? (creneauData.balanceScene || creneauData.scene || '') : (creneauData.scene || ''),
      sourceTime: new Date(sourceTime).toISOString(),
      dueAt:      new Date(dueAt).toISOString(),
      sent:       false,
      sentAt:     null,
      createdAt:  serverTimestamp(),
    })
  }
  await Promise.all(toCreate.map(r => addDoc(remindersRef, r)))
  return toCreate.length
}

/**
 * Supprime tous les rappels d'un créneau (à appeler si le créneau est supprimé).
 */
export const deleteCreneauReminders = async (creneauId, evId = null) => {
  const eid = evId || getEventId()
  try {
    const snap = await getDocs(query(
      collection(db, 'events', eid, 'scheduled-reminders'),
      where('creneauId', '==', creneauId),
    ))
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
  } catch (e) {
    console.warn('deleteCreneauReminders failed', e.message)
  }
}

/**
 * Écoute les rappels actifs d'un artiste donné (pour les timers JS dans l'app).
 * Renvoie tous les rappels non envoyés où dueAt > maintenant - 1h (filet large).
 */
export const watchArtistReminders = (artisteId, callback, evId = null) => {
  const eid = evId || getEventId()
  if (!artisteId) return () => {}
  return onSnapshot(
    query(
      collection(db, 'events', eid, 'scheduled-reminders'),
      where('artisteId', '==', artisteId),
    ),
    snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
  )
}

// ═══════════════════════════════════════════════════════════════════════
// CACHETS ARTISTES — v8 debug
// ═══════════════════════════════════════════════════════════════════════
//
// Collection : events/{eventId}/cachets/{cachetId}
//
// Document type :
// {
//   creneauId, artiste, montant, modePaiement: 'especes'|'virement'|'cheque',
//   type: 'cachet'|'acompte'|'solde'|'frais',
//   statut: 'planifie'|'paye'|'annule',
//   reference, notes,
//   signature, signedAt, signedBy, signedNom,  // pour décharges espèces
//   numeroDecharge,                            // auto-incrémenté par événement
//   transactionId,                             // ID de la transaction caisse créée (auto-débit)
//   createdBy, createdAt, updatedAt,
// }

export const watchCachets = (callback, evId = null) => {
  const eid = evId || getEventId()
  return onSnapshot(
    query(collection(db, 'events', eid, 'cachets'), orderBy('createdAt', 'desc')),
    snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  )
}

export const watchCachetsByCreneau = (creneauId, callback, evId = null) => {
  const eid = evId || getEventId()
  if (!creneauId) return () => {}
  return onSnapshot(
    query(collection(db, 'events', eid, 'cachets'), where('creneauId', '==', creneauId)),
    snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  )
}

// Génère les initiales d'un nom d'artiste pour la nomenclature de décharge.
// Ex: "Marie Dubois" → "MDU", "Jean Martin Quartet" → "JMQ", "DJ Mystic" → "DJM"
// Retire les accents, garde uniquement A-Z, max 3 caractères.
const initialesArtiste = (nom) => {
  if (!nom) return 'ART'
  // Retire les accents (NFD = normalisation décomposée)
  const sansAccents = nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const mots = sansAccents.trim().split(/\s+/).filter(Boolean)
  if (mots.length === 0) return 'ART'
  let initiales = ''
  if (mots.length === 1) {
    // 1 mot → on prend les 3 premières lettres
    initiales = mots[0].slice(0, 3)
  } else if (mots.length === 2) {
    // 2 mots → initiale du 1er + 2 premières du 2e (ex: Marie Dubois → MDU)
    initiales = mots[0][0] + mots[1].slice(0, 2)
  } else {
    // 3 mots ou + → initiales des 3 premiers (ex: Jean Martin Quartet → JMQ)
    initiales = mots[0][0] + mots[1][0] + mots[2][0]
  }
  // Garde uniquement les caractères alphanumériques, en majuscules
  return initiales.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'ART'
}

// Numéro de décharge auto-incrémenté par événement.
// Format : ANNEE-INI-XXXXX où INI = initiales artiste, XXXXX = compteur global
// croissant par année (5 chiffres avec padding zéros).
// Exemples : 2026-MDU-00001, 2026-JMQ-00002, 2026-MDU-00003
const getNextDechargeNumber = async (eventId, artisteName = '') => {
  const year = new Date().getFullYear()
  const ini = initialesArtiste(artisteName)
  // Récupère TOUS les cachets de l'année pour calculer le compteur global
  // (peu importe l'artiste, le numéro est unique par année)
  const snap = await getDocs(query(
    collection(db, 'events', eventId, 'cachets'),
    where('numeroDecharge', '>=', `${year}-`),
    where('numeroDecharge', '<', `${year + 1}-`),
  ))
  let maxNum = 0
  snap.docs.forEach(d => {
    const num = d.data().numeroDecharge
    if (!num) return
    // Format peut être ancien (2026-001) ou nouveau (2026-MDU-00001)
    // Dans tous les cas, le dernier segment est le compteur numérique
    const parts = num.split('-')
    const lastPart = parts[parts.length - 1]
    const n = parseInt(lastPart, 10)
    if (!isNaN(n) && n > maxNum) maxNum = n
  })
  const next = (maxNum + 1).toString().padStart(5, '0')
  return `${year}-${ini}-${next}`
}

export const addCachet = async (data, currentUser = null) => {
  const eid = getEventId()
  // creneauId peut être null = cachet "hors planning" saisi manuellement.
  // Dans ce cas, le nom de l'artiste est saisi librement par l'admin.
  const ref = await addDoc(collection(db, 'events', eid, 'cachets'), {
    creneauId:    data.creneauId || null,
    artiste:      data.artiste || '',
    // Pour les cachets manuels (sans créneau), on peut spécifier une date
    // de prestation (sinon on prendra updatedAt comme référence).
    dateManuelle: data.dateManuelle || null,
    montant:      Number(data.montant) || 0,
    modePaiement: data.modePaiement || 'especes',
    type:         data.type || 'cachet',
    statut:       data.statut || 'planifie',
    reference:    data.reference || '',
    notes:        data.notes || '',          // = commentaires côté UI
    documents:    [],                         // preuves de paiement (Étape B)
    signature:    null,
    signedAt:     null,
    signedBy:     null,
    signedNom:    null,
    numeroDecharge: null,
    transactionId:  null,
    createdBy:    currentUser?.id || null,
    createdByNom: currentUser?.nom || null,
    createdAt:    serverTimestamp(),
    updatedAt:    serverTimestamp(),
  })
  return ref.id
}

export const updateCachet = async (id, data) => {
  const eid = getEventId()
  await updateDoc(doc(db, 'events', eid, 'cachets', id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export const deleteCachet = async (id) => {
  const eid = getEventId()
  // Si une transaction de débit existait, on devrait idéalement la créditer en compensation.
  // Pour l'instant on supprime simplement le cachet (l'admin peut annuler la tx manuellement).
  await deleteDoc(doc(db, 'events', eid, 'cachets', id))
}

/**
 * Marque un cachet comme payé. Si mode = espèces :
 *   - Génère un numéro de décharge (à utiliser lors de la signature ultérieure)
 *   - Auto-crée une transaction de débit dans la caisse événement
 * Si signature fournie : la stocke également (data URI PNG).
 */
export const marquerCachetPaye = async (id, options = {}) => {
  const eid = getEventId()
  const cachetRef = doc(db, 'events', eid, 'cachets', id)
  const snap = await getDoc(cachetRef)
  if (!snap.exists()) throw new Error('Cachet introuvable')
  const cachet = snap.data()
  if (cachet.statut === 'paye') return // déjà payé, idempotent

  const update = {
    statut: 'paye',
    paidAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  // Numéro de décharge (pour traçabilité) — généré pour tous les modes
  // Format : ANNEE-INITIALES-XXXXX (ex: 2026-MDU-00001)
  if (!cachet.numeroDecharge) {
    update.numeroDecharge = await getNextDechargeNumber(eid, cachet.artiste)
  }

  // Si signature fournie (cas espèces avec signature tactile)
  if (options.signature) {
    update.signature = options.signature
    update.signedAt  = serverTimestamp()
    update.signedBy  = options.signedBy || cachet.artiste
    update.signedNom = options.signedNom || cachet.artiste
  }

  // Si paiement en espèces → auto-débit dans la caisse événement
  // (transaction négative pour le suivi trésorerie)
  if (cachet.modePaiement === 'especes' && !cachet.transactionId) {
    try {
      const txRef = await addDoc(collection(db, 'events', eid, 'transactions'), {
        type:    'cachet-artiste',
        montant: -Math.abs(Number(cachet.montant) || 0),
        commentaire: `Cachet artiste · ${cachet.artiste || 'Inconnu'}${cachet.type !== 'cachet' ? ' (' + cachet.type + ')' : ''}`,
        cachetId: id,
        creneauId: cachet.creneauId || null,
        statut: 'validee',
        createdAt: serverTimestamp(),
      })
      update.transactionId = txRef.id
    } catch (e) {
      console.warn('Auto-débit cachet failed:', e.message)
    }
  }

  await updateDoc(cachetRef, update)
}

/**
 * Annule un cachet (statut = annule). Si une transaction caisse existait,
 * elle reste mais est marquée annulée pour l'historique.
 */
export const annulerCachet = async (id) => {
  const eid = getEventId()
  const cachetRef = doc(db, 'events', eid, 'cachets', id)
  const snap = await getDoc(cachetRef)
  if (!snap.exists()) return
  const cachet = snap.data()
  // Annule aussi la transaction caisse si elle existe (compensation)
  if (cachet.transactionId) {
    try {
      const txRef = doc(db, 'events', eid, 'transactions', cachet.transactionId)
      await updateDoc(txRef, {
        statut: 'annulee',
        annuleeAt: serverTimestamp(),
      })
    } catch {}
  }
  await updateDoc(cachetRef, {
    statut: 'annule',
    updatedAt: serverTimestamp(),
  })
}

// ════════════════════════════════════════════════════════════════════
// COMMANDES AU STAND (Lot 1)
// ════════════════════════════════════════════════════════════════════
// Système de prise de commande rapide au comptoir avec ticket numéroté.
// Cycle de vie : pending → ready → collected (ou cancelled à tout moment).
// Le débit du compte client peut être immédiat (à la prise) ou différé
// (au retrait), au choix du staff.
//
// Structure Firestore :
//   - Commandes :  events/{eventId}/commandes/{docId}
//   - Compteurs : events/{eventId}/_counters/commandes-{YYYY-MM-DD}
//
// Le compteur est lu/incrémenté dans une transaction atomique pour éviter
// les doublons même si plusieurs staffs valident en simultané. Le numéro
// repart à 1 chaque jour automatiquement (clé du compteur change).
// ════════════════════════════════════════════════════════════════════

// Format YYYY-MM-DD pour la clé du compteur
const _dateKey = (date = new Date()) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Récupère le prochain numéro de commande pour aujourd'hui.
 * Lit/incrémente le compteur dans une transaction atomique.
 * Le numéro repart à 1 chaque jour (la clé du compteur change).
 *
 * @param {string|null} evId - ID de l'événement (utilise getEventId() si null)
 * @returns {Promise<number>} - Le numéro à attribuer à la prochaine commande
 */
export const getNextCommandeNumero = async (evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement courant')
  const dayKey = _dateKey()
  const counterRef = doc(db, 'events', eventId, '_counters', `commandes-${dayKey}`)

  // Transaction atomique : lit, incrémente, écrit en une seule opération
  return await runTransaction(db, async (txn) => {
    const counterDoc = await txn.get(counterRef)
    if (!counterDoc.exists()) {
      // Premier numéro du jour
      txn.set(counterRef, { date: dayKey, next: 2 })
      return 1
    }
    const current = counterDoc.data().next || 1
    txn.update(counterRef, { next: current + 1 })
    return current
  })
}

/**
 * Crée une nouvelle commande au stand.
 *
 * @param {object} params
 * @param {string} params.specId       - ID du spectateur (FY-XXXX)
 * @param {string} params.specNom      - Nom du spectateur (snapshot)
 * @param {Array}  params.items        - Articles [{ id, nom, qty, prixUnit }] (prixUnit en centimes)
 * @param {boolean} params.payNow      - true = débite immédiatement, false = débit différé au retrait
 * @param {string} params.staff        - Nom du staff qui prend la commande
 * @param {string|null} evId           - ID de l'événement
 * @returns {Promise<{id, numero}>}    - L'ID Firestore et le numéro attribué
 */
export const createCommande = async ({ specId, specNom, items, payNow, staff, code, source }, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement courant')
  if (!specId) throw new Error('Spectateur requis')
  if (!Array.isArray(items) || items.length === 0) throw new Error('Aucun article dans la commande')

  // Vérifie que le spectateur existe et a un solde suffisant si débit immédiat
  const specSnap = await getDocs(
    query(collection(db, 'events', eventId, 'spectateurs'), where('id', '==', specId))
  )
  if (specSnap.empty) throw new Error('Spectateur introuvable')
  const specRef = specSnap.docs[0].ref
  const specData = specSnap.docs[0].data()

  // Calcul du total en centimes (robuste : protège contre NaN/undefined)
  const total = items.reduce((s, it) => {
    const qty = Number(it.qty) || 0
    const pu  = Number(it.prixUnit) || 0
    return s + qty * pu
  }, 0)

  if (payNow && (specData.solde || 0) < total) {
    throw new Error(`Solde insuffisant (${((specData.solde||0)/100).toFixed(2)} € disponibles, ${(total/100).toFixed(2)} € requis)`)
  }

  // Récupère le numéro du jour (transaction atomique pour éviter les doublons)
  const numero = await getNextCommandeNumero(eventId)
  const numeroDay = _dateKey()
  const now = new Date()

  // Crée la commande + débit éventuel dans une transaction atomique
  // (pour garantir que numéro + débit ne se font qu'ensemble ou pas du tout)
  const commandeData = {
    numero,
    numeroDay,
    specId,
    specNom: specNom || specData.nom || '—',
    items: items.map(it => ({
      id:       it.id || '',
      nom:      String(it.nom || ''),
      qty:      Number(it.qty) || 1,
      prixUnit: Number(it.prixUnit) || 0,
      total:    (Number(it.qty) || 1) * (Number(it.prixUnit) || 0),
    })),
    total,
    status: 'pending',
    paid: !!payNow,
    paidAt: payNow ? serverTimestamp() : null,
    paidBy: payNow ? staff : null,
    createdAt: serverTimestamp(),
    createdBy: staff || '—',
    readyAt: null,
    readyBy: null,
    collectedAt: null,
    collectedBy: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    refunded: false,
    date: nowStr(),
    timestamp: now.toISOString(),
    heure: now.toLocaleTimeString('fr-FR'),
    // Champs optionnels (omis si non définis pour ne pas polluer les cmd staff)
    ...(code   ? { code }   : {}),  // ex: 'BRN-XXXX-NNN' pour les cmd borne
    ...(source ? { source } : {}),  // ex: 'borne' / 'staff' / 'app'
  }

  let commandeId
  await runTransaction(db, async (txn) => {
    // Si débit immédiat : décrémenter solde + créer transaction de débit
    if (payNow) {
      // ─── PHASE 1 : TOUTES LES LECTURES (règle Firestore : reads avant writes) ───
      const specDoc = await txn.get(specRef)
      const soldeBefore = specDoc.data().solde || 0
      // Lire les stocks de tous les items du menu
      const stockRefs = items.map(it => doc(db, 'events', eventId, 'menu', it.id))
      const stockDocs = await Promise.all(stockRefs.map(r => txn.get(r)))

      // ─── PHASE 2 : VÉRIFICATIONS ───
      if (soldeBefore < total) throw new Error('Solde insuffisant')
      const soldeAfter = soldeBefore - total
      for (let i = 0; i < items.length; i++) {
        const data = stockDocs[i].data()
        if (!data) throw new Error(`Article "${items[i].nom}" introuvable`)
        if ((data.stock || 0) < items[i].qty) {
          throw new Error(`Stock insuffisant pour "${items[i].nom}" (${data.stock} dispo)`)
        }
      }

      // ─── PHASE 3 : TOUTES LES ÉCRITURES ───
      txn.update(specRef, { solde: increment(-total) })
      for (let i = 0; i < items.length; i++) {
        txn.update(stockRefs[i], { stock: (stockDocs[i].data().stock || 0) - items[i].qty })
      }
      // Crée la transaction de débit (cohérence avec les autres flux)
      const label = items.map(i => i.nom + (i.qty > 1 ? ` ×${i.qty}` : '')).join(', ')
      txn.set(doc(collection(db, 'events', eventId, 'transactions')), {
        specId,
        specNom: specData.nom || '—',
        type: 'debit',
        label: `Commande #${numero} — ${label}`,
        items: items.map(i => ({ nom: i.nom, qty: i.qty, prixUnit: i.prixUnit, total: i.qty * i.prixUnit })),
        montant: total,
        staff: staff || '—',
        soldeBefore,
        soldeAfter,
        commandeNumero: numero,
        date: nowStr(),
        timestamp: now.toISOString(),
        heure: now.toLocaleTimeString('fr-FR'),
        createdAt: serverTimestamp(),
      })
    }
    // Crée la commande
    const commandeRef = doc(collection(db, 'events', eventId, 'commandes'))
    commandeId = commandeRef.id
    txn.set(commandeRef, commandeData)
  })

  // Audit log (hors transaction, non bloquant)
  await audit('COMMANDE_CREEE', {
    specId, montant: total, staff,
    label: `Commande #${numero} créée${payNow ? ' (débitée)' : ' (à débiter au retrait)'}`,
  })

  return { id: commandeId, numero, code: code || null }
}

/**
 * Listener temps réel sur la collection des commandes.
 * Filtre côté serveur sur la date du jour pour éviter de charger l'historique.
 *
 * @param {function} callback - Reçoit le tableau des commandes
 * @param {string|null} evId  - ID de l'événement
 * @returns {function}        - Fonction de désabonnement
 */
export const watchCommandes = (callback, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) { callback([]); return () => {} }
  // Trie par numéro (les commandes du jour en cours apparaissent par ordre)
  // Note : pas de filtre sur la date pour rester simple — le client peut filtrer
  // si besoin. Le volume reste faible (quelques centaines max par jour).
  return onSnapshot(
    query(collection(db, 'events', eventId, 'commandes'), orderBy('createdAt', 'desc')),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    () => callback([])
  )
}

/**
 * Marque une commande comme prête (cuisine a fini la préparation).
 *
 * @param {string} commandeId - ID Firestore de la commande
 * @param {string} staff      - Nom du staff
 * @param {string|null} evId  - ID de l'événement
 */
export const markCommandeReady = async (commandeId, staff, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement courant')
  const ref = doc(db, 'events', eventId, 'commandes', commandeId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Commande introuvable')
  if (snap.data().status !== 'pending') {
    throw new Error(`Impossible : statut actuel "${snap.data().status}"`)
  }
  await updateDoc(ref, {
    status: 'ready',
    readyAt: serverTimestamp(),
    readyBy: staff || '—',
  })
  await audit('COMMANDE_PRETE', {
    staff,
    label: `Commande #${snap.data().numero} marquée prête`,
  })
}

/**
 * Marque une commande comme retirée. Si elle n'était pas payée, débite maintenant.
 *
 * @param {string} commandeId - ID Firestore de la commande
 * @param {string} staff      - Nom du staff
 * @param {string|null} evId  - ID de l'événement
 */
export const markCommandeCollected = async (commandeId, staff, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement courant')
  const ref = doc(db, 'events', eventId, 'commandes', commandeId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Commande introuvable')
  const cmd = snap.data()
  if (cmd.status === 'collected') throw new Error('Commande déjà retirée')
  if (cmd.status === 'cancelled') throw new Error('Commande annulée — impossible de la retirer')

  // Si non payée : débiter maintenant
  if (!cmd.paid) {
    // Vérifie spectateur + solde
    const specSnap = await getDocs(
      query(collection(db, 'events', eventId, 'spectateurs'), where('id', '==', cmd.specId))
    )
    if (specSnap.empty) throw new Error('Spectateur introuvable')
    const specRef = specSnap.docs[0].ref
    const specData = specSnap.docs[0].data()
    if ((specData.solde || 0) < cmd.total) {
      throw new Error(`Solde insuffisant (${((specData.solde||0)/100).toFixed(2)} € disponibles, ${(cmd.total/100).toFixed(2)} € requis)`)
    }
    const now = new Date()
    await runTransaction(db, async (txn) => {
      // ─── PHASE 1 : TOUTES LES LECTURES (règle Firestore : reads avant writes) ───
      const specDoc = await txn.get(specRef)
      const soldeBefore = specDoc.data().solde || 0
      // Lire les stocks de tous les items du menu
      const items = cmd.items || []
      const stockRefs = items.map(it => doc(db, 'events', eventId, 'menu', it.id))
      const stockDocs = await Promise.all(stockRefs.map(r => txn.get(r)))

      // ─── PHASE 2 : VÉRIFICATIONS ───
      if (soldeBefore < cmd.total) throw new Error('Solde insuffisant')
      const soldeAfter = soldeBefore - cmd.total
      for (let i = 0; i < items.length; i++) {
        const data = stockDocs[i].data()
        if (!data) throw new Error(`Article "${items[i].nom}" introuvable`)
        if ((data.stock || 0) < (items[i].qty || 1)) {
          throw new Error(`Stock insuffisant pour "${items[i].nom}" (${data.stock} dispo)`)
        }
      }

      // ─── PHASE 3 : TOUTES LES ÉCRITURES ───
      txn.update(specRef, { solde: increment(-cmd.total) })
      for (let i = 0; i < items.length; i++) {
        txn.update(stockRefs[i], { stock: (stockDocs[i].data().stock || 0) - (items[i].qty || 1) })
      }
      // Crée la transaction de débit
      const label = items.map(i => i.nom + (i.qty > 1 ? ` ×${i.qty}` : '')).join(', ')
      txn.set(doc(collection(db, 'events', eventId, 'transactions')), {
        specId: cmd.specId,
        specNom: cmd.specNom || '—',
        type: 'debit',
        label: `Commande #${cmd.numero} — ${label}`,
        items: cmd.items || [],
        montant: cmd.total,
        staff: staff || '—',
        soldeBefore,
        soldeAfter,
        commandeNumero: cmd.numero,
        date: nowStr(),
        timestamp: now.toISOString(),
        heure: now.toLocaleTimeString('fr-FR'),
        createdAt: serverTimestamp(),
      })
      // Marque la commande comme payée + retirée
      txn.update(ref, {
        paid: true,
        paidAt: serverTimestamp(),
        paidBy: staff || '—',
        status: 'collected',
        collectedAt: serverTimestamp(),
        collectedBy: staff || '—',
      })
    })
  } else {
    // Déjà payée : juste marquer comme retirée
    await updateDoc(ref, {
      status: 'collected',
      collectedAt: serverTimestamp(),
      collectedBy: staff || '—',
    })
  }

  await audit('COMMANDE_RETIREE', {
    specId: cmd.specId,
    montant: cmd.total,
    staff,
    label: `Commande #${cmd.numero} retirée${!cmd.paid ? ' (débitée au retrait)' : ''}`,
  })
}

/**
 * Annule une commande. Si elle était payée, rembourse le client.
 *
 * @param {string} commandeId - ID Firestore de la commande
 * @param {string} staff      - Nom du staff
 * @param {string} reason     - Motif de l'annulation
 * @param {string|null} evId  - ID de l'événement
 */
export const cancelCommande = async (commandeId, staff, reason, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement courant')
  const ref = doc(db, 'events', eventId, 'commandes', commandeId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Commande introuvable')
  const cmd = snap.data()
  if (cmd.status === 'collected') throw new Error('Commande déjà retirée — impossible à annuler')
  if (cmd.status === 'cancelled') throw new Error('Commande déjà annulée')

  // Si payée : rembourser (transaction inverse)
  if (cmd.paid && !cmd.refunded) {
    const specSnap = await getDocs(
      query(collection(db, 'events', eventId, 'spectateurs'), where('id', '==', cmd.specId))
    )
    if (specSnap.empty) throw new Error('Spectateur introuvable pour remboursement')
    const specRef = specSnap.docs[0].ref
    const now = new Date()
    await runTransaction(db, async (txn) => {
      const specDoc = await txn.get(specRef)
      const soldeBefore = specDoc.data().solde || 0
      const soldeAfter = soldeBefore + cmd.total
      txn.update(specRef, { solde: increment(cmd.total) })
      // Crée une transaction de remboursement (type 'annulation')
      txn.set(doc(collection(db, 'events', eventId, 'transactions')), {
        specId: cmd.specId,
        specNom: cmd.specNom || '—',
        type: 'annulation',
        label: `Remboursement commande #${cmd.numero} — ${reason || 'Annulée'}`,
        montant: cmd.total,
        staff: staff || '—',
        soldeBefore,
        soldeAfter,
        commandeNumero: cmd.numero,
        date: nowStr(),
        timestamp: now.toISOString(),
        heure: now.toLocaleTimeString('fr-FR'),
        createdAt: serverTimestamp(),
      })
      txn.update(ref, {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: staff || '—',
        cancelReason: reason || '',
        refunded: true,
      })
    })
  } else {
    // Pas payée : juste marquer comme annulée
    await updateDoc(ref, {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      cancelledBy: staff || '—',
      cancelReason: reason || '',
    })
  }

  await audit('COMMANDE_ANNULEE', {
    specId: cmd.specId,
    montant: cmd.paid ? cmd.total : 0,
    staff,
    label: `Commande #${cmd.numero} annulée${cmd.paid ? ' (remboursée)' : ''} — ${reason || 'Sans motif'}`,
  })
}

// ════════════════════════════════════════════════════════════════════
// REMBOURSEMENT BILLETTERIE (Lot A)
// ════════════════════════════════════════════════════════════════════
// Deux modes :
//   1. rembourserSolde — DÉBIT : "le client récupère son solde restant en cash/CB"
//      Décrémente le solde du client (souvent total), crée une transaction type 'remboursement'.
//   2. crediterCorrection — CRÉDIT : "annulation d'une transaction, on remet de l'argent sur le compte"
//      Incrémente le solde, crée une transaction type 'credit_correction'.
// Les deux passent par des transactions Firestore atomiques pour cohérence avec l'existant.
// ════════════════════════════════════════════════════════════════════

/**
 * Rembourse le solde restant d'un spectateur (débite son compte).
 *
 * @param {string} specId   - ID du spectateur (FY-XXXX)
 * @param {number} montant  - Montant à rembourser en CENTIMES
 * @param {string} motif    - Motif du remboursement (libre)
 * @param {string} staff    - Nom du staff
 * @param {string|null} evId - ID de l'événement (défaut = courant)
 */
export const rembourserSolde = async (specId, montant, motif, staff, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement courant')
  if (!specId) throw new Error('Spectateur requis')
  const m = Math.round(Number(montant) || 0)
  if (m <= 0) throw new Error('Montant à rembourser invalide')

  const snap = await getDocs(
    query(collection(db, 'events', eventId, 'spectateurs'), where('id', '==', specId))
  )
  if (snap.empty) throw new Error('Spectateur introuvable')
  const specRef = snap.docs[0].ref
  const specData = snap.docs[0].data()

  if ((specData.solde || 0) < m) {
    throw new Error(`Solde insuffisant : ${((specData.solde || 0) / 100).toFixed(2)} € disponibles, ${(m / 100).toFixed(2)} € demandés`)
  }

  const now = new Date()
  await runTransaction(db, async (txn) => {
    const specDoc = await txn.get(specRef)
    const soldeBefore = specDoc.data().solde || 0
    if (soldeBefore < m) throw new Error('Solde insuffisant')
    const soldeAfter = soldeBefore - m
    txn.update(specRef, { solde: increment(-m) })
    txn.set(doc(collection(db, 'events', eventId, 'transactions')), {
      specId,
      specNom: specData.nom || '—',
      type: 'remboursement',
      label: motif || 'Remboursement de solde',
      montant: m,
      staff: staff || '—',
      soldeBefore,
      soldeAfter,
      date: nowStr(),
      timestamp: now.toISOString(),
      heure: now.toLocaleTimeString('fr-FR'),
      createdAt: serverTimestamp(),
    })
  })

  await audit('REMBOURSEMENT', {
    specId, montant: m, staff,
    label: `Remboursement de ${(m / 100).toFixed(2)} € — ${motif || 'Sans motif'}`,
  })
}

/**
 * Crédite le compte d'un spectateur en correction (annulation d'un débit, geste commercial...).
 *
 * @param {string} specId   - ID du spectateur (FY-XXXX)
 * @param {number} montant  - Montant à créditer en CENTIMES
 * @param {string} motif    - Motif (libre, obligatoire pour la traçabilité)
 * @param {string} staff    - Nom du staff
 * @param {string|null} evId - ID de l'événement
 */
export const crediterCorrection = async (specId, montant, motif, staff, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement courant')
  if (!specId) throw new Error('Spectateur requis')
  const m = Math.round(Number(montant) || 0)
  if (m <= 0) throw new Error('Montant à créditer invalide')
  if (!motif || !motif.trim()) throw new Error('Motif requis pour une correction')

  const snap = await getDocs(
    query(collection(db, 'events', eventId, 'spectateurs'), where('id', '==', specId))
  )
  if (snap.empty) throw new Error('Spectateur introuvable')
  const specRef = snap.docs[0].ref
  const specData = snap.docs[0].data()

  const now = new Date()
  await runTransaction(db, async (txn) => {
    const specDoc = await txn.get(specRef)
    const soldeBefore = specDoc.data().solde || 0
    const soldeAfter = soldeBefore + m
    txn.update(specRef, { solde: increment(m) })
    txn.set(doc(collection(db, 'events', eventId, 'transactions')), {
      specId,
      specNom: specData.nom || '—',
      type: 'credit_correction',
      label: motif.trim(),
      montant: m,
      staff: staff || '—',
      soldeBefore,
      soldeAfter,
      date: nowStr(),
      timestamp: now.toISOString(),
      heure: now.toLocaleTimeString('fr-FR'),
      createdAt: serverTimestamp(),
    })
  })

  await audit('CREDIT_CORRECTION', {
    specId, montant: m, staff,
    label: `Crédit de correction de ${(m / 100).toFixed(2)} € — ${motif.trim()}`,
  })
}

// ════════════════════════════════════════════════════════════════════
// EXPOSANTS (Lot 1 — fondations)
// ════════════════════════════════════════════════════════════════════
// Gestion des exposants payant des frais d'exposition (stands, tonnelles).
// Architecture : 1 doc par exposant dans events/{eventId}/expositions/
//
// Données stockées :
//   - Identité : nom, contact (email/tél), commentaires
//   - Thématique : id + label (label dupliqué pour résilience si suppression
//     de la thématique dans settings)
//   - Montants : montantTotal en centimes, acompte/solde { montant, date, method }
//   - Documents : tableau d'URLs (Lot 3 — Firebase Storage)
//
// Statut de paiement calculé dynamiquement par computeExpoStatut (utils/).
// ════════════════════════════════════════════════════════════════════

const expoCol = (eventId) => collection(db, 'events', eventId || getEventId(), 'expositions')

/**
 * Liste/observe les exposants d'un événement en temps réel.
 * @param {function} callback - reçoit le tableau [{ id, ...data }]
 * @param {string|null} evId - événement (par défaut le courant)
 * @returns {function} unsubscribe
 */
export const watchExpositions = (callback, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) { callback([]); return () => {} }
  return onSnapshot(
    query(expoCol(eventId), orderBy('createdAt', 'desc')),
    snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  )
}

/**
 * Crée un exposant. Tous les montants en CENTIMES.
 * Si acompte > 0, il est enregistré directement à la création avec la date du jour.
 *
 * @param {object} data
 *   Identité (Livraison A) :
 *     - typeExposant : 'particulier' | 'entreprise'
 *     - identite     : objet identité complet (voir defaultIdentite)
 *     - nom          : nom d'affichage (calculé côté UI via expoDisplayName)
 *   Thématique :
 *     - thematiqueId, thematiqueLabel
 *   Lignes facturables (Livraison A) :
 *     - lignes : [{ id, description, qty, prixUnit (centimes), total (centimes) }]
 *     - montantTotal : somme des lignes (recalculé ici pour cohérence)
 *   Paiements :
 *     - acompteInitial, acompteMethod
 *   Autres :
 *     - contact (legacy), commentaires
 * @param {string|null} evId
 * @returns {Promise<{ id, ...data }>}
 */
export const createExposition = async (data, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement courant')
  if (!data.nom || !data.nom.trim()) throw new Error('Le nom de l\'exposant est requis')

  // Lignes facturables : si fournies on les utilise, sinon on fabrique une ligne unique
  // à partir du montant historique (compat avec ancien formulaire).
  // Chaque ligne peut avoir une réduction optionnelle (Lot C1+C2).
  const sanitizeReduction = (r) => {
    if (!r || !r.type || !['percent', 'amount'].includes(r.type)) return null
    const v = Number(r.value) || 0
    if (v <= 0) return null
    return {
      type: r.type,
      value: r.type === 'percent' ? Math.min(100, v) : Math.round(v), // % bornée, montant en centimes
      label: String(r.label || '').trim() || null,
    }
  }
  const lignes = Array.isArray(data.lignes) && data.lignes.length > 0
    ? data.lignes.map(l => {
        const qty = Math.max(1, Math.round(Number(l.qty) || 1))
        const prixUnit = Math.round(Number(l.prixUnit) || 0)
        const brut = qty * prixUnit
        const reduction = sanitizeReduction(l.reduction)
        // Calcul du total net (après réduction ligne) pour persistance
        let totalNet = brut
        if (reduction) {
          if (reduction.type === 'percent') {
            totalNet = brut - Math.round((brut * reduction.value) / 100)
          } else {
            totalNet = Math.max(0, brut - Math.min(reduction.value, brut))
          }
        }
        return {
          id:          l.id || ('lig-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)),
          description: String(l.description || '').trim(),
          qty, prixUnit,
          reduction,                // null si pas de réduction
          // Taux TVA personnalisé pour cette ligne (Lot C3).
          // Null ou undefined = utiliser le taux par défaut de l'événement.
          // Stocké tel quel sans modification (peut être 0, 5.5, 10, 20, etc.).
          tauxTva: Number.isFinite(Number(l.tauxTva)) ? Math.max(0, Number(l.tauxTva)) : null,
          total: totalNet,          // total NET pour rétrocompat (avant : total = qty*pu)
        }
      })
    : null
  // Réductions globales (Lot C1+C2) — max 2
  const reductionsGlobales = Array.isArray(data.reductionsGlobales)
    ? data.reductionsGlobales.map(sanitizeReduction).filter(Boolean).slice(0, 2)
    : []
  // Sous-total = somme des lignes (nettes des réductions ligne)
  const sousTotal = lignes
    ? lignes.reduce((a, l) => a + l.total, 0)
    : Math.round(Number(data.montantTotal) || 0)
  // Application des réductions globales sur le sous-total, dans l'ordre
  let baseRestante = sousTotal
  for (const r of reductionsGlobales) {
    if (r.type === 'percent') {
      baseRestante -= Math.round((baseRestante * r.value) / 100)
    } else {
      baseRestante -= Math.min(r.value, baseRestante)
    }
    if (baseRestante <= 0) { baseRestante = 0; break }
  }
  // Total HT net après toutes réductions
  const totalHT = Math.max(0, baseRestante)

  // Calcul TVA (Lot C3) — si l'événement utilise la TVA, on ajoute la TVA au HT
  // pour obtenir le montantTotal final (TTC) qui sert pour les paiements.
  // Sinon, montantTotal = totalHT (comportement historique).
  const settings = await getSettings(eventId)
  const tvaConfig = {
    active: !!settings?.tvaActive,
    defaultTaux: Number(settings?.tvaDefaultTaux) || 0,
  }
  let totalTva = 0
  if (tvaConfig.active && lignes && lignes.length > 0) {
    const sousTotalLignes = lignes.reduce((a, l) => a + (Number(l.total) || 0), 0)
    const ratio = sousTotalLignes > 0 ? (totalHT / sousTotalLignes) : 0
    for (const l of lignes) {
      const taux = Number.isFinite(Number(l.tauxTva)) ? Math.max(0, Number(l.tauxTva)) : tvaConfig.defaultTaux
      if (taux <= 0) continue
      const baseHTLigne = Math.round((Number(l.total) || 0) * ratio)
      totalTva += Math.round((baseHTLigne * taux) / 100)
    }
  }
  // montantTotal = ce que le client doit payer (TTC si TVA active, HT sinon)
  const montantTotal = totalHT + totalTva

  if (montantTotal <= 0) throw new Error('Le montant doit être supérieur à 0')

  const acompteInitial = Math.round(Number(data.acompteInitial) || 0)
  if (acompteInitial < 0) throw new Error('L\'acompte ne peut pas être négatif')
  if (acompteInitial > montantTotal) throw new Error('L\'acompte ne peut pas dépasser le total')

  const now = new Date()
  const expo = {
    nom: data.nom.trim(),
    // Identité étendue (Livraison A)
    typeExposant: ['particulier', 'entreprise'].includes(data.typeExposant) ? data.typeExposant : 'particulier',
    identite: data.identite && typeof data.identite === 'object' ? data.identite : null,
    // Thématique (conservée pour compat + filtrage rapports)
    thematiqueId: data.thematiqueId || '',
    thematiqueLabel: data.thematiqueLabel || '',
    // Lignes facturables (Livraison A + réductions Lot C1+C2)
    lignes: lignes || [],
    reductionsGlobales,           // tableau (0, 1 ou 2 éléments)
    montantTotal,                 // NET final (= ce qui sert pour les paiements)
    // Paiements
    acompte: acompteInitial > 0
      ? { montant: acompteInitial, date: nowStr(), paidAt: now.toISOString(), method: data.acompteMethod || 'cash' }
      : null,
    solde: null,
    // Legacy : conservés pour rétrocompatibilité avec V1 du module
    contact: (data.contact || '').trim(),
    commentaires: (data.commentaires || '').trim(),
    documents: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const ref = doc(expoCol(eventId))
  await setDoc(ref, expo)
  await audit('EXPO_CREATE', {
    expoId: ref.id, nom: expo.nom,
    label: `Création exposant : ${expo.nom} (${expo.typeExposant}, ${(montantTotal / 100).toFixed(2)} €)`,
  })
  return { id: ref.id, ...expo }
}

/**
 * Met à jour les informations générales d'un exposant.
 * Pour enregistrer un paiement, utiliser registerExpoPayment.
 *
 * @param {string} expoId
 * @param {object} patch - clés autorisées :
 *   - nom, typeExposant, identite (objet)
 *   - thematiqueId, thematiqueLabel
 *   - lignes (recalcule montantTotal automatiquement)
 *   - montantTotal (utilisé uniquement si lignes absent — legacy)
 *   - contact, commentaires
 * @param {string|null} evId
 */
export const updateExposition = async (expoId, patch, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId || !expoId) throw new Error('Paramètres invalides')

  const allowedKeys = [
    'nom', 'typeExposant', 'identite',
    'thematiqueId', 'thematiqueLabel',
    'lignes', 'reductionsGlobales', 'montantTotal',
    'contact', 'commentaires',
  ]
  const sanitized = { updatedAt: serverTimestamp() }
  for (const k of allowedKeys) {
    if (patch[k] !== undefined) sanitized[k] = patch[k]
  }
  if (sanitized.nom) sanitized.nom = String(sanitized.nom).trim()

  // Helper de normalisation d'une réduction (cohérent avec createExposition)
  const sanitizeReduction = (r) => {
    if (!r || !r.type || !['percent', 'amount'].includes(r.type)) return null
    const v = Number(r.value) || 0
    if (v <= 0) return null
    return {
      type: r.type,
      value: r.type === 'percent' ? Math.min(100, v) : Math.round(v),
      label: String(r.label || '').trim() || null,
    }
  }

  // Si on touche aux lignes, on les normalise (avec réductions ligne) ET on recalcule le montantTotal.
  if (Array.isArray(sanitized.lignes)) {
    sanitized.lignes = sanitized.lignes.map(l => {
      const qty = Math.max(1, Math.round(Number(l.qty) || 1))
      const prixUnit = Math.round(Number(l.prixUnit) || 0)
      const brut = qty * prixUnit
      const reduction = sanitizeReduction(l.reduction)
      let totalNet = brut
      if (reduction) {
        if (reduction.type === 'percent') {
          totalNet = brut - Math.round((brut * reduction.value) / 100)
        } else {
          totalNet = Math.max(0, brut - Math.min(reduction.value, brut))
        }
      }
      return {
        id:          l.id || ('lig-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)),
        description: String(l.description || '').trim(),
        qty, prixUnit,
        reduction,
        tauxTva: Number.isFinite(Number(l.tauxTva)) ? Math.max(0, Number(l.tauxTva)) : null,
        total: totalNet,
      }
    })
  }

  // Réductions globales (peut être passée seule sans toucher aux lignes)
  if (Array.isArray(sanitized.reductionsGlobales)) {
    sanitized.reductionsGlobales = sanitized.reductionsGlobales
      .map(sanitizeReduction).filter(Boolean).slice(0, 2)
  }

  // Recalcul du montantTotal si lignes OU reductionsGlobales ont été modifiées.
  // On lit le document courant pour avoir l'autre moitié (lignes si on n'a touché qu'aux réductions
  // globales, ou inverse).
  if (sanitized.lignes !== undefined || sanitized.reductionsGlobales !== undefined) {
    const snap = await getDoc(doc(expoCol(eventId), expoId))
    const cur = snap.exists() ? snap.data() : {}
    const finalLignes = sanitized.lignes !== undefined ? sanitized.lignes : (cur.lignes || [])
    const finalReductions = sanitized.reductionsGlobales !== undefined
      ? sanitized.reductionsGlobales
      : (cur.reductionsGlobales || [])
    const sousTotal = finalLignes.reduce((a, l) => a + (Number(l.total) || 0), 0)
    let base = sousTotal
    for (const r of finalReductions) {
      if (r.type === 'percent') base -= Math.round((base * r.value) / 100)
      else base -= Math.min(r.value, base)
      if (base <= 0) { base = 0; break }
    }
    const totalHT = Math.max(0, base)

    // Calcul TVA (Lot C3) cohérent avec createExposition
    const settings = await getSettings(eventId)
    const tvaConfig = {
      active: !!settings?.tvaActive,
      defaultTaux: Number(settings?.tvaDefaultTaux) || 0,
    }
    let totalTva = 0
    if (tvaConfig.active && finalLignes.length > 0) {
      const ratio = sousTotal > 0 ? (totalHT / sousTotal) : 0
      for (const l of finalLignes) {
        const taux = Number.isFinite(Number(l.tauxTva)) ? Math.max(0, Number(l.tauxTva)) : tvaConfig.defaultTaux
        if (taux <= 0) continue
        const baseHTLigne = Math.round((Number(l.total) || 0) * ratio)
        totalTva += Math.round((baseHTLigne * taux) / 100)
      }
    }
    sanitized.montantTotal = totalHT + totalTva
  } else if (sanitized.montantTotal != null) {
    sanitized.montantTotal = Math.round(Number(sanitized.montantTotal) || 0)
  }

  // Vérif : si on a un total mais qu'il y a déjà des paiements supérieurs au nouveau total, refus
  if (sanitized.montantTotal != null && sanitized.montantTotal > 0) {
    const snap = await getDoc(doc(expoCol(eventId), expoId))
    if (snap.exists()) {
      const cur = snap.data()
      const paye = (cur.acompte?.montant || 0) + (cur.solde?.montant || 0)
      if (paye > sanitized.montantTotal) {
        throw new Error(`Le nouveau total (${(sanitized.montantTotal / 100).toFixed(2)} €) est inférieur aux paiements déjà reçus (${(paye / 100).toFixed(2)} €).`)
      }
    }
  }

  const ref = doc(expoCol(eventId), expoId)
  await updateDoc(ref, sanitized)
  await audit('EXPO_UPDATE', { expoId, label: `Modification exposant ${sanitized.nom || ''}` })
}

// ════════════════════════════════════════════════════════════════════
// EXPOSANTS — Forçage manuel du statut de paiement
// ════════════════════════════════════════════════════════════════════
// Permet à un admin de surclasser le statut calculé (depuis les montants)
// avec un statut explicite. Cas d'usage : exposant gracieux, compensation
// hors-système, abandon, etc.
//
// Garde-fous :
//   - Motif obligatoire (≥ 3 caractères) pour traçabilité
//   - Audit systématique avec l'auteur
//   - Le montantTotal et les paiements ne sont PAS modifiés (la compta
//     reste cohérente avec les vrais flux)

/**
 * Force le statut de paiement d'un exposant à une valeur explicite.
 *
 * @param {string} expoId
 * @param {'paye'|'acompte'|'impaye'} statut
 * @param {string} motif - obligatoire, ≥ 3 caractères
 * @param {object} options - { staffNom, staffUid }
 * @param {string|null} evId
 */
export const forceExpoStatut = async (expoId, statut, motif, options = {}, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId || !expoId) throw new Error('Paramètres invalides')
  if (!['paye', 'acompte', 'impaye'].includes(statut)) {
    throw new Error('Statut invalide (paye/acompte/impaye attendus)')
  }
  const cleanMotif = String(motif || '').trim()
  if (cleanMotif.length < 3) {
    throw new Error('Un motif d\'au moins 3 caractères est requis')
  }

  const ref = doc(expoCol(eventId), expoId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Exposant introuvable')
  const cur = snap.data()

  const now = new Date()
  await updateDoc(ref, {
    forcedStatut: statut,
    forcedStatutMotif: cleanMotif,
    forcedStatutBy: {
      uid: options.staffUid || null,
      nom: options.staffNom || '—',
      at: now.toISOString(),
    },
    updatedAt: serverTimestamp(),
  })

  await audit('EXPO_STATUT_FORCE', {
    expoId,
    label: `Statut forcé "${statut}" pour ${cur.nom || expoId}`,
    statut, motif: cleanMotif,
    staff: options.staffNom || '—',
  })
}

/**
 * Annule le forçage de statut et revient au calcul automatique.
 *
 * @param {string} expoId
 * @param {object} options - { staffNom, staffUid }
 * @param {string|null} evId
 */
export const clearExpoStatutForce = async (expoId, options = {}, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId || !expoId) throw new Error('Paramètres invalides')

  const ref = doc(expoCol(eventId), expoId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Exposant introuvable')
  const cur = snap.data()
  if (!cur.forcedStatut) {
    // Pas de statut forcé : no-op silencieux
    return
  }

  await updateDoc(ref, {
    forcedStatut: null,
    forcedStatutMotif: null,
    forcedStatutBy: null,
    updatedAt: serverTimestamp(),
  })

  await audit('EXPO_STATUT_FORCE_CLEAR', {
    expoId,
    label: `Forçage de statut retiré pour ${cur.nom || expoId} (était "${cur.forcedStatut}")`,
    staff: options.staffNom || '—',
  })
}

/**
 * Supprime un exposant. Ses documents joints ne sont pas supprimés du Storage
 * (à faire séparément si nécessaire — voir Lot 3).
 */
export const deleteExposition = async (expoId, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId || !expoId) throw new Error('Paramètres invalides')
  const ref = doc(expoCol(eventId), expoId)
  const snap = await getDoc(ref)
  const nom = snap.exists() ? snap.data().nom : '—'
  await deleteDoc(ref)
  await audit('EXPO_DELETE', { expoId, label: `Suppression exposant ${nom}` })
}

/**
 * Enregistre un paiement (acompte ou solde).
 *
 * @param {string} expoId
 * @param {'acompte'|'solde'} kind
 * @param {object} payment - { montant (centimes), date (YYYY-MM-DD), method ('cash'|'cb'|'virement'|'cheque') }
 * @param {string|null} evId
 */
export const registerExpoPayment = async (expoId, kind, payment, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId || !expoId) throw new Error('Paramètres invalides')
  if (!['acompte','solde'].includes(kind)) throw new Error('Type de paiement invalide')

  const montant = Math.round(Number(payment.montant) || 0)
  if (montant <= 0) throw new Error('Le montant doit être supérieur à 0')

  const ref = doc(expoCol(eventId), expoId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Exposant introuvable')
  const expo = snap.data()

  // Vérif cohérence : le montant payé ne peut excéder ce qui reste dû
  const dejaPaye = (expo.acompte?.montant || 0) + (kind === 'solde' ? 0 : 0)
  const restantDu = (expo.montantTotal || 0) - dejaPaye
  if (kind === 'acompte' && expo.acompte) {
    throw new Error('L\'acompte est déjà enregistré. Utilisez le solde pour le complément.')
  }
  if (kind === 'solde' && expo.solde) {
    throw new Error('Le solde est déjà enregistré.')
  }
  if (montant > restantDu) {
    throw new Error(`Montant excède le restant dû (${(restantDu / 100).toFixed(2)} €)`)
  }

  const now = new Date()
  const paymentRecord = {
    montant,
    date: payment.date || nowStr(),
    paidAt: now.toISOString(),
    method: payment.method || 'cash',
  }

  await updateDoc(ref, {
    [kind]: paymentRecord,
    updatedAt: serverTimestamp(),
  })

  await audit('EXPO_PAYMENT', {
    expoId, nom: expo.nom, montant,
    label: `${kind === 'acompte' ? 'Acompte' : 'Solde'} ${(montant / 100).toFixed(2)} € — ${expo.nom}`,
  })
}

/**
 * Annule un paiement enregistré (correction d'erreur).
 * @param {string} expoId
 * @param {'acompte'|'solde'} kind
 */
export const removeExpoPayment = async (expoId, kind, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId || !expoId) throw new Error('Paramètres invalides')
  if (!['acompte','solde'].includes(kind)) throw new Error('Type de paiement invalide')

  const ref = doc(expoCol(eventId), expoId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Exposant introuvable')
  const expo = snap.data()

  if (kind === 'solde' && expo.acompte && !expo.solde) {
    // Sans solde, on ne peut pas supprimer un solde inexistant
    throw new Error('Aucun solde à supprimer')
  }

  await updateDoc(ref, {
    [kind]: null,
    updatedAt: serverTimestamp(),
  })

  await audit('EXPO_PAYMENT_CANCEL', {
    expoId, nom: expo.nom,
    label: `Annulation ${kind} — ${expo.nom}`,
  })
}

/**
 * Modifie un paiement existant (acompte ou solde) : montant, date, méthode.
 * Conserve `paidAt` (timestamp d'origine) pour traçabilité.
 *
 * @param {string} expoId
 * @param {'acompte'|'solde'} kind
 * @param {object} patch - { montant?, date?, method? }
 * @param {string|null} evId
 */
export const editExpoPayment = async (expoId, kind, patch, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId || !expoId) throw new Error('Paramètres invalides')
  if (!['acompte','solde'].includes(kind)) throw new Error('Type de paiement invalide')

  const ref = doc(expoCol(eventId), expoId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Exposant introuvable')
  const expo = snap.data()

  if (!expo[kind]) throw new Error(`Aucun ${kind} à modifier`)

  const updated = { ...expo[kind] }

  // Montant : validation et borne supérieure (ne pas dépasser le total - autre paiement)
  if (patch.montant !== undefined) {
    const newMontant = Math.round(Number(patch.montant) || 0)
    if (newMontant <= 0) throw new Error('Le montant doit être supérieur à 0')
    const autreMontant = kind === 'acompte'
      ? (expo.solde?.montant || 0)
      : (expo.acompte?.montant || 0)
    if (newMontant + autreMontant > (expo.montantTotal || 0)) {
      throw new Error(`Total des paiements excéderait le montant facturé (${((expo.montantTotal || 0) / 100).toFixed(2)} €)`)
    }
    updated.montant = newMontant
  }
  if (patch.date !== undefined) {
    updated.date = String(patch.date || '').trim() || nowStr()
  }
  if (patch.method !== undefined && ['cash','cb','virement','cheque'].includes(patch.method)) {
    updated.method = patch.method
  }
  // Note : on ne touche pas paidAt (timestamp d'origine de la création)
  // mais on ajoute updatedPaymentAt pour traçabilité de la dernière modif
  updated.updatedPaymentAt = new Date().toISOString()

  await updateDoc(ref, {
    [kind]: updated,
    updatedAt: serverTimestamp(),
  })

  await audit('EXPO_PAYMENT_EDIT', {
    expoId, nom: expo.nom,
    label: `Modification ${kind} — ${expo.nom} : ${(updated.montant / 100).toFixed(2)} € le ${updated.date}`,
  })
}

// ────────────────────────────────────────────────────────────────────
// EXPOSANTS — Documents (Lot 3 — Firebase Storage)
// ────────────────────────────────────────────────────────────────────
// Upload de pièces jointes (contrats, photos, etc.) liées à un exposant.
// Stockage : events/{eventId}/expositions/{expoId}/{timestamp}-{filename}
// Métadonnées : référencées dans le tableau expo.documents (URL + nom + taille).
// ────────────────────────────────────────────────────────────────────

/**
 * Upload un fichier vers Firebase Storage et l'enregistre dans l'exposant.
 * Le fichier est nommé avec un timestamp pour éviter les collisions.
 *
 * @param {string} expoId
 * @param {File} file - blob du fichier (depuis input type=file)
 * @param {function} [onProgress] - callback(percent 0-100)
 * @param {string|null} evId
 * @returns {Promise<object>} le document ajouté { name, url, size, uploadedAt }
 */
export const uploadExpoDocument = async (expoId, file, onProgress = null, evId = null) => {
  const { ref: sref, uploadBytesResumable, getDownloadURL } = await import('firebase/storage')
  const { storage } = await import('./config')
  const eventId = evId || getEventId()
  if (!eventId || !expoId) throw new Error('Paramètres invalides')
  if (!file) throw new Error('Aucun fichier sélectionné')
  // Limite raisonnable : 10 Mo (un PDF de contrat fait quelques Mo max)
  if (file.size > 10 * 1024 * 1024) throw new Error('Fichier trop volumineux (max 10 Mo)')

  // Nom sécurisé : timestamp + nom original sans caractères spéciaux
  const safeName = file.name.replace(/[^\w.\-]+/g, '_')
  const path = `events/${eventId}/expositions/${expoId}/${Date.now()}-${safeName}`
  const fileRef = sref(storage, path)

  // Upload avec suivi de progression
  const url = await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(fileRef, file)
    task.on('state_changed',
      (snap) => {
        if (onProgress) {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
          onProgress(pct)
        }
      },
      (err) => reject(err),
      async () => {
        try { resolve(await getDownloadURL(task.snapshot.ref)) }
        catch (e) { reject(e) }
      }
    )
  })

  // Enregistre la métadonnée dans le document Firestore (push au tableau)
  const docMeta = {
    name: file.name,
    url,
    path,                                 // utile pour supprimer plus tard
    size: file.size,
    type: file.type || 'application/octet-stream',
    uploadedAt: new Date().toISOString(),
  }
  const expoRef = doc(expoCol(eventId), expoId)
  const snap = await getDoc(expoRef)
  if (!snap.exists()) throw new Error('Exposant introuvable')
  const current = snap.data().documents || []
  await updateDoc(expoRef, {
    documents: [...current, docMeta],
    updatedAt: serverTimestamp(),
  })

  await audit('EXPO_DOC_UPLOAD', {
    expoId,
    label: `Document ajouté : ${file.name} (${(file.size / 1024).toFixed(0)} Ko)`,
  })
  return docMeta
}

/**
 * Supprime un document : retire de Firestore + supprime du Storage.
 * @param {string} expoId
 * @param {string} path - chemin Storage du fichier
 * @param {string|null} evId
 */
export const deleteExpoDocument = async (expoId, path, evId = null) => {
  const { ref: sref, deleteObject } = await import('firebase/storage')
  const { storage } = await import('./config')
  const eventId = evId || getEventId()
  if (!eventId || !expoId || !path) throw new Error('Paramètres invalides')

  // Suppression Storage (n'échoue pas la fonction si le fichier n'existe plus)
  try {
    await deleteObject(sref(storage, path))
  } catch (e) {
    console.warn('deleteExpoDocument storage:', e.message)
  }

  // Retire la métadonnée du Firestore
  const expoRef = doc(expoCol(eventId), expoId)
  const snap = await getDoc(expoRef)
  if (!snap.exists()) throw new Error('Exposant introuvable')
  const current = snap.data().documents || []
  const filtered = current.filter(d => d.path !== path)
  await updateDoc(expoRef, {
    documents: filtered,
    updatedAt: serverTimestamp(),
  })

  await audit('EXPO_DOC_DELETE', { expoId, label: `Document supprimé : ${path}` })
}

// ════════════════════════════════════════════════════════════════════
// CACHETS — Preuves de paiement (Étape B "Cachets +")
// ════════════════════════════════════════════════════════════════════
// Permet d'attacher des fichiers (images PNG/JPG, PDF) à un cachet
// comme preuves de paiement : capture d'écran de virement, scan de
// reçu, etc. Pattern identique à uploadExpoDocument.

/**
 * Upload une preuve de paiement attachée à un cachet.
 * @param {string} cachetId
 * @param {File} file
 * @param {function} [onProgress] - callback(percent 0-100)
 * @returns {Promise<object>} le document ajouté { name, url, path, size, type, uploadedAt }
 */
export const uploadCachetDocument = async (cachetId, file, onProgress = null) => {
  const { ref: sref, uploadBytesResumable, getDownloadURL } = await import('firebase/storage')
  const { storage } = await import('./config')
  const eid = getEventId()
  if (!eid || !cachetId) throw new Error('Paramètres invalides')
  if (!file) throw new Error('Aucun fichier sélectionné')
  if (file.size > 10 * 1024 * 1024) throw new Error('Fichier trop volumineux (max 10 Mo)')

  const safeName = file.name.replace(/[^\w.\-]+/g, '_')
  const path = `events/${eid}/cachets/${cachetId}/${Date.now()}-${safeName}`
  const fileRef = sref(storage, path)

  const url = await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(fileRef, file)
    task.on('state_changed',
      (snap) => {
        if (onProgress) {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
          onProgress(pct)
        }
      },
      (err) => reject(err),
      async () => {
        try { resolve(await getDownloadURL(task.snapshot.ref)) }
        catch (e) { reject(e) }
      }
    )
  })

  const docMeta = {
    name: file.name,
    url, path,
    size: file.size,
    type: file.type || 'application/octet-stream',
    uploadedAt: new Date().toISOString(),
  }
  const cachetRef = doc(db, 'events', eid, 'cachets', cachetId)
  const snap = await getDoc(cachetRef)
  if (!snap.exists()) throw new Error('Cachet introuvable')
  const current = snap.data().documents || []
  await updateDoc(cachetRef, {
    documents: [...current, docMeta],
    updatedAt: serverTimestamp(),
  })

  await audit('CACHET_DOC_UPLOAD', {
    cachetId,
    label: `Preuve de paiement ajoutée : ${file.name} (${(file.size / 1024).toFixed(0)} Ko)`,
  })
  return docMeta
}

/**
 * Supprime une preuve de paiement attachée à un cachet.
 */
export const deleteCachetDocument = async (cachetId, path) => {
  const { ref: sref, deleteObject } = await import('firebase/storage')
  const { storage } = await import('./config')
  const eid = getEventId()
  if (!eid || !cachetId || !path) throw new Error('Paramètres invalides')

  try {
    await deleteObject(sref(storage, path))
  } catch (e) {
    console.warn('deleteCachetDocument storage:', e.message)
  }

  const cachetRef = doc(db, 'events', eid, 'cachets', cachetId)
  const snap = await getDoc(cachetRef)
  if (!snap.exists()) throw new Error('Cachet introuvable')
  const current = snap.data().documents || []
  const filtered = current.filter(d => d.path !== path)
  await updateDoc(cachetRef, {
    documents: filtered,
    updatedAt: serverTimestamp(),
  })

  await audit('CACHET_DOC_DELETE', { cachetId, label: `Preuve supprimée : ${path}` })
}

// ════════════════════════════════════════════════════════════════════
// EXPOSANTS — Décharges signées & templates (Livraison signature)
// ════════════════════════════════════════════════════════════════════
// Gestion :
//   - Templates de décharge réutilisables (stockés dans settings.dechargeTemplates)
//   - Génération de décharges avec signature + horodatage + hash
//   - Sauvegarde du PDF signé dans Firebase Storage
//   - Historique dans expo.decharges[]

/**
 * Crée ou met à jour un template de décharge dans les settings.
 * Les templates sont stockés sous forme de tableau dans settings.dechargeTemplates.
 *
 * @param {object} template - { id?, nom, intro, mentions, piedDePage }
 *   Si id absent ou inconnu, création.
 * @param {string|null} evId
 */
export const saveDechargeTemplate = async (template, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement courant')
  if (!template.nom || !template.nom.trim()) throw new Error('Le nom du template est requis')

  const s = await getSettings(eventId)
  const current = Array.isArray(s?.dechargeTemplates) ? s.dechargeTemplates : []

  const cleaned = {
    id:           template.id || ('tpl-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)),
    nom:          template.nom.trim(),
    intro:        String(template.intro || '').trim(),
    mentions:     String(template.mentions || '').trim(),
    piedDePage:   String(template.piedDePage || '').trim(),
    createdAt:    template.createdAt || new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
  }

  const idx = current.findIndex(t => t.id === cleaned.id)
  const next = idx >= 0
    ? [...current.slice(0, idx), cleaned, ...current.slice(idx + 1)]
    : [...current, cleaned]

  await saveSettings({ dechargeTemplates: next }, eventId)
  return cleaned
}

/**
 * Supprime un template de décharge.
 */
export const deleteDechargeTemplate = async (templateId, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId || !templateId) throw new Error('Paramètres invalides')
  const s = await getSettings(eventId)
  const current = Array.isArray(s?.dechargeTemplates) ? s.dechargeTemplates : []
  const next = current.filter(t => t.id !== templateId)
  await saveSettings({ dechargeTemplates: next }, eventId)
}

/**
 * Enregistre une décharge signée :
 *   - Upload du PDF signé dans Storage
 *   - Ajout d'une entrée dans expo.decharges[] avec métadonnées
 *
 * @param {string} expoId
 * @param {object} dechargeData - {
 *     pdfBlob (Blob), templateId, customText,
 *     signatureOrganisateur: { dataUrl, signedBy },
 *     signatureExposant:     { dataUrl, signedBy },
 *     paymentSnapshot, documentHash
 *   }
 * @param {string|null} evId
 * @returns {Promise<object>} l'enregistrement créé
 */
export const saveSignedDecharge = async (expoId, dechargeData, evId = null) => {
  const { ref: sref, uploadBytes, getDownloadURL } = await import('firebase/storage')
  const { storage } = await import('./config')
  const eventId = evId || getEventId()
  if (!eventId || !expoId) throw new Error('Paramètres invalides')
  if (!dechargeData.pdfBlob) throw new Error('PDF de décharge manquant')

  const now = new Date()
  const dechargeId = 'dch-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
  const filename = `decharge-${dechargeId}.pdf`
  const path = `events/${eventId}/expositions/${expoId}/decharges/${filename}`

  // Upload du PDF dans Storage
  const fileRef = sref(storage, path)
  await uploadBytes(fileRef, dechargeData.pdfBlob, { contentType: 'application/pdf' })
  const pdfUrl = await getDownloadURL(fileRef)

  // Métadonnées à stocker (les signatures dataURL peuvent être lourdes ;
  // on les garde tout de même pour avoir une preuve directe dans Firestore)
  const dechargeRecord = {
    id:              dechargeId,
    generatedAt:     now.toISOString(),
    templateId:      dechargeData.templateId || null,
    customText:      dechargeData.customText || null,
    paymentSnapshot: dechargeData.paymentSnapshot || null,
    signatureOrganisateur: {
      dataUrl:   dechargeData.signatureOrganisateur?.dataUrl || null,
      signedBy:  dechargeData.signatureOrganisateur?.signedBy || '—',
      signedAt:  now.toISOString(),
    },
    signatureExposant: {
      dataUrl:   dechargeData.signatureExposant?.dataUrl || null,
      signedBy:  dechargeData.signatureExposant?.signedBy || '—',
      signedAt:  now.toISOString(),
    },
    documentHash:    dechargeData.documentHash || null,
    pdfPath:         path,
    pdfUrl,
  }

  // Append à la liste des décharges de l'exposant (Firestore arrayUnion équivalent : lecture + écriture)
  const expoRef = doc(expoCol(eventId), expoId)
  const snap = await getDoc(expoRef)
  if (!snap.exists()) throw new Error('Exposant introuvable')
  const decharges = Array.isArray(snap.data().decharges) ? snap.data().decharges : []
  await updateDoc(expoRef, {
    decharges: [...decharges, dechargeRecord],
    updatedAt: serverTimestamp(),
  })

  await audit('EXPO_DECHARGE_SIGNED', {
    expoId, dechargeId,
    label: `Décharge signée pour ${snap.data().nom || expoId}`,
  })

  return dechargeRecord
}

/**
 * Supprime une décharge signée (admin uniquement).
 * Supprime aussi le PDF du Storage.
 */
export const deleteSignedDecharge = async (expoId, dechargeId, evId = null) => {
  const { ref: sref, deleteObject } = await import('firebase/storage')
  const { storage } = await import('./config')
  const eventId = evId || getEventId()
  if (!eventId || !expoId || !dechargeId) throw new Error('Paramètres invalides')

  const expoRef = doc(expoCol(eventId), expoId)
  const snap = await getDoc(expoRef)
  if (!snap.exists()) throw new Error('Exposant introuvable')
  const decharges = Array.isArray(snap.data().decharges) ? snap.data().decharges : []
  const target = decharges.find(d => d.id === dechargeId)
  if (!target) throw new Error('Décharge introuvable')

  // Supprime le PDF du Storage (best-effort)
  if (target.pdfPath) {
    try { await deleteObject(sref(storage, target.pdfPath)) }
    catch (e) { console.warn('deleteSignedDecharge storage:', e.message) }
  }

  await updateDoc(expoRef, {
    decharges: decharges.filter(d => d.id !== dechargeId),
    updatedAt: serverTimestamp(),
  })

  await audit('EXPO_DECHARGE_DELETE', { expoId, dechargeId, label: `Suppression décharge ${dechargeId}` })
}

// ════════════════════════════════════════════════════════════════════
// EXPOSANTS — Templates de facture (Lot B1)
// ════════════════════════════════════════════════════════════════════
// Les templates sont stockés dans settings.invoiceTemplates : tableau d'objets
// {id, nom, isDefault, format, elements: [...]}.
// Le template marqué isDefault est utilisé automatiquement quand on génère une
// facture sans en sélectionner.

/**
 * Sauvegarde (création ou mise à jour) d'un template de facture.
 *
 * @param {object} template - { id?, nom, format, elements, isDefault? }
 * @param {string|null} evId
 * @returns le template normalisé sauvegardé
 */
export const saveInvoiceTemplate = async (template, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement courant')
  if (!template?.nom?.trim()) throw new Error('Le nom du template est requis')
  if (!Array.isArray(template.elements)) throw new Error('Liste d\'éléments invalide')

  const s = await getSettings(eventId)
  const current = Array.isArray(s?.invoiceTemplates) ? s.invoiceTemplates : []

  const cleaned = {
    id:        template.id || ('inv-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)),
    nom:       template.nom.trim(),
    format:    template.format || 'A4',
    elements:  template.elements,
    isDefault: !!template.isDefault,
    createdAt: template.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  // Si on marque ce template comme "défaut", retirer le flag des autres
  let next
  const idx = current.findIndex(t => t.id === cleaned.id)
  if (cleaned.isDefault) {
    const others = current.map(t => ({ ...t, isDefault: false }))
    next = idx >= 0
      ? [...others.slice(0, idx), cleaned, ...others.slice(idx + 1)]
      : [...others, cleaned]
  } else {
    next = idx >= 0
      ? [...current.slice(0, idx), cleaned, ...current.slice(idx + 1)]
      : [...current, cleaned]
  }

  await saveSettings({ invoiceTemplates: next }, eventId)
  await audit('INVOICE_TPL_SAVE', { templateId: cleaned.id, label: `Template facture : ${cleaned.nom}` })
  return cleaned
}

/**
 * Supprime un template de facture.
 */
export const deleteInvoiceTemplate = async (templateId, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId || !templateId) throw new Error('Paramètres invalides')
  const s = await getSettings(eventId)
  const current = Array.isArray(s?.invoiceTemplates) ? s.invoiceTemplates : []
  const next = current.filter(t => t.id !== templateId)
  await saveSettings({ invoiceTemplates: next }, eventId)
  await audit('INVOICE_TPL_DELETE', { templateId, label: `Suppression template facture ${templateId}` })
}

/**
 * Duplique un template existant. Le clone reçoit un nouvel id et un nom suffixé.
 */
export const duplicateInvoiceTemplate = async (templateId, evId = null) => {
  const eventId = evId || getEventId()
  const s = await getSettings(eventId)
  const current = Array.isArray(s?.invoiceTemplates) ? s.invoiceTemplates : []
  const source = current.find(t => t.id === templateId)
  if (!source) throw new Error('Template introuvable')
  const copy = {
    ...JSON.parse(JSON.stringify(source)),
    id: 'inv-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    nom: `${source.nom} (copie)`,
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await saveSettings({ invoiceTemplates: [...current, copy] }, eventId)
  return copy
}

/**
 * Récupère un template par son id, ou null si non trouvé.
 * Utilisé au moment de générer une facture pour appliquer le bon template.
 */
export const getInvoiceTemplate = async (templateId, evId = null) => {
  if (!templateId) return null
  const eventId = evId || getEventId()
  const s = await getSettings(eventId)
  const templates = Array.isArray(s?.invoiceTemplates) ? s.invoiceTemplates : []
  return templates.find(t => t.id === templateId) || null
}

/**
 * Récupère le template marqué "défaut", ou null si aucun.
 * Quand null est retourné, le code appelant doit utiliser DEFAULT_INVOICE_TEMPLATE
 * (constante statique) en fallback.
 */
export const getDefaultInvoiceTemplate = async (evId = null) => {
  const eventId = evId || getEventId()
  const s = await getSettings(eventId)
  const templates = Array.isArray(s?.invoiceTemplates) ? s.invoiceTemplates : []
  return templates.find(t => t.isDefault) || null
}

/**
 * Importe un template de facture depuis un objet JSON (typiquement issu d'un export).
 * Régénère un id pour éviter les collisions avec l'existant ou avec d'autres events.
 * Force isDefault à false (l'utilisateur peut le redéfinir ensuite manuellement).
 *
 * @param {object} importedJson - objet template
 * @param {string|null} evId
 * @returns le template importé tel qu'il a été sauvegardé
 */
export const importInvoiceTemplate = async (importedJson, evId = null) => {
  const eventId = evId || getEventId()
  if (!eventId) throw new Error('Aucun événement courant')
  if (!importedJson || typeof importedJson !== 'object') {
    throw new Error('Fichier importé invalide (pas un JSON)')
  }
  if (!importedJson.nom || !Array.isArray(importedJson.elements)) {
    throw new Error('Le fichier ne ressemble pas à un template de facture')
  }
  // Validation minimale : chaque élément a un type connu
  const validTypes = ['text','paragraph','image','field','table','line','rect']
  for (const el of importedJson.elements) {
    if (!el.type || !validTypes.includes(el.type)) {
      throw new Error(`Élément invalide dans le template (type: ${el.type})`)
    }
  }
  // Régénère un id propre et force isDefault à false (sécurité)
  const cleaned = {
    nom: String(importedJson.nom || 'Template importé').trim(),
    format: importedJson.format || 'A4',
    elements: importedJson.elements,
    isDefault: false,
  }
  return await saveInvoiceTemplate(cleaned, eventId)
}

// ═══════════════════════════════════════════════════════════════════════
// MODULE FINANCES D'ORGANISATION (Lot Finances 1)
// ═══════════════════════════════════════════════════════════════════════
// Mouvements financiers manuels hors cashless : dépenses d'organisation
// (courses, matériel, défraiements…) et recettes (subventions, sponsors…).
// Alimentent le compte de résultat du rapport de clôture.
//
// Structure d'un mouvement (collection events/{eid}/finances) :
// {
//   sens: 'depense' | 'recette',
//   montant: number,            // EN CENTIMES (cohérent avec le reste de l'app)
//   categorie: string,          // libellé de catégorie (prédéfinie ou custom)
//   libelle: string,            // description libre
//   date: 'YYYY-MM-DD',         // date du mouvement (saisie)
//   modePaiement: 'especes' | 'virement' | 'cheque' | 'cb' | 'autre',
//   statut: 'paye' | 'prevu',
//   notes: string,
//   createdBy, createdAt, updatedAt,
//   // Lot Finances 2 (à venir) : pieceJointe (URL/base64)
// }

// Catégories prédéfinies de départ. L'utilisateur peut en ajouter (stockées
// dans settings.financeCategories), ces valeurs servent de socle initial.
export const FINANCE_CATEGORIES_DEFAULT = {
  depense: ['Courses alimentaires', 'Matériel', 'Déplacement', 'Abonnement',
            'Communication', 'Location', 'Autre'],
  recette: ['Subvention', 'Sponsor', 'Don', 'Billetterie', 'Autre'],
}

export const watchFinances = (callback, evId = null) => {
  const eid = evId || getEventId()
  if (!eid) { callback([]); return () => {} }
  return onSnapshot(
    query(collection(db, 'events', eid, 'finances'), orderBy('createdAt', 'desc')),
    snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
    () => callback([])
  )
}

// Lecture ponctuelle complète (pour le rapport de clôture).
export const getAllFinances = async (evId = null) => {
  const eid = evId || getEventId()
  if (!eid) return []
  const snap = await getDocs(query(
    collection(db, 'events', eid, 'finances'), orderBy('createdAt', 'desc')
  ))
  return snap.docs.map(d => ({ ...d.data(), id: d.id }))
}

const sanitizeFinance = (data) => {
  const sens = data.sens === 'recette' ? 'recette' : 'depense'
  const montant = Math.round(Math.abs(Number(data.montant) || 0))
  const statut = data.statut === 'prevu' ? 'prevu' : 'paye'
  const modes = ['especes', 'virement', 'cheque', 'cb', 'autre']
  const modePaiement = modes.includes(data.modePaiement) ? data.modePaiement : 'autre'
  return {
    sens,
    montant,
    categorie: String(data.categorie || 'Autre').trim().slice(0, 60),
    libelle: String(data.libelle || '').trim().slice(0, 200),
    date: data.date || nowStr(),
    modePaiement,
    statut,
    notes: String(data.notes || '').trim().slice(0, 500),
  }
}

export const addFinance = async (data, author = null, evId = null) => {
  const eid = evId || getEventId()
  if (!eid) throw new Error('Aucun événement courant')
  const clean = sanitizeFinance(data)
  if (clean.montant <= 0) throw new Error('Le montant doit être positif.')
  const ref = await addDoc(collection(db, 'events', eid, 'finances'), {
    ...clean,
    createdBy: author ? { uid: author.uid || null, nom: author.nom || '—' } : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await audit('FINANCE_CREATE', {
    financeId: ref.id, sens: clean.sens, montant: clean.montant,
    userType: 'admin',
    label: `${clean.sens === 'recette' ? 'Recette' : 'Dépense'} : ${clean.libelle || clean.categorie} (${(clean.montant / 100).toFixed(2)} €)`,
  })
  return { id: ref.id, ...clean }
}

export const updateFinance = async (id, patch, evId = null) => {
  const eid = evId || getEventId()
  if (!eid || !id) throw new Error('Paramètres invalides')
  const clean = sanitizeFinance(patch)
  if (clean.montant <= 0) throw new Error('Le montant doit être positif.')
  await updateDoc(doc(db, 'events', eid, 'finances', id), {
    ...clean, updatedAt: serverTimestamp(),
  })
  await audit('FINANCE_UPDATE', {
    financeId: id, userType: 'admin',
    label: `Modification mouvement : ${clean.libelle || clean.categorie}`,
  })
}

export const deleteFinance = async (id, evId = null) => {
  const eid = evId || getEventId()
  if (!eid || !id) throw new Error('Paramètres invalides')
  await deleteDoc(doc(db, 'events', eid, 'finances', id))
  await audit('FINANCE_DELETE', { financeId: id, userType: 'admin',
    label: 'Suppression mouvement financier' })
}

// ════════════════════════════════════════════════════════════════════
// FINANCES — Pièces jointes (Lot Finances 2)
// ════════════════════════════════════════════════════════════════════
// Attache des justificatifs (factures, reçus : images ou PDF) à un mouvement
// financier. Stockage Firebase Storage. Pattern identique à uploadCachetDocument.
// Le mouvement porte un tableau `documents: [{ name, url, path, size, type, uploadedAt }]`.

export const uploadFinanceDocument = async (financeId, file, onProgress = null, evId = null) => {
  const { ref: sref, uploadBytesResumable, getDownloadURL } = await import('firebase/storage')
  const { storage } = await import('./config')
  const eid = evId || getEventId()
  if (!eid || !financeId) throw new Error('Paramètres invalides')
  if (!file) throw new Error('Aucun fichier sélectionné')
  if (file.size > 10 * 1024 * 1024) throw new Error('Fichier trop volumineux (max 10 Mo)')

  const safeName = file.name.replace(/[^\w.\-]+/g, '_')
  const path = `events/${eid}/finances/${financeId}/${Date.now()}-${safeName}`
  const fileRef = sref(storage, path)

  const url = await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(fileRef, file)
    task.on('state_changed',
      (snap) => {
        if (onProgress) onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100))
      },
      (err) => reject(err),
      async () => {
        try { resolve(await getDownloadURL(task.snapshot.ref)) }
        catch (e) { reject(e) }
      }
    )
  })

  const docMeta = {
    name: file.name, url, path,
    size: file.size,
    type: file.type || 'application/octet-stream',
    uploadedAt: new Date().toISOString(),
  }
  const ref = doc(db, 'events', eid, 'finances', financeId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Mouvement introuvable')
  const current = snap.data().documents || []
  await updateDoc(ref, { documents: [...current, docMeta], updatedAt: serverTimestamp() })

  await audit('FINANCE_DOC_UPLOAD', { financeId, userType: 'admin',
    label: `Justificatif ajouté : ${file.name} (${(file.size / 1024).toFixed(0)} Ko)` })
  return docMeta
}

export const deleteFinanceDocument = async (financeId, path, evId = null) => {
  const { ref: sref, deleteObject } = await import('firebase/storage')
  const { storage } = await import('./config')
  const eid = evId || getEventId()
  if (!eid || !financeId || !path) throw new Error('Paramètres invalides')

  try { await deleteObject(sref(storage, path)) }
  catch (e) { console.warn('deleteFinanceDocument storage:', e.message) }

  const ref = doc(db, 'events', eid, 'finances', financeId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Mouvement introuvable')
  const current = snap.data().documents || []
  await updateDoc(ref, {
    documents: current.filter(d => d.path !== path),
    updatedAt: serverTimestamp(),
  })
  await audit('FINANCE_DOC_DELETE', { financeId, userType: 'admin',
    label: 'Justificatif supprimé' })
}
