/**
 * hooks/useRapportCloture.js — v3
 * Rapport de clôture PDF généré côté serveur via /api/rapport-pdf (reportlab Python)
 * Testé localement avant livraison — 0 dépendance JS CDN
 *
 * Lot 1 — Toggle sections : lit la config settings.rapportSections et l'envoie
 * au backend. Le backend conditionne chaque page selon ce qui est activé.
 */
import useAppStore   from '../store/useAppStore'
import useEventStore from '../store/useEventStore'
import { useTheme }  from './useTheme'
import { db }        from '../firebase/config'
import { collection, getDocs, orderBy, query, limit } from 'firebase/firestore'
import { APP_VERSION_LABEL } from '../utils/buildInfo'
import { getSettings } from '../firebase/service'

export function useRapportCloture() {
  const { spectateurs, reservations, menu, logs, staff } = useAppStore()
  const { currentEventId, currentEvent: currentEventFn } = useEventStore()
  const { theme } = useTheme()
  const currentEvent = (typeof currentEventFn === 'function' ? currentEventFn() : currentEventFn)
                    || { nom: 'Événement', id: currentEventId }

  /**
   * Génère le rapport de clôture en PDF.
   *
   * @param {object|null} overrideSections - Config sections à utiliser pour
   *   cette génération uniquement (Lot 2b — modale au clic Générer).
   *   Si null/undefined, charge la config sauvegardée depuis Firestore.
   *   Cette config temporaire n'est PAS persistée.
   * @param {array|null} overrideCustomPages - Pages custom (Lot Custom B).
   *   Si null/undefined, charge depuis Firestore.
   */
  const generer = async (overrideSections = null, overrideCustomPages = null) => {
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

    // Charger TOUTES les transactions directement depuis Firestore (sans limite).
    // Le store (logs) est plafonné (watchTransactions limit) pour les perfs temps réel,
    // ce qui tronque l'historique ancien. Le rapport de clôture doit voir l'intégralité
    // des ventes de l'événement, on fait donc une lecture ponctuelle complète ici.
    let allTransactions = logs || []
    try {
      const snap = await getDocs(query(
        collection(db, 'events', currentEventId, 'transactions'),
        orderBy('createdAt', 'desc')
      ))
      allTransactions = snap.docs.map(d => ({ ...d.data(), id: d.id }))
    } catch(e) {
      console.warn('Transactions load error (fallback sur le store):', e)
    }

    // Charger cachets artistiques + expositions (Lot Compte de résultat).
    // Lecture ponctuelle directe : ces données alimentent le compte de résultat
    // consolidé (dépenses cachets + recettes exposition).
    let cachetsList = []
    let expositionsList = []
    try {
      const snapC = await getDocs(query(
        collection(db, 'events', currentEventId, 'cachets'),
        orderBy('createdAt', 'desc')
      ))
      cachetsList = snapC.docs.map(d => ({ ...d.data(), id: d.id }))
    } catch(e) { console.warn('Cachets load error:', e) }
    try {
      const snapE = await getDocs(query(
        collection(db, 'events', currentEventId, 'expositions'),
        orderBy('createdAt', 'desc')
      ))
      expositionsList = snapE.docs.map(d => ({ ...d.data(), id: d.id }))
    } catch(e) { console.warn('Expositions load error:', e) }

    // Finances d'organisation (Lot Finances 1) : dépenses/recettes manuelles.
    let financesList = []
    try {
      const snapF = await getDocs(query(
        collection(db, 'events', currentEventId, 'finances'),
        orderBy('createdAt', 'desc')
      ))
      financesList = snapF.docs.map(d => ({ ...d.data(), id: d.id }))
    } catch(e) { console.warn('Finances load error:', e) }

    // Configuration des sections : override si fourni, sinon chargée depuis Firestore.
    // Si la config est absente, le backend inclut tout par défaut (rétrocompatible).
    let sectionsConfig = overrideSections
    let customPagesConfig = overrideCustomPages
    if (!sectionsConfig || customPagesConfig === null) {
      try {
        const settings = await getSettings(currentEventId)
        if (!sectionsConfig && settings?.rapportSections && typeof settings.rapportSections === 'object') {
          sectionsConfig = settings.rapportSections
        }
        if (customPagesConfig === null && Array.isArray(settings?.rapportCustomPages)) {
          customPagesConfig = settings.rapportCustomPages
        }
      } catch(e) { console.warn('Settings load error:', e) }
    }

    // Appel à /api/rapport-pdf (Python reportlab — testé et validé)
    try {
      const resp = await fetch('/api/rapport-pdf', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event:        { nom: currentEvent.nom, couleur: theme?.brand || '#1a6b7a' },
          appVersion:   APP_VERSION_LABEL,
          spectateurs:  spectateurs,
          transactions: allTransactions,
          reservations: reservations,
          menu:         menu,
          staff:        staff,
          audit:        auditLogs,
          // Compte de résultat consolidé (cachets + expositions)
          cachets:      cachetsList,
          expositions:  expositionsList,
          // Finances d'organisation (Lot Finances 1)
          finances:     financesList,
          // Configuration des sections à inclure (Lot 1).
          // Si absente ou null, le backend inclut tout (rétrocompatible).
          sections:     sectionsConfig,
          // Pages personnalisées (Lot Custom B). [] ou absent = aucune page custom.
          customPages:  customPagesConfig || [],
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
