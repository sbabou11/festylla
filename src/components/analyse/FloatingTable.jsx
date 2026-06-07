/**
 * components/analyse/FloatingTable.jsx
 *
 * Fenêtre flottante d'un tableau croisé articles × transactions.
 * - Déplaçable par le header
 * - Redimensionnable par le coin bas-droit
 * - Réductible (collapse), fermable
 * - Colonnes = articles, lignes = transactions, totaux par colonne + global
 * - Exportable en Excel (.xlsx)
 *
 * Props :
 *   table        : { id, name, articles[], window:{x,y,w,h,collapsed} }
 *   allArticles  : string[]  — liste de tous les articles dispo (pour ajout colonne)
 *   rows         : Array<{ ts, date, ref, perArticle: {article: {montant, qty}}, }>
 *                  (pré-calculé par le parent selon table.articles)
 *   onUpdate(patch, immediate)
 *   onDelete()
 *   onExport()
 */
import React, { useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Minus, Square, GripVertical, Download, Plus, Trash2, Maximize2, Minimize2 } from 'lucide-react'

const fmt = (n) => (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const normalize = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// Types de transaction : libellé court + couleur de pastille
const KIND_META = {
  'vente':           { label: 'Vente',      color: '#0F6E56', bg: '#E1F5EE' },
  'resa-spectateur': { label: 'Résa spect.', color: '#185FA5', bg: '#E6F1FB' },
  'resa-benevole':   { label: 'Résa bénév.', color: '#7A4FB5', bg: '#F0EAFB' },
  'conso-benevole':  { label: 'Conso bénév.', color: '#A8701F', bg: '#FAEEDA' },
}
const kindMeta = (k) => KIND_META[k] || { label: k || '—', color: '#5F5E5A', bg: '#F1EFE8' }

export default function FloatingTable({ table, allArticles, rows, totals, onUpdate, onDelete, onExport }) {
  const win = table.window || { x: 40, y: 40, w: 460, h: 360, collapsed: false }
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(table.name)
  const [addOpen, setAddOpen] = useState(false)
  const [colSearch, setColSearch] = useState('')
  const dragRef = useRef(null)

  // ─── Drag de la fenêtre via le header ───────────────────────────────
  const onHeaderPointerDown = useCallback((e) => {
    if (win.maximized) return
    // Ne pas démarrer le drag si on clique un bouton ou l'input nom
    if (e.target.closest('button, input')) return
    e.preventDefault()
    const startX = e.clientX, startY = e.clientY
    const origX = win.x, origY = win.y
    let lastWin = { ...win }
    const move = (ev) => {
      lastWin = { ...win, x: Math.max(0, origX + ev.clientX - startX), y: Math.max(0, origY + ev.clientY - startY) }
      onUpdate({ window: lastWin }, 'local')
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onUpdate({ window: lastWin }, true) // save la position FINALE
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [win, onUpdate])

  // ─── Resize via coin bas-droit ──────────────────────────────────────
  const onResizePointerDown = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startY = e.clientY
    const origW = win.w, origH = win.h
    let lastWin = { ...win }
    const move = (ev) => {
      lastWin = { ...win,
        w: Math.max(300, origW + ev.clientX - startX),
        h: Math.max(180, origH + ev.clientY - startY) }
      onUpdate({ window: lastWin }, 'local')
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onUpdate({ window: lastWin }, true) // save la taille FINALE
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [win, onUpdate])

  const toggleCollapse = () => onUpdate({ window: { ...win, collapsed: !win.collapsed } }, true)
  const toggleMaximize = () => onUpdate({ window: { ...win, maximized: !win.maximized } }, true)

  const addArticle = (art) => {
    if (table.articles.includes(art)) return
    onUpdate({ articles: [...table.articles, art] }, true)
    setAddOpen(false)
  }
  const removeArticle = (art) => {
    onUpdate({ articles: table.articles.filter(a => a !== art) }, true)
  }

  const saveName = () => {
    setEditingName(false)
    if (nameDraft.trim() && nameDraft !== table.name) onUpdate({ name: nameDraft.trim() }, true)
  }

  const availableToAdd = allArticles.filter(a => !table.articles.includes(a))

  // Regroupement des lignes par jour (pour sous-totaux quotidiens).
  // rows est déjà trié par ts décroissant. On détecte les jours distincts.
  const dayKey = (ts) => {
    const d = new Date(ts)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
  const dayLabel = (ts) => new Date(ts).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
  const dayGroups = (() => {
    const groups = []
    let cur = null
    rows.forEach(r => {
      const k = dayKey(r.ts)
      if (!cur || cur.key !== k) {
        cur = { key: k, label: dayLabel(r.ts), rows: [], perArticle: {}, total: 0, nbTx: 0, units: {}, txCount: {} }
        table.articles.forEach(a => { cur.perArticle[a] = 0; cur.units[a] = 0; cur.txCount[a] = 0 })
        groups.push(cur)
      }
      cur.rows.push(r)
      cur.total += r.rowTotal
      cur.nbTx += 1
      table.articles.forEach(a => {
        if (r.perArticle[a]) {
          cur.perArticle[a] += r.perArticle[a].montant
          cur.units[a] += r.perArticle[a].qty
          cur.txCount[a] += 1
        }
      })
    })
    return groups
  })()
  const multiJours = dayGroups.length > 1

  // Style de positionnement : maximisé = plein écran ; sinon flottant fixed
  const maximized = !!win.maximized
  const positionStyle = maximized
    ? { position: 'fixed', left: 12, top: 12, right: 12, bottom: 12, width: 'auto', height: 'auto', zIndex: 9999 }
    : {
        position: 'fixed',
        left: win.x, top: win.y,
        width: win.w,
        height: win.collapsed ? 'auto' : win.h,
        zIndex: 9998,
      }

  const content = (
    <div
      ref={dragRef}
      style={{
        ...positionStyle,
        background: 'var(--bg, #fff)',
        border: '0.5px solid var(--border2, #C9C7BD)',
        borderRadius: 10,
        boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
      {/* Header — drag handle */}
      <div
        onPointerDown={onHeaderPointerDown}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg2, #F1EFE8)',
          borderBottom: '0.5px solid var(--border, #D3D1C7)',
          padding: '6px 8px', cursor: maximized ? 'default' : 'move', flexShrink: 0,
          gap: 8,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
          <GripVertical size={14} style={{ color: 'var(--muted)', flexShrink: 0 }}/>
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => { if (e.key === 'Enter') saveName() }}
              style={{
                fontSize: 13, fontWeight: 600, border: '0.5px solid var(--border)',
                borderRadius: 4, padding: '2px 6px', fontFamily: 'inherit',
                background: 'var(--bg)', color: 'var(--text)', minWidth: 0, flex: 1,
              }}/>
          ) : (
            <span
              onClick={() => { setNameDraft(table.name); setEditingName(true) }}
              title="Cliquer pour renommer"
              style={{
                fontSize: 13, fontWeight: 600, color: 'var(--text, #1E1E1E)',
                cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
              {table.name}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          <button onClick={onExport} title="Exporter en Excel"
            style={winBtnStyle('var(--brand, #0F6E56)', '#fff')}>
            <Download size={12}/>
          </button>
          <button onClick={toggleMaximize} title={maximized ? 'Restaurer' : 'Agrandir'}
            style={winBtnStyle()}>
            {maximized ? <Minimize2 size={12}/> : <Maximize2 size={12}/>}
          </button>
          <button onClick={toggleCollapse} title={win.collapsed ? 'Agrandir' : 'Réduire'}
            style={winBtnStyle()}>
            {win.collapsed ? <Square size={11}/> : <Minus size={12}/>}
          </button>
          <button onClick={() => { if (window.confirm(`Supprimer le tableau « ${table.name} » ?`)) onDelete() }}
            title="Fermer" style={winBtnStyle('transparent', 'var(--red, #A32D2D)')}>
            <X size={13}/>
          </button>
        </div>
      </div>

      {/* Corps (masqué si collapsed) */}
      {!win.collapsed && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Barre ajout colonne */}
          <div style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border)', position: 'relative', flexShrink: 0 }}>
            <button onClick={() => setAddOpen(o => !o)}
              style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 12,
                background: 'var(--brand-light, #E1F5EE)', color: 'var(--brand-dark, #04342C)',
                border: '0.5px dashed var(--brand, #0F6E56)', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit',
              }}>
              <Plus size={11}/> Ajouter une colonne (article)
            </button>
            {addOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: 8, zIndex: 5,
                background: 'var(--bg)', border: '0.5px solid var(--border)',
                borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                width: 260, marginTop: 2, overflow: 'hidden',
              }}>
                {/* Barre de recherche */}
                <div style={{ padding: 6, borderBottom: '0.5px solid var(--border)' }}>
                  <input
                    autoFocus
                    value={colSearch}
                    onChange={e => setColSearch(e.target.value)}
                    placeholder="Rechercher un article…"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      padding: '6px 10px', fontSize: 12,
                      border: '0.5px solid var(--border)', borderRadius: 6,
                      background: 'var(--bg2)', color: 'var(--text)',
                      fontFamily: 'inherit', outline: 'none',
                    }}/>
                </div>
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {availableToAdd
                    .filter(a => normalize(a).includes(normalize(colSearch)))
                    .map(a => (
                      <button key={a} onClick={() => { addArticle(a); setColSearch('') }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '7px 12px', background: 'transparent', border: 'none',
                          fontSize: 12, color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        {a}
                      </button>
                    ))}
                  {availableToAdd.filter(a => normalize(a).includes(normalize(colSearch))).length === 0 && (
                    <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                      {availableToAdd.length === 0 ? 'Tous les articles sont ajoutés' : 'Aucun résultat'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Tableau scrollable */}
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            {table.articles.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                Ajoutez des colonnes (articles) pour construire le tableau.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, left: 0, zIndex: 3 }}>Transaction</th>
                    <th style={{ ...thStyle, zIndex: 3 }}>Type</th>
                    {table.articles.map(a => (
                      <th key={a} colSpan={2} style={{ ...thStyle, textAlign: 'center', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', marginBottom: 3 }}>
                          <span>{a}</span>
                          <button onClick={() => removeArticle(a)} title="Retirer la colonne"
                            style={{
                              background: 'transparent', border: 'none', cursor: 'pointer',
                              color: 'rgba(255,255,255,0.7)', padding: 0,
                              display: 'inline-flex', alignItems: 'center', flexShrink: 0,
                            }}>
                            <X size={10}/>
                          </button>
                        </div>
                        <div style={{
                          display: 'flex', borderTop: '0.5px solid rgba(255,255,255,0.25)',
                          fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.8)',
                          textTransform: 'none', letterSpacing: 0,
                        }}>
                          <span style={{ flex: 1, textAlign: 'right', padding: '2px 4px' }}>€</span>
                          <span style={{ flex: 1, textAlign: 'right', padding: '2px 4px' }}>Unités</span>
                        </div>
                      </th>
                    ))}
                    <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {dayGroups.map((g, gi) => (
                    <React.Fragment key={g.key}>
                      {/* En-tête de jour (seulement si plusieurs jours) */}
                      {multiJours && (
                        <tr>
                          <td colSpan={table.articles.length * 2 + 3} style={dayHeaderStyle}>
                            {g.label}
                          </td>
                        </tr>
                      )}
                      {g.rows.map((r, i) => (
                        <tr key={r.id || `${gi}-${i}`}>
                          <td style={tdStyle}>
                            <div style={{ whiteSpace: 'nowrap' }}>{r.dateLabel}</div>
                            <div style={{ fontSize: 9, color: 'var(--muted)' }}>{r.ref}</div>
                          </td>
                          <td style={tdStyle}>
                            {(() => { const m = kindMeta(r.kind); return (
                              <span style={{
                                display: 'inline-block', padding: '2px 7px', borderRadius: 10,
                                background: m.bg, color: m.color, fontSize: 10, fontWeight: 600,
                                whiteSpace: 'nowrap',
                              }}>{m.label}</span>
                            )})()}
                          </td>
                          {table.articles.map(a => (
                            <React.Fragment key={a}>
                              <td style={{ ...tdStyle, textAlign: 'right' }}>
                                {r.perArticle[a] ? fmt(r.perArticle[a].montant) : '—'}
                              </td>
                              <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--muted)' }}>
                                {r.perArticle[a] ? r.perArticle[a].qty : '—'}
                              </td>
                            </React.Fragment>
                          ))}
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmt(r.rowTotal)}</td>
                        </tr>
                      ))}
                      {/* Sous-totaux du jour (seulement si plusieurs jours) */}
                      {multiJours && (
                        <>
                          <tr>
                            <td colSpan={2} style={daySubtotalStyle}>CA {g.label}</td>
                            {table.articles.map(a => (
                              <td key={a} colSpan={2} style={{ ...daySubtotalStyle, textAlign: 'right' }}>{fmt(g.perArticle[a] || 0)}</td>
                            ))}
                            <td style={{ ...daySubtotalStyle, textAlign: 'right' }}>{fmt(g.total)}</td>
                          </tr>
                          <tr>
                            <td colSpan={2} style={daySubtotalSubStyle}>Transactions</td>
                            {table.articles.map(a => (
                              <td key={a} colSpan={2} style={{ ...daySubtotalSubStyle, textAlign: 'right' }}>{g.txCount?.[a] || 0}</td>
                            ))}
                            <td style={{ ...daySubtotalSubStyle, textAlign: 'right' }}>{g.nbTx}</td>
                          </tr>
                          <tr>
                            <td colSpan={2} style={daySubtotalSubStyle}>Unités</td>
                            {table.articles.map(a => (
                              <td key={a} colSpan={2} style={{ ...daySubtotalSubStyle, textAlign: 'right' }}>{g.units?.[a] || 0}</td>
                            ))}
                            <td style={{ ...daySubtotalSubStyle, textAlign: 'right' }}>
                              {table.articles.reduce((s, a) => s + (g.units?.[a] || 0), 0)}
                            </td>
                          </tr>
                        </>
                      )}
                    </React.Fragment>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={table.articles.length * 2 + 3} style={{ ...tdStyle, textAlign: 'center', color: 'var(--muted)', fontStyle: 'italic' }}>
                      Aucune transaction pour ces articles
                    </td></tr>
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={2} style={tfootStyle}>Total CA</td>
                      {table.articles.map(a => (
                        <td key={a} colSpan={2} style={{ ...tfootStyle, textAlign: 'right' }}>{fmt(totals.perArticle[a] || 0)}</td>
                      ))}
                      <td style={{ ...tfootStyle, textAlign: 'right' }}>{fmt(totals.global)}</td>
                    </tr>
                    <tr>
                      <td colSpan={2} style={tfootSubStyle}>Transactions</td>
                      {table.articles.map(a => (
                        <td key={a} colSpan={2} style={{ ...tfootSubStyle, textAlign: 'right' }}>{totals.txCount[a] || 0}</td>
                      ))}
                      <td style={{ ...tfootSubStyle, textAlign: 'right' }}>{totals.nbLignes}</td>
                    </tr>
                    <tr>
                      <td colSpan={2} style={tfootSubStyle}>Unités</td>
                      {table.articles.map(a => (
                        <td key={a} colSpan={2} style={{ ...tfootSubStyle, textAlign: 'right' }}>{totals.units[a] || 0}</td>
                      ))}
                      <td style={{ ...tfootSubStyle, textAlign: 'right' }}>
                        {table.articles.reduce((s, a) => s + (totals.units[a] || 0), 0)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>

          {/* Poignée de resize (masquée si maximisé) */}
          {!maximized && (
            <div
              onPointerDown={onResizePointerDown}
              style={{
                position: 'absolute', right: 0, bottom: 0,
                width: 16, height: 16, cursor: 'nwse-resize',
                background: 'linear-gradient(135deg, transparent 50%, var(--border2, #B4B2A9) 50%)',
              }}/>
          )}
        </div>
      )}
    </div>
  )

  return createPortal(content, document.body)
}

const winBtnStyle = (bg = 'var(--bg)', color = 'var(--muted, #5F5E5A)') => ({
  width: 24, height: 22, borderRadius: 5,
  background: bg,
  border: bg === 'transparent' ? 'none' : '0.5px solid var(--border, #D3D1C7)',
  color,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', padding: 0,
})

const thStyle = {
  background: '#2C4A52', color: '#fff', padding: '6px 8px', textAlign: 'left',
  fontWeight: 500, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.03em',
  position: 'sticky', top: 0, zIndex: 2,
}
const thSubStyle = {
  background: '#3A5A62', color: 'rgba(255,255,255,0.85)', padding: '3px 8px',
  fontWeight: 500, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.03em',
}
const tdStyle = { padding: '5px 8px', borderBottom: '0.5px solid #E2E0D5', color: '#1E1E1E', background: '#fff' }
const tfootStyle = {
  padding: '6px 8px', background: '#0F6E56', fontWeight: 700,
  color: '#fff', borderTop: '1.5px solid #0B5743',
  position: 'sticky', bottom: 0,
}
const tfootSubStyle = {
  padding: '4px 8px', background: '#1A8268', fontWeight: 500,
  color: 'rgba(255,255,255,0.92)', fontSize: 10,
}
// En-tête de groupe jour (bandeau)
const dayHeaderStyle = {
  padding: '5px 8px', background: '#2C4A52', color: '#fff',
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
}
// Sous-total d'un jour
const daySubtotalStyle = {
  padding: '5px 8px', background: '#DCEDE7', color: '#04342C',
  fontWeight: 600, fontSize: 11, borderTop: '0.5px solid #9FD4C2',
}
// Sous-lignes du sous-total jour (transactions, unités)
const daySubtotalSubStyle = {
  padding: '3px 8px', background: '#EAF4F0', color: '#3A5A52',
  fontWeight: 500, fontSize: 10,
}
