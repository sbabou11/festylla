/**
 * pages/admin/Transactions.jsx — v3
 * Super admin : voir et supprimer des transactions individuelles
 * Tableau du design system (cartes sur mobile), suppression confirmée par appui long.
 */
import React, { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import useAppStore from '../../store/useAppStore'
import useAuthStore from '../../store/useAuthStore'
import { fmt } from '../../utils/helpers'
import { friendlyError } from '../../utils/errors'
import { Undo2, Receipt, ArrowUp, ArrowDown, Search, SearchX, X } from 'lucide-react'
import { annulerTransaction } from '../../firebase/service'
import { planAnnulation } from '../../utils/annulationTx'
import { db } from '../../firebase/config'
import useEventStore from '../../store/useEventStore'
import { Button, Badge, Table, Empty, Dialog, HoldButton, toast } from '../../ui'
import s from './transactions/transactions.module.css'

const TYPE_LABEL = { credit: 'Crédit', debit: 'Débit', reservation: 'Réservation', annulation: 'Annulation', 'benev-reservation': 'Résa bénévole', 'benev-retrait': 'Retrait bénévole', 'benev-annulation': 'Annul. bénévole', 'artist-gift': 'Avantage artiste', don: 'Don ONG Ylla' }
const TYPE_TONE  = { credit: 'brand', debit: 'danger', reservation: 'warning', annulation: 'neutral', 'benev-reservation': 'warning', 'benev-retrait': 'brand', 'benev-annulation': 'neutral', 'artist-gift': 'coral', don: 'coral' }
// Types affichés sans signe (ni + ni −)
const NO_SIGN = ['reservation','benev-reservation','annulation','benev-annulation','benev-retrait','artist-gift']

const SORTS = [
  ['date',       'Date'],
  ['spectateur', 'Spectateur'],
  ['type',       'Type'],
  ['label',      'Détail'],
  ['montant',    'Montant'],
  ['staff',      'Staff'],
]

const normalize = (str) => (str || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Transactions({ onNavigate }) {
  const { logs, spectateurs } = useAppStore()
  const { user, canAccessPage } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const { currentEventId } = useEventStore()

  const [deleting, setDeleting] = useState(null)
  const [visible,  setVisible]  = useState(50)
  const [pending,  setPending]  = useState(null)   // transaction à annuler
  const [motifAnnul, setMotifAnnul] = useState('')
  // Filtres & tri
  const [searchDetail, setSearchDetail] = useState('')
  const [filterType, setFilterType]     = useState('')
  const [filterStaff, setFilterStaff]   = useState('')
  const [sortKey, setSortKey]           = useState('date')
  const [sortDir, setSortDir]           = useState('desc') // 'asc' | 'desc'
  const [hoverDetail, setHoverDetail]   = useState(null) // { tx, x, y, pinned }

  const specMap = Object.fromEntries(spectateurs.map(s => [s.id, s.nom]))

  // Filtrage par staff pour les non-admins :
  // billetterie / stand / consultation / etc. ne voient QUE leurs propres opérations.
  // Le matching se fait sur le champ `staff` du log qui contient le nom du membre.
  const myStaffName = (user?.nom || '').trim().toLowerCase()
  const myStaffEmail = (user?.email || '').trim().toLowerCase()
  const filteredLogs = isAdmin
    ? (logs || [])
    : (logs || []).filter(t => {
        const s = (t.staff || '').trim().toLowerCase()
        if (!s) return false
        return s === myStaffName || s === myStaffEmail
      })

  const allTx = filteredLogs.map((t, i) => ({ ...t, _k: i, snom: t.benevoleNom || specMap[t.specId] || t.specNom || t.specId || '—' }))

  // Valeurs distinctes pour les sélecteurs de filtre
  const typeOptions = useMemo(() => [...new Set(allTx.map(t => t.type).filter(Boolean))], [allTx])
  const staffOptions = useMemo(() => [...new Set(allTx.map(t => t.staff).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [allTx])

  // Application des filtres + tri
  const displayTx = useMemo(() => {
    let arr = allTx
    if (searchDetail.trim()) {
      const q = normalize(searchDetail)
      arr = arr.filter(t => normalize(t.label).includes(q))
    }
    if (filterType) arr = arr.filter(t => t.type === filterType)
    if (filterStaff) arr = arr.filter(t => (t.staff || '') === filterStaff)

    const dir = sortDir === 'asc' ? 1 : -1
    const getVal = (t) => {
      switch (sortKey) {
        case 'date':       return t.date || ''
        case 'spectateur': return normalize(t.snom)
        case 'type':       return normalize(TYPE_LABEL[t.type] || t.type)
        case 'label':      return normalize(t.label)
        case 'montant':    return t.montant || 0
        case 'staff':      return normalize(t.staff)
        default:           return ''
      }
    }
    return [...arr].sort((a, b) => {
      const va = getVal(a), vb = getVal(b)
      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      return 0
    })
  }, [allTx, searchDetail, filterType, filterStaff, sortKey, sortDir])

  // Change la colonne de tri (date et montant : du plus grand au plus petit par défaut)
  const changeSort = (key) => { setSortKey(key); setSortDir(key === 'date' || key === 'montant' ? 'desc' : 'asc') }
  // En-tête cliqué : sens par défaut, puis sens inverse, puis retour au tri par date (ordre d'origine)
  const headerSort = (key) => {
    const first = key === 'date' || key === 'montant' ? 'desc' : 'asc'
    if (key !== sortKey) { setSortKey(key); setSortDir(first); return }
    if (sortDir === first) { setSortDir(first === 'asc' ? 'desc' : 'asc'); return }
    setSortKey('date'); setSortDir('desc')
  }
  const resetFilters = () => { setSearchDetail(''); setFilterType(''); setFilterStaff('') }
  const hasFilters = searchDetail || filterType || filterStaff

  // Annulation d'une transaction (20/11/2026) : une seule ligne, désignée par son document ;
  // écriture inverse, solde corrigé, motif obligatoire. L'originale reste, marquée « Annulée ».
  const handleAnnul = async (tx) => {
    const motif = motifAnnul.trim()
    if (!motif) return
    setPending(null)
    setDeleting(tx._docId)
    try {
      await annulerTransaction({ txDocId: tx._docId, motif, staff: user?.nom || 'Administrateur' }, currentEventId)
      toast.success('Transaction annulée, solde corrigé')
    } catch (e) {
      toast.error(friendlyError(e, "La transaction n'a pas été annulée."))
    }
    finally { setDeleting(null); setMotifAnnul('') }
  }
  // Ce que l'annulation fera (ou pourquoi elle est impossible), pour la fenêtre de confirmation
  const apercuAnnul = (tx) => {
    try {
      const plan = planAnnulation(tx)
      const sp = spectateurs.find(x => x.id === tx.specId)
      return { plan, solde: sp ? (sp.solde || 0) : null }
    } catch (e) { return { erreur: e.message } }
  }

  if (!allTx.length) {
    const start = canAccessPage('credit') ? ['credit', 'Créditer un compte'] : canAccessPage('debit') ? ['debit', 'Encaisser une vente'] : null
    return (
      <Empty icon={Receipt} title={isAdmin ? "Aucune transaction pour l'instant" : "Vous n'avez encore effectué aucune transaction"}
        action={start && <Button variant="secondary" onClick={() => onNavigate(start[0])}>{start[1]}</Button>}>
        {isAdmin ? 'Les recharges, achats et réservations apparaîtront ici.' : 'Vos encaissements et recharges apparaîtront ici.'}
      </Empty>
    )
  }

  const sign = (t) => t.type === 'credit' ? '+' : NO_SIGN.includes(t.type) ? '' : '−'

  const columns = [
    { key: 'snom',  label: 'Spectateur', card: 'title', sortKey: 'spectateur', render: t => (
      <>
        <span className={s.ellipsis}>{t.snom}</span>
        {t.specId && <span className={s.specId} title={t.specId}>{t.specId}</span>}
      </>
    ) },
    { key: 'montant', label: 'Montant', align: 'right', sortKey: 'montant', render: t => (
      <span className={clsx(s.amount, s[`amt_${TYPE_TONE[t.type] || 'neutral'}`])}>{sign(t)}{fmt(t.montant || 0)}</span>
    ) },
    { key: 'date',  label: 'Date', sortKey: 'date', render: t => <span className={s.date}>{t.date}</span> },
    { key: 'type',  label: 'Type', sortKey: 'type', render: t => (<>
      <Badge tone={TYPE_TONE[t.type] || 'neutral'}>{TYPE_LABEL[t.type] || (t.type === 'debit_correction' ? 'Correction −' : t.type === 'credit_correction' ? 'Correction +' : t.type)}</Badge>
      {t.annulee && <> <Badge tone="neutral">Annulée</Badge></>}
    </>) },
    // Détail complet au survol, épinglé au clic (lecture au doigt sur mobile)
    { key: 'label', label: 'Détail', sortKey: 'label', render: t => (
      <button type="button" className={clsx(s.ellipsis, s.detail)} title={t.label || ''}
        onMouseEnter={e => setHoverDetail({ tx: t, x: e.clientX, y: e.clientY })}
        onMouseMove={e => setHoverDetail(h => h ? { ...h, x: e.clientX, y: e.clientY } : h)}
        onMouseLeave={() => setHoverDetail(null)}
        onClick={e => setHoverDetail({ tx: t, x: e.clientX, y: e.clientY, pinned: true })}>
        {t.label || '—'}
      </button>
    ) },
    { key: 'staff', label: 'Staff', sortKey: 'staff', render: t => <span className={s.muted}>{t.staff || '—'}</span> },
    isAdmin && { key: 'del', label: '', align: 'right', render: t => (
      t.annulee || t.annuleTx ? null : (
      <Button variant="danger" size="sm" icon={Undo2} iconOnly aria-label={`Annuler la transaction ${t.label}`}
        loading={deleting === t._docId} disabled={!!deleting || !t._docId}
        className={s.delBtn} onClick={() => { setMotifAnnul(''); setPending(t) }}/>
      )
    ) },
  ]


  return (
    <div className={s.page}>
      {/* Barre de filtres et de tri */}
      <div className={s.filters}>
        <div className={s.search}>
          <Search size={15} className={s.searchIcon} aria-hidden="true"/>
          <input type="search" value={searchDetail} onChange={e => setSearchDetail(e.target.value)}
            placeholder="Rechercher dans le détail…" aria-label="Rechercher dans le détail" className={s.searchInput}/>
          {searchDetail && (
            <button type="button" onClick={() => setSearchDetail('')} className={s.clear} aria-label="Effacer la recherche">
              <X size={15}/>
            </button>
          )}
        </div>
        <select className={s.select} value={filterType} onChange={e => setFilterType(e.target.value)} aria-label="Filtrer par type">
          <option value="">Tous les types</option>
          {typeOptions.map(t => <option key={t} value={t}>{TYPE_LABEL[t] || t}</option>)}
        </select>
        {isAdmin && staffOptions.length > 0 && (
          <select className={s.select} value={filterStaff} onChange={e => setFilterStaff(e.target.value)} aria-label="Filtrer par membre du staff">
            <option value="">Tout le staff</option>
            {staffOptions.map(nom => <option key={nom} value={nom}>{nom}</option>)}
          </select>
        )}
        <label className={s.sort}>
          <span className={s.sortLabel}>Trier par</span>
          <select className={s.select} value={sortKey} onChange={e => changeSort(e.target.value)}>
            {SORTS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
          </select>
        </label>
        <Button variant="secondary" size="sm" iconOnly icon={sortDir === 'asc' ? ArrowUp : ArrowDown} className={s.iconBtn}
          aria-label={sortDir === 'asc' ? 'Tri croissant, passer en décroissant' : 'Tri décroissant, passer en croissant'}
          title={sortDir === 'asc' ? 'Tri croissant' : 'Tri décroissant'}
          onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}/>
        {hasFilters && (
          <Button variant="ghost" size="sm" icon={X} onClick={resetFilters}>Réinitialiser</Button>
        )}
      </div>

      <Table columns={columns} rows={displayTx.slice(0, visible)} rowKey="_k"
        sort={{ key: sortKey, dir: sortDir }} onSort={headerSort}
        empty={(
          <Empty icon={SearchX} title="Aucune transaction ne correspond aux filtres"
            action={<Button variant="secondary" onClick={resetFilters}>Réinitialiser les filtres</Button>}/>
        )}/>

      {/* Pagination */}
      {(displayTx.length > 10) && (
        <div className={s.pager}>
          <span className={s.muted}>
            {Math.min(visible, displayTx.length)} / {displayTx.length} transactions
            {hasFilters ? ` (filtré sur ${allTx.length})` : ''}
          </span>
          {visible < displayTx.length && (
            <Button variant="secondary" size="sm" onClick={() => setVisible(v => v + 50)}>Afficher 50 de plus</Button>
          )}
          {visible < displayTx.length && (
            <Button variant="ghost" size="sm" onClick={() => setVisible(displayTx.length)}>Tout afficher ({displayTx.length})</Button>
          )}
          {visible > 10 && (
            <Button variant="ghost" size="sm" onClick={() => setVisible(10)}>Afficher moins</Button>
          )}
        </div>
      )}

      {/* Confirmation de suppression (irréversible) */}
      <Dialog open={!!pending} onClose={() => setPending(null)} title="Annuler cette transaction ?"
        footer={<>
          <Button variant="secondary" onClick={() => setPending(null)}>Garder</Button>
          {pending && !apercuAnnul(pending).erreur && (
            <HoldButton tone="danger" icon={Undo2} disabled={!motifAnnul.trim()} onConfirm={() => handleAnnul(pending)}>Maintenir pour annuler</HoldButton>
          )}
        </>}>
        {pending && (() => {
          const a = apercuAnnul(pending)
          const moyenTxt = { especes: 'en espèces', cb: 'par carte' }
          return (
            <div className={s.dialogStack}>
              <p className={s.dialogText}><b>{pending.label}</b> — {fmt(pending.montant || 0)}</p>
              <p className={s.muted}>{pending.snom} · {pending.date}{pending.heure ? ` à ${String(pending.heure).slice(0, 5)}` : ''}{pending.moyen ? ` · ${pending.moyen}` : ''}{pending.staff ? ` · par ${pending.staff}` : ''}</p>
              {a.erreur ? (
                <p className={s.annulNote} role="alert">{a.erreur}</p>
              ) : (<>
                <p className={s.annulNote}>
                  <b>{a.solde != null
                    ? `Le solde de ${pending.snom} passera de ${fmt(a.solde)} à ${fmt(a.solde + a.plan.delta)}.`
                    : `Le solde de ${pending.snom} ${a.plan.delta > 0 ? 'augmentera' : 'baissera'} de ${fmt(Math.abs(a.plan.delta))}.`}</b>
                  {a.plan.caisse && ` La caisse de ${pending.staff || 'ce bénévole'} attendra ${fmt(pending.montant || 0)} de ${a.plan.caisse.sens === 'moins' ? 'moins' : 'plus'} ${moyenTxt[a.plan.caisse.moyen]}.`}
                </p>
                <p className={s.muted}>La transaction reste dans la liste, marquée « Annulée », avec votre nom. Seule cette ligne est concernée.</p>
                <label className={s.annulField}>
                  <span className={s.annulLabel}>Motif (obligatoire)</span>
                  <input className={s.annulInput} value={motifAnnul} maxLength={120} autoFocus
                    onChange={e => setMotifAnnul(e.target.value)} placeholder="ex : saisie en double"/>
                </label>
              </>)}
            </div>
          )
        })()}
      </Dialog>

      {/* Infobulle détail complet (survol ou clic sur la colonne Détail) */}
      {hoverDetail && createPortal(
        <div
          className={s.tooltip}
          onClick={() => setHoverDetail(null)}
          style={{
            left: Math.min(hoverDetail.x + 14, window.innerWidth - 320),
            top: Math.min(hoverDetail.y + 14, window.innerHeight - 160),
            pointerEvents: hoverDetail.pinned ? 'auto' : 'none',
          }}>
          <div className={s.tooltipTitle}>Détail de la transaction</div>
          <div className={s.tooltipBody}>{hoverDetail.tx.label || '—'}</div>
          {Array.isArray(hoverDetail.tx.items) && hoverDetail.tx.items.length > 0 && (
            <div className={s.tooltipSection}>
              {hoverDetail.tx.items.map((it, idx) => (
                <div key={idx} className={s.tooltipLine}>
                  <span>{(it.qty || 1)} × {it.nom || '—'}</span>
                  <span className={s.tooltipPrice}>{fmt(it.total || (it.prixUnit || it.prix || 0) * (it.qty || 1))}</span>
                </div>
              ))}
            </div>
          )}
          {hoverDetail.tx.specId && (
            <div className={clsx(s.tooltipSection, s.tooltipId)}>
              ID spectateur : <span className={s.mono}>{hoverDetail.tx.specId}</span>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
