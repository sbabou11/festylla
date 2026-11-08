/**
 * pages/public/artiste/ArtisteSections.jsx — contenu des onglets de l'espace artiste
 * Droits, Consos, Réserver, Mes résas, Programme. Composants d'affichage seulement :
 * toutes les écritures restent dans EspaceArtiste.jsx et arrivent ici en callbacks.
 */
import React from 'react'
import clsx from 'clsx'
import { Gift, History, ShoppingCart, Bookmark, CalendarDays, Plus, Minus, AlertCircle, X } from 'lucide-react'
import { Badge, Button, Empty } from '../../../ui'
import { TYPES, consoOf, fmtHour, fmtDateShort } from './artisteUtils'
import s from './EspaceArtiste.module.css'

function Section({ title, hint, children }) {
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <h2>{title}</h2>
      </div>
      {hint && <p className={s.muted}>{hint}</p>}
      {children}
    </section>
  )
}

/* ── Mes droits ─────────────────────────────────────────── */
export function DroitsTab({ av, used, pending }) {
  const none = av.drinks === 0 && av.meals === 0 && av.eaux === 0
  return (
    <Section title="Vos avantages aujourd'hui">
      {none ? (
        <Empty icon={Gift} title="Aucun avantage prévu">Vos boissons, repas et eau apparaîtront ici si l'organisation en ajoute à votre créneau.</Empty>
      ) : (
        <div className={s.droits}>
          <DroitBar type="drink" label="Boissons" total={av.drinks || 0} used={used.drink} pending={pending.drink}/>
          <DroitBar type="meal"  label="Repas"    total={av.meals  || 0} used={used.meal}  pending={pending.meal}/>
          <DroitBar type="eau"   label="Eau"      total={av.eaux   || 0} used={used.eau}   pending={pending.eau}/>
        </div>
      )}
    </Section>
  )
}

function DroitBar({ type, label, total, used, pending = 0 }) {
  const c = consoOf(type)
  const Icon = c.icon
  const remain = Math.max(0, total - used - pending)
  const usedPct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  const pendingPct = total > 0 ? Math.min(100 - usedPct, (pending / total) * 100) : 0
  const allConsumed = total > 0 && remain === 0

  if (total === 0) {
    return (
      <div className={clsx(s.droit, s.droitOff)}>
        <span className={s.droitLabel}><span className={clsx(s.typeIcon, s[c.tone])}><Icon size={16} aria-hidden="true"/></span>{label}</span>
        <span className={s.droitNone}>Non offert</span>
      </div>
    )
  }

  return (
    <div className={s.droit}>
      <div className={s.droitRow}>
        <span className={s.droitLabel}><span className={clsx(s.typeIcon, s[c.tone])}><Icon size={16} aria-hidden="true"/></span>{label}</span>
        <span className={clsx(s.droitCount, allConsumed && s.droitDone)}>
          <b>{remain}</b>/{total}
        </span>
      </div>
      <div className={s.bar} role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={remain}
        aria-label={`${label} : ${remain} restant${remain > 1 ? 's' : ''} sur ${total}`}>
        <span className={s.barUsed} style={{ width: usedPct + '%' }}/>
        <span className={s.barPending} style={{ width: pendingPct + '%' }}/>
      </div>
      {(pending > 0 || allConsumed) && (
        <div className={s.droitMeta}>
          {pending > 0 && <Badge tone="warning">{pending} en attente</Badge>}
          {allConsumed && <Badge tone="danger">Tout utilisé</Badge>}
        </div>
      )}
    </div>
  )
}

/* ── Consommations ──────────────────────────────────────── */
export function ConsosTab({ consumptions }) {
  return (
    <Section title="Historique de vos consommations">
      {consumptions.length === 0 ? (
        <Empty icon={History} title="Aucune consommation pour l'instant">Vos boissons et repas servis apparaîtront ici.</Empty>
      ) : (
        <ul className={clsx(s.list, 'yc-stagger')}>
          {consumptions.map(c => {
            const t = consoOf(c.type)
            const Icon = t.icon
            return (
              <li key={c.id} className={s.row}>
                <span className={clsx(s.typeIcon, s.typeIconLg, s[t.tone])}><Icon size={18} aria-hidden="true"/></span>
                <div className={s.rowText}>
                  <b>{c.articleNom || '—'}</b>
                  <span>{fmtHour(c.servedAt)} {c.servedBy?.name && '· par ' + c.servedBy.name}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

/* ── Réserver ───────────────────────────────────────────── */
export function ReserverTab({ av, eligibleArticles, cart, remain, cartTotal, onAdd, onRemove, onReserve, resaErr, onSeeResas }) {
  const noRights = av.drinks + av.meals + av.eaux === 0
  return (
    <Section title="Réserver vos avantages"
      hint="Préparez votre commande à l'avance : les caissiers sont prévenus et vous servent dès votre arrivée.">
      {resaErr && (
        <div className={s.error} role="alert"><AlertCircle size={16} aria-hidden="true"/><span>{resaErr}</span></div>
      )}

      {eligibleArticles.length === 0 ? (
        <Empty icon={ShoppingCart} title={noRights ? 'Aucun avantage à réserver' : 'Tout est réservé'}
          action={noRights ? null : <Button size="sm" variant="secondary" icon={Bookmark} onClick={onSeeResas}>Voir mes réservations</Button>}>
          {noRights
            ? 'Les articles à réserver apparaîtront ici si votre créneau comprend des avantages.'
            : 'Tous vos avantages ont été utilisés ou réservés.'}
        </Empty>
      ) : (
        <>
          <div className={s.articles}>
            {eligibleArticles.map(a => {
              const key = a.id + '-' + a._type
              const qty = cart[key] || 0
              const t = consoOf(a._type)
              const Icon = t.icon
              return (
                <div key={key} className={clsx(s.article, qty > 0 && s.articleOn)}>
                  <span className={clsx(s.typeIcon, s.typeIconLg, s[t.tone])}><Icon size={18} aria-hidden="true"/></span>
                  <b className={s.articleName}>{a.nom}</b>
                  <div className={s.stepper}>
                    <button type="button" className={s.stepBtn} onClick={() => onRemove(a)} disabled={qty === 0}
                      aria-label={`Retirer ${a.nom}`}>
                      <Minus size={16}/>
                    </button>
                    <span className={s.qty} aria-live="polite">{qty}</span>
                    <button type="button" className={clsx(s.stepBtn, s.stepAdd)} onClick={() => onAdd(a)}
                      disabled={qty >= (remain[a._type] || 0)} aria-label={`Ajouter ${a.nom}`}>
                      <Plus size={16}/>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {cartTotal > 0 && (
            <Button block size="lg" icon={ShoppingCart} onClick={onReserve}>
              Réserver {cartTotal} article{cartTotal > 1 ? 's' : ''}
            </Button>
          )}
        </>
      )}
    </Section>
  )
}

/* ── Mes réservations ───────────────────────────────────── */
const STATUT = {
  pending: { label: 'En attente', tone: 'warning' },
  servie:  { label: 'Servie',     tone: 'success' },
  annule:  { label: 'Annulée',    tone: 'danger'  },
}

export function ResasTab({ reservations, onCancel, onReserve }) {
  return (
    <Section title="Mes réservations">
      {reservations.length === 0 ? (
        <Empty icon={Bookmark} title="Aucune réservation pour l'instant"
          action={<Button size="sm" icon={ShoppingCart} onClick={onReserve}>Réserver mes avantages</Button>}>
          Vos réservations apparaîtront ici.
        </Empty>
      ) : (
        <ul className={clsx(s.list, 'yc-stagger')}>
          {reservations.map(r => {
            const st = STATUT[r.statut] || STATUT.annule
            return (
              <li key={r.id} className={s.resa}>
                <div className={s.resaHead}>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {r.statut === 'pending' && (
                    <Button variant="ghost" size="sm" icon={X} onClick={() => onCancel(r.id)}>Annuler</Button>
                  )}
                </div>
                <ul className={s.items}>
                  {(r.items || []).map((i, idx) => {
                    const t = consoOf(i.type)
                    const Icon = t.icon
                    return (
                      <li key={idx}><span className={clsx(s.typeIcon, s[t.tone])}><Icon size={14} aria-hidden="true"/></span>{i.nom}</li>
                    )
                  })}
                </ul>
                <span className={s.resaMeta}>
                  {r.servedAt ? 'Servie à ' + fmtHour(r.servedAt) : r.createdAt ? 'Demandée à ' + fmtHour(r.createdAt) : ''}
                  {r.servedBy?.name && ' · par ' + r.servedBy.name}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

/* ── Programme ──────────────────────────────────────────── */
export function ProgrammeTab({ planning, creneauId }) {
  return (
    <Section title="Programme du festival">
      {planning.length === 0 ? (
        <Empty icon={CalendarDays} title="Programme à venir">Les créneaux apparaîtront ici dès leur publication.</Empty>
      ) : (
        <ul className={clsx(s.list, 'yc-stagger')}>
          {[...planning].sort((a, b) => {
            const ta = a.debut?.toMillis ? a.debut.toMillis() : new Date(a.debut || 0).getTime()
            const tb = b.debut?.toMillis ? b.debut.toMillis() : new Date(b.debut || 0).getTime()
            return ta - tb
          }).map(p => {
            const pt = TYPES[p.type] || TYPES.autre
            const Icon = pt.icon
            const isMe = p.id === creneauId
            const isAnnulePrg = p.statut === 'annule'
            return (
              <li key={p.id} className={clsx(s.row, isMe && s.rowMe, isAnnulePrg && s.rowOff)}>
                <span className={clsx(s.typeIcon, s.typeIconLg, s[pt.tone])}><Icon size={18} aria-hidden="true"/></span>
                <div className={s.rowText}>
                  <span className={s.rowTitle}>
                    <b>{p.artiste}</b>
                    {isMe && <Badge tone="brand">Vous</Badge>}
                    {isAnnulePrg && <Badge tone="danger">Annulé</Badge>}
                  </span>
                  <span>{fmtDateShort(p.debut)} · {fmtHour(p.debut)} → {fmtHour(p.fin)}{p.scene && ' · ' + p.scene}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}
