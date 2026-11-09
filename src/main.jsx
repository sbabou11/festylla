// En premier : renomme les clés localStorage yllatok-* avant que les stores ne les lisent
import './utils/migrateStorageKeys'
import React    from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App      from './App.jsx'
import './index.css'

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
