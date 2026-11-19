/**
 * pages/billetterie/RemboursementTicket.jsx — remboursement par ticket et annulation d'un code (lot 5)
 *
 * Ticket : on tape le numéro imprimé (ex. 47-4), on coche les articles à rembourser.
 * Le remboursement suit le paiement d'origine : solde recrédité, espèces du coffre, ou carte
 * SumUp (à rendre aussi sur le terminal). Une seule fois par ticket, rattaché au bénévole.
 * Code : un code de la billetterie pas encore utilisé à la borne s'annule et se rembourse.
 */
import React, { useState } from 'react'
import clsx from 'clsx'
import { Search, Banknote, CreditCard, Wallet, Check, AlertTriangle, RefreshCw, KeyRound, Ticket } from 'lucide-react'
import useEventStore from '../../store/useEventStore'
import useAuthStore from '../../store/useAuthStore'
import { trouverTicket, rembourserTicket, lireCode, annulerCodeBilletterie } from '../../firebase/service'
import { fmt } from '../../utils/helpers'
import { friendlyError } from '../../utils/errors'
import { Button, Badge } from '../../ui'
import s from './rembTicket.module.css'

const PAIEMENT = {
  solde:   { label: 'Solde du compte', icon: Wallet,     tone: 'brand',   rendu: 'Le solde du client est recrédité tout de suite.' },
  especes: { label: 'Espèces',         icon: Banknote,   tone: 'success', rendu: 'Rendez la somme en espèces, prise dans le coffre.' },
  cb:      { label: 'Carte SumUp',     icon: CreditCard, tone: 'coral',   rendu: 'Remboursez aussi la somme sur le terminal SumUp.' },
}
const paiementDe = (k) => PAIEMENT[k] || PAIEMENT.especes
const dateDe = (c) => {
  const ms = c?.createdAt?.toMillis?.() ?? (c?.timestamp ? Date.parse(c.timestamp) : null)
  return ms ? new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
}

export function RemboursementTicketForm() {
  const { currentEventId } = useEventStore()
  const { user } = useAuthStore()
  const [saisie, setSaisie] = useState('')
  const [ticket, setTicket] = useState(null)
  const [coches, setCoches] = useState({})
  const [motif, setMotif] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null)

  const chercher = async (e) => {
    e?.preventDefault()
    setErr(''); setTicket(null); setDone(null)
    if (!saisie.trim()) { setErr('Tapez le numéro du ticket, par exemple 47-4.'); return }
    setBusy(true)
    try {
      const t = await trouverTicket(saisie, currentEventId)
      setTicket(t)
      setCoches(Object.fromEntries(t.lignes.map(l => [l.index, true])))
    } catch (e2) { setErr(friendlyError(e2, 'Ticket introuvable.')) }
    finally { setBusy(false) }
  }

  const choisis = ticket ? ticket.lignes.filter(l => coches[l.index]) : []
  const montant = choisis.reduce((t, l) => t + (Number(l.total) || (l.prixUnit || 0) * (l.qty || 1)), 0)

  const rembourser = async () => {
    setBusy(true); setErr('')
    try {
      const r = await rembourserTicket({
        commandeId: ticket.commande.id, ticketKey: ticket.ticketKey, numeroTicket: ticket.numeroTicket,
        indexes: choisis.map(l => l.index), staff: user?.nom || 'Billetterie', motif: motif.trim(),
      }, currentEventId)
      setDone({ ...r, numeroTicket: ticket.numeroTicket, client: ticket.commande.specId ? `${ticket.commande.specNom || ''} · ${ticket.commande.specId}` : null })
      setTicket(null); setSaisie(''); setMotif('')
    } catch (e) { setErr(friendlyError(e, "Le remboursement n'est pas passé. Rien n'a été enregistré.")) }
    finally { setBusy(false) }
  }

  if (done) {
    const p = paiementDe(done.paiement)
    return (
      <div className={s.done}>
        <span className={s.doneIcon}><Check size={28}/></span>
        <h2>Ticket {done.numeroTicket} remboursé</h2>
        <b className={s.doneAmount}>{fmt(done.montant)}</b>
        <Badge tone={p.tone} icon={p.icon}>{p.label}</Badge>
        <p className={s.muted}>{p.rendu}</p>
        {done.client && <p className={s.muted}>{done.client}{done.soldeAfter != null ? ` · nouveau solde ${fmt(done.soldeAfter)}` : ''}</p>}
        <Button block onClick={() => setDone(null)}>Rembourser un autre ticket</Button>
      </div>
    )
  }

  const p = ticket ? paiementDe(ticket.paiement) : null
  return (
    <div className={s.stack}>
      <form className={s.search} onSubmit={chercher}>
        <label className={s.label} htmlFor="remb-ticket">Numéro du ticket</label>
        <div className={s.searchRow}>
          <input id="remb-ticket" className={s.input} value={saisie} inputMode="numeric" autoComplete="off"
            placeholder="ex : 47-4" onChange={e => setSaisie(e.target.value)}/>
          <Button type="submit" icon={Search} loading={busy && !ticket}>Chercher</Button>
        </div>
        <p className={s.muted}>Le numéro est imprimé en bas du ticket : commande, puis stand.</p>
      </form>

      {err && <p className={s.err} role="alert"><AlertTriangle size={16}/> {err}</p>}

      {ticket && (
        <section className={s.card}>
          <header className={s.cardHead}>
            <span className={s.ticketNum}><Ticket size={18}/> Ticket {ticket.numeroTicket}</span>
            <Badge tone={p.tone} icon={p.icon}>{p.label}</Badge>
          </header>
          <p className={s.muted}>
            {dateDe(ticket.commande)}
            {ticket.commande.specId ? ` · ${ticket.commande.specNom || '—'} (${ticket.commande.specId})` : ' · client sans compte'}
          </p>

          {ticket.dejaRembourse ? (
            <p className={s.warn}>
              <AlertTriangle size={16}/>
              Déjà remboursé ({fmt(ticket.dejaRembourse.montant || 0)}) par {ticket.dejaRembourse.par || '—'}
              {ticket.dejaRembourse.le ? `, le ${new Date(ticket.dejaRembourse.le).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}.
              Un ticket ne se rembourse qu'une fois.
            </p>
          ) : (
            <>
              <div className={s.lines}>
                {ticket.lignes.map(l => (
                  <label key={l.index} className={clsx(s.line, coches[l.index] && s.lineOn)}>
                    <input type="checkbox" checked={!!coches[l.index]}
                      onChange={e => setCoches(c => ({ ...c, [l.index]: e.target.checked }))}/>
                    <span className={s.lineName}><b>{l.qty}×</b> {l.nom}<small>{fmt(l.prixUnit || 0)} l'unité</small></span>
                    <span className={s.lineTotal}>{fmt(Number(l.total) || (l.prixUnit || 0) * (l.qty || 1))}</span>
                  </label>
                ))}
              </div>
              <label className={s.field}>
                <span className={s.label}>Motif (facultatif)</span>
                <input className={s.input} value={motif} maxLength={120} placeholder="ex : plat épuisé au stand"
                  onChange={e => setMotif(e.target.value)}/>
              </label>
              <div className={s.total}><span>À rembourser</span><b>{fmt(montant)}</b></div>
              <p className={s.hint}>{p.rendu}</p>
              <Button variant="danger" size="lg" block loading={busy} disabled={!choisis.length || busy} onClick={rembourser}>
                Rembourser {fmt(montant)}
              </Button>
            </>
          )}
        </section>
      )}
    </div>
  )
}

export function AnnulationCodeForm() {
  const { currentEventId } = useEventStore()
  const { user } = useAuthStore()
  const [saisie, setSaisie] = useState('')
  const [code, setCode] = useState(null)
  const [motif, setMotif] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null)

  const chercher = async (e) => {
    e?.preventDefault()
    setErr(''); setCode(null); setDone(null)
    const c = saisie.replace(/\D/g, '')
    if (c.length !== 6) { setErr('Le code a 6 chiffres.'); return }
    setBusy(true)
    try {
      const d = await lireCode(c, currentEventId)
      if (!d) setErr('Code inconnu.')
      else setCode(d)
    } catch (e2) { setErr(friendlyError(e2, 'Code introuvable.')) }
    finally { setBusy(false) }
  }

  const annuler = async () => {
    setBusy(true); setErr('')
    try {
      const r = await annulerCodeBilletterie({ code: code.code, staff: user?.nom || 'Billetterie', motif: motif.trim() }, currentEventId)
      setDone({ ...r, code: code.code }); setCode(null); setSaisie(''); setMotif('')
    } catch (e) { setErr(friendlyError(e, "L'annulation n'est pas passée. Rien n'a été enregistré.")) }
    finally { setBusy(false) }
  }

  if (done) {
    const p = paiementDe(done.paiement)
    return (
      <div className={s.done}>
        <span className={s.doneIcon}><Check size={28}/></span>
        <h2>Code {done.code.slice(0, 3)} {done.code.slice(3)} annulé</h2>
        <b className={s.doneAmount}>{fmt(done.montant)}</b>
        <Badge tone={p.tone} icon={p.icon}>{p.label}</Badge>
        <p className={s.muted}>{p.rendu} Le code ne marche plus à la borne.</p>
        <Button block onClick={() => setDone(null)}>Annuler un autre code</Button>
      </div>
    )
  }

  const enAttente = code?.statut === 'en_attente'
  const enLigne = code?.origine === 'en-ligne'
  const p = code ? paiementDe(code.moyen) : null
  return (
    <div className={s.stack}>
      <form className={s.search} onSubmit={chercher}>
        <label className={s.label} htmlFor="remb-code">Code à 6 chiffres</label>
        <div className={s.searchRow}>
          <input id="remb-code" className={s.input} value={saisie} inputMode="numeric" autoComplete="off" maxLength={7}
            placeholder="ex : 482913" onChange={e => setSaisie(e.target.value)}/>
          <Button type="submit" icon={Search} loading={busy && !code}>Chercher</Button>
        </div>
        <p className={s.muted}>Pour un client qui n'est pas encore passé à la borne.</p>
      </form>

      {err && <p className={s.err} role="alert"><AlertTriangle size={16}/> {err}</p>}

      {code && (
        <section className={s.card}>
          <header className={s.cardHead}>
            <span className={s.ticketNum}><KeyRound size={18}/> Code {code.code.slice(0, 3)} {code.code.slice(3)}</span>
            {!enLigne && <Badge tone={p.tone} icon={p.icon}>{p.label}</Badge>}
          </header>
          <div className={s.lines}>
            {(code.items || []).map((l, i) => (
              <div key={i} className={s.line}>
                <span/>
                <span className={s.lineName}><b>{l.qty}×</b> {l.nom}</span>
                <span className={s.lineTotal}>{fmt(l.total || (l.prixUnit || 0) * (l.qty || 1))}</span>
              </div>
            ))}
          </div>
          {enLigne ? (
            <p className={s.warn}><AlertTriangle size={16}/> Code commandé en ligne : rien n'a été payé. Le client l'annule lui-même dans son espace.</p>
          ) : !enAttente ? (
            <p className={s.warn}><AlertTriangle size={16}/>
              {code.statut === 'annule' ? 'Ce code est déjà annulé.' : `Déjà utilisé à la borne (commande n° ${code.commandeNumero || '—'}) : remboursez plutôt les tickets.`}
            </p>
          ) : (
            <>
              <label className={s.field}>
                <span className={s.label}>Motif (facultatif)</span>
                <input className={s.input} value={motif} maxLength={120} placeholder="ex : le client a changé d'avis"
                  onChange={e => setMotif(e.target.value)}/>
              </label>
              <div className={s.total}><span>À rembourser</span><b>{fmt(code.total || 0)}</b></div>
              <p className={s.hint}>{p.rendu} Le stock des articles est remis.</p>
              <Button variant="danger" size="lg" block loading={busy} icon={RefreshCw} onClick={annuler}>
                Annuler le code et rembourser {fmt(code.total || 0)}
              </Button>
            </>
          )}
        </section>
      )}
    </div>
  )
}
