/**
 * api/_auth/role.js — onglet de rôle d'un bénévole : quand peut-il s'ouvrir ? (écran 11, 24/11/2026)
 *
 * Règles validées par l'organisateur le 23/11/2026 :
 *  - le bénévole a un rôle d'équipe sur sa fiche (écran 10) ;
 *  - il est inscrit sur un créneau d'un poste qui ouvre ce même rôle ;
 *  - ouverture de 15 min avant le début jusqu'à la fin du créneau ;
 *  - billetterie : encore 30 min après la fin, pour la clôture de caisse seulement ;
 *  - jamais coupé au milieu d'une opération : l'accès accordé dure 10 min de plus que le créneau,
 *    l'écran ne propose plus rien de nouveau après la fin.
 * Tout se calcule à l'heure du serveur, à l'heure de Paris (jamais celle du téléphone).
 */
const { parisToMs } = require('../_em/instantane')
const { ROLES_EQUIPE_BENEVOLE } = require('./core')

const MIN = 60 * 1000
const AVANT_MS = 15 * MIN
const CLOTURE_MS = 30 * MIN
const MARGE_MS = 10 * MIN
const JOUR = /^\d{4}-\d{2}-\d{2}$/
const HEURE = /^\d{2}:\d{2}$/

/** Rôle ouvert par un poste ; un ancien poste « contrôle les billets » vaut « controle_entree » */
function posteRole(p) {
  if (!p) return ''
  if (p.role !== undefined && p.role !== null) return ROLES_EQUIPE_BENEVOLE.includes(p.role) ? p.role : ''
  return p.controleBillets ? 'controle_entree' : ''
}

/** Instants (ms) d'un créneau ; une fin avant le début passe minuit ; sans fin : 2 h */
function bornes(jour, debut, fin) {
  if (!JOUR.test(String(jour || '')) || !HEURE.test(String(debut || ''))) return null
  const d = parisToMs(jour, debut)
  let f = HEURE.test(String(fin || '')) ? parisToMs(jour, fin) : d + 120 * MIN
  if (f <= d) f += 24 * 60 * MIN
  return { debut: d, fin: f }
}

/**
 * Créneaux du planning de YllaCash qui ouvrent ce rôle pour ce bénévole.
 * shifts : volunteer-shifts { date, debut, fin, postes: { [postId]: { assignments: [id] } } }
 * posts  : { [postId]: volunteer-post }
 */
function creneauxDuRole({ shifts = [], posts = {}, benevId, role }) {
  const out = []
  for (const s of shifts) {
    const entry = Object.entries(s.postes || {}).find(([, p]) => (p?.assignments || []).includes(benevId))
    if (!entry) continue
    const post = posts[entry[0]]
    if (posteRole(post) !== role) continue
    const b = bornes(s.date, s.debut, s.fin)
    if (b) out.push({ ...b, poste: post?.nom || '' })
  }
  return out.sort((a, b) => a.debut - b.debut)
}

/**
 * État de l'onglet à l'instant now :
 *  { etat: 'ouvert', debut, fin, jusqua, poste }   déverrouillable (accès jusqu'à fin + 10 min)
 *  { etat: 'cloture', fin, jusqua, poste }         billetterie : clôture de caisse seule, 30 min
 *  { etat: 'tot', prochain: { debut, fin, poste }, ouvreA }
 *  { etat: 'ferme', prochain? }                    aucun créneau en cours ni à venir
 */
function fenetreRole(creneaux, role, now) {
  const ouverts = creneaux.filter(c => now >= c.debut - AVANT_MS && now < c.fin)
  if (ouverts.length) {
    const c = ouverts.reduce((a, b) => (b.fin > a.fin ? b : a))
    return { etat: 'ouvert', debut: c.debut, fin: c.fin, jusqua: c.fin + MARGE_MS, poste: c.poste }
  }
  if (role === 'billetterie') {
    const finis = creneaux.filter(c => now >= c.fin && now < c.fin + CLOTURE_MS)
    if (finis.length) {
      const c = finis.reduce((a, b) => (b.fin > a.fin ? b : a))
      return { etat: 'cloture', debut: c.debut, fin: c.fin, jusqua: c.fin + CLOTURE_MS, poste: c.poste }
    }
  }
  const prochain = creneaux.find(c => c.debut - AVANT_MS > now)
  if (prochain) return { etat: 'tot', prochain, ouvreA: prochain.debut - AVANT_MS }
  return { etat: 'ferme' }
}

// ── Ouverture exceptionnelle par un admin (écran 12, 24/11/2026) ─────────────
// fiche.roleException = { jusqua (ms), le (ms), par (uid), parNom, motif } : écrite par le serveur seul.
const EXCEPTION_MINUTES = [30, 60, 120, 240]

/** Ouverture exceptionnelle encore valable, ou null */
function exceptionActive(fiche, now) {
  const e = fiche?.roleException
  return e && Number(e.jusqua) > now ? e : null
}

/**
 * Fenêtre tenant compte d'une ouverture exceptionnelle : hors créneau (ou si elle va plus loin),
 * l'onglet est ouvrable jusqu'à sa fin ; l'accès accordé garde la marge de 10 min.
 */
function avecException(fenetre, fiche, now) {
  const e = exceptionActive(fiche, now)
  if (!e) return fenetre
  const finE = Number(e.jusqua)
  if (fenetre.etat === 'ouvert' && fenetre.fin >= finE) return fenetre
  return {
    etat: 'ouvert', debut: Number(e.le) || now, fin: finE, jusqua: finE + MARGE_MS, poste: '',
    exception: { parNom: e.parNom || '', motif: e.motif || '', jusqua: finE },
  }
}

/** Jetons de session : ceux du bénévole, plus le rôle ouvert jusqu'à `jusqua` */
function claimsRole(baseClaims, { role, fenetre }) {
  return {
    ...baseClaims,
    roleEquipe: role,
    roleMode: fenetre.etat === 'cloture' ? 'cloture' : 'complet',
    roleFin: fenetre.fin,
    roleJusqua: fenetre.jusqua,
    // Ouverture exceptionnelle : l'annulation par un admin coupe l'accès tout de suite (règles, serveur)
    ...(fenetre.exception ? { roleExc: true } : {}),
  }
}

/** Un jeton de bénévole dont le rôle est ouvert (tout, pas seulement la clôture) agit comme l'équipe */
function roleActif(t, now = Date.now()) {
  return !!t && t.type === 'benevole' && ROLES_EQUIPE_BENEVOLE.includes(t.roleEquipe)
    && t.roleMode === 'complet' && Number(t.roleJusqua) > now
}

module.exports = { posteRole, bornes, creneauxDuRole, fenetreRole, claimsRole, roleActif, exceptionActive, avecException, EXCEPTION_MINUTES, AVANT_MS, CLOTURE_MS, MARGE_MS }
