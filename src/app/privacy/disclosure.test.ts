import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { LIVE_SIDEBAR_URL, LIVE_TICKER_URL } from '@/app/api/live/contract';
import { stripQueryAndHash } from '@/components/LazyAnalytics';
import { createPoller, type PollerEnv } from '@/components/live/livePoller';
import { googleAdsCookieNames } from '@/hooks/useConsent';

/**
 * /privacy makes statements about code that lives in other files: which keys
 * the site writes to browser storage, what the analytics scripts are sent,
 * which pages carry an ad frame, which providers the server calls. Nothing else
 * ties the page to that code.
 *
 * Where a statement rests on one function, the test runs that function. The
 * rest read the policy and the code as text. Those are heuristics: each catches
 * the forms it names (a literal `src`, a key held in a *KEY* constant, a call
 * spelled `fetch(`) and is no proof that nothing else exists.
 *
 * When one fails, the code has moved: change the policy (and its "Last
 * updated" date) to match, then the test if it needs it. Do not loosen a test
 * to keep an old sentence.
 */

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const read = (fromSrc: string): string => readFileSync(SRC + fromSrc, 'utf8');

/** Source as a reader meets it: one line, entities decoded, braces from wrapped JSX text gone. */
const asProse = (source: string): string =>
    source
        .replace(/\{' '\}/g, ' ')
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ');

const policySource = read('app/privacy/page.tsx');
const policy = asProse(policySource);
const terms = asProse(read('app/terms/page.tsx'));

/** Every non-test source file under src/, as a path from src/. */
const sourceFiles: string[] = (readdirSync(SRC, { recursive: true }) as string[])
    .map((file) => file.split('\\').join('/'))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file) && !file.endsWith('.d.ts'));

const sources = new Map(sourceFiles.map((file) => [file, read(file)]));

const SITE = 'https://btcdollarcostaverage.com';

/**
 * public/sw.js run as a browser runs it, far enough to read its constants and
 * call its functions. Its listeners are never fired here: offline/sw.test.ts
 * does that.
 */
const worker = (() => {
    const context = vm.createContext({ self: { addEventListener: () => {}, location: { origin: SITE } } });
    vm.runInContext(readFileSync(SRC + '../public/sw.js', 'utf8'), context);
    return <T>(name: string): T => vm.runInContext(name, context) as T;
})();

describe('browser storage named on /privacy', () => {
    // The site's convention: a storage key is a string constant whose name
    // contains KEY. A constant that matches but is not a storage key belongs in
    // this list, with a word on what it is.
    const NOT_STORAGE_KEYS: string[] = [];

    const keys = new Set<string>();
    for (const source of sources.values()) {
        for (const match of source.matchAll(/const\s+\w*KEY\w*\s*=\s*['"`]([^'"`$]+)['"`]/g)) keys.add(match[1]);
        // A key written inline, with no constant, has to be listed as well.
        for (const match of source.matchAll(/(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*['"`]([^'"`$]+)['"`]/g)) keys.add(match[1]);
        for (const match of source.matchAll(/(?:readStorage|writeStorage|removeStorage)\(\s*'(?:local|session)'\s*,\s*['"`]([^'"`$]+)['"`]/g)) keys.add(match[1]);
    }
    for (const skip of NOT_STORAGE_KEYS) keys.delete(skip);

    it('finds the keys the site is known to write', () => {
        // Guards the scan itself: a pattern that matches nothing would pass every check below.
        expect([...keys]).toEqual(expect.arrayContaining(['cookie-consent', 'theme-preference', 'btc-dca-cost-basis-positions']));
    });

    it.each([...keys])('names %s', (key) => {
        expect(policySource, `/privacy does not name the storage key "${key}". Add it to "Cookies & Browser Storage".`).toContain(`<Key>${key}</Key>`);
    });

    it('names what Google\'s tag writes, and what withdrawal deletes', () => {
        for (const name of ['_gcl_au', '_gcl_aw', '_gcl_ls']) expect(policySource).toContain(`<Key>${name}</Key>`);
        // "this site deletes the _gcl_ cookies": the cleanup has to recognise them.
        expect(googleAdsCookieNames('theme=dark; _gcl_au=1.1.2.3; _gcl_aw=GCL.1.x')).toEqual(['_gcl_au', '_gcl_aw']);
        expect(
            read('components/ConsentGatedScripts.tsx'),
            '/privacy says withdrawing consent deletes these. ConsentGatedScripts no longer shows that it does.',
        ).toMatch(/if \(!granted\) clearGoogleAdsStorage\(\)/);
    });

    it('quotes the service worker\'s cache limits and the install prompt\'s wait as they are', () => {
        expect(policy).toContain(`pages you opened (up to ${worker<number>('MAX_PAGE_ENTRIES')})`);
        expect(policy).toContain(`images (up to ${worker<number>('MAX_STATIC_ENTRIES')})`);

        const days = read('components/PwaInstallPrompt.tsx').match(/REOFFER_AFTER_MS = (\d+) \* 24 \* 60 \* 60 \* 1000/)?.[1];
        expect(days, 'PwaInstallPrompt no longer declares REOFFER_AFTER_MS in days').toBeTruthy();
        expect(policy).toContain(`not offered again for ${days} days`);
    });

    it('says which offline copies are stored with the settings in their address, and which are never stored', () => {
        const pageKey = worker<(url: URL, response: Response) => string>('pageKey');
        const keepsCopy = worker<(url: URL) => boolean>('keepsCopy');
        const html = (cacheControl: string) => new Response('', { headers: { 'Cache-Control': cacheControl } });
        // What Next sends with a prerendered page and with one built for the request.
        const prerendered = html('s-maxage=86400, stale-while-revalidate=31449600');
        const perRequest = html('private, no-cache, no-store, max-age=0, must-revalidate');

        expect(pageKey(new URL(`${SITE}/?amount=1234&startingBtc=1.5`), prerendered)).toBe('/');
        expect(policy).toContain('Most pages are stored under their path alone, with nothing after the "?"');

        expect(pageKey(new URL(`${SITE}/calculators/bitcoin-fire?amount=250`), perRequest)).toBe('/calculators/bitcoin-fire?amount=250');
        expect(policy).toContain("The FIRE and drawdown calculators' pages are built by our server from the settings in their address, and each is stored under its full address");

        expect(keepsCopy(new URL(`${SITE}/share?amount=1234`))).toBe(false);
        expect(keepsCopy(new URL(`${SITE}/calculators/bitcoin-fire?amount=250`))).toBe(true);
        expect(policy).toContain('A shared link is never stored.');

        // A page is built per request when it reads its own query string on the
        // server. The policy lists those pages, so a new one has to be added there.
        const readsItsQuery = sourceFiles
            .filter((file) => /^app\/(?:.*\/)?page\.tsx$/.test(file) && /\bsearchParams\b/.test(sources.get(file) ?? ''))
            .sort();
        expect(readsItsQuery, 'A page now reads its query string on the server, or one has stopped: /privacy lists them under "Offline copies" and "Shared links".').toEqual([
            'app/calculators/bitcoin-drawdown/page.tsx',
            'app/calculators/bitcoin-fire/page.tsx',
            // Never stored: the worker passes the widget straight through (offline/sw.test.ts).
            'app/embed/page.tsx',
            // Never stored: see keepsCopy above.
            'app/share/page.tsx',
        ]);
    });
});

describe('what the analytics scripts are sent', () => {
    const sent = (address: string): string | undefined => stripQueryAndHash({ type: 'pageview', url: address })?.url;

    it('is the page path and nothing after it, as /privacy says', () => {
        expect(policy).toContain('Everything after a "?" or a "#" is removed, campaign tags included.');
        expect(sent(`${SITE}/share?amount=1234&startDate=2021-01-04&startingBtc=1.5&utm_source=x#results`)).toBe(`${SITE}/share`);
        expect(sent(`${SITE}/?utm_campaign=launch&gclid=abc`)).toBe(`${SITE}/`);
    });

    // The report body is cut to the path, but the request that carries it has
    // a Referer header too, and for a same-site request the old policy put the
    // whole page address in it.
    it('sends each report with a Referer that is the site origin only', () => {
        expect(readFileSync(SRC + '../next.config.ts', 'utf8')).toContain("{ key: 'Referrer-Policy', value: 'strict-origin' }");
    });

    it('hands both scripts the scrub, and returns nothing on the embed path', () => {
        const analytics = read('components/LazyAnalytics.tsx');
        const unscrubbed = '/privacy says both Vercel scripts send the path only. One of them no longer gets the scrub.';
        expect(analytics, unscrubbed).toMatch(/<Analytics\s+beforeSend=\{stripQueryAndHash\}/);
        expect(analytics, unscrubbed).toMatch(/<SpeedInsights\s+beforeSend=\{stripQueryAndHash\}/);
        expect(analytics, '/privacy says analytics do not run in the embeddable widget.')
            .toMatch(/(?:isEmbedPath\([^)\n]*\)|pathname === '\/embed')[^\n]*return null/);
        expect(policy).toContain('on every page except the embeddable widget');
    });
});

describe('what the calculator sends our server', () => {
    // "Data Collection" says, lookup by lookup, what a request carries. A server
    // action can only be sent what it has a parameter for, so the parameter
    // lists are the ceiling on those sentences. A new parameter is something
    // the policy has to name.
    const actions = read('app/actions.ts');
    const parametersOf = (action: string): string[] => {
        const list = actions.match(new RegExp(`export async function ${action}\\(([^)]*)\\)`))?.[1];
        if (list === undefined) return [`${action} is not declared the way this test reads it`];
        return list.split(',').map((parameter) => parameter.split(/[:=]/)[0].trim()).filter(Boolean);
    };

    it('lets browser code call only the actions /privacy describes', () => {
        // Every action a client component imports, by file. One added here is a
        // new kind of request from the browser, and "Data Collection" has to
        // say what it sends.
        const called: Record<string, string[]> = {};
        for (const [file, source] of sources) {
            if (file.startsWith('app/') && !/^\s*['"]use client['"]/.test(source)) continue;
            const names = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]@\/app\/actions['"]/g)]
                .flatMap((match) => match[1].split(','))
                .map((name) => name.trim())
                .filter((name) => name && !name.startsWith('type '));
            if (names.length > 0) called[file] = names.sort();
        }
        expect(called).toEqual({
            'components/CostBasisTracker.tsx': ['getBitcoinPriceHistoryWithMeta'],
            'components/DcaCalculator.tsx': ['getAssetPriceHistory', 'getBitcoinSpot', 'getCpiData', 'getOutcomeRange', 'getPriceHistoryAndSpot'],
            'components/OpportunityCostCalculator.tsx': ['getBitcoinPriceHistoryWithMeta'],
            'components/PlanComparison.tsx': ['getBitcoinPriceHistoryWithMeta'],
            'components/ShareMyStack.tsx': ['getCostBasisPercentile'],
            'context/CurrencyContext.tsx': ['getFxSnapshot'],
            // Server only: reads the rates for a page rendered on the server.
            'utils/serverCurrency.ts': ['getFxSnapshot'],
        });
        // Next posts a Server Action to the address of the page it is called from.
        expect(policy).toContain('are sent to the address of the page you are on as well');
    });

    it('gives the two server-side comparisons the parameters /privacy lists', () => {
        expect(parametersOf('getOutcomeRange')).toEqual(['frequency', 'durationDays', 'feePercentage', 'era']);
        expect(policy).toContain('sends how often you buy, how long the plan runs (rounded to whole months), your fee percentage and the stretch of price history to compare against');
        // "rounded to whole months": the length that leaves the browser is the snapped one.
        expect(read('components/DcaCalculator.tsx'), '/privacy says the plan length is rounded to whole months before it is sent.')
            .toMatch(/getOutcomeRange\(\s*frequency,\s*bucketDays,\s*fee,\s*era\s*\)/);

        expect(parametersOf('getCostBasisPercentile')).toEqual(['frequency', 'durationDays', 'averageCostUsd']);
        expect(policy).toContain('sends how often you buy, how long the plan runs in days, and your average cost per bitcoin before fees');
    });

    it('gives a price lookup parameters for dates and a price source only', () => {
        expect(parametersOf('getPriceHistoryAndSpot')).toEqual(['from', 'to', 'providerArg']);
        expect(parametersOf('getBitcoinPriceHistoryWithMeta')).toEqual(['from', 'to', 'providerArg', 'revalidateArg']);
        expect(parametersOf('getBitcoinSpot')).toEqual(['providerArg', 'revalidateArg']);
        expect(parametersOf('getAssetPriceHistory')).toEqual(['symbol', 'from', 'to']);
        expect(parametersOf('getCpiData')).toEqual(['from', 'to']);
        expect(policy).toContain('sends our server your start date, your end date and the price source you picked');
    });

    it('gives the exchange-rate request no parameters', () => {
        expect(parametersOf('getFxSnapshot')).toEqual([]);
        expect(policy).toContain('The exchange-rate request does not ask for a currency: the answer holds every rate.');
        expect(policy).toContain('it goes to the address of the page you are on');
    });

    it('never puts a tracker position in the request for prices', () => {
        const tracker = read('components/CostBasisTracker.tsx');
        const requests = '/privacy says the tracker asks for the whole history and names only the price source. Its request has changed.';
        expect(tracker, requests).toMatch(/getBitcoinPriceHistoryWithMeta\(\s*EARLIEST_PRICE_TS,\s*MAX_END_TS,\s*provider\s*\)/);
        expect(tracker.match(/getBitcoinPriceHistoryWithMeta\(/g), requests).toHaveLength(1);
        expect(policy).toContain('That request names the price source and no date, amount or label');
    });
});

describe('what the live price and the network widgets send', () => {
    it('is a GET to a fixed address, with no page address and no cookies', async () => {
        vi.useFakeTimers();
        const sent: { url: string; init: RequestInit }[] = [];
        const env: PollerEnv = {
            now: () => Date.now(),
            fetch: async (url, init) => {
                sent.push({ url, init });
                return { ok: false, headers: { get: () => null }, json: async () => null };
            },
            setTimer: (run, ms) => setTimeout(run, ms),
            clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
            whenIdle: (run) => {
                run();
                return () => {};
            },
            isHidden: () => false,
            listen: () => () => {},
        };
        try {
            for (const url of [LIVE_TICKER_URL, LIVE_SIDEBAR_URL]) {
                const poller = createPoller<null>({ url, initial: null, accept: () => null, env });
                const unsubscribe = poller.subscribe({ pollMs: 30_000, dueIn: 0 }, () => {});
                await vi.advanceTimersByTimeAsync(1);
                unsubscribe();
            }
        } finally {
            vi.useRealTimers();
        }

        expect(sent.map((request) => request.url)).toEqual(['/api/live/ticker', '/api/live/sidebar']);
        for (const { init } of sent) {
            expect(init.referrerPolicy).toBe('no-referrer');
            expect(init.credentials).toBe('omit');
            expect(init.method).toBeUndefined();
            expect(init.body).toBeUndefined();
        }
        expect(policy).toContain('<Key>/api/live/ticker</Key> and <Key>/api/live/sidebar</Key>');
        expect(policy).toContain('they carry no page address, no cookies and nothing about your plan');
    });

    it('goes through the one poller, to routes that read nothing from the request', () => {
        // The ticker and the cards each build their poller on one of the two addresses.
        expect(read('components/live/liveTicker.ts')).toMatch(/createPoller<[^>]*>\(\{\s*url: LIVE_TICKER_URL,/);
        expect(read('components/live/liveSidebar.ts')).toMatch(/createPoller<[^>]*>\(\{\s*url: LIVE_SIDEBAR_URL,/);
        for (const route of ['app/api/live/ticker/route.ts', 'app/api/live/sidebar/route.ts']) {
            expect(read(route), `${route} now takes the request: /privacy says these requests carry nothing about the plan.`)
                .toMatch(/export async function GET\(\)/);
        }
    });
});

describe('third parties the browser contacts', () => {
    it('loads scripts, frames and images with an off-site src from two hosts only', () => {
        const hosts = new Set<string>();
        for (const source of sources.values()) {
            for (const match of source.matchAll(/\bsrc=\{?[`"'](?:https?:)?\/\/([a-z0-9.-]+)/g)) hosts.add(match[1]);
        }
        expect([...hosts].sort(), 'A new off-site script, frame or image: /privacy has to say what it is and what it receives.').toEqual([
            'acceptable.a-ads.com',
            'www.googletagmanager.com',
        ]);
        expect(policy).toContain('googletagmanager.com');
        expect(policy).toContain('Each ad slot is a frame loaded from A-ADS\'s servers');
    });

    it('loads Google\'s tag only after Accept All, with ad personalisation following the answer', () => {
        const gate = read('components/ConsentGatedScripts.tsx');
        expect(gate, '/privacy says the tag never loads without Accept All.').toMatch(/if \(isEmbed \|\| !analyticsGranted\) return null;/);
        expect(
            gate,
            '/privacy says the consent passed to the tag covers ad personalisation. If that signal is now fixed, rewrite that bullet.',
        ).toMatch(/ad_personalization: state/);
        expect(policy).toContain('The consent passed to the tag covers ad personalisation');
    });

    it('makes requests from two files only: the server\'s provider fetch and the live poller', () => {
        expect(policy).toContain('Your browser never contacts them');
        const requesting = [...sources]
            .filter(([, source]) => /(?<![\w.])fetch\(\s*[^)\s]|\bsendBeacon\b|\bXMLHttpRequest\b|new\s+(?:WebSocket|EventSource)\b/.test(source))
            .map(([file]) => file)
            .sort();
        expect(requesting, 'A new file makes requests of its own: /privacy has to say where they go.').toEqual([
            // Same-origin GETs to /api/live, run above.
            'components/live/livePoller.ts',
            // Server only: every provider request goes through it.
            'utils/upstream.ts',
        ]);
        expect(read('utils/upstream.ts')).not.toMatch(/^\s*['"]use client['"]/);
    });
});

describe('ad slots', () => {
    /** Files a source file imports, statically or with import(), resolved to paths from src/. */
    const importsOf = (file: string): string[] => {
        const found: string[] = [];
        const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
        for (const match of (sources.get(file) ?? '').matchAll(/(?:from\s+|import\(\s*)['"]([^'"]+)['"]/g)) {
            const spec = match[1];
            let base: string;
            if (spec.startsWith('@/')) base = spec.slice(2);
            else if (spec.startsWith('.')) base = new URL(spec, `file:///${dir}`).pathname.slice(1);
            else continue;
            const hit = [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`].find((candidate) => sources.has(candidate));
            if (hit) found.push(hit);
        }
        return found;
    };

    it('are on the home page only, as /privacy says', () => {
        const withSlot = new Set(sourceFiles.filter((file) => file !== 'components/AdSlot.tsx' && /<AdSlot\b/.test(sources.get(file) ?? '')));
        expect(withSlot.size, 'no <AdSlot> found: has the component been renamed?').toBeGreaterThan(0);

        const rendersSlot = (entry: string): boolean => {
            const seen = new Set<string>();
            const queue = [entry];
            while (queue.length > 0) {
                const file = queue.pop() as string;
                if (seen.has(file)) continue;
                seen.add(file);
                if (withSlot.has(file)) return true;
                queue.push(...importsOf(file));
            }
            return false;
        };

        // The root layout wraps every page, so a slot there is a slot everywhere.
        expect(rendersSlot('app/layout.tsx')).toBe(false);
        const pages = sourceFiles.filter((file) => /^app\/(?:.*\/)?page\.tsx$/.test(file)).filter(rendersSlot);
        expect(pages, 'An ad slot has moved or been added: /privacy says "the slots are on the home page only", with a date.').toEqual(['app/page.tsx']);
        expect(policy).toContain('the slots are on the home page only');
    });

    it('are not said to wait until they are scrolled to', () => {
        // The frames carry loading="lazy", and Chrome requests them at once all
        // the same: the home page streams them in and moves them into place.
        // What /privacy says of it comes from a browser check, not the attribute.
        expect(policy).toContain('they do not wait for you to scroll to them');
        expect(policy).not.toMatch(/on screen or close to it|comes into view/);
    });
});

describe('data providers', () => {
    // How /privacy and /terms name each host the server calls. A host missing
    // from here is a provider neither page mentions yet.
    const NAMED_AS: Record<string, string> = {
        'api.kraken.com': 'Kraken',
        'api.exchange.coinbase.com': 'Coinbase',
        'mempool.space': 'mempool.space',
        'api.coingecko.com': 'CoinGecko',
        'api.stlouisfed.org': 'FRED',
        'query1.finance.yahoo.com': 'Yahoo Finance',
        'api.alternative.me': 'alternative.me',
        'blockchain.info': 'blockchain.info',
        'api.frankfurter.dev': 'frankfurter.dev',
    };

    it('are all named on /privacy and /terms', () => {
        const hosts = new Set<string>();
        for (const match of read('app/actions.ts').matchAll(/https:\/\/([a-z0-9.-]+)\//g)) hosts.add(match[1]);
        expect(hosts.size).toBeGreaterThan(0);
        for (const host of hosts) {
            const name = NAMED_AS[host];
            expect(name, `actions.ts calls ${host}, which /privacy and /terms do not name`).toBeDefined();
            expect(policy).toContain(name);
            expect(terms).toContain(name);
        }
    });
});
