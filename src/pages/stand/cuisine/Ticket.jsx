/**
 * pages/stand/cuisine/Ticket.jsx — ticket de cuisine (commande ou réservation)
 * Gros numéro, articles avec quantités, nom, temps écoulé (barre fine + minutes).
 * En préparation : teinte selon l'attente (vert → or → orange → rouge → rouge plein), pulsation au-delà de 10 min.
 * Prête : temps depuis le passage à prête, boutons « Valider le retrait » et « Annuler ».
 * arriving : glisse depuis la colonne de gauche avec un anneau vert bref (transform seulement).
 */
import React from 'react'
import clsx from 'clsx'
import { Check, X, Package, Clock, AlertTriangle } from 'lucide-react'
import { Button, Badge } from '../../../ui'
import { SEUILS, delayTone, fmtDuree, getTs, getReadyTs, ticketNumber, euros } from './timing'
import s from './cuisine.module.css'

// Badge de provenance : réservation bénévole, réservation spectateur, borne, commande staff
function KindBadge({ commande }) {
  if (commande._kind === 'resa') {
    return (commande.isBenev || commande.benevoleId)
      ? <Badge tone="coral">Bénévole</Badge>
      : <Badge tone="neutral">Résa</Badge>
  }
  if (commande.source === 'borne') return <Badge tone="success">Borne</Badge>
  return <Badge tone="brand">Cmd</Badge>
}

// Libellé du paiement — les résas sont toujours débitées à la création
function payment(commande) {
  if (commande._kind === 'resa') return { label: 'Payée à la résa', paid: true }
  return commande.paid ? { label: 'Payée', paid: true } : { label: 'Non payée', paid: false }
}

export default function Ticket({ commande, now, acting, arriving, leaving, onReady, onCancel, onCollect }) {
  const ts = getTs(commande) || now
  const secs = Math.max(0, Math.floor((now - ts) / 1000))
  // En préparation : 'pending' (commandes + résas legacy) ou 'processing' (résas, dont la borne)
  const isPending = commande.status === 'pending' || commande.status === 'processing'
  const readyTs = getReadyTs(commande)
  const secsReady = readyTs ? Math.max(0, Math.floor((now - readyTs) / 1000)) : 0

  const tone = isPending ? delayTone(secs) : 'ready'
  const shownSecs = isPending ? secs : secsReady
  const minutes = Math.floor(shownSecs / 60)
  // Barre pleine à 15 min (dernier seuil) ; prête : barre pleine verte
  const ratio = isPending ? Math.min(1, secs / SEUILS.red) : 1
  const heure = commande.heure || (ts ? new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—')
  const pay = payment(commande)
  const num = ticketNumber(commande)
  const name = commande.specNom || commande.benevoleNom || '—'

  return (
    <article
      className={clsx(s.ticket, s[tone], arriving && s.arrive, leaving && s.leave)}
      aria-label={`${commande._kind === 'resa' ? 'Réservation' : 'Commande'} ${num}, ${name}`}
    >
      {tone === 'critical' && (
        <p className={s.criticalTag}><AlertTriangle size={14} aria-hidden="true" /> Retard critique</p>
      )}

      <header className={s.tHead}>
        <span className={s.num}><span className={s.hash} aria-hidden="true">#</span>{num}</span>
        <div className={s.who}>
          <div className={s.tags}>
            <KindBadge commande={commande} />
            {commande.code && <span className={s.code}>{commande.code}</span>}
          </div>
          <p className={s.name}>{name}</p>
        </div>
        <div className={s.time} title={isPending ? `Attente ${fmtDuree(secs)}` : `Prête depuis ${fmtDuree(secsReady)}`}>
          <span className={s.mins}>{minutes}</span>
          <span className={s.minLabel}>{isPending ? 'min' : 'min prête'}</span>
        </div>
      </header>

      <div className={s.bar} aria-hidden="true">
        <span className={s.barFill} style={{ '--p': ratio }} />
      </div>

      <ul className={s.items}>
        {(commande.items || []).map((it, idx) => {
          // Commandes : prixUnit (centimes) ; réservations : prix (centimes)
          const prixUnit = (it.prixUnit != null) ? it.prixUnit : (it.prix || 0)
          return (
            <li key={idx} className={s.item}>
              <span className={s.qty}>{it.qty || 1}×</span>
              <span className={s.itemName}>{it.nom}</span>
              <span className={s.itemPrice}>{euros(prixUnit * (it.qty || 1))}</span>
            </li>
          )
        })}
        <li className={s.total}><span>Total</span><span>{euros(commande.total)}</span></li>
      </ul>

      <p className={s.meta}>
        <Clock size={12} aria-hidden="true" />
        <span>{commande.specId ? `${commande.specId} · ` : ''}{heure}</span>
        <span className={pay.paid ? s.paid : s.unpaid}>{pay.label}</span>
      </p>

      <div className={s.actions}>
        {isPending ? (
          <Button size="lg" block icon={Check} loading={acting} onClick={onReady} className={s.mainAction}>
            Prête
          </Button>
        ) : (
          <Button size="lg" block icon={Package} loading={acting} onClick={onCollect} className={clsx(s.mainAction, s.collect)}>
            Valider le retrait
          </Button>
        )}
        <Button variant="danger" size="lg" iconOnly icon={X} disabled={acting} onClick={onCancel}
          className={s.cancelBtn} aria-label={`Annuler ${commande._kind === 'resa' ? 'la réservation' : 'la commande'} ${num}`} title="Annuler" />
      </div>
    </article>
  )
}
