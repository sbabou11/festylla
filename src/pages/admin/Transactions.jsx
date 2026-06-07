/**
 * pages/admin/Transactions.jsx — v2
 * Super admin : voir et supprimer des transactions individuelles
 */
import React, { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import useAppStore from '../../store/useAppStore'
import useAuthStore from '../../store/useAuthStore'
import { fmt } from '../../utils/helpers'
import { Trash2, ArrowUp, ArrowDown, Search, X } from 'lucide-react'
import { db } from '../../firebase/config'
import { collection, query, where, getDocs, deleteDoc } from 'firebase/firestore'
import useEventStore from '../../store/useEventStore'

const normalize = (s) => (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function Transactions() {
  const { logs, spectateurs } = useAppStore()
  const { user }              = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const { currentEventId } = useEventStore()

  const [deleting, setDeleting] = useState(null)
  const [visible,  setVisible]  = useState(50)
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

  const allTx = filteredLogs.map(t => ({ ...t, snom: t.benevoleNom || specMap[t.specId] || t.specNom || t.specId || '—' }))

  const typeLabel = { credit: 'Crédit', debit: 'Débit', reservation: 'Réservation', annulation: 'Annulation', 'benev-reservation': 'Résa bénévole', 'benev-retrait': 'Retrait bénévole', 'benev-annulation': 'Annul. bénévole', 'artist-gift': 'Avantage artiste' }
  const typeColor = { credit: 'var(--brand-dark)', debit: 'var(--red)', reservation: 'var(--amber)', annulation: 'var(--purple)', 'benev-reservation': 'var(--amber)', 'benev-retrait': 'var(--brand-dark)', 'benev-annulation': 'var(--purple)', 'artist-gift': '#7c3aed' }
  const typeBg    = { credit: 'var(--brand-light)', debit: 'var(--red-light)', reservation: 'var(--amber-light)', annulation: 'var(--purple-light)', 'benev-reservation': 'var(--amber-light)', 'benev-retrait': 'var(--brand-light)', 'benev-annulation': 'var(--purple-light)', 'artist-gift': '#ede9fe' }

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
        case 'type':       return normalize(typeLabel[t.type] || t.type)
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

  // Bascule le tri sur une colonne
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'date' || key === 'montant' ? 'desc' : 'asc') }
  }
  const resetFilters = () => { setSearchDetail(''); setFilterType(''); setFilterStaff('') }
  const hasFilters = searchDetail || filterType || filterStaff

  const handleDelete = async (tx) => {
    if (!window.confirm(`Supprimer cette transaction ?\n${tx.label} — ${fmt(tx.montant || 0)}`)) return
    setDeleting(tx._docId || tx.id)
    try {
      // Chercher le document par specId + date (Firebase n'expose pas le docId dans les logs)
      const txCollection = currentEventId
        ? collection(db, 'events', currentEventId, 'transactions')
        : collection(db, 'transactions')
      // Chercher par label + date (identifiants uniques fiables)
      const q = query(txCollection, where('label', '==', tx.label), where('date', '==', tx.date))
      const snap = await getDocs(q)
      if (snap.empty) throw new Error('Transaction introuvable dans Firestore')
      for (const d of snap.docs) await deleteDoc(d.ref)
    } catch (e) { alert('Erreur : ' + e.message) }
    finally { setDeleting(null) }
  }

  if (!allTx.length) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
      {isAdmin
        ? 'Aucune transaction enregistrée.'
        : "Vous n'avez encore effectué aucune transaction."}
    </div>
  )


  return (
    <div>
      {/* Barre de filtres */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}/>
          <input
            value={searchDetail}
            onChange={e => setSearchDetail(e.target.value)}
            placeholder="Rechercher dans le détail…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '7px 28px', fontSize: 12, border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', outline: 'none' }}/>
          {searchDetail && (
            <button onClick={() => setSearchDetail('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}>
              <X size={13}/>
            </button>
          )}
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          style={{ padding: '7px 10px', fontSize: 12, border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', cursor: 'pointer' }}>
          <option value="">Tous les types</option>
          {typeOptions.map(t => <option key={t} value={t}>{typeLabel[t] || t}</option>)}
        </select>
        {isAdmin && staffOptions.length > 0 && (
          <select value={filterStaff} onChange={e => setFilterStaff(e.target.value)}
            style={{ padding: '7px 10px', fontSize: 12, border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', cursor: 'pointer' }}>
            <option value="">Tout le staff</option>
            {staffOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {hasFilters && (
          <button onClick={resetFilters}
            style={{ padding: '7px 12px', fontSize: 12, border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg2)', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <X size={12}/> Réinitialiser
          </button>
        )}
      </div>

      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', minWidth: isAdmin ? 560 : 500, fontSize: 12, borderCollapse: 'collapse', background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <thead>
          <tr>
            {[
              { key: 'date', label: 'Date' },
              { key: 'spectateur', label: 'Spectateur' },
              { key: 'type', label: 'Type' },
              { key: 'label', label: 'Détail' },
              { key: 'montant', label: 'Montant' },
              { key: 'staff', label: 'Staff' },
              ...(isAdmin ? [{ key: '', label: '' }] : []),
            ].map(col => (
              <th key={col.label || 'actions'}
                onClick={col.key ? () => toggleSort(col.key) : undefined}
                style={{ textAlign: 'left', padding: '7px 8px', color: 'var(--muted)', borderBottom: '0.5px solid var(--border)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap', cursor: col.key ? 'pointer' : 'default', userSelect: 'none' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  {col.label}
                  {sortKey === col.key && col.key && (
                    sortDir === 'asc' ? <ArrowUp size={11}/> : <ArrowDown size={11}/>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayTx.slice(0, visible).map((t, i) => (
            <tr key={i} style={{ opacity: deleting === (t._docId || t.id) ? 0.4 : 1 }}>
              <td style={{ padding: '8px', borderBottom: '0.5px solid var(--border)', color: 'var(--muted)', fontSize: 11, whiteSpace: 'nowrap' }}>{t.date}</td>
              <td style={{ padding: '8px', borderBottom: '0.5px solid var(--border)', color: 'var(--text)', maxWidth: 130, overflow: 'hidden' }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.snom}</div>
                {t.specId && (
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.specId}>
                    {t.specId}
                  </div>
                )}
              </td>
              <td style={{ padding: '8px', borderBottom: '0.5px solid var(--border)', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: typeBg[t.type] || 'var(--bg2)', color: typeColor[t.type] || 'var(--text)' }}>
                  {typeLabel[t.type] || t.type}
                </span>
              </td>
              <td
                onMouseEnter={(e) => setHoverDetail({ tx: t, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setHoverDetail(h => h ? { ...h, x: e.clientX, y: e.clientY } : h)}
                onMouseLeave={() => setHoverDetail(null)}
                onClick={(e) => setHoverDetail({ tx: t, x: e.clientX, y: e.clientY, pinned: true })}
                style={{ padding: '8px', borderBottom: '0.5px solid var(--border)', color: 'var(--text)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'help' }}
                title={t.label || ''}>
                {t.label || '—'}
              </td>
              <td style={{ padding: '8px', borderBottom: '0.5px solid var(--border)', fontWeight: 600, color: typeColor[t.type] || 'var(--text)', whiteSpace: 'nowrap' }}>
                {t.type === 'credit' ? '+' : ['reservation','benev-reservation','annulation','benev-annulation','benev-retrait','artist-gift'].includes(t.type) ? '' : '−'}
                {fmt(t.montant || 0)}
              </td>
              <td style={{ padding: '8px', borderBottom: '0.5px solid var(--border)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{t.staff || '—'}</td>
              {isAdmin && (
                <td style={{ padding: '8px', borderBottom: '0.5px solid var(--border)' }}>
                  <button onClick={() => handleDelete(t)} disabled={!!deleting}
                    style={{ display: 'flex', alignItems: 'center', padding: '4px 7px', border: '0.5px solid #F09595', borderRadius: 6, background: 'var(--red-light)', color: 'var(--red)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    <Trash2 size={11}/>
                  </button>
                </td>
              )}
            </tr>
          ))}
          {displayTx.length === 0 && (
            <tr><td colSpan={isAdmin ? 7 : 6} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 12, fontStyle: 'italic' }}>
              Aucune transaction ne correspond aux filtres.
            </td></tr>
          )}
        </tbody>
      </table>
      {(displayTx.length > 10) && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'14px 0', flexWrap:'wrap' }}>
          <span style={{ fontSize:12, color:'var(--muted)' }}>
            {Math.min(visible, displayTx.length)} / {displayTx.length} transactions
            {hasFilters ? ` (filtré sur ${allTx.length})` : ''}
          </span>
          {visible < displayTx.length && (
            <button onClick={() => setVisible(v => v + 50)}
              style={{ padding:'7px 18px', border:'0.5px solid var(--brand)', borderRadius:20, background:'var(--brand-light)', color:'var(--brand-dark)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
              Afficher 50 de plus
            </button>
          )}
          {visible < displayTx.length && (
            <button onClick={() => setVisible(displayTx.length)}
              style={{ padding:'7px 18px', border:'0.5px solid var(--muted)', borderRadius:20, background:'transparent', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:'var(--font)' }}>
              Tout afficher ({displayTx.length})
            </button>
          )}
          {visible > 10 && (
            <button onClick={() => setVisible(10)}
              style={{ padding:'7px 18px', border:'0.5px solid var(--border2)', borderRadius:20, background:'var(--bg2)', color:'var(--muted)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
              Afficher moins
            </button>
          )}
        </div>
      )}
      </div>

      {/* Tooltip détail complet (survol ou clic sur la colonne Détail) */}
      {hoverDetail && createPortal(
        <div
          onClick={() => setHoverDetail(null)}
          style={{
            position: 'fixed',
            left: Math.min(hoverDetail.x + 14, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 320),
            top: Math.min(hoverDetail.y + 14, (typeof window !== 'undefined' ? window.innerHeight : 800) - 160),
            zIndex: 9999, maxWidth: 300,
            background: 'var(--bg)', border: '0.5px solid var(--border)',
            borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
            padding: '10px 12px', fontSize: 12, color: 'var(--text)',
            pointerEvents: hoverDetail.pinned ? 'auto' : 'none',
          }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
            Détail de la transaction
          </div>
          <div style={{ lineHeight: 1.5, wordBreak: 'break-word' }}>{hoverDetail.tx.label || '—'}</div>
          {Array.isArray(hoverDetail.tx.items) && hoverDetail.tx.items.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '0.5px solid var(--border)' }}>
              {hoverDetail.tx.items.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11, padding: '1px 0' }}>
                  <span style={{ color: 'var(--text)' }}>{(it.qty || 1)} × {it.nom || '—'}</span>
                  <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmt(it.total || (it.prixUnit || it.prix || 0) * (it.qty || 1))}</span>
                </div>
              ))}
            </div>
          )}
          {hoverDetail.tx.specId && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '0.5px solid var(--border)', fontSize: 10, color: 'var(--muted)' }}>
              ID spectateur : <span style={{ fontFamily: 'monospace' }}>{hoverDetail.tx.specId}</span>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
