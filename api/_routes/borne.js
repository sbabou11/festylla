/**
 * api/borne.js — Vercel Serverless Function : commandes des bénévoles à la borne
 *
 * Choix de l'organisateur (19/11/2026) : la borne n'a aucun accès direct aux fiches des bénévoles ;
 * c'est ce service qui vérifie et décompte. Réservé à la session de la borne de l'événement.
 *
 * POST /api/borne
 *   { action: 'ouvrir', ev, qr }                         QR tournant du bénévole (YB-…, 23/11/2026) : vérifie
 *                                                         sa signature avec la clé de son lien personnel, renvoie
 *                                                         son nom, ses droits du jour et un passage (10 minutes)
 *   { action: 'commander', ev, passage, lignes }         commande passée à la borne (lignes : [{ id, qty }]) ;
 *                                                         un QR tournant encore valable (qr) convient aussi
 *   { action: 'commander', ev, code }                    code à 6 chiffres reçu dans l'espace bénévole
 * Commander, en un seul enregistrement : droits du jour décomptés, stock, réservation bénévole
 * remise (comptée dans le retour vers Event Manager), commande, valeur offerte (benev-retrait),
 * et code passé à « utilisé ». Un seul ticket, pour le stand coché « Stand des bénévoles ».
 * Limite d'essais sur les QR : la même que pour l'ouverture des pages publiques.
 * Sécurité (23/11/2026) : l'ancien QR qui contenait le lien personnel avec sa clé (« cle »), parfois
 * imprimé, ne permet plus de commander : une photo suffisait pour commander à la place de la personne.
 * Le lien personnel sert toujours à ouvrir l'espace sur le téléphone (api/session).
 *
 * Artistes (20/11/2026), même parcours :
 *   { action: 'ouvrir', artiste: true, ev, qr }                       QR tournant de l'espace artiste (YA-…)
 *   { action: 'commander', artiste: true, ev, passage, lignes }       commande à la borne
 *   { action: 'commander', ev, code }                                 code d'origine 'artiste'
 * Avantages décomptés à l'impression (consommations artist-consumptions, une par article),
 * stock, commande, transaction « artist-gift », code utilisé. Un ticket par stand de l'article.
 */
const { blockedMinutes, afterFailure, counterKey, PUBLIC_LIMIT } = require('../_auth/core')
const { admin, getDb, clientIp, verifyCaller } = require('../_auth/server')
const { readBody } = require('../_billets/admin')
const { festDay } = require('../_em/retour')
const { restants, standBenevoles, repartirCommande } = require('../_borne/benevole')
const euros = (c) => ((Number(c) || 0) / 100).toFixed(2).replace('.', ',') + ' €'
const { avantagesDe, dejaPris, restantsArtiste, repartirCommandeArtiste } = require('../_borne/artiste')
const { lireJetonEspace, jetonEspaceValable, nouveauPassage, passageValable } = require('../_qr/espace')

const ID = /^[\w-]{1,128}$/
const CODE = /^\d{6}$/
const parisDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
const parisTime = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const parisDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' })

class Refus extends Error { constructor(status, message) { super(message); this.status = status } }

const ANCIEN_QR = "Ce QR imprimé n'est plus accepté. Ouvrez votre espace sur votre téléphone et présentez le QR qui change toutes les 30 secondes."

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

  // Identifie le bénévole ou l'artiste (23/11/2026) : QR tournant (body.qr) ou passage remis par
  // « ouvrir » (body.passage), vérifiés avec la clé de son lien personnel, avec la limite d'essais.
  // L'ancien QR avec la clé du lien (body.cle) est refusé. Renvoie { id, passage }.
  const identifier = async (kind) => {
    if (body.qr == null && body.passage == null) {
      if (body.cle != null) throw new Refus(410, ANCIEN_QR)
      throw new Refus(400, 'QR attendu.')
    }
    const ipRef = db.collection('securite-connexions').doc(counterKey('pub', clientIp(req)))
    const ipRec = (await ipRef.get()).data()
    const wait = blockedMinutes(ipRec, now)
    if (wait) throw new Refus(429, `Trop d'essais depuis cette borne. Réessayez dans ${wait} minutes.`)
    const echec = async (status, message) => { await ipRef.set(afterFailure(ipRec, now, PUBLIC_LIMIT)); throw new Refus(status, message) }
    const cleDe = async (id) => {
      const lien = await evRef.collection('liens').doc(`${kind}-${id}`).get()
      return lien.exists ? String(lien.data().cle || '') : ''
    }
    if (body.qr != null) {
      const lu = lireJetonEspace(String(body.qr).slice(0, 400))
      if (!lu || lu.kind !== kind) await echec(400, "Ce QR n'est pas reconnu. Présentez le QR de votre espace YllaCash.")
      const cle = await cleDe(lu.id)
      if (!jetonEspaceValable({ lu, cle, ev, ms: now })) {
        await echec(401, "Ce QR n'est plus valable : il change toutes les 30 secondes. Présentez celui affiché en ce moment.")
      }
      return { id: lu.id, passage: nouveauPassage({ kind, cle, ev, id: lu.id, ms: now }) }
    }
    const p = body.passage && typeof body.passage === 'object' ? body.passage : {}
    const id = String(p.id || '')
    if (p.kind !== kind || !ID.test(id)) throw new Refus(400, 'Passage incomplet : présentez de nouveau votre QR.')
    if (!passageValable({ passage: p, cle: await cleDe(id), ev, ms: now })) {
      await echec(401, 'Délai dépassé : présentez de nouveau le QR de votre espace.')
    }
    return { id, passage: p }
  }

  // ── Artistes : fiche (planning ou Event Manager), articles offerts, déjà pris, restants ──
  const etatArtiste = async (cr, get = (ref) => ref.get()) => {
    const [pl, em, offertsSnap] = await Promise.all([
      get(evRef.collection('planning').doc(cr)), get(evRef.collection('artistes').doc(cr)), get(evRef.collection('settings').doc('artistes')),
    ])
    const creneau = pl.exists ? pl.data() : null
    const fiche = !creneau && em.exists && em.data().actif !== false ? em.data() : null
    if (!creneau && !fiche) throw new Refus(404, 'Artiste introuvable.')
    if (creneau && creneau.statut === 'annule') throw new Refus(409, 'Ce créneau est annulé.')
    const offerts = fiche ? ((offertsSnap.exists && offertsSnap.data().articles) || []).map(String) : []
    const av = creneau ? creneau.avantages || {} : {}
    const ids = [...new Set([...offerts, ...(av.mealIds || []), ...(av.drinkIds || []), ...(av.eauIds || [])].map(String).filter(x => ID.test(x)))]
    const menuSnaps = await Promise.all(ids.map(x => get(evRef.collection('menu').doc(x))))
    const menuById = new Map(menuSnaps.filter(m => m.exists).map(m => [m.id, m.data()]))
    const { total, typeDe } = avantagesDe({ creneau, em: fiche, jour, offerts, menuById })
    const [consosSnap, resasSnap] = await Promise.all([
      get(evRef.collection('artist-consumptions').where('creneauId', '==', cr)),
      get(evRef.collection('artist-reservations').where('creneauId', '==', cr)),
    ])
    // Fiche Event Manager : avantages par jour ; créneau du planning : pour tout le créneau
    const duJour = (x, champ) => !fiche || festDay(x[champ] || x.timestamp) === jour
    const consos = consosSnap.docs.map(d => d.data()).filter(c => duJour(c, 'servedAt'))
    const resasEnAttente = resasSnap.docs.map(d => d.data()).filter(r => r.statut === 'pending' && duJour(r, 'createdAt'))
    const reste = restantsArtiste(total, dejaPris({ consos, resasEnAttente }))
    const nom = (creneau ? creneau.artiste : fiche.nom) || 'Artiste'
    return { nom, reste, typeDe, menuById, total }
  }

  const commanderArtiste = async ({ cr, lignes, code }) => {
    const counterRef = evRef.collection('_counters').doc(`commandes-${parisDay.format(new Date(now))}`)
    const numero = await db.runTransaction(async (t) => {
      const s = await t.get(counterRef)
      const n = s.exists ? (s.data().next || 1) : 1
      t.set(counterRef, { date: parisDay.format(new Date(now)), next: n + 1 }, { merge: true })
      return n
    })
    const r = await db.runTransaction(async (t) => {
      const codeRef = code ? evRef.collection('codes').doc(code) : null
      const [codeSnap, carteSnap] = await Promise.all([codeRef ? t.get(codeRef) : null, t.get(evRef.collection('settings').doc('carte'))])
      if (codeSnap) {
        const st = codeSnap.data().statut
        if (st === 'annule') throw new Refus(409, 'Ce code a été annulé.')
        if (st !== 'en_attente') throw new Refus(409, 'Ce code a déjà été utilisé.')
      }
      const etat = await etatArtiste(cr, (ref) => t.get(ref))
      // Stock lu dans la transaction pour tous les articles demandés (y compris hors avantages, refusés ensuite)
      const demandes = [...new Set(lignes.map(l => String(l.id || '')).filter(x => ID.test(x)))]
      const manquants = demandes.filter(x => !etat.menuById.has(x))
      const extra = await Promise.all(manquants.map(x => t.get(evRef.collection('menu').doc(x))))
      extra.filter(m => m.exists).forEach(m => etat.menuById.set(m.id, m.data()))
      const stands = (carteSnap.exists && carteSnap.data().stands) || []
      const standById = new Map(stands.map(st => [st.id, st]))
      // Solde des artistes (25/11/2026) : toute la carte ; avantages d'abord, le reste sur son solde
      let prep
      try { prep = repartirCommandeArtiste({ lignes, menuById: etat.menuById, typeDe: etat.typeDe, restants: etat.reste, standById }) }
      catch (e) { throw new Refus(409, e.message) }

      // Porte-monnaie de l'artiste (lu avant toute écriture) : il doit couvrir la part payée
      let pmRef = null, pm = null
      if (prep.totalPaye > 0) {
        const q = await t.get(evRef.collection('spectateurs').where('artisteId', '==', cr).limit(1))
        if (q.empty) throw new Refus(409, `Solde insuffisant : il manque ${euros(prep.totalPaye)}. Rechargez votre solde dans votre espace ou à la billetterie.`)
        pmRef = q.docs[0].ref
        pm = q.docs[0].data()
        const solde = Number(pm.solde) || 0
        if (solde < prep.totalPaye) throw new Refus(409, `Solde insuffisant : il manque ${euros(prep.totalPaye - solde)}. Rechargez votre solde dans votre espace ou à la billetterie.`)
      }

      const ts = admin.firestore.FieldValue.serverTimestamp()
      const inc = admin.firestore.FieldValue.increment
      const date = parisDate.format(new Date(now)), heure = parisTime.format(new Date(now)), iso = new Date(now).toISOString()
      const resaCode = code || `ART-${numero}`
      const resumeDe = (l) => l.map(i => i.nom + (i.qty > 1 ? ` ×${i.qty}` : '')).join(', ')
      const cmdRef = evRef.collection('commandes').doc()

      prep.items.forEach(i => t.update(evRef.collection('menu').doc(i.id), { stock: inc(-i.qty) }))
      // Consommations offertes seulement (les achats sur le solde ont leur propre vente, ci-dessous)
      prep.offerts.forEach(i => {
        for (let k = 0; k < i.qty; k++) {
          t.set(evRef.collection('artist-consumptions').doc(), {
            creneauId: cr, artisteNom: etat.nom, articleId: i.id, articleNom: i.nom, type: i.type,
            servedBy: { uid: null, name: 'Borne' }, servedAt: ts, source: 'borne', commandeId: cmdRef.id, commandeNumero: numero,
          })
        }
      })
      t.set(cmdRef, {
        numero, numeroDay: parisDay.format(new Date(now)), specId: null, specNom: etat.nom, creneauId: cr,
        items: prep.items.map(({ id, nom, qty, prixUnit, total, offert, standId, standNumero, type }) => ({ id, nom, qty, prixUnit, total, offert, typeArtiste: type || null, standId, standNumero })),
        total: prep.totalPaye, status: 'collected', paid: true, paidAt: ts,
        paidBy: prep.totalPaye ? (prep.offerts.length ? 'Avantages artiste + solde' : 'Solde artiste') : 'Avantages artiste',
        createdAt: ts, createdBy: 'Borne (artiste)', collectedAt: ts, collectedBy: 'Ticket imprimé',
        readyAt: null, readyBy: null, cancelledAt: null, cancelledBy: null, cancelReason: null, refunded: false,
        date, timestamp: iso, heure, source: 'artiste', code: resaCode,
      })
      if (prep.offerts.length) t.set(evRef.collection('transactions').doc(), {
        type: 'artist-gift', label: `Avantage artiste — ${etat.nom} (borne #${numero}) : ${resumeDe(prep.offerts)}`,
        items: prep.offerts.map(({ nom, qty, type }) => ({ nom, qty, type })),
        artisteNom: etat.nom, creneauId: cr, benevoleId: null, specId: null, benevoleNom: null, specNom: null,
        montant: 0, staff: 'Borne', commandeNumero: numero, resaCode, date, timestamp: iso, heure, createdAt: ts,
      })
      if (pmRef) {
        const avant = Number(pm.solde) || 0
        t.update(pmRef, { solde: avant - prep.totalPaye })
        t.set(evRef.collection('transactions').doc(), {
          specId: pm.id, specNom: pm.nom || etat.nom, artisteId: cr, artisteNom: etat.nom, achatArtiste: true, type: 'debit',
          label: `Commande #${numero}${code ? ` (code ${code})` : ''} — ${resumeDe(prep.payes)}`,
          items: prep.payes.map(({ nom, qty, prixUnit, total }) => ({ nom, qty, prixUnit, total })),
          montant: prep.totalPaye, staff: 'Borne', soldeBefore: avant, soldeAfter: avant - prep.totalPaye,
          ...(code ? { code } : {}), commandeNumero: numero, date, timestamp: iso, heure, createdAt: ts,
        })
      }
      if (codeRef) t.update(codeRef, { statut: 'utilise', utiliseLe: ts, commandeId: cmdRef.id, commandeNumero: numero })
      return { items: prep.items, nom: etat.nom, totalPaye: prep.totalPaye }
    })
    await evRef.collection('audit').add({
      action: 'AVANTAGE_ARTISTE_BORNE', creneauId: cr, montant: r.totalPaye || 0, staff: 'Borne',
      label: `Commande artiste #${numero} à la borne${code ? ` (code ${code})` : ''} — ${r.nom}${r.totalPaye ? ` · ${euros(r.totalPaye)} sur son solde` : ''}`,
      timestamp: new Date(now).toISOString(), createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {})
    return {
      numero, artiste: r.nom, totalPaye: r.totalPaye || 0,
      items: r.items.map(({ nom, qty, prixUnit, standId, standNumero, type, offert }) => ({ nom, qty, prix: prixUnit, standId, standNumero, type, offert })),
    }
  }

  try {
    if (body.action === 'ouvrir' && body.artiste) {
      const { id, passage } = await identifier('artiste')
      const etat = await etatArtiste(id)
      res.status(200).json({
        artiste: { id, nom: etat.nom }, passage, restants: etat.reste, total: etat.total, jour,
        articles: [...etat.typeDe.entries()].filter(([x]) => etat.menuById.has(x)).map(([x, type]) => ({ id: x, type })),
      })
      return
    }
    if (body.action === 'commander' && body.artiste) {
      const { id } = await identifier('artiste')
      res.status(200).json(await commanderArtiste({ cr: id, lignes: Array.isArray(body.lignes) ? body.lignes.slice(0, 30) : [] }))
      return
    }
    if (body.action === 'commander' && body.code != null) {
      const code = String(body.code)
      if (!CODE.test(code)) throw new Refus(400, 'Code à 6 chiffres attendu.')
      const c = await evRef.collection('codes').doc(code).get()
      if (c.exists && c.data().origine === 'artiste') {
        const cr = String(c.data().creneauId || '')
        if (!ID.test(cr)) throw new Refus(400, 'Artiste inconnu.')
        res.status(200).json(await commanderArtiste({ cr, code, lignes: (c.data().items || []).map(i => ({ id: i.id, qty: i.qty })) }))
        return
      }
    }

    if (body.action === 'ouvrir') {
      const { id, passage } = await identifier('benevole')
      const b = await evRef.collection('benevoles').doc(id).get()
      if (!b.exists) throw new Refus(404, 'Fiche bénévole introuvable.')
      res.status(200).json({ benevole: { id, nom: nomDe(b.data()) }, passage, restants: restants(b.data(), jour), jour })
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
        benevId = (await identifier('benevole')).id
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
        const carte = carteSnap.exists ? carteSnap.data() : null
        const standBenev = standBenevoles(carte)
        // Écran 13 (24/11/2026) : toute la carte ; avantages d'abord, le reste sur le solde du bénévole
        let prep
        try { prep = repartirCommande({ benev: bSnap.data(), jour, lignes, menuById, stands: (carte && carte.stands) || [], standBenev }) }
        catch (e) { throw new Refus(409, e.message) }

        // Porte-monnaie (lu avant toute écriture) : il doit couvrir la part payée
        let pmRef = null, pm = null
        if (prep.totalPaye > 0) {
          const lien = bSnap.data().porteMonnaie
          if (!lien || !lien.docId) throw new Refus(409, `Solde insuffisant : il manque ${euros(prep.totalPaye)}. Rechargez votre solde dans votre espace ou à la billetterie.`)
          pmRef = evRef.collection('spectateurs').doc(String(lien.docId))
          const pmSnap = await t.get(pmRef)
          if (!pmSnap.exists || pmSnap.data().benevoleId !== benevId) throw new Refus(409, 'Solde introuvable : passez à la billetterie.')
          pm = pmSnap.data()
          const solde = Number(pm.solde) || 0
          if (solde < prep.totalPaye) throw new Refus(409, `Solde insuffisant : il manque ${euros(prep.totalPaye - solde)}. Rechargez votre solde dans votre espace ou à la billetterie.`)
        }

        const benevNom = nomDe(bSnap.data())
        const resume = prep.items.map(i => i.nom + (i.qty > 1 ? ` ×${i.qty}` : '')).join(', ')
        const resumeDe = (l) => l.map(i => i.nom + (i.qty > 1 ? ` ×${i.qty}` : '')).join(', ')
        const ts = admin.firestore.FieldValue.serverTimestamp()
        const inc = admin.firestore.FieldValue.increment
        const date = parisDate.format(new Date(now)), heure = parisTime.format(new Date(now)), iso = new Date(now).toISOString()
        const resaCode = code || `BNV-${numero}`

        if (Object.keys(prep.champs).length) t.update(bRef, Object.fromEntries(Object.entries(prep.champs).map(([k, q]) => [k, inc(q)])))
        if (pmRef) {
          const avant = Number(pm.solde) || 0
          t.update(pmRef, { solde: avant - prep.totalPaye })
          t.set(evRef.collection('transactions').doc(), {
            specId: pm.id, specNom: pm.nom || benevNom, benevoleId: benevId, achatBenevole: true, type: 'debit',
            label: `Commande #${numero}${code ? ` (code ${code})` : ''} — ${resumeDe(prep.payes)}`,
            items: prep.payes.map(({ nom, qty, prixUnit, total }) => ({ nom, qty, prixUnit, total })),
            montant: prep.totalPaye, staff: 'Borne', soldeBefore: avant, soldeAfter: avant - prep.totalPaye,
            ...(code ? { code } : {}), commandeNumero: numero, date, timestamp: iso, heure, createdAt: ts,
          })
        }
        prep.items.forEach(i => t.update(evRef.collection('menu').doc(i.id), { stock: inc(-i.qty) }))
        const resaRef = evRef.collection('reservations').doc()
        t.set(resaRef, {
          benevoleId: benevId, benevoleNom: benevNom, isBenev: true, jourConso: jour,
          items: prep.items.map(({ id, nom, prix, qty, typeConsommation, offert }) => ({ id, nom, prix, qty, typeConsommation, offert })),
          total: prep.valeurOfferte, totalPaye: prep.totalPaye, status: 'collected', code: resaCode, numero, source: code ? 'code-benevole' : 'borne-benevole',
          date, createdAt: ts, collectedAt: ts, collectedBy: 'Ticket imprimé',
        })
        const cmdRef = evRef.collection('commandes').doc()
        t.set(cmdRef, {
          numero, numeroDay: parisDay.format(new Date(now)), specId: null, specNom: benevNom, benevoleId: benevId,
          items: prep.items.map(({ id, nom, qty, prixUnit, total, offert, standId, standNumero, typeConsommation }) => ({
            id, nom, qty, prixUnit, total, offert, typeConsommation, ...(standId ? { standId, standNumero } : {}),
          })),
          total: prep.totalPaye, status: 'collected', paid: true, paidAt: ts,
          paidBy: prep.totalPaye ? (prep.offerts.length ? 'Droits bénévole + solde' : 'Solde bénévole') : 'Droits bénévole',
          createdAt: ts, createdBy: 'Borne (bénévole)', collectedAt: ts, collectedBy: 'Ticket imprimé',
          readyAt: null, readyBy: null, cancelledAt: null, cancelledBy: null, cancelReason: null, refunded: false,
          date, timestamp: iso, heure, source: 'benevole', code: resaCode, reservationId: resaRef.id,
        })
        // Consommations offertes seulement (les achats sur le solde ont leur propre vente, ci-dessus)
        if (prep.offerts.length) t.set(evRef.collection('transactions').doc(), {
          benevoleId: benevId, benevoleNom: benevNom, specId: null, specNom: null, type: 'benev-retrait',
          label: `Retrait bénévole #${numero} (borne) : ${resumeDe(prep.offerts)}`, items: prep.offerts.map(({ nom, qty, prix }) => ({ nom, qty, prix })),
          montant: prep.valeurOfferte, staff: 'Borne', resaId: resaRef.id, resaCode, commandeNumero: numero,
          date, timestamp: iso, heure, createdAt: ts,
        })
        if (codeRef) t.update(codeRef, { statut: 'utilise', utiliseLe: ts, commandeId: cmdRef.id, commandeNumero: numero })
        return { items: prep.items, parType: prep.parType, benevNom, stand: standBenev, commandeId: cmdRef.id, totalPaye: prep.totalPaye, stands: (carte && carte.stands) || [] }
      })

      await evRef.collection('audit').add({
        action: 'RETRAIT_BENEV_BORNE', benevoleId: benevId, montant: r.totalPaye || 0, staff: 'Borne',
        label: `Commande bénévole #${numero} à la borne${code ? ` (code ${code})` : ''}${r.totalPaye ? ` · ${euros(r.totalPaye)} sur son solde` : ''}`,
        timestamp: new Date(now).toISOString(), createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {})
      res.status(200).json({
        numero, benevole: r.benevNom, parType: r.parType, totalPaye: r.totalPaye || 0,
        stand: r.stand ? { id: r.stand.id, numero: r.stand.numero, nom: r.stand.nom } : null,
        // Écran 13 : un ticket par stand (offerts au stand des bénévoles, payés à leur stand)
        stands: (r.stands || []).map(st => ({ id: st.id, numero: st.numero, nom: st.nom || '' })),
        items: r.items.map(({ nom, qty, typeConsommation, standId, offert, prix }) => ({ nom, qty, typeConsommation, standId, offert, prix })),
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
