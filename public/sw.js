// Service Worker for Bitcoin DCA Calculator
// NOTE: bump CACHE_VERSION on every deploy that changes cached content —
// the version change re-triggers install/activate, which re-precaches the
// offline page and purges every previous cache below. Static assets use a
// cache-first strategy that never revalidates, so a bump is the only way
// existing visitors pick up a changed image or font.
const CACHE_VERSION = 'btc-dca-v4';
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

// Activate: delete every old cache, turn on navigation preload, then claim all
// open clients so the new worker controls existing tabs without a reload.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      );

      // Navigation preload lets the browser start the navigation request in
      // parallel with booting this worker, instead of waiting for it. Not in
      // every browser (Safari only added it recently), hence the guard.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      await self.clients.claim();
    })()
  );
});

// Network-first for HTML pages, falling back to the cached page and then the
// offline page. For navigations, the preloaded response is used when the
// browser produced one, which saves a full round trip on worker cold start.
async function handlePageRequest(event, request, isNavigate) {
  try {
    let response;

    if (isNavigate && event.preloadResponse) {
      try {
        response = await event.preloadResponse;
      } catch {
        // Preload failed (offline, aborted). Fall through to a normal fetch;
        // if that fails too the outer catch serves the cache.
        response = undefined;
      }
    }

    if (!response) {
      response = await fetch(request);
    }

    // Cache successful page responses
    if (response.ok) {
      const clone = response.clone();
      event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone)));
    }

    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

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
    url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?|ttf|eot)$/) ||
    url.pathname.startsWith('/_next/static/');

  if (isPage) {
    event.respondWith(handlePageRequest(event, request, isNavigate));
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
