// Bump this on every change to any cached file below — the browser only
// re-installs the service worker (and re-fetches these files) when this
// script's own bytes change, so an unbumped version silently keeps serving
// a stale app.js forever to anyone who visited before.
var CACHE_NAME = 'trump-card-app-v11';
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

// Network-first, not cache-first: the app is under active development, so
// always prefer the live network response (and keep the cache fresh from
// it) — only fall back to whatever's cached when there's no network at all.
// A cache-first strategy here previously meant a change could sit "live"
// on the server for a while before some visitors' browsers ever noticed.
self.addEventListener('fetch', function (event) {
  event.respondWith(
    fetch(event.request)
      .then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, copy);
        });
        return response;
      })
      .catch(function () {
        return caches.match(event.request);
      })
  );
});
