/**
 * utils/roleEquipe.js — rôle d'équipe d'un bénévole (écran 10, 23/11/2026)
 *
 * Mêmes règles que le serveur (api/_auth/core.js, validateRolePassword) pour prévenir l'admin
 * avant l'envoi ; c'est le serveur qui décide.
 */
export const ROLES_EQUIPE = [
  { value: '', label: 'Aucun', color: '#9AA9B2' },
  { value: 'billetterie', label: 'Billetterie', color: '#F07848' },
  { value: 'controle_entree', label: 'Contrôle entrée', color: '#5B6CF0' },
  { value: 'consultation', label: 'Consultation', color: '#0E8C8C' },
]
export const labelRoleEquipe = (v) => ROLES_EQUIPE.find(r => r.value === v)?.label || ''

/**
 * Écran 11 (24/11/2026) : rôle ouvert par un poste du planning. Un poste enregistré avant n'a que
 * « controleBillets » : il vaut « Contrôle entrée ». Même règle côté serveur (api/_auth/role.js).
 */
export const posteRole = (p) => {
  if (!p) return ''
  if (p.role !== undefined && p.role !== null) return ROLES_EQUIPE.some(r => r.value === p.role) ? p.role : ''
  return p.controleBillets ? 'controle_entree' : ''
}

const net = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const SUITES_FACILES = /(0123|1234|2345|3456|4567|5678|6789|azerty|qwerty|password|motdepasse|festival|ylla)/

/** Message d'erreur, ou null si le mot de passe convient à un rôle d'équipe */
export function erreurMotDePasseRole(mdp, fiche = {}) {
  const p = String(mdp || '')
  if (p.length < 8) return 'Au moins 8 caractères.'
  if (p.length > 200) return 'Mot de passe trop long.'
  const low = net(p)
  const mots = [fiche.username, fiche.prenom, fiche.nom].flatMap(x => net(x).split(/[^a-z0-9]+/)).filter(x => x.length >= 3)
  if (mots.some(m => low.includes(m)) || SUITES_FACILES.test(low) || /^(.)\1+$/.test(p)) return 'Trop facile à deviner : évitez le nom, l\'identifiant et les suites simples.'
  return null
}

/** Solidité de 0 à 1, pour la jauge */
export const soliditeMotDePasse = (mdp) => {
  const p = String(mdp || '')
  if (!p) return 0
  let s = Math.min(p.length, 16) / 16
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s += 0.15
  if (/\d/.test(p)) s += 0.1
  if (/[^A-Za-z0-9]/.test(p)) s += 0.1
  return Math.min(1, s)
}

// Mot de passe facile à dicter : deux mots, un tiret, deux chiffres (ex. « Tamarin-Kora-58 »)
const MOTS = ['Tamarin', 'Kora', 'Baobab', 'Djembe', 'Mangue', 'Bissap', 'Sahel', 'Karite', 'Balafon', 'Hibiscus', 'Savane', 'Lagune', 'Teranga', 'Ndombolo', 'Kola', 'Fonio']
export function genererMotDePasseRole() {
  const r = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n }
  let a = MOTS[r(MOTS.length)], b = MOTS[r(MOTS.length)]
  while (b === a) b = MOTS[r(MOTS.length)]
  return `${a}-${b}-${10 + r(90)}`
}
