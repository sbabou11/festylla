/**
 * hooks/useQrEspace.js — QR tournant de l'espace bénévole ou artiste (23/11/2026)
 *
 * Avec la clé du lien personnel (retenue par le téléphone à l'ouverture du lien), le jeton est
 * calculé sur place à chaque fenêtre de 30 s, sans réseau (utils/qrEspace).
 * Sans clé (espace ouvert autrement, par exemple avec identifiant et mot de passe), le téléphone
 * demande au serveur, avec sa session, les jetons des 5 prochaines minutes (api/qr, « jetons-espace »)
 * et les reprend avant qu'ils ne s'épuisent. Hors réseau et sans jeton d'avance : message clair.
 *
 * Renvoie { texte, reste, erreur } : texte du QR (null tant qu'il n'est pas prêt), secondes avant
 * le prochain changement, message à afficher si aucun QR ne peut être donné.
 */
import { useEffect, useState } from 'react'
import { jetonEspace, fenetreDe, resteSecondes } from '../utils/qrEspace'
import { apiFetch } from '../firebase/session'

export default function useQrEspace({ kind, ev, id, cle, actif = true }) {
  const [texte, setTexte] = useState(null)
  const [reste, setReste] = useState(30)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    if (!actif || !id || !ev) { setTexte(null); return }
    let vivant = true, fenetre = null, enCours = false, dernierEssai = 0
    let jetons = []   // repli serveur : [{ fenetre, jeton }]

    const recharger = async () => {
      if (enCours || Date.now() - dernierEssai < 10 * 1000) return
      enCours = true; dernierEssai = Date.now()
      try {
        const r = await apiFetch('/api/qr', { body: { action: 'jetons-espace', ev } })
        if (vivant) { jetons = Array.isArray(r.jetons) ? r.jetons : []; fenetre = null; setErreur('') }
      } catch (e) {
        if (!vivant) return
        const horsLigne = typeof navigator !== 'undefined' && navigator.onLine === false
        if (!jetons.some(j => j.fenetre === fenetreDe(Date.now()))) {
          setTexte(null)
          setErreur(horsLigne || !e.status
            ? 'Pas de réseau : votre QR ne peut pas s\'afficher. Reconnectez-vous à internet, ou ouvrez votre espace avec votre lien personnel (il fonctionne alors sans réseau).'
            : (e.message || 'Votre QR ne peut pas s\'afficher pour le moment.'))
        }
      } finally { enCours = false }
    }

    const tick = async () => {
      const ms = Date.now()
      setReste(resteSecondes(ms))
      const f = fenetreDe(ms)
      if (!cle) {
        // Moins de 3 jetons d'avance : on en redemande
        if (jetons.filter(j => j.fenetre >= f).length < 3) recharger()
      }
      if (f === fenetre) return
      if (cle) {
        fenetre = f
        try {
          const j = await jetonEspace({ kind, cle, ev, id, ms })
          if (vivant) { setTexte(j); setErreur('') }
        } catch { if (vivant) { setTexte(null); setErreur('Votre QR ne peut pas s\'afficher sur ce téléphone.') } }
        return
      }
      const j = jetons.find(x => x.fenetre === f)
      if (j) { fenetre = f; setTexte(j.jeton) }
      else setTexte(null)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => { vivant = false; clearInterval(t) }
  }, [kind, ev, id, cle, actif])

  return { texte, reste, erreur }
}
