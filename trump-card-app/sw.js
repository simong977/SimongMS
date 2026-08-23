// Bump this on every change to any cached file below — the browser only
// re-installs the service worker (and re-fetches these files) when this
// script's own bytes change, so an unbumped version silently keeps serving
// a stale app.js forever to anyone who visited before.
var CACHE_NAME = 'trump-card-app-v5';
var ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './qrcode.lib.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) {
          return key !== CACHE_NAME;
        }).map(function (key) {
          return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request);
    })
  );
});
