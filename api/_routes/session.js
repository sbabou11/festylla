/**
 * api/session.js — Vercel Serverless Function : sessions des pages publiques (sécurité, lot 2)
 *
 * Les pages sans connexion de l'équipe obtiennent ici une session Firebase limitée, que les
 * règles de la base (lot 3) restreindront à leurs propres données :
 *
 * POST /api/session
 *   { mode: 'compte', ev, id, cle? }       compte spectateur (/solde, borne) : clé du billet ou du compte
 *                                           exigée quand le compte en a une ; sinon le code seul (anciens comptes)
 *   { mode: 'lien', kind, ev, id?, cle }   lien personnel : 'benevole' (id = fiche), 'artiste' (id = créneau),
 *                                           ou appareil : 'borne', 'ecran' (un lien par événement)
 * Réponse : { token, ... } ; 401 code ou clé incorrects ; 429 trop d'essais depuis cet appareil.
 *
 * Limite d'essais : 15 échecs en 15 minutes depuis une même adresse réseau la bloquent 30 minutes
 * (et 8 échecs sur un même code bloquent ce code). Avec des codes de 6 caractères, essayer des codes
 * au hasard devient sans espoir.
 * Les clés des liens sont rangées dans events/{ev}/liens/{benevole-<id>|artiste-<id>|borne|ecran},
 * lisibles par l'équipe seulement (lot 3).
 */
const {
  blockedMinutes, afterFailure, counterKey, PUBLIC_LIMIT, LIMIT, isKey, sameKey, accountKey,
  spectatorSession, LINK_KINDS, linkDocId, deviceSession, sessionFor, publicAccount, newKey,
  checkPassword, ROLES_EQUIPE_BENEVOLE,
} = require('../_auth/core')
const { creneauxDuRole, creneauxEmDuRole, fenetreRole, claimsRole, avecException, exceptionActive } = require('../_auth/role')
const { assurerPorteMonnaie, assurerPorteMonnaieArtiste, nomFiche } = require('../_auth/porteMonnaie')
const { admin, getDb, clientIp, verifyCaller, loadAccount, writeAudit, ADMIN_ROLES } = require('../_auth/server')
const { readBody } = require('../_billets/admin')
const { cleDuCompte } = require('../_auth/cles')

const ID = /^[\w-]{1,128}$/
const SPEC = /^FY-[A-Z0-9]{4,12}$/

async function findSpectator(db, ev, id) {
  const col = db.collection('events').doc(ev).collection('spectateurs')
  const direct = await col.doc(id).get()
  if (direct.exists && direct.data().id === id) return { docId: direct.id, data: direct.data() }
  const q = await col.where('id', '==', id).limit(1).get()
  return q.empty ? null : { docId: q.docs[0].id, data: q.docs[0].data() }
}

/**
 * Onglet de rôle (écran 11, 24/11/2026), pour un bénévole connecté à son espace :
 *   { mode: 'role-etat', ev }                              état de l'onglet à l'heure du serveur
 *   { mode: 'role', ev, identifiant, motDePasse }           déverrouille : nouveau jeton, rôle ouvert jusqu'à `jusqua`
 *   { mode: 'role-fermer', ev }                             verrouille : jeton du bénévole sans le rôle
 * Le serveur vérifie le rôle de la fiche, son mot de passe et le créneau ; l'accès expire tout seul.
 */
async function ongletRole(req, res, db, ev, body) {
  try {
    const t = await verifyCaller(req, { brut: true })
    if (!t || t.type !== 'benevole' || !(t.eventIds || []).includes(ev)) { res.status(401).json({ error: 'Session expirée : rouvrez votre espace bénévole.' }); return }
    const account = await loadAccount(db, t.fiche)
    if (!account || account.kind !== 'benevole' || account.eventId !== ev) { res.status(404).json({ error: 'Fiche bénévole introuvable.' }); return }
    const base = sessionFor(account)
    const now = Date.now()

    if (body.mode === 'role-fermer') {
      if (t.roleEquipe) {
        await writeAudit(db, ev, { action: 'ROLE_VERROUILLE', staff: t.uid, userType: 'benevole', benevoleId: account.id, label: `Onglet « ${t.roleEquipe} » verrouillé par ${nomFiche(account.data)}` })
      }
      res.status(200).json({ token: await admin.auth().createCustomToken(base.uid, base.claims) }); return
    }

    const role = account.data.roleEquipe || ''
    if (!ROLES_EQUIPE_BENEVOLE.includes(role)) { res.status(200).json({ role: '', etat: 'sans-role', maintenant: now }); return }
    let creneaux = []
    let attenteEm = false
    let sansHoraire = false
    if (account.data.source === 'event-manager') {
      // Règle d'échange 1.2 (§3.2) : créneaux des postes à rôle, copiés de l'instantané d'Event Manager.
      // Pas encore reçus (ancienne version) : on attend.
      if (Array.isArray(account.data.creneauxEm)) {
        const r = creneauxEmDuRole(account.data.creneauxEm, role)
        creneaux = r.creneaux; sansHoraire = r.sansHoraire
      } else attenteEm = true
    } else {
      const evRef = db.collection('events').doc(ev)
      const [shifts, posts] = await Promise.all([evRef.collection('volunteer-shifts').get(), evRef.collection('volunteer-posts').get()])
      creneaux = creneauxDuRole({
        shifts: shifts.docs.map(d => d.data()),
        posts: Object.fromEntries(posts.docs.map(d => [d.id, d.data()])),
        benevId: account.id, role,
      })
    }
    // Écran 12 : une ouverture exceptionnelle accordée par un admin ouvre l'onglet hors créneau
    const fenetre = avecException(fenetreRole(creneaux, role, now), account.data, now)

    if (body.mode === 'role-etat') {
      // Un jeton d'ouverture exceptionnelle n'est plus valable si l'admin l'a annulée
      const jetonValable = !!t.roleEquipe && Number(t.roleJusqua) > now && (!t.roleExc || !!exceptionActive(account.data, now))
      res.status(200).json({ role, ...fenetre, attenteEm, sansHoraire, ouvert: jetonValable, maintenant: now }); return
    }

    // Déverrouillage : identifiant et mot de passe de la fiche, essais limités
    const essais = db.collection('securite-connexions').doc(counterKey('role', t.uid))
    const rec = (await essais.get()).data()
    const wait = blockedMinutes(rec, now)
    if (wait) { res.status(429).json({ error: `Trop d'essais. Réessayez dans ${wait} minute${wait > 1 ? 's' : ''}.` }); return }
    const identOk = String(body.identifiant || '').toLowerCase().trim() === String(account.data.username || '').toLowerCase()
    if (!identOk || !checkPassword(account.data, String(body.motDePasse || '')).ok) {
      await essais.set(afterFailure(rec, now, LIMIT))
      res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' }); return
    }
    await essais.delete().catch(() => {})
    if (fenetre.etat !== 'ouvert' && fenetre.etat !== 'cloture') {
      res.status(403).json({ error: attenteEm ? 'Vos créneaux ne sont pas encore arrivés d\'Event Manager : l\'onglet reste fermé.'
        : sansHoraire ? 'Créneau sans horaire dans Event Manager : demandez à l\'organisation de le compléter.'
        : 'Pas de créneau en cours sur un poste de votre rôle : l\'onglet reste fermé.', ...fenetre }); return
    }
    const claims = claimsRole(base.claims, { role, fenetre })
    const a = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })
    await writeAudit(db, ev, {
      action: 'ROLE_DEVERROUILLE', staff: t.uid, userType: 'benevole', benevoleId: account.id,
      label: `Onglet « ${role} » déverrouillé par ${nomFiche(account.data)}${fenetre.etat === 'cloture' ? ' (clôture de caisse)' : ''}${fenetre.exception ? ` (ouverture exceptionnelle de ${fenetre.exception.parNom || 'un admin'})` : `, poste « ${fenetre.poste} »`}, jusqu'à ${a(fenetre.fin)}`,
    })
    res.status(200).json({ token: await admin.auth().createCustomToken(base.uid, claims), role, ...fenetre, maintenant: now })
  } catch (e) {
    console.error('session ongletRole:', e)
    res.status(500).json({ error: 'L\'onglet n\'a pas pu être ouvert, réessayez.' })
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST attendu.' }); return }
  let body
  try { body = (await readBody(req)) || {} } catch { res.status(400).json({ error: 'Requête illisible.' }); return }
  const ev = String(body.ev || '')
  if (!ID.test(ev)) { res.status(400).json({ error: 'Événement manquant dans l\'adresse.' }); return }
  let db
  try { db = getDb() } catch { res.status(503).json({ error: 'Service indisponible.' }); return }

  // Administrateur : nouveau lien pour la borne (20/11/2026). La clé change (l'ancien lien ne s'ouvre
  // plus) et les sessions des bornes déjà ouvertes sont révoquées : elles s'arrêtent dans l'heure,
  // le temps que leur jeton en cours expire.
  if (body.mode === 'renouveler-borne') {
    try {
      const caller = await verifyCaller(req)
      if (!caller) { res.status(401).json({ error: 'Session expirée : reconnectez-vous.' }); return }
      if (!ADMIN_ROLES.includes(caller.role)) { res.status(403).json({ error: 'Réservé aux administrateurs.' }); return }
      const event = await db.collection('events').doc(ev).get()
      if (!event.exists || event.data().deleted) { res.status(404).json({ error: 'Événement inconnu.' }); return }
      const cle = newKey()
      await db.collection('events').doc(ev).collection('liens').doc(linkDocId('borne', '')).set({
        cle, kind: 'borne', id: null, creeLe: admin.firestore.FieldValue.serverTimestamp(), creePar: caller.uid,
      })
      // La borne n'a peut-être jamais ouvert de session : l'absence de compte n'est pas une erreur
      await admin.auth().revokeRefreshTokens(deviceSession('borne', ev).uid).catch(() => {})
      await writeAudit(db, ev, { action: 'LIEN_BORNE_RENOUVELE', staff: caller.uid, userType: 'admin', label: 'Lien de la borne renouvelé : l\'ancien ne fonctionne plus' })
      res.status(200).json({ cle })
    } catch (e) {
      console.error('session renouveler-borne:', e)
      res.status(500).json({ error: 'Le lien n\'a pas été renouvelé, réessayez.' })
    }
    return
  }

  // Écran 11 (24/11/2026) : onglet de rôle d'un bénévole déjà connecté à son espace
  if (['role-etat', 'role', 'role-fermer'].includes(body.mode)) { await ongletRole(req, res, db, ev, body); return }
  // Écran 13 : porte-monnaie du bénévole (créé à la première ouverture), nouveau jeton qui le désigne
  if (body.mode === 'porte-monnaie') {
    try {
      const t = await verifyCaller(req, { brut: true })
      // Solde des artistes (25/11/2026) : un porte-monnaie par artiste inscrit (fiche ou créneau du lien)
      if (t && t.type === 'artiste') {
        const cr = String(t.creneauId || '')
        if (!(t.eventIds || []).includes(ev) || !ID.test(cr)) { res.status(401).json({ error: 'Session expirée : rouvrez votre espace artiste.' }); return }
        let pm
        try { pm = await assurerPorteMonnaieArtiste(db, admin, ev, cr) }
        catch (e) { res.status(404).json({ error: e.message || 'Artiste introuvable.' }); return }
        if (pm.cree) await writeAudit(db, ev, { action: 'PORTE_MONNAIE_ARTISTE', creneauId: cr, specId: pm.id, staff: t.uid, userType: 'artiste', label: `Porte-monnaie ${pm.id} ouvert pour ${pm.nom}` })
        const base = deviceSession('artiste', ev, cr)
        res.status(200).json({ token: await admin.auth().createCustomToken(base.uid, { ...base.claims, specId: pm.id, specDoc: pm.docId }), compte: { id: pm.id, docId: pm.docId, solde: pm.solde } })
        return
      }
      if (!t || t.type !== 'benevole' || !(t.eventIds || []).includes(ev)) { res.status(401).json({ error: 'Session expirée : rouvrez votre espace bénévole.' }); return }
      const account = await loadAccount(db, t.fiche)
      if (!account || account.kind !== 'benevole' || account.eventId !== ev) { res.status(404).json({ error: 'Fiche bénévole introuvable.' }); return }
      const pm = await assurerPorteMonnaie(db, admin, account)
      if (pm.cree) await writeAudit(db, ev, { action: 'PORTE_MONNAIE_BENEVOLE', benevoleId: account.id, specId: pm.id, staff: t.uid, userType: 'benevole', label: `Porte-monnaie ${pm.id} ouvert pour ${nomFiche(account.data)}` })
      const base = sessionFor({ ...account, data: { ...account.data, porteMonnaie: { id: pm.id, docId: pm.docId } } })
      // Un onglet de rôle ouvert le reste (mêmes droits, même fin)
      const role = {}
      for (const k of ['roleEquipe', 'roleMode', 'roleFin', 'roleJusqua', 'roleExc']) if (t[k] !== undefined) role[k] = t[k]
      res.status(200).json({ token: await admin.auth().createCustomToken(base.uid, { ...base.claims, ...role }), compte: { id: pm.id, docId: pm.docId, solde: pm.solde } })
    } catch (e) {
      console.error('session porte-monnaie:', e)
      res.status(500).json({ error: 'Votre solde n\'a pas pu être ouvert, réessayez.' })
    }
    return
  }

  const now = Date.now()
  const ipRef = db.collection('securite-connexions').doc(counterKey('pub', clientIp(req)))
  const ipRec = (await ipRef.get()).data()
  const wait = blockedMinutes(ipRec, now)
  if (wait) { res.status(429).json({ error: `Trop d'essais depuis cet appareil. Réessayez dans ${wait} minutes.` }); return }
  const fail = async (status, error, extraRef, extraRec) => {
    await ipRef.set(afterFailure(ipRec, now, PUBLIC_LIMIT))
    if (extraRef) await extraRef.set(afterFailure(extraRec, now, LIMIT))
    res.status(status).json({ error })
  }

  try {
    const event = await db.collection('events').doc(ev).get()
    if (!event.exists || event.data().deleted) { await fail(404, 'Événement inconnu.'); return }

    if (body.mode === 'compte') {
      const id = String(body.id || '').toUpperCase().trim()
      if (!SPEC.test(id)) { await fail(400, 'Code invalide. Format attendu : FY- suivi de lettres et de chiffres.'); return }
      const codeRef = db.collection('securite-connexions').doc(counterKey('code', `${ev}:${id}`))
      const codeRec = (await codeRef.get()).data()
      const codeWait = blockedMinutes(codeRec, now)
      if (codeWait) { res.status(429).json({ error: `Trop d'essais pour ce code. Réessayez dans ${codeWait} minutes.` }); return }

      const spec = await findSpectator(db, ev, id)
      if (!spec) { await fail(401, 'Code inconnu : vérifiez le code ou l\'événement.'); return }
      const expected = await cleDuCompte(db.collection('events').doc(ev), spec.docId, spec.data)
      // Sécurité (20/11/2026) : un compte ne s'ouvre qu'avec sa clé. Fini l'exception de l'artiste
      // relié au compte, et l'ouverture avec le seul code quand le compte n'a pas de clé.
      if (!expected || !sameKey(String(body.cle || '').toLowerCase(), expected)) {
        await fail(401, body.cle ? 'Ce lien n\'est plus valable pour ce compte.' : 'Votre espace s\'ouvre avec le lien reçu par e-mail avec votre billet. Demandez de l\'aide à la billetterie si besoin.', codeRef, codeRec)
        return
      }
      const { uid, claims } = spectatorSession(ev, spec.docId, spec.data)
      const token = await admin.auth().createCustomToken(uid, claims)
      res.status(200).json({ token, compte: { id: spec.data.id, docId: spec.docId, nom: spec.data.nom || '', cle: String(body.cle || '').toLowerCase() } })
      return
    }

    if (body.mode === 'lien') {
      const kind = String(body.kind || '')
      const id = String(body.id || '')
      if (!LINK_KINDS.includes(kind) || ((kind === 'benevole' || kind === 'artiste') && !ID.test(id))) { await fail(400, 'Lien incomplet.'); return }
      const cle = String(body.cle || '').toLowerCase()
      const link = await db.collection('events').doc(ev).collection('liens').doc(linkDocId(kind, id)).get()
      if (!isKey(cle) || !link.exists || !sameKey(cle, link.data().cle)) {
        await fail(401, 'Ce lien n\'est pas ou plus valable. Demandez un nouveau lien à l\'organisation.'); return
      }
      if (kind === 'benevole') {
        const account = await loadAccount(db, `events/${ev}/benevoles/${id}`)
        if (!account) { await fail(404, 'Fiche bénévole introuvable.'); return }
        const { uid, claims } = sessionFor(account)
        res.status(200).json({ token: await admin.auth().createCustomToken(uid, claims), compte: publicAccount(account) })
        return
      }
      if (kind === 'artiste') {
        // Créneau du planning de YllaCash, ou fiche d'artiste venue d'Event Manager (lot C)
        const evRef = db.collection('events').doc(ev)
        const [cr, fiche] = await Promise.all([evRef.collection('planning').doc(id).get(), evRef.collection('artistes').doc(id).get()])
        if (!cr.exists && !(fiche.exists && fiche.data().actif !== false)) { await fail(404, 'Artiste introuvable.'); return }
      }
      const { uid, claims } = deviceSession(kind, ev, id)
      res.status(200).json({ token: await admin.auth().createCustomToken(uid, claims) })
      return
    }

    res.status(400).json({ error: 'Mode inconnu.' })
  } catch (e) {
    console.error('session:', e)
    res.status(500).json({ error: 'Ouverture impossible pour le moment, réessayez.' })
  }
}
