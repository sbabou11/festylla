/**
 * utils/fullTransactions.js — données complètes pour les exports et rapports
 * La liste en direct (store.logs) ne garde que les 500 dernières transactions : un rapport construit
 * dessus serait faux dès que l'événement en compte davantage. Les exports relisent donc tout dans
 * Firestore, et s'arrêtent avec un message clair plutôt que de produire un rapport incomplet.
 */
import { fetchAllTransactions } from '../firebase/service'

// Limite du corps d'une requête vers une fonction Vercel (4,5 Mo), avec une marge
export const MAX_EXPORT_BYTES = 4_200_000

// createdAt et _docId ne servent pas aux générateurs de rapports (api/) : les retirer allège l'envoi
const slim = list => list.map(({ createdAt, _docId, ...t }) => t)

export async function loadAllTransactions(eventId, liveLogs = []) {
  // Aperçu de démonstration : pas de Firestore, la liste en mémoire est complète
  if (eventId === 'demo') return slim(liveLogs || [])
  try {
    return slim(await fetchAllTransactions(eventId))
  } catch (e) {
    throw new Error(`Impossible de charger toutes les transactions (${e.message}). Vérifiez la connexion : le rapport n'a pas été produit, pour ne pas donner des totaux incomplets.`)
  }
}

// Corps JSON d'un export, refusé s'il dépasse ce que le serveur accepte
export function exportBody(payload) {
  const body = JSON.stringify(payload)
  const size = new Blob([body]).size
  if (size > MAX_EXPORT_BYTES) {
    throw new Error(`Trop de données pour un seul rapport (${(size / 1e6).toFixed(1)} Mo, maximum ${(MAX_EXPORT_BYTES / 1e6).toFixed(1)} Mo). Le rapport n'a pas été produit.`)
  }
  return body
}
