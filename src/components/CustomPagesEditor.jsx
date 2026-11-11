/**
 * components/CustomPagesEditor.jsx — Lot Custom B1
 *
 * Éditeur de pages personnalisées pour le rapport de clôture.
 * Chaque page : { id, titre, sousTitre, position, tables: [{ source, titre, ...filtres, fields, totalRow }] }
 * B1 : 1 tableau par page, 5 sources, aperçu temps réel des vraies données.
 * onChange(pages) remonte la liste complète ; l'enregistrement (automatique) est fait par le parent.
 *
 * L'aperçu est calculé en JS (estimation fidèle alignée sur la logique Python).
 * Le PDF reste la source de vérité.
 */
import React, { useState, useMemo } from 'react'
import { Plus, Trash2, ArrowUp, ArrowDown, FileText, Eye, Table2, Copy } from 'lucide-react'
import clsx from 'clsx'
import TransferList from './TransferList'
import { Button, Dialog } from '../ui'
import s from './CustomPagesEditor.module.css'

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
  // Page dont la suppression attend confirmation (remplace window.confirm)
  const [pendingRemove, setPendingRemove] = useState(null)

  const addPage = () => {
    const p = newPage()
    onChange([...(pages || []), p])
    setExpandedPage(p.id)
  }
  const removePage = (id) => setPendingRemove(id)
  const confirmRemove = () => {
    const id = pendingRemove
    setPendingRemove(null)
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

  const pendingTitre = (pages || []).find(p => p.id === pendingRemove)?.titre

  return (
    <div>
      <div className={s.top}>
        <div className={s.intro}>
          Ajoutez des pages sur mesure avec leurs propres tableaux, insérées entre les sections standard.
        </div>
        <button type="button" className={s.addBtn} onClick={addPage}>
          <Plus size={13}/> Ajouter une page
        </button>
      </div>

      {(pages || []).length === 0 && (
        <div className={s.empty}>
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

      <Dialog open={!!pendingRemove} onClose={() => setPendingRemove(null)} title="Supprimer cette page personnalisée ?"
        footer={<>
          <Button variant="secondary" onClick={() => setPendingRemove(null)}>Annuler</Button>
          <Button variant="danger" icon={Trash2} onClick={confirmRemove}>Supprimer</Button>
        </>}>
        {pendingTitre ? <>La page « {pendingTitre} » sera retirée du rapport.</> : 'La page sera retirée du rapport.'}
      </Dialog>
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
    <div className={s.card}>
      {/* En-tête */}
      <div className={clsx(s.cardHead, expanded && s.cardHeadOpen)} onClick={onToggle}>
        <FileText size={15} className={s.cardIcon}/>
        <div className={s.grow}>
          <div className={s.cardTitle}>
            {page.titre || 'Page sans titre'}
          </div>
          <div className={s.cardMeta}>
            {SOURCE_META[table.source]?.icon} {SOURCE_META[table.source]?.label} · {posLabel}
          </div>
        </div>
        <div className={s.cardTools} onClick={e => e.stopPropagation()}>
          <button type="button" className={s.iconBtn} onClick={() => onMove(-1)} disabled={index === 0}
            aria-label="Monter"><ArrowUp size={13}/></button>
          <button type="button" className={s.iconBtn} onClick={() => onMove(1)} disabled={index === total - 1}
            aria-label="Descendre"><ArrowDown size={13}/></button>
          <button type="button" className={s.iconBtn} onClick={onDuplicate}
            aria-label="Dupliquer" title="Dupliquer cette page"><Copy size={13}/></button>
          <button type="button" className={clsx(s.iconBtn, s.iconBtnDanger)} onClick={onRemove}
            aria-label="Supprimer"><Trash2 size={13}/></button>
        </div>
      </div>

      {/* Contenu déplié */}
      {expanded && (
        <div className={s.cardBody}>
          {/* Métadonnées de la page */}
          <div className={s.block}>
            <label className={s.label}>Titre de la page</label>
            <input className={s.input} value={page.titre}
              onChange={e => onUpdate({ titre: e.target.value })}
              placeholder="ex: Bilan restauration détaillé"/>
            <label className={clsx(s.label, s.labelSpaced)}>Sous-titre (optionnel)</label>
            <input className={s.input} value={page.sousTitre}
              onChange={e => onUpdate({ sousTitre: e.target.value })}
              placeholder="ex: Ventes par catégorie — service du soir"/>
            <label className={clsx(s.label, s.labelSpaced)}>Position dans le rapport</label>
            <select className={s.input} value={page.position}
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

// Case à cocher compacte
function Check({ checked, onChange, children, className }) {
  return (
    <label className={clsx(s.check, className)}>
      <input type="checkbox" checked={checked} onChange={onChange}/>
      {children}
    </label>
  )
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
    <div className={s.tableEditor}>
      <div className={s.tableEditorTitle}>
        <Table2 size={14}/> Tableau de la page
      </div>

      {/* 1. Source */}
      <div className={s.block}>
        <label className={s.label}>1. Source de données</label>
        <div className={s.sources}>
          {Object.entries(SOURCE_META).map(([key, meta]) => (
            <div key={key} onClick={() => changeSource(key)}
              className={clsx(s.source, table.source === key && s.sourceOn)}>
              <div className={s.sourceIcon}>{meta.icon}</div>
              {meta.label}
            </div>
          ))}
        </div>
      </div>

      {/* 2. Titre tableau */}
      <div className={s.block}>
        <label className={s.label}>2. Titre du tableau (optionnel)</label>
        <input className={s.input} value={table.titre || ''}
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
      <div className={s.block}>
        <label className={s.label}>3. Filtres &amp; sélection précise</label>
        <CustomTableFilters
          table={table} onChange={onChange}
          menuList={menuList} categoriesList={categoriesList}
          spectateursList={spectateursList} reservationsList={reservationsList}
          articleItems={articleItems}
        />
      </div>

      {/* 4. Colonnes */}
      <div className={s.block}>
        <label className={s.label}>4. Colonnes affichées</label>
        <div className={s.checksGrid}>
          {cols.map(c => (
            <Check key={c.key} checked={fieldActive(c.key)} onChange={() => toggleField(c.key)}
              className={!fieldActive(c.key) ? s.muted : undefined}>
              {c.label}
            </Check>
          ))}
        </div>
      </div>

      {/* 5. Ligne de total */}
      <div className={s.block}>
        <label className={s.label}>5. Ligne de total</label>
        <Check checked={!!total.enabled} onChange={e => updateTotal({ enabled: e.target.checked })} className={s.checkLg}>
          Afficher une ligne de total
        </Check>
        {total.enabled && (
          <div className={s.divided}>
            <input className={clsx(s.input, s.mb6)} value={total.label || ''}
              onChange={e => updateTotal({ label: e.target.value })} placeholder="Libellé (ex: Total)"/>
            <select className={clsx(s.input, s.mb6)} value={total.position || 'bottom'}
              onChange={e => updateTotal({ position: e.target.value })}>
              <option value="bottom">En bas du tableau</option>
              <option value="top">En haut du tableau</option>
            </select>
            {summableCols.length > 0 ? (
              <>
                <div className={s.subLabel}>Colonnes à sommer :</div>
                <div className={s.checksGrid}>
                  {summableCols.map(c => (
                    <Check key={c.key} checked={(total.columns || []).includes(c.key)} onChange={() => toggleSumCol(c.key)}>
                      {c.label}
                    </Check>
                  ))}
                </div>
                {/* Sous-totaux par catégorie : articles uniquement */}
                {table.source === 'articles' && (
                  <div className={s.mt8}>
                    <div className={s.subLabel}>Sous-totaux :</div>
                    <select className={s.input} value={total.groupBy || ''}
                      onChange={e => updateTotal({ groupBy: e.target.value || null })}>
                      <option value="">Aucun</option>
                      <option value="categorie">Par catégorie</option>
                    </select>
                  </div>
                )}
              </>
            ) : (
              <div className={s.note}>
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
  const norm = (x) => (x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

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
    <div className={s.block}>
      <label className={s.label}>Colonnes du tableau croisé (articles)</label>

      {/* Articles sélectionnés */}
      <div className={s.chips}>
        {selected.length === 0 && (
          <span className={s.note}>
            Aucun article sélectionné — ajoutez-en ci-dessous.
          </span>
        )}
        {selected.map(n => (
          <span key={n} className={s.chip}>
            {n}
            <span onClick={() => removeArticle(n)} className={s.chipRemove}>✕</span>
          </span>
        ))}
      </div>

      {/* Recherche + ajout */}
      <input className={clsx(s.input, s.mb6)} value={search}
        onChange={e => setSearch(e.target.value)} placeholder="Rechercher un article à ajouter…"/>
      {search && (
        <div className={s.results}>
          {available.length === 0 ? (
            <div className={s.resultsEmpty}>Aucun résultat</div>
          ) : available.map(n => (
            <div key={n} onClick={() => addArticle(n)} className={s.result}>
              {n}
            </div>
          ))}
        </div>
      )}

      {/* Options */}
      <div className={s.options}>
        <Check checked={table.croiseDetail !== false} onChange={e => onChange({ croiseDetail: e.target.checked })} className={s.checkLg}>
          Détailler chaque transaction (sinon totaux uniquement)
        </Check>
        <Check checked={table.croiseShowUnits !== false} onChange={e => onChange({ croiseShowUnits: e.target.checked })} className={s.checkLg}>
          Afficher les unités (en plus du montant)
        </Check>
        <Check checked={table.croiseSubtotalsByDay !== false} onChange={e => onChange({ croiseSubtotalsByDay: e.target.checked })} className={s.checkLg}>
          Sous-totaux par jour (si plusieurs jours)
        </Check>
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
        <div className={s.mb8}>
          <div className={s.subLabel}>Période</div>
          <div className={s.range}>
            <input type="date" className={clsx(s.input, s.grow)} value={table.periodFrom || ''}
              onChange={e => onChange({ periodFrom: e.target.value })}/>
            <span className={s.arrow}>→</span>
            <input type="date" className={clsx(s.input, s.grow)} value={table.periodTo || ''}
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
          items={(spectateursList || []).map(sp => ({ id: sp.id, label: sp.nom || sp.id || '—', meta: sp.id }))}
        />
      )}
      {src === 'benevoles' && (
        <PreciseSelect
          label="Bénévoles" field="benevoleSelection" table={table} onChange={onChange}
          items={uniqueBenevoles(reservationsList)}
        />
      )}
      {src === 'transactions' && (
        <div className={s.hint}>
          Filtres avancés (types, montants) hérités des réglages standard.
        </div>
      )}
      {src === 'reservations' && (
        <div className={s.hint}>
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
    <div className={s.mb8}>
      <div className={clsx(s.subLabel, s.spread)}>
        <span>{label}{active ? ` (${selectedIds.length}/${items.length})` : ''}</span>
        {active
          ? <button type="button" className={s.linkBtn} onClick={() => onChange({ [field]: null })}>tout inclure</button>
          : <button type="button" className={s.linkBtn} onClick={() => onChange({ [field]: [] })}>sélectionner…</button>}
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

// ── Aperçu temps réel du tableau (vraies données, calcul JS) ──
// Reproduit fidèlement la logique Python de _custom_build_data.
// Le PDF reste la source de vérité ; ceci est une estimation à l'écran.
function CustomTablePreview({ table, menuList, spectateursList, reservationsList, transactionsList }) {
  // Aperçu spécifique au tableau croisé
  if (table.source === 'croise') {
    const arts = table.croiseArticles || []
    return (
      <div className={s.preview}>
        <div className={s.previewTitle}>
          Aperçu — tableau croisé
        </div>
        {arts.length === 0 ? (
          <div className={s.note}>
            Sélectionnez des articles pour voir les colonnes.
          </div>
        ) : (
          <div className={s.previewText}>
            {arts.length} colonne{arts.length > 1 ? 's' : ''} : {arts.join(', ')}.
            <div className={s.previewSub}>
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
    <div className={s.preview}>
      <div className={clsx(s.previewTitle, s.previewTitleIcon)}>
        <Eye size={12}/> Aperçu ({rows.length} ligne{rows.length > 1 ? 's' : ''})
      </div>
      {activeCols.length === 0 ? (
        <div className={s.note}>Aucune colonne sélectionnée.</div>
      ) : (
        <table className={s.previewTable}>
          <thead>
            <tr>
              {activeCols.map(c => (
                <th key={c.key} className={c.sum ? s.right : undefined}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.length === 0 ? (
              <tr><td colSpan={activeCols.length} className={s.previewEmpty}>Aucune donnée</td></tr>
            ) : previewRows.map((row, ri) => (
              <tr key={ri}>
                {activeCols.map(c => (
                  <td key={c.key} className={c.sum ? s.right : undefined}>{row[c.key] != null ? row[c.key] : '—'}</td>
                ))}
              </tr>
            ))}
            {total.enabled && rows.length > 0 && (
              <tr className={s.totalRow}>
                {activeCols.map((c, ci) => {
                  const isSum = (total.columns || []).includes(c.key)
                  const showLabel = ci === 0 && !(total.columns || []).includes(activeCols[0]?.key)
                  return (
                    <td key={c.key} className={c.sum ? s.right : undefined}>
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
        <div className={s.previewMore}>
          … et {rows.length - 6} ligne(s) de plus dans le PDF.
        </div>
      )}
      <div className={s.previewFoot}>
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
