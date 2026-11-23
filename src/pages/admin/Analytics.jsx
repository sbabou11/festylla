/**
 * pages/admin/Analytics.jsx
 * Indicateurs de l'événement, carte de chaleur des ventes, prévision de stock,
 * articles et catégories, consommations bénévoles, réservations.
 */
import React, { useMemo, useState } from 'react'
import { Wallet, HandCoins, TrendingUp, PiggyBank, Bookmark, HeartHandshake, ShoppingBag, Tag } from 'lucide-react'
import useAppStore from '../../store/useAppStore'
import { fmt } from '../../utils/helpers'
import { Card, Stat, Empty } from '../../ui'
import SalesHeatmap from './analytics/SalesHeatmap'
import StockForecast from './analytics/StockForecast'
import DetailSheet from '../../components/DetailSheet'
import { Repartition, Note, grouper, nettoyer } from '../../components/detailContenus'
import s from './analytics/analytics.module.css'

function Bars({ items, color, format = fmt, empty }) {
  if (!items.length) return empty
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

export default function Analytics({ onNavigate }) {
  const { spectateurs, reservations, logs, menu } = useAppStore()
  const allTx = logs || []
  const [open, setOpen] = useState(null) // indicateur ouvert (23/11/2026)

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
  const txDons        = allTx.filter(t => t.type === 'don' && !t.annulee)
  const totalDons     = txDons.reduce((a, t) => a + (t.montant || 0), 0)
  const donsAuto      = txDons.filter(t => t.auto).reduce((a, t) => a + (t.montant || 0), 0)
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
        <Stat label="CA brut encaissé" value={fmt(totalVentes)} icon={TrendingUp} onClick={() => setOpen('ca')} />
        <Stat label="Coût bénévoles" value={fmt(coutBenev)} icon={HeartHandshake} tone="coral" onClick={() => setOpen('benev')}
          sub={`${nbBenevsActifs} bénévole${nbBenevsActifs > 1 ? 's' : ''} · ${resasBenev.length} résa`} />
        <Stat label="CA net" value={fmt(caNette)} icon={PiggyBank} tone={caNette >= 0 ? 'success' : 'coral'} sub="après charge bénévoles" onClick={() => setOpen('net')} />
        <Stat label="Total rechargé" value={fmt(totalCredits)} icon={HandCoins} tone="warning" onClick={() => setOpen('credits')} />
        <Stat label="Soldes restants" value={fmt(totalSoldes)} icon={Wallet} sub="en circulation" onClick={() => setOpen('soldes')} />
        {/* Dons à l'ONG Ylla (20/11/2026) : ce que l'association doit reverser à l'ONG */}
        {totalDons > 0 && (
          <Stat label="Dons à l'ONG Ylla" value={fmt(totalDons)} icon={HeartHandshake} tone="coral" onClick={() => setOpen('dons')}
            sub={donsAuto > 0 ? `dont ${fmt(donsAuto)} de soldes non réclamés` : 'à reverser à l\'ONG'} />
        )}
        <Stat label="Taux de retrait résa" value={tauxRetrait + ' %'} icon={Bookmark} tone={tauxRetrait > 60 ? 'success' : 'warning'} onClick={() => setOpen('retrait')}
          sub={`${resaCollected}/${totalResas} réservations`} />
      </div>

      {/* Décomposition des indicateurs (23/11/2026) : mêmes données que la page, aucune requête */}
      {open && (() => {
        const ventes = allTx.filter(t => t.type === 'debit')
        const credits = allTx.filter(t => t.type === 'credit')
        const MOYEN = { especes: 'Espèces', cb: 'Carte bancaire', solde: 'Solde YllaCash', sumup: 'Carte (SumUp)' }
        const def = (txt) => ({ label: 'Ce que compte ce chiffre', content: <Note>{txt}</Note> })
        const conf = {
          ca: { title: 'CA brut encaissé', icon: TrendingUp, value: fmt(totalVentes), sections: [
            { label: 'Par catégorie de la carte', content: <Repartition rows={ventesCat} /> },
            { label: 'Par caisse', content: <Repartition rows={grouper(ventes, t => t.staff)} /> },
            def("Tous les achats encaissés depuis le début de l'événement (hors retraits de réservation)."),
          ] },
          benev: { title: 'Coût bénévoles', icon: HeartHandshake, value: fmt(coutBenev), sections: [
            { label: 'Par type', content: <Repartition rows={coutParType} empty="Aucune consommation bénévole retirée." /> },
            { label: 'Volume', rows: [['Bénévoles servis', String(nbBenevsActifs)], ['Commandes retirées', String(resasBenev.length)]] },
            def('Prix de la carte des repas et boissons retirés par les bénévoles, pris en charge par l\'événement.'),
          ] },
          net: { title: 'CA net', icon: PiggyBank, value: fmt(caNette), sections: [
            { label: 'Calcul', rows: [['CA brut spectateurs', fmt(totalVentes)], ['Charge bénévoles', `−${fmt(coutBenev)}`], ['CA net événement', fmt(caNette)]] },
          ] },
          credits: { title: 'Total rechargé', icon: HandCoins, value: fmt(totalCredits), sections: [
            { label: 'Par moyen de paiement', content: <Repartition rows={grouper(credits, t => (t.moyen ? (MOYEN[t.moyen] || t.moyen) : 'Non précisé'))} /> },
            { label: 'Par caisse', content: <Repartition rows={grouper(credits, t => t.staff)} /> },
            def("Toutes les recharges des comptes spectateurs depuis le début de l'événement."),
          ] },
          soldes: { title: 'Soldes restants', icon: Wallet, value: fmt(totalSoldes), sections: [
            { label: 'Comptes', rows: [
              ['Avec un solde', String(spectateurs.filter(sp => (sp.solde || 0) > 0).length)],
              ['Solde négatif', String(spectateurs.filter(sp => (sp.solde || 0) < 0).length)],
              ['Comptes au total', String(spectateurs.length)],
            ] },
            def('Somme des soldes de tous les comptes spectateurs, à cet instant.'),
          ] },
          dons: { title: "Dons à l'ONG Ylla", icon: HeartHandshake, value: fmt(totalDons), sections: [
            { label: 'Origine', rows: [['Dons choisis par les spectateurs', fmt(totalDons - donsAuto)], ['Soldes non réclamés reversés', fmt(donsAuto)], ['Nombre de dons', String(txDons.length)]] },
            def("Montant que l'association doit reverser à l'ONG Ylla (dons annulés exclus)."),
          ] },
          retrait: { title: 'Taux de retrait résa', icon: Bookmark, value: `${tauxRetrait} %`, sections: [
            { label: 'Réservations spectateurs', content: <Repartition money={false} rows={resaCounts} empty="Aucune réservation." /> },
            { label: 'Calcul', rows: [['Retirées', String(resaCollected)], ['Au total (annulées comprises)', String(totalResas)]] },
          ] },
        }[open]
        return <DetailSheet open onClose={() => setOpen(null)} {...conf} sections={nettoyer(conf.sections)} />
      })()}

      <SalesHeatmap />
      <StockForecast onNavigate={onNavigate} />

      <div className={s.two}>
        <Card title="Articles les plus vendus">
          <Bars items={topArticles} color="var(--brand)" empty={
            <Empty icon={ShoppingBag} title="Aucune vente pour l'instant">Les articles les plus vendus apparaîtront ici dès le premier encaissement.</Empty>
          } />
        </Card>
        <Card title="Ventes par catégorie">
          <Bars items={ventesCat} color="var(--purple)" empty={
            <Empty icon={Tag} title="Aucune vente pour l'instant">Le chiffre de chaque catégorie de la carte apparaîtra ici.</Empty>
          } />
        </Card>
      </div>

      <div className={s.two}>
        <Card title="Consommations bénévoles" subtitle="prises en charge par l'événement">
          {coutBenev === 0 ? (
            <Empty icon={HeartHandshake} title="Aucune consommation bénévole retirée">Le coût des repas et boissons retirés par les bénévoles apparaîtra ici.</Empty>
          ) : (
            <div className={s.rows}>
              <Bars items={coutParType} color="var(--coral)" empty={null} />
              <div className={s.ledger}>
                <div><span>CA brut spectateurs</span><b className={s.num}>{fmt(totalVentes)}</b></div>
                <div><span>Charge bénévoles</span><b className={`${s.num} ${s.minus}`}>−{fmt(coutBenev)}</b></div>
                <div><span>CA net événement</span><b className={s.num}>{fmt(caNette)}</b></div>
              </div>
            </div>
          )}
        </Card>
        <Card title="Réservations spectateurs" subtitle={`${totalResas} au total`}>
          <Bars items={[...resaCounts].sort((a, b) => b.value - a.value)} color="var(--gold)" format={(v) => String(v)} empty={
            <Empty icon={Bookmark} title="Aucune réservation pour l'instant">Les réservations en attente, prêtes et retirées apparaîtront ici.</Empty>
          } />
        </Card>
      </div>
    </div>
  )
}
