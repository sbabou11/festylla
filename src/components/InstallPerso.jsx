/**
 * components/InstallPerso.jsx — « Ajouter à l'écran d'accueil » depuis un espace personnel
 *
 * Un espace spectateur, bénévole, artiste ou une borne ne s'ouvre qu'avec son lien (événement,
 * numéro, clé). Solution B (25/11/2026, choix de l'organisateur) :
 *   - Android et ordinateurs : la page désigne la fiche d'installation servie par le site pour cet
 *     espace (/api/manifest), SANS la clé. Chrome peut alors fabriquer une vraie appli (une fiche
 *     fabriquée sur le téléphone ne donnait qu'un raccourci du navigateur), à côté de l'appli de
 *     l'équipe. Au démarrage, l'espace retrouve la clé gardée par le téléphone.
 *   - iPhone et iPad : même fiche, mais avec la clé dans l'adresse de départ (l'appli de l'écran
 *     d'accueil d'un iPhone n'a pas accès à la mémoire de Safari). Lue seulement par le téléphone et
 *     notre serveur, jamais par Apple ; l'iPhone suit l'adresse de départ de la fiche depuis iOS 11.3.
 * On rétablit la fiche de l'appli en quittant la page.
 */
import { useEffect } from 'react'

const ESPACES = {
  '/solde': ['ev', 'id'], '/balance': ['ev', 'id'], '/spectateur': ['ev', 'id'],
  '/benevole': ['ev', 'id'], '/artiste': ['ev', 'cr'], '/borne': ['ev'],
}

/** Clé du lien : dans l'adresse, sinon celle gardée par le téléphone (publicSession, LinkGate) */
export function cleDe(href, lire = (k) => { try { return localStorage.getItem(k) || '' } catch { return '' } }) {
  const u = new URL(href)
  const ev = u.searchParams.get('ev') || ''
  const direct = (u.searchParams.get('k') || '').toLowerCase()
  if (direct) return direct
  const p = u.pathname
  if (['/solde', '/balance', '/spectateur'].includes(p)) return lire(`yllacash-cle-${ev}-${(u.searchParams.get('id') || '').toUpperCase()}`).toLowerCase()
  if (p === '/benevole') return lire(`yllacash-lien-benevole-${ev}-${u.searchParams.get('id') || ''}`).toLowerCase()
  if (p === '/artiste') return lire(`yllacash-lien-artiste-${ev}-${u.searchParams.get('cr') || ''}`).toLowerCase()
  if (p === '/borne') return lire(`yllacash-lien-borne-${ev}-`).toLowerCase()
  return ''
}

/**
 * Adresse de la fiche servie par le site pour cet espace, ou null.
 * cle : seulement pour iPhone et iPad (jamais pour Android : la fiche y est lue par Google).
 */
export function adresseFiche(href, cle = '') {
  const u = new URL(href)
  const params = ESPACES[u.pathname]
  if (!params) return null
  const q = new URLSearchParams({ p: u.pathname.slice(1) })
  for (const k of params) {
    const v = u.searchParams.get(k)
    if (!v) return null
    q.set(k, v)
  }
  if (cle && /^[0-9a-f]{20,64}$/.test(cle)) q.set('k', cle)
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
    const apple = estAppareilApple()
    const fiche = adresseFiche(window.location.href, apple ? cleDe(window.location.href) : '')
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
