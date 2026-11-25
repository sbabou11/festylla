/**
 * em/pages.js — pages qui sortent de YllaCash (règle d'échange Event Manager ↔ YllaCash, §5)
 *
 * Lot D (18/11/2026) : planning, cachets, exposants, finances et modèles de documents étaient
 * masqués pour un événement relié à Event Manager seulement.
 * 25/11/2026 (décision de l'organisateur, maquette 7Bz7GboiACCHZMcRKpqJ3X) : masqués sur TOUS
 * les événements, reliés ou non, avec la gestion des artistes et le « QR code entrée » (les
 * spectateurs ouvrent leur espace depuis l'e-mail de leur billet ; un lien perdu se redonne à la
 * billetterie). Rien n'est effacé : les données restent dans la base et dans l'archive ZIP.
 */
export const PAGES_RETIREES = ['planning', 'cachets', 'exposants', 'finances', 'editeur-template', 'gestion-artistes', 'qr-entree']
// Ancien nom, gardé pour les imports existants
export const PAGES_RETIREES_EM = PAGES_RETIREES

/** Événement relié à Event Manager : le serveur y a déjà publié un instantané */
export const isEmLinked = (event) => !!(event?.emEquipe || event?.emProgramme)

/** Page masquée ? (le même résultat pour tous les événements depuis le 25/11/2026) */
export const pageRetiree = (_event, pid) => PAGES_RETIREES.includes(pid)

/** Accueil : blocs qui renvoient vers une page retirée */
export const BLOCS_RETIRES_EM = ['planning', 'cachets', 'depenses']
