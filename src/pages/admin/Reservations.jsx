/**
 * pages/admin/Reservations.jsx — v4
 * Statuts : pending → processing → ready → collected / cancelled
 * Droits  : seul le staff assigné (ou admin) peut changer le statut après processing
 * Annulation (motif) et suppression définitive passent par une fenêtre du design system.
 */
import React, { useState, useMemo } from 'react'
import clsx from 'clsx'
import useAppStore  from '../../store/useAppStore'
import useAuthStore from '../../store/useAuthStore'
import { fmt }      from '../../utils/helpers'
import { friendlyError } from '../../utils/errors'
import { Clock, ChefHat, CheckCircle, Package, XCircle, Trash2, ShoppingBag } from 'lucide-react'
import { Button, Badge, Tabs, Empty, Dialog, HoldButton, Field, focusFirstInvalid } from '../../ui'
import s from './reservations/reservations.module.css'

const STATUTS = {
  pending:    { label: 'En revue',           tone: 'warning', icon: Clock       },
  processing: { label: 'En préparation',     tone: 'coral',   icon: ChefHat     },
  ready:      { label: 'Prête',              tone: 'success', icon: CheckCircle  },
  collected:  { label: 'Retirée',            tone: 'neutral', icon: Package      },
  cancelled:  { label: 'Annulée',            tone: 'danger',  icon: XCircle      },
}

const SORTS = [
  ['date_desc',    'Plus récentes'],
  ['date_asc',     'Plus anciennes'],
  ['statut',       'Statut'],
  ['montant_desc', 'Montant décroissant'],
  ['montant_asc',  'Montant croissant'],
]

// Label dynamique pour les annulations
const getCancelLabel = (resa) => {
  if (resa.status !== 'cancelled') return STATUTS[resa.status]?.label || resa.status
  if (!resa.cancelledBy) return 'Annulée'
  if (resa.cancelledByRole === 'spectateur') return 'Annulée par client'
  if (resa.cancelledByRole === 'admin' || resa.cancelledByRole === 'super_admin') return 'Annulée par Admin'
  if (resa.cancelledByRole === 'stand' || resa.cancelledByRole === 'billetterie') return 'Annulée par Staff'
  return 'Annulée par Staff'
}

const MOTIFS = [
  'Plus en stock',
  'Temporairement indisponible',
  'Autres',
]

export default function Reservations({ onNavigate }) {
  const { reservations, prendreEnCharge, marquerResaPrete, validerRetrait, annulerReservation, deleteReservation, menu } = useAppStore()
  const { user, canAccessPage } = useAuthStore()

  const [filter,     setFilter]     = useState('all')
  const [loading,    setLoading]    = useState(null)
  const [err,        setErr]        = useState('')
  // Modale annulation
  const [annulModal, setAnnulModal] = useState(null)
  const [visible,    setVisible]    = useState(10)
  const [motifIdx,   setMotifIdx]   = useState(0)
  const [motifTexte, setMotifTexte] = useState('')
  const [motifTried, setMotifTried] = useState(false)
  const motifRef = React.useRef(null)
  const [sortBy,     setSortBy]     = useState('date_desc') // date_desc | date_asc | statut | montant_desc | montant_asc

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  const canAct = (resa) => {
    if (isAdmin) return true
    if (resa.status === 'pending') return true
    return resa.assignedStaffId === user?.id
  }

  // Réinitialiser la pagination quand filtre ou tri change
  const prevFilter = React.useRef(filter)
  const prevSort   = React.useRef(sortBy)
  if (prevFilter.current !== filter || prevSort.current !== sortBy) {
    prevFilter.current = filter
    prevSort.current   = sortBy
    setVisible(10)
  }

  const sorted = useMemo(() => {
    const filtered = [...reservations].filter(r => filter === 'all' || r.status === filter)
    return filtered.sort((a, b) => {
      if (sortBy === 'date_desc') {
        const ta = a.createdAt?.seconds || new Date(a.date || 0).getTime()/1000
        const tb = b.createdAt?.seconds || new Date(b.date || 0).getTime()/1000
        return tb - ta
      }
      if (sortBy === 'date_asc') {
        const ta = a.createdAt?.seconds || new Date(a.date || 0).getTime()/1000
        const tb = b.createdAt?.seconds || new Date(b.date || 0).getTime()/1000
        return ta - tb
      }
      if (sortBy === 'statut') {
        const order = { pending:0, processing:1, ready:2, collected:3, cancelled:4 }
        return (order[a.status]??5) - (order[b.status]??5)
      }
      if (sortBy === 'montant_desc') return (b.total||0) - (a.total||0)
      if (sortBy === 'montant_asc')  return (a.total||0) - (b.total||0)
      return 0
    })
  }, [reservations, filter, sortBy])

  const act = async (fn, id, whatFailed) => {
    setLoading(id); setErr('')
    try { await fn() }
    catch (e) { setErr(friendlyError(e, whatFailed)) }
    finally { setLoading(null) }
  }

  const doAnnuler = async () => {
    if (motifIdx === 2 && !motifTexte.trim()) { setMotifTried(true); focusFirstInvalid(motifRef.current); return }
    const motif = motifIdx === 2 ? (motifTexte.trim() || 'Autres') : MOTIFS[motifIdx]
    setLoading(annulModal); setErr('')
    try {
      await annulerReservation(annulModal, motif)
      setAnnulModal(null); setMotifIdx(0); setMotifTexte(''); setMotifTried(false)
    } catch (e) { setErr(friendlyError(e, "La réservation n'a pas été annulée.")) }
    finally { setLoading(null) }
  }

  // Suppression définitive (remplace window.confirm)
  const [pendingDel, setPendingDel] = useState(null)  // réservation à supprimer
  const confirmDelete = async () => {
    const resa = pendingDel
    setPendingDel(null)
    if (resa) await act(() => deleteReservation(resa.id), resa.id, "La réservation n'a pas été supprimée.")
  }

  const closeAnnul = () => { setAnnulModal(null); setErr(''); setMotifTried(false) }

  // Total affiché : celui de la résa, sinon recalculé depuis les articles (résa bénévole)
  const totalOf = (resa) => {
    if (resa.total && !isNaN(resa.total)) return fmt(resa.total)
    const total = (resa.items||[]).reduce((acc, item) => {
      const menuItem = menu.find(m => m.id === item.id)
      return acc + ((menuItem?.prix || item.prix || 0) * (item.qty || 1))
    }, 0)
    return total > 0 ? fmt(total) : '—'
  }

  return (
    <div className={s.page}>
      {/* Filtres + tri */}
      <div className={s.toolbar}>
        <Tabs
          label="Filtrer par statut"
          size="sm"
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'all', label: 'Toutes' },
            ...Object.entries(STATUTS).map(([k, v]) => ({ value: k, label: v.label, count: reservations.filter(r => r.status === k).length })),
          ]}
        />
        <label className={s.sort}>
          <span className={s.sortLabel}>Trier par</span>
          <select className={s.select} value={sortBy} onChange={e => setSortBy(e.target.value)}>
            {SORTS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
          </select>
        </label>
      </div>

      {err && !annulModal && <div className={s.error} role="alert">{err}</div>}

      {reservations.length === 0 && (
        <div className={s.firstRun}>
          {/* Billet fantôme : montre à quoi ressemblera une réservation */}
          <div className={s.ghost} aria-hidden="true">
            <div className={s.ghostHead}><span className={s.ghostTag}>Exemple</span><span>#A42</span></div>
            <div className={s.ghostName}>Camille</div>
            <div>Bière ×2, Frites</div>
          </div>
          <Empty icon={ShoppingBag} title="Aucune réservation pour l'instant"
            action={canAccessPage('menu') && <Button variant="secondary" onClick={() => onNavigate('menu')}>Vérifier la carte</Button>}>
            Les commandes passées depuis la carte par les spectateurs apparaîtront ici.
          </Empty>
        </div>
      )}
      {reservations.length > 0 && sorted.length === 0 && (
        <Empty icon={STATUTS[filter]?.icon || ShoppingBag} title={`Aucune réservation « ${STATUTS[filter]?.label || filter} »`}
          action={<Button variant="secondary" onClick={() => setFilter('all')}>Effacer le filtre</Button>}>
          Les réservations à ce statut apparaîtront ici.
        </Empty>
      )}

      <div className={clsx(s.list, 'yc-stagger')}>
        {sorted.slice(0, visible).map(resa => {
          const st   = STATUTS[resa.status] || STATUTS.pending
          const cancelLabel = getCancelLabel(resa)
          const can  = canAct(resa)
          const items = (resa.items||[]).map(i => i.nom + (i.qty>1?` ×${i.qty}`:'')).join(', ')
          const isLoading = loading === resa.id

          return (
            <article key={resa.id} className={s.card}>
              {/* En-tête */}
              <div className={s.head}>
                <div className={s.headLeft}>
                  <Badge tone={st.tone} icon={st.icon}>{resa.status === 'cancelled' ? cancelLabel : st.label}</Badge>
                  <span className={s.code}>#{resa.code}</span>
                </div>
                <span className={s.date}>{resa.date}</span>
              </div>

              {/* Infos */}
              <div className={s.info}>
                <div className={s.nameRow}>
                  <span className={s.name}>{resa.benevoleNom || resa.specNom}</span>
                  {resa.isBenev && <Badge tone="coral">Bénévole</Badge>}
                </div>
                <div className={s.items}>{items}</div>
                <div className={s.total}>{totalOf(resa)}</div>
                {resa.assignedStaff && resa.status !== 'pending' && (
                  <div className={s.assigned}>
                    <ChefHat size={13} aria-hidden="true"/> Pris en charge par <strong>{resa.assignedStaff}</strong>
                  </div>
                )}
                {resa.status === 'cancelled' && resa.motifAnnulation && (
                  <div className={s.motif}>Motif : {resa.motifAnnulation}</div>
                )}
              </div>

              {/* Actions */}
              <div className={s.actions}>
                {/* Pending → Prendre en charge ou Annuler */}
                {resa.status === 'pending' && (
                  <>
                    <Button variant="coral" size="sm" icon={ChefHat} loading={isLoading}
                      onClick={() => act(() => prendreEnCharge(resa.id), resa.id, "La prise en charge n'est pas passée.")}>Prendre en charge</Button>
                    <Button variant="danger" size="sm" icon={XCircle} onClick={() => setAnnulModal(resa.id)}>Annuler</Button>
                  </>
                )}

                {/* Processing → Marquer prête ou Annuler (si droits) */}
                {resa.status === 'processing' && can && (
                  <>
                    <Button size="sm" icon={CheckCircle} loading={isLoading}
                      onClick={() => act(() => marquerResaPrete(resa.id), resa.id, "La réservation n'a pas été marquée prête.")}>Marquer prête</Button>
                    <Button variant="danger" size="sm" icon={XCircle} onClick={() => setAnnulModal(resa.id)}>Annuler</Button>
                  </>
                )}

                {/* Processing mais pas les droits */}
                {resa.status === 'processing' && !can && (
                  <p className={s.locked}>En charge par {resa.assignedStaff} — vous ne pouvez pas modifier</p>
                )}

                {/* Ready → Valider retrait */}
                {resa.status === 'ready' && can && (
                  <Button size="sm" icon={Package} loading={isLoading}
                    onClick={() => act(() => validerRetrait(resa.id), resa.id, "Le retrait n'a pas été validé.")}>Valider le retrait</Button>
                )}

                {/* Supprimer (admin uniquement, après annulation ou retrait) */}
                {isAdmin && (resa.status === 'cancelled' || resa.status === 'collected') && (
                  <Button variant="ghost" size="sm" icon={Trash2} loading={isLoading} className={s.deleteBtn}
                    onClick={() => setPendingDel(resa)}>Supprimer</Button>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {/* Pagination */}
      {sorted.length > 10 && (
        <div className={s.pager}>
          <span className={s.muted}>{Math.min(visible, sorted.length)} / {sorted.length} réservations</span>
          {visible < sorted.length && (
            <Button variant="secondary" size="sm" onClick={() => setVisible(v => v + 10)}>Afficher 10 de plus</Button>
          )}
          {visible > 10 && (
            <Button variant="ghost" size="sm" onClick={() => setVisible(10)}>Afficher moins</Button>
          )}
        </div>
      )}

      {/* Annulation : choix du motif */}
      <Dialog open={!!annulModal} onClose={closeAnnul} title="Motif d'annulation"
        footer={<>
          <Button variant="secondary" onClick={closeAnnul}>Retour</Button>
          <Button variant="danger" icon={XCircle} onClick={doAnnuler} loading={loading === annulModal}>
            Confirmer l’annulation
          </Button>
        </>}>
        <div ref={motifRef} className={s.dialogStack}>
          <div className={s.motifs} role="radiogroup" aria-label="Motif">
            {MOTIFS.map((m, i) => (
              <label key={i} className={clsx(s.motifOpt, motifIdx === i && s.motifOn)}>
                <input type="radio" name="resa-motif" checked={motifIdx===i} onChange={() => setMotifIdx(i)}/>
                <span>{m}</span>
              </label>
            ))}
          </div>

          {motifIdx === 2 && (
            <Field label={<span className={s.label}>Précise le motif</span>}
              error={motifTexte.trim() ? null : "Indique le motif de l'annulation"} valid={!!motifTexte.trim()} showError={motifTried}>
              <textarea id="resa-motif-texte" value={motifTexte} rows={3} autoFocus
                onChange={e => setMotifTexte(e.target.value)} placeholder="Précise le motif…"/>
            </Field>
          )}

          {err && <div className={s.error} role="alert">{err}</div>}
        </div>
      </Dialog>

      {/* Suppression définitive (irréversible) */}
      <Dialog open={!!pendingDel} onClose={() => setPendingDel(null)} title="Supprimer cette réservation ?"
        footer={<>
          <Button variant="secondary" onClick={() => setPendingDel(null)}>Annuler</Button>
          <HoldButton tone="danger" icon={Trash2} onConfirm={confirmDelete}>Maintenir pour supprimer</HoldButton>
        </>}>
        <p className={s.dialogText}>
          La réservation <b>#{pendingDel?.code}</b> sera supprimée définitivement. Cette action est irréversible.
        </p>
      </Dialog>
    </div>
  )
}
