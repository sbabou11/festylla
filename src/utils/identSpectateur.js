/**
 * utils/identSpectateur.js — retrouver un spectateur à la caisse ou à la billetterie (20/11/2026)
 *
 * On ne retrouve plus un compte avec son code « FY-… » : le spectateur présente le QR tournant de
 * son espace (ou donne son code de secours si « Scanner en panne » est activé) et le serveur le
 * vérifie (api/qr). Seul un administrateur peut encore taper un code « FY-… », pour dépanner.
 * Renvoie l'identifiant du compte ; toute autre lecture (QR d'un bénévole…) est rendue telle quelle.
 */
import { apiFetch } from '../firebase/session'
import { parseQrTournant, parseSecours } from './qrTournant'
import { extractSpecId } from './specCode'

const ADMIN = ['admin', 'super_admin']

export async function identifierSpectateur(saisie, { ev, role } = {}) {
  const texte = String(saisie || '').trim()
  const jeton = parseQrTournant(texte)
  const secours = jeton ? null : parseSecours(texte)
  if (jeton || secours) {
    if (!ev) throw new Error('Aucun événement courant.')
    const r = await apiFetch('/api/qr', { body: { action: 'identifier', ev, ...(jeton ? { qr: jeton } : { secours }) } })
    return r.compte.id
  }
  // Écran 13 (24/11/2026) : QR de l'espace d'un bénévole → son porte-monnaie (vérifié par le serveur)
  const jetonBenevole = texte.toUpperCase().match(/YB-[A-Z2-7]{2,205}-[0-9A-Z]{4,9}-[A-Z2-7]{12}/)
  if (jetonBenevole) {
    if (!ev) throw new Error('Aucun événement courant.')
    const r = await apiFetch('/api/qr', { body: { action: 'identifier', ev, qr: jetonBenevole[0] } })
    return r.compte.id
  }
  const fy = /FY-/i.test(texte) ? extractSpecId(texte) : null
  if (fy && !ADMIN.includes(role)) {
    throw new Error('Le code « FY-… » ne suffit plus. Scannez le QR affiché dans l\'espace du spectateur.')
  }
  return fy || texte.toUpperCase()
}
