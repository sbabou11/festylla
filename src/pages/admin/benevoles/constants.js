/**
 * pages/admin/benevoles/constants.js — jours, créneaux et droits de consommation des bénévoles
 */
import { UtensilsCrossed, Coffee, Droplets } from 'lucide-react'

export const JOURS = ['Vendredi', 'Samedi', 'Dimanche']
export const CRENEAUX = ['Midi', 'Soir']

// Droits par créneau validé
export const DROITS_PAR_CRENEAU = { repas: 1, boisson: 1, eau: 1 }

// Type de consommation → libellé, icône, teinte (classe t_<clé> du CSS, tone du composant Stat)
export const ITEM_CFG = {
  repas:   { label:'Repas',   icon:UtensilsCrossed, tone:'coral' },
  boisson: { label:'Boisson', icon:Coffee,          tone:'warning' },
  eau:     { label:'Eau',     icon:Droplets,        tone:'brand' },
}

// Calcul automatique des droits totaux depuis les créneaux
export const calcDroits = (creneaux = {}) => {
  let total = { repas:0, boisson:0, eau:0 }
  JOURS.forEach(j => CRENEAUX.forEach(c => {
    if (creneaux[j]?.[c]) {
      total.repas   += DROITS_PAR_CRENEAU.repas
      total.boisson += DROITS_PAR_CRENEAU.boisson
      total.eau     += DROITS_PAR_CRENEAU.eau
    }
  }))
  return total
}

export const countCreneaux = (creneaux = {}) =>
  JOURS.reduce((a,j) => a + CRENEAUX.filter(c => creneaux?.[j]?.[c]).length, 0)
