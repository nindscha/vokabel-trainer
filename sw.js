const CACHE_NAME = 'vokabel-trainer-v6';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './dataService.js',
  './vokabeln.json',
  './manifest.json'
];
const ASSET_PATHS = new Set(
  ASSETS.map(asset => new URL(asset, self.registration.scope).pathname)
);

// Bei Installation alle Dateien cachen
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Alte Caches löschen
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first, Fallback auf Cache
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    requestUrl.origin !== self.location.origin ||
    !ASSET_PATHS.has(requestUrl.pathname)
  ) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cacheKey = new Request(`${requestUrl.origin}${requestUrl.pathname}`);

      try {
        const response = await fetch(event.request);
        if (response.ok) {
          await cache.put(cacheKey, response.clone());
        }
        return response;
      } catch (error) {
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) return cachedResponse;
        throw error;
      }
    })()
  );
});
