/**
 * Ticket — ticket de caisse à bord perforé : lignes, total, solde après paiement,
 * bouton Encaisser. Le bouton dit toujours ce qui manque (client, articles, solde).
 */
import React from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { fmt } from '../../../utils/helpers'
import s from './pos.module.css'

export default function Ticket({ lines, total, client, online, onChange, onClear, onPay, standName, ticketRef }) {
  const solde     = client?.solde ?? null
  const after     = solde != null ? solde - total : null
  const isBenev   = client?._isBenev
  const short     = online && after != null && after < 0

  let label = `Encaisser ${fmt(total)}`
  let disabled = false
  if (!lines.length)  { label = 'Ajoutez des articles'; disabled = true }
  else if (!client)   { label = 'Scannez le client'; disabled = true }
  else if (isBenev)   { label = 'Compte bénévole : passez par les réservations'; disabled = true }
  else if (short)     { label = `Solde insuffisant (manque ${fmt(-after)})`; disabled = true }

  return (
    <div className={s.ticketWrap}>
      <div className={s.ticket} ref={ticketRef}>
        <div className={s.ticketHead}>
          <h2>Ticket</h2>
          <span>{standName} · {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>

        {lines.length === 0 ? (
          <p className={s.ticketEmpty}>Touchez un article pour l'ajouter.</p>
        ) : (
          <ul className={s.lines}>
            {lines.map(l => (
              <li key={l.id} className={s.line}>
                <span className={s.lineName}>{l.nom}</span>
                <span className={s.stepper}>
                  <button type="button" onClick={() => onChange(l.id, -1)} aria-label={`Retirer un ${l.nom}`}>
                    {l.qty === 1 ? <Trash2 size={13} /> : <Minus size={13} />}
                  </button>
                  <b>{l.qty}</b>
                  <button type="button" onClick={() => onChange(l.id, 1)} disabled={l.qty >= (l.stock || 0)} aria-label={`Ajouter un ${l.nom}`}>
                    <Plus size={13} />
                  </button>
                </span>
                <span className={s.lineTotal}>{fmt((l.prix || 0) * l.qty)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className={s.total}>
          <span>Total</span>
          <b>{fmt(total)}</b>
        </div>
        {client && !isBenev && (
          <div className={clsx(s.after, short && s.afterShort)}>
            <span>{online ? 'Solde après paiement' : 'Solde estimé (hors ligne)'}</span>
            <b>{fmt(after)}</b>
          </div>
        )}
        {lines.length > 0 && (
          <button type="button" className={s.clear} onClick={onClear}>Vider le ticket</button>
        )}
      </div>

      <button type="button" className={s.pay} onClick={onPay} disabled={disabled}>
        {label}
      </button>
      <p className={s.payHint}>Annulation possible pendant 10 s après l'encaissement</p>
    </div>
  )
}
