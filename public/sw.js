const CACHE = 'mailbox-shell-v1';
const SHELL_ASSETS = ['/', '/index.html', '/icon.svg', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Never cache API calls or the SSE stream — always go to network for those.
  if (request.url.includes('/api/')) return;

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
