// Service Worker for Bitcoin DCA Calculator
// NOTE: bump CACHE_VERSION on every deploy that changes cached content — the
// version change re-triggers install, which re-precaches the offline page and
// its chunks. The new worker deliberately does NOT skipWaiting/claim: it only
// activates (and purges old caches) once every tab from the previous deploy has
// closed, so open tabs never lose the hashed chunks they are still lazy-loading.
const CACHE_VERSION = 'btc-dca-v5';
const OFFLINE_URL = '/offline';

const PRECACHE = `${CACHE_VERSION}-precache`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const CURRENT_CACHES = [PRECACHE, PAGE_CACHE, STATIC_CACHE];

// Runtime caches are bounded: oldest entries are evicted past these caps so
// share-parameterized one-off URLs can't grow storage without limit.
const MAX_PAGE_ENTRIES = 60;
const MAX_STATIC_ENTRIES = 120;

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

// Precache the offline page AND the /_next/static chunks it hydrates from.
// Without the chunks, a cold offline hit gets the HTML but hydration fails, so
// the "Try Again" button and the auto-reload-on-reconnect listener are dead —
// the exact scenario the page exists for.
async function precacheOfflinePage() {
  const cache = await caches.open(PRECACHE);
  // Bypass the HTTP cache so the freshly deployed offline page is stored,
  // not a stale copy.
  const response = await fetch(new Request(OFFLINE_URL, { cache: 'reload' }));
  if (!response.ok) throw new Error(`precache failed: ${OFFLINE_URL} ${response.status}`);
  await cache.put(OFFLINE_URL, response.clone());

  const html = await response.text();
  // Asset URLs also appear backslash-escaped inside the RSC payload JSON;
  // excluding "\" keeps those matches clean.
  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\\\s>]+/g) || [])];
  await cache.addAll(assets);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheOfflinePage());
});

// Activate: delete caches from previous versions and turn on navigation
// preload. Runs only after the last old-deploy tab is gone (no skipWaiting),
// so deleting the old generation here is safe.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key))
      );

      // Navigation preload lets the browser start the navigation request in
      // parallel with booting this worker, instead of waiting for it. Not in
      // every browser (Safari only added it recently), hence the guard.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
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

    // Cache successful page responses, bounded to the most recent pages
    if (response.ok) {
      const clone = response.clone();
      event.waitUntil(
        caches.open(PAGE_CACHE).then(async (cache) => {
          await cache.put(request, clone);
          await trimCache(PAGE_CACHE, MAX_PAGE_ENTRIES);
        })
      );
    }

    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

// Cache-first, no revalidation: only for content-hashed /_next/static files,
// which are immutable by construction.
async function handleImmutableAsset(event, request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const clone = response.clone();
    event.waitUntil(
      caches.open(STATIC_CACHE).then(async (cache) => {
        await cache.put(request, clone);
        await trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES);
      })
    );
  }
  return response;
}

// Stale-while-revalidate for mutable public/ assets (icons, wallet images,
// SVGs): serve the cache instantly, refresh it in the background. These files
// are NOT content-hashed, so plain cache-first would pin returning visitors to
// an old image until someone remembered to bump CACHE_VERSION.
async function handleMutableAsset(event, request) {
  const cached = await caches.match(request);
  const refresh = fetch(request).then(async (response) => {
    if (response.ok) {
      const clone = response.clone();
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, clone);
      await trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES);
    }
    return response;
  });

  if (cached) {
    event.waitUntil(refresh.catch(() => {}));
    return cached;
  }
  return refresh.catch(() => Response.error());
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
  const isImmutable = url.pathname.startsWith('/_next/static/');
  const isStatic = url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?|ttf|eot)$/);

  if (isPage) {
    event.respondWith(handlePageRequest(event, request, isNavigate));
  } else if (isImmutable) {
    event.respondWith(handleImmutableAsset(event, request));
  } else if (isStatic) {
    event.respondWith(handleMutableAsset(event, request));
  }
});
