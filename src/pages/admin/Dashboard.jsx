/**
 * pages/admin/Dashboard.jsx — v3 tableau de bord en direct (lot 1)
 * Indicateurs comparés à la veille, flux de caisse par heure, objectif du jour,
 * alertes, kanban des réservations et dernières transactions.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { Users, Wallet, ShoppingCart, Bookmark, Target, ChevronRight, Receipt } from 'lucide-react'
import clsx from 'clsx'
import useAppStore   from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import { fmt } from '../../utils/helpers'
import { computeKPIs } from '../../utils/kpis'
import { dayStats, hourlyFlow, topSellers, dashboardAlerts, txTime } from '../../utils/dashboardData'
import { stockForecast } from '../../utils/analyticsData'
import { Stat, Card, Tabs, Button, Empty, Dialog, AnimatedNumber, toast } from '../../ui'
import FlowChart  from './dashboard/FlowChart'
import GoalRing   from './dashboard/GoalRing'
import ResaKanban from './dashboard/ResaKanban'
import s from './dashboard/Dashboard.module.css'

// Rafraîchit "maintenant" chaque minute (ligne de l'heure, comparaisons)
function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`)

const TX_STYLE = {
  credit:             { tone: 'success', sign: '+' },
  debit:              { tone: 'coral',   sign: '−' },
  retrait:            { tone: 'brand',   sign: '−' },
  'benev-retrait':    { tone: 'brand',   sign: ''  },
  reservation:        { tone: 'warning', sign: ''  },
  'benev-reservation':{ tone: 'warning', sign: ''  },
}

export default function Dashboard({ onNavigate, view }) {
  const { spectateurs, reservations, logs, menu, theme } = useAppStore()
  const { events, currentEventId, updateEvent } = useEventStore()
  const now = useNow()
  const [period, setPeriod] = useState('today')
  const [goalOpen, setGoalOpen] = useState(false)

  const allTx   = logs || []
  const event   = events.find(e => e.id === currentEventId)
  const goal    = event?.objectifJour || 0
  const canEditGoal = view === 'admin' || view === 'super_admin'

  const kpis   = useMemo(() => computeKPIs({ spectateurs, reservations, logs: allTx, menu }), [spectateurs, reservations, allTx, menu])
  const day    = useMemo(() => dayStats(allTx, now), [allTx, now])
  const flow   = useMemo(() => hourlyFlow(allTx, now, period === 'today' ? 0 : 1), [allTx, now, period])
  const best   = useMemo(() => topSellers(allTx, now)[0], [allTx, now])
  const alerts = useMemo(() => {
    const list = dashboardAlerts({ spectateurs, logs: allTx, menu })
    // Rupture prévue avant la fermeture au rythme de vente actuel : remplace l'alerte « stock bas » de l'article
    const soon = stockForecast(allTx, menu).filter(f => f.status === 'avant-fermeture')
    const ids = new Set(soon.map(f => `stock-${f.id || f.nom}`))
    const forecast = soon.map(f => ({
      id: `prev-${f.id || f.nom}`, tone: 'warning', page: 'analytics', stock: f.stock,
      title: `${f.nom} · rupture vers ${new Date(f.ruptureAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
    }))
    const rest = list.filter(a => !ids.has(a.id))
    return [...rest.filter(a => a.tone === 'danger'), ...forecast, ...rest.filter(a => a.tone !== 'danger')]
  }, [spectateurs, allTx, menu])

  const wallets = spectateurs.filter(sp => (sp.solde || 0) > 0).length
  const specMap = useMemo(() => Object.fromEntries(spectateurs.map(sp => [sp.id, sp.nom])), [spectateurs])
  const recentTx = useMemo(() => [...allTx]
    .filter(t => t.type !== 'annulation' || (t.montant || 0) > 0)
    .sort((a, b) => (txTime(b) || 0) - (txTime(a) || 0))
    .slice(0, 7), [allTx])

  const vsYesterday = day.hasYesterday ? 'vs hier même heure' : null

  return (
    <div className={s.page}>
      {theme.bannerSrc && (
        <div className={s.banner}><img src={theme.bannerSrc} alt="" /></div>
      )}

      {/* Indicateurs */}
      <div className={s.stats}>
        <Stat
          label="Recettes du jour" value={<AnimatedNumber value={day.revenue} format={fmt} />} icon={ShoppingCart} tone="coral" trend={day.trend}
          delta={day.revenueDelta != null
            ? { value: `${signed(day.revenueDelta)} %`, direction: day.revenueDelta > 0 ? 'up' : day.revenueDelta < 0 ? 'down' : 'flat', label: vsYesterday }
            : undefined}
          sub={day.revenueDelta == null ? `${day.salesCount} vente${day.salesCount > 1 ? 's' : ''} depuis 6h` : undefined}
        />
        <Stat
          label="Soldes en circulation" value={<AnimatedNumber value={kpis.totalSoldes} format={fmt} />} icon={Wallet} tone="success"
          sub={`${wallets} portefeuille${wallets > 1 ? 's' : ''} actif${wallets > 1 ? 's' : ''} · ${fmt(day.credits)} rechargés aujourd'hui`}
        />
        <Stat
          label="Panier moyen du jour" value={<AnimatedNumber value={Math.round(day.basket)} format={fmt} />} icon={Users} tone="brand"
          delta={day.basketDiff != null
            ? { value: `${day.basketDiff >= 0 ? '+' : '−'}${fmt(Math.abs(Math.round(day.basketDiff)))}`, direction: day.basketDiff > 0 ? 'up' : day.basketDiff < 0 ? 'down' : 'flat', label: vsYesterday }
            : undefined}
          sub={day.basketDiff == null ? `${day.salesCount} encaissement${day.salesCount > 1 ? 's' : ''}` : undefined}
        />
        <Stat
          label="Réservations" value={<AnimatedNumber value={kpis.activeResas.length} />} icon={Bookmark} tone="warning"
          sub={kpis.resaReady > 0 ? `${kpis.resaReady} prête${kpis.resaReady > 1 ? 's' : ''} à retirer` : kpis.resaPending > 0 ? `${kpis.resaPending} en attente` : 'Aucune en cours'}
        />
      </div>

      {/* Flux + objectif / alertes */}
      <div className={s.rowWide}>
        <Card
          title="Flux de caisse par heure"
          subtitle={`${fmt(flow.total.credits)} rechargés · ${fmt(flow.total.sales)} dépensés`}
          actions={<Tabs size="sm" label="Journée" value={period} onChange={setPeriod}
            items={[{ value: 'today', label: "Aujourd'hui" }, { value: 'yesterday', label: 'Hier' }]} />}
        >
          <div className={s.legend}>
            <span><i className={s.keyIn} />Recharges</span>
            <span><i className={s.keyOut} />Dépenses</span>
            <span className={s.legendNote}>Journée de 6h à 6h</span>
          </div>
          <FlowChart flow={flow} />
        </Card>

        <div className={s.stack}>
          <Card title="Objectif du jour"
            actions={canEditGoal && goal > 0 && <Button size="sm" variant="ghost" onClick={() => setGoalOpen(true)}>Modifier</Button>}>
            {goal > 0 ? (
              <div className={s.goal}>
                <GoalRing revenue={day.revenue} projected={day.projected} goal={goal} />
                <dl className={s.goalFacts}>
                  <div><dt>Encaissé</dt><dd>{fmt(day.revenue)} <span>sur {fmt(goal)}</span></dd></div>
                  <div><dt>Projeté à {day.closingLabel}</dt><dd className={s.proj}>≈ {fmt(day.projected)}</dd></div>
                  {best && <div><dt>Meilleure caisse</dt><dd>{best.staff} <span>· {fmt(best.total)}</span></dd></div>}
                </dl>
              </div>
            ) : (
              <Empty icon={Target} title="Aucun objectif fixé"
                action={canEditGoal && <Button size="sm" onClick={() => setGoalOpen(true)}>Fixer un objectif</Button>}>
                {`Projection à ${day.closingLabel} : ≈ ${fmt(day.projected)}`}
              </Empty>
            )}
          </Card>

          <Card title="Alertes" flush
            actions={<Button size="sm" variant="ghost" onClick={() => onNavigate?.('alertes')}>Tout voir</Button>}>
            {alerts.length === 0 ? (
              <p className={s.allGood}>Rien à signaler</p>
            ) : (
              <ul className={s.alerts}>
                {alerts.slice(0, 4).map(a => (
                  <li key={a.id}>
                    <button type="button" className={s.alert} onClick={() => onNavigate?.(a.page)}>
                      <i className={clsx(s.stripe, s[a.tone])} />
                      <span className={s.alertText}>
                        <b>{a.title}</b>
                        {a.detail != null && <span> · {fmt(a.detail)}</span>}
                        {a.stock != null && a.stock > 0 && <span> · reste {a.stock}</span>}
                      </span>
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
                {alerts.length > 4 && <li className={s.alertMore}>+ {alerts.length - 4} autres</li>}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Réservations + transactions */}
      <div className={s.rowWide}>
        <Card title="Réservations en cours"
          subtitle={`${kpis.activeResas.filter(r => !r.isBenev).length} spectateurs · ${kpis.activeResas.filter(r => r.isBenev).length} bénévoles`}
          actions={<Button size="sm" variant="ghost" onClick={() => onNavigate?.('reservations-admin')}>Tout voir</Button>}>
          <ResaKanban reservations={kpis.activeResas} onSeeAll={() => onNavigate?.('reservations-admin')} />
        </Card>

        <Card title="Dernières transactions" subtitle={`${allTx.length} au total`} flush
          actions={<Button size="sm" variant="ghost" onClick={() => onNavigate?.('transactions')}>Tout voir</Button>}>
          {recentTx.length === 0 ? (
            <Empty icon={Receipt} title="Aucune transaction">Les recharges et encaissements apparaîtront ici.</Empty>
          ) : (
            <ul className={s.txList}>
              {recentTx.map((t, i) => {
                const st = TX_STYLE[t.type] || { tone: 'danger', sign: '−' }
                return (
                  <li key={t.id || i} className={s.tx}>
                    <span className={clsx(s.txIcon, s[st.tone])}>{st.sign || '•'}</span>
                    <span className={s.txText}>
                      <b>{t.label}</b>
                      <span>{t.benevoleNom || specMap[t.specId] || t.specNom || '—'} · {t.heure || t.date}</span>
                    </span>
                    <span className={clsx(s.txAmount, s[`${st.tone}Text`])}>{st.sign}{fmt(t.montant || 0)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <GoalDialog
        open={goalOpen}
        onClose={() => setGoalOpen(false)}
        initial={goal}
        onSave={async (cents) => {
          try {
            await updateEvent(currentEventId, { objectifJour: cents })
            toast.success(cents ? `Objectif fixé à ${fmt(cents)} par jour` : 'Objectif retiré')
            setGoalOpen(false)
          } catch (e) {
            toast.error(`Objectif non enregistré : ${e?.message || 'erreur réseau'}`)
          }
        }}
      />
    </div>
  )
}

function GoalDialog({ open, onClose, initial, onSave }) {
  const [value, setValue]   = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) setValue(initial ? String(initial / 100) : '') }, [open, initial])

  const euros = parseFloat(String(value).replace(',', '.'))
  const valid = value === '' || (Number.isFinite(euros) && euros >= 0)

  const submit = async (e) => {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    await onSave(value === '' ? 0 : Math.round(euros * 100))
    setSaving(false)
  }

  return (
    <Dialog open={open} onClose={onClose} title="Objectif de recettes par jour"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" form="goal-form" loading={saving} disabled={!valid}>Enregistrer</Button>
      </>}>
      <form id="goal-form" onSubmit={submit} className={s.goalForm}>
        <label htmlFor="goal-input">Montant visé pour une journée (6h–6h), en euros</label>
        <input id="goal-input" className="inp" inputMode="decimal" value={value}
          onChange={e => setValue(e.target.value)} placeholder="ex : 12000" autoFocus />
        {!valid && <p className={s.formError}>Saisissez un montant positif, par exemple 12000.</p>}
        <p className={s.formHint}>Laissez vide pour retirer l'objectif. Il s'applique à l'événement en cours, pour toute l'équipe.</p>
      </form>
    </Dialog>
  )
}
