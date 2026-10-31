/**
 * pages/admin/Transactions.jsx — v2
 * Super admin : voir et supprimer des transactions individuelles
 */
import React, { useState } from 'react'
import useAppStore from '../../store/useAppStore'
import useAuthStore from '../../store/useAuthStore'
import { fmt } from '../../utils/helpers'
import { Trash2 } from 'lucide-react'
import { db } from '../../firebase/config'
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore'
import useEventStore from '../../store/useEventStore'

export default function Transactions() {
  const { logs, spectateurs } = useAppStore()
  const { user }              = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const { currentEventId } = useEventStore()

  const [deleting, setDeleting] = useState(null)
  const [visible,  setVisible]  = useState(50)

  const specMap = Object.fromEntries(spectateurs.map(s => [s.id, s.nom]))
  const allTx   = (logs || []).map(t => ({ ...t, snom: t.benevoleNom || specMap[t.specId] || t.specNom || t.specId || '—' }))

  const typeLabel = { credit: 'Crédit', debit: 'Débit', reservation: 'Réservation', annulation: 'Annulation', 'benev-reservation': 'Résa bénévole', 'benev-retrait': 'Retrait bénévole', 'benev-annulation': 'Annul. bénévole', 'artist-gift': 'Avantage artiste' }
  const typeColor = { credit: 'var(--brand-dark)', debit: 'var(--red)', reservation: 'var(--amber)', annulation: 'var(--purple)', 'benev-reservation': 'var(--amber)', 'benev-retrait': 'var(--brand-dark)', 'benev-annulation': 'var(--purple)', 'artist-gift': '#7c3aed' }
  const typeBg    = { credit: 'var(--brand-light)', debit: 'var(--red-light)', reservation: 'var(--amber-light)', annulation: 'var(--purple-light)', 'benev-reservation': 'var(--amber-light)', 'benev-retrait': 'var(--brand-light)', 'benev-annulation': 'var(--purple-light)', 'artist-gift': '#ede9fe' }

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
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Aucune transaction enregistrée.</div>
  )

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', minWidth: isAdmin ? 560 : 500, fontSize: 12, borderCollapse: 'collapse', background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <thead>
          <tr>
            {['Date', 'Spectateur', 'Type', 'Détail', 'Montant', 'Staff', ...(isAdmin ? [''] : [])].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '7px 8px', color: 'var(--muted)', borderBottom: '0.5px solid var(--border)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allTx.slice(0, visible).map((t, i) => (
            <tr key={i} style={{ opacity: deleting === (t._docId || t.id) ? 0.4 : 1 }}>
              <td style={{ padding: '8px', borderBottom: '0.5px solid var(--border)', color: 'var(--muted)', fontSize: 11, whiteSpace: 'nowrap' }}>{t.date}</td>
              <td style={{ padding: '8px', borderBottom: '0.5px solid var(--border)', color: 'var(--text)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.snom}</td>
              <td style={{ padding: '8px', borderBottom: '0.5px solid var(--border)', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: typeBg[t.type] || 'var(--bg2)', color: typeColor[t.type] || 'var(--text)' }}>
                  {typeLabel[t.type] || t.type}
                </span>
              </td>
              <td style={{ padding: '8px', borderBottom: '0.5px solid var(--border)', color: 'var(--text)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</td>
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
        </tbody>
      </table>
      {/* Pagination */}
      {(allTx.length > 10) && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'14px 0', flexWrap:'wrap' }}>
          <span style={{ fontSize:12, color:'var(--muted)' }}>
            {Math.min(visible, allTx.length)} / {allTx.length} transactions
          </span>
          {visible < allTx.length && (
            <button onClick={() => setVisible(v => v + 50)}
              style={{ padding:'7px 18px', border:'0.5px solid var(--brand)', borderRadius:20, background:'var(--brand-light)', color:'var(--brand-dark)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
              Afficher 50 de plus
            </button>
          )}
          {visible < allTx.length && (
            <button onClick={() => setVisible(allTx.length)}
              style={{ padding:'7px 18px', border:'0.5px solid var(--muted)', borderRadius:20, background:'transparent', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:'var(--font)' }}>
              Tout afficher ({allTx.length})
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
  )
}
