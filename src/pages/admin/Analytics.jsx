/**
 * pages/admin/Analytics.jsx
 * Indicateurs de l'événement, carte de chaleur des ventes, prévision de stock,
 * articles et catégories, consommations bénévoles, réservations.
 */
import React, { useMemo } from 'react'
import { Wallet, HandCoins, TrendingUp, PiggyBank, Bookmark, HeartHandshake } from 'lucide-react'
import useAppStore from '../../store/useAppStore'
import { fmt } from '../../utils/helpers'
import { Card, Stat, Empty } from '../../ui'
import SalesHeatmap from './analytics/SalesHeatmap'
import StockForecast from './analytics/StockForecast'
import s from './analytics/analytics.module.css'

function Bars({ items, color, format = fmt, empty }) {
  if (!items.length) return <Empty title={empty} />
  const max = items[0].value || 1
  return (
    <div className={s.rows}>
      {items.map(it => (
        <div key={it.label} className={s.row}>
          <div className={s.rowHead}>
            <span>{it.label}</span>
            <b className={s.num}>{format(it.value)}</b>
          </div>
          <div className={s.bar} style={{ '--bar-color': color }}><i style={{ width: `${(it.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  )
}

export default function Analytics() {
  const { spectateurs, reservations, logs, menu } = useAppStore()
  const allTx = logs || []

  // ── Coût bénévoles ─────────────────────────────────────────────
  const resasBenev = useMemo(() =>
    reservations.filter(r => r.isBenev && r.status === 'collected'),
    [reservations]
  )
  const prixOf = (item) => item.prix || menu.find(m => m.id === item.id)?.prix || 0

  const coutBenev = useMemo(() =>
    resasBenev.reduce((total, resa) =>
      total + (resa.items || []).reduce((acc, item) => acc + prixOf(item) * (item.qty || 1), 0), 0),
    [resasBenev, menu]
  )
  const nbBenevsActifs = useMemo(() =>
    new Set(resasBenev.map(r => r.benevoleId).filter(Boolean)).size,
    [resasBenev]
  )
  const coutParType = useMemo(() => {
    const map = { repas: 0, boisson: 0, eau: 0 }
    resasBenev.forEach(resa =>
      (resa.items || []).forEach(item => {
        if (item.typeConsommation && map[item.typeConsommation] !== undefined) {
          map[item.typeConsommation] += prixOf(item) * (item.qty || 1)
        }
      })
    )
    return Object.entries(map)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ label: k.charAt(0).toUpperCase() + k.slice(1), value: v }))
      .sort((a, b) => b.value - a.value)
  }, [resasBenev, menu])

  // ── Stats globales ──────────────────────────────────────────────
  const totalSoldes   = spectateurs.reduce((a, sp) => a + (sp.solde || 0), 0)
  const totalVentes   = allTx.filter(t => t.type === 'debit').reduce((a, t) => a + (t.montant || 0), 0)
  const totalCredits  = allTx.filter(t => t.type === 'credit').reduce((a, t) => a + (t.montant || 0), 0)
  const totalResas    = reservations.filter(r => !r.isBenev).length
  const resaCollected = reservations.filter(r => r.status === 'collected' && !r.isBenev).length
  const tauxRetrait   = totalResas ? Math.round(resaCollected / totalResas * 100) : 0
  const caNette       = totalVentes - coutBenev

  // Articles vendus : détail des articles de chaque vente (anciennes ventes : recherche dans le libellé)
  const { topArticles, ventesCat } = useMemo(() => {
    const byNom = {}
    const catOf = Object.fromEntries(menu.map(m => [(m.nom || '').toLowerCase(), m.cat || 'Autre']))
    allTx.filter(t => t.type === 'debit').forEach(t => {
      if (Array.isArray(t.items) && t.items.length) {
        t.items.forEach(i => { byNom[i.nom] = (byNom[i.nom] || 0) + (i.total ?? (i.prixUnit || 0) * (i.qty || 1)) })
      } else {
        const m = menu.find(x => t.label?.includes(x.nom))
        if (m) byNom[m.nom] = (byNom[m.nom] || 0) + (t.montant || 0)
      }
    })
    const byCat = {}
    Object.entries(byNom).forEach(([nom, v]) => {
      const c = catOf[nom.toLowerCase()] || 'Autre'
      byCat[c] = (byCat[c] || 0) + v
    })
    const sorted = (o) => Object.entries(o).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
    return { topArticles: sorted(byNom).slice(0, 6), ventesCat: sorted(byCat) }
  }, [allTx, menu])

  const resaCounts = [
    { label: 'En attente', value: reservations.filter(r => (r.status === 'pending' || r.status === 'processing') && !r.isBenev).length },
    { label: 'Prêtes',     value: reservations.filter(r => r.status === 'ready' && !r.isBenev).length },
    { label: 'Retirées',   value: resaCollected },
  ]

  return (
    <div className={s.page}>
      <div className={s.kpis}>
        <Stat label="CA brut encaissé" value={fmt(totalVentes)} icon={TrendingUp} />
        <Stat label="Coût bénévoles" value={fmt(coutBenev)} icon={HeartHandshake} tone="coral"
          sub={`${nbBenevsActifs} bénévole${nbBenevsActifs > 1 ? 's' : ''} · ${resasBenev.length} résa`} />
        <Stat label="CA net" value={fmt(caNette)} icon={PiggyBank} tone={caNette >= 0 ? 'success' : 'coral'} sub="après charge bénévoles" />
        <Stat label="Total rechargé" value={fmt(totalCredits)} icon={HandCoins} tone="warning" />
        <Stat label="Soldes restants" value={fmt(totalSoldes)} icon={Wallet} sub="en circulation" />
        <Stat label="Taux de retrait résa" value={tauxRetrait + ' %'} icon={Bookmark} tone={tauxRetrait > 60 ? 'success' : 'warning'}
          sub={`${resaCollected}/${totalResas} réservations`} />
      </div>

      <SalesHeatmap />
      <StockForecast />

      <div className={s.two}>
        <Card title="Articles les plus vendus">
          <Bars items={topArticles} color="var(--brand)" empty="Aucune vente" />
        </Card>
        <Card title="Ventes par catégorie">
          <Bars items={ventesCat} color="var(--purple)" empty="Aucune donnée" />
        </Card>
      </div>

      <div className={s.two}>
        <Card title="Consommations bénévoles" subtitle="prises en charge par l'événement">
          {coutBenev === 0 ? <Empty title="Aucune consommation bénévole retirée" /> : (
            <div className={s.rows}>
              <Bars items={coutParType} color="var(--coral)" empty="" />
              <div className={s.ledger}>
                <div><span>CA brut spectateurs</span><b className={s.num}>{fmt(totalVentes)}</b></div>
                <div><span>Charge bénévoles</span><b className={`${s.num} ${s.minus}`}>−{fmt(coutBenev)}</b></div>
                <div><span>CA net événement</span><b className={s.num}>{fmt(caNette)}</b></div>
              </div>
            </div>
          )}
        </Card>
        <Card title="Réservations spectateurs" subtitle={`${totalResas} au total`}>
          <Bars items={[...resaCounts].sort((a, b) => b.value - a.value)} color="var(--gold)" format={(v) => String(v)} empty="Aucune réservation" />
        </Card>
      </div>
    </div>
  )
}
