/**
 * api/_em/envoiAcces.js — envoie à Event Manager le lien d'accès YllaCash de chaque bénévole
 *
 * Règle d'échange Event Manager ↔ YllaCash v1.3 (maquette validée le 28/11/2026) :
 *   POST /api/public/billetterie (même adresse et même clé que les entrées)
 *   { id: <32 hex>, type: 'acces', acces: [{ id: <benevoles[].id d'Event Manager>, lien: 'https://…' | null, depuis? }] }
 *   500 éléments au plus par message. Même lien renvoyé = rien ; lien différent = remplace l'ancien
 *   et Event Manager envoie un e-mail au bénévole ; null = accès retiré.
 *
 * Seulement si l'organisateur a activé « Accès des bénévoles » dans Liaisons (liaisons-em/{ev}.acces.actif).
 * Le lien n'est jamais écrit dans un journal ni dans une fiche : la fiche du bénévole garde seulement
 * accesEm { envoyeMs, empreinte } (empreinte du lien) pour savoir s'il faut le renvoyer.
 * « Renouveler le lien » change la clé : l'empreinte change, le nouveau lien part au tour suivant.
 */
const crypto = require('crypto')
const { newMessageId } = require('../_billets/core')
const { postEm } = require('./envoiRetour')

const MAX_PAR_MESSAGE = 500
// Vérification toutes les 5 minutes (comme la lecture) : chaque tour relit les fiches et les clés
const INTERVALLE_MS = 5 * 60_000
// 28/11/2026 : domaine public de l'appli, choisi par l'organisateur (YLLACASH_URL le remplace)
const BASE_DEFAUT = 'https://festishop.festylla.com'

const empreinteLien = (lien) => crypto.createHash('sha256').update(lien).digest('hex').slice(0, 24)
const nouvelleCle = () => crypto.randomBytes(16).toString('hex')   // même format que publicSession.js
const lienBenevole = (base, ev, ficheId, cle) => `${base}/benevole?id=${encodeURIComponent(ficheId)}&ev=${encodeURIComponent(ev)}&k=${cle}`

/**
 * Ce qui doit partir, sans Firestore (testé).
 * fiches : [{ id, emId, actif, accesEm }] ; cleDe(ficheId) → clé du lien (ou null s'il faut la créer)
 * Renvoie { aEnvoyer: [{ ficheId, item, empreinte }], aCreer: [ficheId], comptes: { envoyes, attente } }
 */
function preparerAcces(fiches, cleDe, { base, ev, creer = nouvelleCle }) {
  const aEnvoyer = [], aCreer = []
  let envoyes = 0, attente = 0
  for (const f of fiches) {
    if (!f.emId) continue
    const a = f.accesEm || {}
    if (f.actif === false) {
      // Retiré d'Event Manager : on retire l'accès une fois, s'il avait été envoyé
      if (a.empreinte) aEnvoyer.push({ ficheId: f.id, item: { id: f.emId, lien: null }, empreinte: null })
      continue
    }
    let cle = cleDe(f.id)
    if (!cle) { cle = creer(); aCreer.push({ ficheId: f.id, cle }) }
    const lien = lienBenevole(base, ev, f.id, cle)
    const e = empreinteLien(lien)
    if (a.empreinte === e) { envoyes++; continue }
    attente++
    aEnvoyer.push({ ficheId: f.id, item: { id: f.emId, lien }, empreinte: e })
  }
  return { aEnvoyer, aCreer, comptes: { envoyes, attente } }
}

/**
 * Un tour pour un événement. io = { state, fiches(), cleDe(id), creerCles([{ficheId, cle}]), post(body),
 * marquer(ficheId, accesEm), save(state) }
 */
async function executerAcces(io, { now = Date.now(), base = BASE_DEFAUT, ev, newId = newMessageId, force = false } = {}) {
  const state = io.state || {}
  if (!state.actif) return { envoye: false }
  if (!force && typeof state.verifMs === 'number' && now - state.verifMs < INTERVALLE_MS) return { envoye: false }
  const fiches = await io.fiches()
  const cles = await io.cles()
  const p = preparerAcces(fiches, (id) => cles[id] || null, { base, ev })
  if (p.aCreer.length) await io.creerCles(p.aCreer)
  let { envoyes, attente } = p.comptes
  const next = { ...state, envoyes, attente, verifMs: now }
  let echec = null
  for (let i = 0; i < p.aEnvoyer.length; i += MAX_PAR_MESSAGE) {
    const lot = p.aEnvoyer.slice(i, i + MAX_PAR_MESSAGE)
    const r = await io.post({ id: newId(), type: 'acces', acces: lot.map(x => x.item) })
    if (!r.ok) { echec = { status: r.status || 0, detail: `${r.status || 'réseau'} ${r.text || ''}`.trim().slice(0, 200) }; break }
    for (const x of lot) {
      await io.marquer(x.ficheId, x.empreinte ? { envoyeMs: now, empreinte: x.empreinte } : { retireMs: now, empreinte: null })
      if (x.empreinte) { envoyes++; attente-- }
    }
    next.dernierEnvoiMs = now
  }
  next.envoyes = envoyes
  next.attente = attente
  next.essaiMs = p.aEnvoyer.length ? now : (state.essaiMs ?? null)
  next.echec = echec ? { ...echec, depuisMs: state.echec?.depuisMs || now } : (p.aEnvoyer.length ? null : (state.echec || null))
  await io.save(next)
  return { envoye: p.aEnvoyer.length > 0, echec }
}

/** Branchement sur Firestore pour un événement */
function firestoreIoAcces(db, ev, { key, state, url, fetchImpl }) {
  const evRef = db.collection('events').doc(ev)
  return {
    state,
    fiches: async () => (await evRef.collection('benevoles').where('source', '==', 'event-manager').get())
      .docs.map(d => ({ id: d.id, emId: d.data().emId, actif: d.data().actif, accesEm: d.data().accesEm })),
    cles: async () => {
      const s = await evRef.collection('liens').where('kind', '==', 'benevole').get()
      const out = {}
      for (const d of s.docs) if (d.data().id && d.data().cle) out[d.data().id] = d.data().cle
      return out
    },
    creerCles: async (list) => {
      const { FieldValue } = require('firebase-admin').firestore
      for (const { ficheId, cle } of list) {
        await evRef.collection('liens').doc(`benevole-${ficheId}`).set({ cle, kind: 'benevole', id: ficheId, creeLe: FieldValue.serverTimestamp(), creePar: 'event-manager' })
      }
    },
    post: (body) => postEm(url, key, body, fetchImpl),
    marquer: (ficheId, accesEm) => evRef.collection('benevoles').doc(ficheId).set({ accesEm }, { merge: true }),
    save: async (next) => {
      await db.collection('liaisons-em').doc(ev).update({ acces: next })
      // Lisible par l'équipe (page Bénévoles) : activé ou non, et la panne en cours
      await evRef.update({ emAcces: { actif: !!next.actif, echec: next.echec ? { status: next.echec.status, depuisMs: next.echec.depuisMs } : null } })
    },
  }
}

module.exports = { preparerAcces, executerAcces, firestoreIoAcces, empreinteLien, lienBenevole, MAX_PAR_MESSAGE, BASE_DEFAUT }
