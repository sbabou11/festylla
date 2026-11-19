/**
 * api/_billets/core.js — logique de la billetterie, sans dépendance à Firebase
 *
 * Règle d'échange : FestYlla_2.0/maquette/docs/echanges-billetterie.md (v1, 17/11/2026), §2, §3 et §5.
 * Le dossier commence par « _ » : Vercel n'en fait pas une adresse publique.
 *
 * `store` est un petit adaptateur (Firebase Admin en production, mémoire dans les tests) :
 *   store.runTransaction(async (tx) => { await tx.get(path) → { exists, data }; tx.set(path, data, { merge }) })
 *   store.now() → valeur de date à enregistrer
 */
const crypto = require('crypto')

const HEX32 = /^[0-9a-f]{32}$/
const HEX16 = /^[0-9a-f]{16}$/
// Codes de billet : 6 caractères depuis la décision du 17/11/2026 (12 tolérés pour les billets d'essai)
const CODE = /^[A-Z0-9]{4,12}$/
const EVENT_ID = /^[\w-]{1,128}$/

/** Compare deux clés sans révéler, par le temps de réponse, à partir de quel caractère elles diffèrent */
function sameKey(given, expected) {
  const a = crypto.createHash('sha256').update(String(given || '')).digest()
  const b = crypto.createHash('sha256').update(String(expected || '')).digest()
  return crypto.timingSafeEqual(a, b)
}

/**
 * Vérifie l'en-tête Authorization. Renvoie null si tout va bien, sinon { status, error }.
 * 503 si la clé n'est pas réglée chez nous : on ne laisse jamais passer sans vérification.
 */
function checkAuth(header, expected) {
  if (!expected) return { status: 503, error: 'La liaison billetterie n\'est pas configurée dans YllaCash (clé absente).' }
  const m = /^Bearer\s+(.+)$/i.exec(String(header || '').trim())
  if (!m || !sameKey(m[1].trim(), expected)) return { status: 401, error: 'Clé de la liaison billetterie invalide.' }
  return null
}

/** Contrôle la forme d'un message du site. Renvoie un message d'erreur en français, ou null. */
function validateMessage(msg) {
  if (!msg || typeof msg !== 'object') return 'Corps JSON attendu.'
  if (!HEX32.test(msg.id || '')) return 'Identifiant de message « id » invalide (32 caractères hexadécimaux).'
  // v1.3 : l'événement n'est plus envoyé, c'est la clé de liaison qui le désigne
  if (msg.type === 'vente') {
    if (!Array.isArray(msg.billets) || !msg.billets.length) return 'Une vente doit contenir au moins un billet.'
    for (const b of msg.billets) {
      if (!b || !CODE.test(b.code || '')) return `Code de billet invalide : ${b && b.code}`
      if (!HEX16.test(b.ref || '')) return `Référence anonyme « ref » invalide pour le billet ${b.code}.`
      // Clé du compte YllaCash (règle d'échange v1.2) : vide pour les billets d'essai émis avant
      if (b.cle && !/^[0-9a-f]{20,64}$/.test(b.cle)) return `Clé « cle » invalide pour le billet ${b.code}.`
      if (!String(b.prenom || '').trim() && !String(b.nom || '').trim()) return `Nom du titulaire absent pour le billet ${b.code}.`
      if (!Number.isInteger(b.jours) || b.jours < 1 || b.jours > 30) return `Nombre de jours invalide pour le billet ${b.code}.`
      if (typeof b.prix !== 'number' || !Number.isFinite(b.prix) || b.prix < 0) return `Prix invalide pour le billet ${b.code}.`
      // Billet sans compte (règle d'échange v1.4, 20/11/2026) : champ facultatif ; pas de clé dans ce cas
      if (b.compte !== undefined && typeof b.compte !== 'boolean') return `Champ « compte » invalide pour le billet ${b.code} (true ou false).`
      if (b.compte === false && b.cle) return `Un billet sans compte ne porte pas de clé (billet ${b.code}).`
    }
    return null
  }
  if (msg.type === 'annulation') {
    if (!Array.isArray(msg.codes) || !msg.codes.length) return 'Une annulation doit contenir au moins un code.'
    for (const c of msg.codes) if (!CODE.test(c || '')) return `Code de billet invalide : ${c}`
    return null
  }
  return `Type de message inconnu : ${msg.type}`
}

const clean = (v, max = 80) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max)

/**
 * Traite un message déjà authentifié et validé.
 * Renvoie { status, body } : 200/201 { ok }, 200 { ok, duplicate }, 404 { error }.
 */
/**
 * ev : événement de la clé de liaison ; source : nom de cette clé (« festylla.com »),
 * gardé sur chaque compte créé et sur chaque message reçu (règle d'échange v1.3, §2).
 */
async function handleMessage(store, msg, { ev, source = '' } = {}) {
  if (!EVENT_ID.test(ev || '')) throw new Error('Événement de la clé manquant')
  return store.runTransaction(async (tx) => {
    const event = await tx.get(`events/${ev}`)
    if (!event.exists) return { status: 404, body: { error: `Événement inconnu dans YllaCash : ${ev}` } }

    const recuPath = `events/${ev}/billetterie-recus/${msg.id}`
    if ((await tx.get(recuPath)).exists) return { status: 200, body: { ok: true, duplicate: true } }

    // Toutes les lectures avant les écritures (règle des transactions Firestore)
    const codes = msg.type === 'vente' ? msg.billets.map(b => b.code) : msg.codes
    const current = {}
    for (const code of codes) current[code] = await tx.get(`events/${ev}/spectateurs/FY-${code}`)
    // Clés des comptes (sécurité, 20/11/2026) : rangées à part, dans events/{ev}/cles, que seul le
    // serveur lit. La fiche du spectateur, lue par les bénévoles au contrôle, n'en contient plus.
    const cles = {}
    if (msg.type === 'vente') for (const code of codes) cles[code] = await tx.get(`events/${ev}/cles/FY-${code}`)

    let created = 0, restored = 0, cancelled = 0, unknown = 0
    if (msg.type === 'vente') {
      for (const b of msg.billets) {
        const path = `events/${ev}/spectateurs/FY-${b.code}`
        if (current[b.code].exists) {
          // Vente renvoyée (rétablissement) : on ne touche ni au solde ni aux entrées ; la clé déjà
          // enregistrée n'est jamais remplacée, mais un billet d'essai sans clé reçoit la sienne
          const known = current[b.code].data && current[b.code].data.billet
          const dejaCle = (cles[b.code].exists && cles[b.code].data && cles[b.code].data.cle) || (known && known.cle)
          // Billet sans compte : la marque est posée aussi sur un billet déjà reçu (renvoi de tous les billets)
          tx.set(path, { billet: { annule: false, ...(b.compte === false ? { sansCompte: true } : {}) } }, { merge: true })
          if (!dejaCle && b.cle && b.compte !== false) tx.set(`events/${ev}/cles/FY-${b.code}`, { cle: b.cle })
          restored++
        } else {
          tx.set(path, {
            id: `FY-${b.code}`,
            nom: clean(`${clean(b.prenom)} ${clean(b.nom)}`, 120),
            source: clean(source, 60),
            solde: 0,
            avatar: null,
            createdAt: store.now(),
            billet: {
              code: b.code,
              ref: b.ref,
              pass: clean(b.pass),
              jours: b.jours,
              prix: Math.round(b.prix * 100),
              commande: clean(msg.commande, 40),
              // Billet sans compte (choix de l'acheteur sur le site) : reconnu à l'entrée, mais ni espace,
              // ni recharge, ni « Lien perdu » ; son porteur paie en passant par la billetterie
              ...(b.compte === false ? { sansCompte: true } : {}),
              annule: false,
              entrees: {},
            },
          })
          if (b.cle && b.compte !== false) tx.set(`events/${ev}/cles/FY-${b.code}`, { cle: b.cle })
          created++
        }
      }
    } else {
      for (const code of msg.codes) {
        const snap = current[code]
        // Billet inconnu : rien à faire, mais on répond 200 (§2 « Ordre »)
        if (!snap.exists || !snap.data || !snap.data.billet) { unknown++; continue }
        tx.set(`events/${ev}/spectateurs/FY-${code}`, { billet: { annule: true } }, { merge: true })
        cancelled++
      }
    }

    tx.set(recuPath, { type: msg.type, commande: clean(msg.commande, 40), le: clean(msg.le, 40), source: clean(source, 60), recuLe: store.now() })
    return {
      created,
      status: msg.type === 'vente' && created ? 201 : 200,
      body: { ok: true, ...(msg.type === 'vente' ? { crees: created, retablis: restored } : { annules: cancelled, inconnus: unknown }) },
    }
  })
}

// ── Envoi des entrées à Event Manager (§5) ──────────────────────────────────
const MIN = 60 * 1000
const RETRY_DELAYS = [1 * MIN, 5 * MIN, 30 * MIN, 120 * MIN]
const RETRY_LATER = 360 * MIN
const RETRY_LIMIT = 7 * 24 * 60 * MIN

/** Après un échec d'envoi : prochaine tentative, ou abandon au bout de 7 jours */
function nextAttempt({ tentatives = 0, premierEssaiMs }, nowMs) {
  const n = tentatives + 1
  const first = premierEssaiMs || nowMs
  if (nowMs - first >= RETRY_LIMIT) return { statut: 'echec', tentatives: n, premierEssaiMs: first }
  const delay = RETRY_DELAYS[n - 1] || RETRY_LATER
  return { statut: 'attente', tentatives: n, premierEssaiMs: first, prochainMs: nowMs + delay }
}

/** Codes HTTP qui signalent un réglage à corriger : inutile de réessayer (§2) */
const isSettingError = (status) => [400, 401, 403, 404].includes(status)

/**
 * Prépare l'envoi à partir des entrées en attente d'un événement.
 * docs : [{ id, data }] ; renvoie { toSend: [{ id, sentAnnulee, line }], useless: [id] }
 */
function prepareEntrees(docs, nowMs) {
  const toSend = [], useless = []
  for (const d of docs) {
    const e = d.data
    if (!e.envoi || e.envoi.statut !== 'attente') continue
    if ((e.envoi.prochainMs || 0) > nowMs) continue
    // Entrée annulée qui n'est jamais partie : rien à dire à Event Manager
    if (e.annulee && !e.envoi.dejaEnvoye) { useless.push(d.id); continue }
    if (!HEX16.test(e.ref || '')) { useless.push(d.id); continue }
    toSend.push({ id: d.id, sentAnnulee: !!e.annulee, line: { ref: e.ref, jour: e.jour, heure: e.heure, annulee: !!e.annulee } })
  }
  return { toSend, useless }
}

const newMessageId = () => crypto.randomBytes(16).toString('hex')

module.exports = {
  checkAuth, validateMessage, handleMessage, nextAttempt, isSettingError, prepareEntrees, newMessageId,
  RETRY_DELAYS, RETRY_LIMIT,
}
