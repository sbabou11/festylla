/**
 * components/TirerActualiser.jsx — tirer l'écran vers le bas pour actualiser (24/11/2026)
 * Maquette validée : https://claude.ai/artifact/UoUnEL6aXqYPFP9RgJacRB
 *
 * Seulement dans l'appli installée sur l'écran d'accueil (le navigateur a déjà son propre geste),
 * seulement en haut de la page, jamais avec une fenêtre ouverte, ni à la borne, ni pendant un
 * encaissement. Un rond suit le doigt (moitié de la distance, 110 px au plus) ; lâché au-delà de
 * 60 px : on cherche une nouvelle version (en passant outre le délai de 90 s après une mise à jour)
 * et on l'installe tout de suite ; sinon « À jour » avec le numéro de version.
 * Idée reprise d'Event Manager (fiche Loading States de designmotionhq.com/patterns).
 */
import React, { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from '../ui'
import useAuthStore from '../store/useAuthStore'
import { checkForUpdate, installerMaintenant } from '../hooks/useAppUpdate'
import { APP_BUILD } from '../utils/buildInfo'

const SEUIL = 60          // distance du rond (px) pour déclencher
const MAX = 110           // le rond ne descend pas plus bas
const ATTENTE_ROND = 300  // pas de rond qui tourne si c'est plus rapide

export const estInstallee = () => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  } catch { return false }
}

// Borne et écran public : parcours de commande, aucun geste de rechargement
const exclue = () => /^\/(ui\/)?(borne|ecran)\b/.test(window.location.pathname)

// « 2411.2055 » → « 24.11 · 20:55 »
export function versionLisible(build = APP_BUILD) {
  const m = /^(\d{2})(\d{2})\.(\d{2})(\d{2})$/.exec(String(build))
  return m ? `${m[1]}.${m[2]} · ${m[3]}:${m[4]}` : String(build)
}

/** Le doigt est-il posé en haut de tout ce qui défile sous lui ? */
function enHaut(cible) {
  if ((window.scrollY || document.documentElement.scrollTop || 0) > 0) return false
  for (let el = cible; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0) return false
  }
  return true
}

const fenetreOuverte = () => !!document.querySelector('[role="dialog"], [aria-modal="true"]')

export default function TirerActualiser() {
  const [dist, setDist] = useState(0)
  const [tourne, setTourne] = useState(false)
  const etat = useRef({ y0: null, x0: 0, d: 0, actif: false, occupe: false })
  const encaissement = useAuthStore(st => st.encaissementEnCours)
  const encaissementRef = useRef(encaissement)
  encaissementRef.current = encaissement

  useEffect(() => {
    if (!estInstallee()) return undefined
    const e = etat.current

    const debut = (ev) => {
      if (e.occupe || ev.touches.length !== 1 || exclue() || encaissementRef.current || fenetreOuverte() || !enHaut(ev.target)) return
      e.y0 = ev.touches[0].clientY; e.x0 = ev.touches[0].clientX; e.d = 0; e.actif = false
    }
    const bouge = (ev) => {
      if (e.y0 == null) return
      const dy = ev.touches[0].clientY - e.y0, dx = Math.abs(ev.touches[0].clientX - e.x0)
      // Geste de côté (liste qui défile sur le côté) ou vers le haut : ce n'est pas pour nous
      if (!e.actif && (dx > Math.abs(dy) || dy < 0)) { e.y0 = null; return }
      e.actif = true
      e.d = Math.max(0, dy)
      setDist(Math.min(MAX, e.d / 2))
    }
    const fin = () => {
      if (e.y0 == null) return
      e.y0 = null
      const v = Math.min(MAX, e.d / 2)
      if (!e.actif || v < SEUIL) { setDist(0); return }
      actualiser()
    }

    const actualiser = async () => {
      e.occupe = true
      setDist(SEUIL)
      const minuteur = setTimeout(() => setTourne(true), ATTENTE_ROND)
      const finir = () => { clearTimeout(minuteur); setTourne(false); setDist(0); e.occupe = false }
      try {
        if (navigator.onLine === false) { finir(); toast.warning('Pas de réseau : réessayez dans un instant.'); return }
        let r = await checkForUpdate({ forcer: true })
        if (r && r.installing) {   // nouvelle version encore en téléchargement
          await new Promise(res => setTimeout(res, 2500))
          r = await checkForUpdate({ forcer: true })
        }
        if (r && r.found) {
          setTourne(true)
          toast.info('Mise à jour de YllaCash… l\'appli redémarre sur la nouvelle version.')
          await installerMaintenant()
          return   // la page se recharge
        }
        finir()
        if (r && r.error) toast.warning(navigator.onLine === false ? 'Pas de réseau : réessayez dans un instant.' : 'Vérification impossible pour le moment, réessayez.')
        else toast.success(`À jour · version ${versionLisible()}`)
      } catch {
        finir()
        toast.warning('Vérification impossible pour le moment, réessayez.')
      }
    }

    window.addEventListener('touchstart', debut, { passive: true })
    window.addEventListener('touchmove', bouge, { passive: true })
    window.addEventListener('touchend', fin, { passive: true })
    window.addEventListener('touchcancel', fin, { passive: true })
    return () => {
      window.removeEventListener('touchstart', debut)
      window.removeEventListener('touchmove', bouge)
      window.removeEventListener('touchend', fin)
      window.removeEventListener('touchcancel', fin)
    }
  }, [])

  if (!dist && !tourne) return null
  return (
    <div aria-hidden={!tourne} role={tourne ? 'status' : undefined} aria-label={tourne ? 'Actualisation…' : undefined}
      style={{
        position: 'fixed', left: '50%', top: 'env(safe-area-inset-top, 0px)', zIndex: 9000,
        width: 42, height: 42, marginLeft: -21, borderRadius: '50%',
        background: 'var(--nv-card, #fff)', boxShadow: '0 4px 16px rgba(6,34,47,.18)',
        display: 'grid', placeItems: 'center', pointerEvents: 'none',
        opacity: Math.min(1, dist / 30),
        transform: `translateY(${dist}px) rotate(${tourne ? 0 : dist * 3}deg)`,
        transition: etat.current.y0 == null ? 'transform .25s cubic-bezier(.2,.7,.3,1), opacity .25s' : 'none',
      }}>
      <RefreshCw size={22} strokeWidth={2.4} color="var(--brand, #1B6B7A)" className={tourne ? 'spin' : undefined} />
    </div>
  )
}
