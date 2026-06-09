// Service Worker — Tu Preparador push notifications
const APP_NAME = 'Tu Preparador'

self.addEventListener('install', e => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))

self.addEventListener('push', event => {
  let data = { title: APP_NAME, body: 'Tienes un nuevo mensaje', url: '/client.html' }
  try { if (event.data) data = { ...data, ...event.data.json() } } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/logo.png',
      badge: '/logo.png',
      tag: data.tag || 'tp-notif',
      renotify: true,
      data: { url: data.url }
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const url = event.notification.data?.url || '/client.html'
      for (const c of list) {
        if (c.url.includes('client.html') && 'focus' in c) return c.focus()
      }
      return clients.openWindow(url)
    })
  )
})
