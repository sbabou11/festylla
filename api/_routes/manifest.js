/**
 * api/manifest.js — fiche d'installation d'un espace personnel (25/11/2026, solution B)
 *
 * Choix de l'organisateur : sur Android, Chrome ne fabrique une vraie appli que si sa fiche
 * d'installation (manifeste) se lit à une adresse du site ; la fiche fabriquée sur le téléphone
 * donnait un simple raccourci du navigateur. Cette route sert donc la fiche de l'espace :
 *
 * GET /api/manifest?p=solde&ev=…&id=FY-…     compte spectateur (« Mon solde »)
 * GET /api/manifest?p=benevole&ev=…&id=…      espace bénévole
 * GET /api/manifest?p=artiste&ev=…&cr=…       espace artiste
 * GET /api/manifest?p=borne&ev=…              borne
 *
 * Android : la fiche ne contient JAMAIS la clé du lien personnel (elle est lue par le service de
 * Google qui fabrique l'appli) : l'appli démarre sur l'espace sans clé et retrouve celle que le
 * téléphone a gardée à la première ouverture.
 * iPhone et iPad (&k=…, demandé seulement par ces appareils) : l'appli de l'écran d'accueil n'a pas
 * accès à la mémoire de Safari ; l'adresse de départ garde donc la clé. La fiche n'est lue que par
 * le téléphone et ce serveur (jamais par Apple), et n'est pas gardée en cache.
 * Aucune lecture de la base : rien n'est révélé.
 */
const ID = /^[\w-]{1,128}$/
const CLE = /^[0-9a-f]{20,64}$/

const ESPACES = {
  solde:      { nom: 'Mon solde',       params: ['ev', 'id'] },
  balance:    { nom: 'Mon solde',       params: ['ev', 'id'], chemin: 'solde' },
  spectateur: { nom: 'Mon solde',       params: ['ev', 'id'], chemin: 'solde' },
  benevole:   { nom: 'Espace bénévole', params: ['ev', 'id'] },
  artiste:    { nom: 'Espace artiste',  params: ['ev', 'cr'] },
  borne:      { nom: 'Borne YllaCash',  params: ['ev'] },
}

/** Fiche de l'espace demandé, ou null si la demande n'est pas valable */
function ficheEspace(query = {}) {
  const p = String(query.p || '')
  const e = Object.prototype.hasOwnProperty.call(ESPACES, p) ? ESPACES[p] : null
  if (!e) return null
  const q = new URLSearchParams()
  for (const k of e.params) {
    const v = String(query[k] || '')
    if (!ID.test(v)) return null
    q.set(k, v)
  }
  const debut = `/${e.chemin || p}?${q.toString()}`
  const k = String(query.k || '').toLowerCase()
  const avecCle = CLE.test(k) ? `${debut}&k=${k}` : debut
  return {
    id: debut,                 // une identité par espace (sans la clé) : s'installe à côté de l'appli de l'équipe
    name: e.nom,
    short_name: e.nom,
    lang: 'fr',
    start_url: avecCle,
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    theme_color: '#003048',
    background_color: '#FFF8F2',
    icons: [
      { src: '/logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  }
}

function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.status(405).json({ error: 'GET attendu.' }); return }
  const fiche = ficheEspace(req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams))
  if (!fiche) { res.status(400).json({ error: 'Espace inconnu.' }); return }
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
  // Fiche avec la clé (iPhone) : jamais gardée en cache, ni par le téléphone ni par le réseau
  const q = req.query || {}
  res.setHeader('Cache-Control', q.k ? 'private, no-store' : 'public, max-age=3600')
  res.status(200).send(JSON.stringify(fiche))
}

module.exports = handler
module.exports.ficheEspace = ficheEspace
