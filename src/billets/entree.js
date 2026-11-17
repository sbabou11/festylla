/**
 * billets/entree.js — règle du contrôle des billets à l'entrée (sans Firebase, testée)
 *
 * Règle d'échange echanges-billetterie.md §4 :
 *   compte inconnu ou sans billet → inconnu
 *   billet annulé                 → annule
 *   entrée déjà notée aujourd'hui → deja (avec l'heure)
 *   autant de jours que le pass   → epuise (avec les jours)
 *   sinon                         → valable : l'entrée du jour est enregistrée
 */

/** Jour et heure à Paris, quel que soit le fuseau de l'appareil : { jour: 'AAAA-MM-JJ', heure: 'HH:MM' } */
export function parisNow(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).map(p => [p.type, p.value]))
  return { jour: `${parts.year}-${parts.month}-${parts.day}`, heure: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}` }
}

/**
 * spec : document du compte (ou null s'il n'existe pas) ; jour : 'AAAA-MM-JJ'.
 * Renvoie { status, ... } — status ∈ inconnu | annule | deja | epuise | valable.
 */
export function checkEntree(spec, jour) {
  const b = spec?.billet
  if (!spec || !b) return { status: 'inconnu' }
  if (b.annule) return { status: 'annule', commande: b.commande || null }
  const entrees = b.entrees || {}
  if (entrees[jour]) return { status: 'deja', heure: entrees[jour] }
  const jours = Object.keys(entrees).sort()
  if (jours.length >= (b.jours || 1)) return { status: 'epuise', jours }
  return { status: 'valable', rang: jours.length + 1, total: b.jours || 1 }
}

const fmtJour = (j) => {
  const [y, m, d] = j.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })
}

/** Textes affichés au bénévole pour chaque réponse */
export function describeEntree(r) {
  switch (r.status) {
    case 'valable': return { tone: 'ok', title: 'Billet valable', detail: `Entrée enregistrée${r.heure ? ` à ${r.heure}` : ''} · ${r.rang === 1 ? '1er' : `${r.rang}e`} jour sur ${r.total}` }
    case 'deja': return { tone: 'warn', title: `Déjà entré aujourd'hui à ${r.heure}`, detail: 'Une seule entrée par jour.' }
    case 'epuise': return { tone: 'bad', title: 'Billet déjà utilisé', detail: `Entré ${r.jours.length > 1 ? 'les' : 'le'} ${r.jours.map(fmtJour).join(', ')}.` }
    case 'annule': return { tone: 'bad', title: 'Billet annulé', detail: r.commande ? `Commande ${r.commande} annulée ou remboursée.` : 'Commande annulée ou remboursée.' }
    default: return { tone: 'bad', title: 'Billet inconnu', detail: 'Ce code ne correspond à aucun billet.' }
  }
}
