/**
 * components/CommandeDetail.jsx — détail d'une commande au toucher d'une ligne (23/11/2026, maquette validée)
 *
 * Feuille du bas (fenêtre sur grand écran) en lecture seule : statut, code, articles avec leur stand,
 * ce qui a été pris sur les droits (bénévole) ou débité du solde (spectateur), où et quand elle a été
 * passée puis retirée. Aucune nouvelle action : l'annulation reste sur la liste.
 *
 * Props :
 *   commande  la réservation (resas) ou le code en ligne du spectateur ; null = fermé
 *   statut    { label, tone } déjà calculé par l'écran appelant (success | warning | danger | brand | neutral)
 *   benevole  true : quantités en droits (« 1 repas ») au lieu des prix
 *   onClose
 */
import React from 'react'
import { Sheet, Badge } from '../ui'
import { fmt } from '../utils/helpers'
import s from './CommandeDetail.module.css'

const UNITE = { repas: 'repas', boisson: 'boisson', eau: 'eau' }

const enDate = (v) => {
  if (!v) return null
  if (v.toDate) return v.toDate()
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000)
  const d = new Date(v)
  return isNaN(d) ? null : d
}
const quand = (v) => {
  const d = enDate(v)
  if (!d) return typeof v === 'string' ? v : ''
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
const droit = (i) => {
  const u = UNITE[i.typeConsommation] || UNITE[i.typeArtiste] || ''
  return u ? `${i.qty || 1} ${u}` : 'offert'
}
const standDe = (i) => i.standNom || (i.standNumero ? `Stand n° ${i.standNumero}` : '')

export default function CommandeDetail({ commande, statut, benevole = false, onClose }) {
  const c = commande
  const items = c?.items || []
  const titre = c ? (c.code ? `Commande ${String(c.code).startsWith('#') ? '' : '#'}${c.code}` : 'Commande') : ''
  const passee = c ? (quand(c.createdAt) || quand(c.timestamp) || c.date || '') : ''
  const ou = c ? (c.numero ? `Borne, n° ${c.numero}` : c.source === 'borne' ? 'Borne' : c.source === 'en_ligne' || c.statut ? 'Espace en ligne' : '') : ''
  const retiree = c?.collectedAt ? [quand(c.collectedAt), c.collectedBy && c.collectedBy !== 'Ticket imprimé' ? c.collectedBy : ''].filter(Boolean).join(' · ') : ''
  const pret = c && (c.status === 'ready' || c.statut === 'en_attente')
  const debit = c ? (c.statut === 'en_attente' ? 'pas encore (à la borne)' : fmt(c.total || 0)) : ''

  return (
    <Sheet open={!!c} onClose={onClose} title={titre}>
      {c && (
        <div className={s.wrap}>
          {statut && <Badge tone={statut.tone}>{statut.label}</Badge>}

          {pret && c.code && (
            <div className={s.code}>
              <span>{c.statut === 'en_attente' ? 'À taper sur la borne « J\'ai un code »' : 'Code à présenter au stand'}</span>
              <b>{c.statut === 'en_attente' ? `${String(c.code).slice(0, 3)} ${String(c.code).slice(3)}` : c.code}</b>
            </div>
          )}

          <h3 className={s.lab}>Articles</h3>
          <ul className={s.items}>
            {items.map((i, k) => (
              <li key={k} className={s.item}>
                <span className={s.n}>{i.qty || 1}</span>
                <span className={s.t}><b>{i.nom}</b>{standDe(i) && <span>{standDe(i)}</span>}</span>
                <span className={s.m}>{benevole ? droit(i) : fmt(i.total ?? (i.prixUnit || i.prix || 0) * (i.qty || 1))}</span>
              </li>
            ))}
          </ul>

          <h3 className={s.lab}>Suivi</h3>
          <dl className={s.kv}>
            {passee && <div><dt>Passée</dt><dd>{[passee, ou].filter(Boolean).join(' · ')}</dd></div>}
            {retiree && <div><dt>Retirée</dt><dd>{retiree}</dd></div>}
            {c.status === 'cancelled' && <div><dt>Annulée</dt><dd>{quand(c.cancelledAt) || 'oui'}</dd></div>}
            {benevole
              ? <div><dt>Pris sur mes droits</dt><dd>{items.map(droit).join(', ') || '—'}</dd></div>
              : <div><dt>Débité du solde</dt><dd>{c.status === 'cancelled' ? 'rien (annulée)' : debit}</dd></div>}
          </dl>
        </div>
      )}
    </Sheet>
  )
}
