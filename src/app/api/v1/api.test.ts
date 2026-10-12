import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DAY_MS, defaultPlanWindow, utcDayStart } from '@/utils/dates';
import { calculateDca } from '@/utils/dca';
import { BREAKDOWN_CAP, EXPOSED_HEADERS, cacheControl, kindLabel, provenanceNote, resolveDcaWindow } from './contract';
import { parseIsoDayParam, resolvePriceQuery } from './shared';

/**
 * The public API against a fake internet.
 *
 * /developers promises a contract field by field, and other people's code is
 * written against it, so each promise is pinned here: which dates are refused
 * and in what words, what a response says about where its prices came from,
 * and that nothing an existing caller reads has moved.
 */

const NOW = Date.UTC(2026, 9, 12, 4, 10); // Monday 2026-10-12 04:10 UTC
const TODAY = utcDayStart(NOW);
const FIRST_COINBASE_DAY = Date.UTC(2015, 6, 20);
const WEEK_S = 604_800;
const STATE_KEY = Symbol.for('btcdca.actions.state.v4');
const ORIGIN = 'https://btcdollarcostaverage.com';

/** A deterministic daily close that wiggles: no three consecutive days sit on one line. */
const coinbaseClose = (ts: number): number => {
    const d = ts / DAY_MS;
    return 5000 + (d % 89) * 37 + Math.sin(d * 1.3) * 400 + (d - 16_000) * 9;
};

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

/** Coinbase's candles endpoint: [time s, low, high, open, close, volume], newest first. */
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

/** Kraken's weekly OHLC envelope: candles open on Thursdays and close with Wednesday's last trade. */
const krakenOhlc = (): unknown => {
    const candles: unknown[][] = [];
    for (let open = Date.UTC(2013, 9, 3) / 1000; open * 1000 <= NOW; open += WEEK_S) {
        candles.push([open, '0', '0', '0', String(coinbaseClose((open + WEEK_S - 86_400) * 1000)), '0', '1', 1]);
    }
    return { error: [], result: { XXBTZUSD: candles, last: 0 } };
};

type Route = (url: URL) => Response;

interface Upstreams {
    coinbaseCandles: Route;
    coinbaseTicker: Route;
    krakenOhlc: Route;
    krakenTicker: Route;
}

const SPOT = 83_426.53;

const healthy = (): Upstreams => ({
    coinbaseCandles: (url) => json(coinbaseCandles(url)),
    coinbaseTicker: () => json({ price: String(SPOT) }),
    krakenOhlc: () => json(krakenOhlc()),
    krakenTicker: () => json({ error: [], result: { XXBTZUSD: { c: ['83422.60000', '0.1'], o: '83675.60000' } } }),
});

const down: Route = () => json({ message: 'forbidden' }, 403);

let calls: string[] = [];

function install(upstreams: Upstreams): void {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        calls.push(url.href);
        if (url.host === 'api.exchange.coinbase.com') {
            return url.pathname.endsWith('/candles') ? upstreams.coinbaseCandles(url) : upstreams.coinbaseTicker(url);
        }
        if (url.host === 'api.kraken.com') {
            return url.pathname.endsWith('/OHLC') ? upstreams.krakenOhlc(url) : upstreams.krakenTicker(url);
        }
        return json({ error: 'unexpected upstream' }, 404);
    }));
}

type Json = Record<string, unknown>;

interface ApiResponse {
    status: number;
    headers: Headers;
    body: Json;
    text: string;
}

/** A cold server instance: fresh route modules, empty action caches. */
async function coldApi(): Promise<(path: string) => Promise<ApiResponse>> {
    delete (globalThis as Record<symbol, unknown>)[STATE_KEY];
    vi.resetModules();
    const routes = {
        '/api/v1/prices': (await import('./prices/route')).GET,
        '/api/v1/prices.csv': (await import('./prices.csv/route')).GET,
        '/api/v1/dca': (await import('./dca/route')).GET,
    };
    return async (path) => {
        const url = new URL(path, ORIGIN);
        const handler = routes[url.pathname as keyof typeof routes];
        const res = await handler(new NextRequest(url));
        const text = await res.text();
        let body: Json = {};
        try {
            body = JSON.parse(text) as Json;
        } catch {
            // A CSV body: read it from `text`.
        }
        return { status: res.status, headers: res.headers, body, text };
    };
}

type Row = { date: string; price: number; invested: number; accumulated: number; fee: number; priceKind?: string; isStartingStack?: boolean };
const rowsOf = (res: ApiResponse): Row[] => res.body.breakdown as Row[];
const inputsOf = (res: ApiResponse): Json => res.body.inputs as Json;

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

// ── Provenance text ───────────────────────────────────────────────────────────

describe('provenance note', () => {
    it('does not call the bundled rows closes, and says what they are', () => {
        for (const provider of ['coinbase', 'kraken'] as const) {
            const note = provenanceNote(provider);
            expect(note).not.toMatch(/real daily closes|one close per UTC day/);
            expect(note).toContain('not exchange closes');
            expect(note).toContain('00:00 UTC');
            expect(note).toContain('2010-08-18 through 2015-07-19');
        }
    });

    it('describes the exchange that served the rows', () => {
        expect(provenanceNote('coinbase')).toContain("close of Coinbase's BTC-USD daily candle");
        const kraken = provenanceNote('kraken');
        expect(kraken).toContain("Kraken's weekly closes");
        expect(kraken).toContain('Wednesday');
        expect(kraken).toContain('straight-line estimate');
        expect(kraken).toContain('provider=coinbase');
    });

    it('says which Kraken values are still moving', () => {
        const kraken = provenanceNote('kraken');
        expect(kraken).toContain('week in progress has no close yet');
        expect(kraken).toContain('change each time the series is refetched');
        expect(provenanceNote('coinbase')).not.toContain('week in progress');
    });

    it('is plain ASCII, because the CSV endpoint sends it as a header', () => {
        const everything = provenanceNote('kraken', {
            requested: 'coinbase', stale: true, fetchedAt: NOW, lastRowTs: TODAY, rows: 10, estimatedRows: 6,
        });
        expect(everything).toMatch(/^[\x20-\x7E]+$/);
        expect(provenanceNote('coinbase')).toMatch(/^[\x20-\x7E]+$/);
    });

    it('opens with the fallback and the stale notice when they apply', () => {
        expect(provenanceNote('kraken', { requested: 'coinbase', fetchedAt: NOW }))
            .toMatch(/^Coinbase was unreachable; these prices are Kraken weekly closes/);
        expect(provenanceNote('coinbase', { requested: 'coinbase', stale: true, fetchedAt: NOW }))
            .toMatch(/^Coinbase could not be reached just now; these prices were fetched on 2026-10-12 at 04:10 UTC\./);
        expect(provenanceNote('coinbase', { requested: 'coinbase', fetchedAt: NOW })).toMatch(/^All prices are USD/);
    });

    it('says the newest price is not a close only when it is the day the series was fetched', () => {
        const reachesToday = provenanceNote('coinbase', { fetchedAt: NOW, lastRowTs: TODAY });
        expect(reachesToday).toContain('The price for 2026-10-12 is not a close: it is the latest Coinbase trade at 04:10 UTC');
        const endsEarlier = provenanceNote('coinbase', { fetchedAt: NOW, lastRowTs: TODAY - DAY_MS });
        expect(endsEarlier).not.toContain('is not a close');
    });

    it('counts the estimated rows of the response', () => {
        expect(provenanceNote('coinbase', { rows: 366, estimatedRows: 0 })).toContain('None of the 366 rows in this response is an estimate.');
        expect(provenanceNote('kraken', { rows: 366, estimatedRows: 313 })).toContain('313 of the 366 rows in this response are straight-line estimates.');
    });

    it('names each marker for the CSV column', () => {
        expect(kindLabel('o')).toBe('observed');
        expect(kindLabel('e')).toBe('estimated');
        expect(kindLabel('-')).toBe('');
        expect(kindLabel(undefined)).toBe('');
    });
});

describe('cache lifetimes', () => {
    it('keeps the published lifetimes and shortens a degraded response', () => {
        expect(cacheControl('prices', false)).toBe('public, s-maxage=3600, stale-while-revalidate=300');
        expect(cacheControl('dca', false)).toBe('public, s-maxage=1800, stale-while-revalidate=300');
        expect(cacheControl('prices', true)).toBe('public, s-maxage=300');
        expect(cacheControl('dca', true)).toBe('public, s-maxage=300');
    });
});

// ── Which dates a backtest may cover ──────────────────────────────────────────

describe('resolveDcaWindow', () => {
    const ok = (start: string | undefined, end: string | undefined) => {
        const window = resolveDcaWindow(start, end, NOW);
        if ('error' in window) throw new Error(window.error);
        return window;
    };
    const refused = (start: string | undefined, end: string | undefined): string => {
        const window = resolveDcaWindow(start, end, NOW);
        if (!('error' in window)) throw new Error('expected a refusal');
        return window.error;
    };

    it('falls back to the calculator’s own default window', () => {
        const window = ok(undefined, undefined);
        const expected = defaultPlanWindow(NOW);
        expect(window.startDate).toBe(expected.startDate);
        expect(window.endDate).toBe(expected.endDate);
        expect(window.startDefaulted).toBe(true);
    });

    it('never defaults the start to a day before the price data', () => {
        expect(ok(undefined, '2012-01-01').startDate).toBe('2010-08-18');
        expect(ok(undefined, '2015-08-18').startDate).toBe('2010-08-18');
        expect(ok(undefined, '2015-08-19').startDate).toBe('2010-08-19');
        expect(ok(undefined, '2020-06-15').startDate).toBe('2015-06-15');
    });

    it('defaults from a leap day to Feb 28, like the calculator', () => {
        expect(ok(undefined, '2024-02-29').startDate).toBe('2019-02-28');
    });

    it('accepts a window that starts today and one that ends in the future', () => {
        expect(ok('2026-10-12', undefined).startTs).toBe(TODAY);
        const future = ok('2025-01-01', '2030-12-31');
        expect(future.endDate).toBe('2030-12-31');
        expect(future.startDefaulted).toBe(false);
    });

    it('refuses a start date after today, by UTC date, and says so', () => {
        const tomorrow = refused('2026-10-13', '2026-12-31');
        expect(tomorrow).toContain("'startDate' (2026-10-13) is after today (2026-10-12, UTC)");
        expect(tomorrow).toContain('history only');
        expect(refused('2027-01-01', '2028-01-01')).toContain('is after today');
        // With no endDate sent, the complaint must not be about an endDate.
        expect(refused('2027-01-01', undefined)).toContain("'startDate' (2027-01-01) is after today");
    });

    it('says when the refused start date was its own default', () => {
        const error = refused(undefined, '2040-01-01');
        expect(error).toContain("No 'startDate' was sent");
        expect(error).toContain('2035-01-01');
        expect(error).toContain('is after today');
    });

    it('refuses an inverted window and one that ends before the data, each in its own words', () => {
        expect(refused('2024-06-01', '2024-01-01')).toBe("'startDate' (2024-06-01) must be on or before 'endDate' (2024-01-01).");
        expect(refused(undefined, '2009-01-01')).toContain('before the price data begins (2010-08-18)');
        // decodeParams has already raised this start to 2010-08-18; the message
        // must still be about the end date, not a start the caller never sent.
        expect(refused('2010-08-18', '2009-01-01')).toContain('before the price data begins');
    });
});

describe('resolvePriceQuery', () => {
    const resolve = (query: string) => resolvePriceQuery(new URLSearchParams(query), NOW);
    const error = (query: string): string => {
        const result = resolve(query);
        if (!('error' in result)) throw new Error('expected a refusal');
        return result.error;
    };

    it('defaults to the full history from the default provider', () => {
        expect(resolve('')).toEqual({ fromTs: Date.UTC(2010, 7, 18), toTs: TODAY, provider: 'coinbase' });
        expect(resolve('provider=kraken')).toMatchObject({ provider: 'kraken' });
    });

    it('clamps a range that overlaps the priceable one', () => {
        expect(resolve('from=2005-01-01&to=2030-01-01')).toEqual({ fromTs: Date.UTC(2010, 7, 18), toTs: TODAY, provider: 'coinbase' });
    });

    it('refuses a range that lies wholly outside it, saying which side', () => {
        expect(error('from=2027-01-01&to=2028-01-01')).toContain("'from' (2027-01-01) is after today (2026-10-12, UTC)");
        expect(error('from=2026-10-13')).toContain('is after today');
        expect(error('to=2009-12-31')).toContain("'to' (2009-12-31) is before the price data begins (2010-08-18)");
        expect(error('from=2024-06-01&to=2024-01-01')).toBe("'from' (2024-06-01) must be on or before 'to' (2024-01-01).");
    });

    it('rejects garbage loudly', () => {
        expect(error('provider=binance')).toContain("Invalid 'provider'");
        expect(error('from=2023-02-30')).toContain("Invalid 'from'");
        expect(error('to=yesterday')).toContain("Invalid 'to'");
    });

    it('reads a real date in any four-digit year, and lets the range rules place it', () => {
        expect(parseIsoDayParam('2017-01-31')).toBe(Date.UTC(2017, 0, 31));
        expect(parseIsoDayParam('0500-01-01')).toBe(new Date('0500-01-01T00:00:00Z').getTime());
        expect(parseIsoDayParam('0050-01-01')).toBe(new Date('0050-01-01T00:00:00Z').getTime());
        expect(parseIsoDayParam('0500-02-30')).toBeNull();
        expect(parseIsoDayParam('2023-13-01')).toBeNull();
        expect(parseIsoDayParam('2017-1-31')).toBeNull();

        expect(resolve('from=0500-01-01&to=2010-08-20')).toEqual({
            fromTs: Date.UTC(2010, 7, 18), toTs: Date.UTC(2010, 7, 20), provider: 'coinbase',
        });
        expect(error('to=0500-01-01')).toContain("'to' (0500-01-01) is before the price data begins");
        expect(error('from=0500-02-30')).toContain("Invalid 'from'");
    });
});

// ── /api/v1/prices ────────────────────────────────────────────────────────────

describe('GET /api/v1/prices', () => {
    it('serves Coinbase daily closes by default, every row marked observed', async () => {
        install(healthy());
        const api = await coldApi();
        const res = await api('/api/v1/prices?from=2026-10-01&to=2026-10-12');

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            source: 'coinbase', served: 'coinbase', fallback: false, stale: false,
            from: '2026-10-01', to: '2026-10-12', count: 12, estimatedCount: 0, kinds: 'oooooooooooo',
            asOf: new Date(NOW).toISOString(), seriesFetchedAt: new Date(NOW).toISOString(),
        });
        const series = res.body.series as [number, number][];
        expect(series).toHaveLength(12);
        series.forEach(([ts, usd], i) => {
            expect(ts).toBe(Date.UTC(2026, 9, 1) + i * DAY_MS);
            expect(usd).toBe(coinbaseClose(ts));
        });
        expect(res.body.note).toContain('The price for 2026-10-12 is not a close');
        expect(res.headers.get('cache-control')).toBe('public, s-maxage=3600, stale-while-revalidate=300');
    });

    it('keeps every field an existing caller reads', async () => {
        install(healthy());
        const api = await coldApi();
        const res = await api('/api/v1/prices?from=2020-01-01&to=2020-12-31');
        for (const field of ['source', 'asOf', 'from', 'to', 'count', 'note', 'series']) {
            expect(res.body).toHaveProperty(field);
        }
        expect(res.body.count).toBe(366);
        expect((res.body.kinds as string)).toHaveLength(366);
        // The range ends long before the fetch day, so every row is a close.
        expect(res.body.note).not.toContain('is not a close');
    });

    it('marks the days between Kraken’s weekly closes as estimates', async () => {
        install(healthy());
        const api = await coldApi();
        const res = await api('/api/v1/prices?provider=kraken&from=2026-09-01&to=2026-10-12');
        const series = res.body.series as [number, number][];
        const kinds = res.body.kinds as string;

        expect(res.body).toMatchObject({ source: 'kraken', served: 'kraken', fallback: false });
        expect(kinds).toHaveLength(series.length);
        series.forEach(([ts], i) => {
            const isWednesday = new Date(ts).getUTCDay() === 3;
            const isToday = ts === TODAY;
            expect(kinds[i]).toBe(isWednesday || isToday ? 'o' : 'e');
            expect(ts % DAY_MS).toBe(0);
            if (i > 0) expect(ts - series[i - 1][0]).toBe(DAY_MS);
        });
        expect(res.body.estimatedCount).toBe(kinds.split('e').length - 1);
        expect(res.body.note).toContain(`${res.body.estimatedCount} of the ${series.length} rows in this response are straight-line estimates.`);
    });

    it('says so, and caches briefly, when the other exchange had to answer', async () => {
        install({ ...healthy(), coinbaseCandles: down });
        const api = await coldApi();
        const res = await api('/api/v1/prices?from=2026-09-01&to=2026-10-12');

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ source: 'coinbase', served: 'kraken', fallback: true, stale: false });
        expect(res.body.note).toMatch(/^Coinbase was unreachable; these prices are Kraken weekly closes with straight-line fills\./);
        expect(res.body.estimatedCount).toBeGreaterThan(0);
        expect(res.headers.get('cache-control')).toBe('public, s-maxage=300');
    });

    it('flags an earlier copy as stale, with the time it was fetched', async () => {
        const upstreams = healthy();
        install(upstreams);
        const api = await coldApi();
        await api('/api/v1/prices?from=2026-10-01');

        // Coinbase goes down. Two hours on, the copy in memory has expired,
        // and the server keeps it over switching exchanges.
        upstreams.coinbaseCandles = down;
        vi.setSystemTime(NOW + 2 * 3_600_000);
        const res = await api('/api/v1/prices?from=2026-10-01');
        expect(res.body).toMatchObject({
            source: 'coinbase', served: 'coinbase', fallback: false, stale: true, estimatedCount: 0,
            asOf: new Date(NOW + 2 * 3_600_000).toISOString(), seriesFetchedAt: new Date(NOW).toISOString(),
        });
        expect(res.body.note).toMatch(/^Coinbase could not be reached just now; these prices were fetched on 2026-10-12 at 04:10 UTC\./);
        expect(res.body.note).toContain('The price for 2026-10-12 is not a close: it is the latest Coinbase trade at 04:10 UTC');
        expect(res.headers.get('cache-control')).toBe('public, s-maxage=300');

        const backtest = await api('/api/v1/dca?startDate=2026-01-01');
        expect(backtest.body).toMatchObject({ served: 'coinbase', fallback: false, stale: true, seriesFetchedAt: new Date(NOW).toISOString() });
        expect(backtest.body.note).toMatch(/^Coinbase could not be reached just now/);
        expect(backtest.headers.get('cache-control')).toBe('public, s-maxage=300');
    });

    it('raises a from date centuries before the data to the first priced day', async () => {
        install(healthy());
        const api = await coldApi();
        const res = await api('/api/v1/prices?from=0500-01-01&to=2010-08-20');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ from: '2010-08-18', to: '2010-08-20', count: 3 });
    });

    it('answers 400, not 503, for a range in the future, without asking an exchange', async () => {
        install(healthy());
        const api = await coldApi();
        const res = await api('/api/v1/prices?from=2027-01-01&to=2028-01-01');
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('is after today');
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(calls).toHaveLength(0);
    });

    it('answers 503 when neither exchange can be reached', async () => {
        install({ ...healthy(), coinbaseCandles: down, krakenOhlc: down });
        const api = await coldApi();
        const res = await api('/api/v1/prices?from=2026-09-01');
        expect(res.status).toBe(503);
        expect(res.headers.get('cache-control')).toBe('no-store');
    });

    it('does not cache an empty 200 for a day the exchange has not priced yet', async () => {
        // The first moments of a UTC day: Coinbase has no candle for today.
        install({ ...healthy(), coinbaseCandles: (url) => json(coinbaseCandles(url, TODAY - DAY_MS)) });
        const api = await coldApi();
        const res = await api('/api/v1/prices?from=2026-10-12');
        expect(res.status).toBe(503);
        expect(res.body.error).toBe('No price for 2026-10-12 yet: the coinbase series currently ends 2026-10-11. Try again in a few minutes.');
        expect(res.headers.get('cache-control')).toBe('no-store');

        const throughYesterday = await api('/api/v1/prices?from=2026-10-10');
        expect(throughYesterday.body).toMatchObject({ to: '2026-10-12', count: 2 });
        expect(throughYesterday.body.note).not.toContain('is not a close');
    });

    it('returns exactly the documented fields', async () => {
        install(healthy());
        const api = await coldApi();
        const res = await api('/api/v1/prices?from=2026-10-01');
        expect(Object.keys(res.body)).toEqual([
            'source', 'served', 'fallback', 'stale', 'asOf', 'seriesFetchedAt', 'from', 'to', 'count',
            'estimatedCount', 'kinds', 'note', 'series',
        ]);
    });

    it('lets a browser on another origin read the provenance headers', async () => {
        install(healthy());
        const api = await coldApi();
        const res = await api('/api/v1/prices?from=2026-10-01');
        const exposed = res.headers.get('access-control-expose-headers') ?? '';
        for (const header of EXPOSED_HEADERS) expect(exposed).toContain(header);
        expect(exposed).toContain('X-Data-Note');
        expect(exposed).toContain('Content-Disposition');
        expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });
});

// ── /api/v1/prices.csv ────────────────────────────────────────────────────────

describe('GET /api/v1/prices.csv', () => {
    it('keeps the two-column body and puts the provenance in headers', async () => {
        install(healthy());
        const api = await coldApi();
        const res = await api('/api/v1/prices.csv?from=2026-10-10&to=2026-10-12');
        const lines = res.text.trimEnd().split('\n');

        expect(res.status).toBe(200);
        expect(lines[0]).toBe('date,usd');
        expect(lines).toHaveLength(4);
        expect(lines[1]).toBe(`2026-10-10,${coinbaseClose(Date.UTC(2026, 9, 10)).toFixed(2)}`);
        expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
        expect(res.headers.get('content-disposition')).toBe('attachment; filename="btc-usd-daily-coinbase-2026-10-10-2026-10-12.csv"');
        expect(res.headers.get('x-data-served')).toBe('coinbase');
        expect(res.headers.get('x-data-estimated-rows')).toBe('0');
        expect(res.headers.get('x-data-fetched-at')).toBe(new Date(NOW).toISOString());
        expect(res.headers.get('x-data-note')).toContain('not exchange closes');
        expect(res.headers.get('access-control-expose-headers')).toContain('X-Data-Note');
    });

    it('adds the kind column only when asked', async () => {
        install(healthy());
        const api = await coldApi();
        const res = await api('/api/v1/prices.csv?provider=kraken&from=2026-10-06&to=2026-10-09&kinds=1');
        const lines = res.text.trimEnd().split('\n');

        expect(lines[0]).toBe('date,usd,kind');
        // 2026-10-07 is a Wednesday: the one weekly close in the range.
        expect(lines.slice(1).map((line) => line.split(',')[2])).toEqual(['estimated', 'observed', 'estimated', 'estimated']);
        expect(res.headers.get('x-data-estimated-rows')).toBe('3');

        const plain = await api('/api/v1/prices.csv?provider=kraken&from=2026-10-06&to=2026-10-09&kinds=0');
        expect(plain.text.split('\n')[0]).toBe('date,usd');
        expect((await api('/api/v1/prices.csv?kinds=maybe')).status).toBe(400);
    });

    it('names the file after the exchange whose prices are in it', async () => {
        install({ ...healthy(), coinbaseCandles: down });
        const api = await coldApi();
        const res = await api('/api/v1/prices.csv?provider=coinbase&from=2026-10-01&to=2026-10-12');
        expect(res.headers.get('content-disposition')).toContain('btc-usd-daily-kraken-');
        expect(res.headers.get('x-data-served')).toBe('kraken');
        expect(res.headers.get('x-data-note')).toMatch(/^Coinbase was unreachable/);
        expect(res.headers.get('cache-control')).toBe('public, s-maxage=300');
    });
});

// ── /api/v1/dca ───────────────────────────────────────────────────────────────

describe('GET /api/v1/dca', () => {
    it('runs the calculator’s default plan when nothing is sent', async () => {
        install(healthy());
        const api = await coldApi();
        const res = await api('/api/v1/dca');
        const window = defaultPlanWindow(NOW);

        expect(res.status).toBe(200);
        expect(inputsOf(res)).toEqual({
            amountUsd: 50, frequency: 'weekly', startDate: window.startDate, endDate: window.endDate,
            feePercent: 0.5, provider: 'coinbase',
        });
        expect(res.body).toMatchObject({
            currency: 'USD', served: 'coinbase', fallback: false, stale: false,
            spotPriceUsd: SPOT, spotSource: 'coinbase', breakdownSampled: false,
            estimatedPrices: { purchases: 0, drawdownDays: 0 },
        });
        expect(res.body.purchaseCount).toBe(rowsOf(res).length);
        expect(res.body.totalInvested).toBe(50 * (res.body.purchaseCount as number));
        expect(res.headers.get('cache-control')).toBe('public, s-maxage=1800, stale-while-revalidate=300');
    });

    it('matches the engine run on the same series, and keeps every field an existing caller reads', async () => {
        install(healthy());
        const api = await coldApi();
        const res = await api('/api/v1/dca?amount=100&frequency=weekly&startDate=2020-01-01&endDate=2024-12-31&fee=0.5');

        const history: [number, number][] = [];
        for (let ts = Date.UTC(2019, 11, 18); ts <= TODAY; ts += DAY_MS) history.push([ts, coinbaseClose(ts)]);
        const expected = calculateDca(
            {
                amount: 100, frequency: 'weekly', startDate: new Date(Date.UTC(2020, 0, 1)), endDate: new Date(Date.UTC(2024, 11, 31)),
                feePercentage: 0.5, priceMode: 'api', manualPrice: 0,
            },
            history,
            SPOT,
            NOW,
        );

        expect(res.body.purchaseCount).toBe(261);
        expect(res.body.totalInvested).toBe(26_100);
        expect(res.body.btcAccumulated).toBeCloseTo(expected.btcAccumulated, 12);
        expect(res.body.currentValue).toBeCloseTo(expected.currentValue, 6);
        expect(res.body.xirrPercent).toBeCloseTo(expected.stats!.xirrPercent!, 8);
        expect(res.body.maxDrawdownPercent).toBeCloseTo(expected.stats!.maxDrawdownPercent!, 8);
        expect(res.body.feesPaid).toBeCloseTo(130.5, 9);
        expect(res.body.feePercentOfBuy).toBe(0.5);
        for (const field of [
            'inputs', 'asOf', 'currency', 'totalInvested', 'btcAccumulated', 'averageCost', 'currentValue', 'profit',
            'roiPercent', 'xirrPercent', 'maxDrawdownPercent', 'purchaseCount', 'spotPriceUsd', 'breakdownSampled',
            'breakdown', 'note',
        ]) {
            expect(res.body).toHaveProperty(field);
        }
        expect(rowsOf(res)[0]).toEqual({
            date: '2020-01-01T00:00:00.000Z',
            price: coinbaseClose(Date.UTC(2020, 0, 1)),
            invested: 100,
            totalInvested: 100,
            accumulated: 99.5 / coinbaseClose(Date.UTC(2020, 0, 1)),
            totalAccumulated: 99.5 / coinbaseClose(Date.UTC(2020, 0, 1)),
            portfolioValue: 99.5,
            fee: 0.5,
            priceKind: 'observed',
        });
    });

    it('answers 400 for a window that starts after today, and asks no exchange', async () => {
        install(healthy());
        const api = await coldApi();

        for (const query of ['startDate=2027-01-01&endDate=2028-01-01', 'startDate=2026-10-13&endDate=2026-12-31', 'startDate=2026-10-13']) {
            const res = await api(`/api/v1/dca?${query}`);
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/after today|on or before/);
            expect(res.headers.get('cache-control')).toBe('no-store');
        }
        const inverted = await api('/api/v1/dca?startDate=2024-06-01&endDate=2024-01-01');
        expect(inverted.status).toBe(400);
        const beforeData = await api('/api/v1/dca?endDate=2009-01-01');
        expect(beforeData.status).toBe(400);
        expect(beforeData.body.error).toContain('before the price data begins');
        expect(calls).toHaveLength(0);
    });

    it('cuts a future end date back to today and reports exactly the backtest to date', async () => {
        install(healthy());
        const api = await coldApi();
        const future = await api('/api/v1/dca?amount=100&startDate=2025-01-01&endDate=2030-12-31');
        const toDate = await api('/api/v1/dca?amount=100&startDate=2025-01-01&endDate=2026-10-12');

        expect(inputsOf(future)).toMatchObject({ endDate: '2026-10-12', endDateClamped: true, requestedEndDate: '2030-12-31' });
        expect(inputsOf(toDate)).not.toHaveProperty('endDateClamped');
        for (const field of ['totalInvested', 'btcAccumulated', 'currentValue', 'purchaseCount', 'xirrPercent', 'breakdown']) {
            expect(future.body[field]).toEqual(toDate.body[field]);
        }
        // 2025-01-01 is a Wednesday; the last buy on or before Monday 2026-10-12 is 2026-10-07.
        expect(future.body.purchaseCount).toBe(93);
        const rows = rowsOf(future);
        expect(rows[rows.length - 1].date).toBe('2026-10-07T00:00:00.000Z');
    });

    it('echoes the end date the caller sent, not the parser’s ceiling for it', async () => {
        install(healthy());
        const api = await coldApi();
        const res = await api('/api/v1/dca?startDate=2026-01-01&endDate=9999-12-31');
        expect(inputsOf(res)).toMatchObject({ endDate: '2026-10-12', endDateClamped: true, requestedEndDate: '9999-12-31' });
    });

    it('clamps the default start to the first priceable day, like an explicit one', async () => {
        install(healthy());
        const api = await coldApi();
        const byDefault = await api('/api/v1/dca?endDate=2012-01-01');
        const explicit = await api('/api/v1/dca?startDate=2007-01-01&endDate=2012-01-01');

        expect(inputsOf(byDefault).startDate).toBe('2010-08-18');
        expect(inputsOf(byDefault)).not.toHaveProperty('startDateClamped');
        expect(inputsOf(explicit)).toMatchObject({ startDate: '2010-08-18', startDateClamped: true, requestedStartDate: '2007-01-01' });
        expect(byDefault.body.purchaseCount).toBe(explicit.body.purchaseCount);
        expect(byDefault.body.totalInvested).toBe(explicit.body.totalInvested);
        expect(rowsOf(byDefault)[0].date).toBe('2010-08-18T00:00:00.000Z');
    });

    it('takes a flat fee per buy on top of the percentage', async () => {
        install(healthy());
        const api = await coldApi();
        const res = await api('/api/v1/dca?amount=50&fee=0.5&flat=2.99&startDate=2026-01-01');
        const rows = rowsOf(res);
        const buys = res.body.purchaseCount as number;

        expect(inputsOf(res)).toMatchObject({ feePercent: 0.5, flatFeeUsd: 2.99 });
        expect(rows[0].fee).toBeCloseTo(3.24, 12);
        expect(rows[0].accumulated).toBeCloseTo((50 - 3.24) / rows[0].price, 14);
        expect(res.body.totalInvested).toBe(50 * buys);
        expect(res.body.feesPaid).toBeCloseTo(3.24 * buys, 9);
        expect(res.body.feePercentOfBuy).toBeCloseTo(6.48, 9);

        const without = await api('/api/v1/dca?amount=50&fee=0.5&startDate=2026-01-01');
        expect(inputsOf(without)).not.toHaveProperty('flatFeeUsd');
        expect(rowsOf(without)[0].fee).toBeCloseTo(0.25, 12);
        expect(without.body.btcAccumulated as number).toBeGreaterThan(res.body.btcAccumulated as number);
    });

    it('returns exactly the documented fields', async () => {
        install(healthy());
        const api = await coldApi();
        const res = await api('/api/v1/dca?startDate=2026-01-01&startingBtc=0.1');
        expect(Object.keys(res.body)).toEqual([
            'inputs', 'asOf', 'currency', 'totalInvested', 'btcAccumulated', 'averageCost', 'currentValue', 'profit',
            'roiPercent', 'xirrPercent', 'maxDrawdownPercent', 'feesPaid', 'feePercentOfBuy', 'purchaseCount',
            'estimatedPrices', 'spotPriceUsd', 'spotSource', 'spotAsOf', 'served', 'fallback', 'stale',
            'seriesFetchedAt', 'breakdownSampled', 'breakdown', 'note',
        ]);
        const [stack, firstBuy] = rowsOf(res);
        expect(Object.keys(stack)).toEqual([
            'date', 'price', 'invested', 'totalInvested', 'accumulated', 'totalAccumulated', 'portfolioValue', 'fee',
            'priceKind', 'isStartingStack',
        ]);
        expect(Object.keys(firstBuy)).toEqual([
            'date', 'price', 'invested', 'totalInvested', 'accumulated', 'totalAccumulated', 'portfolioValue', 'fee',
            'priceKind',
        ]);
    });

    it('values a window that ended in the past at today’s price, and annualizes to today', async () => {
        install(healthy());
        const api = await coldApi();
        // 31 days long, but its first purchase is years old: there is an XIRR.
        const old = await api('/api/v1/dca?startDate=2020-01-01&endDate=2020-02-01');
        expect(old.body.xirrPercent).not.toBeNull();
        expect(old.body.currentValue).toBeCloseTo((old.body.btcAccumulated as number) * SPOT, 6);
        // Started 42 days ago: too young to annualize, however long it is planned to run.
        const young = await api('/api/v1/dca?startDate=2026-09-01&endDate=2030-01-01');
        expect(young.body.xirrPercent).toBeNull();
        expect(young.body.note).toContain('xirrPercent is null when the first purchase is less than 90 days old');
    });

    it('reports a flat fee that swallows the whole purchase as money spent and no bitcoin', async () => {
        install(healthy());
        const api = await coldApi();
        const res = await api('/api/v1/dca?amount=2&flat=2.99&startDate=2026-01-01');
        const buys = res.body.purchaseCount as number;
        expect(res.status).toBe(200);
        expect(buys).toBeGreaterThan(0);
        expect(res.body).toMatchObject({ totalInvested: 2 * buys, btcAccumulated: 0, currentValue: 0, roiPercent: -100, xirrPercent: null });
        expect(res.body.feesPaid).toBe(2 * buys);
        expect(res.body.feePercentOfBuy).toBe(100);
        expect(rowsOf(res).every((row) => row.fee === 2 && row.accumulated === 0)).toBe(true);
    });

    it('prices a buy dated today at the newest close, marked estimated, before the exchange has a price for today', async () => {
        install({ ...healthy(), coinbaseCandles: (url) => json(coinbaseCandles(url, TODAY - DAY_MS)) });
        const api = await coldApi();
        const res = await api('/api/v1/dca?startDate=2026-10-12');
        expect(res.status).toBe(200);
        expect(rowsOf(res)).toHaveLength(1);
        expect(rowsOf(res)[0]).toMatchObject({
            date: '2026-10-12T00:00:00.000Z', price: coinbaseClose(TODAY - DAY_MS), priceKind: 'estimated',
        });
        expect(res.body.estimatedPrices).toMatchObject({ purchases: 1 });
    });

    it('rejects what it cannot use instead of computing something else', async () => {
        install(healthy());
        const api = await coldApi();
        const bad: [string, RegExp][] = [
            ['amount=0', /'amount' must be a positive number/],
            ['amount=-5', /'amount'/],
            ['fee=51', /'fee' must be a percentage between 0 and 50/],
            ['flat=-1', /'flat' must be a flat fee per purchase in USD, between 0 and 1,000,000/],
            ['flat=2000000', /'flat'/],
            ['flat=abc', /'flat'/],
            ['esc=-5', /'esc'/],
            ['provider=binance', /'provider' must be coinbase or kraken/],
            ['startDate=2023-02-30', /'startDate' must be an ISO date/],
            ['startingCost=30000', /'startingCost' only makes sense/],
            // A blank is not a zero.
            ['fee=%20', /'fee' must be a percentage/],
            ['amount=%09', /'amount' must be a positive number/],
            ['flat=+', /'flat'/],
            ['startingBtc=%20', /'startingBtc'/],
            ['esc=%20', /'esc'/],
            // A calculator link for a plan this endpoint cannot run.
            ['amount=5000&currency=JPY', /'currency' must be USD or left out/],
            ['currency=usd', /'currency' must be USD or left out/],
            ['currency=', /'currency' must be USD or left out/],
            ['mode=manual&manualPrice=30000', /'mode' must be api or left out/],
            ['mode=', /'mode' must be api or left out/],
        ];
        for (const [query, message] of bad) {
            const res = await api(`/api/v1/dca?${query}`);
            expect(res.status, query).toBe(400);
            expect(res.body.error, query).toMatch(message);
        }
        expect(calls).toHaveLength(0);
    });

    it('runs a calculator link for a USD plan at market prices exactly as it runs the bare request', async () => {
        install(healthy());
        const api = await coldApi();
        const plan = 'amount=100&frequency=weekly&startDate=2026-01-01&endDate=2026-06-30&fee=0.5&provider=coinbase';
        const link = await api(`/api/v1/dca?${plan}&mode=api&currency=USD`);
        const bare = await api(`/api/v1/dca?${plan}`);

        expect(link.status).toBe(200);
        expect(inputsOf(link)).toEqual(inputsOf(bare));
        for (const field of ['totalInvested', 'btcAccumulated', 'currentValue', 'purchaseCount', 'breakdown']) {
            expect(link.body[field]).toEqual(bare.body[field]);
        }
        // Without mode=manual the calculator does not use a manual price either.
        expect((await api(`/api/v1/dca?${plan}&manualPrice=30000`)).body.btcAccumulated).toBe(bare.body.btcAccumulated);
    });

    it('still clamps the params it always clamped, and ignores ones it does not know', async () => {
        install(healthy());
        const api = await coldApi();
        const res = await api('/api/v1/dca?esc=500&startingBtc=30000000&startingCost=99999999999&startDate=2026-01-01&utm_source=x&_=123');
        expect(res.status).toBe(200);
        expect(inputsOf(res)).toMatchObject({ annualEscalationPercent: 200, startingBtc: 21_000_000, startingCostUsd: 1_000_000_000 });
        const stack = rowsOf(res)[0];
        expect(stack.isStartingStack).toBe(true);
        expect(stack.fee).toBe(0);
        // The caller stated the stack's cost, so its price is not a market price.
        expect(stack).not.toHaveProperty('priceKind');
        expect(res.body.purchaseCount).toBe(rowsOf(res).length - 1);
    });

    it('marks each purchase priced on a Kraken estimate', async () => {
        install(healthy());
        const api = await coldApi();
        // 2026-01-01 is a Thursday: every weekly buy lands between two weekly closes.
        const thursdays = await api('/api/v1/dca?provider=kraken&startDate=2026-01-01');
        expect(rowsOf(thursdays).every((row) => row.priceKind === 'estimated')).toBe(true);
        expect(thursdays.body.estimatedPrices).toMatchObject({ purchases: thursdays.body.purchaseCount });
        expect((thursdays.body.estimatedPrices as { drawdownDays: number }).drawdownDays).toBeGreaterThan(0);

        // 2025-12-31 is a Wednesday: every buy lands on a weekly close.
        const wednesdays = await api('/api/v1/dca?provider=kraken&startDate=2025-12-31');
        expect(rowsOf(wednesdays).every((row) => row.priceKind === 'observed')).toBe(true);
        expect(wednesdays.body.estimatedPrices).toMatchObject({ purchases: 0 });
        expect(wednesdays.body.note).toContain("Kraken's weekly closes");
    });

    it('prices a buy dated today at the same value the prices endpoint publishes for today', async () => {
        install(healthy());
        const api = await coldApi();
        for (const provider of ['coinbase', 'kraken']) {
            const prices = await api(`/api/v1/prices?provider=${provider}&from=2026-10-12`);
            const backtest = await api(`/api/v1/dca?provider=${provider}&startDate=2026-10-12`);
            const [[ts, usd]] = prices.body.series as [number, number][];
            expect(ts).toBe(TODAY);
            expect(rowsOf(backtest)).toHaveLength(1);
            expect(rowsOf(backtest)[0].price).toBe(usd);
            expect(rowsOf(backtest)[0].priceKind).toBe('observed');
        }
    });

    it('thins a long breakdown but counts every purchase', async () => {
        install(healthy());
        const api = await coldApi();
        const res = await api('/api/v1/dca?frequency=daily&startDate=2015-01-01&endDate=2024-12-31');
        const rows = rowsOf(res);
        expect(res.body.breakdownSampled).toBe(true);
        expect(res.body.purchaseCount).toBe(3653);
        expect(rows.length).toBeLessThanOrEqual(BREAKDOWN_CAP + 1);
        expect(rows[rows.length - 1].date).toBe('2024-12-31T00:00:00.000Z');
    });

    it('says which exchange priced the purchases when the requested one is down', async () => {
        install({ ...healthy(), coinbaseCandles: down });
        const api = await coldApi();
        const res = await api('/api/v1/dca?startDate=2026-01-01');
        expect(res.status).toBe(200);
        expect(inputsOf(res).provider).toBe('coinbase');
        expect(res.body).toMatchObject({ served: 'kraken', fallback: true });
        expect(res.body.note).toMatch(/^Coinbase was unreachable; these prices are Kraken weekly closes with straight-line fills\. All figures are USD\./);
        expect((res.body.note as string).split('Coinbase was unreachable')).toHaveLength(2);
        expect(res.headers.get('cache-control')).toBe('public, s-maxage=300');
    });

    it('values the stack at the newest daily price when no live quote is available', async () => {
        install({ ...healthy(), coinbaseTicker: down, krakenTicker: down });
        const api = await coldApi();
        // A window that ended years ago: the fallback valuation must still be today's price.
        const res = await api('/api/v1/dca?startDate=2020-01-01&endDate=2021-12-31');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ spotPriceUsd: null, spotSource: null, spotAsOf: null });
        expect(res.body.currentValue).toBeCloseTo((res.body.btcAccumulated as number) * coinbaseClose(TODAY), 6);
        expect(res.body.note).toContain('No live price was available');
        expect(res.headers.get('cache-control')).toBe('public, s-maxage=300');
    });

    it('uses the other exchange’s quote, and names it, when the requested one has none', async () => {
        install({ ...healthy(), coinbaseTicker: down });
        const api = await coldApi();
        const res = await api('/api/v1/dca?startDate=2026-01-01');
        expect(res.body).toMatchObject({ spotPriceUsd: 83_422.6, spotSource: 'kraken', served: 'coinbase', fallback: false });
        expect(res.body.note).toContain('live Kraken price');
    });

    it('answers 503 when neither exchange can be reached', async () => {
        install({ ...healthy(), coinbaseCandles: down, krakenOhlc: down });
        const api = await coldApi();
        const res = await api('/api/v1/dca');
        expect(res.status).toBe(503);
        expect(res.headers.get('cache-control')).toBe('no-store');
    });
});
