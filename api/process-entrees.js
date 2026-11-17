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
 * REQUIS — Variables d'environnement Vercel (saisies par l'administrateur) :
 *   YLLA_EM_URL  = adresse complète, jeton compris : https://gestion.maisonylla.com/api/public/billetterie/<jeton>
 *   YLLA_EM_KEY  = clé de la liaison « YllaCash → Event Manager »
 * Sans ces variables, rien n'est envoyé et les entrées restent en attente.
 */
const { prepareEntrees, nextAttempt, isSettingError, newMessageId } = require('./_billets/core')
const { getDb } = require('./_billets/admin')

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

module.exports = async (req, res) => {
  const url = process.env.YLLA_EM_URL, key = process.env.YLLA_EM_KEY
  if (!url || !key) { res.status(200).json({ ok: true, skipped: 'Liaison Event Manager non configurée : les entrées restent en attente.' }); return }

  let db
  try { db = getDb() } catch (e) { res.status(500).json({ error: e.message }); return }

  const summary = { events: 0, envoyees: 0, inutiles: 0, echecs: [] }
  const now = Date.now()
  const events = await db.collection('events').get()

  for (const ev of events.docs) {
    if (ev.data().deleted || ev.data().archive?.readOnly) continue
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
  }
  res.status(200).json({ ok: true, ...summary })
}
