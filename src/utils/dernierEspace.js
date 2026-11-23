/**
 * utils/dernierEspace.js — l'icône installée rouvre le bon espace (essai A7, 23/11/2026)
 *
 * Les téléphones ignorent souvent la fiche d'installation personnelle d'InstallPerso (fabriquée sur
 * l'appareil, posée après le chargement) et démarrent l'appli sur « / », la connexion de l'équipe.
 * Relais : chaque espace personnel (spectateur, bénévole, artiste, borne) retient son lien sur
 * l'appareil ; lancée depuis l'écran d'accueil sur « / », l'appli y renvoie. L'espace de l'équipe
 * efface ce souvenir : l'icône rouvre toujours le dernier espace utilisé sur ce téléphone.
 * Le lien retenu reste sur l'appareil, comme les clés déjà gardées par les espaces.
 */
const CLE = 'yllacash-dernier-espace'

/** Retient le lien de l'espace ouvert (chemin + paramètres, sans les mentions de passage) */
export function retenirEspace(lien) {
  try {
    const u = new URL(lien, window.location.origin)
    if (u.origin !== window.location.origin) return
    localStorage.setItem(CLE, u.pathname + u.search)
  } catch { /* stockage indisponible : l'icône ouvrira la connexion */ }
}

/** L'espace de l'équipe a été utilisé en dernier : l'icône doit rouvrir la connexion */
export function oublierEspace() {
  try { localStorage.removeItem(CLE) } catch { /* rien */ }
}

const ESPACES = /^\/(solde|balance|spectateur|benevole|artiste|borne)(\?|$)/

/** Appli lancée depuis l'écran d'accueil (Android, iPhone) */
export const lanceeDepuisIcone = () => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  } catch { return false }
}

/** Lien de l'espace à rouvrir si l'appli démarre sur « / » depuis l'icône, sinon null */
export function espaceARouvrir() {
  if (window.location.pathname !== '/' || window.location.search || !lanceeDepuisIcone()) return null
  try {
    const lien = localStorage.getItem(CLE)
    return lien && ESPACES.test(lien) ? lien : null
  } catch { return null }
}
