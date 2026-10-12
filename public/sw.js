// Service Worker for Bitcoin DCA Calculator
// NOTE: bump CACHE_VERSION on every deploy that changes cached content — the
// version change re-triggers install, which re-precaches the offline page and
// its chunks. The new worker deliberately does NOT skipWaiting/claim: it only
// activates (and purges old caches) once every tab from the previous deploy has
// closed, so open tabs never lose the hashed chunks they are still lazy-loading.
const CACHE_VERSION = 'btc-dca-v9';
const OFFLINE_URL = '/offline';
const SHARE_URL = '/share';

const PRECACHE = `${CACHE_VERSION}-precache`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const CURRENT_CACHES = [PRECACHE, PAGE_CACHE, STATIC_CACHE];

// Runtime caches are bounded: oldest entries are evicted past these caps so
// one-off URLs with settings in them can't grow storage without limit.
// /privacy quotes both numbers ("up to 60", "up to 120"); change them together.
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

  // The polyfill bundle arrives in a `<script noModule>` tag. Every browser
  // Next 16 supports (Chrome, Edge and Firefox 111+, Safari 16.4+) runs modules
  // and skips that tag, so precaching it downloaded about 110 KB for nothing.
  const html = (await response.text()).replace(/<script\b[^>]*\bnomodule\b[^>]*>/gi, '');
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

// Whether the server built this page from the query string. Next marks every
// per-request render "no-store" (the FIRE calculator is one); every other page
// is prerendered, and a prerendered page is the same HTML whatever follows the "?".
function isPerRequestRender(response) {
  return /\bno-store\b/i.test(response.headers.get('Cache-Control') || '');
}

// The two pages no copy is kept of. The offline page already lives in the
// precache. A shared link shows nothing of its own: it forwards to the
// calculator with the plan in its address, so a copy could only replay that
// step, and would file the plan's settings on the device to do it.
function keepsCopy(url) {
  return url.pathname !== OFFLINE_URL && url.pathname !== SHARE_URL;
}

// The address a page is filed under. A prerendered page goes under its path
// alone. The calculator rewrites its own address to /?amount=50&frequency=…
// as soon as it loads, and while pages were keyed by full address, reloading
// that offline found nothing and showed the Offline page with "/" sitting in
// the cache. It also means one entry per page, not one per result, counts
// against the cap. A per-request page keeps its query: its figures belong to it.
function pageKey(url, response) {
  return isPerRequestRender(response) ? url.pathname + url.search : url.pathname;
}

// The copy to show when the network cannot be reached, if there is one.
async function savedPage(url) {
  const cache = await caches.open(PAGE_CACHE);
  // Keys are addresses this worker wrote, not the requests that fetched the
  // pages, so the Vary header stored with a page has nothing to be compared to.
  const options = { ignoreVary: true };

  if (url.search) {
    const exact = await cache.match(url.pathname + url.search, options);
    if (exact) return exact;
  }

  const byPath = await cache.match(url.pathname, options);
  // A per-request page that was saved without a query answers that address
  // only. Its figures are for a different question than the one being asked.
  if (byPath && url.search && isPerRequestRender(byPath)) return undefined;
  return byPath;
}

// A saved copy is not the live page. Its prices, and every "today" printed on
// it, are as old as the copy, and the page has no way of knowing that it is
// being replayed. So the copy is labelled on its way out of the cache.
//
// The label is a <style> drawing body::before, not an element. React owns the
// document here: it leaves stray <style> and <script> tags alone, both while
// hydrating and if it has to rebuild the page after a hydration error
// (react-dom 19, clearContainerSparingly), but in the second case it would
// delete an injected <div>, and the label with it.
//
// The time is the server's Date header, in UTC like every date on the site.
// Vercel dates a page it rebuilds on a schedule with the moment it was built,
// and any other page with the moment it was sent. Either way the page read
// like this at that time and nothing on it is newer, hence "as of" and "or
// earlier". It is not when the device stored the copy, which can be later.
//
// The script does three things.
//
// A copy reached by Reload, Back or Forward opens at the top, where the label
// is. Left alone, the browser restores the old scroll position by putting the
// element that was on screen back where it was, and with the label added above
// it that is one label's height down the page, the label just out of view.
//
// It hides the label after a client-side navigation to another page, whose
// content was fetched after this copy was served, and shows it again on the
// way back.
//
// And when the browser reports a connection again it swaps the second
// sentence, until the connection goes again: the live price and anything
// recalculated are current from then on, so "from that time or earlier" would
// no longer hold for the whole page.
function savedCopyCue(iso) {
  const copy = iso ? `Saved copy as of ${iso.slice(0, 10)} at ${iso.slice(11, 16)} UTC` : 'Saved copy';
  const unreachable =
    ', shown because the site could not be reached. ' +
    `Its prices and results are from ${iso ? 'that time' : 'when it was saved'} or earlier.`;
  const reconnected = '. You are back online: reload for current prices and results.';
  const css =
    `body::before{content:"${copy}${unreachable}";display:block;` +
    'padding:max(10px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) 10px max(16px,env(safe-area-inset-left));' +
    'background:#fef3c7;color:#78350f;border-bottom:1px solid #f59e0b;' +
    'font-size:14px;font-weight:500;line-height:1.45;text-align:center}';
  const js =
    '(function(){var cue=document.getElementById("saved-copy-cue"),path=location.pathname;if(!cue)return;' +
    // "manual" stops the restore that follows the load; the one the browser
    // queued when the page committed has to be undone, and "auto" handed back
    // so that later entries in this tab restore as usual.
    'try{var nav=performance.getEntriesByType("navigation")[0];if(nav&&nav.type!=="navigate"){history.scrollRestoration="manual";' +
    'addEventListener("load",function(){setTimeout(function(){scrollTo(0,0);history.scrollRestoration="auto"},0)})}}catch(e){}' +
    'function sync(){cue.media=location.pathname===path?"all":"not all"}' +
    '["pushState","replaceState"].forEach(function(name){var original=history[name];' +
    'history[name]=function(){var result=original.apply(this,arguments);sync();return result}});' +
    'addEventListener("popstate",sync);' +
    `var css=cue.textContent,unreachable=${JSON.stringify(unreachable)},reconnected=${JSON.stringify(reconnected)};` +
    'addEventListener("online",function(){cue.textContent=css.replace(unreachable,reconnected)});' +
    'addEventListener("offline",function(){cue.textContent=css})})()';
  return `<style id="saved-copy-cue">${css}</style><script>${js}</script>`;
}

async function asSavedCopy(saved) {
  if (!(saved.headers.get('Content-Type') || '').includes('text/html')) return saved;

  const savedAt = Date.parse(saved.headers.get('Date') || '');
  const iso = Number.isFinite(savedAt) ? new Date(savedAt).toISOString() : '';
  const cue = savedCopyCue(iso);
  const html = (await saved.text()).replace('</head>', () => `${cue}</head>`);

  const headers = new Headers(saved.headers);
  // Both described the bytes that came over the network, not this text.
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  // The same fact for scripts: the page reads it from its navigation timing
  // entry (LivePriceTicker does, to mark its price "last known" at once).
  headers.append('Server-Timing', `sw-cache;desc="${iso}"`);
  return new Response(html, { status: saved.status, statusText: saved.statusText, headers });
}

// Network-first for HTML pages, falling back to the saved copy of the page and
// then the offline page. For navigations, the preloaded response is used when
// the browser produced one, which saves a full round trip on worker cold start.
async function handlePageRequest(event, request, isNavigate) {
  const url = new URL(request.url);

  // Back, Forward and a restored tab ask with cache mode "force-cache": the
  // browser answers from its own HTTP cache when it holds the page, however
  // old, without touching the network, and the preloaded response is that
  // same answer. Taken as it comes, it would go out as a live page with the
  // network down, and with no label.
  const viaHistory =
    isNavigate && (request.cache === 'force-cache' || request.cache === 'only-if-cached');
  let browserCopy;

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

    // A history navigation therefore has to reach the server (a 304 will do)
    // or fall through to a labelled copy. A per-request page is the exception:
    // it is never in the HTTP cache (no-store), so a preloaded one is live,
    // and asking again would make the server render it twice.
    if (viaHistory && !(response && isPerRequestRender(response))) {
      if (response && response.ok && keepsCopy(url)) browserCopy = response;
      response = await fetch(request.url, {
        cache: 'no-cache',
        redirect: 'manual',
        headers: { Accept: request.headers.get('Accept') || 'text/html' },
      });
    }

    if (!response) {
      response = await fetch(request);
    }

    // Cache successful page responses, bounded to the most recent pages.
    if (response.ok && keepsCopy(url)) {
      const clone = response.clone();
      event.waitUntil(
        caches.open(PAGE_CACHE).then(async (cache) => {
          await cache.put(pageKey(url, clone), clone);
          await trimCache(PAGE_CACHE, MAX_PAGE_ENTRIES);
        })
      );
    }

    return response;
  } catch {
    // The browser's copy stands in where this worker has none of its own: the
    // page a first visit opened, before the worker was in control, or one
    // that a new version of the worker has since cleared out with the rest.
    const saved = (await savedPage(url)) || browserCopy;
    if (saved) return asSavedCopy(saved);
    return (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

// For a navigation this worker neither stores nor replaces. It still has to
// answer it: with navigation preload on, the browser has already sent the
// request, and an event left unanswered makes it throw that response away and
// ask again, so the server would render the page twice. A failure is passed on
// as a failure, which is the browser's own error page.
async function passThrough(event, request) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
  } catch {
    // No usable preload (unsupported, offline, aborted): ask the network.
  }
  return fetch(request);
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

  const isNavigate = request.mode === 'navigate';

  // Prices and anything computed from them go to the network or fail. An
  // answer from a cache would look exactly like a live one, and nothing on
  // the receiving end could tell. That covers /api/* and the RSC payloads the
  // router fetches for client-side navigation; server actions are POSTs and
  // never reach this point.
  const isLiveData = url.pathname.startsWith('/api/') || request.headers.has('RSC');

  // The widget runs inside other people's pages. It never registers this
  // worker (layout.tsx), but a reader who has been to this site already has
  // it, and a failed load must not put this site's Offline page, or a saved
  // copy of someone's card, into a publisher's iframe.
  const isEmbed = url.pathname === '/embed' || url.pathname.startsWith('/embed/');

  if (isLiveData || isEmbed) {
    if (isNavigate) event.respondWith(passThrough(event, request));
    return;
  }

  // Determine strategy based on request type
  const accept = request.headers.get('Accept') || '';
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
