/**
 * em/pages.js — pages qui sortent de YllaCash pour un événement relié à Event Manager
 * (règle d'échange Event Manager ↔ YllaCash, §5 ; lot D, maquette validée le 18/11/2026)
 *
 * Rien n'est effacé : les pages sont seulement masquées. Les archives et les événements non reliés
 * (Fest'Ylla 2026, essais) gardent le menu complet, pour relire les anciennes données.
 */
export const PAGES_RETIREES_EM = ['planning', 'cachets', 'exposants', 'finances', 'editeur-template']

/** Événement relié à Event Manager : le serveur y a déjà publié un instantané */
export const isEmLinked = (event) => !!(event?.emEquipe || event?.emProgramme)

/** Page masquée pour cet événement ? */
export const pageRetiree = (event, pid) => isEmLinked(event) && PAGES_RETIREES_EM.includes(pid)

/** Accueil : blocs qui renvoient vers une page retirée */
export const BLOCS_RETIRES_EM = ['planning', 'cachets', 'depenses']
