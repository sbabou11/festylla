/**
 * api/_paiement/dons.js — dons du solde à l'ONG Ylla et date limite de remboursement (20/11/2026)
 *
 * Choix de l'organisateur :
 *   - le spectateur peut donner tout ou partie de son solde à l'ONG Ylla (lutte contre le cancer
 *     du sein), de 1 € jusqu'à son solde ; un don est définitif ;
 *   - le remboursement du solde se demande jusqu'à 2 mois après le dernier jour de l'événement ;
 *   - passé ce délai, les soldes non réclamés sont reversés à l'ONG Ylla.
 * Le même calcul existe côté appli (src/utils/dons.js) ; un test vérifie qu'ils concordent.
 */
const DON_MIN = 100                 // 1 €
const DELAI_MOIS = 2
const BENEFICIAIRE = 'ONG Ylla'
// Les événements terminés avant la mise en service ne sont jamais concernés par le reversement :
// leurs spectateurs n'ont pas été prévenus de la règle.
const EN_SERVICE_DEPUIS = '2026-11-21'

const JOUR = /^(\d{4})-(\d{2})-(\d{2})$/

/** Dernier jour de l'événement (AAAA-MM-JJ), ou '' si l'événement n'a pas de date */
function dernierJour(event) {
  const d = String((event && (event.dateFin || event.date)) || '')
  return JOUR.test(d) ? d : ''
}

/** Date limite de remboursement : fin du jour, DELAI_MOIS mois après le dernier jour. null si la règle ne s'applique pas. */
function limiteRemboursement(event) {
  const j = dernierJour(event)
  // Événement terminé avant la mise en service : ses spectateurs n'ont pas été prévenus, pas de date limite
  if (!j || j < EN_SERVICE_DEPUIS) return null
  const m = JOUR.exec(j)
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])]
  // Jour inexistant dans le mois d'arrivée (31 décembre + 2 mois) : on retient le dernier jour de ce mois
  const finMois = new Date(Date.UTC(y, mo + DELAI_MOIS + 1, 0)).getUTCDate()
  return Date.UTC(y, mo + DELAI_MOIS, Math.min(d, finMois), 23, 59, 59)
}

/** Vrai quand la date limite est passée */
function delaiDepasse(event, now = Date.now()) {
  const l = limiteRemboursement(event)
  return l != null && now > l
}

/** L'événement est-il concerné par le reversement des soldes non réclamés ? */
function reversementApplicable(event, now = Date.now()) {
  return delaiDepasse(event, now) && !(event && event.soldesReverses)
}

/** Montant d'un don, en centimes entiers, ou 0 s'il n'est pas acceptable pour ce solde */
function montantDon(montant, solde) {
  const m = Number(montant)
  if (!Number.isInteger(m) || m < DON_MIN) return 0
  return m <= Math.round(Number(solde) || 0) ? m : 0
}

module.exports = { DON_MIN, DELAI_MOIS, BENEFICIAIRE, EN_SERVICE_DEPUIS, dernierJour, limiteRemboursement, delaiDepasse, reversementApplicable, montantDon }
