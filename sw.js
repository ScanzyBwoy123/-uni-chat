// Push notifications will be added after HTTPS hosting and VAPID configuration.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
