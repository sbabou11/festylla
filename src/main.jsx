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
import { installApiAuth } from './firebase/session'

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
