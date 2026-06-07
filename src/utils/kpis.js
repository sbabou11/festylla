/**
 * utils/kpis.js — Source de vérité unique pour tous les KPIs financiers YllaCash
 * Utilisé par Dashboard, Analytics, useExport, useRapportCloture
 */

export const toCents  = (euros)   => Math.round((euros || 0) * 100)
export const fromCents = (cents)  => ((cents || 0) / 100)
export const CENTS_PER_EURO = 100

/**
 * Calcule tous les KPIs financiers depuis les données brutes du store
 * @param {object} data - { spectateurs, reservations, logs, menu }
 * @returns {object} KPIs complets
 */
export function computeKPIs({ spectateurs = [], reservations = [], logs = [], menu = [] }) {
  const allTx = logs

  // ── Financier ──────────────────────────────────────────────────────
  const totalCredits    = allTx.filter(t => t.type === 'credit')
                               .reduce((a, t) => a + (t.montant || 0), 0)

  const totalVentes     = allTx.filter(t => ['debit','retrait','benev-retrait'].includes(t.type))
                               .reduce((a, t) => a + (t.montant || 0), 0)

  const totalSoldes     = spectateurs.reduce((a, s) => a + (s.solde || 0), 0)

  // Mouvements de correction (Lot A) : remboursement = sortie cash, credit_correction = ajout solde virtuel
  const totalRemboursements    = allTx.filter(t => t.type === 'remboursement')
                                      .reduce((a, t) => a + (t.montant || 0), 0)
  const totalCreditsCorrection = allTx.filter(t => t.type === 'credit_correction')
                                      .reduce((a, t) => a + (t.montant || 0), 0)

  // Écart comptable : sommes ENTRANTES - sommes SORTANTES - soldes courants devrait = 0
  //   Entrées : crédits + crédits de correction
  //   Sorties : ventes (debit/retrait/benev-retrait) + remboursements de solde
  //   Soldes  : ce qu'il reste sur les comptes
  const ecartComptable  = (totalCredits + totalCreditsCorrection)
                          - (totalVentes + totalRemboursements)
                          - totalSoldes

  // ── Bénévoles ──────────────────────────────────────────────────────
  const benevResas      = reservations.filter(r => r.isBenev && r.status === 'collected')
  const coutBenev       = benevResas.reduce((a, r) =>
    a + (r.items || []).reduce((b, it) => b + (it.prix || 0) * (it.qty || 1), 0), 0)
  const caNette         = totalVentes - coutBenev
  const nbBenevsActifs  = new Set(benevResas.map(r => r.benevoleId).filter(Boolean)).size

  // ── Spectateurs ────────────────────────────────────────────────────
  const nbSpectateurs   = spectateurs.length
  const specAvecSolde   = spectateurs.filter(s => (s.solde || 0) > 0)
  const soldeMax        = spectateurs.reduce((a, s) => Math.max(a, s.solde || 0), 0)
  const soldeMoyen      = nbSpectateurs > 0 ? totalSoldes / nbSpectateurs : 0

  // ── Transactions ──────────────────────────────────────────────────
  const nbTransactions  = allTx.length
  const txCredits       = allTx.filter(t => t.type === 'credit')
  const txDebits        = allTx.filter(t => t.type === 'debit')
  const txRetraits      = allTx.filter(t => t.type === 'retrait')
  const txBenevRetrait  = allTx.filter(t => t.type === 'benev-retrait')
  const ticketMoyen     = txDebits.length > 0 ? totalVentes / txDebits.length : 0

  // ── Réservations ──────────────────────────────────────────────────
  const resasSpec       = reservations.filter(r => !r.isBenev)
  const resaCollected   = resasSpec.filter(r => r.status === 'collected').length
  const resaPending     = reservations.filter(r => (r.status === 'pending' || r.status === 'processing') && !r.isBenev).length
  const resaReady       = reservations.filter(r => r.status === 'ready' && !r.isBenev).length
  const activeResas     = reservations.filter(r => ['pending','processing','ready'].includes(r.status))
  const tauxRetrait     = resasSpec.length > 0 ? Math.round(resaCollected / resasSpec.length * 100) : 0

  // ── Menu ──────────────────────────────────────────────────────────
  const articlesMap = {}
  allTx.forEach(t => {
    ;(t.items || []).forEach(i => {
      if (!articlesMap[i.nom]) articlesMap[i.nom] = { nom: i.nom, qty: 0, ca: 0 }
      articlesMap[i.nom].qty += (i.qty || 1)
      articlesMap[i.nom].ca  += (i.total || (i.prixUnit || i.prix || 0) * (i.qty || 1))
    })
  })
  const topArticles = Object.values(articlesMap).sort((a, b) => b.ca - a.ca)

  // ── Répartition par type ──────────────────────────────────────────
  // Liste exhaustive de tous les types de transactions traités par le système.
  // Toute nouvelle fonction de service.js créant un type doit l'ajouter ici sinon
  // il ne figurera ni dans la répartition par type ni dans les exports détaillés.
  const TX_TYPES = [
    'credit','debit','retrait','benev-retrait',
    'reservation','annulation','benev-reservation','benev-annulation',
    'artist-gift','cachet-artiste',
    'remboursement','credit_correction',
  ]
  const txByType = TX_TYPES.map(typ => ({
    type: typ,
    nb:   allTx.filter(t => t.type === typ).length,
    vol:  allTx.filter(t => t.type === typ).reduce((a, t) => a + (t.montant || 0), 0),
  })).filter(t => t.nb > 0)

  // ── Staff ─────────────────────────────────────────────────────────
  const staffMap = {}
  allTx.forEach(t => {
    const k = t.staff || '—'
    if (!staffMap[k]) staffMap[k] = { email: k, credits: 0, debits: 0, retraits: 0, nb: 0, vol: 0 }
    staffMap[k].nb++
    staffMap[k].vol += (t.montant || 0)
    if (t.type === 'credit')  staffMap[k].credits++
    if (t.type === 'debit')   staffMap[k].debits++
    if (['retrait','benev-retrait'].includes(t.type)) staffMap[k].retraits++
  })
  const staffStats = Object.values(staffMap).sort((a, b) => b.nb - a.nb)

  return {
    // Financier
    totalCredits, totalVentes, totalSoldes, ecartComptable,
    coutBenev, caNette,
    totalRemboursements, totalCreditsCorrection,
    // Spectateurs
    nbSpectateurs, specAvecSolde, soldeMax, soldeMoyen,
    // Bénévoles
    benevResas, nbBenevsActifs,
    // Transactions
    nbTransactions, txCredits, txDebits, txRetraits, txBenevRetrait,
    ticketMoyen, txByType,
    // Réservations
    resasSpec, resaCollected, resaPending, resaReady, activeResas, tauxRetrait,
    // Menu
    topArticles, articlesMap,
    // Staff
    staffStats,
  }
}

/**
 * Formate des centimes en euros lisible
 */
export const fmtEuro = (centimes) => {
  const v = (centimes || 0) / 100
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

/**
 * Hash SHA-256 simple pour mots de passe bénévoles
 */
export async function hashPassword(plain) {
  const encoder = new TextEncoder()
  const data    = encoder.encode(plain + 'yllacash-salt-2025')
  const hash    = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Vérifie un mot de passe contre son hash
 */
export async function verifyPassword(plain, hash) {
  const computed = await hashPassword(plain)
  return computed === hash
}
