/**
 * pages/admin/Transactions.jsx — v3
 * Super admin : voir et supprimer des transactions individuelles
 * Tableau du design system (cartes sur mobile), suppression confirmée par appui long.
 */
import React, { useState } from 'react'
import clsx from 'clsx'
import useAppStore from '../../store/useAppStore'
import useAuthStore from '../../store/useAuthStore'
import { fmt } from '../../utils/helpers'
import { Trash2, Receipt } from 'lucide-react'
import { db } from '../../firebase/config'
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore'
import useEventStore from '../../store/useEventStore'
import { Button, Badge, Table, Empty, Dialog, HoldButton, toast } from '../../ui'
import s from './transactions/transactions.module.css'

const TYPE_LABEL = { credit: 'Crédit', debit: 'Débit', reservation: 'Réservation', annulation: 'Annulation', 'benev-reservation': 'Résa bénévole', 'benev-retrait': 'Retrait bénévole', 'benev-annulation': 'Annul. bénévole', 'artist-gift': 'Avantage artiste' }
const TYPE_TONE  = { credit: 'brand', debit: 'danger', reservation: 'warning', annulation: 'neutral', 'benev-reservation': 'warning', 'benev-retrait': 'brand', 'benev-annulation': 'neutral', 'artist-gift': 'coral' }
// Types affichés sans signe (ni + ni −)
const NO_SIGN = ['reservation','benev-reservation','annulation','benev-annulation','benev-retrait','artist-gift']

export default function Transactions() {
  const { logs, spectateurs } = useAppStore()
  const { user }              = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const { currentEventId } = useEventStore()

  const [deleting, setDeleting] = useState(null)
  const [visible,  setVisible]  = useState(50)
  const [pending,  setPending]  = useState(null)   // transaction à supprimer (remplace window.confirm)

  const specMap = Object.fromEntries(spectateurs.map(s => [s.id, s.nom]))
  const allTx   = (logs || []).map((t, i) => ({ ...t, _k: i, snom: t.benevoleNom || specMap[t.specId] || t.specNom || t.specId || '—' }))

  const handleDelete = async (tx) => {
    setPending(null)
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
      toast.success('Transaction supprimée')
    } catch (e) { toast.error('Suppression impossible : ' + e.message) }
    finally { setDeleting(null) }
  }

  if (!allTx.length) return <Empty icon={Receipt} title="Aucune transaction enregistrée">Les recharges, achats et réservations apparaîtront ici.</Empty>

  const sign = (t) => t.type === 'credit' ? '+' : NO_SIGN.includes(t.type) ? '' : '−'

  const columns = [
    { key: 'snom',  label: 'Spectateur', card: 'title', render: t => <span className={s.ellipsis}>{t.snom}</span> },
    { key: 'montant', label: 'Montant', align: 'right', render: t => (
      <span className={clsx(s.amount, s[`amt_${TYPE_TONE[t.type] || 'neutral'}`])}>{sign(t)}{fmt(t.montant || 0)}</span>
    ) },
    { key: 'date',  label: 'Date', render: t => <span className={s.date}>{t.date}</span> },
    { key: 'type',  label: 'Type', render: t => <Badge tone={TYPE_TONE[t.type] || 'neutral'}>{TYPE_LABEL[t.type] || t.type}</Badge> },
    { key: 'label', label: 'Détail', render: t => <span className={s.ellipsis}>{t.label}</span> },
    { key: 'staff', label: 'Staff', render: t => <span className={s.muted}>{t.staff || '—'}</span> },
    isAdmin && { key: 'del', label: '', align: 'right', render: t => (
      <Button variant="danger" size="sm" icon={Trash2} iconOnly aria-label={`Supprimer la transaction ${t.label}`}
        loading={deleting === (t._docId || t.id)} disabled={!!deleting}
        className={s.delBtn} onClick={() => setPending(t)}/>
    ) },
  ]

  return (
    <div className={s.page}>
      <Table columns={columns} rows={allTx.slice(0, visible)} rowKey="_k"/>

      {/* Pagination */}
      {(allTx.length > 10) && (
        <div className={s.pager}>
          <span className={s.muted}>{Math.min(visible, allTx.length)} / {allTx.length} transactions</span>
          {visible < allTx.length && (
            <Button variant="secondary" size="sm" onClick={() => setVisible(v => v + 50)}>Afficher 50 de plus</Button>
          )}
          {visible < allTx.length && (
            <Button variant="ghost" size="sm" onClick={() => setVisible(allTx.length)}>Tout afficher ({allTx.length})</Button>
          )}
          {visible > 10 && (
            <Button variant="ghost" size="sm" onClick={() => setVisible(10)}>Afficher moins</Button>
          )}
        </div>
      )}

      {/* Confirmation de suppression (irréversible) */}
      <Dialog open={!!pending} onClose={() => setPending(null)} title="Supprimer cette transaction ?"
        footer={<>
          <Button variant="secondary" onClick={() => setPending(null)}>Annuler</Button>
          <HoldButton tone="danger" icon={Trash2} onConfirm={() => handleDelete(pending)}>Maintenir pour supprimer</HoldButton>
        </>}>
        {pending && (
          <div className={s.dialogStack}>
            <p className={s.dialogText}><b>{pending.label}</b> — {fmt(pending.montant || 0)}</p>
            <p className={s.muted}>{pending.snom} · {pending.date}. Cette action est irréversible.</p>
          </div>
        )}
      </Dialog>
    </div>
  )
}
