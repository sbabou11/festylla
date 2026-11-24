/**
 * pages/billetterie/Entree.jsx — page « Entrée » de l'équipe : contrôle des billets du site
 * Accessible aux rôles qui contiennent la page `entree` (admin, billetterie, rôles personnalisés).
 */
import React from 'react'
import useEventStore from '../../store/useEventStore'
import useAuthStore from '../../store/useAuthStore'
import EntreeControl from '../../components/EntreeControl'
import { Empty } from '../../ui'
import { Ticket } from 'lucide-react'

export default function Entree() {
  const { currentEventId, events } = useEventStore()
  const { user } = useAuthStore()
  const eventId = user?.eventId || currentEventId
  if (!eventId) return <Empty icon={Ticket} title="Aucun événement sélectionné">Choisissez l'événement dont vous contrôlez les billets.</Empty>
  const evenement = (events || []).find(e => e.id === eventId)?.nom || ''
  // « Enregistrée par » : administrateurs et consultation seulement (23/11/2026)
  const voirAuteur = ['super_admin', 'admin', 'consultation'].includes(user?.role)
  return <EntreeControl eventId={eventId} par={{ type: 'staff', id: user?.id || null, nom: user?.nom || '' }} showSendIssues
    evenement={evenement} voirAuteur={voirAuteur}/>
}
