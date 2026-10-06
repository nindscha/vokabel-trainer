const CACHE_NAME = 'vokabel-trainer-v5';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './dataService.js',
  './vokabeln.json',
  './manifest.json'
];

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
  // vokabeln.json immer frisch laden
  if (event.request.url.includes('vokabeln.json')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./vokabeln.json', clone));
          return response;
        })
        .catch(() => caches.match('./vokabeln.json'))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
