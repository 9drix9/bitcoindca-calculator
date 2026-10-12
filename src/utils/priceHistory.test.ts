import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BTC_HISTORICAL_DAILY } from '@/data/btcHistorical';
import { DEFAULT_PLAN } from '@/data/planDefaults';
import { FX_FALLBACK_AS_OF, FX_FALLBACK_RATES } from '@/data/currencies';
import { calculateDca } from './dca';
import { DAY_MS, defaultPlanWindow, utcDayStart } from './dates';
import { countPriceKinds } from './priceSeries';
import { responseTime, runAsLiveProbe } from './upstream';

/**
 * The server actions against a fake internet.
 *
 * app/actions.ts is where the price series every page relies on is assembled,
 * and where the decisions that are easy to get quietly wrong are made: which
 * exchange answered, whether a response is complete, what to do when one is
 * not. None of that is visible in a result that merely "looks plausible", so
 * each rule is pinned here with the upstreams replaced by functions.
 */

const NOW = Date.UTC(2026, 9, 12, 4, 10); // Monday 2026-10-12 04:10 UTC
const TODAY = utcDayStart(NOW);
const FIRST_COINBASE_DAY = Date.UTC(2015, 6, 20);
const WEEK_S = 604_800;
const STATE_KEY = Symbol.for('btcdca.actions.state.v4');

type Actions = typeof import('@/app/actions');

/** A deterministic daily close that wiggles: no three consecutive days sit on one line. */
const coinbaseClose = (ts: number): number => {
    const d = ts / DAY_MS;
    return 5000 + (d % 89) * 37 + Math.sin(d * 1.3) * 400 + (d - 16_000) * 9;
};

interface Call {
    url: string;
    init: (RequestInit & { next?: { revalidate?: number } }) | undefined;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(body), { status, headers });

/** Coinbase's candles endpoint over the synthetic series: [time s, low, high, open, close, volume], newest first. */
const coinbaseCandles = (url: URL, lastDay = TODAY): number[][] => {
    const start = Date.parse(url.searchParams.get('start') ?? '');
    const end = Date.parse(url.searchParams.get('end') ?? '');
    const rows: number[][] = [];
    for (let ts = Math.max(utcDayStart(start), FIRST_COINBASE_DAY); ts <= Math.min(end, lastDay); ts += DAY_MS) {
        const close = coinbaseClose(ts);
        rows.push([ts / 1000, close * 0.98, close * 1.02, close * 0.99, close, 1000]);
    }
    return rows.reverse();
};

/** Kraken's weekly OHLC envelope from its real first candle (Thursday 2013-10-03) to the week in progress. */
const krakenOhlc = (): unknown => {
    const candles: unknown[][] = [];
    for (let open = Date.UTC(2013, 9, 3) / 1000; open * 1000 <= NOW; open += WEEK_S) {
        candles.push([open, '0', '0', '0', String(coinbaseClose((open + WEEK_S - 86_400) * 1000)), '0', '1', 1]);
    }
    return { error: [], result: { XXBTZUSD: candles, last: 0 } };
};

const ecbRates = (date = '2026-10-09'): unknown => [
    { date, base: 'USD', quote: 'AUD', rate: 1.4324 },
    { date, base: 'USD', quote: 'CAD', rate: 1.4226 },
    { date, base: 'USD', quote: 'EUR', rate: 0.89238 },
    { date, base: 'USD', quote: 'GBP', rate: 0.75641 },
    { date, base: 'USD', quote: 'JPY', rate: 158.25 },
];

type Route = (url: URL, call: Call) => Response | Promise<Response>;

interface Upstreams {
    coinbaseCandles: Route;
    coinbaseTicker: Route;
    krakenOhlc: Route;
    krakenTicker: Route;
    frankfurter: Route;
    /** Left out, Yahoo and FRED answer 404 like any host the fake internet does not know. */
    yahoo?: Route;
    fred?: Route;
}

const healthy = (): Upstreams => ({
    coinbaseCandles: (url) => json(coinbaseCandles(url)),
    coinbaseTicker: () => json({ price: '83426.53', time: new Date(NOW).toISOString() }),
    krakenOhlc: () => json(krakenOhlc()),
    krakenTicker: () => json({ error: [], result: { XXBTZUSD: { c: ['83422.60000', '0.1'], o: '83675.60000' } } }),
    frankfurter: () => json(ecbRates()),
});

let calls: Call[] = [];
const callsTo = (fragment: string): Call[] => calls.filter((c) => c.url.includes(fragment));

function install(upstreams: Upstreams): void {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: Call['init']) => {
        const url = new URL(String(input));
        const call = { url: url.href, init };
        calls.push(call);
        if (url.host === 'api.exchange.coinbase.com') {
            return url.pathname.endsWith('/candles') ? upstreams.coinbaseCandles(url, call) : upstreams.coinbaseTicker(url, call);
        }
        if (url.host === 'api.kraken.com') {
            return url.pathname.endsWith('/OHLC') ? upstreams.krakenOhlc(url, call) : upstreams.krakenTicker(url, call);
        }
        if (url.host === 'api.frankfurter.dev') return upstreams.frankfurter(url, call);
        if (url.host === 'query1.finance.yahoo.com' && upstreams.yahoo) return upstreams.yahoo(url, call);
        if (url.host === 'api.stlouisfed.org' && upstreams.fred) return upstreams.fred(url, call);
        return json({ error: 'unexpected upstream' }, 404);
    }));
}

/** A fresh copy of the actions with empty caches, as a cold server instance would have. */
async function coldActions(): Promise<Actions> {
    delete (globalThis as Record<symbol, unknown>)[STATE_KEY];
    vi.resetModules();
    return import('@/app/actions');
}

beforeEach(() => {
    calls = [];
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

// ── The default series ────────────────────────────────────────────────────────

describe('default price history', () => {
    it('is Coinbase daily closes after the bundled snapshot, every row observed', async () => {
        install(healthy());
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const result = await getBitcoinPriceHistoryWithMeta(0, NOW);

        expect(result.requestedProvider).toBe('coinbase');
        expect(result.servedProvider).toBe('coinbase');
        expect(result.fallback).toBe(false);
        expect(result.stale).toBe(false);
        expect(callsTo('api.kraken.com')).toHaveLength(0);

        // One row per UTC day from the snapshot's first day to today, no gaps.
        expect(result.data[0]).toEqual(BTC_HISTORICAL_DAILY[0]);
        expect(result.data[result.data.length - 1]).toEqual([TODAY, coinbaseClose(TODAY)]);
        expect(result.data.every((row, i) => i === 0 || row[0] - result.data[i - 1][0] === DAY_MS)).toBe(true);
        expect(result.kinds).toHaveLength(result.data.length);
        expect(countPriceKinds(result.kinds)).toEqual({ observed: result.data.length, estimated: 0 });
        expect(result.seriesStart).toBe(BTC_HISTORICAL_DAILY[0][0]);
        expect(result.seriesEnd).toBe(TODAY);

        // Every bundled day survives untouched, and the exchange takes over the day after.
        const byTs = new Map(result.data);
        for (const [ts, price] of BTC_HISTORICAL_DAILY) expect(byTs.get(ts)).toBe(price);
        expect(byTs.get(FIRST_COINBASE_DAY)).toBe(coinbaseClose(FIRST_COINBASE_DAY));
    });

    it('treats an unknown provider as the default and keeps an explicit kraken request', async () => {
        install(healthy());
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const unknown = await getBitcoinPriceHistoryWithMeta(0, NOW, 'pwned' as never);
        expect(unknown.requestedProvider).toBe('coinbase');
        const kraken = await getBitcoinPriceHistoryWithMeta(0, NOW, 'kraken');
        expect(kraken.servedProvider).toBe('kraken');
        expect(kraken.fallback).toBe(false);
    });

    it('fetches once and then answers from memory', async () => {
        install(healthy());
        const { getBitcoinPriceHistory, getBitcoinPriceHistoryWithMeta } = await coldActions();
        await getBitcoinPriceHistoryWithMeta(0, NOW);
        const crawl = calls.length;
        expect(crawl).toBe(14);

        const window = await getBitcoinPriceHistory(Date.UTC(2024, 0, 1), Date.UTC(2024, 5, 30));
        expect(calls.length).toBe(crawl);
        // A 14-day lead-in before `from`, and nothing after `to`.
        expect(window[0][0]).toBe(Date.UTC(2023, 11, 18));
        expect(window[window.length - 1][0]).toBe(Date.UTC(2024, 5, 30));
    });

    it('shares one crawl between callers that arrive together', async () => {
        install(healthy());
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        await Promise.all([
            getBitcoinPriceHistoryWithMeta(0, NOW),
            getBitcoinPriceHistoryWithMeta(Date.UTC(2020, 0, 1), NOW),
            getBitcoinPriceHistoryWithMeta(Date.UTC(2023, 0, 1), NOW),
        ]);
        expect(callsTo('/candles')).toHaveLength(14);
    });

    it('asks for finished chunks by the same URL every day and keeps them for a week', async () => {
        install(healthy());
        let actions = await coldActions();
        await actions.getBitcoinPriceHistoryWithMeta(0, NOW);
        const today = callsTo('/candles');

        calls = [];
        vi.setSystemTime(NOW + DAY_MS);
        actions = await coldActions();
        await actions.getBitcoinPriceHistoryWithMeta(0, NOW + DAY_MS);
        const tomorrow = callsTo('/candles');

        const sealedToday = today.filter((c) => (c.init?.next?.revalidate ?? 0) > 86_400);
        expect(sealedToday).toHaveLength(13);
        expect(sealedToday.every((c) => c.init?.next?.revalidate === 7 * 86_400)).toBe(true);
        for (const call of sealedToday) expect(tomorrow.some((c) => c.url === call.url)).toBe(true);

        // Only the chunk holding today follows the caller's (hourly) lifetime.
        const open = today.filter((c) => c.init?.next?.revalidate === 3600);
        expect(open).toHaveLength(1);
        expect(new URL(open[0].url).searchParams.get('end')).toBe('2026-10-12T05:00:00.000Z');
    });

    it('does not reuse an in-memory series across a UTC midnight', async () => {
        const lateEvening = Date.UTC(2026, 9, 11, 23, 30);
        vi.setSystemTime(lateEvening);
        const upstreams = healthy();
        upstreams.coinbaseCandles = (url) => json(coinbaseCandles(url, utcDayStart(Date.now())));
        install(upstreams);
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const before = await getBitcoinPriceHistoryWithMeta(0, lateEvening);
        expect(before.seriesEnd).toBe(Date.UTC(2026, 9, 11));

        // Forty minutes later is well inside the hour, but it is tomorrow: the
        // row that was "today so far" now has to be a finished day's close.
        vi.setSystemTime(lateEvening + 40 * 60_000);
        const crawl = calls.length;
        const after = await getBitcoinPriceHistoryWithMeta(0, lateEvening + 40 * 60_000);
        expect(calls.length).toBeGreaterThan(crawl);
        expect(after.seriesEnd).toBe(TODAY);
    });

    it('does not hand the calculator a series a daily page read from an old cache entry', async () => {
        // The daily pages accept a response up to a day old; here their open
        // chunk comes back three hours old, as it would from the Data Cache.
        const threeHoursAgo = new Date(NOW - 3 * 3_600_000).toUTCString();
        install({
            ...healthy(),
            coinbaseCandles: (url, call) => json(
                coinbaseCandles(url),
                200,
                call.init?.next?.revalidate === 86_400 ? { date: threeHoursAgo } : {},
            ),
        });
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const daily = await getBitcoinPriceHistoryWithMeta(0, NOW, 'coinbase', 86_400);
        expect(daily.fetchedAt).toBe(NOW - 3 * 3_600_000);
        const afterDaily = calls.length;

        // Good enough for another daily page...
        await getBitcoinPriceHistoryWithMeta(0, NOW, 'coinbase', 86_400);
        expect(calls.length).toBe(afterDaily);
        // ...but not for a caller that asked for an hour.
        const hourly = await getBitcoinPriceHistoryWithMeta(0, NOW);
        expect(calls.length).toBeGreaterThan(afterDaily);
        expect(hourly.fetchedAt).toBe(NOW);
    });

    it('does not hand a caller that joined a daily page’s fetch a series too old for it', async () => {
        // The same three-hour-old open chunk, but this time the two callers
        // arrive together and the second one joins the fetch already in flight.
        const threeHoursAgo = new Date(NOW - 3 * 3_600_000).toUTCString();
        install({
            ...healthy(),
            coinbaseCandles: (url, call) => json(
                coinbaseCandles(url),
                200,
                call.init?.next?.revalidate === 86_400 ? { date: threeHoursAgo } : {},
            ),
        });
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const [daily, hourly, alsoHourly] = await Promise.all([
            getBitcoinPriceHistoryWithMeta(0, NOW, 'coinbase', 86_400),
            getBitcoinPriceHistoryWithMeta(0, NOW),
            getBitcoinPriceHistoryWithMeta(Date.UTC(2024, 0, 1), NOW),
        ]);
        expect(daily.fetchedAt).toBe(NOW - 3 * 3_600_000);
        expect(hourly.fetchedAt).toBe(NOW);
        expect(hourly.stale).toBe(false);
        expect(alsoHourly.fetchedAt).toBe(NOW);

        // Two crawls in all: the daily page's, and one more that the two
        // callers it was too old for share between them.
        expect(callsTo('/candles')).toHaveLength(28);
    });

    it('resolves an out-of-range window with empty rows and the series bounds, not an error', async () => {
        install(healthy());
        const { getBitcoinPriceHistoryWithMeta, getBitcoinPriceHistory } = await coldActions();
        const future = await getBitcoinPriceHistoryWithMeta(Date.UTC(2027, 0, 1), Date.UTC(2028, 0, 1));
        expect(future.data).toEqual([]);
        expect(future.kinds).toBe('');
        expect(future.seriesEnd).toBe(TODAY);
        expect(await getBitcoinPriceHistory(NaN, NOW)).toEqual([]);
    });
});

// ── Kraken, the fallback ──────────────────────────────────────────────────────

describe('kraken series', () => {
    it('keeps every bundled daily price and only appends weekly closes after the snapshot', async () => {
        install(healthy());
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const result = await getBitcoinPriceHistoryWithMeta(0, NOW, 'kraken');
        const byTs = new Map(result.data);

        // An earlier merge discarded ~630 real daily rows (2013-10 to 2015-07)
        // and rebuilt them from weekly straight lines.
        for (const [ts, price] of BTC_HISTORICAL_DAILY) expect(byTs.get(ts)).toBe(price);
        expect(result.data.every((row, i) => i === 0 || row[0] - result.data[i - 1][0] === DAY_MS)).toBe(true);
    });

    it('dates each weekly close on its Wednesday and marks the days between as estimated', async () => {
        install(healthy());
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const { data, kinds } = await getBitcoinPriceHistoryWithMeta(Date.UTC(2020, 2, 1), Date.UTC(2020, 2, 31), 'kraken');

        const rows = data.map(([ts, price], i) => ({ ts, price, kind: kinds[i] }));
        const observed = rows.filter((r) => r.kind === 'o');
        expect(observed.length).toBeGreaterThan(3);
        for (const row of observed) {
            expect(new Date(row.ts).getUTCDay()).toBe(3); // Wednesday
            expect(row.price).toBe(coinbaseClose(row.ts)); // the fake weekly close for that day
        }
        // Everything that is not a weekly close is a straight-line fill and says so.
        for (const row of rows) expect(row.kind).toBe(new Date(row.ts).getUTCDay() === 3 ? 'o' : 'e');
    });

    it('hands the rows-only action the same rows', async () => {
        install(healthy());
        const { getBitcoinPriceHistory, getBitcoinPriceHistoryWithMeta } = await coldActions();
        const { data } = await getBitcoinPriceHistoryWithMeta(0, NOW, 'kraken');
        expect(await getBitcoinPriceHistory(0, NOW, 'kraken')).toEqual(data);
    });

    it('refetches a payload from before midnight instead of building today’s series from it', async () => {
        // 00:20 UTC. The Data Cache holds Kraken's answer from 23:50, well
        // inside its hour, so it is handed over without a refresh. Its open
        // week is stamped at 23:50 yesterday: no row for today, and yesterday
        // left holding a price from before its close.
        const justAfterMidnight = TODAY + 20 * 60_000;
        vi.setSystemTime(justAfterMidnight);
        const beforeMidnight = new Date(TODAY - 10 * 60_000).toUTCString();
        install({
            ...healthy(),
            krakenOhlc: (url) => (url.searchParams.has('t') ? json(krakenOhlc()) : json(krakenOhlc(), 200, { date: beforeMidnight })),
        });
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const result = await getBitcoinPriceHistoryWithMeta(0, justAfterMidnight, 'kraken');

        expect(callsTo('/OHLC')).toHaveLength(2); // once, then once around the cache
        expect(result).toMatchObject({ servedProvider: 'kraken', fallback: false, stale: false, fetchedAt: justAfterMidnight });
        expect(result.seriesEnd).toBe(TODAY);
    });

    it('still believes an exchange whose clock is a second behind ours at midnight', async () => {
        // Both answers are dated 23:59:59 while our clock already says
        // 00:00:00. Asking a second time is fair; refusing the second answer
        // too would drop Kraken at every midnight it is a moment behind.
        const midnight = TODAY + 400;
        vi.setSystemTime(midnight);
        const aSecondBehind = new Date(TODAY - 1000).toUTCString();
        install({ ...healthy(), krakenOhlc: () => json(krakenOhlc(), 200, { date: aSecondBehind }) });
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const result = await getBitcoinPriceHistoryWithMeta(0, midnight, 'kraken');

        expect(callsTo('/OHLC')).toHaveLength(2);
        expect(result).toMatchObject({ servedProvider: 'kraken', fallback: false, stale: false });
    });

    it('carries the live price on today’s row, once', async () => {
        install(healthy());
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const { data, kinds } = await getBitcoinPriceHistoryWithMeta(NOW - 10 * DAY_MS, NOW, 'kraken');
        expect(data.filter(([ts]) => utcDayStart(ts) === TODAY)).toHaveLength(1);
        expect(data[data.length - 1][0]).toBe(TODAY);
        expect(kinds[kinds.length - 1]).toBe('o');
    });
});

// ── When an exchange fails ────────────────────────────────────────────────────

describe('provider failure', () => {
    it('serves Kraken, flagged, when Coinbase is down', async () => {
        install({ ...healthy(), coinbaseCandles: () => json({ message: 'forbidden' }, 403) });
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const result = await getBitcoinPriceHistoryWithMeta(0, NOW);

        expect(result.requestedProvider).toBe('coinbase');
        expect(result.servedProvider).toBe('kraken');
        expect(result.fallback).toBe(true);
        expect(result.stale).toBe(false);
        // And the rows say which of them are estimates.
        expect(countPriceKinds(result.kinds).estimated).toBeGreaterThan(3000);
    });

    it('does not ask a provider that just failed again until its cool-off is over', async () => {
        install({ ...healthy(), coinbaseCandles: () => json({ message: 'forbidden' }, 403) });
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        await getBitcoinPriceHistoryWithMeta(0, NOW);
        const firstAttempt = callsTo('/candles').length;
        expect(firstAttempt).toBeGreaterThan(0);

        // No further request waits out the failing provider again.
        for (let i = 0; i < 5; i++) {
            const again = await getBitcoinPriceHistoryWithMeta(0, NOW);
            expect(again.servedProvider).toBe('kraken');
        }
        expect(callsTo('/candles')).toHaveLength(firstAttempt);
        expect(callsTo('/OHLC')).toHaveLength(1);

        vi.setSystemTime(NOW + 31_000);
        await getBitcoinPriceHistoryWithMeta(0, NOW);
        expect(callsTo('/candles').length).toBeGreaterThan(firstAttempt);
    });

    it('retries a rate-limited chunk and still serves Coinbase', async () => {
        let limited = 2;
        install({
            ...healthy(),
            coinbaseCandles: (url) => (limited-- > 0 ? json({ message: 'slow down' }, 429) : json(coinbaseCandles(url))),
        });
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const result = await getBitcoinPriceHistoryWithMeta(0, NOW);
        expect(result.servedProvider).toBe('coinbase');
        expect(callsTo('/candles')).toHaveLength(16);
    });

    it('never accepts an empty chunk as data: it refetches around the cache, then falls back', async () => {
        // Coinbase answers 200 [] for one finished chunk, every time.
        const emptyChunk = '2019-08-23';
        install({
            ...healthy(),
            coinbaseCandles: (url) => json(url.searchParams.get('start')?.startsWith(emptyChunk) ? [] : coinbaseCandles(url)),
        });
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const result = await getBitcoinPriceHistoryWithMeta(0, NOW);

        const attempts = callsTo(`start=${emptyChunk}`);
        expect(attempts).toHaveLength(2);
        expect(new URL(attempts[1].url).searchParams.has('t')).toBe(true); // a different cache key
        expect(result.servedProvider).toBe('kraken');
        expect(result.fallback).toBe(true);
    });

    it('heals itself when only the cached copy of a chunk was bad', async () => {
        const badChunk = '2019-08-23';
        install({
            ...healthy(),
            coinbaseCandles: (url) => {
                const bad = url.searchParams.get('start')?.startsWith(badChunk) && !url.searchParams.has('t');
                return json(bad ? coinbaseCandles(url).slice(0, 40) : coinbaseCandles(url));
            },
        });
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const result = await getBitcoinPriceHistoryWithMeta(0, NOW);
        expect(result.servedProvider).toBe('coinbase');
        expect(countPriceKinds(result.kinds).estimated).toBe(0);
        expect(callsTo('/candles')).toHaveLength(15);
    });

    it.each([
        ['an HTML page', '<html>temporarily unavailable</html>'],
        ['an empty body', ''],
        ['JSON cut short', '[[1566518400,1,1,1,10'],
    ])('heals itself when the cached copy of a chunk is %s', async (_what, body) => {
        // Next's Data Cache keeps any 200, whatever is in it.
        const badChunk = '2019-08-23';
        install({
            ...healthy(),
            coinbaseCandles: (url) => {
                const bad = url.searchParams.get('start')?.startsWith(badChunk) && !url.searchParams.has('t');
                return bad ? new Response(body, { status: 200 }) : json(coinbaseCandles(url));
            },
        });
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const result = await getBitcoinPriceHistoryWithMeta(0, NOW);
        expect(result.servedProvider).toBe('coinbase');
        const candles = callsTo('/candles');
        expect(candles).toHaveLength(15);
        expect(candles.filter((c) => new URL(c.url).searchParams.has('t'))).toHaveLength(1);
    });

    it('keeps the retry of a finished chunk for the caller\'s lifetime, not for a week', async () => {
        // If the second answer is bad as well, it must not be the one that stays.
        const badChunk = '2019-08-23';
        install({
            ...healthy(),
            coinbaseCandles: (url) => json(url.searchParams.get('start')?.startsWith(badChunk) ? [] : coinbaseCandles(url)),
        });
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        await getBitcoinPriceHistoryWithMeta(0, NOW);
        const [first, retry] = callsTo(`start=${badChunk}`);
        expect(first.init?.next?.revalidate).toBe(7 * 86_400);
        expect(retry.init?.next?.revalidate).toBe(3600);
    });

    it('does not spend a second request on a body that broke off in transit', async () => {
        // Not a bad cached copy: the request itself failed, like a timeout.
        const broken = (): Response => Object.assign(new Response('{"error":[],"result":'), {
            json: () => Promise.reject(new TypeError('terminated')),
        });
        install({ ...healthy(), krakenOhlc: () => broken() });
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const result = await getBitcoinPriceHistoryWithMeta(0, NOW, 'kraken');
        expect(callsTo('/OHLC')).toHaveLength(1);
        expect(result).toMatchObject({ servedProvider: 'coinbase', fallback: true });
    });

    it('heals itself when the cached Kraken payload is not JSON', async () => {
        install({
            ...healthy(),
            krakenOhlc: (url) => (url.searchParams.has('t') ? json(krakenOhlc()) : new Response('<html>', { status: 200 })),
        });
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const result = await getBitcoinPriceHistoryWithMeta(0, NOW, 'kraken');
        expect(result.servedProvider).toBe('kraken');
        expect(result.fallback).toBe(false);
        expect(callsTo('/OHLC')).toHaveLength(2);
    });

    it('rejects a Coinbase history that stops days ago', async () => {
        install({ ...healthy(), coinbaseCandles: (url) => json(coinbaseCandles(url, TODAY - 6 * DAY_MS)) });
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const result = await getBitcoinPriceHistoryWithMeta(0, NOW);
        expect(result.servedProvider).toBe('kraken');
    });

    it('rejects a truncated Kraken response instead of drawing one line across a decade', async () => {
        const full = krakenOhlc() as { result: { XXBTZUSD: unknown[][] } };
        const candles = full.result.XXBTZUSD;
        const truncated = { error: [], result: { XXBTZUSD: [candles[94], candles[candles.length - 1]], last: 0 } };
        install({ ...healthy(), krakenOhlc: () => json(truncated) });
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const result = await getBitcoinPriceHistoryWithMeta(0, NOW, 'kraken');

        expect(callsTo('/OHLC')).toHaveLength(2); // once, then once around the cache
        expect(result.requestedProvider).toBe('kraken');
        expect(result.servedProvider).toBe('coinbase');
        expect(result.fallback).toBe(true);
    });

    it('keeps today’s earlier copy of the requested series rather than switch exchanges', async () => {
        const upstreams = healthy();
        install(upstreams);
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const good = await getBitcoinPriceHistoryWithMeta(0, NOW);

        // Coinbase goes down; Kraken is fine. Two hours on, the copy in memory
        // has expired, but its finished days are still final closes.
        upstreams.coinbaseCandles = () => json({}, 403);
        vi.setSystemTime(NOW + 2 * 3_600_000);
        const during = await getBitcoinPriceHistoryWithMeta(0, NOW + 2 * 3_600_000);
        expect(during).toMatchObject({ servedProvider: 'coinbase', fallback: false, stale: true, fetchedAt: good.fetchedAt });
        expect(during.data).toEqual(good.data);
        expect(callsTo('/OHLC')).toHaveLength(0);

        // Tomorrow that copy would be missing a day and holding an unfinished
        // close, so the other exchange takes over, flagged.
        vi.setSystemTime(NOW + 22 * 3_600_000);
        const nextDay = await getBitcoinPriceHistoryWithMeta(0, NOW + 22 * 3_600_000);
        expect(nextDay).toMatchObject({ servedProvider: 'kraken', fallback: true, stale: false });
    });

    it('flags a series it could only read from an old cache entry instead of calling it current', async () => {
        // Kraken is down. Next's Data Cache still holds its answer from three
        // hours ago and hands that over, old Date header and all; the refetch
        // around the cache fails. Those prices are a copy from earlier today,
        // which is what `stale` is for.
        const threeHoursAgo = NOW - 3 * 3_600_000;
        install({
            ...healthy(),
            krakenOhlc: (url) => (url.searchParams.has('t')
                ? json({}, 503)
                : json(krakenOhlc(), 200, { date: new Date(threeHoursAgo).toUTCString() })),
        });
        const { getBitcoinPriceHistoryWithMeta, probeProviderHistory } = await coldActions();
        const result = await getBitcoinPriceHistoryWithMeta(0, NOW, 'kraken');
        expect(result).toMatchObject({
            requestedProvider: 'kraken', servedProvider: 'kraken', fallback: false, stale: true, fetchedAt: threeHoursAgo,
        });
        // And a check that must not be satisfied by a copy is not.
        await expect(probeProviderHistory('kraken')).rejects.toThrow();
    });

    it('keeps the newer copy when a later read can only find an older one', async () => {
        // The cache's own entry for Kraken is hours old throughout. The first
        // read gets a fresh answer around it; by the second, Kraken is down and
        // only the old entry comes back. The copy to fall back on is the fresh
        // one already in memory, not the older payload just read.
        const oldEntry = new Date(NOW - 3 * 3_600_000).toUTCString();
        let krakenUp = true;
        install({
            ...healthy(),
            krakenOhlc: (url) => (url.searchParams.has('t')
                ? (krakenUp ? json(krakenOhlc()) : json({}, 503))
                : json(krakenOhlc(), 200, { date: oldEntry })),
        });
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const first = await getBitcoinPriceHistoryWithMeta(0, NOW, 'kraken');
        expect(first).toMatchObject({ servedProvider: 'kraken', stale: false, fetchedAt: NOW });

        krakenUp = false;
        vi.setSystemTime(NOW + 90 * 60_000);
        const second = await getBitcoinPriceHistoryWithMeta(0, NOW, 'kraken');
        expect(second).toMatchObject({ servedProvider: 'kraken', stale: true, fetchedAt: NOW });
    });

    it('serves the last series it had, marked stale, when both exchanges are down', async () => {
        const upstreams = healthy();
        install(upstreams);
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        const good = await getBitcoinPriceHistoryWithMeta(0, NOW);

        upstreams.coinbaseCandles = () => json({}, 403);
        upstreams.krakenOhlc = () => json({}, 403);
        vi.setSystemTime(NOW + 21 * 3_600_000); // past midnight: yesterday's copy is all there is
        const during = await getBitcoinPriceHistoryWithMeta(0, NOW + 21 * 3_600_000);
        expect(callsTo('/OHLC').length).toBeGreaterThan(0); // the other exchange was tried first
        expect(during.stale).toBe(true);
        expect(during.servedProvider).toBe('coinbase');
        expect(during.fetchedAt).toBe(good.fetchedAt);
        expect(during.data).toEqual(good.data);

        // A day later it is no longer honest to call that the price history.
        vi.setSystemTime(NOW + 25 * 3_600_000);
        await expect(getBitcoinPriceHistoryWithMeta(0, NOW)).rejects.toThrow();
    });

    it('throws when both exchanges are down and nothing is in memory', async () => {
        install({ ...healthy(), coinbaseCandles: () => json({}, 403), krakenOhlc: () => json({}, 403) });
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();
        await expect(getBitcoinPriceHistoryWithMeta(0, NOW)).rejects.toThrow();
    });

    it('gives up on a provider that hangs and does not wait for it again', async () => {
        vi.useFakeTimers(); // every timer, so the 8-second timeout can be stepped through
        vi.setSystemTime(NOW);
        const hang: Route = (_url, call) => new Promise<Response>((_, reject) => {
            call.init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
        install({ ...healthy(), coinbaseCandles: hang });
        const { getBitcoinPriceHistoryWithMeta } = await coldActions();

        const first = getBitcoinPriceHistoryWithMeta(0, NOW);
        await vi.advanceTimersByTimeAsync(8_100);
        const result = await first;
        expect(result.servedProvider).toBe('kraken');
        const hung = callsTo('/candles').length;

        // No timers advanced: the second answer cannot have waited for Coinbase.
        const second = await getBitcoinPriceHistoryWithMeta(0, NOW);
        expect(second.servedProvider).toBe('kraken');
        expect(callsTo('/candles')).toHaveLength(hung);
    });
});

// ── Health probes ─────────────────────────────────────────────────────────────

describe('probeProviderHistory', () => {
    it('never falls back', async () => {
        install({ ...healthy(), coinbaseCandles: () => json({}, 403) });
        const { probeProviderHistory } = await coldActions();
        await expect(probeProviderHistory('coinbase')).rejects.toThrow();
        await expect(probeProviderHistory('kraken')).resolves.toBeInstanceOf(Array);
    });

    it('asks the exchange directly inside a live probe, even with a series in memory', async () => {
        install(healthy());
        const { getBitcoinPriceHistoryWithMeta, probeProviderHistory } = await coldActions();
        await getBitcoinPriceHistoryWithMeta(0, NOW);
        await getBitcoinPriceHistoryWithMeta(0, NOW, 'kraken');
        calls = [];

        await runAsLiveProbe(() => probeProviderHistory('kraken'));
        const [ohlc] = callsTo('/OHLC');
        expect(ohlc.init?.cache).toBe('no-store');
        expect(ohlc.init?.next).toBeUndefined();

        await runAsLiveProbe(() => probeProviderHistory('coinbase'));
        const candles = callsTo('/candles');
        // The chunk holding today is fetched live; finished chunks cannot have changed.
        expect(candles.filter((c) => c.init?.cache === 'no-store')).toHaveLength(1);
        expect(candles.filter((c) => c.init?.next?.revalidate === 7 * 86_400)).toHaveLength(13);
    });

    it('is an ordinary cached read for any other caller', async () => {
        install(healthy());
        const { probeProviderHistory } = await coldActions();
        await probeProviderHistory('kraken');
        await probeProviderHistory('kraken');
        expect(callsTo('/OHLC')).toHaveLength(1);
        expect(callsTo('/OHLC')[0].init?.cache).toBeUndefined();
    });

    it('leaves a failing exchange alone for its cool-off unless the caller is a live probe', async () => {
        install({ ...healthy(), coinbaseCandles: () => json({}, 403) });
        const { probeProviderHistory } = await coldActions();
        await expect(probeProviderHistory('coinbase')).rejects.toThrow();
        const asked = callsTo('/candles').length;
        expect(asked).toBeGreaterThan(0);

        // Called outside the health route this is a public endpoint like the
        // rest: repeating it must not repeat the requests to a provider that
        // has just failed (a failure is never cached, so nothing else stops it).
        for (let i = 0; i < 3; i++) await expect(probeProviderHistory('coinbase')).rejects.toThrow();
        expect(callsTo('/candles')).toHaveLength(asked);

        // The health route's own probe is not held back: it has to ask.
        await expect(runAsLiveProbe(() => probeProviderHistory('coinbase'))).rejects.toThrow();
        expect(callsTo('/candles').length).toBeGreaterThan(asked);
    });
});

// ── Spot price ────────────────────────────────────────────────────────────────

describe('spot price', () => {
    it('quotes the default exchange and says when', async () => {
        install(healthy());
        const { getBitcoinSpot, getCurrentBitcoinPrice } = await coldActions();
        expect(await getBitcoinSpot()).toEqual({ price: 83426.53, asOf: NOW, provider: 'coinbase', fallback: false });
        expect(await getCurrentBitcoinPrice('kraken')).toBe(83422.6);
    });

    it('falls back to the other exchange and flags it, or resolves null when both fail', async () => {
        const upstreams = { ...healthy(), coinbaseTicker: () => json({}, 500) };
        install(upstreams);
        const { getBitcoinSpot, getCurrentBitcoinPrice } = await coldActions();
        expect(await getBitcoinSpot()).toMatchObject({ price: 83422.6, provider: 'kraken', fallback: true });
        // The provider-specific probe must not hide the outage.
        await expect(getCurrentBitcoinPrice('coinbase')).rejects.toThrow();

        upstreams.krakenTicker = () => json({ error: ['EService:Unavailable'] });
        expect(await getBitcoinSpot()).toBeNull();
    });

    it('refetches a quote the cache has held too long instead of passing it off as live', async () => {
        const threeDaysAgo = new Date(NOW - 3 * DAY_MS).toUTCString();
        install({
            ...healthy(),
            // What Next's Data Cache does after a quiet weekend: the old body, with its old Date header.
            coinbaseTicker: (url) => (url.searchParams.has('t')
                ? json({ price: '83426.53' }, 200, { date: new Date(NOW).toUTCString() })
                : json({ price: '79000.00' }, 200, { date: threeDaysAgo })),
        });
        const { getBitcoinSpot } = await coldActions();
        expect(await getBitcoinSpot()).toMatchObject({ price: 83426.53, provider: 'coinbase', fallback: false });
        expect(callsTo('/ticker')).toHaveLength(2);
    });

    it('refuses a quote it cannot refresh rather than call it current', async () => {
        const threeDaysAgo = new Date(NOW - 3 * DAY_MS).toUTCString();
        install({
            ...healthy(),
            coinbaseTicker: (url) => (url.searchParams.has('t') ? json({}, 500) : json({ price: '79000.00' }, 200, { date: threeDaysAgo })),
        });
        const { getBitcoinSpot } = await coldActions();
        expect(await getBitcoinSpot()).toMatchObject({ provider: 'kraken', fallback: true });
    });

    it('does not ask an exchange for a quote again while it is failing', async () => {
        const upstreams: Upstreams = { ...healthy(), coinbaseTicker: () => json({}, 500) };
        install(upstreams);
        const { getBitcoinSpot, getCurrentBitcoinPrice } = await coldActions();
        // Every page load and every card asks for the price, and a failure is
        // never cached. None of them may try the failing exchange first (and
        // wait out its timeout when it hangs) before falling back.
        for (let i = 0; i < 4; i++) expect(await getBitcoinSpot()).toMatchObject({ provider: 'kraken', fallback: true });
        await expect(getCurrentBitcoinPrice('coinbase')).rejects.toThrow();
        expect(callsTo('/ticker')).toHaveLength(1);

        // Still down when the cool-off ends: asked once more, then left alone again.
        vi.setSystemTime(NOW + 31_000);
        expect(await getBitcoinSpot()).toMatchObject({ provider: 'kraken', fallback: true });
        expect(await getBitcoinSpot()).toMatchObject({ provider: 'kraken', fallback: true });
        expect(callsTo('/ticker')).toHaveLength(2);

        // Back up: the next attempt after the cool-off gets through.
        upstreams.coinbaseTicker = healthy().coinbaseTicker;
        vi.setSystemTime(NOW + 62_000);
        expect(await getBitcoinSpot()).toMatchObject({ provider: 'coinbase', fallback: false });
    });

    it('lets a live probe ask during the cool-off, and a probe that succeeds ends it', async () => {
        const upstreams: Upstreams = { ...healthy(), coinbaseTicker: () => json({}, 500) };
        install(upstreams);
        const { getBitcoinSpot, getCurrentBitcoinPrice } = await coldActions();
        expect(await getBitcoinSpot()).toMatchObject({ provider: 'kraken', fallback: true });
        await expect(runAsLiveProbe(() => getCurrentBitcoinPrice('coinbase'))).rejects.toThrow();
        expect(callsTo('/ticker')).toHaveLength(2);

        upstreams.coinbaseTicker = healthy().coinbaseTicker;
        expect(await runAsLiveProbe(() => getCurrentBitcoinPrice('coinbase'))).toBe(83426.53);
        expect(await getBitcoinSpot()).toMatchObject({ provider: 'coinbase', fallback: false });
    });

    /** An exchange that accepts the request and never answers, until the caller gives up. */
    const hang: Route = (_url, call) => new Promise<Response>((_, reject) => {
        call.init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    /**
     * What a hung exchange looks like from behind Next's Data Cache: the copy
     * it holds comes back at once with its old Date, and the refetch under a
     * spare key (`t`) is the request that hangs.
     */
    const heldThenHung = (body: unknown, ageMs: number): Route => (url, call) => (
        url.searchParams.has('t') ? hang(url, call) : json(body, 200, { date: new Date(NOW - ageMs).toUTCString() })
    );

    it('counts a refetch that hangs as that exchange failing: one short wait, then no wait at all', async () => {
        vi.useFakeTimers(); // every timer, so the quote timeout can be stepped through
        vi.setSystemTime(NOW);
        // 130 seconds old: past the refetch bound for a 60-second quote, inside the five-minute limit.
        const upstreams: Upstreams = { ...healthy(), coinbaseTicker: heldThenHung({ price: '79000.00' }, 130_000) };
        install(upstreams);
        const { getBitcoinSpot } = await coldActions();

        let settled = false;
        const first = getBitcoinSpot().finally(() => { settled = true; });
        await vi.advanceTimersByTimeAsync(2_900);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(200);
        // The old quote is not handed back as Coinbase's: the other exchange answers.
        expect(await first).toMatchObject({ price: 83422.6, provider: 'kraken', fallback: true });
        const asked = callsTo('/ticker').length;
        expect(asked).toBe(2);

        // No timers advanced: these cannot have waited on Coinbase, or asked it.
        for (let i = 0; i < 3; i++) expect(await getBitcoinSpot()).toMatchObject({ provider: 'kraken', fallback: true });
        expect(callsTo('/ticker')).toHaveLength(asked);

        // Answering again: the first call after the cool-off gets Coinbase's quote.
        upstreams.coinbaseTicker = healthy().coinbaseTicker;
        vi.setSystemTime(Date.now() + 31_000);
        expect(await getBitcoinSpot()).toMatchObject({ price: 83426.53, provider: 'coinbase', fallback: false });
    });

    it('says which "open" the ticker change is measured from', async () => {
        install({ ...healthy(), coinbaseTicker: () => json({ last: '83439.65', open: '82934.36' }) });
        const { getCurrentBitcoinPriceWithChange } = await coldActions();
        expect(await getCurrentBitcoinPriceWithChange()).toEqual({
            price: 83422.6, open24h: 83675.6, provider: 'kraken', changeSince: 'utc-midnight', asOf: NOW,
        });
        expect(await getCurrentBitcoinPriceWithChange('coinbase')).toEqual({
            price: 83439.65, open24h: 82934.36, provider: 'coinbase', changeSince: '24h-ago', asOf: NOW,
        });
    });

    it('quotes the ticker from the other exchange, with its own "open", when Kraken hangs', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        const krakenBody = { error: [], result: { XXBTZUSD: { c: ['80000.00000', '0.1'], o: '81000.00000' } } };
        const coinbaseStats = (): Response => json({ last: '83439.65', open: '82934.36' });
        // 100 seconds old: past the refetch bound for the ticker's 30-second lifetime.
        const upstreams: Upstreams = { ...healthy(), krakenTicker: heldThenHung(krakenBody, 100_000), coinbaseTicker: coinbaseStats };
        install(upstreams);
        const { getLiveTicker, getCurrentBitcoinPriceWithChange } = await coldActions();

        const first = getLiveTicker();
        await vi.advanceTimersByTimeAsync(3_100);
        // Asked the moment Kraken's three seconds were up.
        expect(await first).toEqual({ price: 83439.65, open24h: 82934.36, provider: 'coinbase', changeSince: '24h-ago', asOf: NOW + 3_000 });
        const asked = callsTo('/Ticker').length;

        // Kraken is left alone for its cool-off, and nobody waits for it.
        expect(await getLiveTicker()).toMatchObject({ provider: 'coinbase', changeSince: '24h-ago' });
        expect(await getCurrentBitcoinPriceWithChange()).toMatchObject({ provider: 'coinbase', changeSince: '24h-ago' });
        expect(callsTo('/Ticker')).toHaveLength(asked);

        // Both hanging: null, after one timeout and then at once. Never an old price, never a rejection.
        upstreams.coinbaseTicker = heldThenHung({ last: '79000.00', open: '78000.00' }, 100_000);
        vi.setSystemTime(Date.now() + 31_000);
        const both = getLiveTicker();
        await vi.advanceTimersByTimeAsync(6_200);
        expect(await both).toBeNull();
        expect(await getLiveTicker()).toBeNull();
        await expect(getCurrentBitcoinPriceWithChange()).rejects.toThrow('Neither exchange has a current quote');

        // Kraken back: its quote, and its midnight open, once the cool-off is over.
        upstreams.krakenTicker = healthy().krakenTicker;
        vi.setSystemTime(Date.now() + 31_000);
        expect(await getLiveTicker()).toMatchObject({ price: 83422.6, provider: 'kraken', changeSince: 'utc-midnight' });
    });

    it('does not ask an exchange for its ticker again while it is failing', async () => {
        const upstreams: Upstreams = { ...healthy(), krakenTicker: () => json({}, 500), coinbaseTicker: () => json({ last: '83439.65', open: '82934.36' }) };
        install(upstreams);
        const { getLiveTicker } = await coldActions();
        for (let i = 0; i < 4; i++) expect(await getLiveTicker()).toMatchObject({ provider: 'coinbase' });
        expect(callsTo('/Ticker')).toHaveLength(1);

        vi.setSystemTime(NOW + 31_000);
        await getLiveTicker();
        expect(callsTo('/Ticker')).toHaveLength(2);
    });

    it('refuses a ticker quote older than five minutes when it cannot be refreshed', async () => {
        const old = new Date(NOW - 6 * 60_000).toUTCString();
        install({
            ...healthy(),
            krakenTicker: (url) => (url.searchParams.has('t') ? json({}, 500) : json({ error: [], result: { XXBTZUSD: { c: ['80000.0'], o: '81000.0' } } }, 200, { date: old })),
            coinbaseTicker: () => json({}, 500),
        });
        const { getLiveTicker } = await coldActions();
        expect(await getLiveTicker()).toBeNull();
    });

    it('fetches the history and the quote together, and resolves null for a part it cannot get', async () => {
        const upstreams: Upstreams = healthy();
        install(upstreams);
        let actions = await coldActions();
        const both = await actions.getPriceHistoryAndSpot(TODAY - 30 * DAY_MS, NOW, 'kraken');
        expect(both.history).toMatchObject({ requestedProvider: 'kraken', servedProvider: 'kraken', fallback: false });
        expect(both.history?.data.at(-1)?.[0]).toBe(TODAY);
        expect(both.spot).toMatchObject({ price: 83422.6, provider: 'kraken', fallback: false });

        // Nothing reachable and nothing in memory: two nulls, not a rejection.
        upstreams.coinbaseCandles = () => json({}, 403);
        upstreams.krakenOhlc = () => json({}, 403);
        upstreams.coinbaseTicker = () => json({}, 500);
        upstreams.krakenTicker = () => json({}, 500);
        actions = await coldActions();
        expect(await actions.getPriceHistoryAndSpot(TODAY - 30 * DAY_MS, NOW)).toEqual({ history: null, spot: null });
    });
});

// ── Same plan, every start date ───────────────────────────────────────────────

describe('getOutcomeRange', () => {
    it('summarises every start date and says exactly what was run', async () => {
        install(healthy());
        const { getOutcomeRange } = await coldActions();
        const range = await getOutcomeRange('weekly', 1826, 0.5, 'exchange');

        expect(range).not.toBeNull();
        expect(range).toMatchObject({ frequency: 'weekly', durationDays: 1826, months: 60, feePercentage: 0.5, era: 'exchange', estimatedDays: 0 });
        expect(range!.spanStart).toBe(FIRST_COINBASE_DAY);
        expect(range!.spanEnd).toBe(TODAY - DAY_MS); // today's row is not a close
        const spanDays = (range!.spanEnd - range!.spanStart) / DAY_MS;
        expect(range!.runs).toBe(spanDays - 1826 + 1);
        expect(range!.independentPeriods).toBe(Math.floor(spanDays / 1826));
        expect(range!.worst).toBeLessThanOrEqual(range!.p10);
        expect(range!.p10).toBeLessThanOrEqual(range!.median);
        expect(range!.median).toBeLessThanOrEqual(range!.p90);
        expect(range!.p90).toBeLessThanOrEqual(range!.best);
        expect(range!.quantiles).toHaveLength(101);
    });

    it('reads the same walk through the fee, without refetching', async () => {
        install(healthy());
        const { getOutcomeRange } = await coldActions();
        const free = (await getOutcomeRange('weekly', 365, 0))!;
        const requests = calls.length;
        const costly = (await getOutcomeRange('weekly', 365, 2))!;
        expect(calls.length).toBe(requests);
        expect(costly.runs).toBe(free.runs);
        // value/paid scales by (1 - fee), so return r becomes (1 + r) * 0.98 - 1.
        expect(costly.median).toBeCloseTo((1 + free.median / 100) * 0.98 * 100 - 100, 3);
        expect(costly.worst).toBeLessThan(free.worst);
        expect(costly.shareBelowCostPercent).toBeGreaterThanOrEqual(free.shareBelowCostPercent);
    });

    it('covers more history in the all-history era than in the exchange era', async () => {
        install(healthy());
        const { getOutcomeRange } = await coldActions();
        const all = (await getOutcomeRange('monthly', 1096))!;
        const exchange = (await getOutcomeRange('monthly', 1096, 0, 'exchange'))!;
        expect(all.era).toBe('all');
        expect(all.spanStart).toBe(BTC_HISTORICAL_DAILY[0][0]);
        expect(all.runs).toBeGreaterThan(exchange.runs);
        expect(all.independentPeriods).toBeGreaterThanOrEqual(exchange.independentPeriods);
    });

    it('resolves null for input it cannot honestly answer', async () => {
        install(healthy());
        const { getOutcomeRange } = await coldActions();
        expect(await getOutcomeRange('hourly' as never, 365)).toBeNull();
        expect(await getOutcomeRange('weekly', 60)).toBeNull(); // under 90 days
        expect(await getOutcomeRange('weekly', NaN)).toBeNull();
        expect(await getOutcomeRange('weekly', 40 * 365)).toBeNull(); // longer than the history
    });

    it('stops a walk run on yesterday’s copy at the last day that copy saw finish', async () => {
        const upstreams = healthy();
        install(upstreams);
        const { getBitcoinPriceHistoryWithMeta, getOutcomeRange } = await coldActions();
        await getBitcoinPriceHistoryWithMeta(0, NOW); // fetched on the 12th at 04:10

        // Coinbase is down the next morning, so the walk falls back on that
        // copy. Its row for the 12th is the price at 04:10, not the day's
        // close, so the last finished day it holds is the 11th.
        upstreams.coinbaseCandles = () => json({}, 403);
        vi.setSystemTime(NOW + 21 * 3_600_000);
        const range = (await getOutcomeRange('weekly', 365))!;
        expect(range).not.toBeNull();
        expect(range.spanEnd).toBe(TODAY - DAY_MS);
    });

    it('resolves null rather than run on straight-line estimates when the daily closes are unavailable', async () => {
        install({ ...healthy(), coinbaseCandles: () => json({}, 403) });
        const { getOutcomeRange, getCostBasisPercentile } = await coldActions();
        expect(await getOutcomeRange('weekly', 365)).toBeNull();
        expect(await getCostBasisPercentile('weekly', 365, 20_000)).toBeNull();
    });
});

describe('getCostBasisPercentile', () => {
    it('ranks an average cost against every run’s average cost', async () => {
        install(healthy());
        const { getCostBasisPercentile } = await coldActions();
        const cheap = (await getCostBasisPercentile('weekly', 365, 0.01))!;
        const dear = (await getCostBasisPercentile('weekly', 365, 10_000_000))!;
        expect(cheap.percentile).toBe(100); // every run paid more
        expect(dear.percentile).toBe(0);
        expect(cheap.windowCount).toBe(dear.windowCount);
        expect(cheap.windowCount).toBeGreaterThan(5000);
        expect(await getCostBasisPercentile('weekly', 365, -1)).toBeNull();
    });
});

// ── Hero stat ─────────────────────────────────────────────────────────────────

describe('getHeroStat', () => {
    it('runs the default plan exactly as the calculator does, fee included', async () => {
        install(healthy());
        const { getHeroStat, getBitcoinPriceHistory } = await coldActions();
        const stat = (await getHeroStat())!;

        const window = defaultPlanWindow(NOW);
        expect(stat).toMatchObject({
            amount: DEFAULT_PLAN.amount,
            frequency: DEFAULT_PLAN.frequency,
            yearsBack: DEFAULT_PLAN.yearsBack,
            feePercentage: DEFAULT_PLAN.feePercentage,
            startDate: window.startDate,
            endDate: window.endDate,
            provider: 'coinbase',
        });

        // What the seeded calculator computes: the same window, the series
        // rounded to cents as the home page ships it, the same spot, the default fee.
        const seed = (await getBitcoinPriceHistory(window.startTs, window.endTs + DAY_MS))
            .map(([ts, price]): [number, number] => [ts, Math.round(price * 100) / 100]);
        const calculator = calculateDca(
            {
                amount: DEFAULT_PLAN.amount,
                frequency: DEFAULT_PLAN.frequency,
                startDate: new Date(window.startDate),
                endDate: new Date(window.endDate),
                feePercentage: DEFAULT_PLAN.feePercentage,
                priceMode: 'api',
                manualPrice: 0,
            },
            seed,
            83426.53,
            NOW,
        );
        expect(stat.invested).toBe(calculator.totalInvested);
        expect(stat.value).toBe(calculator.currentValue);
        expect(stat.roi).toBe(calculator.roi);
        expect(stat.btc).toBe(calculator.btcAccumulated);
        // Fee included: less than the same coins bought fee-free.
        expect(stat.value).toBeLessThan(stat.btc * 83426.53 / (1 - DEFAULT_PLAN.feePercentage / 100));
        expect(stat.invested).toBe(261 * DEFAULT_PLAN.amount);
    });

    it('resolves null when there is no price history at all', async () => {
        install({ ...healthy(), coinbaseCandles: () => json({}, 403), krakenOhlc: () => json({}, 403) });
        const { getHeroStat } = await coldActions();
        expect(await getHeroStat()).toBeNull();
    });
});

// ── FX ────────────────────────────────────────────────────────────────────────

describe('FX rates', () => {
    it('reads ECB rates from Frankfurter’s provider route and dates them', async () => {
        install(healthy());
        const { getFxSnapshot, getFxRates } = await coldActions();
        const snapshot = await getFxSnapshot();
        expect(snapshot).toEqual({
            rates: { USD: 1, EUR: 0.89238, GBP: 0.75641, CAD: 1.4226, AUD: 1.4324, JPY: 158.25 },
            live: true,
            asOf: '2026-10-09',
        });
        expect(await getFxRates()).toEqual({ EUR: 0.89238, GBP: 0.75641, CAD: 1.4226, AUD: 1.4324, JPY: 158.25 });

        const [request] = callsTo('frankfurter');
        expect(request.url).toBe('https://api.frankfurter.dev/v2/providers/ecb/rates?base=USD&quotes=EUR,GBP,CAD,AUD,JPY');
        expect(callsTo('frankfurter')).toHaveLength(1); // the second read came from memory
    });

    it('falls back to the dated constants and says so when the provider is down', async () => {
        install({ ...healthy(), frankfurter: () => json({ message: 'unavailable' }, 503) });
        const { getFxSnapshot, getFxRates } = await coldActions();
        expect(await getFxSnapshot()).toEqual({ rates: FX_FALLBACK_RATES, live: false, asOf: FX_FALLBACK_AS_OF });
        expect(await getFxRates()).toBeNull();
    });

    it('treats an empty or partial answer as no answer', async () => {
        // Frankfurter v2 returns 200 [] for a provider or currency it does not know.
        const upstreams = { ...healthy(), frankfurter: () => json([]) };
        install(upstreams);
        const { getFxSnapshot } = await coldActions();
        expect((await getFxSnapshot()).live).toBe(false);

        upstreams.frankfurter = () => json((ecbRates() as unknown[]).slice(0, 3));
        expect((await getFxSnapshot()).live).toBe(false);
    });

    it('keeps serving the last ECB rates it fetched through an outage, still dated', async () => {
        const upstreams = healthy();
        install(upstreams);
        const { getFxSnapshot } = await coldActions();
        await getFxSnapshot();
        upstreams.frankfurter = () => json({}, 503);
        vi.setSystemTime(NOW + 13 * 3_600_000); // past the 12-hour memory lifetime
        expect(await getFxSnapshot()).toMatchObject({ live: true, asOf: '2026-10-09' });

        // A fortnight on they are still the best rates on hand, but not current.
        vi.setSystemTime(NOW + 14 * DAY_MS);
        expect(await getFxSnapshot()).toMatchObject({ live: false, asOf: '2026-10-09', rates: { EUR: 0.89238 } });
    });

    it('does not ask the rate provider again while it is failing, then tries once the cool-off is over', async () => {
        const upstreams = { ...healthy(), frankfurter: () => json({ message: 'unavailable' }, 503) };
        install(upstreams);
        const { getFxSnapshot, getFxRates } = await coldActions();
        // A failure is never cached, so every card and every page load used
        // to send its own request at a provider that was already down (and
        // wait out its timeout when it hung).
        for (let i = 0; i < 4; i++) expect((await getFxSnapshot()).live).toBe(false);
        expect(await getFxRates()).toBeNull();
        expect(callsTo('frankfurter')).toHaveLength(1);

        upstreams.frankfurter = () => json(ecbRates());
        vi.setSystemTime(NOW + 31_000);
        expect(await getFxSnapshot()).toMatchObject({ live: true, asOf: '2026-10-09' });
        expect(callsTo('frankfurter')).toHaveLength(2);
    });

    it('lets a live probe ask the rate provider during its cool-off', async () => {
        install({ ...healthy(), frankfurter: () => json({ message: 'unavailable' }, 503) });
        const { getFxRates } = await coldActions();
        expect(await getFxRates()).toBeNull();
        expect(await runAsLiveProbe(() => getFxRates())).toBeNull();
        expect(callsTo('frankfurter')).toHaveLength(2);
    });

    it('does not make a US-dollar card wait on exchange rates it has no use for', async () => {
        install({ ...healthy(), frankfurter: () => json({ message: 'unavailable' }, 503) });
        await coldActions();
        const { resolveServerCurrency } = await import('./serverCurrency');
        expect(await resolveServerCurrency('USD')).toEqual({ symbol: '$', rate: 1, live: true });
        expect(callsTo('frankfurter')).toHaveLength(0);
    });

    it('flags the rate on the server-rendered surfaces too', async () => {
        const upstreams = healthy();
        install(upstreams);
        await coldActions();
        const { resolveServerCurrency } = await import('./serverCurrency');
        expect(await resolveServerCurrency('AUD')).toEqual({ symbol: 'A$', rate: 1.4324, live: true, asOf: '2026-10-09' });
        expect(await resolveServerCurrency('USD')).toMatchObject({ symbol: '$', rate: 1, live: true });

        upstreams.frankfurter = () => json({}, 503);
        await coldActions();
        const offline = await import('./serverCurrency');
        expect(await offline.resolveServerCurrency('AUD')).toEqual({
            symbol: 'A$', rate: FX_FALLBACK_RATES.AUD, live: false, asOf: FX_FALLBACK_AS_OF,
        });
    });
});

// ── Comparison series ─────────────────────────────────────────────────────────

describe('comparison series', () => {
    /** Yahoo's chart envelope: one bar a day for the ten days up to yesterday, stamped mid-session. */
    const yahooChart = (): Response => {
        const timestamp = Array.from({ length: 10 }, (_, i) => (TODAY - (10 - i) * DAY_MS) / 1000 + 14 * 3600);
        return json({ chart: { result: [{ timestamp, indicators: { quote: [{ close: timestamp.map((_, i) => 100 + i) }] } }] } });
    };

    it('does not ask Yahoo for a series again while that series is failing', async () => {
        install(healthy()); // no Yahoo route: every request answers 404
        const { getAssetPriceHistory } = await coldActions();
        // The calculator asks for the S&P 500 and gold on every date change,
        // and a failure is never cached: without the cool-off an outage (or
        // Yahoo rate-limiting this server) is a fresh request per keystroke.
        for (let i = 0; i < 4; i++) expect(await getAssetPriceHistory('^SP500TR', TODAY - 30 * DAY_MS, NOW)).toBeNull();
        expect(callsTo('finance.yahoo.com')).toHaveLength(1);

        // Each series has its own cool-off, so the price-only index is still
        // tried when the total-return one has no data.
        expect(await getAssetPriceHistory('^GSPC', TODAY - 30 * DAY_MS, NOW)).toBeNull();
        expect(callsTo('finance.yahoo.com')).toHaveLength(2);

        vi.setSystemTime(NOW + 31_000);
        await getAssetPriceHistory('^SP500TR', TODAY - 30 * DAY_MS, NOW);
        expect(callsTo('finance.yahoo.com')).toHaveLength(3);
    });

    it('keeps serving the copy it has through the cool-off, and lets a live probe ask', async () => {
        const upstreams: Upstreams = { ...healthy(), yahoo: yahooChart };
        install(upstreams);
        const { getAssetPriceHistory } = await coldActions();
        const good = await getAssetPriceHistory('GC=F', TODAY - 30 * DAY_MS, NOW);
        expect(good).toHaveLength(10);

        upstreams.yahoo = () => json({}, 429);
        vi.setSystemTime(NOW + 61 * 60_000); // the copy in memory has expired
        const later = NOW + 61 * 60_000;
        expect(await getAssetPriceHistory('GC=F', TODAY - 30 * DAY_MS, later)).toEqual(good);
        expect(await getAssetPriceHistory('GC=F', TODAY - 30 * DAY_MS, later)).toEqual(good);
        expect(callsTo('finance.yahoo.com')).toHaveLength(2);

        // The health check has to see the outage, not the copy and not the cool-off.
        expect(await runAsLiveProbe(() => getAssetPriceHistory('GC=F', TODAY - 30 * DAY_MS, later))).toBeNull();
        expect(callsTo('finance.yahoo.com')).toHaveLength(3);
    });

    it('gives the inflation series the same cool-off', async () => {
        vi.stubEnv('FRED_API_KEY', 'test-key');
        install(healthy()); // no FRED route: 404
        const { getCpiData } = await coldActions();
        for (let i = 0; i < 3; i++) expect(await getCpiData(Date.UTC(2015, 0, 1), NOW)).toBeNull();
        vi.unstubAllEnvs();
        expect(callsTo('stlouisfed.org')).toHaveLength(1);
    });

    it('fetches the S&P 500, gold and CPI together, using the price index only when the total-return index has no bars', async () => {
        vi.stubEnv('FRED_API_KEY', 'test-key');
        const upstreams: Upstreams = {
            ...healthy(),
            yahoo: yahooChart,
            fred: () => json({ observations: [{ date: '2026-08-01', value: '329.0' }, { date: '2026-09-01', value: '330.1' }, { date: '2026-10-01', value: '.' }] }),
        };
        install(upstreams);
        let actions = await coldActions();
        const from = TODAY - 30 * DAY_MS;
        const series = await actions.getComparisonSeries(from, NOW);
        expect(series.sp500).toHaveLength(10);
        expect(series.gold).toHaveLength(10);
        expect(series.cpi).toEqual([[Date.UTC(2026, 8, 1), 330.1]]);
        expect(callsTo('finance.yahoo.com').map((c) => decodeURIComponent(new URL(c.url).pathname.split('/').pop()!))).toEqual(['^SP500TR', 'GC=F']);
        // CPI can be read past the end of the window the other two stop at.
        const june = Date.UTC(2026, 5, 1);
        expect((await actions.getComparisonSeries(june, june + 29 * DAY_MS)).cpi).toBeNull();
        expect((await actions.getComparisonSeries(june, june + 29 * DAY_MS, NOW)).cpi).toEqual([
            [Date.UTC(2026, 7, 1), 329.0], [Date.UTC(2026, 8, 1), 330.1],
        ]);

        upstreams.yahoo = (url) => (url.pathname.includes('SP500TR') ? json({ chart: { result: [{ timestamp: [], indicators: { quote: [{ close: [] }] } }] } }) : yahooChart());
        calls = [];
        actions = await coldActions();
        const fallback = await actions.getComparisonSeries(from, NOW);
        vi.unstubAllEnvs();
        expect(fallback.sp500).toHaveLength(10);
        expect(callsTo('finance.yahoo.com').map((c) => decodeURIComponent(new URL(c.url).pathname.split('/').pop()!)).sort()).toEqual(['GC=F', '^GSPC', '^SP500TR']);
    });
});

// ── When an answer was really fetched ─────────────────────────────────────────

describe('responseTime', () => {
    const at = (headers: Record<string, string>): number => responseTime(new Response('{}', { headers }), NOW);

    it('reads the Date header a cached response still carries', () => {
        expect(at({ date: new Date(NOW - 90_000).toUTCString() })).toBe(NOW - 90_000);
    });

    it('takes off the time a provider\'s own CDN held the answer', () => {
        // Coinbase's candles arrive with the current Date and an Age of up to 300 seconds.
        expect(at({ date: new Date(NOW).toUTCString(), age: '240' })).toBe(NOW - 240_000);
        expect(at({ date: new Date(NOW - 60_000).toUTCString(), age: '30' })).toBe(NOW - 90_000);
        expect(at({ date: new Date(NOW).toUTCString(), age: 'soon' })).toBe(NOW);
        expect(at({ date: new Date(NOW).toUTCString(), age: '-5' })).toBe(NOW);
    });

    it('assumes now when the header is missing, unreadable or from the future', () => {
        expect(at({})).toBe(NOW);
        expect(at({ date: 'yesterday-ish' })).toBe(NOW);
        expect(at({ date: new Date(NOW + 5 * 60_000).toUTCString() })).toBe(NOW);
        // A clock a few seconds ahead of ours is normal, and never reported as the future.
        expect(at({ date: new Date(NOW + 30_000).toUTCString() })).toBe(NOW);
    });
});

// ── Purchasing power ──────────────────────────────────────────────────────────

describe('getPurchasingPowerData', () => {
    it('takes the 2015 baseline from the bundled series, not a literal', async () => {
        vi.stubEnv('FRED_API_KEY', 'test-key');
        const upstreams = healthy();
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = new URL(String(input));
            if (url.host === 'api.stlouisfed.org') {
                return json({ observations: [{ date: '2014-12-01', value: '236.3' }, { date: '2015-01-01', value: '234.7' }, { date: '2026-09-01', value: '330.1' }] });
            }
            return upstreams.coinbaseTicker(url, { url: url.href, init: undefined });
        }));
        const { getPurchasingPowerData } = await coldActions();
        const data = (await getPurchasingPowerData())!;
        vi.unstubAllEnvs();

        const jan2015 = BTC_HISTORICAL_DAILY.find(([ts]) => ts === Date.UTC(2015, 0, 1))!;
        expect(jan2015[1]).toBe(320.97);
        expect(data).toEqual({ cpiStart: 234.7, cpiNow: 330.1, btcPriceStart: 320.97, btcPriceNow: 83426.53 });
    });
});
