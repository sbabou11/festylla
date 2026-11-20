/**
 * utils/annulationTx.js — annulation d'une transaction par un administrateur (20/11/2026)
 *
 * Avant : « Supprimer » effaçait toutes les transactions de même libellé et de même date, sans
 * corriger le solde. Désormais on annule une seule ligne, par une écriture inverse : la transaction
 * d'origine reste, marquée « Annulée », le solde est corrigé et la caisse aussi.
 *
 * planAnnulation(tx) dit ce que l'annulation fera, ou lève une erreur si cette ligne ne s'annule
 * pas ici (commande de la borne, paiement en ligne, avantage offert…).
 * @returns {{ delta, contre, caisse }}
 *   delta  : variation du solde du spectateur, en centimes (négatif = on retire)
 *   contre : champs de l'écriture inverse (type, moyen, surPlace, label)
 *   caisse : { sens: 'moins' | 'plus', moyen } si la caisse du bénévole d'origine est touchée
 */
const moyenDe = (t) => {
  const m = String(t.moyen || '').toLowerCase()
  if (m.startsWith('esp')) return 'especes'
  if (m === 'cb' || m.startsWith('carte')) return 'cb'
  return null
}

export function planAnnulation(tx) {
  if (!tx) throw new Error('Transaction introuvable.')
  if (tx.annulee) throw new Error('Cette transaction est déjà annulée.')
  if (tx.annuleTx) throw new Error('Cette ligne est elle-même une annulation : elle ne s\'annule pas.')
  const m = Math.round(Number(tx.montant) || 0)
  if (m <= 0) throw new Error('Cette transaction n\'a pas de montant : rien à annuler.')
  if (!tx.specId) throw new Error('Cette transaction n\'est rattachée à aucun compte : elle ne s\'annule pas ici.')
  const moyen = moyenDe(tx)
  const base = `Annulation : ${tx.label || tx.type}`

  switch (tx.type) {
    case 'credit':
      if (String(tx.moyen || '').toLowerCase() === 'en-ligne') {
        throw new Error('Recharge payée en ligne : elle se rembourse depuis l\'espace du spectateur (« Demander le remboursement de mon solde »).')
      }
      // Recharge au guichet : l'argent ressort de la caisse du bénévole qui l'avait encaissée
      return { delta: -m, contre: { type: 'remboursement', surPlace: true, moyen: tx.moyen || null, label: base }, caisse: moyen ? { sens: 'moins', moyen } : null }
    case 'debit':
      if (tx.commandeNumero != null || tx.surPlace) {
        throw new Error('Cette vente vient d\'une commande : remboursez le ticket depuis Remboursement › Ticket.')
      }
      return { delta: +m, contre: { type: 'annulation', label: base }, caisse: null }
    case 'remboursement':
      if (tx.stripePaiement || tx.demandeId) {
        throw new Error('Remboursement demandé par le spectateur : il ne s\'annule pas ici.')
      }
      // Rendu noté en espèces ou par carte : l'argent revient dans la caisse ; sinon simple correction
      return tx.surPlace && moyen
        ? { delta: +m, contre: { type: 'credit', moyen: tx.moyen, label: base }, caisse: { sens: 'plus', moyen } }
        : { delta: +m, contre: { type: 'credit_correction', label: base }, caisse: null }
    case 'credit_correction':
      return { delta: -m, contre: { type: 'debit_correction', label: base }, caisse: null }
    case 'debit_correction':
      return { delta: +m, contre: { type: 'credit_correction', label: base }, caisse: null }
    default:
      throw new Error('Ce type de transaction ne s\'annule pas ici.')
  }
}
