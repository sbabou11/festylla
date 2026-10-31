/**
 * sw-fcm.js — Extension FCM pour le SW PWA
 * Ce fichier est importé par le SW principal
 */
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

try {
  firebase.initializeApp({
    apiKey:            'AIzaSyDqQnyzjXYmTWZrvXHkGbhPrCrIuG_lu-A',
    authDomain:        'yllatok.firebaseapp.com',
    projectId:         'yllatok',
    storageBucket:     'yllatok.appspot.com',
    messagingSenderId: '850586788991',
    appId:             '1:850586788991:web:37b3df23b5e6b60744cb4a',
  })

  const messaging = firebase.messaging()

  messaging.onBackgroundMessage(payload => {
    const { title, body } = payload.notification || {}
    self.registration.showNotification(title || 'YllaCash', {
      body:    body || '',
      icon:    '/logo-192.png',
      badge:   '/logo-192.png',
      vibrate: [200, 100, 200],
      data:    payload.data || {},
    })
  })
} catch(e) {}

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus()
      }
      return clients.openWindow('/')
    })
  )
})
