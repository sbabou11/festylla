/**
 * components/detailContenus.jsx — contenus partagés des fenêtres de détail (23/11/2026, maquette validée)
 *
 * Bâtis sur DetailSheet :
 *   TxDetailSheet    une transaction (statut, montant, articles, client, encaissé par, solde après…)
 *   ResaDetailSheet  une réservation (articles avec stand, client, suivi) + actions de l'écran appelant
 *   Repartition      décomposition d'un chiffre en barres (moyen de paiement, caisse, statut…)
 *   BarresHeures     petit histogramme heure par heure
 *
 * Règle (audit du 23/11/2026) : n'afficher que des champs déjà présents dans les données que
 * l'écran appelant a chargées pour ce rôle. Aucune requête ici.
 */
import React from 'react'
import { Receipt, PlusCircle, ShoppingCart, Package, Undo2, Bookmark } from 'lucide-react'
import { fmt } from '../utils/helpers'
import { pastilleTx } from '../utils/nvPastilles'
import { txTime, dayStart } from '../utils/dashboardData'
import DetailSheet from './DetailSheet'
import s from './detailContenus.module.css'

// ─── Transactions ──────────────────────────────────────────────────────
export const TX_TYPE_LABEL = {
  credit: 'Recharge', debit: 'Achat', retrait: 'Retrait de réservation', reservation: 'Réservation', annulation: 'Annulation',
  'benev-reservation': 'Résa bénévole', 'benev-retrait': 'Retrait bénévole', 'benev-annulation': 'Annul. bénévole',
  'artist-gift': 'Avantage artiste', don: 'Don ONG Ylla', remboursement: 'Remboursement',
  debit_correction: 'Correction −', credit_correction: 'Correction +',
}
export const TX_TYPE_TONE = {
  credit: 'brand', debit: 'danger', retrait: 'brand', reservation: 'warning', annulation: 'neutral',
  'benev-reservation': 'warning', 'benev-retrait': 'brand', 'benev-annulation': 'neutral', 'artist-gift': 'coral', don: 'coral',
}
const NO_SIGN = ['reservation', 'benev-reservation', 'annulation', 'benev-annulation', 'benev-retrait', 'artist-gift']
export const txSign = (t) => (t.type === 'credit' || t.type === 'credit_correction') ? '+' : NO_SIGN.includes(t.type) ? '' : '−'
export const MOYEN_LABEL = { especes: 'Espèces', cb: 'Carte bancaire', solde: 'Solde YllaCash', sumup: 'Carte (SumUp)' }
export const moyenLabel = (m) => (m ? (MOYEN_LABEL[m] || m) : 'Non précisé')
const TX_ICON = { credit: PlusCircle, credit_correction: PlusCircle, debit: ShoppingCart, retrait: Package, 'benev-retrait': Package, annulation: Undo2, 'benev-annulation': Undo2, reservation: Bookmark, 'benev-reservation': Bookmark }

const heureDe = (t) => {
  if (t.heure) return String(t.heure).slice(0, 5)
  const ms = t.createdAt?.seconds ? t.createdAt.seconds * 1000 : t.timestamp ? Date.parse(t.timestamp) : NaN
  return Number.isNaN(ms) ? '' : new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}
// Rubriques clé/valeur sans aucune valeur : retirées (pas de titre seul)
export const nettoyer = (sections) => sections.filter(x => x && (!x.rows || x.rows.some(r => r && r[1] != null && r[1] !== '')))
const prixLigne = (it) => it.total ?? (it.prixUnit || it.prix || 0) * (it.qty || 1)
const standDe = (it) => it.standNom || it.stand || (it.standNumero ? `Stand n° ${it.standNumero}` : '')

/** Liste d'articles (quantité, nom, stand si connu, prix) */
export function Articles({ items = [], prix = true }) {
  if (!items.length) return null
  return (
    <ul className={s.items}>
      {items.map((it, i) => (
        <li key={i} className={s.item}>
          <span className={s.qty}>{it.qty || 1}</span>
          <span className={s.itemTxt}><b>{it.nom || '—'}</b>{standDe(it) && <span>{standDe(it)}</span>}</span>
          {prix && (it.total != null || it.prixUnit || it.prix) ? <span className={s.itemPrix}>{fmt(prixLigne(it))}</span> : null}
        </li>
      ))}
    </ul>
  )
}

/**
 * tx       la transaction (null = fermé)
 * client   nom affiché du compte (déjà calculé par l'écran)
 * actions  boutons existants de l'écran (ex. « Annuler cette vente »)
 */
export function TxDetailSheet({ tx, client, onClose, actions = null }) {
  const t = tx || {}
  const typeLabel = TX_TYPE_LABEL[t.type] || t.type || 'Transaction'
  const items = Array.isArray(t.items) ? t.items : []
  return (
    <DetailSheet open={!!tx} onClose={onClose} title={typeLabel}
      icon={TX_ICON[t.type] || Receipt} color={pastilleTx(t.type)}
      status={t.annulee ? { label: 'Annulée', tone: 'neutral' } : { label: typeLabel, tone: TX_TYPE_TONE[t.type] || 'neutral' }}
      value={tx ? <span className={t.annulee ? s.struck : undefined}>{txSign(t)}{fmt(t.montant || 0)}</span> : null}
      sub={t.label || null}
      sections={nettoyer([
        items.length > 0 && { label: 'Articles', content: <Articles items={items} /> },
        { label: 'Client', rows: [
          ['Compte', client || t.benevoleNom || t.specNom || null],
          ['N° de compte', t.specId ? <span className={s.mono}>{t.specId}</span> : null],
          ['Solde avant', t.soldeBefore != null ? fmt(t.soldeBefore) : null],
          ['Solde après', t.soldeAfter != null ? fmt(t.soldeAfter) : null],
        ] },
        { label: 'Opération', rows: [
          ['Date', t.date || null],
          ['Heure', heureDe(t) || null],
          [t.type === 'credit' ? 'Rechargé par' : 'Encaissé par', t.staff || null],
          ['Moyen de paiement', t.moyen ? moyenLabel(t.moyen) : null],
          ['Réservation', t.resaCode ? `#${t.resaCode}` : null],
          ['Code', t.code || null],
          ['Motif', t.motif || null],
        ] },
        t.annulee && { label: 'Annulation', rows: [
          ['Annulée par', t.annuleePar || null],
          ['Le', t.annuleeLe ? new Date(t.annuleeLe).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null],
          ['Motif', t.annuleeMotif || null],
        ] },
      ])}
      actions={actions}
    />
  )
}

// ─── Réservations ──────────────────────────────────────────────────────
const enDate = (v) => {
  if (!v) return null
  if (v.toDate) return v.toDate()
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000)
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
const quand = (v) => {
  const d = enDate(v)
  if (!d) return typeof v === 'string' ? v : ''
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/**
 * resa     la réservation (null = fermé)
 * statut   { label, tone } calculé par l'écran ; total : texte déjà calculé par l'écran
 * actions  boutons existants (Prendre en charge, Marquer prête, Valider le retrait, Annuler…)
 */
export function ResaDetailSheet({ resa, statut, total, onClose, actions = null, children }) {
  const r = resa || {}
  const items = r.items || []
  return (
    <DetailSheet open={!!resa} onClose={onClose} title={resa ? `Réservation #${r.code || '—'}` : 'Réservation'}
      icon={Bookmark} color={pastilleTx(r.isBenev ? 'benev-reservation' : 'reservation')}
      status={statut}
      value={total ?? (r.isBenev ? null : fmt(r.total || 0))}
      sub={[r.benevoleNom || r.specNom, r.isBenev ? 'Bénévole' : null].filter(Boolean).join(' · ') || null}
      sections={nettoyer([
        items.length > 0 && { label: 'Articles', content: <Articles items={items} prix={!r.isBenev} /> },
        { label: 'Client', rows: [
          ['Nom', r.benevoleNom || r.specNom || null],
          ['N° de compte', r.specId ? <span className={s.mono}>{r.specId}</span> : null],
        ] },
        { label: 'Suivi', rows: [
          ['Passée', quand(r.createdAt) || r.date || null],
          ['Prise en charge par', r.status !== 'pending' ? (r.assignedStaff || null) : null],
          ['Retirée', r.collectedAt ? [quand(r.collectedAt), r.collectedBy].filter(Boolean).join(' · ') : null],
          ['Annulée', r.status === 'cancelled' ? (quand(r.cancelledAt) || 'oui') : null],
          ['Motif', r.status === 'cancelled' ? (r.motifAnnulation || null) : null],
        ] },
      ])}
      actions={actions}
    >{children}</DetailSheet>
  )
}

// ─── Décompositions ────────────────────────────────────────────────────
/**
 * rows : [{ label, value, count?, display? }]  value sert à la longueur de la barre
 * money : true → value affichée en euros (centimes), sinon display ou value brute
 */
export function Repartition({ rows = [], money = true, empty = 'Aucune donnée pour cette période.' }) {
  const list = rows.filter(r => r && (r.value || r.count))
  if (!list.length) return <p className={s.empty}>{empty}</p>
  const max = Math.max(1, ...list.map(r => Math.abs(r.value || 0)))
  return (
    <ul className={s.rep}>
      {list.map((r, i) => (
        <li key={r.label + i} className={s.repRow}>
          <span className={s.repTop}>
            <span className={s.repLab}>{r.label}</span>
            <b className={s.repVal}>
              {r.display ?? (money ? fmt(r.value || 0) : r.value)}
              {r.count != null && <span className={s.repCount}> · {r.count}</span>}
            </b>
          </span>
          <span className={s.repBar} aria-hidden="true"><i style={{ width: `${Math.max(2, Math.round((Math.abs(r.value || 0) / max) * 100))}%` }} /></span>
        </li>
      ))}
    </ul>
  )
}

/** Histogramme heure par heure : buckets [{ hour, value }], money : affichage en euros */
export function BarresHeures({ buckets = [], money = true, label = 'Montant par heure' }) {
  const max = Math.max(0, ...buckets.map(b => b.value || 0))
  if (!(max > 0)) return <p className={s.empty}>Aucune opération horodatée pour cette période.</p>
  const pic = buckets.reduce((a, b) => (b.value > (a?.value || 0) ? b : a), null)
  return (
    <figure className={s.hours}>
      <div className={s.hoursBars} role="img" aria-label={`${label}. Heure la plus forte : ${pic.hour}h, ${money ? fmt(pic.value) : pic.value}.`}>
        {buckets.map((b, i) => (
          <span key={i} className={s.hourCol} title={`${b.hour}h : ${money ? fmt(b.value || 0) : (b.value || 0)}`}>
            <i style={{ height: `${b.value ? Math.max(4, Math.round((b.value / max) * 100)) : 0}%` }} className={b === pic ? s.hourPeak : undefined} />
            <small>{b.hour}h</small>
          </span>
        ))}
      </div>
      <figcaption className={s.hoursCap}>Heure la plus forte : <b>{pic.hour}h</b> · {money ? fmt(pic.value) : pic.value}</figcaption>
    </figure>
  )
}

/** Texte de définition (période, ce que compte le chiffre) */
export const Note = ({ children }) => <p className={s.note}>{children}</p>

/**
 * Montants heure par heure depuis `from` (par défaut début de la journée festival, 6h) jusqu'à
 * maintenant, à partir de la première heure active ; 12 heures au plus (les plus récentes).
 * list : transactions déjà filtrées par l'écran.
 */
export function parHeure(list, now = Date.now(), from = dayStart(now), valueOf = (t) => t.montant || 0) {
  const start = from
  const n = Math.max(0, Math.min(24, Math.floor((now - start) / 3600000) + 1))
  const buckets = Array.from({ length: n }, (_, i) => ({ hour: new Date(start + i * 3600000).getHours(), value: 0 }))
  list.forEach(t => {
    const ms = txTime(t)
    if (ms == null || ms < start || ms > now) return
    const b = buckets[Math.floor((ms - start) / 3600000)]
    if (b) b.value += valueOf(t)
  })
  const first = buckets.findIndex(b => b.value)
  if (first < 0) return []
  return buckets.slice(first).slice(-12)
}

/** Regroupe des montants par clé : [{ label, value, count }] du plus fort au plus faible */
export function grouper(list, keyOf, valueOf = (t) => t.montant || 0) {
  const by = new Map()
  list.forEach(t => {
    const k = keyOf(t) || 'Non précisé'
    const cur = by.get(k) || { label: k, value: 0, count: 0 }
    cur.value += valueOf(t); cur.count += 1
    by.set(k, cur)
  })
  return [...by.values()].sort((a, b) => b.value - a.value)
}
