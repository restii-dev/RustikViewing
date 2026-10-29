/* RustikViewing service worker placeholder — full Scramjet SW lives on epose until bundled here */
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {
  // Pass-through; Scramjet intercept is handled by epose deployment
  e.respondWith(fetch(e.request).catch(() => new Response('offline', { status: 503 })));
});
