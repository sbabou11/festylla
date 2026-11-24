/**
 * utils/conservation.js — conservation des données d'une édition (RGPD, décidé le 24/11/2026)
 * Maquette validée : https://claude.ai/artifact/AySuF3pyLcNviuoNcAwTYs
 *
 * Choix de l'organisateur :
 *   - remboursements jusqu'à 2 mois après le dernier jour (utils/dons.js), puis reversement à l'ONG ;
 *   - les données quittent la base 4 mois après le dernier jour (couvre les remboursements, le
 *     reversement et les contestations de paiement par carte) ;
 *   - l'archive ZIP est gardée 10 ans (pièces comptables), chez l'organisateur, en lieu sûr.
 * Rien ne s'efface tout seul : un admin télécharge l'archive, l'appli la vérifie, puis il efface
 * l'édition (evenements/ArchiveDialogs.jsx). Ce fichier ne fait que calculer les dates et rappeler.
 */
import { dernierJour, DELAI_MOIS } from './dons'

export const CONSERVATION_MOIS = 4
export const ARCHIVE_ANNEES = 10
export const RAPPEL_JOURS = 30
const JOUR_MS = 24 * 3600 * 1000

/** Fin du jour, `mois` mois après le jour AAAA-MM-JJ (jour ramené au dernier du mois si besoin) */
export function finDuJourApres(jour, mois = 0) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(jour || ''))
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])]
  const finMois = new Date(Date.UTC(y, mo + mois + 1, 0)).getUTCDate()
  return Date.UTC(y, mo + mois, Math.min(d, finMois), 23, 59, 59)
}

/**
 * Calendrier d'une édition : null si elle n'a pas de date.
 * etape : 0 festival pas fini · 1 remboursements · 2 reversement et conservation · 3 effacer · 4 effacée
 * niveau : 'conservation' | 'bientot' (30 jours avant) | 'depasse'
 */
export function calendrierEdition(event, now = Date.now()) {
  const j = dernierJour(event)
  if (!j) return null
  const finFestival = finDuJourApres(j, 0)
  const remboursements = finDuJourApres(j, DELAI_MOIS)
  const effacement = finDuJourApres(j, CONSERVATION_MOIS)
  const archive = finDuJourApres(j, ARCHIVE_ANNEES * 12)
  const jours = Math.ceil((effacement - now) / JOUR_MS)
  const etape = now <= finFestival ? 0 : now <= remboursements ? 1 : jours > RAPPEL_JOURS ? 2 : 3
  const niveau = now > effacement ? 'depasse' : jours <= RAPPEL_JOURS ? 'bientot' : 'conservation'
  return { finFestival, remboursements, effacement, archive, jours, etape, niveau }
}

/** Éditions dont l'effacement approche (30 jours) ou est dépassé : pour le rappel sur l'accueil des admins */
export function editionsAEffacer(events = [], { actifId = null, now = Date.now(), estArchive = () => false } = {}) {
  return events
    .filter(e => e && e.id !== actifId && !e.actif && !estArchive(e))
    .map(e => ({ event: e, cal: calendrierEdition(e, now) }))
    .filter(x => x.cal && x.cal.etape >= 3)
    .sort((a, b) => a.cal.effacement - b.cal.effacement)
}

export const dateLongue = (ms) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
export const moisAnnee = (ms) => new Date(ms).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
