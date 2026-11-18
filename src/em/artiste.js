/**
 * em/artiste.js — fiche d'artiste venue d'Event Manager (règle d'échange, lot C)
 *
 * Les artistes sont publiés par le serveur dans events/{ev}/artistes/em-… avec leurs avantages par
 * jour. L'espace artiste et le service au stand ont été écrits pour un créneau du planning : on
 * présente donc la fiche sous la même forme (artiste, titre, debut, fin, avantages…), pour la
 * journée en cours. L'identifiant de la fiche tient lieu d'identifiant de créneau (creneauId) dans
 * les réservations, les consommations et les liens personnels.
 *
 * Articles : une seule liste « offerts aux artistes » (events/{ev}/settings/artistes.articles),
 * répartie en repas, boissons et eau selon le type de consommation de l'article au menu.
 */
import { festDay } from './jour'

export const isEmArtiste = (c) => !!c?._em

const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
const ms = (ts) => (ts?.toMillis ? ts.toMillis() : ts ? new Date(ts).getTime() : 0)

/**
 * a : fiche events/{ev}/artistes/{id} ; offerts : ids d'articles ; menu : articles ;
 * programme : passages publiés (programme-em), pour l'heure, la scène, le titre et la photo.
 */
export function adaptArtisteEm(a, { jour = festDay(), offerts = [], menu = [], programme = [] } = {}) {
  const today = a.avantagesJours?.[jour] || {}
  const idsOf = (t) => offerts.filter(id => menu.find(m => m.id === id)?.typeConsommation === t)
  const passages = programme.filter(p => sameName(p.artiste, a.nom)).sort((x, y) => ms(x.debut) - ms(y.debut))
  const duJour = passages.find(p => festDay(p.debut) === jour)
  const ref = duJour || passages.find(p => ms(p.debut) > Date.now()) || passages[0] || {}
  return {
    ...a,
    artiste: a.nom,
    titre: ref.titre || '',
    type: ref.type || 'autre',
    photo: ref.photo || '',
    bio: ref.bio || '',
    liens: ref.liens || {},
    scene: duJour?.scene || '',
    debut: duJour?.debut || null,
    fin: duJour?.fin || null,
    statut: a.actif === false ? 'annule' : 'a-venir',
    avantages: {
      drinks: today.boisson || 0, meals: today.repas || 0, eaux: today.eau || 0,
      drinkIds: idsOf('boisson'), mealIds: idsOf('repas'), eauIds: idsOf('eau'),
    },
    _em: true,
    _jour: jour,
  }
}

/** Ne garde que ce qui compte pour la journée (consommations servies, réservations) d'une fiche Event Manager */
export function duJour(list, creneau, field) {
  if (!isEmArtiste(creneau)) return list
  return list.filter(x => festDay(x[field]) === creneau._jour)
}
