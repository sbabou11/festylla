/**
 * firebase-messaging-sw.js — v8 debug
 *
 * Service Worker dédié à Firebase Cloud Messaging.
 * Reçoit les notifications push en arrière-plan (app fermée / téléphone verrouillé).
 *
 * Doit être à la racine du site (/firebase-messaging-sw.js) pour que Firebase
 * Messaging le détecte automatiquement.
 */

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

self.addEventListener('install',  () => self.skipWaiting())
self.addEventListener('activate', e  => e.waitUntil(self.clients.claim()))

firebase.initializeApp({
  apiKey:            'AIzaSyDqQnyzjXYmTWZrvXHkGbhPrCrIuG_lu-A',
  authDomain:        'yllatok.firebaseapp.com',
  projectId:         'yllatok',
  storageBucket:     'yllatok.appspot.com',
  messagingSenderId: '850586788991',
  appId:             '1:850586788991:web:37b3df23b5e6b60744cb4a',
})

const messaging = firebase.messaging()

// Quand l'app est fermée ET qu'un push FCM arrive, ce handler est appelé
messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || payload.data?.title || 'YllaCash'
  const body  = payload.notification?.body  || payload.data?.body  || ''
  const url   = payload.data?.url || payload.fcmOptions?.link || '/'
  const tag   = payload.data?.tag || 'yllacash-bg'

  self.registration.showNotification(title, {
    body,
    icon:    '/logo-192.png',
    badge:   '/logo-192.png',
    vibrate: [200, 100, 200],
    tag,
    renotify: !!payload.data?.tag,
    requireInteraction: payload.data?.priority === 'high',
    data:    { ...(payload.data || {}), url },
  })
})

// Clic sur la notification → ouvre l'app (ou la focus si déjà ouverte)
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Si une fenêtre est déjà ouverte sur notre app, on la focus et on navigue
      for (const c of list) {
        try {
          const u = new URL(c.url)
          if (u.origin === self.location.origin) {
            if (targetUrl && targetUrl !== '/' && 'navigate' in c) {
              c.navigate(targetUrl).catch(() => {})
            }
            return c.focus()
          }
        } catch {}
      }
      // Aucune fenêtre ouverte → en ouvrir une
      return clients.openWindow(targetUrl)
    })
  )
})
