import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAY_MS, utcDayStart } from './dates';

/**
 * /api/health against a fake internet.
 *
 * The route's one job is to say what the providers are doing NOW, and three
 * caches could answer for them (the route's own, Next's Data Cache, the
 * in-memory series). So these pin the two properties that make it worth
 * polling: every check really asks its provider, and nothing is repeated more
 * often than its interval.
 */

const NOW = Date.UTC(2026, 9, 12, 4, 10);
const TODAY = utcDayStart(NOW);
const WEEK_S = 604_800;
const STATE_KEY = Symbol.for('btcdca.actions.state.v4');

interface Call {
    url: string;
    cache: RequestCache | undefined;
}

let calls: Call[] = [];
let down = new Set<string>();

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });
const text = (body: string): Response => new Response(body, { status: 200 });

function respond(url: URL): Response {
    if (down.has(url.host)) return json({ message: 'unavailable' }, 403);
    switch (url.host) {
        case 'api.exchange.coinbase.com': {
            if (!url.pathname.endsWith('/candles')) return json({ price: '83426.53' });
            const start = Date.parse(url.searchParams.get('start') ?? '');
            const end = Math.min(Date.parse(url.searchParams.get('end') ?? ''), TODAY);
            const rows: number[][] = [];
            for (let ts = start; ts <= end; ts += DAY_MS) rows.push([ts / 1000, 1, 1, 1, 50_000 + (ts / DAY_MS % 13) * 100, 1]);
            return json(rows.reverse());
        }
        case 'api.kraken.com': {
            if (!url.pathname.endsWith('/OHLC')) return json({ error: [], result: { XXBTZUSD: { c: ['83422.6', '1'], o: '83000' } } });
            const candles: unknown[][] = [];
            for (let open = Date.UTC(2013, 9, 3) / 1000; open * 1000 <= NOW; open += WEEK_S) candles.push([open, '0', '0', '0', '50000', '0', '1', 1]);
            return json({ error: [], result: { XXBTZUSD: candles, last: 0 } });
        }
        case 'query1.finance.yahoo.com':
            return json({ chart: { result: [{ timestamp: [NOW / 1000 - 86_400, NOW / 1000], indicators: { quote: [{ close: [100, 101] }] } }] } });
        case 'api.frankfurter.dev':
            return json(['EUR', 'GBP', 'CAD', 'AUD', 'JPY'].map((quote) => ({ date: '2026-10-09', base: 'USD', quote, rate: 1.1 })));
        case 'mempool.space':
            return url.pathname.endsWith('/height') ? text('970000') : json({ fastestFee: 5, halfHourFee: 3, hourFee: 2 });
        case 'api.alternative.me':
            return json({ data: [{ value: '50', value_classification: 'Neutral' }] });
        case 'api.coingecko.com':
            return json({ data: { total_market_cap: { usd: 3e12 }, market_cap_percentage: { btc: 55 } } });
        case 'blockchain.info':
            return text('1990000000000000');
        default:
            return json({}, 404);
    }
}

type Health = {
    status: string;
    checkedAt: string;
    summary: string;
    failing: string[];
    checks: { name: string; critical: boolean; status: string; checkedAt: string; detail?: string }[];
};

/** A cold server instance: fresh route module (its throttle state), fresh action caches. */
async function coldRoute(): Promise<() => Promise<{ status: number; cacheControl: string | null; body: Health }>> {
    delete (globalThis as Record<symbol, unknown>)[STATE_KEY];
    vi.resetModules();
    const { GET } = await import('@/app/api/health/route');
    return async () => {
        const res = await GET(new Request('https://btcdollarcostaverage.com/api/health'));
        return { status: res.status, cacheControl: res.headers.get('cache-control'), body: (await res.json()) as Health };
    };
}

beforeEach(() => {
    calls = [];
    down = new Set();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubEnv('FRED_API_KEY', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        calls.push({ url: url.href, cache: init?.cache });
        return respond(url);
    }));
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('/api/health', () => {
    it('reports every provider from a live request and stamps each check', async () => {
        const poll = await coldRoute();
        const { status, cacheControl, body } = await poll();

        expect(status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.failing).toEqual([]);
        expect(body.checkedAt).toBe(new Date(NOW).toISOString());
        expect(body.checks.map((c) => c.name)).toEqual([
            'coinbase-history', 'coinbase-spot', 'kraken-history', 'kraken-spot',
            'yahoo-sp500', 'frankfurter-fx', 'mempool-fees', 'fear-greed', 'block-height',
            'coingecko-dominance', 'blockchain-supply', 'fred-cpi',
        ]);
        for (const check of body.checks) expect(check.checkedAt).toBe(new Date(NOW).toISOString());
        expect(body.checks.find((c) => c.name === 'fred-cpi')?.status).toBe('unconfigured');
        expect(body.summary).toBe('11/11 providers ok');
        // Held at the CDN for a minute at most, and never served stale after that.
        expect(cacheControl).toBe('public, max-age=0, s-maxage=60');

        // Nothing was answered from Next's Data Cache, except Coinbase's
        // finished chunks, which cannot have changed.
        const cached = calls.filter((c) => c.cache !== 'no-store');
        expect(cached.every((c) => c.url.includes('/candles'))).toBe(true);
        expect(cached).toHaveLength(13);
        expect(calls.filter((c) => c.url.includes('/candles') && c.cache === 'no-store')).toHaveLength(1);
    });

    it('answers 503, uncached, when a critical provider is down, and says which', async () => {
        down.add('api.exchange.coinbase.com');
        const poll = await coldRoute();
        const { status, cacheControl, body } = await poll();

        expect(status).toBe(503);
        expect(cacheControl).toBe('no-store');
        expect(body.status).toBe('down');
        expect(body.failing).toEqual(['coinbase-history', 'coinbase-spot']);
        // Kraken being up must not paper over it, as the visitor-facing fallback would.
        expect(body.checks.find((c) => c.name === 'kraken-history')?.status).toBe('ok');
        expect(body.checks.find((c) => c.name === 'coinbase-history')?.detail).toBeTruthy();
    });

    it('stays 200 but degraded when only an optional provider is down', async () => {
        down.add('api.alternative.me');
        const poll = await coldRoute();
        const { status, body } = await poll();
        expect(status).toBe(200);
        expect(body.status).toBe('degraded');
        expect(body.failing).toEqual(['fear-greed']);
    });

    it('refuses a query string without asking any provider', async () => {
        delete (globalThis as Record<symbol, unknown>)[STATE_KEY];
        vi.resetModules();
        const { GET } = await import('@/app/api/health/route');
        const res = await GET(new Request('https://btcdollarcostaverage.com/api/health?bust=1'));
        expect(res.status).toBe(400);
        expect(calls).toEqual([]);
    });

    it('does not let a caller hammer the providers by polling', async () => {
        const poll = await coldRoute();
        const first = await poll();
        const afterFirst = calls.length;

        vi.setSystemTime(NOW + 20_000);
        const second = await poll();
        expect(calls.length).toBe(afterFirst);
        // The repeat is labelled as what it is: the response is new, the checks are not.
        expect(second.body.checkedAt).toBe(new Date(NOW + 20_000).toISOString());
        expect(second.body.checks[0].checkedAt).toBe(first.body.checks[0].checkedAt);

        // A minute on, the critical checks run again; the optional ones wait ten.
        vi.setSystemTime(NOW + 61_000);
        const third = await poll();
        const rerun = calls.slice(afterFirst).map((c) => new URL(c.url).host);
        expect(new Set(rerun)).toEqual(new Set(['api.exchange.coinbase.com', 'api.kraken.com']));
        expect(third.body.checks.find((c) => c.name === 'kraken-spot')?.checkedAt).toBe(new Date(NOW + 61_000).toISOString());
        expect(third.body.checks.find((c) => c.name === 'mempool-fees')?.checkedAt).toBe(new Date(NOW).toISOString());

        vi.setSystemTime(NOW + 11 * 60_000);
        const beforeFourth = calls.length;
        await poll();
        expect(calls.slice(beforeFourth).some((c) => c.url.includes('mempool.space'))).toBe(true);
    });

    it('sees an outage on the next run, and a recovery within a minute', async () => {
        const poll = await coldRoute();
        expect((await poll()).status).toBe(200);

        // The in-memory series from the first poll must not answer for the exchange.
        down.add('api.kraken.com');
        vi.setSystemTime(NOW + 61_000);
        const during = await poll();
        expect(during.status).toBe(503);
        expect(during.body.failing).toEqual(['kraken-history', 'kraken-spot']);

        down.delete('api.kraken.com');
        vi.setSystemTime(NOW + 122_000);
        expect((await poll()).body.status).toBe('ok');
    });

    it('re-runs a failing optional check every minute, not every ten', async () => {
        down.add('mempool.space');
        const poll = await coldRoute();
        expect((await poll()).body.failing).toEqual(['mempool-fees', 'block-height']);

        down.delete('mempool.space');
        vi.setSystemTime(NOW + 61_000);
        expect((await poll()).body.status).toBe('ok');
    });
});
