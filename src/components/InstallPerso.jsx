/**
 * components/InstallPerso.jsx — « Ajouter à l'écran d'accueil » depuis un espace personnel
 *
 * Un espace spectateur, bénévole, artiste ou une borne ne s'ouvre qu'avec son lien (événement,
 * numéro, clé). Solution B (25/11/2026, choix de l'organisateur) :
 *   - Android et ordinateurs : la page désigne la fiche d'installation servie par le site pour cet
 *     espace (/api/manifest), SANS la clé. Chrome peut alors fabriquer une vraie appli (une fiche
 *     fabriquée sur le téléphone ne donnait qu'un raccourci du navigateur), à côté de l'appli de
 *     l'équipe. Au démarrage, l'espace retrouve la clé gardée par le téléphone.
 *   - iPhone et iPad : on garde la fiche normale de l'appli, sans adresse de départ : l'icône retient
 *     le lien complet de la page, sur le téléphone seulement (l'appli de l'écran d'accueil d'un
 *     iPhone n'a pas accès à la mémoire de Safari, elle a besoin de la clé dans son lien).
 * On rétablit la fiche de l'appli en quittant la page.
 */
import { useEffect } from 'react'

const ESPACES = {
  '/solde': ['ev', 'id'], '/balance': ['ev', 'id'], '/spectateur': ['ev', 'id'],
  '/benevole': ['ev', 'id'], '/artiste': ['ev', 'cr'], '/borne': ['ev'],
}

/** Adresse de la fiche servie par le site pour cet espace (jamais la clé), ou null */
export function adresseFiche(href) {
  const u = new URL(href)
  const params = ESPACES[u.pathname]
  if (!params) return null
  const q = new URLSearchParams({ p: u.pathname.slice(1) })
  for (const k of params) {
    const v = u.searchParams.get(k)
    if (!v) return null
    q.set(k, v)
  }
  return `/api/manifest?${q.toString()}`
}

/** iPhone, iPad (y compris iPad qui se présente comme un Mac) */
export function estAppareilApple(nav = typeof navigator !== 'undefined' ? navigator : {}) {
  const ua = String(nav.userAgent || '')
  return /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && Number(nav.maxTouchPoints) > 1)
}

export default function InstallPerso({ nom, children }) {
  useEffect(() => {
    const titre = document.querySelector('meta[name="apple-mobile-web-app-title"]')
    const titreAvant = titre && titre.getAttribute('content')
    if (titre) titre.setAttribute('content', nom)   // nom proposé sous l'icône sur iPhone
    let lien = null, avant = null, cree = false
    const fiche = estAppareilApple() ? null : adresseFiche(window.location.href)
    if (fiche) {
      lien = document.querySelector('link[rel="manifest"]')
      cree = !lien
      if (cree) { lien = document.createElement('link'); lien.rel = 'manifest'; document.head.appendChild(lien) }
      avant = lien.getAttribute('href')
      lien.setAttribute('href', fiche)
    }
    return () => {
      if (titre && titreAvant) titre.setAttribute('content', titreAvant)
      if (lien) { if (cree) lien.remove(); else if (avant) lien.setAttribute('href', avant) }
    }
  }, [nom])
  return children
}
