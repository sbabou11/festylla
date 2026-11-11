/**
 * pages/stand/cuisine/timing.js — seuils d'attente, niveaux d'alerte et horodatages de la cuisine
 * Seuils repris tels quels de la version de production (juin 2026).
 */

// Seuils de durée en secondes — escalade progressive
// 0-2 min   = vert        (normal)
// 2-5 min   = or          (surveiller)
// 5-10 min  = orange      (urgent + 1er niveau alerte sonore)
// 10-15 min = rouge       (critique + 2e niveau alerte plus fréquente, pulsation lente)
// > 15 min  = rouge plein (retard critique + alarme stridente, pulsation rapide)
export const SEUILS = {
  green:  120,   // < 2 min
  yellow: 300,   // 2-5 min
  orange: 600,   // 5-10 min
  red:    900,   // 10-15 min
  // au-delà : rouge plein + alarme
}

// Niveau d'urgence pour les rappels sonores (utilisé par la boucle d'alarmes)
// 0 = pas d'alerte ; 1 = orange ; 2 = rouge ; 3 = panique
export function urgencyLevel(secs) {
  if (secs < SEUILS.yellow) return 0  // < 5 min : aucune alerte
  if (secs < SEUILS.orange) return 1  // 5-10 min
  if (secs < SEUILS.red)    return 2  // 10-15 min
  return 3                            // > 15 min
}

// Intervalle entre 2 rappels sonores en secondes, selon le niveau
export const RAPPEL_INTERVAL = {
  1: 60,  // rappel toutes les 60s entre 5 et 10 min
  2: 30,  // rappel toutes les 30s entre 10 et 15 min
  3: 15,  // rappel toutes les 15s au-delà de 15 min
}

// Teinte du ticket selon la durée d'attente (5 paliers, mêmes seuils que ci-dessus)
//   ok (vert) · watch (or) · late (orange) · urgent (rouge, pulse lent) · critical (rouge plein, pulse rapide)
export function delayTone(secs) {
  if (secs < SEUILS.green)  return 'ok'
  if (secs < SEUILS.yellow) return 'watch'
  if (secs < SEUILS.orange) return 'late'
  if (secs < SEUILS.red)    return 'urgent'
  return 'critical'
}

// Légende affichée sous la colonne « En préparation »
export const LEGEND = [
  { tone: 'ok',       label: '< 2 min' },
  { tone: 'watch',    label: '2-5 min' },
  { tone: 'late',     label: '5-10 min', bell: true },
  { tone: 'urgent',   label: '10-15 min', bell: true },
  { tone: 'critical', label: '> 15 min', bell: true },
]

// Format mm'ss"
export function fmtDuree(secs) {
  if (!isFinite(secs) || secs < 0) return '—'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}'${String(s).padStart(2, '0')}"`
}

// Récupère le timestamp d'une commande (toDate / Date / ISO string / millis)
export function getTs(commande) {
  const t = commande.createdAt
  if (!t) return null
  if (t.toDate)   return t.toDate().getTime()
  if (t.seconds)  return t.seconds * 1000
  if (t instanceof Date) return t.getTime()
  if (typeof t === 'string') return new Date(t).getTime()
  if (typeof t === 'number') return t
  return null
}

// Horodatage du passage à « prête » (readyAt)
export function getReadyTs(commande) {
  const t = commande.readyAt
  if (!t) return null
  if (t.toDate) return t.toDate().getTime()
  if (t.seconds) return t.seconds * 1000
  if (typeof t === 'string') return new Date(t).getTime()
  return null
}

// Numéro affiché :
//   1. _displayNumero (numero séquentiel réel OU fallback chronologique)
//   2. numero
//   3. code sans préfixe FY- / BNV-
//   4. « — »
export function ticketNumber(commande) {
  if (commande._displayNumero) return String(commande._displayNumero)
  if (commande.numero) return String(commande.numero)
  if (commande.code) return commande.code.replace(/^(FY-|BNV-)/, '')
  return '—'
}

// Montant en centimes → « 12.50 € » (format de la version de production)
export const euros = (cents) => `${((cents || 0) / 100).toFixed(2)} €`
