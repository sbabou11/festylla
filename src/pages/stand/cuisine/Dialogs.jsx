/**
 * pages/stand/cuisine/Dialogs.jsx — fenêtres d'annulation (avec motif) et de validation du retrait
 * Les parents gardent l'état (commande ciblée, motif) ; ces composants n'appellent aucun service.
 */
import React from 'react'
import clsx from 'clsx'
import { Package, Wallet, Info, AlertCircle } from 'lucide-react'
import { Button, Dialog } from '../../../ui'
import { ticketNumber, euros } from './timing'
import s from './cuisine.module.css'

// Motifs d'annulation prédéfinis (cf. Reservations.jsx pour cohérence)
export const MOTIFS = ['Client n\'est pas revenu', 'Rupture de stock', 'Autres']

const kindLabel = (c) => (c._kind === 'resa' ? 'Réservation' : 'Commande')

function Recap({ commande }) {
  return (
    <div className={s.recap}>
      <span className={s.recapNum}>#{ticketNumber(commande)}</span>
      <div className={s.recapText}>
        <b>{kindLabel(commande)}{commande.code ? ` · ${commande.code}` : ''}</b>
        <span>{commande.specNom || commande.benevoleNom || '—'} · {euros(commande.total)}</span>
      </div>
    </div>
  )
}

function ErrorLine({ err }) {
  if (!err) return null
  return <p className={s.err} role="alert"><AlertCircle size={16} aria-hidden="true" /> <span>{err}</span></p>
}

export function CancelDialog({ commande, motifIdx, setMotifIdx, motifTexte, setMotifTexte, loading, err, onClose, onConfirm, className }) {
  const open = !!commande
  const c = commande || {}
  // Résas : toujours débitées à la création ; commandes : selon `paid`
  const wasPaid = c._kind === 'resa' ? true : !!c.paid
  return (
    <Dialog
      open={open}
      className={className}
      onClose={loading ? undefined : onClose}
      title={c._kind === 'resa' ? 'Annuler la réservation' : 'Annuler la commande'}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={loading} className={s.footSecondary}>Retour</Button>
        <Button variant="danger" onClick={onConfirm} loading={loading} className={s.footMain}>Confirmer l'annulation</Button>
      </>}
    >
      {open && (
        <div className={s.dialogBody}>
          <Recap commande={c} />
          <p className={clsx(s.notice, wasPaid ? s.noticeWarn : s.noticeInfo)}>
            {wasPaid ? <Wallet size={16} aria-hidden="true" /> : <Info size={16} aria-hidden="true" />}
            <span>
              {c._kind === 'resa'
                ? <>Cette réservation a été <strong>débitée à la création</strong>. Le montant sera <strong>remboursé</strong> au client.</>
                : wasPaid
                  ? <>Cette commande a été <strong>déjà débitée</strong>. Le montant sera <strong>remboursé</strong> au client.</>
                  : <>Cette commande <strong>n'a pas été débitée</strong>. Aucun mouvement de solde nécessaire.</>}
            </span>
          </p>

          <fieldset className={s.motifs}>
            <legend className={s.motifsLabel}>Motif de l'annulation</legend>
            {MOTIFS.map((m, i) => (
              <button key={i} type="button" aria-pressed={motifIdx === i}
                className={clsx(s.motif, motifIdx === i && s.motifOn)}
                onClick={() => setMotifIdx(i)}>
                {m}
              </button>
            ))}
          </fieldset>

          {motifIdx === 2 && (
            <input type="text" autoFocus className={s.motifInput}
              aria-label="Précisez le motif"
              value={motifTexte}
              onChange={e => setMotifTexte(e.target.value)}
              placeholder="Précisez le motif (optionnel)…" />
          )}
          <ErrorLine err={err} />
        </div>
      )}
    </Dialog>
  )
}

export function CollectDialog({ commande, loading, err, onClose, onConfirm, className }) {
  const open = !!commande
  const c = commande || {}
  // Résas : le retrait débite le solde — on prévient explicitement
  const willDebit = c._kind === 'resa'
  return (
    <Dialog
      open={open}
      className={className}
      onClose={loading ? undefined : onClose}
      title="Valider le retrait"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={loading} className={s.footSecondary}>Annuler</Button>
        <Button icon={Package} onClick={onConfirm} loading={loading} className={clsx(s.collect, s.footMain)}>
          {loading ? 'Validation…' : 'Confirmer le retrait'}
        </Button>
      </>}
    >
      {open && (
        <div className={s.dialogBody}>
          <Recap commande={c} />
          <p className={s.question}>Confirmer la remise de cette commande au client ?</p>
          {willDebit && (
            <p className={clsx(s.notice, s.noticeInfo)}>
              <Wallet size={16} aria-hidden="true" />
              <span><strong>{euros(c.total)}</strong> seront débités du solde du spectateur lors de la confirmation.</span>
            </p>
          )}
          <ErrorLine err={err} />
        </div>
      )}
    </Dialog>
  )
}
