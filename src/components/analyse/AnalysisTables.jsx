/**
 * components/analyse/AnalysisTables.jsx
 *
 * Espace "Tableaux d'analyse" de la page Comptabilité.
 * - Bouton "Nouveau tableau"
 * - Zone de canevas où flottent les fenêtres (FloatingTable)
 * - Calcule pour chaque tableau les lignes (transactions × articles choisis)
 * - Export CSV par tableau
 *
 * Props :
 *   operations : Array (les opérations Comptabilité, avec .items pour les ventes)
 */
import React, { useMemo } from 'react'
import { Plus, Table2 } from 'lucide-react'
import useAnalysisTables from '../../hooks/useAnalysisTables'
import FloatingTable from './FloatingTable'
import useEventStore from '../../store/useEventStore'
import { APP_VERSION_LABEL } from '../../utils/buildInfo'

// Extrait la part (montant en €, qty) d'un article dans une opération
function partArticle(op, article) {
  let montant = 0, qty = 0
  ;(op.items || []).forEach(it => {
    if ((it.nom || it.name) === article) {
      const q = it.qty || it.quantite || 1
      const m = (it.total != null ? it.total : (it.prixUnit || it.prix || 0) * q) / 100
      montant += m; qty += q
    }
  })
  return montant > 0 || qty > 0 ? { montant, qty } : null
}

const fmtDate = (ts) => {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Libellé lisible d'un type de transaction (pour l'export CSV)
const KIND_LABELS = {
  'vente': 'Vente', 'resa-spectateur': 'Résa spectateur',
  'resa-benevole': 'Résa bénévole', 'conso-benevole': 'Conso bénévole',
}
const kindLabel = (k) => KIND_LABELS[k] || k || ''

export default function AnalysisTables({ operations }) {
  const { tables, loading, createTable, updateTable, deleteTable } = useAnalysisTables()
  const { currentEvent: currentEventFn } = useEventStore()
  const currentEvent = (typeof currentEventFn === 'function' ? currentEventFn() : currentEventFn) || {}

  // Tous les articles présents dans les ventes (pour les colonnes dispo)
  const allArticles = useMemo(() => {
    const set = new Set()
    operations.forEach(o => (o.items || []).forEach(it => {
      const nom = it.nom || it.name
      if (nom) set.add(nom)
    }))
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [operations])

  // Calcule les lignes + totaux d'un tableau donné selon ses articles
  const computeRows = (articles) => {
    const rows = []
    const totalsPerArticle = {}
    const txCountPerArticle = {}   // nb de transactions contenant l'article
    const unitsPerArticle = {}     // nb d'unités vendues de l'article
    articles.forEach(a => { totalsPerArticle[a] = 0; txCountPerArticle[a] = 0; unitsPerArticle[a] = 0 })
    let globalTotal = 0

    operations.forEach(op => {
      if (!op.items || op.items.length === 0) return
      const perArticle = {}
      let rowTotal = 0
      let hasAny = false
      articles.forEach(a => {
        const part = partArticle(op, a)
        if (part) {
          perArticle[a] = part
          rowTotal += part.montant
          totalsPerArticle[a] += part.montant
          txCountPerArticle[a] += 1
          unitsPerArticle[a] += part.qty
          hasAny = true
        }
      })
      if (hasAny) {
        rows.push({
          id: op.id,
          ts: op.ts,
          dateLabel: fmtDate(op.ts),
          ref: op.ref || op.description || '',
          kind: op.kind || 'vente',
          perArticle,
          rowTotal,
        })
        globalTotal += rowTotal
      }
    })
    rows.sort((a, b) => b.ts - a.ts)
    return {
      rows,
      totals: {
        perArticle: totalsPerArticle,
        txCount: txCountPerArticle,
        units: unitsPerArticle,
        global: globalTotal,
        nbLignes: rows.length,
      },
    }
  }

  // Construit les groupes par jour (pour sous-totaux), à partir des rows triées
  const buildDayGroups = (rows, articles) => {
    const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
    const dayLabel = (ts) => new Date(ts).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
    const groups = []
    let cur = null
    rows.forEach(r => {
      const k = dayKey(r.ts)
      if (!cur || cur.key !== k) {
        cur = { key: k, label: dayLabel(r.ts), rows: [], perArticle: {}, units: {}, txCount: {}, total: 0, nbTx: 0 }
        articles.forEach(a => { cur.perArticle[a] = 0; cur.units[a] = 0; cur.txCount[a] = 0 })
        groups.push(cur)
      }
      cur.rows.push({
        dateLabel: r.dateLabel, kindLabel: kindLabel(r.kind), ref: r.ref,
        perArticle: r.perArticle, rowTotal: r.rowTotal,
      })
      cur.total += r.rowTotal; cur.nbTx += 1
      articles.forEach(a => {
        if (r.perArticle[a]) { cur.perArticle[a] += r.perArticle[a].montant; cur.units[a] += r.perArticle[a].qty; cur.txCount[a] += 1 }
      })
    })
    return groups
  }

  // Export XLSX stylé d'un tableau (via /api/analyse-xlsx)
  const exportTable = async (table) => {
    const { rows, totals } = computeRows(table.articles)
    const dayGroups = buildDayGroups(rows, table.articles)
    const payload = {
      event: { nom: currentEvent.nom || 'Événement', couleur: currentEvent.couleur || '#1a6b7a' },
      appVersion: APP_VERSION_LABEL,
      table: {
        name: table.name || 'Tableau d\'analyse',
        articles: table.articles,
        showUnits: true,
        detail: true,
        subtotalsByDay: dayGroups.length > 1,
      },
      rows: rows.map(r => ({
        dateLabel: r.dateLabel, kindLabel: kindLabel(r.kind), ref: r.ref,
        perArticle: r.perArticle, rowTotal: r.rowTotal,
      })),
      dayGroups,
      totals,
    }
    try {
      const resp = await fetch('/api/analyse-xlsx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) throw new Error('Erreur serveur ' + resp.status)
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(table.name || 'tableau').replace(/[^a-z0-9]/gi, '_')}.xlsx`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Erreur export Excel : ' + e.message)
    }
  }

  return (
    <div>
      {/* Barre d'action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => createTable()}
          style={{
            background: 'var(--brand, #0F6E56)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: 'inherit',
          }}>
          <Plus size={15}/> Nouveau tableau
        </button>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {tables.length} tableau{tables.length > 1 ? 'x' : ''} · {allArticles.length} articles disponibles
        </span>
      </div>

      {/* Les fenêtres flottent en portal (position fixed) sur toute la page.
          Cette zone sert d'accueil / état vide uniquement. */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Chargement…
        </div>
      ) : tables.length === 0 ? (
        <div style={{
          padding: 60, textAlign: 'center', color: 'var(--muted)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          background: 'var(--bg2, #F8F8F5)',
          border: '0.5px dashed var(--border, #D3D1C7)',
          borderRadius: 12,
        }}>
          <Table2 size={32} style={{ opacity: 0.4 }}/>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Aucun tableau d'analyse</div>
          <div style={{ fontSize: 12, maxWidth: 360 }}>
            Créez un tableau, ajoutez des colonnes (articles), et les transactions
            correspondantes se rempliront automatiquement avec totaux par colonne et global.
            Les fenêtres flottent librement sur la page et peuvent être agrandies.
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', padding: '8px 0' }}>
          {tables.length} fenêtre{tables.length > 1 ? 's' : ''} ouverte{tables.length > 1 ? 's' : ''} sur la page.
          Déplacez-les par leur titre, agrandissez-les ou réduisez-les.
        </div>
      )}

      {/* Rendu des fenêtres flottantes (chacune en portal/fixed) */}
      {!loading && tables.map(table => {
        const { rows, totals } = computeRows(table.articles || [])
        return (
          <FloatingTable
            key={table.id}
            table={table}
            allArticles={allArticles}
            rows={rows}
            totals={totals}
            onUpdate={(patch, immediate) => updateTable(table.id, patch, immediate)}
            onDelete={() => deleteTable(table.id)}
            onExport={() => exportTable(table)}
          />
        )
      })}
    </div>
  )
}
