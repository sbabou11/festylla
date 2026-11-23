/**
 * components/InstallPerso.jsx — « Ajouter à l'écran d'accueil » depuis un espace personnel (20/11/2026)
 *
 * L'appli n'a qu'une fiche d'installation (manifeste), qui démarre sur « / » : la connexion de
 * l'équipe. Un espace spectateur, bénévole, artiste ou une borne ne s'ouvre qu'avec son lien
 * complet (événement, numéro, clé). Sur ces pages, on remplace donc la fiche par une fiche
 * personnelle, fabriquée sur l'appareil (rien n'est envoyé au serveur), qui démarre sur le lien
 * de la page. On rétablit la fiche de l'appli en quittant la page.
 */
import { useEffect } from 'react'
import { retenirEspace } from '../utils/dernierEspace'

// Mentions de passage à ne pas garder dans le lien de démarrage (retour de paiement Stripe…)
const PASSAGERES = ['recharge', 'annule', 'session_id']

export function lienDemarrage(href) {
  const u = new URL(href)
  PASSAGERES.forEach(p => u.searchParams.delete(p))
  u.hash = ''
  return u.toString()
}

export function fichePerso(href, nom) {
  const debut = lienDemarrage(href)
  const u = new URL(debut)
  const abs = (p) => new URL(p, u.origin).toString()
  // Identifiant propre à l'espace (sans la clé), pour ne pas se confondre avec l'appli de l'équipe
  const id = new URL(u.pathname, u.origin)
  ;['ev', 'id', 'cr', 'stand'].forEach(p => { if (u.searchParams.get(p)) id.searchParams.set(p, u.searchParams.get(p)) })
  return {
    id: id.toString(),
    name: nom,
    short_name: nom,
    start_url: debut,
    scope: abs('/'),
    display: 'standalone',
    theme_color: '#003048',
    background_color: '#FFF8F2',
    icons: [
      { src: abs('/logo-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: abs('/logo-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  }
}

export default function InstallPerso({ nom, children }) {
  useEffect(() => {
    let lien = document.querySelector('link[rel="manifest"]')
    const cree = !lien
    if (cree) { lien = document.createElement('link'); lien.rel = 'manifest'; document.head.appendChild(lien) }
    const avant = lien.getAttribute('href')
    const titre = document.querySelector('meta[name="apple-mobile-web-app-title"]')
    const titreAvant = titre && titre.getAttribute('content')
    let url = null
    // Relais (23/11/2026) : si le téléphone ignore la fiche ci-dessous, l'icône démarre sur « / »
    // et l'appli renvoie vers ce lien (utils/dernierEspace.js)
    try { retenirEspace(lienDemarrage(window.location.href)) } catch { /* rien */ }
    try {
      const fiche = fichePerso(window.location.href, nom)
      url = URL.createObjectURL(new Blob([JSON.stringify(fiche)], { type: 'application/manifest+json' }))
      lien.setAttribute('href', url)
      if (titre) titre.setAttribute('content', nom)   // nom sous l'icône sur iPhone
    } catch { /* fiche de l'appli conservée */ }
    return () => {
      if (cree) lien.remove()
      else if (avant) lien.setAttribute('href', avant)
      if (titre && titreAvant) titre.setAttribute('content', titreAvant)
      if (url) URL.revokeObjectURL(url)
    }
  }, [nom])
  return children
}
