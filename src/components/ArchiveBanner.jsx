/**
 * components/ArchiveBanner.jsx — bandeau affiché quand on consulte une édition archivée
 *
 * Rappelle que tout est en lecture seule et ramène à l'édition en cours d'un clic.
 * Toute tentative de modification (refusée par le verrou de guardedFirestore) est signalée
 * une fois par un message, même si la page concernée ne gère pas l'erreur.
 */
import React, { useEffect, useRef } from 'react'
import { Archive, ArrowLeft } from 'lucide-react'
import useEventStore, { isArchiveEvent } from '../store/useEventStore'
import { Button, toast } from '../ui'
import s from './ArchiveBanner.module.css'

export default function ArchiveBanner() {
  const { events, currentEventId, selectEvent } = useEventStore()
  const current = events.find(e => e.id === currentEventId)
  const live = events.find(e => e.actif && !isArchiveEvent(e)) || events.find(e => !isArchiveEvent(e))
  const lastToast = useRef(0)

  useEffect(() => {
    const onReject = (ev) => {
      if (ev.reason?.code !== 'archive/read-only') return
      ev.preventDefault()
      if (Date.now() - lastToast.current < 4000) return
      lastToast.current = Date.now()
      toast.info('Archive en lecture seule : cette modification n\'a pas été enregistrée.')
    }
    window.addEventListener('unhandledrejection', onReject)
    return () => window.removeEventListener('unhandledrejection', onReject)
  }, [])

  if (!isArchiveEvent(current)) return null
  const archivedAt = current.archive?.archivedAt ? new Date(current.archive.archivedAt).toLocaleDateString('fr-FR') : null
  return (
    <div className={s.banner} role="status">
      <Archive size={18} aria-hidden="true" className={s.icon}/>
      <div className={s.text}>
        <strong>Archive « {current.nom} »</strong> : consultation en lecture seule{archivedAt ? `, archivée le ${archivedAt}` : ''}.
        Les stands et la borne restent sur l'édition en cours.
      </div>
      {live && (
        <Button size="sm" variant="secondary" icon={ArrowLeft} onClick={() => selectEvent(live.id)}>
          Revenir à {live.nom}
        </Button>
      )}
    </div>
  )
}
