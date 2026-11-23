// En premier : renomme les clés localStorage yllatok-* avant que les stores ne les lisent
import './utils/migrateStorageKeys'
// Une ancienne version hors ligne de l'appli peut répondre à la place de la page de connexion
// Firebase (/__/auth/…) : on la retire et on recharge, pour que la vraie page s'affiche.
if (window.location.pathname.startsWith('/__/') && navigator.serviceWorker?.controller) {
  navigator.serviceWorker.getRegistrations()
    .then(regs => Promise.all(regs.map(r => r.unregister())))
    .finally(() => window.location.reload())
}
import React    from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App      from './App.jsx'
import './index.css'
import './styles/nouveau.css'   // nouveau style des écrans téléphone (23/11/2026)
import { installApiAuth } from './firebase/session'
import { espaceARouvrir } from './utils/dernierEspace'

// Essai A7 (23/11/2026) : lancée depuis l'icône de l'écran d'accueil, l'appli démarre sur « / ».
// Si un espace personnel (solde, bénévole, artiste, borne) a été le dernier ouvert sur ce
// téléphone, on l'affiche directement au lieu de la connexion de l'équipe.
const aRouvrir = espaceARouvrir()
if (aRouvrir) window.history.replaceState(null, '', aRouvrir)

// Sécurité, lot 1 : les appels aux fonctions serveur portent la session de la personne connectée
installApiAuth()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

// Note : la gestion du service worker et des mises à jour est maintenant
// centralisée dans src/hooks/useAppUpdate.js + src/components/UpdateBanner.jsx
// (mode 'prompt' dans vite.config.js — vite-plugin-pwa enregistre le SW automatiquement)
