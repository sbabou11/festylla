/**
 * api/_paiement/reversement.js — soldes non réclamés reversés à l'ONG Ylla (20/11/2026)
 *
 * Choix de l'organisateur : deux mois après le dernier jour de l'événement, les soldes que
 * personne n'a réclamés sont donnés à l'ONG Ylla. Appelé par la tâche planifiée (chaque minute),
 * par petits lots pour rester dans le temps accordé à une fonction ; une fois tous les comptes
 * traités, l'événement est marqué (soldesReverses) et n'est plus jamais repris.
 *
 * Ne sont pas touchés : les événements terminés avant la mise en service de la règle, et les
 * comptes qui ont une demande de remboursement en attente à la billetterie (le spectateur a
 * réclamé son argent à temps : il lui reste dû).
 */
const { reversementApplicable, BENEFICIAIRE } = require('./dons')

const LOT = 40
const parisDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' })
const parisTime = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const euros = (c) => (c / 100).toFixed(2).replace('.', ',') + ' €'

/**
 * @param admin  firebase-admin
 * @param evDoc  document de l'événement (déjà lu par la tâche planifiée)
 * @returns null si l'événement n'est pas concerné, sinon { comptes, total, termine }
 */
async function reverserSoldes(admin, evDoc, now = new Date()) {
  const event = evDoc.data() || {}
  if (event.deleted || !reversementApplicable(event, now.getTime())) return null
  const db = admin.firestore()
  const evRef = evDoc.ref
  const ts = admin.firestore.FieldValue.serverTimestamp()
  const date = parisDate.format(now), heure = parisTime.format(now), iso = now.toISOString()

  const snap = await evRef.collection('spectateurs').where('solde', '>', 0).get()
  const aTraiter = snap.docs.filter(d => !d.data().demandeRemboursement)
  const reclames = snap.size - aTraiter.length
  let comptes = 0, total = 0
  for (const d of aTraiter.slice(0, LOT)) {
    const montant = await db.runTransaction(async (t) => {
      const spec = await t.get(d.ref)
      const solde = Math.round(Number(spec.exists && spec.data().solde) || 0)
      if (solde <= 0 || spec.data().demandeRemboursement) return 0
      t.update(d.ref, { solde: admin.firestore.FieldValue.increment(-solde) })
      t.set(evRef.collection('transactions').doc(), {
        specId: spec.data().id || '', specNom: spec.data().nom || '—', type: 'don', auto: true, beneficiaire: BENEFICIAIRE,
        label: `Solde non réclamé reversé à l'${BENEFICIAIRE}`, montant: solde, staff: 'YllaCash',
        soldeBefore: solde, soldeAfter: 0, date, heure, timestamp: iso, createdAt: ts,
      })
      return solde
    })
    if (montant > 0) { comptes++; total += montant }
  }
  const termine = aTraiter.length <= LOT
  const deja = event.reversementEnCours || { comptes: 0, total: 0 }
  const cumul = { comptes: deja.comptes + comptes, total: deja.total + total }
  if (termine) {
    await evRef.update({
      soldesReverses: { le: iso, ...cumul, reclames, beneficiaire: BENEFICIAIRE },
      reversementEnCours: admin.firestore.FieldValue.delete(),
    })
    await evRef.collection('audit').add({
      action: 'SOLDES_REVERSES_ONG', montant: cumul.total, staff: 'YllaCash', userType: 'systeme',
      label: `Soldes non réclamés reversés à l'${BENEFICIAIRE} : ${euros(cumul.total)} sur ${cumul.comptes} compte${cumul.comptes > 1 ? 's' : ''}`
        + (reclames ? ` (${reclames} compte${reclames > 1 ? 's' : ''} avec une demande de remboursement en attente, non touché${reclames > 1 ? 's' : ''})` : ''),
      date: `${date} ${heure}`, timestamp: iso, createdAt: ts,
    }).catch(() => {})
  } else if (comptes) {
    await evRef.update({ reversementEnCours: cumul })
  }
  return { comptes, total, termine }
}

module.exports = { reverserSoldes }
