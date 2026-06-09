// Service Worker — Tu Preparador push notifications
const APP_NAME = 'Tu Preparador'

self.addEventListener('install', e => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))

self.addEventListener('push', event => {
  let data = { title: APP_NAME, body: 'Tienes un nuevo mensaje', url: '/client.html' }
  try { if (event.data) data = { ...data, ...event.data.json() } } catch {}

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/apple-touch-icon.png',
        badge: '/apple-touch-icon.png',
        tag: data.tag || 'tp-notif',
        renotify: true,
        data: { url: data.url }
      }),
      // Badge numérico en el icono PWA (iOS 16.4+ y Android Chrome)
      navigator.setAppBadge ? navigator.setAppBadge(1).catch(() => {}) : Promise.resolve()
    ])
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    Promise.all([
      // Limpiar badge al abrir la notificación
      navigator.clearAppBadge ? navigator.clearAppBadge().catch(() => {}) : Promise.resolve(),
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        const url = event.notification.data?.url || '/client.html'
        for (const c of list) {
          if (c.url.includes('client.html') && 'focus' in c) return c.focus()
        }
        return clients.openWindow(url)
      })
    ])
  )
})
