/**
 * pages/admin/accueil/Blocks.jsx — blocs de l'accueil repris des anciens widgets
 * (components/dashboard/widgets/W*.jsx), au style du design system.
 * Chaque bloc s'abonne à ses données seulement quand il est affiché.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { collection, query, onSnapshot } from 'firebase/firestore'
import { TrendingUp, Package, Wallet, Mic, CalendarDays, Users, HandHeart } from 'lucide-react'
import clsx from 'clsx'
import { db } from '../../../firebase/config'
import { watchCachets, watchFinances, watchPlanning } from '../../../firebase/service'
import useAppStore from '../../../store/useAppStore'
import useEventStore from '../../../store/useEventStore'
import { getTs } from '../../../utils/dailyKpis'
import { fmt } from '../../../utils/helpers'
import { Card, Stat, Table, Empty, Badge, Button, Skeleton, AnimatedNumber } from '../../../ui'
import s from './Accueil.module.css'

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }

// Horodatage Firestore (Timestamp, secondes, Date, ISO, ms) → ms
const toMs = (v) => {
  if (!v) return 0
  if (v.toDate) return v.toDate().getTime()
  if (v.seconds) return v.seconds * 1000
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'string') return new Date(v).getTime()
  if (typeof v === 'number') return v
  return 0
}
const hhmm = (v) => { const ms = toMs(v); return ms ? new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—' }

// Abonnement temps réel lié à l'événement courant ; null tant que rien n'est arrivé
function useWatch(watch) {
  const { currentEventId } = useEventStore()
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!currentEventId) { setData([]); return }
    setData(null)
    let unsub
    try { unsub = watch(setData, currentEventId) } catch { setData([]) }
    return () => unsub && unsub()
  }, [currentEventId, watch])
  return data
}

const seeAll = (label, page, go) => go && (
  <Button size="sm" variant="ghost" onClick={() => go(page)}>{label}</Button>
)

/* ── Top articles du jour (WTopArticles) ─────────────────────────────── */
export function TopArticlesBlock({ go }) {
  const { logs } = useAppStore()
  const top = useMemo(() => {
    const start = startOfToday()
    const map = {}
    ;(logs || []).forEach(t => {
      if (getTs(t) < start || !['debit', 'retrait', 'benev-retrait'].includes(t.type)) return
      ;(t.items || []).forEach(i => {
        const nom = i.nom || 'Inconnu'
        const qty = i.qty || 1
        map[nom] = map[nom] || { nom, qty: 0, ca: 0 }
        map[nom].qty += qty
        map[nom].ca  += i.total || (i.prixUnit || i.prix || 0) * qty
      })
    })
    return Object.values(map).sort((a, b) => b.ca - a.ca).slice(0, 5)
  }, [logs])

  return (
    <Card title="Top articles du jour" subtitle="Depuis minuit, par chiffre d'affaires" flush
      actions={seeAll('Analytics', 'analytics', go)}>
      <Table rowKey="nom" rows={top}
        empty={<Empty icon={TrendingUp} title="Aucune vente aujourd'hui">Les articles les plus vendus apparaîtront ici.</Empty>}
        columns={[
          { key: 'nom', label: 'Article' },
          { key: 'qty', label: 'Qté', align: 'right' },
          { key: 'ca', label: 'CA', align: 'right', card: 'value', render: r => fmt(r.ca) },
        ]} />
    </Card>
  )
}

/* ── Stocks : ruptures et stocks bas (WStocks) ───────────────────────── */
export function StocksBlock({ go }) {
  const { menu } = useAppStore()
  const { ruptures, bas } = useMemo(() => {
    const r = [], b = []
    ;(menu || []).forEach(m => {
      const stock = Number(m.stock || 0)
      if (stock <= 0) r.push(m)
      else if (stock <= Number(m.seuilAlerte ?? 10)) b.push(m)
    })
    return { ruptures: r, bas: b }
  }, [menu])
  const rows = [...ruptures, ...bas].slice(0, 5).map(m => ({ ...m, _key: m._docId || m.id || m.nom, out: ruptures.includes(m) }))

  return (
    <Card title="Stocks" flush
      subtitle={rows.length ? `${ruptures.length} rupture${ruptures.length > 1 ? 's' : ''} · ${bas.length} bas` : undefined}
      actions={seeAll('Carte', 'menu', go)}>
      {rows.length === 0 ? (
        <Empty icon={Package} title="Aucune alerte de stock">Les articles en rupture ou sous leur seuil apparaîtront ici.</Empty>
      ) : (
        <ul className={s.list}>
          {rows.map(m => (
            <li key={m._key} className={s.row}>
              <span className={s.rowMain}>{m.nom}</span>
              {m.out ? <Badge tone="danger">Rupture</Badge> : <Badge tone="warning">Reste {m.stock}</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ── Dépenses récentes (WDepenses) ───────────────────────────────────── */
export function DepensesBlock({ go }) {
  const finances = useWatch(watchFinances)
  const { list, totalJour } = useMemo(() => {
    const all = (finances || []).filter(f => f.sens === 'depense')
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return {
      list: all.slice(0, 4),
      totalJour: all.filter(f => f.date === today).reduce((a, f) => a + (f.montant || 0), 0),
    }
  }, [finances])

  return (
    <Card title="Dépenses" subtitle={finances ? `${fmt(totalJour)} aujourd'hui` : undefined} flush
      actions={seeAll('Finances', 'finances', go)}>
      {!finances ? <div className={s.pad}><Skeleton lines={3} /></div>
        : list.length === 0 ? <Empty icon={Wallet} title="Aucune dépense enregistrée">Les dépenses saisies dans Finances apparaîtront ici.</Empty>
        : (
          <ul className={s.list}>
            {list.map(f => (
              <li key={f.id} className={s.row}>
                <span className={s.rowMain}>{f.libelle || f.categorie || 'Sans libellé'}</span>
                <span className={s.amountOut}>−{fmt(f.montant || 0)}</span>
              </li>
            ))}
          </ul>
        )}
    </Card>
  )
}

/* ── Cachets artistes (WCachets) ─────────────────────────────────────── */
export function CachetsBlock({ go }) {
  const cachets = useWatch(watchCachets)
  const k = useMemo(() => {
    const list = cachets || []
    const planned = list.filter(c => c.statut === 'planifie')
    const paid = list.filter(c => c.statut === 'paye')
    const sum = (l) => l.reduce((a, c) => a + (c.montant || 0), 0)
    return { aPayer: sum(planned), aPayerCount: planned.length, payes: sum(paid), payesCount: paid.length, prochains: planned.slice(0, 3) }
  }, [cachets])

  return (
    <Card title="Cachets" actions={seeAll('Cachets', 'cachets', go)}>
      {!cachets ? <Skeleton lines={3} /> : (
        <>
          <div className={s.figures}>
            <div className={clsx(s.figure, k.aPayer > 0 && s.figureWarn)}>
              <span>À payer{k.aPayerCount ? ` · ${k.aPayerCount}` : ''}</span>
              <b><AnimatedNumber value={k.aPayer} format={fmt} /></b>
            </div>
            <div className={s.figure}>
              <span>Payés{k.payesCount ? ` · ${k.payesCount}` : ''}</span>
              <b><AnimatedNumber value={k.payes} format={fmt} /></b>
            </div>
          </div>
          {k.prochains.length === 0 ? (
            <p className={s.note}>{cachets.length ? 'Tous les cachets sont réglés.' : 'Aucun cachet pour cet événement.'}</p>
          ) : (
            <ul className={clsx(s.list, s.listTight)}>
              {k.prochains.map(c => (
                <li key={c.id} className={s.row}>
                  <span className={s.rowMain}><Mic size={13} aria-hidden="true" /> {c.artiste || '—'}</span>
                  <span className={s.amount}>{fmt(c.montant || 0)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}

/* ── Prochains créneaux (WPlanning) ──────────────────────────────────── */
export function PlanningBlock({ go }) {
  const planning = useWatch(watchPlanning)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t) }, [])
  const next = useMemo(() => (planning || [])
    .filter(c => { const fin = toMs(c.fin); return fin === 0 || fin >= now })
    .sort((a, b) => toMs(a.debut) - toMs(b.debut))
    .slice(0, 4), [planning, now])
  const live = (c) => { const d = toMs(c.debut), f = toMs(c.fin); return d > 0 && f > 0 && now >= d && now <= f }

  return (
    <Card title="Prochains créneaux" flush actions={seeAll('Planning', 'planning', go)}>
      {!planning ? <div className={s.pad}><Skeleton lines={4} /></div>
        : next.length === 0 ? <Empty icon={CalendarDays} title="Aucun créneau à venir">Les prochains passages du planning apparaîtront ici.</Empty>
        : (
          <ul className={s.list}>
            {next.map(c => (
              <li key={c.id} className={s.row}>
                <span className={clsx(s.time, live(c) && s.timeLive)}>{hhmm(c.debut)}</span>
                <span className={s.rowText}>
                  <b>{c.artiste || c.titre || '—'}</b>
                  {c.scene && <span>{c.scene}</span>}
                </span>
                {live(c) && <Badge tone="brand">En cours</Badge>}
              </li>
            ))}
          </ul>
        )}
    </Card>
  )
}

/* ── Spectateurs : inscrits et avec solde (WSpectateurs) ─────────────── */
export function SpectateursBlock() {
  const { spectateurs } = useAppStore()
  const total = (spectateurs || []).length
  const actifs = (spectateurs || []).filter(sp => (sp.solde || 0) > 0).length
  return <Stat label="Spectateurs" icon={Users} tone="brand" value={<AnimatedNumber value={total} />} sub={`${actifs} avec solde`} className={s.fill} />
}

/* ── Bénévoles : inscrits et actifs aujourd'hui (WBenevoles) ─────────── */
export function BenevolesBlock() {
  const { currentEventId } = useEventStore()
  const { reservations } = useAppStore()
  const [benevoles, setBenevoles] = useState(null)
  useEffect(() => {
    if (!currentEventId) { setBenevoles([]); return }
    const unsub = onSnapshot(
      query(collection(db, 'events', currentEventId, 'benevoles')),
      snap => setBenevoles(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      () => setBenevoles([]),
    )
    return () => unsub()
  }, [currentEventId])
  const actifs = useMemo(() => {
    const start = startOfToday()
    const ids = new Set()
    ;(reservations || []).forEach(r => {
      if (r.isBenev && r.status === 'collected' && r.benevoleId && getTs(r) >= start) ids.add(r.benevoleId)
    })
    return ids.size
  }, [reservations])
  return (
    <Stat label="Bénévoles" icon={HandHeart} tone="success" className={s.fill}
      value={benevoles ? <AnimatedNumber value={benevoles.length} /> : <Skeleton width={48} height={24} />}
      sub={actifs > 0 ? `${actifs} actif${actifs > 1 ? 's' : ''} aujourd'hui` : 'Inscrits au total'} />
  )
}
