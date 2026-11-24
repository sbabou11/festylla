/**
 * components/ImpressionGuichet.jsx — tickets imprimés à la billetterie (écran 7, 23/11/2026)
 *
 * Pendant une panne de la borne, la billetterie imprime elle-même les tickets de retrait
 * (un par stand), avec la même imprimante USB et le même format que la borne.
 * Monté une fois par vente (clé = n° de commande) : l'impression part à l'affichage.
 * Imprimante absente ou en panne : la vente reste enregistrée ; on peut connecter l'imprimante
 * (Chrome sur Android ou ordinateur) et réessayer, ou recopier les numéros à la main.
 *
 * props : numero, lignes [{ nom, qty, prix, standId }], stands, paiement (texte du ticket)
 */
import React, { useMemo } from 'react'
import { Printer, RotateCcw, Usb } from 'lucide-react'
import useAppStore from '../store/useAppStore'
import { ticketsParStand } from '../menu/organiser'
import { ticketsDeCommande } from '../utils/escpos'
import { supporte } from '../utils/imprimante'
import { useImprimante, useImpressionTickets } from '../hooks/useImpression'
import { Button } from '../ui'
import s from './ImpressionGuichet.module.css'

const dateTicket = () => new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function ImpressionGuichet({ numero, lignes = [], stands = [], paiement = 'Payé à la billetterie' }) {
  const festival = useAppStore(st => st.theme?.festName || '')
  const tickets = useMemo(() => ticketsParStand(lignes, stands, numero), [])   // eslint-disable-line react-hooks/exhaustive-deps
  const papier = useMemo(() => ticketsDeCommande(tickets, { festival, date: dateTicket(), paiement, pied: 'Remettez ce ticket au stand' }), [])   // eslint-disable-line react-hooks/exhaustive-deps
  const { phase, progres, reessayer } = useImpressionTickets(papier)
  const { connecter, occupe, message } = useImprimante()
  const n = tickets.length

  const brancher = async () => { await connecter(); reessayer() }

  return (
    <div className={s.box} role="status" aria-live="polite">
      <div className={s.head}>
        <Printer size={18} aria-hidden="true" />
        <b>
          {phase === 'impression' ? `Impression ${n > 1 ? `des ${n} tickets` : 'du ticket'}… ${progres.pourcent ? `${Math.round(progres.pourcent)} %` : ''}`
            : phase === 'ok' ? `${n > 1 ? `${n} tickets imprimés` : 'Ticket imprimé'} : à donner au client`
            : phase === 'absente' ? "L'imprimante n'est pas connectée"
            : "L'imprimante ne répond pas"}
        </b>
      </div>
      <ul className={s.list}>
        {tickets.map(t => (
          <li key={t.numero}><span>{t.stand ? `Stand N° ${t.stand.numero}${t.stand.nom ? ` · ${t.stand.nom}` : ''}` : 'Ticket'}</span><b>n° {t.numero}</b></li>
        ))}
      </ul>
      {(phase === 'absente' || phase === 'panne') && (<>
        <p className={s.hint}>La vente est bien enregistrée. Sans ticket, notez {n > 1 ? 'ces numéros' : 'ce numéro'} pour le client : le stand le retrouve.</p>
        <div className={s.acts}>
          {phase === 'absente' && supporte() && (
            <Button size="sm" variant="secondary" icon={Usb} loading={occupe} onClick={brancher}>Connecter l'imprimante</Button>
          )}
          <Button size="sm" variant="secondary" icon={RotateCcw} onClick={reessayer}>Réessayer</Button>
        </div>
        {!supporte() && <p className={s.hint}>Cet appareil ne peut pas piloter l'imprimante : utilisez Chrome sur Android ou sur ordinateur (pas d'iPhone ni d'iPad).</p>}
        {message && <p className={s.hint}>{message}</p>}
      </>)}
    </div>
  )
}
