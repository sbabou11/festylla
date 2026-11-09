import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Timestamp de build (date+heure de compilation) — format DDMM.HHMM
// Différent du numéro de VERSION (qui est manuel, défini dans src/utils/buildInfo.js).
// Ce timestamp permet de distinguer 2 builds de la même version.
const buildTimestamp = (() => {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getDate())}${pad(d.getMonth() + 1)}.${pad(d.getHours())}${pad(d.getMinutes())}`
})()

export default defineConfig({
  define: {
    __APP_BUILD__: JSON.stringify(buildTimestamp),
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      // Mode 'prompt' : le SW se télécharge en arrière-plan, mais ATTEND qu'on
      // lui dise d'activer la nouvelle version (via le bandeau de mise à jour).
      // Sans ça, le SW s'auto-activait et déclenchait un reload immédiat sans
      // que l'utilisateur voie la popup.
      registerType: 'prompt',
      // injectRegister: false → on appelle registerSW() nous-même depuis useAppUpdate.js
      // (sinon double registration et conflits avec notre logique)
      injectRegister: false,
      includeAssets: ['logo.png', 'logo-192.png', 'logo-512.png'],
      manifest: {
        name: 'YllaCash',
        short_name: 'YllaCash',
        description: 'Toute la gestion financière de votre événement en un seul endroit.',
        theme_color: '#003048',
        background_color: '#FFF8F2',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        // Exclure le SW FCM du cache Workbox
        globIgnores: ['firebase-messaging-sw.js', 'sw-fcm.js'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // skipWaiting + clientsClaim laissés à FALSE :
        // - Le nouveau SW reste en "waiting" jusqu'à ce qu'on déclenche skipWaiting
        //   manuellement (via le bouton "Mettre à jour" du bandeau).
        // - Sans ça, le SW s'auto-active et déclenche un reload immédiat,
        //   l'utilisateur n'a jamais le temps de voir la popup.
        skipWaiting: false,
        clientsClaim: false,
        runtimeCaching: [
          {
            // Toutes les requêtes Firebase doivent toujours passer par le réseau (pas de cache)
            urlPattern: /^https:\/\/(firestore|firebase|identitytoolkit|firebaseinstallations|fcmregistrations|firebasestorage)\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // Le HTML doit toujours passer par le réseau (sinon on aurait toujours la vieille version)
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxAgeSeconds: 60 * 60 * 24 }, // 24h max
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': '/src' },
  },
})
