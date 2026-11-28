/**
 * api/_routes/qr.js — QR tournant et code de secours (servi à /api/qr)
 *
 * Choix de l'organisateur (20/11/2026) : on paie avec le QR tournant de son espace, vérifié ici.
 *
 * POST /api/qr
 *   { action: 'identifier', ev, qr }          borne ou équipe : QR tournant lu → compte du spectateur
 *   { action: 'identifier', ev, secours }     idem avec le code de secours (réglage « Scanner en panne »)
 *   { action: 'identifier', ev, commande }    borne : code de commande à 6 chiffres passé en ligne
 *                                             (le solde sera débité : il faut autoriser ce compte)
 *   { action: 'secours', ev }                 espace spectateur : demande un code de secours, valable
 *                                             90 s, seulement si « Scanner en panne » est activé
 *   { action: 'nouveau-lien', ev, docId }     billetterie (« Lien perdu », 20/11/2026) : nouvelle clé pour
 *                                             ce compte (l'ancienne ne vaut plus rien) et jeton à usage
 *                                             unique, valable 2 minutes, affiché en QR au guichet
 *   { action: 'ouvrir-lien', ev, jeton }      téléphone du spectateur, sans session : échange le jeton
 *                                             contre l'ouverture de son espace et sa nouvelle clé
 *   { action: 'billet-voir', ev, specId }     billetterie (23/11/2026) : état d'un billet (sans compte ?)
 *   { action: 'compte-billet', ev, docId, accords } billetterie : compte pour un billet acheté sans compte,
 *                                             à la demande du spectateur (3 accords), jeton 2 min comme ci-dessus
 *   { action: 'jetons-espace', ev }           espace bénévole ou artiste ouvert sans le lien personnel
 *                                             (23/11/2026) : le téléphone ne connaît pas la clé, le serveur
 *                                             calcule les QR tournants des 5 prochaines minutes (api/_qr/espace)
 *   { action: 'bracelet-etat' | 'bracelet-relier' | 'bracelet-modifier' | 'bracelet-code' | 'bracelet-bloquer', ev, … }
 *                                             espace spectateur (24/11/2026) : ses bracelets (plusieurs depuis le 28/11/2026)
 *                                             (voir braceletEspace et api/_qr/bracelet.js)
 * Pour la borne, une identification réussie ouvre une autorisation de 10 minutes sur ce seul compte
 * (events/{ev}/autorisations/{compte}) : les règles de la base ne laissent la borne lire ce compte
 * et débiter son solde que pendant ce temps. Limite d'essais : celle des pages publiques.
 */
const crypto = require('crypto')
const { blockedMinutes, afterFailure, counterKey, PUBLIC_LIMIT, newKey, spectatorSession } = require('../_auth/core')
const { cleDuCompte } = require('../_auth/cles')
const { admin, getDb, clientIp, verifyCaller, canManage, writeAudit } = require('../_auth/server')
const { readBody } = require('../_billets/admin')
const { lireJeton, jetonValable, lireSecours, nouveauSecours } = require('../_qr/tournant')
const { jetonsAVenir, lireJetonEspace, jetonEspaceValable } = require('../_qr/espace')
const { loadAccount } = require('../_auth/server')
const { assurerPorteMonnaie } = require('../_auth/porteMonnaie')
const { lireBracelet, erreurCode, empreinteCode, codeJuste, vueBracelet, numeroAffiche, reglagesBracelet, ESSAIS_MAX, MAX_BRACELETS } = require('../_qr/bracelet')
const { limitesBracelet, depenseDuJour, resteDuJour } = require('../_borne/bracelet')
const { festDay } = require('../_em/retour')

const ID = /^[\w-]{1,128}$/
const CODE = /^\d{6}$/
const AUTORISATION_MS = 10 * 60 * 1000
const SECOURS_MS = 90 * 1000
const JETON_MS = 2 * 60 * 1000
const JETON = /^[0-9a-f]{32}$/

// extra : champs ajoutés à la réponse (ex. bracelet : { etat, essais }) pour que l'écran sache quoi montrer
class Refus extends Error { constructor(status, message, extra = null) { super(message); this.status = status; this.extra = extra } }

async function trouver(evRef, id) {
  const col = evRef.collection('spectateurs')
  const direct = await col.doc(id).get()
  if (direct.exists && direct.data().id === id) return direct
  const q = await col.where('id', '==', id).limit(1).get()
  return q.empty ? null : q.docs[0]
}

/** Téléphone du spectateur : le QR du guichet (jeton à usage unique) ouvre son espace */
async function ouvrirLien(req, res, ev, body) {
  let db
  try { db = getDb() } catch { res.status(503).json({ error: 'Service indisponible.' }); return }
  const evRef = db.collection('events').doc(ev)
  const now = Date.now()
  try {
    const ipRef = db.collection('securite-connexions').doc(counterKey('pub', clientIp(req)))
    const ipRec = (await ipRef.get()).data()
    const wait = blockedMinutes(ipRec, now)
    if (wait) throw new Refus(429, `Trop d'essais. Réessayez dans ${wait} minutes.`)
    const jeton = String(body.jeton || '').toLowerCase()
    const ref = evRef.collection('jetons-lien').doc(JETON.test(jeton) ? jeton : '-')
    const docId = await db.runTransaction(async (t) => {
      const d = JETON.test(jeton) ? await t.get(ref) : null
      if (!d || !d.exists || d.data().utiliseLe || d.data().expMs < now) return null
      t.update(ref, { utiliseLe: admin.firestore.FieldValue.serverTimestamp(), utiliseMs: now })
      return d.data().specDoc
    })
    if (!docId) {
      await ipRef.set(afterFailure(ipRec, now, PUBLIC_LIMIT))
      throw new Refus(401, 'Ce QR a déjà servi ou a expiré. Demandez-en un nouveau à la billetterie.')
    }
    const [snap, cle] = await Promise.all([evRef.collection('spectateurs').doc(docId).get(), evRef.collection('cles').doc(docId).get()])
    if (!snap.exists || !cle.exists) throw new Refus(404, 'Compte introuvable.')
    const { uid, claims } = spectatorSession(ev, docId, snap.data())
    const token = await admin.auth().createCustomToken(uid, claims)
    res.status(200).json({ token, compte: { id: snap.data().id, docId, nom: snap.data().nom || '', cle: cle.data().cle } })
  } catch (e) {
    if (e instanceof Refus) { res.status(e.status).json({ error: e.message, ...(e.extra || {}) }); return }
    console.error('qr (ouvrir-lien):', e)
    res.status(500).json({ error: 'Ouverture impossible pour le moment, réessayez.' })
  }
}

/**
 * Relie un bracelet à un compte (espace ou guichet). Renvoie null si c'est fait, sinon la raison du refus.
 * Plusieurs bracelets par compte (28/11/2026) : les autres bracelets du compte restent actifs,
 * dans la limite de MAX_BRACELETS. code : 4 chiffres, ou null (bracelet de mineur sans code).
 * reglages : { prenom, mineur, plafondJour } déjà vérifiés (reglagesBracelet).
 */
async function relierBracelet(db, col, { numero, specDoc, specId, code, reglages = {}, par, now }) {
  const FV = admin.firestore.FieldValue
  const ref = col.doc(numero)
  const codeHash = code == null ? null : empreinteCode(String(code))
  return db.runTransaction(async (t) => {
    const [d, miens] = await Promise.all([t.get(ref), t.get(col.where('specDoc', '==', specDoc))])
    const b = d.exists ? d.data() : null
    if (b && b.specDoc !== specDoc && b.statut !== 'remplace') return 'Ce bracelet est déjà relié à un autre compte. Prenez-en un autre à l\'entrée ou au guichet.'
    if (b && b.specDoc === specDoc && b.statut === 'bloque') return 'Ce bracelet est bloqué. Prenez-en un nouveau à l\'entrée ou au guichet.'
    if (b && b.specDoc === specDoc && b.statut === 'actif') return 'Ce bracelet est déjà relié à votre compte.'
    const actifs = miens.docs.filter((m) => m.id !== numero && m.data().statut === 'actif').length
    if (actifs >= MAX_BRACELETS) return `${MAX_BRACELETS} bracelets au plus par compte. Bloquez-en un pour en relier un autre.`
    t.set(ref, {
      numero, specDoc, specId, statut: 'actif', codeHash, essais: 0,
      relieLe: FV.serverTimestamp(), relieMs: now, reliePar: par, codeLe: codeHash ? FV.serverTimestamp() : null,
      bloqueLe: null, bloqueMotif: null,
      prenom: reglages.prenom || '', mineur: !!reglages.mineur, plafondJour: reglages.plafondJour || null,
    })
    return null
  })
}

/**
 * Billetterie : bracelets au guichet (écran 2, maquette HFg4MmsMG1UknVgMuqfTke, 24/11/2026)
 *   'bracelet-guichet-voir'    { bracelet } | { docId } : état d'un bracelet scanné et son propriétaire,
 *                                ou le bracelet d'un spectateur retrouvé par son nom ou son billet
 *   'bracelet-guichet-relier'  { bracelet, docId, code, identite, staff } : relie un bracelet libre
 *   'bracelet-guichet-code'    { bracelet, code, identite, staff } : nouveau code (code oublié, ou
 *                                bloqué après 3 codes faux) ; débloque le bracelet
 *   'bracelet-guichet-bloquer' { bracelet, identite, staff } : bracelet perdu
 * La pièce d'identité est toujours vérifiée (identite: true) ; le spectateur tape lui-même son code.
 */
async function braceletGuichet(req, res, { db, evRef, ev, caller, body, now }) {
  const billetterie = caller.type === 'staff' && (['admin', 'super_admin', 'billetterie'].includes(caller.role) || await canManage(db, caller, 'bracelets'))
  if (!billetterie) throw new Refus(403, 'Réservé à la billetterie.')
  const FV = admin.firestore.FieldValue
  const col = evRef.collection('bracelets')
  const staff = String(body.staff || caller.uid || '').slice(0, 80)
  const compteDe = async (docId) => {
    const s = await evRef.collection('spectateurs').doc(String(docId)).get()
    if (!s.exists) return null
    const d = s.data()
    return { docId: s.id, id: d.id, nom: d.nom || '', solde: Number(d.solde) || 0, annule: !!(d.billet && d.billet.annule) }
  }
  const vue = (b) => b ? { numero: b.numero, statut: b.statut, motif: b.bloqueMotif || null, relieMs: b.relieMs || null, bloqueMs: b.bloqueMs || null } : null
  const audit = (action, numero, spec, label) => writeAudit(db, ev, { action, bracelet: numero, specId: spec ? spec.id : '', specNom: spec ? spec.nom : '', staff, userType: 'staff', label })
  const numeroLu = () => {
    const n = lireBracelet(body.bracelet)
    if (!n) throw new Refus(400, "Ce QR n'est pas celui d'un bracelet YllaCash.")
    return n
  }

  if (body.action === 'bracelet-guichet-voir') {
    if (body.docId != null) {
      if (!ID.test(String(body.docId))) throw new Refus(400, 'Compte manquant.')
      const compte = await compteDe(body.docId)
      if (!compte) throw new Refus(404, 'Compte introuvable.')
      const q = await col.where('specDoc', '==', compte.docId).get()
      const vus = q.docs.map((d) => d.data()).filter((b) => b.statut === 'actif' || b.statut === 'bloque')
      vus.sort((a, b) => (b.statut === 'actif') - (a.statut === 'actif') || (b.relieMs || 0) - (a.relieMs || 0))
      res.status(200).json({ compte, bracelet: vue(vus[0] || null) }); return
    }
    const numero = numeroLu()
    const d = await col.doc(numero).get()
    const b = d.exists ? d.data() : null
    if (!b || b.statut === 'remplace') { res.status(200).json({ bracelet: { numero, statut: 'libre' }, compte: null }); return }
    res.status(200).json({ bracelet: vue(b), compte: await compteDe(b.specDoc) }); return
  }

  if (body.identite !== true) throw new Refus(400, "Vérifiez d'abord une pièce d'identité au nom du spectateur.")
  const numero = numeroLu()

  if (body.action === 'bracelet-guichet-relier') {
    if (!ID.test(String(body.docId || ''))) throw new Refus(400, 'Spectateur manquant.')
    const err = erreurCode(body.code)
    if (err) throw new Refus(400, err)
    const compte = await compteDe(body.docId)
    if (!compte) throw new Refus(404, 'Compte introuvable.')
    if (compte.annule) throw new Refus(403, 'Ce billet a été annulé : pas de bracelet possible.')
    const refus = await relierBracelet(db, col, { numero, specDoc: compte.docId, specId: compte.id, code: body.code, par: staff || 'guichet', now })
    if (refus) throw new Refus(409, refus)
    await audit('BRACELET_RELIE', numero, compte, `Bracelet n° ${numeroAffiche(numero)} relié à ${compte.nom || compte.id} au guichet (identité vérifiée), code tapé par le spectateur`)
    res.status(200).json({ bracelet: { numero, statut: 'actif' }, compte }); return
  }

  const ref = col.doc(numero)
  const d = await ref.get()
  const b = d.exists ? d.data() : null
  if (!b || b.statut === 'remplace') throw new Refus(404, "Ce bracelet n'est relié à aucun compte.")
  const compte = await compteDe(b.specDoc)

  if (body.action === 'bracelet-guichet-code') {
    const err = erreurCode(body.code)
    if (err) throw new Refus(400, err)
    const etaitBloque = b.statut === 'bloque'
    await ref.update({ codeHash: empreinteCode(String(body.code)), essais: 0, statut: 'actif', bloqueLe: null, bloqueMs: null, bloqueMotif: null, codeLe: FV.serverTimestamp() })
    await audit(etaitBloque ? 'BRACELET_DEBLOQUE' : 'BRACELET_CODE_CHANGE', numero, compte,
      `Nouveau code pour le bracelet n° ${numeroAffiche(numero)} de ${compte ? (compte.nom || compte.id) : '?'} au guichet (identité vérifiée)${etaitBloque ? ' : bracelet débloqué' : ''}`)
    res.status(200).json({ bracelet: { numero, statut: 'actif' }, compte }); return
  }

  if (body.action === 'bracelet-guichet-bloquer') {
    if (b.statut === 'actif') {
      await ref.update({ statut: 'bloque', bloqueLe: FV.serverTimestamp(), bloqueMs: now, bloqueMotif: 'perdu' })
      await audit('BRACELET_BLOQUE', numero, compte, `Bracelet n° ${numeroAffiche(numero)} de ${compte ? (compte.nom || compte.id) : '?'} bloqué au guichet (perdu, identité vérifiée)`)
    }
    res.status(200).json({ bracelet: { numero, statut: 'bloque', motif: b.bloqueMotif || 'perdu' }, compte }); return
  }

  throw new Refus(400, 'Action inconnue.')
}

/**
 * Espace spectateur : ses bracelets (24/11/2026 ; plusieurs bracelets par compte le 28/11/2026)
 *   'bracelet-etat'                       : { bracelets } actifs et bloqués (et bracelet : le premier, ancien format)
 *   'bracelet-relier'  { bracelet, code?, prenom?, mineur?, plafondJour? } : relie le bracelet scanné ;
 *                                           code null = sans code (mineur, plafond obligatoire)
 *   'bracelet-modifier' { numero, prenom?, mineur?, plafondJour? } : « mineur » ne se décoche qu'au guichet
 *   'bracelet-code'    { numero?, code }  : nouveau code (essais remis à zéro) ; code null = retirer le code
 *   'bracelet-bloquer' { numero? }        : bracelet perdu, il ne permet plus de payer
 * Sans numero (ancien écran) : le bracelet actif le plus récent.
 * Le code n'est jamais choisi à la borne : seulement ici (session du spectateur) ou au guichet.
 */
async function braceletEspace(req, res, { db, evRef, ev, caller, body, now }) {
  if (caller.type !== 'spectateur' || !caller.specId || !caller.specDoc) throw new Refus(403, 'Ouvrez votre espace avec votre lien.')
  const specDoc = String(caller.specDoc)
  const col = evRef.collection('bracelets')
  const FV = admin.firestore.FieldValue
  const miens = async () => {
    const q = await col.where('specDoc', '==', specDoc).get()
    const vus = q.docs.map((d) => d.data()).filter((b) => b.statut === 'actif' || b.statut === 'bloque')
    vus.sort((a, b) => (b.statut === 'actif') - (a.statut === 'actif') || (a.relieMs || 0) - (b.relieMs || 0))
    return vus
  }
  const liste = async () => {
    const vus = await miens()
    return { bracelets: vus.map(vueBracelet), bracelet: vueBracelet(vus[0] || null) }
  }
  const nom = (b) => `n° ${numeroAffiche(b.numero)}${b.prenom ? ` (${b.prenom})` : ''}`
  const audit = (action, numero, label) => writeAudit(db, ev, { action, specId: caller.specId, bracelet: numero, userType: 'spectateur', staff: '', label })

  if (body.action === 'bracelet-etat') {
    res.status(200).json(await liste()); return
  }

  if (body.action === 'bracelet-relier') {
    const numero = lireBracelet(body.bracelet)
    if (!numero) throw new Refus(400, "Ce QR n'est pas celui d'un bracelet YllaCash.")
    const avecCode = body.code !== null
    if (avecCode) { const err = erreurCode(body.code); if (err) throw new Refus(400, err) }
    const r = reglagesBracelet(body, { avecCode })
    if (r.erreur) throw new Refus(400, r.erreur)
    const ipRef = db.collection('securite-connexions').doc(counterKey('pub', clientIp(req)))
    const ipRec = (await ipRef.get()).data()
    const wait = blockedMinutes(ipRec, now)
    if (wait) throw new Refus(429, `Trop d'essais. Réessayez dans ${wait} minutes.`)
    const refus = await relierBracelet(db, col, { numero, specDoc, specId: caller.specId, code: avecCode ? body.code : null, reglages: r.reglages, par: 'spectateur', now })
    if (refus) {
      await ipRef.set(afterFailure(ipRec, now, PUBLIC_LIMIT))
      throw new Refus(409, refus)
    }
    const g = r.reglages
    await audit('BRACELET_RELIE', numero, `Bracelet ${nom({ numero, prenom: g.prenom })} relié par le spectateur dans son espace, ${avecCode ? 'code choisi' : 'sans code'}${g.mineur ? ', mineur' : ''}${g.plafondJour ? `, plafond ${g.plafondJour} €/jour` : ''}`)
    res.status(200).json(await liste()); return
  }

  // Les autres actions visent un bracelet du compte : celui demandé, sinon le plus récent actif (ancien écran)
  const vus = await miens()
  const demande = body.numero != null ? lireBracelet(body.numero) : null
  if (body.numero != null && !demande) throw new Refus(400, 'Bracelet inconnu.')
  const b = demande ? vus.find((x) => x.numero === demande) : ([...vus].reverse().find((x) => x.statut === 'actif') || vus[0])
  if (!b) throw new Refus(404, 'Aucun bracelet relié à ce compte.')
  const ref = col.doc(b.numero)

  if (body.action === 'bracelet-modifier') {
    if (b.statut !== 'actif') throw new Refus(409, 'Ce bracelet est bloqué : il ne se modifie plus.')
    const r = reglagesBracelet(body, { avant: b, avecCode: !!b.codeHash })
    if (r.erreur) throw new Refus(400, r.erreur)
    await ref.update(r.reglages)
    await audit('BRACELET_MODIFIE', b.numero, `Bracelet ${nom({ ...b, ...r.reglages })} modifié par le spectateur${r.reglages.mineur ? ', mineur' : ''}${r.reglages.plafondJour ? `, plafond ${r.reglages.plafondJour} €/jour` : ', sans plafond'}`)
    res.status(200).json(await liste()); return
  }

  if (body.action === 'bracelet-code') {
    if (b.statut !== 'actif') throw new Refus(409, 'Ce bracelet est bloqué. Prenez-en un nouveau à l\'entrée ou au guichet.')
    if (body.code === null) {
      // Retirer le code : seulement pour un mineur, avec un plafond permis sans code
      const r = reglagesBracelet({}, { avant: b, avecCode: false })
      if (r.erreur) throw new Refus(400, r.erreur)
      await ref.update({ codeHash: null, essais: 0, codeLe: FV.serverTimestamp() })
      await audit('BRACELET_CODE_RETIRE', b.numero, `Code du bracelet ${nom(b)} retiré par le spectateur (mineur, plafond ${b.plafondJour} €/jour)`)
      res.status(200).json(await liste()); return
    }
    const err = erreurCode(body.code)
    if (err) throw new Refus(400, err)
    await ref.update({ codeHash: empreinteCode(String(body.code)), essais: 0, codeLe: FV.serverTimestamp() })
    await audit(b.codeHash ? 'BRACELET_CODE_CHANGE' : 'BRACELET_CODE_AJOUTE', b.numero, `Code du bracelet ${nom(b)} ${b.codeHash ? 'changé' : 'ajouté'} par le spectateur`)
    res.status(200).json(await liste()); return
  }

  if (body.action === 'bracelet-bloquer') {
    if (b.statut === 'actif') {
      await ref.update({ statut: 'bloque', bloqueLe: FV.serverTimestamp(), bloqueMs: now, bloqueMotif: 'perdu' })
      await audit('BRACELET_BLOQUE', b.numero, `Bracelet ${nom(b)} bloqué par le spectateur (perdu)`)
    }
    res.status(200).json(await liste()); return
  }

  throw new Refus(400, 'Action inconnue.')
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST attendu.' }); return }
  let body
  try { body = (await readBody(req)) || {} } catch { res.status(400).json({ error: 'Requête illisible.' }); return }
  const ev = String(body.ev || '')
  if (!ID.test(ev)) { res.status(400).json({ error: 'Événement manquant.' }); return }
  if (body.action === 'ouvrir-lien') return ouvrirLien(req, res, ev, body)
  const caller = await verifyCaller(req)
  const dansEv = caller && (caller.type === 'staff' ? (!(caller.eventIds || []).length || (caller.eventIds || []).includes(ev) || ['admin', 'super_admin'].includes(caller.role)) : (caller.eventIds || []).includes(ev))
  if (!caller || !dansEv) { res.status(403).json({ error: 'Session expirée : rouvrez la page.' }); return }
  let db
  try { db = getDb() } catch { res.status(503).json({ error: 'Service indisponible.' }); return }
  const evRef = db.collection('events').doc(ev)
  const now = Date.now()
  const secoursActif = async () => {
    const s = await evRef.collection('settings').doc('global').get()
    return s.exists && s.data().scannerEnPanne === true
  }

  try {
    // ── Espace spectateur : code de secours ──
    if (body.action === 'secours') {
      if (caller.type !== 'spectateur' || !caller.specId || !caller.specDoc) throw new Refus(403, 'Ouvrez votre espace avec votre lien.')
      if (!(await secoursActif())) throw new Refus(409, 'Le code de secours n\'est pas activé : présentez votre QR.')
      for (let essai = 0; essai < 6; essai++) {
        const code = nouveauSecours()
        const ref = evRef.collection('codes-secours').doc(code)
        const ok = await db.runTransaction(async (t) => {
          const d = await t.get(ref)
          if (d.exists && d.data().expMs > now) return false
          t.set(ref, { specId: caller.specId, specDoc: String(caller.specDoc), expMs: now + SECOURS_MS, createdAt: admin.firestore.FieldValue.serverTimestamp() })
          return true
        })
        if (ok) { res.status(200).json({ code, secondes: Math.round(SECOURS_MS / 1000) }); return }
      }
      throw new Refus(503, 'Aucun code libre, réessayez.')
    }

    // ── Espace bénévole ou artiste sans clé sur le téléphone : QR tournants calculés ici ──
    if (body.action === 'jetons-espace') {
      let kind = null, id = ''
      if (caller.type === 'benevole') {
        kind = 'benevole'
        const m = /^events\/([\w-]{1,128})\/benevoles\/([\w-]{1,128})$/.exec(String(caller.fiche || ''))
        if (m && m[1] === ev) id = m[2]
      } else if (caller.type === 'artiste') {
        kind = 'artiste'
        id = String(caller.creneauId || '')
      }
      if (!kind || !ID.test(id)) throw new Refus(403, "Réservé à l'espace bénévole ou artiste.")
      const lien = await evRef.collection('liens').doc(`${kind}-${id}`).get()
      const cle = lien.exists ? String(lien.data().cle || '') : ''
      if (!cle) throw new Refus(404, "Aucun lien personnel pour cet espace : demandez votre lien à l'organisation, ou commandez avec un code à 6 chiffres.")
      res.status(200).json({ jetons: jetonsAVenir({ kind, cle, ev, id, ms: now, n: 10 }) }); return
    }

    // ── Billetterie : donner un nouveau lien à un spectateur qui a perdu le sien ──
    if (body.action === 'nouveau-lien') {
      const billetterie = caller.type === 'staff' && (['admin', 'super_admin', 'billetterie'].includes(caller.role) || await canManage(db, caller, 'lien-perdu'))
      if (!billetterie) throw new Refus(403, 'Réservé à la billetterie.')
      const docId = String(body.docId || '')
      if (!ID.test(docId)) throw new Refus(400, 'Compte manquant.')
      const snap = await evRef.collection('spectateurs').doc(docId).get()
      if (!snap.exists) throw new Refus(404, 'Compte introuvable.')
      const spec = snap.data()
      if (spec.billet && spec.billet.annule) throw new Refus(403, 'Ce billet a été annulé : pas de nouveau lien.')
      if (spec.billet && spec.billet.sansCompte) throw new Refus(403, 'Billet sans compte, choisi ainsi à l\'achat : pas de lien possible. Son porteur commande à la billetterie.')
      const jeton = crypto.randomBytes(16).toString('hex')
      const batch = db.batch()
      // Nouvelle clé : l'ancien lien et l'ancien QR tournant ne valent plus rien
      batch.set(evRef.collection('cles').doc(docId), { cle: newKey(), changeLe: admin.firestore.FieldValue.serverTimestamp() })
      batch.update(snap.ref, { cle: admin.firestore.FieldValue.delete(), ...(spec.billet ? { 'billet.cle': admin.firestore.FieldValue.delete() } : {}) })
      batch.set(evRef.collection('jetons-lien').doc(jeton), {
        specDoc: docId, specId: spec.id, specNom: spec.nom || '', expMs: now + JETON_MS, utiliseLe: null,
        par: String(body.staff || caller.uid || '').slice(0, 80), createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      await batch.commit()
      // Les sessions déjà ouvertes avec l'ancien lien ne se renouvellent plus (au plus une heure)
      await admin.auth().revokeRefreshTokens(spectatorSession(ev, docId, spec).uid).catch(() => {})
      await writeAudit(db, ev, { action: 'NOUVEAU_LIEN_SPECTATEUR', specId: spec.id, specNom: spec.nom || '', staff: String(body.staff || caller.uid || ''), userType: 'staff',
        label: `Nouveau lien donné à ${spec.nom || spec.id} (identité vérifiée au guichet)` })
      res.status(200).json({ jeton, secondes: Math.round(JETON_MS / 1000) }); return
    }

    // ── Billetterie : compte pour un billet acheté « sans compte » (23/11/2026, refonte des rôles) ──
    // 'billet-voir'   { ev, specId }                     : état du billet (nom, pass, sans compte ou non)
    // 'compte-billet' { ev, docId, accords, staff }      : crée le compte à la demande du spectateur, avec
    //                  ses trois accords (demande, conditions, délai de remboursement) ; renvoie un jeton
    //                  à usage unique de 2 minutes, affiché en QR au guichet (comme « Lien perdu »)
    if (body.action === 'billet-voir' || body.action === 'compte-billet') {
      const billetterie = caller.type === 'staff' && (['admin', 'super_admin', 'billetterie'].includes(caller.role) || await canManage(db, caller, 'nouveau'))
      if (!billetterie) throw new Refus(403, 'Réservé à la billetterie.')
      if (body.action === 'billet-voir') {
        const specId = String(body.specId || '').toUpperCase()
        if (!/^FY-[A-Z0-9]{4,12}$/.test(specId)) throw new Refus(400, 'Code de billet illisible.')
        const snap = await trouver(evRef, specId)
        if (!snap || !snap.data().billet) { res.status(200).json({ trouve: false }); return }
        const s = snap.data(), b = s.billet
        res.status(200).json({ trouve: true, docId: snap.id, specId: s.id, nom: s.nom || '', pass: b.pass || '', jours: b.jours || 1,
          annule: !!b.annule, sansCompte: !!b.sansCompte }); return
      }
      const docId = String(body.docId || '')
      if (!ID.test(docId)) throw new Refus(400, 'Billet manquant.')
      const a = body.accords || {}
      if (a.demande !== true || a.conditions !== true || a.remboursement !== true) throw new Refus(400, 'Les trois accords du spectateur sont nécessaires.')
      const ref = evRef.collection('spectateurs').doc(docId)
      const jeton = crypto.randomBytes(16).toString('hex')
      const staff = String(body.staff || caller.uid || '').slice(0, 80)
      const spec = await db.runTransaction(async (t) => {
        const snap = await t.get(ref)
        if (!snap.exists || !snap.data().billet) throw new Refus(404, 'Billet introuvable.')
        const s = snap.data()
        if (s.billet.annule) throw new Refus(403, 'Ce billet a été annulé : pas de compte possible.')
        if (!s.billet.sansCompte) throw new Refus(409, 'Ce billet a déjà un compte : utilisez « Lien perdu ».')
        t.set(evRef.collection('cles').doc(docId), { cle: newKey(), creeLe: admin.firestore.FieldValue.serverTimestamp() })
        t.update(ref, {
          'billet.sansCompte': false,
          'billet.compteGuichet': { le: admin.firestore.FieldValue.serverTimestamp(), par: staff, accords: { demande: true, conditions: true, remboursement: true } },
        })
        t.set(evRef.collection('jetons-lien').doc(jeton), {
          specDoc: docId, specId: s.id, specNom: s.nom || '', expMs: now + JETON_MS, utiliseLe: null,
          par: staff, createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        return s
      })
      await writeAudit(db, ev, { action: 'COMPTE_GUICHET_BILLET', specId: spec.id, specNom: spec.nom || '', staff, userType: 'staff',
        label: `Compte créé au guichet pour ${spec.nom || spec.id} (billet sans compte, à sa demande, accords enregistrés)` })
      res.status(200).json({ jeton, secondes: Math.round(JETON_MS / 1000) }); return
    }

    // ── Espace spectateur : bracelet de secours (24/11/2026, écran 1 du bracelet) ──
    if (String(body.action || '').startsWith('bracelet-guichet-')) return await braceletGuichet(req, res, { db, evRef, ev, caller, body, now })
    if (String(body.action || '').startsWith('bracelet-')) return await braceletEspace(req, res, { db, evRef, ev, caller, body, now })

    if (body.action !== 'identifier') throw new Refus(400, 'Action inconnue.')
    if (!['borne', 'staff'].includes(caller.type)) throw new Refus(403, 'Réservé à la borne et à l\'équipe.')

    const ipRef = db.collection('securite-connexions').doc(counterKey('pub', clientIp(req)))
    const ipRec = (await ipRef.get()).data()
    const wait = blockedMinutes(ipRec, now)
    if (wait) throw new Refus(429, `Trop d'essais. Réessayez dans ${wait} minutes.`)
    const echec = async (status, message) => { await ipRef.set(afterFailure(ipRec, now, PUBLIC_LIMIT)); throw new Refus(status, message) }

    let snap = null
    let braceletLu = null   // bracelet présenté (28/11/2026) : limites éventuelles pour l'autorisation
    // Écran 13 (24/11/2026) : QR de l'espace d'un bénévole → son porte-monnaie (créé s'il n'existe pas)
    const luB = body.qr != null && !lireJeton(body.qr) ? lireJetonEspace(String(body.qr).slice(0, 400)) : null
    if (luB && luB.kind === 'benevole') {
      const lien = await evRef.collection('liens').doc(`benevole-${luB.id}`).get()
      if (!jetonEspaceValable({ lu: luB, cle: lien.exists ? String(lien.data().cle || '') : '', ev, ms: now })) {
        await echec(401, 'Ce QR n\'est plus valable : il change toutes les 30 secondes. Présentez celui affiché en ce moment.')
      }
      const account = await loadAccount(db, `events/${ev}/benevoles/${luB.id}`)
      if (!account) throw new Refus(404, 'Fiche bénévole introuvable.')
      const pm = await assurerPorteMonnaie(db, admin, account)
      snap = await evRef.collection('spectateurs').doc(pm.docId).get()
    } else if (body.qr != null) {
      const lu = lireJeton(body.qr)
      if (!lu) await echec(400, 'Ce QR n\'est pas reconnu. Présentez le QR de votre espace YllaCash.')
      snap = await trouver(evRef, lu.specId)
      if (!snap || !jetonValable({ lu, cle: await cleDuCompte(evRef, snap.id, snap.data()), ev, ms: now })) {
        await echec(401, 'Ce QR n\'est plus valable : il change toutes les 30 secondes. Présentez celui affiché en ce moment.')
      }
    } else if (body.secours != null) {
      const code = lireSecours(body.secours)
      if (!code) throw new Refus(400, 'Code de secours attendu : 2 lettres et 4 chiffres.')
      if (!(await secoursActif())) throw new Refus(409, 'Le code de secours n\'est pas activé.')
      const ref = evRef.collection('codes-secours').doc(code)
      const d = await ref.get()
      if (!d.exists || d.data().expMs < now) await echec(401, 'Code inconnu ou expiré : tapez celui affiché en ce moment.')
      await ref.delete().catch(() => {})   // à usage unique
      snap = await evRef.collection('spectateurs').doc(d.data().specDoc).get()
      if (!snap.exists) throw new Refus(404, 'Compte introuvable.')
    } else if (body.commande != null) {
      if (caller.type !== 'borne') throw new Refus(403, 'Réservé à la borne.')
      const code = String(body.commande)
      if (!CODE.test(code)) throw new Refus(400, 'Code à 6 chiffres attendu.')
      const c = await evRef.collection('codes').doc(code).get()
      if (!c.exists || c.data().origine !== 'en-ligne' || c.data().statut !== 'en_attente') await echec(404, 'Code inconnu ou déjà utilisé.')
      snap = await evRef.collection('spectateurs').doc(String(c.data().specDocId || c.data().specId)).get()
      if (!snap.exists) throw new Refus(404, 'Compte introuvable.')
    } else if (body.bracelet != null) {
      // Bracelet de secours (écran 3, 24/11/2026) : sans code, on dit seulement s'il faut le demander ;
      // avec le code, 3 codes faux d'affilée bloquent le bracelet (déblocage au guichet)
      if (caller.type !== 'borne') throw new Refus(403, 'Réservé à la borne.')
      const numero = lireBracelet(body.bracelet)
      if (!numero) await echec(400, "Ce QR n'est pas celui d'un bracelet YllaCash.")
      const ref = evRef.collection('bracelets').doc(numero)
      const d = await ref.get()
      const b = d.exists ? d.data() : null
      if (!b || b.statut === 'remplace') throw new Refus(404, "Ce bracelet n'est relié à aucun compte. Reliez-le dans votre espace YllaCash ou à la billetterie.", { etat: 'libre', numero })
      if (b.statut === 'bloque') throw new Refus(403, b.bloqueMotif === 'perdu' ? 'Ce bracelet a été déclaré perdu : il ne permet plus de payer.' : '3 codes incorrects : le bracelet est bloqué pour protéger votre solde.', { etat: 'bloque', motif: b.bloqueMotif || null, numero })
      // Bracelet de mineur sans code (28/11/2026) : identifié tout de suite, limité par son plafond
      if (b.codeHash && body.code == null) { res.status(200).json({ bracelet: { numero, statut: 'actif', avecCode: true, prenom: b.prenom || '' } }); return }
      braceletLu = b
      if (b.codeHash) {
      const juste = /^\d{4}$/.test(String(body.code)) && codeJuste(b, body.code)
      const resultat = await db.runTransaction(async (t) => {
        const x = (await t.get(ref)).data() || {}
        if (x.statut !== 'actif' || x.codeHash !== b.codeHash) return { refus: 'change' }
        if (juste) { if (x.essais) t.update(ref, { essais: 0 }); return { ok: true } }
        const essais = (Number(x.essais) || 0) + 1
        if (essais >= ESSAIS_MAX) {
          t.update(ref, { essais, statut: 'bloque', bloqueLe: admin.firestore.FieldValue.serverTimestamp(), bloqueMs: now, bloqueMotif: 'essais' })
          return { bloque: true }
        }
        t.update(ref, { essais })
        return { restants: ESSAIS_MAX - essais }
      })
      if (resultat.refus) throw new Refus(409, 'Ce bracelet vient de changer. Présentez-le à nouveau.')
      if (!resultat.ok) {
        // Pas de compteur par adresse réseau ici : tous les clients de la borne partagent la sienne ;
        // la limite de 3 essais du bracelet suffit
        if (resultat.bloque) {
          await writeAudit(db, ev, { action: 'BRACELET_BLOQUE', bracelet: numero, specId: b.specId || '', userType: 'borne', staff: '',
            label: `Bracelet n° ${numeroAffiche(numero)} bloqué à la borne après ${ESSAIS_MAX} codes incorrects` })
          throw new Refus(403, '3 codes incorrects : le bracelet est bloqué pour protéger votre solde.', { etat: 'bloque', motif: 'essais', numero })
        }
        throw new Refus(401, `Code incorrect : ${resultat.restants} essai${resultat.restants > 1 ? 's' : ''} restant${resultat.restants > 1 ? 's' : ''}.`, { etat: 'faux', essais: resultat.restants, numero })
      }
      }
      snap = await evRef.collection('spectateurs').doc(String(b.specDoc)).get()
      if (!snap.exists) throw new Refus(404, 'Compte introuvable.')
    } else {
      throw new Refus(400, 'QR ou code attendu.')
    }

    const spec = snap.data()
    if (spec.billet && spec.billet.annule) throw new Refus(403, 'Ce billet a été annulé : présentez-vous à la billetterie.')
    // Bracelet limité (mineur ou plafonné) : l'autorisation porte « limite » ; les règles de la base
    // interdisent alors à la borne de débiter elle-même, le serveur paie (api/borne, commander-bracelet)
    const limites = braceletLu ? limitesBracelet(braceletLu) : null
    if (caller.type === 'borne') {
      await evRef.collection('autorisations').doc(snap.id).set({
        specId: spec.id, exp: admin.firestore.Timestamp.fromMillis(now + AUTORISATION_MS), par: 'borne',
        ...(limites ? { limite: { numero: limites.numero } } : {}),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }
    let bracelet
    if (limites) {
      const txs = await evRef.collection('transactions').where('bracelet', '==', limites.numero).get()
      const jour = festDay(now)
      const depense = depenseDuJour(txs.docs.map(d => d.data()), jour, festDay)
      bracelet = { ...limites, resteJour: resteDuJour(limites, depense) }
    } else if (braceletLu) bracelet = { numero: braceletLu.numero, prenom: braceletLu.prenom || '' }
    res.status(200).json({
      compte: { id: spec.id, docId: snap.id, nom: spec.nom || '', solde: Number(spec.solde) || 0, ...(spec.porteMonnaieBenevole ? { benevole: true } : {}) },
      ...(bracelet ? { bracelet } : {}),
    })
  } catch (e) {
    if (e instanceof Refus) { res.status(e.status).json({ error: e.message, ...(e.extra || {}) }); return }
    console.error('qr:', e)
    res.status(500).json({ error: 'Vérification impossible pour le moment, réessayez.' })
  }
}
