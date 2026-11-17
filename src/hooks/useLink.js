/**
 * hooks/useLink.js — lien personnel ou d'appareil avec sa clé (sécurité, lot 2), pour l'équipe connectée
 * const url = useLink(eventId, 'benevole', b.id)   // '' tant que la clé n'est pas chargée
 */
import { useEffect, useState } from 'react'
import { linkFor } from '../firebase/publicSession'

export default function useLink(ev, kind, id = '', extra = '') {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!ev || ((kind === 'benevole' || kind === 'artiste') && !id)) { setUrl(''); return }
    let alive = true
    linkFor(ev, kind, id, extra).then(u => { if (alive) setUrl(u) }).catch(() => { if (alive) setUrl('') })
    return () => { alive = false }
  }, [ev, kind, id, extra])
  return url
}
