import React    from 'react'
import ReactDOM from 'react-dom/client'
import App      from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Service Worker — mise à jour automatique
if ('serviceWorker' in navigator) {
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'SW_UPDATED') window.location.reload()
  })

  setInterval(async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg) await reg.update()
    } catch {}
  }, 60_000)

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload()
  })
}
