/**
 * api/_auth/porteMonnaie.js — porte-monnaie d'un bénévole (écran 13, 24/11/2026)
 *
 * Choix de l'organisateur : le bénévole a un solde comme un spectateur (recharge en ligne par carte
 * ou à la billetterie, toute la carte, codes, borne, remboursement, don), en plus de ses avantages.
 * Ce solde est un compte de type spectateur, events/{ev}/spectateurs/FY-BV…, relié à la fiche :
 *   compte : { id, nom, solde, porteMonnaieBenevole: true, benevoleId }
 *   fiche  : porteMonnaie { id, docId }   (écrit par le serveur seul)
 * Ainsi tous les chemins d'argent déjà sûrs des spectateurs servent tels quels.
 */
const crypto = require('crypto')

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'   // sans 0/O ni 1/I
const CODE_PM = /^FY-BV[A-Z2-9]{6}$/

/** « FY-BV » + 6 caractères : reconnaissable, jamais pris par un billet du site */
function codePorteMonnaie() {
  const b = crypto.randomBytes(6)
  let s = 'FY-BV'
  for (let i = 0; i < 6; i++) s += ALPHA[b[i] % ALPHA.length]
  return s
}

const nomFiche = (d = {}) => `${d.prenom || ''} ${d.nom || ''}`.trim() || 'Bénévole'

/**
 * Porte-monnaie de la fiche, créé s'il n'existe pas (transaction : jamais deux).
 * account : { id, eventId, data, path } (loadAccount). Renvoie { id, docId, solde, cree }.
 */
async function assurerPorteMonnaie(db, admin, account) {
  const evRef = db.collection('events').doc(account.eventId)
  const ficheRef = db.doc(account.path)
  return db.runTransaction(async (tx) => {
    const fiche = await tx.get(ficheRef)
    if (!fiche.exists) throw new Error('Fiche bénévole introuvable.')
    const pm = fiche.data().porteMonnaie
    if (pm && pm.docId) {
      const c = await tx.get(evRef.collection('spectateurs').doc(String(pm.docId)))
      if (c.exists) return { id: c.data().id, docId: c.id, solde: Number(c.data().solde) || 0, cree: false }
    }
    let code = null
    for (let i = 0; i < 5 && !code; i++) {
      const essai = codePorteMonnaie()
      if (!(await tx.get(evRef.collection('spectateurs').doc(essai))).exists) code = essai
    }
    if (!code) throw new Error('Aucun numéro libre, réessayez.')
    tx.set(evRef.collection('spectateurs').doc(code), {
      id: code, nom: nomFiche(fiche.data()), solde: 0, porteMonnaieBenevole: true, benevoleId: account.id,
      source: 'benevole', createdAt: admin.firestore.FieldValue.serverTimestamp(), timestamp: new Date().toISOString(),
    })
    tx.update(ficheRef, { porteMonnaie: { id: code, docId: code } })
    return { id: code, docId: code, solde: 0, cree: true }
  })
}

module.exports = { codePorteMonnaie, assurerPorteMonnaie, CODE_PM, nomFiche }
