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
  const { currentEventId } = useEventStore()
  const { user } = useAuthStore()
  const eventId = user?.eventId || currentEventId
  if (!eventId) return <Empty icon={Ticket} title="Aucun événement sélectionné">Choisissez l'événement dont vous contrôlez les billets.</Empty>
  return <EntreeControl eventId={eventId} par={{ type: 'staff', id: user?.id || null, nom: user?.nom || '' }} showSendIssues/>
}
