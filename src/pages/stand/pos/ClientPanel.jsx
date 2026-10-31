/**
 * ClientPanel — scan du client (caméra ou saisie) puis carte du client scanné.
 * Le scanner reste prêt entre deux clients : c'est le "scan continu".
 */
import React from 'react'
import { ScanLine, X } from 'lucide-react'
import QrScanner from '../../../components/QrScanner'
import { fmt } from '../../../utils/helpers'
import s from './pos.module.css'

export default function ClientPanel({ client, searching, error, onScan, onClear }) {
  if (!client) {
    return (
      <section className={s.scanCard} aria-label="Scanner le client">
        <header className={s.scanHead}>
          <ScanLine size={18} aria-hidden="true" />
          <span>Scannez le QR du client</span>
          {searching && <span className={s.searching}>Recherche…</span>}
        </header>
        <QrScanner onScan={onScan} />
        {error && <p className={s.scanError} role="alert">{error}</p>}
      </section>
    )
  }

  const low = !client._isBenev && (client.solde || 0) < 500
  return (
    <section className={s.clientCard} aria-label="Client">
      <div className={s.clientWho}>
        <b>{client.nom || 'Sans nom'}</b>
        <span>{client.id}{client._isBenev ? ' · bénévole' : ''}</span>
      </div>
      {!client._isBenev && (
        <div className={s.clientBal}>
          <span>Solde</span>
          <b className={low ? s.balLow : undefined}>{fmt(client.solde || 0)}</b>
        </div>
      )}
      <button type="button" className={s.clientChange} onClick={onClear} aria-label="Changer de client">
        <X size={16} />
      </button>
    </section>
  )
}
