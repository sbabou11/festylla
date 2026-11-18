/**
 * api/_em/envoiRetour.js — envoie à Event Manager les consommations et le bilan d'un événement
 *
 * Règle d'échange Event Manager ↔ YllaCash v1.1, §7 : même adresse et même clé que les entrées
 * (POST /api/public/billetterie, clé YllaCash de l'événement rangée dans liaisons-em/{ev}).
 * Appelé par la tâche automatique (api/process-entrees.js) chaque minute :
 *  - rien à faire si rien n'a changé (aucune transaction nouvelle) ;
 *  - au plus un envoi toutes les 5 minutes ;
 *  - un envoi « final » dès qu'une clôture de caisse a été faite.
 * Seul ce qui a changé part (empreinte du contenu). L'état est gardé dans liaisons-em/{ev}.retour.
 */
const { consommations, bilan, empreinte, parisIso, envoiDu } = require('./retour')
const { newMessageId } = require('../_billets/core')

const EM_URL = 'https://gestion.maisonylla.com/api/public/billetterie'
const TIMEOUT_MS = 15_000

async function postEm(url, key, body, fetchImpl = fetch) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await fetchImpl(url, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-ylla': '1', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    })
    const text = await r.text().catch(() => '')
    return { ok: r.status === 200 || r.status === 201, status: r.status, text: text.slice(0, 200) }
  } catch (e) {
    return { ok: false, status: 0, text: e.name === 'AbortError' ? 'Délai dépassé (15 s)' : (e.message || 'Réseau indisponible') }
  }
}

/**
 * Déroulé d'un tour, indépendant de Firestore (testé) :
 * io = { state, nouveau(sinceMs), clotureMs(), charger(), post(body), save(state) }
 */
async function executerRetour(io, { now = Date.now(), newId = newMessageId } = {}) {
  const state = io.state || {}
  const nouveau = state.calculMs ? await io.nouveau(state.calculMs) : true
  const clotureMs = await io.clotureMs()
  const d = envoiDu(state, { now, nouveau, clotureMs })
  if (!d.du) return { envoye: false }

  const data = await io.charger()
  const conso = consommations(data)
  const bil = bilan(data)
  const ch = empreinte(conso), bh = empreinte(bil)
  const next = { ...state, calculMs: now }
  const le = parisIso(now)
  const echecs = []
  let envoye = false

  if (ch !== state.consoHash || d.final) {
    const r = await io.post({ id: newId(), type: 'consommations', le, ...conso })
    envoye = true
    if (r.ok) next.consoHash = ch
    else echecs.push(`consommations : ${r.status || 'réseau'} ${r.text}`.trim())
  }
  if (bh !== state.bilanHash || d.final) {
    const r = await io.post({ id: newId(), type: 'bilan', le, final: !!d.final, ...bil })
    envoye = true
    if (r.ok) { next.bilanHash = bh; if (d.final) { next.clotureMs = clotureMs; next.finalMs = now } }
    else echecs.push(`bilan : ${r.status || 'réseau'} ${r.text}`.trim())
  }
  if (envoye) {
    next.essaiMs = now
    next.echec = echecs.length ? echecs.join(' · ').slice(0, 300) : null
    next.echecDepuisMs = echecs.length ? (state.echec ? state.echecDepuisMs || now : now) : null
    if (!echecs.length) next.okMs = now
  }
  await io.save(next)
  return { envoye, final: !!d.final, echecs }
}

/** Branchement sur Firestore pour un événement */
function firestoreIo(db, ev, { key, state, url = process.env.YLLA_EM_URL || EM_URL, fetchImpl }) {
  const evRef = db.collection('events').doc(ev)
  const docs = async (q) => (await q.get()).docs.map(d => ({ ...d.data(), id: d.id }))
  return {
    state,
    nouveau: async (sinceMs) => !(await evRef.collection('transactions').where('createdAt', '>', new Date(sinceMs)).limit(1).get()).empty,
    clotureMs: async () => {
      const s = await evRef.collection('clotures').orderBy('createdAt', 'desc').limit(1).get()
      const c = s.empty ? null : s.docs[0].data().createdAt
      return c?.toMillis ? c.toMillis() : null
    },
    charger: async () => {
      const [benevoles, artistes, resas, consos, transactions, spectateurs, menu, copie] = await Promise.all([
        docs(evRef.collection('benevoles').where('source', '==', 'event-manager')),
        docs(evRef.collection('artistes')),
        docs(evRef.collection('reservations').where('isBenev', '==', true)),
        docs(evRef.collection('artist-consumptions')),
        docs(evRef.collection('transactions')),
        docs(evRef.collection('spectateurs').select('solde')),
        docs(evRef.collection('menu')),
        db.collection('em-instantanes').doc(ev).get(),
      ])
      const jours = copie.exists ? (copie.data().evenement?.jours || []) : []
      return { benevoles, artistes, resas, consos, transactions, spectateurs, menu, jours }
    },
    post: (body) => postEm(url, key, body, fetchImpl),
    save: (next) => db.collection('liaisons-em').doc(ev).update({ retour: next }),
  }
}

module.exports = { executerRetour, firestoreIo, postEm }
