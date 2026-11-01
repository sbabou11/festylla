/**
 * ui/ConnectionBar.jsx — état du réseau visible là où l'on encaisse
 * <ConnectionBar online={online} pending={3} syncing={false} onSync={retry} />
 * En ligne sans rien en attente : rien n'est affiché (sauf `always`).
 */
import React from 'react'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import s from './ConnectionBar.module.css'

const ventes = (n, unit) => `${n} ${unit}${n > 1 ? 's' : ''}`

export default function ConnectionBar({ online, pending = 0, syncing = false, onSync, always = false, unit = 'vente', offlineText, className }) {
  const state = !online ? 'off' : (syncing || pending > 0) ? 'sync' : 'on'
  if (state === 'on' && !always) return null
  const text = state === 'off'
    ? (pending ? `Hors ligne · ${ventes(pending, unit)} en attente sur cet appareil` : (offlineText || 'Hors ligne · tu peux continuer, tout sera envoyé au retour du réseau'))
    : state === 'sync' ? `Envoi de ${ventes(pending || 1, unit)}…` : 'En ligne · tout est envoyé'
  const Icon = state === 'off' ? WifiOff : state === 'sync' ? RefreshCw : Wifi
  return (
    <div className={clsx(s.bar, s[state], className)} role="status" aria-live="polite">
      <Icon size={15} aria-hidden="true" className={state === 'sync' ? s.spin : s.icon} />
      <span className={s.text}>{text}</span>
      {state === 'off' && pending > 0 && <span className={s.count}>{pending}</span>}
      {onSync && state === 'sync' && !syncing && (
        <button type="button" className={s.btn} onClick={onSync}>Renvoyer</button>
      )}
    </div>
  )
}
