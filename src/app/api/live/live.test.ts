import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import robots from '@/app/robots';
import {
    LIVE_CDN_SECONDS,
    LIVE_LIFETIME_SECONDS,
    LIVE_SIDEBAR_URL,
    LIVE_TICKER_URL,
    liveCacheControl,
    liveFigureMaxAgeMs,
    type LiveSidebarResponse,
    type LiveTickerResponse,
} from './contract';

/**
 * /api/live against a fake internet.
 *
 * The ticker and the sidebar cards poll these two addresses, and a CDN may
 * answer for them. So each rule that keeps an answer honest is pinned here:
 * what a figure looks like and when it says it was fetched, what happens to
 * one whose provider fails, hangs or is only known from an old cache entry,
 * and which answers a CDN is allowed to keep.
 */

const NOW = Date.UTC(2026, 9, 12, 4, 10);
const STATE_KEY = Symbol.for('btcdca.actions.state.v4');

type Responder = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(body), { status, headers });
const text = (body: string): Response => new Response(body, { status: 200 });
const down: Responder = () => json({ message: 'unavailable' }, 503);
/** Accepts the request and never answers, until the caller gives up. */
const hang: Responder = (_url, init) => new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
});
/** A 200 as Next's Data Cache replays it: the body with the Date it was fetched on. */
const held = (body: unknown, ageMs: number): Responder => () => json(body, 200, { date: new Date(NOW - ageMs).toUTCString() });

const FEES = 'mempool.space/api/v1/fees/precise';
const HEIGHT = 'mempool.space/api/v1/blocks/tip/height';
const BLOCKS = 'mempool.space/api/v1/blocks';
const DIFFICULTY = 'mempool.space/api/v1/difficulty-adjustment';
const HASHRATE = 'mempool.space/api/v1/mining/hashrate/1m';
const LIGHTNING = 'mempool.space/api/v1/lightning/statistics/latest';
const FEAR_GREED = 'api.alternative.me/fng/';
const DOMINANCE = 'api.coingecko.com/api/v3/global';
const SUPPLY = 'blockchain.info/q/totalbc';
const KRAKEN = 'api.kraken.com/0/public/Ticker';
const COINBASE_TICKER = 'api.exchange.coinbase.com/products/BTC-USD/ticker';
const COINBASE_STATS = 'api.exchange.coinbase.com/products/BTC-USD/stats';
const FRED = 'api.stlouisfed.org/fred/series/observations';

const lightningRow = (added: unknown, nodes = 16_024) => ({
    latest: { id: 1, added, channel_count: 30_290, node_count: nodes, total_capacity: 362_714_890_683 },
});

const healthy = (): Record<string, Responder> => ({
    [FEES]: () => json({ fastestFee: 5, halfHourFee: 3.2, hourFee: 2, economyFee: 1, minimumFee: 1 }),
    [HEIGHT]: () => text('971110'),
    [BLOCKS]: () => json([
        { id: 'a', height: 971_110, timestamp: 1_791_777_900, tx_count: 3_201, size: 1_580_000 },
        { id: 'b', height: 971_109, timestamp: 1_791_777_200, tx_count: 2_840, size: 1_490_000 },
    ]),
    [DIFFICULTY]: () => json({ difficultyChange: 5.24, remainingBlocks: 602, estimatedRetargetDate: 1_792_161_953_428 }),
    [HASHRATE]: () => json({ hashrates: [], currentHashrate: 9.8e20, currentDifficulty: 1.4e14 }),
    [LIGHTNING]: () => json(lightningRow('2026-10-12T00:00:00.000Z')),
    [FEAR_GREED]: () => json({ data: [{ value: '69', value_classification: 'Greed' }] }),
    [DOMINANCE]: () => json({ data: { total_market_cap: { usd: 3e12 }, market_cap_percentage: { btc: 50 } } }),
    [SUPPLY]: () => text('2009718100000000'),
    [KRAKEN]: () => json({ error: [], result: { XXBTZUSD: { c: ['83422.60000', '0.1'], o: '83675.60000' } } }),
    [COINBASE_TICKER]: () => json({ price: '83426.53' }),
    [COINBASE_STATS]: () => json({ last: '83439.65', open: '82934.36' }),
    [FRED]: () => json({ observations: [{ date: '2014-12-01', value: '236.3' }, { date: '2015-01-01', value: '234.7' }, { date: '2026-09-01', value: '330.1' }] }),
});

let net: Record<string, Responder> = {};
let calls: string[] = [];
const callsTo = (key: string): number => calls.filter((call) => call === key).length;

type Reply<T> = { status: number; cacheControl: string | null; body: T };

/** A cold server instance: fresh route modules, fresh action caches and cool-offs. */
async function coldServer() {
    delete (globalThis as Record<symbol, unknown>)[STATE_KEY];
    vi.resetModules();
    const [ticker, sidebar, actions] = await Promise.all([
        import('./ticker/route'),
        import('./sidebar/route'),
        import('@/app/actions'),
    ]);
    const reply = async <T>(res: Response): Promise<Reply<T>> => (
        { status: res.status, cacheControl: res.headers.get('cache-control'), body: (await res.json()) as T }
    );
    return {
        actions,
        ticker: async () => reply<LiveTickerResponse & { error?: string }>(await ticker.GET()),
        sidebar: async () => reply<LiveSidebarResponse & { error?: string }>(await sidebar.GET()),
    };
}

beforeEach(() => {
    net = healthy();
    calls = [];
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubEnv('FRED_API_KEY', 'test-key');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const key = url.host + url.pathname;
        calls.push(key);
        return (net[key] ?? (() => json({}, 404)))(url, init);
    }));
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

// ── The ticker ────────────────────────────────────────────────────────────────

describe(LIVE_TICKER_URL, () => {
    it('answers with Kraken\'s price, what its change is measured from, and when it was quoted', async () => {
        const { ticker } = await coldServer();
        const { status, cacheControl, body } = await ticker();
        expect(status).toBe(200);
        expect(body).toEqual({
            price: 83422.6, open24h: 83675.6, provider: 'kraken', changeSince: 'utc-midnight', asOf: NOW, generatedAt: NOW,
        });
        // A CDN may hold it for less time than the ticker waits between polls, and browsers not at all.
        expect(cacheControl).toBe('public, max-age=0, s-maxage=15');
    });

    it('says when a quote was fetched, not when it was read from a cache', async () => {
        net[KRAKEN] = held({ error: [], result: { XXBTZUSD: { c: ['83000.0'], o: '83500.0' } } }, 40_000);
        const { ticker } = await coldServer();
        vi.setSystemTime(NOW + 2_000);
        const { body } = await ticker();
        expect(body.asOf).toBe(NOW - 40_000);
        expect(body.generatedAt).toBe(NOW + 2_000);
    });

    it('quotes Coinbase, with its 24-hour change, when Kraken cannot', async () => {
        net[KRAKEN] = down;
        const { ticker } = await coldServer();
        const { status, cacheControl, body } = await ticker();
        expect(status).toBe(200);
        expect(body).toMatchObject({ price: 83439.65, open24h: 82934.36, provider: 'coinbase', changeSince: '24h-ago' });
        expect(cacheControl).toBe('public, max-age=0, s-maxage=15');
    });

    it('answers 503, not held anywhere, when neither exchange has a quote, and does not ask them again at once', async () => {
        net[KRAKEN] = down;
        net[COINBASE_STATS] = down;
        const { ticker } = await coldServer();
        const { status, cacheControl, body } = await ticker();
        expect(status).toBe(503);
        expect(cacheControl).toBe('no-store');
        expect(body).toEqual({ error: 'Neither exchange has a current quote.' });

        for (let i = 0; i < 5; i++) expect((await ticker()).status).toBe(503);
        expect(callsTo(KRAKEN)).toBe(1);
        expect(callsTo(COINBASE_STATS)).toBe(1);

        // Back up: the first request after the cool-off is answered, and may be held again.
        net[KRAKEN] = healthy()[KRAKEN];
        vi.setSystemTime(NOW + 31_000);
        expect(await ticker()).toMatchObject({ status: 200, cacheControl: 'public, max-age=0, s-maxage=15' });
    });
});

// ── The sidebar ───────────────────────────────────────────────────────────────

describe(LIVE_SIDEBAR_URL, () => {
    it('answers with every figure the cards show, each with the time it was fetched', async () => {
        const { sidebar } = await coldServer();
        const { status, cacheControl, body } = await sidebar();
        expect(status).toBe(200);
        expect(cacheControl).toBe('public, max-age=0, s-maxage=30');
        expect(body).toEqual({
            generatedAt: NOW,
            mempoolFees: { data: { highFee: 5, mediumFee: 3.2, lowFee: 2 }, fetchedAt: NOW },
            blockHeight: { data: 971_110, fetchedAt: NOW },
            recentBlocks: {
                data: [
                    { height: 971_110, timestamp: 1_791_777_900, txCount: 3_201, size: 1_580_000 },
                    { height: 971_109, timestamp: 1_791_777_200, txCount: 2_840, size: 1_490_000 },
                ],
                fetchedAt: NOW,
            },
            hashRate: {
                data: {
                    hashrate: 9.8e20, difficulty: 1.4e14, adjustmentPercent: 5.24, blocksUntilAdjustment: 602,
                    estimatedRetargetDate: new Date(1_792_161_953_428).toISOString(),
                },
                fetchedAt: NOW,
            },
            supplySats: { data: 2_009_718_100_000_000, fetchedAt: NOW },
            lightning: {
                data: { nodeCount: 16_024, channelCount: 30_290, totalCapacityBtc: 3627.14890683, asOf: Date.UTC(2026, 9, 12) },
                fetchedAt: NOW,
            },
            dominance: { data: { dominancePercent: 50, btcMarketCap: 1.5e12, totalMarketCap: 3e12 }, fetchedAt: NOW },
            fearGreed: { data: { value: 69, classification: 'Greed' }, fetchedAt: NOW },
            purchasingPower: { data: { cpiStart: 234.7, cpiNow: 330.1, btcPriceStart: 320.97, btcPriceNow: 83426.53 }, fetchedAt: NOW },
            spot: { price: 83426.53, asOf: NOW, provider: 'coinbase', fallback: false },
        });
    });

    it('carries the same figures the page is rendered with', async () => {
        const { sidebar, actions } = await coldServer();
        const { body } = await sidebar();
        expect(body.mempoolFees?.data).toEqual(await actions.getMempoolFees());
        expect(body.blockHeight?.data).toBe(await actions.getBlockHeight());
        expect(body.recentBlocks?.data).toEqual(await actions.getRecentBlocks());
        expect(body.hashRate?.data).toEqual(await actions.getHashRateDifficulty());
        expect(body.supplySats?.data).toBe(await actions.getCirculatingSupply());
        expect(body.lightning?.data).toEqual(await actions.getLightningStats());
        expect(body.dominance?.data).toEqual(await actions.getBitcoinDominance());
        expect(body.fearGreed?.data).toEqual(await actions.getFearGreedIndex());
        expect(body.purchasingPower?.data).toEqual(await actions.getPurchasingPowerData());
        expect(body.spot).toEqual(await actions.getBitcoinSpot());
    });

    it('asks each provider once, however many cards read the answer', async () => {
        const { sidebar } = await coldServer();
        await sidebar();
        for (const key of [FEES, HEIGHT, BLOCKS, DIFFICULTY, HASHRATE, LIGHTNING, FEAR_GREED, DOMINANCE, SUPPLY, COINBASE_TICKER, FRED]) {
            expect(callsTo(key), key).toBe(1);
        }
    });

    it('nulls a figure whose provider is failing, holds the answer for less time, and leaves the provider alone', async () => {
        net[FEAR_GREED] = down;
        const { sidebar } = await coldServer();
        const { status, cacheControl, body } = await sidebar();
        expect(status).toBe(200);
        expect(body.fearGreed).toBeNull();
        expect(body.mempoolFees).not.toBeNull();
        expect(cacheControl).toBe('public, max-age=0, s-maxage=10');

        for (let i = 0; i < 4; i++) expect((await sidebar()).body.fearGreed).toBeNull();
        expect(callsTo(FEAR_GREED)).toBe(1);

        // Still down when the cool-off ends: asked once more, then left alone again.
        vi.setSystemTime(NOW + 31_000);
        await sidebar();
        await sidebar();
        expect(callsTo(FEAR_GREED)).toBe(2);

        net[FEAR_GREED] = healthy()[FEAR_GREED];
        vi.setSystemTime(NOW + 62_000);
        const recovered = await sidebar();
        expect(recovered.body.fearGreed).toEqual({ data: { value: 69, classification: 'Greed' }, fetchedAt: NOW + 62_000 });
        expect(recovered.cacheControl).toBe('public, max-age=0, s-maxage=30');
    });

    it('gives the page render the same cool-off, so it does not wait on a failing provider either', async () => {
        net[HEIGHT] = down;
        const { actions } = await coldServer();
        for (let i = 0; i < 3; i++) expect(await actions.getBlockHeight()).toBeNull();
        expect(callsTo(HEIGHT)).toBe(1);
    });

    it('treats an answer of the wrong shape like a failure', async () => {
        net[FEES] = () => json({ error: 'backend restarting' });
        net[HEIGHT] = () => text('503 Service Unavailable');
        net[SUPPLY] = () => text('<html>busy</html>');
        net[DOMINANCE] = () => json({ data: { total_market_cap: { usd: 'n/a' }, market_cap_percentage: { btc: 55 } } });
        const { sidebar } = await coldServer();
        const { body } = await sidebar();
        expect(body).toMatchObject({ mempoolFees: null, blockHeight: null, supplySats: null, dominance: null });
        expect(body.recentBlocks).not.toBeNull();
        await sidebar();
        expect(callsTo(FEES)).toBe(1);
    });

    it('waits out a provider that hangs once, then answers without it', async () => {
        vi.useFakeTimers(); // every timer, so the request timeout can be stepped through
        vi.setSystemTime(NOW);
        net[BLOCKS] = hang;
        const { sidebar } = await coldServer();

        const first = sidebar();
        await vi.advanceTimersByTimeAsync(10_100);
        const { body } = await first;
        expect(body.recentBlocks).toBeNull();
        expect(body.mempoolFees).not.toBeNull();

        // No timers advanced: this cannot have waited on the hung provider, or asked it.
        expect((await sidebar()).body.recentBlocks).toBeNull();
        expect(callsTo(BLOCKS)).toBe(1);
    });

    it('does not pass off an old cached answer as current, and does not count it as a failure', async () => {
        const maxAge = liveFigureMaxAgeMs(LIVE_LIFETIME_SECONDS.mempoolFees);
        expect(maxAge).toBe(300_000);
        // The same five minutes a price quote is allowed.
        expect(liveFigureMaxAgeMs(LIVE_LIFETIME_SECONDS.spot)).toBe(300_000);
        expect(liveFigureMaxAgeMs(LIVE_LIFETIME_SECONDS.ticker)).toBe(300_000);
        // Hashrate moves slowly and is asked for less often, so it is allowed to be older.
        expect(liveFigureMaxAgeMs(LIVE_LIFETIME_SECONDS.hashRate)).toBe(900_000);

        const fees = { fastestFee: 9, halfHourFee: 8, hourFee: 7 };
        net[FEES] = held(fees, maxAge + 1_000);
        const { sidebar } = await coldServer();
        const tooOld = await sidebar();
        expect(tooOld.body.mempoolFees).toBeNull();
        expect(tooOld.cacheControl).toBe('public, max-age=0, s-maxage=10');

        // The cache refreshes itself behind such an answer, so the next request
        // is not held back by a cool-off: it finds the newer entry.
        net[FEES] = held(fees, 240_000);
        const { body } = await sidebar();
        expect(body.mempoolFees).toEqual({ data: { highFee: 9, mediumFee: 8, lowFee: 7 }, fetchedAt: NOW - 240_000 });
        expect(callsTo(FEES)).toBe(2);
    });

    it('dates the hashrate card by the older of its two answers', async () => {
        net[DIFFICULTY] = held({ difficultyChange: 5.24, remainingBlocks: 602, estimatedRetargetDate: 1_792_161_953_428 }, 100_000);
        net[HASHRATE] = held({ currentHashrate: 9.8e20, currentDifficulty: 1.4e14 }, 250_000);
        const { sidebar } = await coldServer();
        expect((await sidebar()).body.hashRate?.fetchedAt).toBe(NOW - 250_000);
    });

    it('dates the purchasing-power card by its bitcoin quote, and does not count it as missing without a FRED key', async () => {
        net[COINBASE_TICKER] = held({ price: '83000.00' }, 50_000);
        let server = await coldServer();
        let { body, cacheControl } = await server.sidebar();
        expect(body.purchasingPower).toEqual({
            data: { cpiStart: 234.7, cpiNow: 330.1, btcPriceStart: 320.97, btcPriceNow: 83_000 },
            fetchedAt: NOW - 50_000,
        });
        expect(body.spot?.asOf).toBe(NOW - 50_000);
        expect(cacheControl).toBe('public, max-age=0, s-maxage=30');

        // FRED failing is a figure missing.
        net[FRED] = down;
        server = await coldServer();
        ({ body, cacheControl } = await server.sidebar());
        expect(body.purchasingPower).toBeNull();
        expect(cacheControl).toBe('public, max-age=0, s-maxage=10');

        // No key at all is a card that is switched off: nothing is missing.
        vi.stubEnv('FRED_API_KEY', '');
        server = await coldServer();
        ({ body, cacheControl } = await server.sidebar());
        expect(body.purchasingPower).toBeNull();
        expect(body.spot).not.toBeNull();
        expect(cacheControl).toBe('public, max-age=0, s-maxage=30');
        expect(callsTo(FRED)).toBe(2);
    });

    it('answers 503, not held anywhere, when there is no figure at all', async () => {
        for (const key of Object.keys(net)) net[key] = down;
        const { sidebar } = await coldServer();
        const { status, cacheControl, body } = await sidebar();
        expect(status).toBe(503);
        expect(cacheControl).toBe('no-store');
        expect(body).toEqual({ error: 'No figure is available right now.' });
    });
});

// ── Lightning ─────────────────────────────────────────────────────────────────

describe('Lightning figures', () => {
    it('carry the day mempool.space dates them, however long ago that is', async () => {
        // What six of mempool.space's seven addresses answered with on 2026-10-12.
        net[LIGHTNING] = () => json(lightningRow('2026-07-13T00:00:00.000Z', 17_334));
        const { actions } = await coldServer();
        expect(await actions.getLightningStats()).toEqual({
            nodeCount: 17_334, channelCount: 30_290, totalCapacityBtc: 3627.14890683, asOf: Date.UTC(2026, 6, 13),
        });
    });

    it('read the date as text or as seconds, and show nothing for a row that has none', async () => {
        net[LIGHTNING] = () => json(lightningRow(Date.UTC(2026, 9, 11) / 1000));
        let { actions } = await coldServer();
        expect((await actions.getLightningStats())?.asOf).toBe(Date.UTC(2026, 9, 11));

        for (const added of [undefined, null, 'soon', 0, '2031-01-01T00:00:00.000Z']) {
            net[LIGHTNING] = () => json(lightningRow(added));
            ({ actions } = await coldServer());
            expect(await actions.getLightningStats(), String(added)).toBeNull();
        }
    });

    it('never go back to an older row once a newer one has been seen', async () => {
        const { sidebar } = await coldServer();
        expect((await sidebar()).body.lightning?.data.asOf).toBe(Date.UTC(2026, 9, 12));

        // Ten minutes on, another of its servers answers with August's row.
        net[LIGHTNING] = () => json(lightningRow('2026-08-30T00:00:00.000Z', 16_230));
        vi.setSystemTime(NOW + 11 * 60_000);
        const { body } = await sidebar();
        expect(body.lightning).toEqual({
            data: { nodeCount: 16_024, channelCount: 30_290, totalCapacityBtc: 3627.14890683, asOf: Date.UTC(2026, 9, 12) },
            fetchedAt: NOW + 11 * 60_000,
        });
    });
});

// ── What the endpoints rely on elsewhere ──────────────────────────────────────

describe('how the endpoints are served', () => {
    it('keeps them out of crawls and out of the service worker\'s caches', () => {
        const disallowed = [robots().rules].flat().flatMap((rule) => rule.disallow ?? []);
        expect(disallowed).toContain('/api/');
        const worker = readFileSync(fileURLToPath(new URL('../../../../public/sw.js', import.meta.url)), 'utf8');
        // Anything under /api/ goes to the network or fails: a saved copy would look like a live figure.
        expect(worker).toContain("url.pathname.startsWith('/api/')");
        expect(LIVE_TICKER_URL.startsWith('/api/')).toBe(true);
        expect(LIVE_SIDEBAR_URL.startsWith('/api/')).toBe(true);
    });

    it('lets a CDN hold an answer, never a browser, and never a failure', () => {
        expect(liveCacheControl(LIVE_CDN_SECONDS.sidebar)).toBe('public, max-age=0, s-maxage=30');
        expect(liveCacheControl(0)).toBe('no-store');
        // Shorter than the fastest poll of what is in each answer.
        expect(LIVE_CDN_SECONDS.ticker).toBeLessThan(LIVE_LIFETIME_SECONDS.ticker);
        expect(LIVE_CDN_SECONDS.sidebar).toBeLessThanOrEqual(LIVE_LIFETIME_SECONDS.mempoolFees);
        expect(LIVE_CDN_SECONDS.sidebarDegraded).toBeLessThan(LIVE_CDN_SECONDS.sidebar);
    });
});
