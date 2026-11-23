/**
 * utils/nvPastilles.js — couleurs des pastilles rondes du nouveau style téléphone (23/11/2026)
 *
 * Seule table de couleurs écrites en dur, comme convenu : fonds assez soutenus pour un
 * pictogramme ou un signe blanc, lisibles sur fond clair comme sur fond sombre.
 */

// Par type de transaction (flux, dernières transactions de l'accueil)
export const PASTILLE_TX = {
  credit:              '#1F8F64', // recharge : vert
  credit_correction:   '#1F8F64',
  debit:               '#C9512A', // achat au stand : orange brique
  debit_correction:    '#C9512A',
  retrait:             '#2D74A0', // retrait au stand : bleu
  'benev-retrait':     '#2D74A0',
  reservation:         '#A86A0C', // réservation : ambre
  'benev-reservation': '#A86A0C',
  annulation:          '#5F6E7A', // annulation : gris
  'benev-annulation':  '#5F6E7A',
  'artist-gift':       '#B23F73', // avantage artiste, don : framboise
  don:                 '#B23F73',
}
export const PASTILLE_DEFAUT = '#5F6E7A'
export const pastilleTx = (type) => PASTILLE_TX[type] || PASTILLE_DEFAUT

// Par gravité d'alerte (carte « À traiter »)
export const PASTILLE_ALERTE = {
  danger:  '#C8373C',
  warning: '#A86A0C',
  info:    '#1F7A85',
}
export const pastilleAlerte = (tone) => PASTILLE_ALERTE[tone] || PASTILLE_ALERTE.info
