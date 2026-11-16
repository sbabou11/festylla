/**
 * utils/msAccount.js — connexion Microsoft de l'équipe
 *
 * Microsoft confirme l'adresse e-mail de la personne ; on retrouve ensuite SA fiche
 * existante (staff ou bénévole) par cette adresse. Aucune fiche n'est créée : une
 * adresse inconnue est refusée. Le rôle reste celui de la fiche.
 */

export const normEmail = (e) => String(e || '').trim().toLowerCase()

// Contenu (non vérifié) d'un jeton JWT : sert seulement à relire l'annuaire d'origine.
export function jwtClaims(token) {
  try {
    const part = String(token || '').split('.')[1]
    if (!part) return {}
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    const json = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary')
    return JSON.parse(decodeURIComponent(escape(json)))
  } catch { return {} }
}

// Adresse du compte Microsoft : e-mail, sinon adresse de connexion (UPN)
export function microsoftEmail({ user, profile, claims } = {}) {
  const c = claims || {}, p = profile || {}
  return normEmail(user?.email || c.email || p.mail || p.email || c.preferred_username || p.userPrincipalName || c.upn)
}

// Le compte vient-il de l'annuaire Fest'Ylla ? Sans information d'annuaire, la restriction
// faite dans Microsoft Entra (« cet annuaire uniquement ») s'applique seule.
export function tenantAllowed({ profile, claims } = {}, tenant) {
  const want = normEmail(tenant)
  if (!want) return false
  const tid = normEmail(claims?.tid || profile?.tid)
  return !tid || tid === want
}

/**
 * groups : listes de fiches dans l'ordre de recherche
 *   [{ kind: 'staff' | 'benevole', eventId, docs: [{ id, data }] }]
 * Renvoie la première fiche staff dont l'e-mail correspond, sinon la première fiche bénévole.
 */
export function pickAccountByEmail(groups, email) {
  const want = normEmail(email)
  if (!want || !want.includes('@')) return null
  let benevole = null
  for (const g of groups || []) {
    for (const d of g.docs || []) {
      if (normEmail(d.data?.email) !== want) continue
      const found = { id: d.id, data: d.data, kind: g.kind, eventId: g.eventId || null }
      if (g.kind === 'staff') return found
      if (!benevole) benevole = found
    }
  }
  return benevole
}

// Message affiché pour chaque erreur de la fenêtre Microsoft (null : rien à afficher)
export function microsoftErrorMessage(code) {
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return null
    case 'auth/popup-blocked':
      return 'Le navigateur a bloqué la fenêtre Microsoft. Autorisez les fenêtres pour ce site, puis réessayez.'
    case 'auth/operation-not-allowed':
      return "La connexion Microsoft n'est pas encore activée. Utilisez votre identifiant et votre mot de passe."
    case 'auth/unauthorized-domain':
      return "Cette adresse n'est pas autorisée pour la connexion Microsoft. Utilisez votre identifiant et votre mot de passe."
    case 'auth/network-request-failed':
      return 'Pas de connexion internet. Réessayez dans un instant.'
    default:
      // Le code technique aide à trouver le réglage en cause (guide, « En cas de problème »)
      return `Connexion Microsoft impossible${code ? ` (code : ${code})` : ''}. Réessayez, ou utilisez votre identifiant et votre mot de passe.`
  }
}

/* Champ « Adresse e-mail Microsoft » des fiches : facultatif, vide ou nom@domaine.ext */
export const cleanEmail = (v) => (v || '').trim().toLowerCase() || null
export const emailOk = (v) => !(v || '').trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
