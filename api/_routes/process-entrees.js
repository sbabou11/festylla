/**
 * api/process-entrees.js — Vercel Serverless Function : envoi des entrées à Ylla Event Manager
 *
 * Règle d'échange : echanges-billetterie.md (v1, 17/11/2026), §2 et §5.
 *
 * Chaque entrée validée à l'écran « Entrée » est notée dans events/{ev}/entrees avec un état
 * d'envoi. Cette fonction regroupe les entrées en attente de chaque événement et les envoie,
 * sans nom ni code de billet : seulement la référence anonyme `ref` reçue du site.
 * Appelée chaque minute par GitHub Actions (cron-reminders.yml), et juste après un contrôle.
 *
 * Règle d'échange v1.3 : adresse fixe, et une clé Event Manager par événement, saisie dans la
 * fenêtre « Liaisons » de l'événement (rangée dans liaisons-em/{événement}, lisible par le serveur seul).
 * Sans clé pour un événement, ses entrées restent en attente.
 * YLLA_EM_URL (facultatif) remplace l'adresse, pour un essai.
 *
 * Au même passage, relit toutes les 5 minutes l'instantané d'Event Manager de chaque événement
 * qui a une clé (règle d'échange Event Manager ↔ YllaCash v1.0, §2 ; voir _em/lecture.js),
 * et lui renvoie les consommations et le bilan (§7, v1.1 ; voir _em/envoiRetour.js).
 */
const { prepareEntrees, nextAttempt, isSettingError, newMessageId } = require('../_billets/core')
const { getDb } = require('../_billets/admin')
const { refreshEvent } = require('../_em/lecture')
const { executerRetour, firestoreIo } = require('../_em/envoiRetour')

const TIMEOUT_MS = 10_000

async function sendToEventManager(url, key, body) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ylla': '1', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const text = await r.text().catch(() => '')
    return { status: r.status, text: text.slice(0, 300) }
  } catch (e) {
    return { status: 0, text: e.name === 'AbortError' ? 'Délai dépassé (10 s)' : (e.message || 'Réseau indisponible') }
  } finally { clearTimeout(t) }
}

const EM_URL = 'https://gestion.maisonylla.com/api/public/billetterie'

module.exports = async (req, res) => {
  // Sécurité (20/11/2026) : réservé à la tâche planifiée (secret x-cron-secret) et aux personnes
  // connectées à YllaCash (l'écran « Entrée » relance l'envoi juste après un contrôle).
  const secret = process.env.CRON_SECRET
  const parSecret = !!secret && req.headers['x-cron-secret'] === secret
  if (!parSecret) {
    const { verifyCaller } = require('../_auth/server')
    const caller = await verifyCaller(req).catch(() => null)
    if (!caller || !['staff', 'benevole'].includes(caller.type)) { res.status(401).json({ error: 'Non autorisé.' }); return }
  }
  const url = process.env.YLLA_EM_URL || EM_URL

  let db
  try { db = getDb() } catch (e) { res.status(500).json({ error: e.message }); return }

  const summary = { events: 0, envoyees: 0, inutiles: 0, echecs: [], lectures: 0, lecturesEchouees: 0 }
  const now = Date.now()
  const events = await db.collection('events').get()

  for (const ev of events.docs) {
    if (ev.data().deleted || ev.data().archive?.readOnly) continue
    const emSnap = await db.collection('liaisons-em').doc(ev.id).get()
    const key = emSnap.exists ? emSnap.data().cle : null
    if (!key) continue
    try {
      const l = await refreshEvent(db, ev.id)
      if (l.lu) { summary.lectures++; if (l.lecture.echec) summary.lecturesEchouees++ }
    } catch (e) { console.error('lecture Event Manager:', ev.id, e); summary.lecturesEchouees++ }
    // Retour vers Event Manager : seulement pour un événement dont l'équipe vient d'Event Manager
    if (ev.data().emEquipe) {
      try {
        const r = await executerRetour(firestoreIo(db, ev.id, { key, state: emSnap.data().retour }))
        if (r.envoye) { summary.retours = (summary.retours || 0) + 1; if (r.echecs.length) summary.echecs.push({ event: ev.id, retour: r.echecs }) }
      } catch (e) { console.error('retour Event Manager:', ev.id, e) }
    }
    const col = db.collection('events').doc(ev.id).collection('entrees')
    const snap = await col.where('envoi.statut', '==', 'attente').get()
    if (snap.empty) continue
    summary.events++
    // Ordre d'enregistrement : une entrée et son annulation partent dans l'ordre
    const docs = snap.docs.map(d => ({ id: d.id, data: d.data() })).sort((a, b) => (a.data.creeMs || 0) - (b.data.creeMs || 0))
    const { toSend, useless } = prepareEntrees(docs, now)

    for (const id of useless) await col.doc(id).update({ 'envoi.statut': 'inutile' })
    summary.inutiles += useless.length
    if (!toSend.length) continue

    const r = await sendToEventManager(url, key, { id: newMessageId(), type: 'entree', entrees: toSend.map(x => x.line) })
    const ok = r.status === 200 || r.status === 201

    for (const item of toSend) {
      await db.runTransaction(async (t) => {
        const ref = col.doc(item.id)
        const cur = (await t.get(ref)).data()
        if (!cur) return
        if (ok) {
          // L'entrée a été annulée pendant l'envoi : il reste à envoyer l'annulation
          if (!!cur.annulee !== item.sentAnnulee) {
            t.update(ref, { envoi: { statut: 'attente', tentatives: 0, prochainMs: Date.now(), dejaEnvoye: true } })
          } else {
            t.update(ref, { envoi: { ...cur.envoi, statut: 'envoye', envoyeMs: Date.now(), dejaEnvoye: true, erreur: null } })
          }
        } else if (isSettingError(r.status)) {
          t.update(ref, { envoi: { ...cur.envoi, statut: 'echec', erreur: `Event Manager a répondu ${r.status} : ${r.text}` } })
        } else {
          t.update(ref, { envoi: { ...cur.envoi, ...nextAttempt(cur.envoi || {}, Date.now()), erreur: r.text || `Réponse ${r.status}` } })
        }
      })
    }
    if (ok) summary.envoyees += toSend.length
    else summary.echecs.push({ event: ev.id, status: r.status, detail: r.text })
    // Suivi affiché dans la fenêtre « Liaisons »
    await emSnap.ref.update(ok
      ? { dernierEnvoiOk: require('firebase-admin').firestore.FieldValue.serverTimestamp(), dernierEchec: null }
      : { dernierEchec: `${r.status || 'réseau'} : ${r.text}`.slice(0, 200) }).catch(() => {})
  }
  res.status(200).json({ ok: true, ...summary })
}
