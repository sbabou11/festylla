/**
 * Prévision de rupture : rythme de vente des 90 dernières minutes appliqué au stock restant
 */
import React, { useEffect, useMemo, useState } from 'react'
import { PackageSearch } from 'lucide-react'
import { Button, Card, Empty, Table, Badge } from '../../../ui'
import { stockForecast, nextClosing } from '../../../utils/analyticsData'
import useAppStore from '../../../store/useAppStore'
import useAuthStore from '../../../store/useAuthStore'
import s from './analytics.module.css'

const hm = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

const STATUS = {
  rupture:           { tone: 'danger',  label: 'Rupture' },
  'avant-fermeture': { tone: 'warning', label: 'Avant la fermeture' },
  ok:                { tone: 'success', label: 'Tient la soirée' },
  calme:             { tone: 'neutral', label: 'Pas de vente récente' },
  'sans-stock':      { tone: 'neutral', label: 'Stock non suivi' },
}

export default function StockForecast({ onNavigate }) {
  const { logs, menu } = useAppStore()
  const { canAccessPage } = useAuthStore()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  const rows = useMemo(() => stockForecast(logs || [], menu || [], now).filter(r => r.status !== 'sans-stock'), [logs, menu, now])
  const urgent = rows.filter(r => r.status === 'rupture' || r.status === 'avant-fermeture').length

  return (
    <Card
      title="Prévision de stock"
      subtitle={`Rythme des 90 dernières minutes · fermeture ${hm(nextClosing(now))}${urgent ? ` · ${urgent} article${urgent > 1 ? 's' : ''} à réassortir` : ''}`}
      flush
    >
      <Table
        rows={rows}
        empty={
          <Empty icon={PackageSearch} title="Aucun article avec un stock suivi"
            action={canAccessPage('menu') && <Button variant="secondary" onClick={() => onNavigate('menu')}>Gérer la carte</Button>}>
            La prévision de rupture de chaque article apparaîtra ici.
          </Empty>
        }
        columns={[
          { key: 'nom', label: 'Article', render: r => <b className={s.itemName}>{r.nom}</b> },
          { key: 'stock', label: 'Stock', align: 'right', render: r => <span className={s.num}>{r.stock}</span> },
          { key: 'perHour', label: 'Rythme', align: 'right', render: r => <span className={s.num}>{r.perHour ? `${r.perHour.toFixed(r.perHour < 10 ? 1 : 0)} / h` : '—'}</span> },
          { key: 'ruptureAt', label: 'Rupture prévue', align: 'right', render: r => (
            <span className={s.num}>{r.status === 'rupture' ? 'Maintenant' : r.status === 'avant-fermeture' ? `vers ${hm(r.ruptureAt)}` : r.status === 'ok' ? 'Après la fermeture' : '—'}</span>
          ) },
          { key: 'besoin', label: 'Manque à la fermeture', align: 'right', render: r => (
            <span className={r.besoin ? `${s.num} ${s.need}` : s.num}>{r.besoin ? `+${r.besoin}` : '—'}</span>
          ) },
          { key: 'status', label: 'État', render: r => <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge> },
        ]}
      />
    </Card>
  )
}
