/**
 * components/RappelConservation.jsx — rappel sur l'accueil des admins : effacer une édition
 * passée de la base (RGPD, 4 mois après le festival, décidé le 24/11/2026)
 * Maquette validée : https://claude.ai/artifact/AySuF3pyLcNviuoNcAwTYs
 *
 * Orange 30 jours avant la date, rouge une fois dépassée. Toucher ouvre Événements (super admin),
 * où se fait l'archivage habituel. Rien ne s'efface tout seul.
 */
import React from 'react'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import useEventStore, { isArchiveEvent } from '../store/useEventStore'
import { editionsAEffacer, dateLongue } from '../utils/conservation'
import s from './RappelConservation.module.css'

export default function RappelConservation({ peutOuvrir = false, onOuvrir }) {
  const { events = [], currentEventId } = useEventStore()
  const liste = editionsAEffacer(events, { actifId: currentEventId, estArchive: isArchiveEvent })
  if (!liste.length) return null
  return liste.map(({ event, cal }) => {
    const depasse = cal.niveau === 'depasse'
    const titre = depasse
      ? `${event.nom} : effacement en retard de ${Math.abs(cal.jours)} jour${Math.abs(cal.jours) > 1 ? 's' : ''}`
      : `${event.nom} : données à effacer dans ${cal.jours} jour${cal.jours > 1 ? 's' : ''}`
    const contenu = (<>
      <AlertTriangle size={18} aria-hidden="true" className={s.ico} />
      <span className={s.txt}>
        <b>{titre}</b>
        <span>Les données des spectateurs doivent quitter la base 4 mois après le festival (RGPD), soit le {dateLongue(cal.effacement)}.
          {' '}Téléchargez d'abord l'archive ZIP, à garder 10 ans.{!peutOuvrir && ' À faire par le super admin, dans Événements.'}</span>
      </span>
      {peutOuvrir && <ChevronRight size={18} aria-hidden="true" className={s.ico} />}
    </>)
    return peutOuvrir
      ? <button key={event.id} type="button" className={clsx(s.ban, depasse && s.rouge)} onClick={onOuvrir}
          aria-label={`${titre}. Ouvrir Événements pour archiver et effacer l'édition`}>{contenu}</button>
      : <div key={event.id} className={clsx(s.ban, depasse && s.rouge)} role="status">{contenu}</div>
  })
}
