/**
 * hooks/useRapportCloture.js — v3
 * Rapport de clôture PDF généré côté serveur via /api/rapport-pdf (reportlab Python)
 * Testé localement avant livraison — 0 dépendance JS CDN
 */
import useAppStore   from '../store/useAppStore'
import useEventStore from '../store/useEventStore'
import { useTheme }  from './useTheme'
import { db }        from '../firebase/config'
import { collection, getDocs, orderBy, query, limit } from 'firebase/firestore'
import { loadAllTransactions, exportBody } from '../utils/fullTransactions'

export function useRapportCloture() {
  const { spectateurs, reservations, menu, logs, staff } = useAppStore()
  const { currentEventId, currentEvent: currentEventFn } = useEventStore()
  const { theme } = useTheme()
  const currentEvent = (typeof currentEventFn === 'function' ? currentEventFn() : currentEventFn)
                    || { nom: 'Événement', id: currentEventId }

  const generer = async () => {
    if (!currentEvent || !currentEventId) {
      alert('Aucun événement sélectionné.'); return
    }

    // Charger l'audit Firestore
    let auditLogs = []
    try {
      const snap = await getDocs(query(
        collection(db, 'events', currentEventId, 'audit'),
        orderBy('createdAt', 'desc'), limit(500)
      ))
      auditLogs = snap.docs.map(d => d.data())
    } catch(e) { console.warn('Audit load error:', e) }

    // Appel à /api/rapport-pdf (Python reportlab — testé et validé)
    try {
      // Toutes les transactions de l'événement, pas seulement les 500 de la liste en direct
      const transactions = await loadAllTransactions(currentEventId, logs)
      const resp = await fetch('/api/rapport-pdf', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: exportBody({
          event:        { nom: currentEvent.nom, couleur: theme?.brand || '#1a6b7a' },
          spectateurs:  spectateurs,
          transactions,
          reservations: reservations,
          menu:         menu,
          staff:        staff,
          audit:        auditLogs,
        }),
      })
      if (!resp.ok) {
        const err = await resp.text()
        throw new Error(`Erreur serveur ${resp.status}: ${err.slice(0, 300)}`)
      }
      const blob = await resp.blob()
      const now  = new Date()
      const jj   = String(now.getDate()).padStart(2,'0')
      const mm_  = String(now.getMonth()+1).padStart(2,'0')
      const aaaa = now.getFullYear()
      const filename = `${currentEvent.nom} - Rapport de clôture - ${jj}_${mm_}_${aaaa}.pdf`
      const url  = URL.createObjectURL(blob)
      const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch(e) {
      console.error('Rapport PDF:', e)
      alert('Erreur rapport de clôture: ' + e.message)
    }
  }

  return { generer }
}
