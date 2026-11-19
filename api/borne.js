/**
 * api/borne.js — Vercel Serverless Function : commandes des bénévoles à la borne
 *
 * Choix de l'organisateur (19/11/2026) : la borne n'a aucun accès direct aux fiches des bénévoles ;
 * c'est ce service qui vérifie et décompte. Réservé à la session de la borne de l'événement.
 *
 * POST /api/borne
 *   { action: 'ouvrir', ev, id, cle }                    QR du bénévole : vérifie la clé de son lien
 *                                                         personnel, renvoie son nom et ses droits du jour
 *   { action: 'commander', ev, id, cle, lignes }         commande passée à la borne (lignes : [{ id, qty }])
 *   { action: 'commander', ev, code }                    code à 6 chiffres reçu dans l'espace bénévole
 * Commander, en un seul enregistrement : droits du jour décomptés, stock, réservation bénévole
 * remise (comptée dans le retour vers Event Manager), commande, valeur offerte (benev-retrait),
 * et code passé à « utilisé ». Un seul ticket, pour le stand coché « Stand des bénévoles ».
 * Limite d'essais sur les clés : la même que pour l'ouverture des pages publiques.
 */
const { blockedMinutes, afterFailure, counterKey, PUBLIC_LIMIT, sameKey } = require('./_auth/core')
const { admin, getDb, clientIp, verifyCaller } = require('./_auth/server')
const { readBody } = require('./_billets/admin')
const { festDay } = require('./_em/retour')
const { restants, preparerCommande, standBenevoles } = require('./_borne/benevole')

const ID = /^[\w-]{1,128}$/
const CODE = /^\d{6}$/
const parisDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
const parisTime = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const parisDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' })

class Refus extends Error { constructor(status, message) { super(message); this.status = status } }

const nomDe = (b) => [b.prenom, b.nom].filter(Boolean).join(' ').trim() || b.nom || 'Bénévole'

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST attendu.' }); return }
  let body
  try { body = (await readBody(req)) || {} } catch { res.status(400).json({ error: 'Requête illisible.' }); return }
  const ev = String(body.ev || '')
  if (!ID.test(ev)) { res.status(400).json({ error: 'Événement manquant.' }); return }
  const caller = await verifyCaller(req)
  if (!caller || caller.type !== 'borne' || !(caller.eventIds || []).includes(ev)) {
    res.status(403).json({ error: 'Réservé à la borne de cet événement.' }); return
  }
  let db
  try { db = getDb() } catch { res.status(503).json({ error: 'Service indisponible.' }); return }
  const evRef = db.collection('events').doc(ev)
  const now = Date.now()
  const jour = festDay(now)

  // Vérifie la clé du lien personnel (QR du bénévole), avec la limite d'essais
  const verifierLien = async (id, cle) => {
    if (!ID.test(id)) throw new Refus(400, 'QR incomplet.')
    const ipRef = db.collection('securite-connexions').doc(counterKey('pub', clientIp(req)))
    const ipRec = (await ipRef.get()).data()
    const wait = blockedMinutes(ipRec, now)
    if (wait) throw new Refus(429, `Trop d'essais depuis cette borne. Réessayez dans ${wait} minutes.`)
    const lien = await evRef.collection('liens').doc(`benevole-${id}`).get()
    if (!lien.exists || !sameKey(String(cle || '').toLowerCase(), lien.data().cle)) {
      await ipRef.set(afterFailure(ipRec, now, PUBLIC_LIMIT))
      throw new Refus(401, "Ce QR n'est pas ou plus valable. Demandez un nouveau lien à l'organisation.")
    }
  }

  try {
    if (body.action === 'ouvrir') {
      const id = String(body.id || '')
      await verifierLien(id, body.cle)
      const b = await evRef.collection('benevoles').doc(id).get()
      if (!b.exists) throw new Refus(404, 'Fiche bénévole introuvable.')
      res.status(200).json({ benevole: { id, nom: nomDe(b.data()) }, restants: restants(b.data(), jour), jour })
      return
    }

    if (body.action === 'commander') {
      let benevId, lignes, code = null
      if (body.code != null) {
        code = String(body.code)
        if (!CODE.test(code)) throw new Refus(400, 'Code à 6 chiffres attendu.')
        const c = await evRef.collection('codes').doc(code).get()
        if (!c.exists || c.data().origine !== 'benevole') throw new Refus(404, 'Code inconnu. Vérifiez les 6 chiffres.')
        benevId = String(c.data().benevoleId || '')
        lignes = (c.data().items || []).map(i => ({ id: i.id, qty: i.qty }))
      } else {
        benevId = String(body.id || '')
        await verifierLien(benevId, body.cle)
        lignes = Array.isArray(body.lignes) ? body.lignes.slice(0, 30) : []
      }
      if (!ID.test(benevId)) throw new Refus(400, 'Bénévole inconnu.')

      // Numéro de commande du jour (même compteur que l'appli)
      const counterRef = evRef.collection('_counters').doc(`commandes-${parisDay.format(new Date(now))}`)
      const numero = await db.runTransaction(async (t) => {
        const s = await t.get(counterRef)
        const n = s.exists ? (s.data().next || 1) : 1
        t.set(counterRef, { date: parisDay.format(new Date(now)), next: n + 1 }, { merge: true })
        return n
      })

      const r = await db.runTransaction(async (t) => {
        const bRef = evRef.collection('benevoles').doc(benevId)
        const codeRef = code ? evRef.collection('codes').doc(code) : null
        const ids = [...new Set(lignes.map(l => String(l.id || '')).filter(x => ID.test(x)))]
        const menuRefs = ids.map(x => evRef.collection('menu').doc(x))
        const [bSnap, carteSnap, codeSnap, ...menuSnaps] = await Promise.all([
          t.get(bRef), t.get(evRef.collection('settings').doc('carte')), codeRef ? t.get(codeRef) : null, ...menuRefs.map(x => t.get(x)),
        ])
        if (!bSnap.exists) throw new Refus(404, 'Fiche bénévole introuvable.')
        if (codeSnap) {
          const st = codeSnap.data().statut
          if (st === 'annule') throw new Refus(409, 'Ce code a été annulé.')
          if (st !== 'en_attente') throw new Refus(409, 'Ce code a déjà été utilisé.')
        }
        const menuById = new Map(menuSnaps.filter(s => s.exists).map(s => [s.id, s.data()]))
        const standBenev = standBenevoles(carteSnap.exists ? carteSnap.data() : null)
        let prep
        try { prep = preparerCommande({ benev: bSnap.data(), jour, lignes, menuById, standBenev }) }
        catch (e) { throw new Refus(409, e.message) }

        const benevNom = nomDe(bSnap.data())
        const resume = prep.items.map(i => i.nom + (i.qty > 1 ? ` ×${i.qty}` : '')).join(', ')
        const ts = admin.firestore.FieldValue.serverTimestamp()
        const inc = admin.firestore.FieldValue.increment
        const date = parisDate.format(new Date(now)), heure = parisTime.format(new Date(now)), iso = new Date(now).toISOString()
        const resaCode = code || `BNV-${numero}`

        t.update(bRef, Object.fromEntries(Object.entries(prep.champs).map(([k, q]) => [k, inc(q)])))
        prep.items.forEach(i => t.update(evRef.collection('menu').doc(i.id), { stock: inc(-i.qty) }))
        const resaRef = evRef.collection('reservations').doc()
        t.set(resaRef, {
          benevoleId: benevId, benevoleNom: benevNom, isBenev: true, jourConso: jour,
          items: prep.items.map(({ id, nom, prix, qty, typeConsommation }) => ({ id, nom, prix, qty, typeConsommation })),
          total: prep.valeur, status: 'collected', code: resaCode, numero, source: code ? 'code-benevole' : 'borne-benevole',
          date, createdAt: ts, collectedAt: ts, collectedBy: 'Ticket imprimé',
        })
        const cmdRef = evRef.collection('commandes').doc()
        t.set(cmdRef, {
          numero, numeroDay: parisDay.format(new Date(now)), specId: null, specNom: benevNom, benevoleId: benevId,
          items: prep.items.map(({ id, nom, qty, prixUnit, standId, standNumero, typeConsommation }) => ({
            id, nom, qty, prixUnit, total: 0, typeConsommation, ...(standId ? { standId, standNumero } : {}),
          })),
          total: 0, status: 'collected', paid: true, paidAt: ts, paidBy: 'Droits bénévole',
          createdAt: ts, createdBy: 'Borne (bénévole)', collectedAt: ts, collectedBy: 'Ticket imprimé',
          readyAt: null, readyBy: null, cancelledAt: null, cancelledBy: null, cancelReason: null, refunded: false,
          date, timestamp: iso, heure, source: 'benevole', code: resaCode, reservationId: resaRef.id,
        })
        t.set(evRef.collection('transactions').doc(), {
          benevoleId: benevId, benevoleNom: benevNom, specId: null, specNom: null, type: 'benev-retrait',
          label: `Retrait bénévole #${numero} (borne) : ${resume}`, items: prep.items.map(({ nom, qty, prix }) => ({ nom, qty, prix })),
          montant: prep.valeur, staff: 'Borne', resaId: resaRef.id, resaCode, commandeNumero: numero,
          date, timestamp: iso, heure, createdAt: ts,
        })
        if (codeRef) t.update(codeRef, { statut: 'utilise', utiliseLe: ts, commandeId: cmdRef.id, commandeNumero: numero })
        return { items: prep.items, parType: prep.parType, benevNom, stand: standBenev, commandeId: cmdRef.id }
      })

      await evRef.collection('audit').add({
        action: 'RETRAIT_BENEV_BORNE', benevoleId: benevId, montant: 0, staff: 'Borne',
        label: `Commande bénévole #${numero} à la borne${code ? ` (code ${code})` : ''}`,
        timestamp: new Date(now).toISOString(), createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {})
      res.status(200).json({
        numero, benevole: r.benevNom, parType: r.parType,
        stand: r.stand ? { id: r.stand.id, numero: r.stand.numero, nom: r.stand.nom } : null,
        items: r.items.map(({ nom, qty, typeConsommation, standId }) => ({ nom, qty, typeConsommation, standId })),
      })
      return
    }

    res.status(400).json({ error: 'Action inconnue.' })
  } catch (e) {
    if (e instanceof Refus) { res.status(e.status).json({ error: e.message }); return }
    console.error('borne:', e)
    res.status(500).json({ error: 'Commande impossible pour le moment, réessayez.' })
  }
}
