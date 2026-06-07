/**
 * components/DiagnosticTransactions.jsx — outil de diagnostic temporaire
 *
 * Lit DIRECTEMENT depuis Firestore TOUTES les transactions de l'événement
 * sans aucun filtre, aucun orderBy (pour ne rien exclure silencieusement).
 * Affiche un rapport texte détaillé : compte par type, totaux, tous les
 * articles vendus (présents OU non dans le menu actuel).
 *
 * Permet de répondre à : « mes ventes d'articles supprimés sont-elles
 * encore dans la base ? »
 */
import React, { useState } from 'react'
import { Activity, Copy, Check } from 'lucide-react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import useEventStore from '../store/useEventStore'
import useAppStore from '../store/useAppStore'

export default function DiagnosticTransactions() {
  const { currentEventId } = useEventStore()
  const menu = useAppStore(s => s.menu) || []
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState('')
  const [copied, setCopied] = useState(false)

  const run = async () => {
    if (!currentEventId) { setReport('❌ Aucun événement sélectionné'); return }
    setRunning(true); setReport('Lecture en cours…')
    try {
      // Lecture SANS orderBy — important pour ne rien exclure
      const snap = await getDocs(collection(db, 'events', currentEventId, 'transactions'))
      const txs = snap.docs.map(d => ({ ...d.data(), id: d.id }))

      // Compte total + par type
      const byType = {}
      let totalMontant = 0
      let nbAvecCreatedAt = 0
      let nbSansCreatedAt = 0
      let nbAvecTimestamp = 0
      let nbSansTimestamp = 0
      const dates = new Set()

      for (const t of txs) {
        const type = t.type || '(sans type)'
        if (!byType[type]) byType[type] = { count: 0, montant: 0 }
        byType[type].count++
        byType[type].montant += t.montant || 0
        totalMontant += t.montant || 0
        if (t.createdAt) nbAvecCreatedAt++; else nbSansCreatedAt++
        if (t.timestamp) nbAvecTimestamp++; else nbSansTimestamp++
        if (t.date) dates.add(t.date)
      }

      // Articles vendus (depuis tous les items de toutes les transactions)
      const articlesMap = {} // nom → { qty, ca, nbTx }
      for (const t of txs) {
        const items = Array.isArray(t.items) ? t.items : []
        for (const it of items) {
          const nom = it.nom || '(sans nom)'
          if (!articlesMap[nom]) articlesMap[nom] = { qty: 0, ca: 0, nbTx: 0 }
          articlesMap[nom].qty += it.qty || 1
          articlesMap[nom].ca += it.total != null ? it.total : (it.prixUnit || 0) * (it.qty || 1)
          articlesMap[nom].nbTx++
        }
      }

      // Comparer avec menu actuel
      const noms_menu = new Set(menu.map(m => m.nom))
      const articlesPresents = []
      const articlesSupprimes = []
      for (const [nom, stats] of Object.entries(articlesMap)) {
        const entry = { nom, ...stats }
        if (noms_menu.has(nom)) articlesPresents.push(entry)
        else articlesSupprimes.push(entry)
      }
      articlesPresents.sort((a, b) => b.ca - a.ca)
      articlesSupprimes.sort((a, b) => b.ca - a.ca)

      const eur = (c) => (c / 100).toFixed(2).replace('.', ',') + ' €'
      const lines = []
      lines.push('═══════════════════════════════════════════════════')
      lines.push(`  DIAGNOSTIC TRANSACTIONS — ${new Date().toLocaleString('fr-FR')}`)
      lines.push(`  Événement : ${currentEventId}`)
      lines.push('═══════════════════════════════════════════════════')
      lines.push('')
      lines.push(`TOTAL TRANSACTIONS EN BASE : ${txs.length}`)
      lines.push(`Total cumul montants     : ${eur(totalMontant)}`)
      lines.push(`Dates distinctes         : ${[...dates].sort().join(', ') || '(aucune)'}`)
      lines.push('')
      lines.push('— Métadonnées —')
      lines.push(`  Avec champ createdAt   : ${nbAvecCreatedAt}`)
      lines.push(`  Sans champ createdAt   : ${nbSansCreatedAt} ⚠️ (exclues par orderBy)`)
      lines.push(`  Avec champ timestamp   : ${nbAvecTimestamp}`)
      lines.push(`  Sans champ timestamp   : ${nbSansTimestamp}`)
      lines.push('')
      lines.push('— Par type —')
      Object.entries(byType).sort(([,a],[,b]) => b.count - a.count).forEach(([type, s]) => {
        lines.push(`  ${type.padEnd(20)} ${String(s.count).padStart(5)} tx   ${eur(s.montant).padStart(14)}`)
      })
      lines.push('')
      lines.push(`═══════════════════════════════════════════════════`)
      lines.push(`  ARTICLES VENDUS (${articlesPresents.length + articlesSupprimes.length} distincts)`)
      lines.push('═══════════════════════════════════════════════════')
      lines.push('')
      lines.push(`✅ ENCORE DANS LE MENU (${articlesPresents.length}) :`)
      articlesPresents.forEach(a => {
        lines.push(`  ${a.nom.padEnd(35)} ${String(a.qty).padStart(5)}u  ${eur(a.ca).padStart(12)}  (${a.nbTx} tx)`)
      })
      lines.push('')
      lines.push(`⚠️  SUPPRIMÉS DU MENU MAIS PRÉSENTS EN BASE (${articlesSupprimes.length}) :`)
      if (articlesSupprimes.length === 0) {
        lines.push('  (aucun)')
      } else {
        articlesSupprimes.forEach(a => {
          lines.push(`  ${a.nom.padEnd(35)} ${String(a.qty).padStart(5)}u  ${eur(a.ca).padStart(12)}  (${a.nbTx} tx)`)
        })
      }
      lines.push('')
      lines.push('═══════════════════════════════════════════════════')
      lines.push('Si la section ⚠️ contient des articles : les ventes sont')
      lines.push('bien en base. Le problème est dans l\'affichage du rapport.')
      lines.push('Si elle est vide ET que vous savez avoir vendu des articles')
      lines.push('supprimés, alors les transactions ont vraiment disparu.')

      setReport(lines.join('\n'))
    } catch (e) {
      setReport(`❌ Erreur : ${e.message}\n\n${e.stack || ''}`)
    } finally {
      setRunning(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <div style={{
      padding: 14, background: 'var(--bg, #f8f9fa)', borderRadius: 10,
      border: '0.5px solid var(--border, #e2e8f0)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Activity size={16} style={{ color: 'var(--brand-dark, #134e5a)' }}/>
        <strong style={{ fontSize: 13 }}>Diagnostic transactions</strong>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted, #64748b)', margin: '0 0 10px', lineHeight: 1.5 }}>
        Lit toutes les transactions directement depuis Firestore (sans aucun filtre) pour vérifier ce qui est réellement en base, y compris les articles supprimés du menu.
      </p>
      <button onClick={run} disabled={running}
        style={{
          padding: '7px 14px', background: 'var(--brand, #1a6b7a)', color: '#fff',
          border: 'none', borderRadius: 6, fontSize: 12, cursor: running ? 'wait' : 'pointer',
          fontFamily: 'inherit',
        }}>
        {running ? 'Lecture en cours…' : 'Lancer le diagnostic'}
      </button>
      {report && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <button onClick={copy}
              style={{
                padding: '4px 10px', background: 'transparent',
                border: '0.5px solid var(--border, #e2e8f0)', borderRadius: 6,
                fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              {copied ? <><Check size={12}/> Copié</> : <><Copy size={12}/> Copier</>}
            </button>
          </div>
          <pre style={{
            margin: 0, padding: 12, background: '#0f172a', color: '#e2e8f0',
            borderRadius: 8, fontSize: 11, lineHeight: 1.5,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
            maxHeight: '60vh', overflow: 'auto',
          }}>{report}</pre>
        </div>
      )}
    </div>
  )
}
