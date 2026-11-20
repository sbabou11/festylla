/**
 * utils/historiqueSpec.js — lecture des opérations d'un compte dans l'espace spectateur (20/11/2026)
 *
 * Avant : un ticket remboursé s'affichait « — », un remboursement de solde sans signe, et ni le
 * total « Dépensé » ni le graphe n'en tenaient compte. Une seule règle sert maintenant à
 * l'affichage, aux totaux et au graphe : l'effet de chaque opération sur le solde.
 */

/** Effet d'une opération sur le solde, en centimes (positif : le solde monte) */
export function effetSolde(t) {
  const m = Math.round(Number(t?.montant) || 0)
  switch (t?.type) {
    case 'credit':
    case 'credit_correction':
    case 'annulation':          // ticket remboursé ou vente annulée : le solde est recrédité
      return m
    case 'debit':
    case 'reservation':
    case 'remboursement':       // solde rendu au spectateur (carte, espèces)
    case 'debit_correction':
    case 'don':                 // solde donné à l'ONG Ylla (20/11/2026)
      return -m
    default:
      return 0
  }
}

/** Signe affiché devant le montant : « + », « − », ou rien si l'opération ne bouge pas le solde */
export const signeDe = (t) => { const e = effetSolde(t); return e > 0 ? '+' : e < 0 ? '−' : '' }

/** Précision sous un remboursement de solde : où l'argent est allé */
export function destinationRemboursement(t) {
  if (t?.type !== 'remboursement') return ''
  const m = String(t.moyen || '').toLowerCase()
  if (m === 'en-ligne') return 'sur votre carte'
  if (m.startsWith('esp')) return 'en espèces à la billetterie'
  if (m === 'cb' || m.startsWith('carte')) return 'sur votre carte, à la billetterie'
  return ''
}

/** Totaux de l'en-tête : rechargé, dépensé (tickets remboursés déduits), remboursé */
export function totauxCompte(txs = []) {
  let recharge = 0, depense = 0, rembourse = 0, donne = 0
  for (const t of txs) {
    const m = Math.round(Number(t.montant) || 0)
    if (t.type === 'credit') recharge += m
    else if (t.type === 'debit' || t.type === 'reservation') depense += m
    else if (t.type === 'annulation') depense -= m
    else if (t.type === 'remboursement') rembourse += m
    else if (t.type === 'don') donne += m
  }
  return { recharge, depense: Math.max(0, depense), rembourse, donne }
}
