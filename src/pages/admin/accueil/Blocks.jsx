/**
 * pages/admin/accueil/Blocks.jsx — blocs de l'accueil repris des anciens widgets
 * (components/dashboard/widgets/W*.jsx), au style du design system.
 * Chaque bloc s'abonne à ses données seulement quand il est affiché.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { collection, query, onSnapshot } from 'firebase/firestore'
import { TrendingUp, Package, Wallet, Mic, CalendarDays, Users, HandHeart, ChevronRight } from 'lucide-react'
import DetailSheet from '../../../components/DetailSheet'
import { Repartition, Note, grouper, nettoyer } from '../../../components/detailContenus'
import clsx from 'clsx'
import { db } from '../../../firebase/config'
import { watchCachets, watchFinances, watchPlanning } from '../../../firebase/service'
import useAppStore from '../../../store/useAppStore'
import useEventStore from '../../../store/useEventStore'
import { getTs } from '../../../utils/dailyKpis'
import { fmt } from '../../../utils/helpers'
import { Card, Stat, Table, Empty, Badge, Button, Skeleton, AnimatedNumber } from '../../../ui'
import s from './Accueil.module.css'

// Libellés des modes de paiement (Finances, Cachets), pour les fenêtres de détail
const MODE_FIN = { especes: 'Espèces', virement: 'Virement', cheque: 'Chèque', cb: 'CB', autre: 'Autre' }
const MODE_CACHET = { especes: 'Espèces', virement: 'Virement', cheque: 'Chèque' }

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
  const [open, setOpen] = useState(null)
  const sel = open ? rows.find(r => r._key === open) : null

  return (
    <Card title="Stocks" flush
      subtitle={rows.length ? `${ruptures.length} rupture${ruptures.length > 1 ? 's' : ''} · ${bas.length} bas` : undefined}
      actions={seeAll('Carte', 'menu', go)}>
      {rows.length === 0 ? (
        <Empty icon={Package} title="Aucune alerte de stock">Les articles en rupture ou sous leur seuil apparaîtront ici.</Empty>
      ) : (
        <ul className={s.list}>
          {rows.map(m => (
            <li key={m._key}>
              <button type="button" className={clsx(s.row, s.rowBtn)} aria-haspopup="dialog" onClick={() => setOpen(m._key)}>
                <span className={s.rowMain}>{m.nom}</span>
                {m.out ? <Badge tone="danger">Rupture</Badge> : <Badge tone="warning">Reste {m.stock}</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* Détail d'un article (23/11/2026) */}
      <DetailSheet open={!!sel} onClose={() => setOpen(null)} title={sel?.nom || 'Article'} icon={Package}
        status={sel ? (sel.out ? { label: 'Rupture', tone: 'danger' } : { label: 'Stock bas', tone: 'warning' }) : null}
        value={sel ? `${Number(sel.stock || 0)} restant${Number(sel.stock || 0) > 1 ? 's' : ''}` : null}
        sections={sel ? nettoyer([{ label: 'Article', rows: [
          ['Catégorie', sel.cat || null],
          ['Prix', sel.prix != null ? fmt(sel.prix) : null],
          ["Seuil d'alerte", String(sel.seuilAlerte ?? 10)],
        ] }, { label: 'Pourquoi', content: <Note>{sel.out ? "L'article n'a plus de stock : il ne peut plus être vendu ni réservé." : "Le stock est passé sous le seuil d'alerte de l'article."}</Note> }]) : []}
        actions={go && sel ? <Button block variant="secondary" icon={ChevronRight} onClick={() => { setOpen(null); go('menu') }}>Ouvrir la carte</Button> : null} />
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
  const [open, setOpen] = useState(null)
  const sel = open ? list.find(f => f.id === open) : null

  return (
    <Card title="Dépenses" subtitle={finances ? `${fmt(totalJour)} aujourd'hui` : undefined} flush
      actions={seeAll('Finances', 'finances', go)}>
      {!finances ? <div className={s.pad}><Skeleton lines={3} /></div>
        : list.length === 0 ? <Empty icon={Wallet} title="Aucune dépense enregistrée">Les dépenses saisies dans Finances apparaîtront ici.</Empty>
        : (
          <ul className={s.list}>
            {list.map(f => (
              <li key={f.id}>
                <button type="button" className={clsx(s.row, s.rowBtn)} aria-haspopup="dialog" onClick={() => setOpen(f.id)}>
                  <span className={s.rowMain}>{f.libelle || f.categorie || 'Sans libellé'}</span>
                  <span className={s.amountOut}>−{fmt(f.montant || 0)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      {/* Détail d'une dépense (23/11/2026) */}
      <DetailSheet open={!!sel} onClose={() => setOpen(null)} title="Dépense" icon={Wallet}
        status={sel ? (sel.statut === 'paye' ? { label: 'Payé', tone: 'success' } : sel.statut === 'prevu' ? { label: 'Prévu', tone: 'warning' } : null) : null}
        value={sel ? `−${fmt(sel.montant || 0)}` : null} sub={sel ? (sel.libelle || sel.categorie || 'Sans libellé') : null}
        sections={sel ? nettoyer([{ label: 'Mouvement', rows: [
          ['Catégorie', sel.categorie || null],
          ['Date', sel.date || null],
          ['Mode de paiement', MODE_FIN[sel.modePaiement] || sel.modePaiement || null],
          ['Justificatifs', sel.documents?.length ? String(sel.documents.length) : null],
        ] }]) : []}
        actions={go && sel ? <Button block variant="secondary" icon={ChevronRight} onClick={() => { setOpen(null); go('finances') }}>Voir dans Finances</Button> : null} />
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
    return { planned, paid, aPayer: sum(planned), aPayerCount: planned.length, payes: sum(paid), payesCount: paid.length, prochains: planned.slice(0, 3) }
  }, [cachets])
  // Détail (23/11/2026) : 'apayer' | 'payes' | id d'un cachet
  const [open, setOpen] = useState(null)
  const fig = open === 'apayer' || open === 'payes' ? open : null
  const sel = open && !fig ? (cachets || []).find(c => c.id === open) : null
  const figList = fig === 'apayer' ? k.planned : fig === 'payes' ? k.paid : []
  const voir = go ? <Button block variant="secondary" icon={ChevronRight} onClick={() => { setOpen(null); go('cachets') }}>Ouvrir les cachets</Button> : null

  return (
    <Card title="Cachets" actions={seeAll('Cachets', 'cachets', go)}>
      {!cachets ? <Skeleton lines={3} /> : (
        <>
          <div className={s.figures}>
            <button type="button" className={clsx(s.figure, s.figureBtn, k.aPayer > 0 && s.figureWarn)} aria-haspopup="dialog" onClick={() => setOpen('apayer')}>
              <span>À payer{k.aPayerCount ? ` · ${k.aPayerCount}` : ''}</span>
              <b><AnimatedNumber value={k.aPayer} format={fmt} /></b>
            </button>
            <button type="button" className={clsx(s.figure, s.figureBtn)} aria-haspopup="dialog" onClick={() => setOpen('payes')}>
              <span>Payés{k.payesCount ? ` · ${k.payesCount}` : ''}</span>
              <b><AnimatedNumber value={k.payes} format={fmt} /></b>
            </button>
          </div>
          {k.prochains.length === 0 ? (
            <p className={s.note}>{cachets.length ? 'Tous les cachets sont réglés.' : 'Aucun cachet pour cet événement.'}</p>
          ) : (
            <ul className={clsx(s.list, s.listTight)}>
              {k.prochains.map(c => (
                <li key={c.id}>
                  <button type="button" className={clsx(s.row, s.rowBtn)} aria-haspopup="dialog" onClick={() => setOpen(c.id)}>
                    <span className={s.rowMain}><Mic size={13} aria-hidden="true" /> {c.artiste || '—'}</span>
                    <span className={s.amount}>{fmt(c.montant || 0)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <DetailSheet open={!!fig} onClose={() => setOpen(null)} title={fig === 'apayer' ? 'Cachets à payer' : 'Cachets payés'} icon={Mic}
        value={fig ? fmt(fig === 'apayer' ? k.aPayer : k.payes) : null}
        sub={fig ? `${figList.length} cachet${figList.length > 1 ? 's' : ''}` : null}
        sections={fig ? nettoyer([
          { label: 'Par mode de paiement', content: <Repartition rows={grouper(figList, c => MODE_CACHET[c.modePaiement] || c.modePaiement)} empty="Aucun cachet." /> },
          figList.length > 0 && { label: figList.length > 8 ? 'Les 8 plus gros' : 'Artistes', rows: [...figList].sort((a, b) => (b.montant || 0) - (a.montant || 0)).slice(0, 8).map(c => [c.artiste || '—', fmt(c.montant || 0)]) },
        ]) : []}
        actions={fig ? voir : null} />
      <DetailSheet open={!!sel} onClose={() => setOpen(null)} title={sel ? `Cachet · ${sel.artiste || '—'}` : 'Cachet'} icon={Mic}
        status={sel ? (sel.statut === 'paye' ? { label: 'Payé', tone: 'success' } : sel.statut === 'annule' ? { label: 'Annulé', tone: 'neutral' } : { label: 'À payer', tone: 'warning' }) : null}
        value={sel ? fmt(sel.montant || 0) : null}
        sections={sel ? nettoyer([{ label: 'Paiement', rows: [
          ['Mode', MODE_CACHET[sel.modePaiement] || sel.modePaiement || null],
          ['N° de décharge', sel.numeroDecharge || null],
        ] }]) : []}
        actions={sel ? voir : null} />
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
  const [open, setOpen] = useState(null)
  const sel = open ? (planning || []).find(c => c.id === open) : null
  const jour = (v) => { const ms = toMs(v); return ms ? new Date(ms).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : null }

  return (
    <Card title="Prochains créneaux" flush actions={seeAll('Planning', 'planning', go)}>
      {!planning ? <div className={s.pad}><Skeleton lines={4} /></div>
        : next.length === 0 ? <Empty icon={CalendarDays} title="Aucun créneau à venir">Les prochains passages du planning apparaîtront ici.</Empty>
        : (
          <ul className={s.list}>
            {next.map(c => (
              <li key={c.id}>
                <button type="button" className={clsx(s.row, s.rowBtn)} aria-haspopup="dialog" onClick={() => setOpen(c.id)}>
                  <span className={clsx(s.time, live(c) && s.timeLive)}>{hhmm(c.debut)}</span>
                  <span className={s.rowText}>
                    <b>{c.artiste || c.titre || '—'}</b>
                    {c.scene && <span>{c.scene}</span>}
                  </span>
                  {live(c) && <Badge tone="brand">En cours</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      {/* Détail d'un créneau (23/11/2026) */}
      <DetailSheet open={!!sel} onClose={() => setOpen(null)} title={sel ? (sel.artiste || sel.titre || 'Créneau') : 'Créneau'} icon={CalendarDays}
        status={sel ? (live(sel) ? { label: 'En cours', tone: 'brand' } : { label: 'À venir', tone: 'neutral' }) : null}
        value={sel ? `${hhmm(sel.debut)}${toMs(sel.fin) ? ` – ${hhmm(sel.fin)}` : ''}` : null}
        sub={sel ? jour(sel.debut) : null}
        sections={sel ? nettoyer([{ label: 'Créneau', rows: [
          ['Artiste', sel.artiste || null],
          ['Titre', sel.titre && sel.titre !== sel.artiste ? sel.titre : null],
          ['Scène', sel.scene || null],
          ['Durée', toMs(sel.debut) && toMs(sel.fin) ? `${Math.round((toMs(sel.fin) - toMs(sel.debut)) / 60000)} min` : null],
        ] }]) : []}
        actions={go && sel ? <Button block variant="secondary" icon={ChevronRight} onClick={() => { setOpen(null); go('planning') }}>Ouvrir le planning</Button> : null} />
    </Card>
  )
}

/* ── Spectateurs : inscrits et avec solde (WSpectateurs) ─────────────── */
export function SpectateursBlock({ go }) {
  const { spectateurs } = useAppStore()
  const [open, setOpen] = useState(false)
  const list = spectateurs || []
  const total = list.length
  const actifs = list.filter(sp => (sp.solde || 0) > 0).length
  const neg = list.filter(sp => (sp.solde || 0) < 0).length
  const minuit = startOfToday()
  return (
    <>
      <Stat label="Spectateurs" icon={Users} tone="brand" value={<AnimatedNumber value={total} />} sub={`${actifs} avec solde`} className={s.fill}
        onClick={() => setOpen(true)} />
      {/* Détail (23/11/2026) : comptes, sans aucun nom */}
      <DetailSheet open={open} onClose={() => setOpen(false)} title="Spectateurs" icon={Users} value={String(total)} sub="Comptes de l'événement"
        sections={[{ label: 'Comptes', rows: [
          ['Avec un solde', String(actifs)],
          ['À zéro', String(total - actifs - neg)],
          ['Solde négatif', String(neg)],
          ['Créés depuis minuit', String(list.filter(sp => getTs(sp) >= minuit).length)],
        ] }]}
        actions={go ? <Button block variant="secondary" icon={ChevronRight} onClick={() => { setOpen(false); go('spectateurs') }}>Voir les spectateurs</Button> : null} />
    </>
  )
}

/* ── Bénévoles : inscrits et actifs aujourd'hui (WBenevoles) ─────────── */
export function BenevolesBlock({ go }) {
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
  const [open, setOpen] = useState(false)
  return (
    <>
      <Stat label="Bénévoles" icon={HandHeart} tone="success" className={s.fill}
        value={benevoles ? <AnimatedNumber value={benevoles.length} /> : <Skeleton width={48} height={24} />}
        sub={actifs > 0 ? `${actifs} actif${actifs > 1 ? 's' : ''} aujourd'hui` : 'Inscrits au total'}
        onClick={() => setOpen(true)} />
      {/* Détail (23/11/2026) : chiffres seulement, sans aucun nom */}
      <DetailSheet open={open} onClose={() => setOpen(false)} title="Bénévoles" icon={HandHeart}
        value={benevoles ? String(benevoles.length) : '…'} sub="Inscrits pour l'événement"
        sections={[
          { label: 'Activité', rows: [['Inscrits', benevoles ? String(benevoles.length) : '…'], ["Actifs aujourd'hui", String(actifs)]] },
          { label: 'Ce que compte ce chiffre', content: <Note>« Actifs aujourd'hui » : bénévoles qui ont retiré au moins une commande depuis minuit.</Note> },
        ]}
        actions={go ? <Button block variant="secondary" icon={ChevronRight} onClick={() => { setOpen(false); go('benevoles') }}>Voir les bénévoles</Button> : null} />
    </>
  )
}
