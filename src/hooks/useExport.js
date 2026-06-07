/**
 * hooks/useExport.js — v3 traçabilité maximale
 * CSV et Excel avec toutes les infos de transaction
 */
import useAppStore   from '../store/useAppStore'
import { useTheme }  from './useTheme'
import useEventStore from '../store/useEventStore'
import { fmt } from '../utils/helpers'
import { computeKPIs } from '../utils/kpis'
import { APP_VERSION_LABEL } from '../utils/buildInfo'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'

export function useExport() {
  const { spectateurs, reservations, menu, logs, staff, expositions } = useAppStore()
  const { theme } = useTheme()
  const { currentEvent: currentEventFn, currentEventId } = useEventStore()
  const currentEvent = (typeof currentEventFn === 'function' ? currentEventFn() : currentEventFn)
                    || { nom: 'Événement', id: currentEventId }

  /**
   * Charge TOUTES les transactions de l'événement depuis Firestore.
   * Le store (logs) est plafonné à 5000 pour les perfs temps réel, ce qui
   * peut tronquer les exports comptables qui doivent être exhaustifs.
   * Lecture SANS orderBy pour ne JAMAIS exclure de documents (un orderBy
   * exclut silencieusement les documents où le champ n'existe pas).
   * En cas d'erreur, on retombe sur le store comme filet de sécurité.
   */
  const fetchAllTransactions = async () => {
    if (!currentEventId) return logs || []
    try {
      const snap = await getDocs(collection(db, 'events', currentEventId, 'transactions'))
      return snap.docs.map(d => ({ ...d.data(), id: d.id }))
    } catch (e) {
      console.warn('fetchAllTransactions:', e.message)
      return logs || []
    }
  }

  const dateStr = () => new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')
  const nowStr  = () => new Date().toLocaleString('fr-FR')

  // Nomenclature standard : {NomEvenement} - {NomFichier} - {JJ}_{MM}_{AAAA}.ext
  const buildFilename = (label, ext) => {
    const d    = new Date()
    const jj   = String(d.getDate()).padStart(2,'0')
    const mm   = String(d.getMonth()+1).padStart(2,'0')
    const aaaa = d.getFullYear()
    const nom  = (currentEvent?.nom || 'Événement').trim()
    return `${nom} - ${label} - ${jj}_${mm}_${aaaa}.${ext}`
  }

  // ── Enrichissement des logs ───────────────────────────────────────────────
  const buildRows = () => {
    const specMap  = Object.fromEntries(spectateurs.map(s => [s.id, s]))
    const staffMap = Object.fromEntries(staff.map(s => [s.email?.toLowerCase(), s]))

    return (logs || []).map((t, idx) => {
      const spec       = specMap[t.specId] || {}
      const staffMember = staffMap[t.staff?.toLowerCase()] || {}
      const items      = (t.items || []).map(i => `${i.nom}${i.qty > 1 ? ` ×${i.qty}` : ''} (${fmt(i.prixUnit || i.prix || 0)}/u)`).join(' | ')

      return {
        '№':                     idx + 1,
        'Date':                  t.date || '—',
        'Heure':                 t.heure || (t.timestamp ? new Date(t.timestamp).toLocaleTimeString('fr-FR') : '—'),
        'Timestamp ISO':         t.timestamp || '—',

        // Spectateur
        'ID Spectateur':         t.specId || '—',
        'Nom Spectateur':        t.specNom || spec.nom || '—',

        // Transaction
        'Type':                  t.type || '—',
        'Libellé':               t.label || '—',
        'Articles achetés':      items || '—',
        'Montant (€)':           ((t.montant || 0) / 100).toFixed(2),
        'Sens':                  t.type === 'credit' ? 'Entrée (+)' : t.type === 'annulation' ? 'Neutre' : 'Sortie (-)',

        // Soldes avant/après
        'Solde avant (€)':       t.soldeBefore !== undefined ? (t.soldeBefore / 100).toFixed(2) : '—',
        'Solde après (€)':       t.soldeAfter  !== undefined ? (t.soldeAfter  / 100).toFixed(2) : '—',
        'Solde actuel spec. (€)': spec.solde !== undefined   ? (spec.solde    / 100).toFixed(2) : '—',

        // Staff
        'Staff (email)':         t.staff || '—',
        'Staff (nom)':           staffMember.nom || '—',
        'Staff (rôle)':          staffMember.role || '—',

        // Réservation
        'Code réservation':      t.resaCode || t.resaId || '—',

        // Méta
        'Canal':                 t.canal || 'App YllaCash',

        // Événement
        'Événement (ID)':        currentEventId || '—',
        'Événement (nom)':       currentEvent.nom || '—',
      }
    })
  }

  // ── Export Transactions XLSX ─────────────────────────────────────────────
  const exportTransactionsCsv = async () => {
    if (!currentEvent || !currentEventId) { alert('Aucun événement sélectionné.'); return }

    try {
      // Lecture complète depuis Firestore (pas le store qui est plafonné à 5000)
      const allTx = await fetchAllTransactions()
      if (!allTx.length) { alert('Aucune transaction à exporter.'); return }

      const resp = await fetch('/api/transactions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event:        { nom: currentEvent.nom, couleur: theme?.brand || '#1a6b7a' },
          appVersion:   APP_VERSION_LABEL,
          spectateurs:  spectateurs,
          transactions: allTx,
          staff:        staff,
        }),
      })
      if (!resp.ok) {
        let serverMsg = ''
        try {
          const errBody = await resp.json()
          serverMsg = errBody?.error || errBody?.message || ''
        } catch {}
        throw new Error('Erreur serveur ' + resp.status + (serverMsg ? ' — ' + serverMsg : ''))
      }
      const blob = await resp.blob()
      const url  = URL.createObjectURL(blob)
      const a    = Object.assign(document.createElement('a'), {
        href:     url,
        download: buildFilename('Transactions', 'xlsx'),
      })
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch(e) {
      console.error('Export Transactions:', e)
      alert('Erreur export transactions: ' + e.message)
    }
  }

  // ── Export Excel ──────────────────────────────────────────────────────────
  const exportRapportExcel = async () => {
    if (!currentEvent || !currentEventId) { alert('Aucun événement selectionne.'); return }

    let auditData = []
    try {
      const { getDocs, collection, orderBy: obF, query: qF, limit: limF } = await import('firebase/firestore')
      const { db } = await import('../firebase/config')
      const snap = await getDocs(qF(collection(db,'events',currentEventId,'audit'), obF('createdAt','desc'), limF(500)))
      auditData = snap.docs.map(d => d.data())
    } catch {}

    try {
      // Lecture complète depuis Firestore (pas le store qui est plafonné à 5000)
      const allTx = await fetchAllTransactions()
      // KPIs recalculés sur l'ensemble complet pour rester cohérents avec
      // le tableau de transactions envoyé au backend.
      const kpis = computeKPIs({ spectateurs, reservations, logs: allTx, menu })
      const resp = await fetch('/api/rapport', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event:        { nom: currentEvent.nom, couleur: theme?.brand || '#1a6b7a' },
          appVersion:   APP_VERSION_LABEL,
          spectateurs:  spectateurs,
          transactions: allTx,
          reservations: reservations,
          menu:         menu,
          staff:        staff,
          audit:        auditData,
          expositions:  expositions || [],
          kpis: {
            totalCredits:   kpis.totalCredits,
            totalVentes:    kpis.totalVentes,
            totalSoldes:    kpis.totalSoldes,
            caNette:        kpis.caNette,
            coutBenev:      kpis.coutBenev,
            tauxRetrait:    kpis.tauxRetrait,
            ticketMoyen:    kpis.ticketMoyen,
            nbSpectateurs:  kpis.nbSpectateurs,
            topArticles:    kpis.topArticles.slice(0, 10),
            txByType:       kpis.txByType,
          },
        }),
      })
      if (!resp.ok) {
        let serverMsg = ''
        try {
          const errBody = await resp.json()
          serverMsg = errBody?.error || errBody?.message || ''
        } catch {}
        throw new Error('Erreur serveur ' + resp.status + (serverMsg ? ' — ' + serverMsg : ''))
      }
      const blob = await resp.blob()
      const url  = URL.createObjectURL(blob)
      const a    = Object.assign(document.createElement('a'), {
        href: url, download: buildFilename('Rapport Excel', 'xlsx'),
      })
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Rapport Excel:', e)
      alert('Erreur generation rapport: ' + e.message)
    }
  }


  const generateFallbackXlsx = async (XLSX, payload) => {
    const { spectateurs: specs, transactions: txs, reservations: resas, menu: mn, audit: aud } = payload
    const wb = XLSX.utils.book_new()
    const allTx = txs || []
    const totalVentes  = allTx.filter(t=>['debit','retrait','benev-retrait'].includes(t.type)).reduce((a,t)=>a+(t.montant||0),0)
    const totalCredits = allTx.filter(t=>t.type==='credit').reduce((a,t)=>a+(t.montant||0),0)
    const totalSoldes  = (specs||[]).reduce((a,s)=>a+(s.solde||0),0)
    const ws1 = XLSX.utils.aoa_to_sheet([
      [`RAPPORT YLLACASH — ${(payload.event.nom||'').toUpperCase()}`],
      ['Généré le', nowStr()],
      [],['═══ RÉSUMÉ FINANCIER ═══'],
      ['CA encaissé (€)', (totalVentes/100).toFixed(2)],
      ['Total rechargé (€)', (totalCredits/100).toFixed(2)],
      ['Soldes restants (€)', (totalSoldes/100).toFixed(2)],
      ['Nb spectateurs', (specs||[]).length],
      ['Nb transactions', allTx.length],
    ])
    XLSX.utils.book_append_sheet(wb, ws1, 'Résumé')
    const txRows = (txs||[]).map(t => [t.date||'', t.type||'', t.specNom||t.benevoleNom||'', t.label||'', ((t.montant||0)/100).toFixed(2), t.staff||''])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Date','Type','Nom','Libellé','Montant €','Staff'],...txRows]), 'Transactions')
    const safeName = (payload.event.nom||'rapport').replace(/[^a-zA-Z0-9]/g,'-').toLowerCase()
    XLSX.writeFile(wb, buildFilename('Rapport Excel', 'xlsx'))
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const loadXLSX = () => new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(window.XLSX); return }
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload  = () => resolve(window.XLSX)
    s.onerror = () => reject(new Error('SheetJS non disponible'))
    document.head.appendChild(s)
  })

  const download = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  // ── Export journal d'audit ───────────────────────────────────────
  const exportAuditCsv = async () => {
    if (!currentEvent || !currentEventId) { alert('Aucun événement sélectionné.'); return }

    // Charger l'audit depuis Firestore
    let auditData = []
    try {
      const { getDocs, collection, orderBy: obF, query: qF, limit: limF } = await import('firebase/firestore')
      const { db } = await import('../firebase/config')
      const snap = await getDocs(qF(collection(db,'events',currentEventId,'audit'), obF('createdAt','desc'), limF(500)))
      auditData = snap.docs.map(d => d.data())
    } catch(e) {
      alert('Erreur lecture audit : ' + e.message); return
    }
    if (!auditData.length) { alert("Aucun log d'audit à exporter."); return }

    try {
      const resp = await fetch('/api/audit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: { nom: currentEvent.nom, couleur: theme?.brand || '#1a6b7a' },
          appVersion: APP_VERSION_LABEL,
          audit: auditData,
        }),
      })
      if (!resp.ok) {
        let serverMsg = ''
        try {
          const errBody = await resp.json()
          serverMsg = errBody?.error || errBody?.message || ''
        } catch {}
        throw new Error('Erreur serveur ' + resp.status + (serverMsg ? ' — ' + serverMsg : ''))
      }
      const blob = await resp.blob()
      const url  = URL.createObjectURL(blob)
      const a    = Object.assign(document.createElement('a'), {
        href:     url,
        download: buildFilename("Journal d'audit", 'xlsx'),
      })
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch(e) {
      console.error('Export Audit:', e)
      alert("Erreur export journal d'audit: " + e.message)
    }
  }

  return { exportTransactionsCsv, exportRapportExcel, exportAuditCsv }
}
