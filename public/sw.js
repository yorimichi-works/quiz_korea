const CACHE_NAME = 'meonjeo-shell-v19';
const SHELL = ['./', './game.html', './styles.css?v=9', './app.js?v=16', './auth.js?v=9', './realtime.js?v=3', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Remove old Meonjeo caches, including any authenticated responses stored by
  // previous shells, without touching unrelated caches on the same origin.
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('meonjeo-shell-') && key !== CACHE_NAME).map(key => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // A network failure must not replay another account's cached API response.
  // Cache API does not enforce Cache-Control for us.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')
      || url.pathname === '/api' || url.pathname.startsWith('/__/auth')
      || event.request.headers.has('Authorization')) return;
  event.respondWith(fetch(event.request).then(async response => {
    const cacheControl = response.headers.get('Cache-Control') || '';
    if (response.ok && !/\b(no-store|private)\b/i.test(cacheControl)) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      } catch {
        // Cache failures must not mask the valid network response.
      }
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === 'navigate') return await caches.match('./game.html') || Response.error();
    return Response.error();
  }));
});
