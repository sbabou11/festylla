import React    from 'react'
import ReactDOM from 'react-dom/client'
import App      from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Note : la gestion du service worker et des mises à jour est maintenant
// centralisée dans src/hooks/useAppUpdate.js + src/components/UpdateBanner.jsx
// (mode 'prompt' dans vite.config.js — vite-plugin-pwa enregistre le SW automatiquement)
