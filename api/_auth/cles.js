/**
 * api/_auth/cles.js — clé secrète d'un compte spectateur (sécurité, 20/11/2026)
 *
 * La clé ouvre l'espace du spectateur et sert à calculer son QR tournant. Elle était rangée dans
 * sa fiche (billet.cle ou cle), que les bénévoles et les artistes peuvent lire. Elle est désormais
 * dans events/{ev}/cles/{fiche}, que les règles réservent au serveur. Tant que la conversion d'un
 * événement n'a pas été lancée (api/securite, « migrer-cles »), l'ancien emplacement reste lu.
 */
const { accountKey } = require('./core')

async function cleDuCompte(evRef, docId, spec) {
  const d = await evRef.collection('cles').doc(String(docId)).get()
  return (d.exists && d.data().cle) || accountKey(spec) || ''
}

module.exports = { cleDuCompte }
