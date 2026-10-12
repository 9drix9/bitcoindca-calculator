import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

// public/sw.js is a plain script for the ServiceWorkerGlobalScope, so it is run
// here the way a browser runs it: as source, against stand-ins for `self`,
// `caches` and `fetch`. Nothing is imported from it.
const SW_SOURCE = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');
const ORIGIN = 'https://btcdollarcostaverage.com';

const absolute = (key: string | { url: string }): string =>
    new URL(typeof key === 'string' ? key : key.url, ORIGIN).href;

const pathOf = (href: string): string => {
    const url = new URL(href);
    return url.pathname + url.search;
};

/** Enough of a navigation Request for the worker: Node's own cannot have mode 'navigate'. */
interface FakeRequest {
    url: string;
    method: string;
    mode: string;
    cache: string;
    headers: Headers;
}

const request = (path: string, init: { mode?: string; method?: string; cache?: string; headers?: Record<string, string> } = {}): FakeRequest => ({
    url: new URL(path, ORIGIN).href,
    method: init.method ?? 'GET',
    mode: init.mode ?? 'navigate',
    cache: init.cache ?? 'default',
    headers: new Headers(init.headers ?? { Accept: 'text/html,application/xhtml+xml' }),
});

type Fetch = (input: string | { url: string }) => Promise<Response>;

class FakeCache {
    private entries: { url: string; response: Response }[] = [];

    constructor(private readonly fetchAsset: Fetch) {}

    /** All or nothing, like the real one: a single failed asset rejects the install. */
    async addAll(urls: string[]): Promise<void> {
        const responses = await Promise.all(urls.map((url) => this.fetchAsset(url)));
        if (responses.some((response) => !response.ok)) throw new TypeError('addAll: request failed');
        await Promise.all(urls.map((url, i) => this.put(url, responses[i])));
    }

    async put(key: string | { url: string }, response: Response): Promise<void> {
        const url = absolute(key);
        // Per the Cache spec a put replaces the entry and moves it to the end.
        this.entries = this.entries.filter((entry) => entry.url !== url);
        this.entries.push({ url, response });
    }

    async match(key: string | { url: string }): Promise<Response | undefined> {
        const url = absolute(key);
        return this.entries.find((entry) => entry.url === url)?.response.clone();
    }

    async keys(): Promise<{ url: string }[]> {
        return this.entries.map(({ url }) => ({ url }));
    }

    async delete(key: string | { url: string }): Promise<boolean> {
        const url = absolute(key);
        const before = this.entries.length;
        this.entries = this.entries.filter((entry) => entry.url !== url);
        return this.entries.length < before;
    }

    paths(): string[] {
        return this.entries.map(({ url }) => pathOf(url));
    }
}

type Route = { body: string; headers?: Record<string, string>; status?: number };

const PRERENDERED = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 's-maxage=86400, stale-while-revalidate=31449600' };
const PER_REQUEST = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate' };
const FETCHED_AT = 'Mon, 12 Oct 2026 05:38:32 GMT';

const page = (marker: string, headers: Record<string, string> = PRERENDERED): Route => ({
    body: `<!DOCTYPE html><html lang="en"><head><title>${marker}</title></head><body><p>${marker}</p></body></html>`,
    headers: { ...headers, Date: FETCHED_AT },
});

const OFFLINE_HEADING = "Can't reach the site";

const OFFLINE_PAGE: Route = {
    body:
        '<!DOCTYPE html><html><head>' +
        '<link rel="stylesheet" href="/_next/static/chunks/app.css"/>' +
        '<script src="/_next/static/chunks/main.js" async=""></script>' +
        '<script src="/_next/static/chunks/polyfills.js" noModule=""></script>' +
        `</head><body><h1>${OFFLINE_HEADING}</h1>` +
        '<script>self.__next_f.push([1,"[\\"/_next/static/chunks/main.js\\",\\"/_next/static/chunks/offline.js\\"]"])</script>' +
        '</body></html>',
    headers: PRERENDERED,
};

function startWorker(routes: Record<string, Route>) {
    const caches = new Map<string, FakeCache>();
    const listeners = new Map<string, (event: unknown) => void>();
    const fetched: string[] = [];
    const network = { online: true };

    const fetchStub: Fetch = async (input) => {
        const path = pathOf(absolute(input));
        fetched.push(path);
        if (!network.online) throw new TypeError('Failed to fetch');
        const route = routes[path];
        if (!route) return new Response('Not found', { status: 404 });
        return new Response(route.body, { status: route.status ?? 200, headers: route.headers });
    };

    const open = async (name: string): Promise<FakeCache> => {
        if (!caches.has(name)) caches.set(name, new FakeCache(fetchStub));
        return caches.get(name)!;
    };

    vm.runInNewContext(SW_SOURCE, {
        self: {
            location: new URL('/sw.js', ORIGIN),
            registration: { navigationPreload: { enable: async () => undefined } },
            addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
        },
        caches: {
            open,
            keys: async () => [...caches.keys()],
            delete: async (name: string) => caches.delete(name),
            match: async (key: string | { url: string }) => {
                for (const cache of caches.values()) {
                    const hit = await cache.match(key);
                    if (hit) return hit;
                }
                return undefined;
            },
        },
        fetch: fetchStub,
        // Node's Request rejects the relative URLs a worker is allowed to use.
        Request: class {
            url: string;
            constructor(input: string) {
                this.url = absolute(input);
            }
        },
        Response,
        Headers,
        URL,
    });

    /** Runs a lifecycle event to completion. */
    const lifecycle = async (type: 'install' | 'activate'): Promise<void> => {
        const pending: Promise<unknown>[] = [];
        listeners.get(type)!({ waitUntil: (work: Promise<unknown>) => pending.push(work) });
        await Promise.all(pending);
    };

    /**
     * Sends one request through the fetch listener. Resolves to null when the
     * worker stayed out of it, and rejects when it answered with a failure.
     * `preload` stands in for the response the browser fetched ahead of the
     * worker (navigation preload).
     */
    const send = async (req: FakeRequest, preload?: Response): Promise<Response | null> => {
        const pending: Promise<unknown>[] = [];
        let answer: Promise<Response> | null = null;
        listeners.get('fetch')!({
            request: req,
            preloadResponse: Promise.resolve(preload),
            respondWith: (work: Promise<Response>) => { answer = work; },
            waitUntil: (work: Promise<unknown>) => pending.push(work),
        });
        const response = answer ? await (answer as Promise<Response>) : null;
        await Promise.all(pending);
        return response;
    };

    /** What one of the worker's caches holds, by its role. Empty if it was never opened. */
    const cached = (role: 'precache' | 'pages' | 'static'): string[] => {
        const name = [...caches.keys()].find((key) => key.endsWith(`-${role}`));
        return name ? caches.get(name)!.paths() : [];
    };

    return { caches, fetched, network, open, lifecycle, send, cached };
}

const ROUTES: Record<string, Route> = {
    '/offline': OFFLINE_PAGE,
    '/_next/static/chunks/app.css': { body: 'css' },
    '/_next/static/chunks/main.js': { body: 'main' },
    '/_next/static/chunks/offline.js': { body: 'offline' },
    '/_next/static/chunks/polyfills.js': { body: 'polyfills' },
    '/': page('home'),
    '/?amount=50&frequency=weekly': page('home'),
    '/about': page('about'),
    '/share?amount=50': page('share-50', PER_REQUEST),
    '/calculators/bitcoin-fire': page('fire-default', PER_REQUEST),
    '/calculators/bitcoin-fire?amount=100': page('fire-100', PER_REQUEST),
    '/embed?amount=50': page('embed-50', PER_REQUEST),
    '/api/v1/prices': { body: '{"prices":[]}', headers: { 'Content-Type': 'application/json' } },
};

async function installedWorker() {
    const worker = startWorker(ROUTES);
    await worker.lifecycle('install');
    await worker.lifecycle('activate');
    return worker;
}

describe('service worker: install and activate', () => {
    it('precaches the offline page and the chunks it runs, without the noModule polyfill', async () => {
        const worker = await installedWorker();
        expect(worker.cached('precache').sort()).toEqual([
            '/_next/static/chunks/app.css',
            '/_next/static/chunks/main.js',
            '/_next/static/chunks/offline.js',
            '/offline',
        ]);
        expect(worker.fetched).not.toContain('/_next/static/chunks/polyfills.js');
    });

    it('deletes the caches of earlier versions on activate and keeps its own', async () => {
        const worker = startWorker(ROUTES);
        await (await worker.open('btc-dca-v1-pages')).put('/about', new Response('old'));
        await worker.lifecycle('install');
        await worker.lifecycle('activate');
        const names = [...worker.caches.keys()];
        expect(names).not.toContain('btc-dca-v1-pages');
        expect(names.some((name) => /^btc-dca-v\d+-precache$/.test(name))).toBe(true);
    });
});

describe('service worker: pages', () => {
    it('hands a live page through untouched', async () => {
        const worker = await installedWorker();
        const response = await worker.send(request('/about'));
        expect(await response!.text()).toBe(ROUTES['/about'].body);
    });

    it('files a prerendered page under its path, whatever its query string was', async () => {
        const worker = await installedWorker();
        await worker.send(request('/?amount=50&frequency=weekly'));
        await worker.send(request('/'));
        expect(worker.cached('pages')).toEqual(['/']);
    });

    it('serves the saved page offline when only the query string differs', async () => {
        const worker = await installedWorker();
        await worker.send(request('/'));
        worker.network.online = false;

        const response = await worker.send(request('/?amount=75&frequency=monthly&startDate=2021-10-12'));
        const html = await response!.text();
        expect(html).toContain('<p>home</p>');
        expect(html).not.toContain(OFFLINE_HEADING);
    });

    it('keeps a per-request page for its exact address only', async () => {
        const worker = await installedWorker();
        await worker.send(request('/calculators/bitcoin-fire?amount=100'));
        await worker.send(request('/calculators/bitcoin-fire'));
        expect(worker.cached('pages')).toEqual(['/calculators/bitcoin-fire?amount=100', '/calculators/bitcoin-fire']);
        worker.network.online = false;

        expect(await (await worker.send(request('/calculators/bitcoin-fire?amount=100')))!.text()).toContain('<p>fire-100</p>');
        // Another plan's numbers, or the default plan's under this plan's
        // address, would be a wrong answer. The Offline page is the honest one.
        expect(await (await worker.send(request('/calculators/bitcoin-fire?amount=999')))!.text()).toContain(OFFLINE_HEADING);
        expect(await (await worker.send(request('/calculators/bitcoin-fire')))!.text()).toContain('<p>fire-default</p>');
    });

    // /share only forwards to the calculator. A copy of it would be that one
    // step, filed on the device under the plan's settings.
    it('keeps no copy of a shared link, and answers one with the offline page when the network is down', async () => {
        const worker = await installedWorker();
        expect(await (await worker.send(request('/share?amount=50')))!.text()).toBe(ROUTES['/share?amount=50'].body);
        expect(worker.cached('pages')).toEqual([]);

        worker.network.online = false;
        const html = await (await worker.send(request('/share?amount=50')))!.text();
        expect(html).toContain(OFFLINE_HEADING);
        expect(html).not.toContain('saved-copy-cue');
    });

    it('falls back to the offline page for a page that was never opened', async () => {
        const worker = await installedWorker();
        worker.network.online = false;
        const response = await worker.send(request('/mining'));
        const html = await response!.text();
        expect(html).toContain(OFFLINE_HEADING);
        expect(html).not.toContain('saved-copy-cue');
    });

    it('keeps the 60 most recent pages and drops the oldest', async () => {
        const routes = { ...ROUTES };
        for (let i = 0; i < 65; i++) routes[`/dca/page-${i}`] = page(`scenario-${i}`);
        const worker = startWorker(routes);
        await worker.lifecycle('install');
        for (let i = 0; i < 65; i++) await worker.send(request(`/dca/page-${i}`));
        const saved = worker.cached('pages');
        expect(saved).toHaveLength(60);
        expect(saved[0]).toBe('/dca/page-5');
    });
});

describe('service worker: the saved-copy label', () => {
    const savedCopyOf = async (path: string, routes: Record<string, Route> = ROUTES): Promise<Response> => {
        const worker = startWorker(routes);
        await worker.lifecycle('install');
        await worker.send(request(path));
        worker.network.online = false;
        return (await worker.send(request(path)))!;
    };

    it('dates the copy with the Date header it was served with, in UTC, and says its prices are no newer', async () => {
        const html = await (await savedCopyOf('/about')).text();
        expect(html).toContain(
            'Saved copy as of 2026-10-12 at 05:38 UTC, shown because the site could not be reached. ' +
            'Its prices and results are from that time or earlier.',
        );
        expect(html).toContain('<style id="saved-copy-cue">');
        // After every tag the server rendered, so React matches its own first.
        expect(html).toMatch(/<\/script><\/head><body>/);
        expect(html.indexOf('saved-copy-cue')).toBeGreaterThan(html.indexOf('<title>'));
    });

    it('claims no time when the response carried none', async () => {
        const undated = { ...ROUTES, '/about': { ...ROUTES['/about'], headers: PRERENDERED } };
        const html = await (await savedCopyOf('/about', undated)).text();
        expect(html).toContain('Saved copy, shown because the site could not be reached.');
        expect(html).toContain('Its prices and results are from when it was saved or earlier.');
    });

    // LivePriceTicker looks for this entry on the navigation timing of the page
    // to call its price "last known" before its first poll has failed.
    it('marks the response for scripts with a sw-cache Server-Timing entry', async () => {
        expect((await savedCopyOf('/about')).headers.get('Server-Timing')).toBe('sw-cache;desc="2026-10-12T05:38:32.000Z"');

        const worker = await installedWorker();
        expect((await worker.send(request('/about')))!.headers.has('Server-Timing')).toBe(false);
        worker.network.online = false;
        expect((await worker.send(request('/mining')))!.headers.has('Server-Timing')).toBe(false);
    });

    /**
     * Runs the label's inline script as the saved copy of /about would, against
     * stand-ins for the document and the window. `navigationType` is what the
     * page's navigation timing entry reports for how it was reached.
     */
    const runLabelScript = async (navigationType: string) => {
        const html = await (await savedCopyOf('/about')).text();
        const [, css, script] = /<style id="saved-copy-cue">(.*?)<\/style><script>(.*?)<\/script><\/head>/.exec(html)!;

        const cue = { media: '', textContent: css };
        const location = { pathname: '/about' };
        const handlers = new Map<string, () => void>();
        const timers: (() => void)[] = [];
        const scrolls: [number, number][] = [];
        const history = {
            scrollRestoration: 'auto',
            pushState(_state: unknown, _unused: string, url: string) { location.pathname = url; },
            replaceState(_state: unknown, _unused: string, url: string) { location.pathname = url; },
        };
        vm.runInNewContext(script, {
            document: { getElementById: (id: string) => (id === 'saved-copy-cue' ? cue : null) },
            location,
            history,
            performance: { getEntriesByType: (type: string) => (type === 'navigation' ? [{ type: navigationType }] : []) },
            addEventListener: (type: string, handler: () => void) => handlers.set(type, handler),
            setTimeout: (work: () => void) => { timers.push(work); },
            scrollTo: (x: number, y: number) => { scrolls.push([x, y]); },
        });
        return { cue, location, history, handlers, timers, scrolls };
    };

    it('hides itself after a client-side navigation and returns with the page', async () => {
        const { cue, location, history, handlers } = await runLabelScript('navigate');

        // The calculator rewriting its own query string is not a navigation.
        history.replaceState(null, '', '/about');
        expect(cue.media).toBe('all');
        history.pushState(null, '', '/mining');
        expect(cue.media).toBe('not all');
        location.pathname = '/about';
        handlers.get('popstate')!();
        expect(cue.media).toBe('all');
    });

    // The browser would otherwise restore the old scroll position, which puts
    // the label just above the top of the screen.
    it.each(['reload', 'back_forward'])('opens at the top after a %s, then hands scroll restoration back', async (navigationType) => {
        const { history, handlers, timers, scrolls } = await runLabelScript(navigationType);
        expect(history.scrollRestoration).toBe('manual');
        expect(scrolls).toEqual([]);

        handlers.get('load')!();
        for (const timer of timers) timer();
        expect(scrolls).toEqual([[0, 0]]);
        expect(history.scrollRestoration).toBe('auto');
    });

    it('leaves a fresh navigation where the browser put it', async () => {
        const { history, handlers, timers, scrolls } = await runLabelScript('navigate');
        expect(history.scrollRestoration).toBe('auto');
        expect(handlers.has('load')).toBe(false);
        expect(timers).toEqual([]);
        expect(scrolls).toEqual([]);
    });

    it('swaps its second sentence when the device reports a connection, and back when it goes', async () => {
        const { cue, handlers } = await runLabelScript('reload');
        const unreachable = cue.textContent;

        handlers.get('online')!();
        expect(cue.textContent).toContain('content:"Saved copy as of 2026-10-12 at 05:38 UTC. You are back online: reload for current prices and results."');
        expect(cue.textContent).not.toContain('could not be reached');

        handlers.get('offline')!();
        expect(cue.textContent).toBe(unreachable);
    });
});

describe('service worker: Back, Forward and restored tabs', () => {
    // The browser asks for these with cache mode "force-cache" and answers from
    // its own HTTP cache when it holds the page, network or no network. The
    // preloaded response stands in for that answer here.
    const viaHistory = (path: string): FakeRequest => request(path, { cache: 'force-cache' });
    const browserCopy = ({ body, headers }: Route): Response => new Response(body, { headers });

    it('labels the page when the network is down, although the browser still had it', async () => {
        const worker = await installedWorker();
        await worker.send(request('/about'));
        worker.network.online = false;

        const response = (await worker.send(viaHistory('/about'), browserCopy(ROUTES['/about'])))!;
        expect(response.headers.get('Server-Timing')).toContain('sw-cache');
        expect(await response.text()).toContain('<style id="saved-copy-cue">');
    });

    it('asks the server before showing it when the network is up', async () => {
        const worker = await installedWorker();
        const asked = worker.fetched.length;

        const response = (await worker.send(viaHistory('/about'), browserCopy(page('about as the browser kept it'))))!;
        expect(worker.fetched.slice(asked)).toEqual(['/about']);
        expect(await response.text()).toBe(ROUTES['/about'].body);
    });

    // A per-request page is never in the HTTP cache, so the preloaded one came
    // off the network. Asking again would have the server render it twice.
    it('takes a preloaded per-request page as live, without a second request', async () => {
        const worker = await installedWorker();
        const asked = worker.fetched.length;

        const response = (await worker.send(viaHistory('/calculators/bitcoin-fire'), new Response('preloaded', { headers: PER_REQUEST })))!;
        expect(await response.text()).toBe('preloaded');
        expect(worker.fetched).toHaveLength(asked);
    });

    // The page a first visit opened was loaded before the worker took control,
    // so only the browser has it.
    it('shows the browser\'s copy, labelled, of a page the worker never stored', async () => {
        const worker = await installedWorker();
        worker.network.online = false;

        const html = await (await worker.send(viaHistory('/about'), browserCopy(ROUTES['/about'])))!.text();
        expect(html).toContain('<p>about</p>');
        expect(html).toContain('Saved copy as of 2026-10-12 at 05:38 UTC');
        expect(html).not.toContain(OFFLINE_HEADING);
    });

    it('does not dress the offline page up as a saved copy', async () => {
        const worker = await installedWorker();
        worker.network.online = false;

        const html = await (await worker.send(viaHistory('/offline'), browserCopy(OFFLINE_PAGE)))!.text();
        expect(html).toContain(OFFLINE_HEADING);
        expect(html).not.toContain('saved-copy-cue');
    });
});

describe('service worker: what it never stores or answers from a cache', () => {
    it.each([
        ['the price API', request('/api/v1/prices', { mode: 'cors', headers: { Accept: 'application/json' } })],
        ['an RSC payload', request('/about?_rsc=1abc', { mode: 'cors', headers: { Accept: '*/*', RSC: '1' } })],
        ['a server action', request('/', { method: 'POST', mode: 'cors' })],
        ['another origin', request('https://api.exchange.coinbase.com/products/BTC-USD/candles', { mode: 'cors' })],
    ])('leaves %s to the network', async (_name, req) => {
        const worker = await installedWorker();
        expect(await worker.send(req)).toBeNull();
        expect(worker.cached('pages')).toEqual([]);
        expect(worker.cached('static')).toEqual([]);

        worker.network.online = false;
        expect(await worker.send(req)).toBeNull();
    });

    it.each([
        ['an API URL opened as a page', '/api/v1/prices'],
        ['the embedded widget', '/embed?amount=50'],
    ])('passes %s through, and a failure stays a failure', async (_name, path) => {
        const worker = await installedWorker();
        expect(await (await worker.send(request(path)))!.text()).toBe(ROUTES[path].body);
        expect(worker.cached('pages')).toEqual([]);

        // Not the Offline page and not a saved copy: inside a publisher's
        // iframe, or in place of JSON, either would be a wrong answer.
        worker.network.online = false;
        await expect(worker.send(request(path))).rejects.toThrow('Failed to fetch');
    });
});

describe('service worker: navigation preload', () => {
    // The browser sends a navigation before the worker has started. If the
    // worker does not use that response, the origin is asked a second time.
    it.each(['/about', '/embed?amount=50', '/api/v1/prices'])('answers %s with the preloaded response, without a second request', async (path) => {
        const worker = await installedWorker();
        const asked = worker.fetched.length;
        const response = await worker.send(request(path), new Response('preloaded', { headers: PRERENDERED }));
        expect(await response!.text()).toBe('preloaded');
        expect(worker.fetched).toHaveLength(asked);
    });
});
