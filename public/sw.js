// Service Worker for Bitcoin DCA Calculator
// NOTE: bump CACHE_VERSION on every deploy that changes cached content —
// the version change re-triggers install/activate, which re-precaches the
// offline page and purges every previous cache below.
const CACHE_VERSION = 'btc-dca-v2';
const OFFLINE_URL = '/offline';

// Static assets to precache on install
const PRECACHE_URLS = [OFFLINE_URL];

// Install: precache offline page (bypass the HTTP cache so the freshly
// deployed offline page is stored, not a stale copy) + take over ASAP.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })))
      )
  );
  self.skipWaiting();
});

// Activate: delete every old cache, then claim all open clients so the
// new worker controls existing tabs without a reload.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip cross-origin requests (API calls, analytics, etc.)
  if (url.origin !== self.location.origin) return;

  // Skip API routes
  if (url.pathname.startsWith('/api/')) return;

  // Determine strategy based on request type
  const accept = request.headers.get('Accept') || '';
  const isNavigate = request.mode === 'navigate';
  const isPage = isNavigate || accept.includes('text/html');
  const isStatic =
    url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)$/) ||
    url.pathname.startsWith('/_next/static/');

  if (isPage) {
    // Network-first for HTML pages, fall back to offline page
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful page responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
        )
    );
  } else if (isStatic) {
    // Cache-first for static assets
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
  }
});
