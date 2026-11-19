/**
 * pages/billetterie/DemandesRemboursement.jsx — onglet « Demandes » de la page Remboursement (20/11/2026)
 *
 * Le spectateur demande le remboursement de son solde depuis son espace. La part rechargée en ligne
 * est déjà remboursée par Stripe ; la billetterie traite le reste :
 *   - carte à la billetterie : rembourser dans l'appli SumUp, puis « Remboursé dans SumUp » ;
 *   - espèces : remettre la somme, prise dans le coffre.
 * Le montant rendu ne dépasse jamais le solde du moment. Chaque action est rattachée au bénévole.
 */
import React, { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Globe, CreditCard, Banknote, ChevronLeft, Inbox } from 'lucide-react'
import useEventStore from '../../store/useEventStore'
import useAuthStore from '../../store/useAuthStore'
import { watchDemandesRemboursement, traiterPartDemande, refuserDemande } from '../../firebase/service'
import { fmt } from '../../utils/helpers'
import { friendlyError } from '../../utils/errors'
import { Button, Badge, Empty, Dialog, toast } from '../../ui'
import s from './demandes.module.css'

const STATUT = {
  en_attente: ['warning', 'En attente'],
  rembourse:  ['success', 'Remboursé'],
  annule:     ['neutral', 'Annulée'],
  refuse:     ['danger', 'Refusée'],
  echec:      ['danger', 'Échec'],
}
const PART = {
  a_traiter: ['warning', 'À traiter'],
  rembourse: ['success', 'Remboursé'],
  annule:    ['neutral', 'Annulé par le spectateur'],
  refuse:    ['danger', 'Refusé'],
}
const STRIPE = {
  rembourse: ['success', 'Remboursé par Stripe'],
  partiel:   ['warning', 'Remboursé en partie'],
  echec:     ['danger', 'Refusé par la banque'],
  en_cours:  ['warning', 'En cours'],
}
const resteAFaire = (d) => ['sumup', 'especes'].filter(k => d[k]?.statut === 'a_traiter').length
const heureDe = (d) => `${String(d.date || '').slice(0, 5)} à ${String(d.heure || '').slice(0, 5)}`

export default function DemandesRemboursement({ onCount }) {
  const { currentEventId } = useEventStore()
  const { user } = useAuthStore()
  const [demandes, setDemandes] = useState([])
  const [ouverte, setOuverte] = useState(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [refus, setRefus] = useState(false)

  useEffect(() => watchDemandesRemboursement(setDemandes, currentEventId), [currentEventId])
  const aTraiter = demandes.filter(d => d.statut === 'en_attente')
  const traitees = demandes.filter(d => d.statut !== 'en_attente')
  useEffect(() => { onCount?.(aTraiter.length) }, [aTraiter.length, onCount])

  const d = ouverte ? demandes.find(x => x.id === ouverte) : null
  const staff = user?.nom || 'Billetterie'

  const traiter = async (part) => {
    setBusy(part); setErr('')
    try {
      const m = await traiterPartDemande({ demandeId: d.id, part, staff }, currentEventId)
      toast.success(part === 'sumup' ? `${fmt(m)} enregistrés comme remboursés dans SumUp` : `${fmt(m)} remis en espèces`)
    } catch (e) { setErr(friendlyError(e, 'Le remboursement n\'a pas pu être enregistré.')) }
    finally { setBusy('') }
  }
  const refuser = async () => {
    setRefus(false); setBusy('refus'); setErr('')
    try { await refuserDemande({ demandeId: d.id, staff }, currentEventId); toast.success('Demande refusée') }
    catch (e) { setErr(friendlyError(e, 'La demande n\'a pas pu être refusée.')) }
    finally { setBusy('') }
  }

  if (d) {
    const st = STATUT[d.statut] || STATUT.en_attente
    return (
      <div className={s.stack}>
        <button type="button" className={s.back} onClick={() => { setOuverte(null); setErr('') }}><ChevronLeft size={16} /> Demandes</button>
        <section className={s.card}>
          <div className={s.head}>
            <div><b className={s.nom}>{d.specNom}</b><span className={s.muted}>{d.specId} · demande du {heureDe(d)}</span></div>
            <Badge tone={st[0]}>{d.statut === 'en_attente' ? `${resteAFaire(d)} part${resteAFaire(d) > 1 ? 's' : ''} à traiter` : st[1]}</Badge>
          </div>
          <div className={s.total}><span className={s.muted}>Demandé</span><b>{fmt(d.total || 0)}</b></div>

          {d.stripe?.statut !== 'sans' && (
            <div className={s.part}>
              <div className={s.partHead}>
                <span className={clsx(s.icon, s.enligne)}><Globe size={16} aria-hidden="true" /></span>
                <span className={s.partText}><b>Carte en ligne (Stripe)</b><span className={s.muted}>Fait automatiquement à la demande</span></span>
                <b>{fmt(d.stripe.rendu ?? d.stripe.montant)}</b>
              </div>
              <Badge tone={(STRIPE[d.stripe.statut] || STRIPE.en_cours)[0]}>{(STRIPE[d.stripe.statut] || STRIPE.en_cours)[1]}</Badge>
            </div>
          )}

          {d.sumup?.statut !== 'sans' && (
            <div className={s.part}>
              <div className={s.partHead}>
                <span className={clsx(s.icon, s.sumup)}><CreditCard size={16} aria-hidden="true" /></span>
                <span className={s.partText}>
                  <b>Carte à la billetterie (SumUp)</b>
                  {(d.sumup.recharges || []).map((r, i) => (
                    <span key={i} className={s.muted}>Recharge de {fmt(r.montant)} le {String(r.date).slice(0, 5)} à {String(r.heure).slice(0, 5)}{r.staff ? ` · par ${r.staff}` : ''}</span>
                  ))}
                </span>
                <b>{fmt(d.sumup.rendu ?? d.sumup.montant)}</b>
              </div>
              {d.sumup.statut === 'a_traiter' ? (<>
                <p className={s.hint}>Dans l'appli SumUp : Transactions → retrouvez la recharge ci-dessus → Rembourser {fmt(d.sumup.montant)}.</p>
                <Button variant="secondary" block loading={busy === 'sumup'} disabled={!!busy} onClick={() => traiter('sumup')}>Remboursé dans SumUp</Button>
              </>) : <Badge tone={(PART[d.sumup.statut] || PART.a_traiter)[0]}>{(PART[d.sumup.statut] || PART.a_traiter)[1]}{d.sumup.par ? ` · ${d.sumup.par}` : ''}</Badge>}
            </div>
          )}

          {d.especes?.statut !== 'sans' && (
            <div className={s.part}>
              <div className={s.partHead}>
                <span className={clsx(s.icon, s.especes)}><Banknote size={16} aria-hidden="true" /></span>
                <span className={s.partText}><b>Espèces</b><span className={s.muted}>Sort du coffre de la billetterie</span></span>
                <b>{fmt(d.especes.rendu ?? d.especes.montant)}</b>
              </div>
              {d.especes.statut === 'a_traiter'
                ? <Button variant="coral" block loading={busy === 'especes'} disabled={!!busy} onClick={() => traiter('especes')}>Remettre {fmt(d.especes.montant)} en espèces</Button>
                : <Badge tone={(PART[d.especes.statut] || PART.a_traiter)[0]}>{(PART[d.especes.statut] || PART.a_traiter)[1]}{d.especes.par ? ` · ${d.especes.par}` : ''}</Badge>}
            </div>
          )}

          <p className={s.muted}>Si le spectateur a dépensé depuis sa demande, on ne rend que son solde du moment.</p>
          {err && <p className={s.err} role="alert">{err}</p>}
        </section>
        {d.statut === 'en_attente' && (
          <Button variant="ghost" block disabled={!!busy} onClick={() => setRefus(true)}>Refuser la demande</Button>
        )}
        <Dialog open={refus} onClose={() => setRefus(false)} title="Refuser cette demande ?"
          footer={<>
            <Button variant="secondary" onClick={() => setRefus(false)}>Garder</Button>
            <Button variant="danger" onClick={refuser}>Refuser</Button>
          </>}>
          <p className={s.muted}>Le solde restant du spectateur ne change pas. Il pourra refaire une demande.</p>
        </Dialog>
      </div>
    )
  }

  if (!demandes.length) {
    return <Empty icon={Inbox} title="Aucune demande">Les demandes de remboursement envoyées depuis les espaces spectateurs apparaîtront ici.</Empty>
  }
  const Ligne = ({ x }) => {
    const st = STATUT[x.statut] || STATUT.en_attente
    const parts = ['sumup', 'especes'].filter(k => x[k] && x[k].statut !== 'sans')
    const aRendre = parts.reduce((a, k) => a + (x[k].montant || 0), 0)
    return (
      <button type="button" className={s.row} onClick={() => setOuverte(x.id)}>
        <span className={s.rowMain}>
          <b>{x.specNom}</b>
          <span className={s.muted}>{x.specId} · {heureDe(x)}</span>
          <span className={s.muted}>{parts.map(k => k === 'sumup' ? 'SumUp' : 'espèces').join(' + ') || 'en ligne seulement'}</span>
        </span>
        <span className={s.rowEnd}>
          <Badge tone={st[0]}>{st[1]}</Badge>
          <b>{fmt(x.statut === 'en_attente' ? aRendre : x.total || 0)}</b>
        </span>
      </button>
    )
  }
  return (
    <div className={s.stack}>
      {aTraiter.length > 0 && <span className={s.label}>À traiter</span>}
      {aTraiter.map(x => <Ligne key={x.id} x={x} />)}
      {traitees.length > 0 && <span className={s.label}>Traitées</span>}
      {traitees.slice(0, 30).map(x => <Ligne key={x.id} x={x} />)}
    </div>
  )
}
