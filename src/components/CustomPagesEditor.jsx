/**
 * components/CustomPagesEditor.jsx — Lot Custom B1
 *
 * Éditeur de pages personnalisées pour le rapport de clôture.
 * Chaque page : { id, titre, sousTitre, position, tables: [{ source, titre, ...filtres, fields, totalRow }] }
 * B1 : 1 tableau par page, 5 sources, aperçu temps réel des vraies données.
 *
 * L'aperçu est calculé en JS (estimation fidèle alignée sur la logique Python).
 * Le PDF reste la source de vérité.
 */
import React, { useState, useMemo } from 'react'
import { Plus, Trash2, ArrowUp, ArrowDown, FileText, Eye, Table2, Copy } from 'lucide-react'
import TransferList from './TransferList'

// Colonnes disponibles par source (clé, label court, sommable?)
export const SOURCE_COLUMNS = {
  articles: [
    { key: 'rank',  label: 'Rang #',         sum: false },
    { key: 'nom',   label: 'Article',        sum: false },
    { key: 'qty',   label: 'Unités vendues', sum: true  },
    { key: 'ca',    label: 'CA généré',      sum: true  },
    { key: 'pct',   label: '% du CA',        sum: false },
    { key: 'stock', label: 'Stock restant',  sum: false },
  ],
  spectateurs: [
    { key: 'id',       label: 'ID QR',          sum: false },
    { key: 'nom',      label: 'Nom',            sum: false },
    { key: 'solde',    label: 'Solde restant',  sum: true  },
    { key: 'nb_tx',    label: 'Nb transactions',sum: true  },
    { key: 'recharge', label: 'Total rechargé', sum: true  },
    { key: 'depense',  label: 'Total dépensé',  sum: true  },
  ],
  benevoles: [
    { key: 'nom',   label: 'Bénévole',  sum: false },
    { key: 'code',  label: 'Code résa', sum: false },
    { key: 'type',  label: 'Type',      sum: false },
    { key: 'total', label: 'Total',     sum: true  },
    { key: 'items', label: 'Articles',  sum: false },
    { key: 'date',  label: 'Date',      sum: false },
  ],
  reservations: [
    { key: 'code',   label: 'Code',         sum: false },
    { key: 'who',    label: 'Bénéficiaire', sum: false },
    { key: 'type',   label: 'Type',         sum: false },
    { key: 'items',  label: 'Articles',     sum: false },
    { key: 'total',  label: 'Total',        sum: true  },
    { key: 'status', label: 'Statut',       sum: false },
    { key: 'date',   label: 'Date',         sum: false },
  ],
  transactions: [
    { key: 'date',    label: 'Date',         sum: false },
    { key: 'heure',   label: 'Heure',        sum: false },
    { key: 'type',    label: 'Type',         sum: false },
    { key: 'who',     label: 'Bénéficiaire', sum: false },
    { key: 'label',   label: 'Libellé',      sum: false },
    { key: 'montant', label: 'Montant',      sum: true  },
    { key: 'staff',   label: 'Staff',        sum: false },
  ],
}

export const SOURCE_META = {
  articles:     { label: 'Articles',     icon: '🛒' },
  spectateurs:  { label: 'Spectateurs',  icon: '👥' },
  benevoles:    { label: 'Bénévoles',    icon: '🙋' },
  reservations: { label: 'Réservations', icon: '📋' },
  transactions: { label: 'Transactions', icon: '💳' },
  croise:       { label: 'Tableau croisé (articles)', icon: '📊' },
}

// Positions possibles dans le rapport
export const POSITION_OPTIONS = [
  { key: 'cover',        label: 'Après la couverture' },
  { key: 'resultat',     label: 'Après « Compte de résultat »' },
  { key: 'finances',     label: "Après « Dépenses & recettes d'orga »" },
  { key: 'recap',        label: 'Après « Récapitulatif financier »' },
  { key: 'graphics',     label: 'Après « Analyse graphique »' },
  { key: 'articles',     label: 'Après « Top articles vendus »' },
  { key: 'stats',        label: 'Après « Statistiques staff »' },
  { key: 'transactions', label: 'Après « Détail des transactions »' },
  { key: 'spectateurs',  label: 'Après « Spectateurs & soldes »' },
  { key: 'reservations', label: 'Après « Réservations »' },
  { key: 'benevoles',    label: 'Après « Bénévoles »' },
  { key: 'end',          label: 'À la fin du rapport' },
]

const LABEL_STYLE = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.04em', color: 'var(--muted)',
  marginBottom: 6, display: 'block',
}
const INPUT_STYLE = {
  width: '100%', padding: '7px 10px', fontSize: 12,
  border: '0.5px solid var(--border)', borderRadius: 6,
  background: '#fff', fontFamily: 'inherit', boxSizing: 'border-box',
}
const BLOCK_STYLE = {
  background: 'var(--bg)', borderRadius: 6, padding: 12, marginBottom: 10,
}

function newTable() {
  return {
    source: 'articles',
    titre: '',
    periodFrom: '', periodTo: '',
    topN: 20,
    articleSelection: null,
    categorieSelection: null,
    spectateurSelection: null,
    benevoleSelection: null,
    txTypes: [],
    resaStatuses: [], resaType: 'all',
    minEur: '', maxEur: '',
    fields: null,
    // Config spécifique au tableau croisé (source 'croise') :
    croiseArticles: [],          // noms d'articles = colonnes
    croiseDetail: true,          // lister chaque transaction
    croiseSubtotalsByDay: true,  // sous-totaux par jour
    croiseShowUnits: true,       // sous-colonne unités
    totalRow: { enabled: false, label: 'Total', position: 'bottom', columns: [], groupBy: null, subtotalLabel: 'Sous-total' },
  }
}

function newPage() {
  return {
    id: 'cp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    titre: 'Nouvelle page',
    sousTitre: '',
    position: 'end',
    tables: [newTable()],
  }
}

export default function CustomPagesEditor({
  pages, onChange,
  menuList = [], categoriesList = [], spectateursList = [],
  reservationsList = [], staffList = [], transactionsList = [],
}) {
  const [expandedPage, setExpandedPage] = useState(null)

  const addPage = () => {
    const p = newPage()
    onChange([...(pages || []), p])
    setExpandedPage(p.id)
  }
  const removePage = (id) => {
    if (!confirm('Supprimer cette page personnalisée ?')) return
    onChange((pages || []).filter(p => p.id !== id))
  }
  const updatePage = (id, patch) => {
    onChange((pages || []).map(p => p.id === id ? { ...p, ...patch } : p))
  }
  const movePage = (id, dir) => {
    const arr = [...(pages || [])]
    const idx = arr.findIndex(p => p.id === id)
    if (idx < 0) return
    const swap = idx + dir
    if (swap < 0 || swap >= arr.length) return
    ;[arr[idx], arr[swap]] = [arr[swap], arr[idx]]
    onChange(arr)
  }
  const duplicatePage = (id) => {
    const arr = [...(pages || [])]
    const idx = arr.findIndex(p => p.id === id)
    if (idx < 0) return
    // Clone profond + nouvel id ; insère juste après l'original
    const src = arr[idx]
    const copy = JSON.parse(JSON.stringify(src))
    copy.id = 'cp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    copy.titre = (src.titre || 'Page') + ' (copie)'
    arr.splice(idx + 1, 0, copy)
    onChange(arr)
    setExpandedPage(copy.id)
  }

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 10,
      }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
          Ajoutez des pages sur mesure avec leurs propres tableaux, insérées entre les sections standard.
        </div>
        <button type="button" onClick={addPage}
          style={{
            padding: '6px 12px', background: 'var(--brand)', color: '#fff',
            border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
          <Plus size={13}/> Ajouter une page
        </button>
      </div>

      {(pages || []).length === 0 && (
        <div style={{
          padding: '20px', textAlign: 'center', fontSize: 11,
          color: 'var(--muted)', fontStyle: 'italic',
          border: '0.5px dashed var(--border)', borderRadius: 6,
        }}>
          Aucune page personnalisée. Le rapport ne contient que les sections standard.
        </div>
      )}

      {(pages || []).map((page, idx) => (
        <CustomPageCard
          key={page.id}
          page={page}
          index={idx}
          total={(pages || []).length}
          expanded={expandedPage === page.id}
          onToggle={() => setExpandedPage(expandedPage === page.id ? null : page.id)}
          onRemove={() => removePage(page.id)}
          onUpdate={(patch) => updatePage(page.id, patch)}
          onMove={(dir) => movePage(page.id, dir)}
          onDuplicate={() => duplicatePage(page.id)}
          menuList={menuList}
          categoriesList={categoriesList}
          spectateursList={spectateursList}
          reservationsList={reservationsList}
          staffList={staffList}
          transactionsList={transactionsList}
        />
      ))}
    </div>
  )
}

// ── Carte d'une page custom (en-tête + contenu déplié) ──
function CustomPageCard({
  page, index, total, expanded, onToggle, onRemove, onUpdate, onMove, onDuplicate,
  menuList, categoriesList, spectateursList, reservationsList, staffList, transactionsList,
}) {
  const posLabel = (POSITION_OPTIONS.find(p => p.key === page.position) || {}).label || page.position
  // B1 : une seule table par page
  const table = (page.tables && page.tables[0]) || newTable()
  const updateTable = (patch) => {
    onUpdate({ tables: [{ ...table, ...patch }] })
  }

  return (
    <div style={{
      marginBottom: 10, border: '0.5px solid var(--border)',
      borderRadius: 8, overflow: 'hidden', background: '#fff',
    }}>
      {/* En-tête */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
        background: expanded ? 'var(--brand-light)' : 'var(--bg)', cursor: 'pointer',
      }} onClick={onToggle}>
        <FileText size={15} style={{ color: 'var(--brand-dark)', flexShrink: 0 }}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {page.titre || 'Page sans titre'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>
            {SOURCE_META[table.source]?.icon} {SOURCE_META[table.source]?.label} · {posLabel}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0}
            style={iconBtn(index === 0)} aria-label="Monter"><ArrowUp size={13}/></button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1}
            style={iconBtn(index === total - 1)} aria-label="Descendre"><ArrowDown size={13}/></button>
          <button type="button" onClick={onDuplicate}
            style={iconBtn(false)} aria-label="Dupliquer" title="Dupliquer cette page"><Copy size={13}/></button>
          <button type="button" onClick={onRemove}
            style={{ ...iconBtn(false), color: 'var(--red-dark)' }} aria-label="Supprimer"><Trash2 size={13}/></button>
        </div>
      </div>

      {/* Contenu déplié */}
      {expanded && (
        <div style={{ padding: 12 }}>
          {/* Métadonnées de la page */}
          <div style={BLOCK_STYLE}>
            <label style={LABEL_STYLE}>Titre de la page</label>
            <input style={INPUT_STYLE} value={page.titre}
              onChange={e => onUpdate({ titre: e.target.value })}
              placeholder="ex: Bilan restauration détaillé"/>
            <label style={{ ...LABEL_STYLE, marginTop: 10 }}>Sous-titre (optionnel)</label>
            <input style={INPUT_STYLE} value={page.sousTitre}
              onChange={e => onUpdate({ sousTitre: e.target.value })}
              placeholder="ex: Ventes par catégorie — service du soir"/>
            <label style={{ ...LABEL_STYLE, marginTop: 10 }}>Position dans le rapport</label>
            <select style={INPUT_STYLE} value={page.position}
              onChange={e => onUpdate({ position: e.target.value })}>
              {POSITION_OPTIONS.map(opt => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Éditeur du tableau */}
          <CustomTableEditor
            table={table}
            onChange={updateTable}
            menuList={menuList}
            categoriesList={categoriesList}
            spectateursList={spectateursList}
            reservationsList={reservationsList}
            staffList={staffList}
            transactionsList={transactionsList}
          />
        </div>
      )}
    </div>
  )
}

function iconBtn(disabled) {
  return {
    width: 26, height: 24, padding: 0,
    background: 'transparent', border: '0.5px solid var(--border)',
    borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer',
    color: disabled ? 'var(--muted)' : 'var(--brand-dark)',
    opacity: disabled ? 0.4 : 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}

// ── Éditeur d'un tableau custom (5 étapes) ──
function CustomTableEditor({
  table, onChange,
  menuList, categoriesList, spectateursList, reservationsList, staffList, transactionsList,
}) {
  const cols = SOURCE_COLUMNS[table.source] || []

  // Liste des articles cochables : menu actuel + articles vendus mais
  // supprimés du menu (marqués ⚠️). Précalculée pour éviter de reconstruire
  // l'objet à chaque rendu et garantir la portée des variables.
  const articleItems = useMemo(() => {
    const menuArr = Array.isArray(menuList) ? menuList : []
    const txArr = Array.isArray(transactionsList) ? transactionsList : []
    const nomsMenu = new Set(menuArr.map(m => m && m.nom).filter(Boolean))
    const venteTypes = new Set(['debit', 'retrait', 'benev-retrait'])
    const ventes = {}
    for (const t of txArr) {
      if (!t || !venteTypes.has(t.type)) continue
      const items = Array.isArray(t.items) ? t.items : []
      for (const it of items) {
        if (!it || !it.nom) continue
        ventes[it.nom] = (ventes[it.nom] || 0) + (it.qty || 1)
      }
    }
    const supprimes = Object.keys(ventes)
      .filter(nom => !nomsMenu.has(nom))
      .sort((a, b) => ventes[b] - ventes[a])
      .map(nom => ({ id: nom, label: `⚠️ ${nom}`, meta: `${ventes[nom]} vendus` }))
    const fromMenu = menuArr.map(m => ({
      id: m.id || m.nom,
      label: m.nom || 'Sans nom',
      meta: m.prix !== undefined ? `${(m.prix / 100).toFixed(2)} €` : null,
    }))
    return [...fromMenu, ...supprimes]
  }, [menuList, transactionsList])

  // Changement de source : on réinitialise fields + totalRow.columns (incompatibles)
  const changeSource = (src) => {
    onChange({
      source: src,
      fields: null,
      totalRow: { ...(table.totalRow || {}), columns: [], groupBy: null },
    })
  }

  const toggleField = (key) => {
    const isAll = table.fields === null || table.fields === undefined
    let base = isAll ? cols.map(c => c.key) : (table.fields || [])
    const set = new Set(base)
    if (set.has(key)) set.delete(key); else set.add(key)
    onChange({ fields: Array.from(set) })
  }
  const fieldActive = (key) => {
    if (table.fields === null || table.fields === undefined) return true
    return (table.fields || []).includes(key)
  }

  const total = table.totalRow || { enabled: false, label: 'Total', position: 'bottom', columns: [] }
  const updateTotal = (patch) => onChange({ totalRow: { ...total, ...patch } })
  const toggleSumCol = (key) => {
    const cur = total.columns || []
    updateTotal({ columns: cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key] })
  }
  const summableCols = cols.filter(c => c.sum)

  return (
    <div style={{
      border: '0.5px solid var(--border)', borderRadius: 8, padding: 12,
      background: 'var(--bg2)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Table2 size={14}/> Tableau de la page
      </div>

      {/* 1. Source */}
      <div style={BLOCK_STYLE}>
        <label style={LABEL_STYLE}>1. Source de données</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))', gap: 6 }}>
          {Object.entries(SOURCE_META).map(([key, meta]) => (
            <div key={key} onClick={() => changeSource(key)}
              style={{
                padding: '8px 4px', textAlign: 'center', borderRadius: 6,
                cursor: 'pointer', fontSize: 10,
                border: table.source === key ? '2px solid var(--brand)' : '0.5px solid var(--border)',
                background: table.source === key ? 'var(--brand-light)' : '#fff',
                color: table.source === key ? 'var(--brand-dark)' : 'var(--muted)',
                fontWeight: table.source === key ? 600 : 400,
              }}>
              <div style={{ fontSize: 15, marginBottom: 3 }}>{meta.icon}</div>
              {meta.label}
            </div>
          ))}
        </div>
      </div>

      {/* 2. Titre tableau */}
      <div style={BLOCK_STYLE}>
        <label style={LABEL_STYLE}>2. Titre du tableau (optionnel)</label>
        <input style={INPUT_STYLE} value={table.titre || ''}
          onChange={e => onChange({ titre: e.target.value })}
          placeholder="ex: Plats chauds — service du soir"/>
      </div>

      {/* Config spécifique au tableau croisé */}
      {table.source === 'croise' && (
        <CroiseConfig table={table} onChange={onChange} articleItems={articleItems}/>
      )}

      {/* Sections standard (masquées pour le tableau croisé) */}
      {table.source !== 'croise' && (<>
      {/* 3. Filtres & sélection */}
      <div style={BLOCK_STYLE}>
        <label style={LABEL_STYLE}>3. Filtres &amp; sélection précise</label>
        <CustomTableFilters
          table={table} onChange={onChange}
          menuList={menuList} categoriesList={categoriesList}
          spectateursList={spectateursList} reservationsList={reservationsList}
          articleItems={articleItems}
        />
      </div>

      {/* 4. Colonnes */}
      <div style={BLOCK_STYLE}>
        <label style={LABEL_STYLE}>4. Colonnes affichées</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 4 }}>
          {cols.map(c => (
            <label key={c.key} style={{
              fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
              color: fieldActive(c.key) ? 'var(--text)' : 'var(--muted)',
            }}>
              <input type="checkbox" checked={fieldActive(c.key)}
                onChange={() => toggleField(c.key)} style={{ accentColor: 'var(--brand)' }}/>
              {c.label}
            </label>
          ))}
        </div>
      </div>

      {/* 5. Ligne de total */}
      <div style={BLOCK_STYLE}>
        <label style={LABEL_STYLE}>5. Ligne de total</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!total.enabled}
            onChange={e => updateTotal({ enabled: e.target.checked })}
            style={{ accentColor: 'var(--brand)' }}/>
          Afficher une ligne de total
        </label>
        {total.enabled && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '0.5px solid var(--border)' }}>
            <input style={{ ...INPUT_STYLE, marginBottom: 6 }} value={total.label || ''}
              onChange={e => updateTotal({ label: e.target.value })} placeholder="Libellé (ex: Total)"/>
            <select style={{ ...INPUT_STYLE, marginBottom: 6 }} value={total.position || 'bottom'}
              onChange={e => updateTotal({ position: e.target.value })}>
              <option value="bottom">En bas du tableau</option>
              <option value="top">En haut du tableau</option>
            </select>
            {summableCols.length > 0 ? (
              <>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Colonnes à sommer :</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 4 }}>
                  {summableCols.map(c => (
                    <label key={c.key} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                      <input type="checkbox" checked={(total.columns || []).includes(c.key)}
                        onChange={() => toggleSumCol(c.key)} style={{ accentColor: 'var(--brand)' }}/>
                      {c.label}
                    </label>
                  ))}
                </div>
                {/* Sous-totaux par catégorie : articles uniquement */}
                {table.source === 'articles' && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Sous-totaux :</div>
                    <select style={INPUT_STYLE} value={total.groupBy || ''}
                      onChange={e => updateTotal({ groupBy: e.target.value || null })}>
                      <option value="">Aucun</option>
                      <option value="categorie">Par catégorie</option>
                    </select>
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                Aucune colonne sommable pour cette source.
              </div>
            )}
          </div>
        )}
      </div>
      </>)}

      {/* Aperçu */}
      <CustomTablePreview
        table={table}
        menuList={menuList} spectateursList={spectateursList}
        reservationsList={reservationsList} transactionsList={transactionsList}
      />
    </div>
  )
}

// ── Config d'un tableau croisé (articles en colonnes) ──
function CroiseConfig({ table, onChange, articleItems = [] }) {
  const [search, setSearch] = useState('')
  const selected = table.croiseArticles || []
  const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  // Liste des noms d'articles disponibles. articleItems = { id, label, meta }.
  // On retire un éventuel préfixe ⚠️ (articles supprimés du menu).
  const allNames = useMemo(() => {
    const set = new Set()
    ;(articleItems || []).forEach(it => {
      let n = (it && (it.label || it.nom || it.name)) || it
      if (typeof n !== 'string') n = String(n)
      n = n.replace(/^⚠️\s*/, '').trim()
      if (n) set.add(n)
    })
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [articleItems])

  const available = allNames.filter(n => !selected.includes(n) && norm(n).includes(norm(search)))

  const addArticle = (n) => { onChange({ croiseArticles: [...selected, n] }); setSearch('') }
  const removeArticle = (n) => onChange({ croiseArticles: selected.filter(x => x !== n) })

  return (
    <div style={BLOCK_STYLE}>
      <label style={LABEL_STYLE}>Colonnes du tableau croisé (articles)</label>

      {/* Articles sélectionnés */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {selected.length === 0 && (
          <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
            Aucun article sélectionné — ajoutez-en ci-dessous.
          </span>
        )}
        {selected.map(n => (
          <span key={n} style={{
            fontSize: 11, padding: '4px 8px', borderRadius: 14,
            background: 'var(--brand-light)', color: 'var(--brand-dark)',
            border: '0.5px solid var(--brand)', display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            {n}
            <span onClick={() => removeArticle(n)} style={{ cursor: 'pointer', opacity: 0.6 }}>✕</span>
          </span>
        ))}
      </div>

      {/* Recherche + ajout */}
      <input style={{ ...INPUT_STYLE, marginBottom: 6 }} value={search}
        onChange={e => setSearch(e.target.value)} placeholder="Rechercher un article à ajouter…"/>
      {search && (
        <div style={{
          maxHeight: 160, overflowY: 'auto', border: '0.5px solid var(--border)',
          borderRadius: 6, marginBottom: 8,
        }}>
          {available.length === 0 ? (
            <div style={{ padding: 8, fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>Aucun résultat</div>
          ) : available.map(n => (
            <div key={n} onClick={() => addArticle(n)}
              style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', borderBottom: '0.5px solid var(--border)' }}>
              {n}
            </div>
          ))}
        </div>
      )}

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={table.croiseDetail !== false}
            onChange={e => onChange({ croiseDetail: e.target.checked })} style={{ accentColor: 'var(--brand)' }}/>
          Détailler chaque transaction (sinon totaux uniquement)
        </label>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={table.croiseShowUnits !== false}
            onChange={e => onChange({ croiseShowUnits: e.target.checked })} style={{ accentColor: 'var(--brand)' }}/>
          Afficher les unités (en plus du montant)
        </label>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={table.croiseSubtotalsByDay !== false}
            onChange={e => onChange({ croiseSubtotalsByDay: e.target.checked })} style={{ accentColor: 'var(--brand)' }}/>
          Sous-totaux par jour (si plusieurs jours)
        </label>
      </div>
    </div>
  )
}

// ── Filtres d'un tableau custom (varient selon la source) ──
function CustomTableFilters({
  table, onChange, menuList, categoriesList, spectateursList, reservationsList,
  articleItems = [],
}) {
  const src = table.source
  // Période : pertinente pour articles, benevoles, transactions
  const showPeriod = ['articles', 'benevoles', 'transactions'].includes(src)

  return (
    <div>
      {showPeriod && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Période</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="date" style={{ ...INPUT_STYLE, flex: 1 }} value={table.periodFrom || ''}
              onChange={e => onChange({ periodFrom: e.target.value })}/>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>→</span>
            <input type="date" style={{ ...INPUT_STYLE, flex: 1 }} value={table.periodTo || ''}
              onChange={e => onChange({ periodTo: e.target.value })}/>
          </div>
        </div>
      )}

      {/* Sélection précise selon source */}
      {src === 'articles' && (
        <PreciseSelect
          label="Articles" field="articleSelection" table={table} onChange={onChange}
          items={articleItems}
        />
      )}
      {src === 'articles' && (
        <PreciseSelect
          label="Catégories" field="categorieSelection" table={table} onChange={onChange}
          items={(categoriesList || []).map(c => ({ id: c.nom, label: c.nom || 'Sans nom',
            meta: `${(menuList || []).filter(m => m.cat === c.nom).length} art.` }))}
        />
      )}
      {src === 'spectateurs' && (
        <PreciseSelect
          label="Spectateurs" field="spectateurSelection" table={table} onChange={onChange}
          items={(spectateursList || []).map(s => ({ id: s.id, label: s.nom || s.id || '—', meta: s.id }))}
        />
      )}
      {src === 'benevoles' && (
        <PreciseSelect
          label="Bénévoles" field="benevoleSelection" table={table} onChange={onChange}
          items={uniqueBenevoles(reservationsList)}
        />
      )}
      {src === 'transactions' && (
        <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic', marginTop: 4 }}>
          Filtres avancés (types, montants) hérités des réglages standard.
        </div>
      )}
      {src === 'reservations' && (
        <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic', marginTop: 4 }}>
          Toutes les réservations sont incluses (filtres statut/type à venir).
        </div>
      )}
    </div>
  )
}

function uniqueBenevoles(reservationsList) {
  const m = new Map()
  for (const r of (reservationsList || [])) {
    if (r.benevoleId && !m.has(r.benevoleId)) {
      m.set(r.benevoleId, { id: r.benevoleId, label: r.benevoleNom || r.benevoleId, meta: null })
    }
  }
  return Array.from(m.values()).sort((a, b) => (a.label || '').localeCompare(b.label || ''))
}

// ── Sélecteur précis réutilisable (activation null↔[] + TransferList) ──
function PreciseSelect({ label, field, table, onChange, items }) {
  const active = table[field] !== null && table[field] !== undefined
  const selectedIds = active ? (table[field] || []) : []
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}{active ? ` (${selectedIds.length}/${items.length})` : ''}</span>
        {active
          ? <button type="button" onClick={() => onChange({ [field]: null })}
              style={linkBtn}>tout inclure</button>
          : <button type="button" onClick={() => onChange({ [field]: [] })}
              style={linkBtn}>sélectionner…</button>}
      </div>
      {active && (
        <TransferList
          items={items} selectedIds={selectedIds}
          onChange={(ids) => onChange({ [field]: ids })}
          placeholder={`Rechercher…`}
          emptyAvailableMessage="Aucun élément."
          emptySelectedMessage="Aucune sélection."
        />
      )}
    </div>
  )
}

const linkBtn = {
  background: 'transparent', border: 'none', color: 'var(--brand-dark)',
  fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', padding: 0,
}

// ── Aperçu temps réel du tableau (vraies données, calcul JS) ──
// Reproduit fidèlement la logique Python de _custom_build_data.
// Le PDF reste la source de vérité ; ceci est une estimation à l'écran.
function CustomTablePreview({ table, menuList, spectateursList, reservationsList, transactionsList }) {
  // Aperçu spécifique au tableau croisé
  if (table.source === 'croise') {
    const arts = table.croiseArticles || []
    return (
      <div style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 6, padding: 10, marginTop: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
          Aperçu — tableau croisé
        </div>
        {arts.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
            Sélectionnez des articles pour voir les colonnes.
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--text)' }}>
            {arts.length} colonne{arts.length > 1 ? 's' : ''} : {arts.join(', ')}.
            <div style={{ color: 'var(--muted)', marginTop: 4 }}>
              {table.croiseDetail !== false ? 'Lignes par transaction' : 'Totaux uniquement'}
              {table.croiseShowUnits !== false ? ' · montant + unités' : ' · montant'}
              {table.croiseSubtotalsByDay !== false ? ' · sous-totaux par jour' : ''}.
              Le détail complet est rendu dans le PDF.
            </div>
          </div>
        )}
      </div>
    )
  }

  const cols = SOURCE_COLUMNS[table.source] || []
  const activeCols = cols.filter(c =>
    table.fields === null || table.fields === undefined || (table.fields || []).includes(c.key)
  )

  const { rows, sums } = useMemo(
    () => computePreviewData(table, { menuList, spectateursList, reservationsList, transactionsList }),
    [table, menuList, spectateursList, reservationsList, transactionsList]
  )

  const euro = (cents) => (cents / 100).toFixed(2).replace('.', ',') + ' €'
  const total = table.totalRow || {}
  const previewRows = rows.slice(0, 6)

  return (
    <div style={{
      background: '#fff', border: '0.5px solid var(--border)',
      borderRadius: 6, padding: 10, marginTop: 4,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Eye size={12}/> Aperçu ({rows.length} ligne{rows.length > 1 ? 's' : ''})
      </div>
      {activeCols.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>Aucune colonne sélectionnée.</div>
      ) : (
        <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {activeCols.map(c => (
                <th key={c.key} style={{
                  textAlign: c.sum ? 'right' : 'left', padding: '3px 5px',
                  background: 'var(--brand-light)', color: 'var(--brand-dark)',
                  fontWeight: 600, fontSize: 9,
                }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.length === 0 ? (
              <tr><td colSpan={activeCols.length} style={{ padding: '8px 5px', textAlign: 'center', color: 'var(--muted)', fontStyle: 'italic' }}>Aucune donnée</td></tr>
            ) : previewRows.map((row, ri) => (
              <tr key={ri}>
                {activeCols.map(c => (
                  <td key={c.key} style={{
                    padding: '3px 5px', borderTop: '0.5px solid var(--border)',
                    textAlign: c.sum ? 'right' : 'left',
                  }}>{row[c.key] != null ? row[c.key] : '—'}</td>
                ))}
              </tr>
            ))}
            {total.enabled && rows.length > 0 && (
              <tr style={{ fontWeight: 600, background: 'var(--bg)' }}>
                {activeCols.map((c, ci) => {
                  const isSum = (total.columns || []).includes(c.key)
                  const showLabel = ci === 0 && !(total.columns || []).includes(activeCols[0]?.key)
                  return (
                    <td key={c.key} style={{
                      padding: '3px 5px', borderTop: '1px solid var(--border)',
                      textAlign: c.sum ? 'right' : 'left',
                    }}>
                      {isSum ? (sums[c.key] != null ? sums[c.key] : '') : (showLabel ? (total.label || 'Total') : '')}
                    </td>
                  )
                })}
              </tr>
            )}
          </tbody>
        </table>
      )}
      {rows.length > 6 && (
        <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>
          … et {rows.length - 6} ligne(s) de plus dans le PDF.
        </div>
      )}
      <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 6, lineHeight: 1.4, fontStyle: 'italic' }}>
        Estimation calculée en direct. Le PDF généré fait foi.
      </div>
    </div>
  )
}

// Calcule les lignes + sommes d'un tableau custom (miroir JS de _custom_build_data Python)
function computePreviewData(table, stores) {
  const { menuList, spectateursList, reservationsList, transactionsList } = stores
  const euro = (cents) => (cents / 100).toFixed(2).replace('.', ',') + ' €'
  const src = table.source
  const inPeriod = (ts) => {
    const from = table.periodFrom, to = table.periodTo
    if (!from && !to) return true
    if (!ts) return true
    const d = (ts || '').slice(0, 10)
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  }

  if (src === 'articles') {
    const txs = (transactionsList || []).filter(t => inPeriod(t.timestamp))
    const tVentes = txs.filter(t => ['debit','retrait','benev-retrait'].includes(t.type))
      .reduce((s, t) => s + (t.montant || 0), 0)
    let selNames = null
    if (Array.isArray(table.articleSelection)) {
      selNames = new Set(table.articleSelection.map(id => {
        const m = (menuList || []).find(mi => (mi.id || mi.nom) === id)
        return m ? m.nom : id
      }))
    }
    if (Array.isArray(table.categorieSelection)) {
      const allowed = new Set((menuList || []).filter(m => table.categorieSelection.includes(m.cat)).map(m => m.nom))
      selNames = selNames ? new Set([...selNames].filter(n => allowed.has(n))) : allowed
    }
    const amap = {}
    for (const t of txs) for (const i of (t.items || [])) {
      const k = i.nom || ''
      if (selNames && !selNames.has(k)) continue
      if (!amap[k]) amap[k] = { nom: k, qty: 0, ca: 0 }
      amap[k].qty += i.qty || 1
      amap[k].ca += i.total != null ? i.total : (i.prixUnit || 0) * (i.qty || 1)
    }
    const topN = parseInt(table.topN) || 20
    const top = Object.values(amap).sort((a, b) => b.ca - a.ca).slice(0, topN)
    const rows = top.map((a, idx) => {
      const mi = (menuList || []).find(m => m.nom === a.nom) || {}
      return {
        rank: `#${idx + 1}`, nom: a.nom, qty: String(a.qty), ca: euro(a.ca),
        pct: tVentes ? `${(a.ca / tVentes * 100).toFixed(1)}%` : '—', stock: String(mi.stock ?? '—'),
      }
    })
    const sums = {
      qty: String(top.reduce((s, a) => s + a.qty, 0)),
      ca: euro(top.reduce((s, a) => s + a.ca, 0)),
    }
    return { rows, sums }
  }

  if (src === 'spectateurs') {
    let specs = [...(spectateursList || [])]
    if (Array.isArray(table.spectateurSelection)) {
      const ss = new Set(table.spectateurSelection)
      specs = specs.filter(s => ss.has(s.id))
    }
    specs.sort((a, b) => (b.solde || 0) - (a.solde || 0))
    const txs = transactionsList || []
    let tSolde = 0, tNb = 0, tRech = 0, tDep = 0
    const rows = specs.map(s => {
      const mytx = txs.filter(t => t.specId === s.id)
      const cr = mytx.filter(t => t.type === 'credit').reduce((x, t) => x + (t.montant || 0), 0)
      const dp = mytx.filter(t => ['debit','retrait'].includes(t.type)).reduce((x, t) => x + (t.montant || 0), 0)
      tSolde += s.solde || 0; tNb += mytx.length; tRech += cr; tDep += dp
      return { id: s.id, nom: s.nom, solde: euro(s.solde || 0), nb_tx: String(mytx.length), recharge: euro(cr), depense: euro(dp) }
    })
    return { rows, sums: { solde: euro(tSolde), nb_tx: String(tNb), recharge: euro(tRech), depense: euro(tDep) } }
  }

  if (src === 'benevoles') {
    let br = (reservationsList || []).filter(r => r.isBenev && r.status === 'collected' && inPeriod(r.timestamp))
    if (Array.isArray(table.benevoleSelection)) {
      const ss = new Set(table.benevoleSelection)
      br = br.filter(r => ss.has(r.benevoleId))
    }
    let tot = 0
    const rows = br.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(r => {
      const items = (r.items || []).map(it => `${it.nom} x${it.qty || 1}`).join(', ').slice(0, 25)
      const mt = r.total || (r.items || []).reduce((s, it) => s + (it.prix || 0) * (it.qty || 1), 0)
      tot += mt
      return { nom: r.benevoleNom || '—', code: r.code || '—', type: 'Résa bénévole', total: euro(mt), items, date: r.date || '—' }
    })
    return { rows, sums: { total: euro(tot) } }
  }

  if (src === 'reservations') {
    let rs = [...(reservationsList || [])]
    let tot = 0
    const rows = rs.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(r => {
      const items = (r.items || []).map(it => `${it.nom} x${it.qty || 1}`).join(', ').slice(0, 25)
      const mt = r.total || (r.items || []).reduce((s, it) => s + (it.prix || 0) * (it.qty || 1), 0)
      tot += mt
      return {
        code: r.code || '—', who: r.benevoleNom || r.specNom || '—',
        type: r.isBenev ? 'Bénévole' : 'Spectateur', items, total: euro(mt),
        status: r.status || '—', date: r.date || '—',
      }
    })
    return { rows, sums: { total: euro(tot) } }
  }

  if (src === 'transactions') {
    let txs = (transactionsList || []).filter(t => inPeriod(t.timestamp))
    if ((table.txTypes || []).length) txs = txs.filter(t => table.txTypes.includes(t.type))
    let tot = 0
    const rows = txs.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')).map(t => {
      tot += t.montant || 0
      return {
        date: t.date || '—', heure: t.heure || '—', type: t.type || '—',
        who: t.benevoleNom || t.specNom || '—', label: t.label || '—',
        montant: euro(t.montant || 0), staff: t.staff || '—',
      }
    })
    return { rows, sums: { montant: euro(tot) } }
  }

  return { rows: [], sums: {} }
}
