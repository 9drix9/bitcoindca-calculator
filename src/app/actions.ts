'use server';

import {
    DEFAULT_PRICE_REVALIDATE,
    HISTORY_REVALIDATE,
    SEALED_HISTORY_REVALIDATE,
    normalizeRevalidate,
} from '@/utils/revalidate';
import {
    UpstreamHttpError,
    UpstreamPayloadError,
    fetchWithTimeout,
    isLiveProbe,
    maxAcceptableAgeMs,
    responseTime,
    upstreamJson,
    withDeadline,
} from '@/utils/upstream';
import { expireRenderSoon } from '@/utils/isr';
import {
    PriceCoverageError,
    assertCoinbaseChunkCovered,
    assertProviderCoverage,
    buildDailySeries,
    coinbaseChunkPlan,
    countPriceKinds,
    krakenWeeklyAnchors,
    mergeWithSnapshot,
    parseCoinbaseCandles,
    sliceDailySeries,
    type CoinbaseChunk,
    type DailySeries,
    type PriceHistoryResult,
    type PricePair,
    type SpotQuote,
} from '@/utils/priceSeries';
import {
    bucketDurationDays,
    summariseOutcomes,
    toDailyPrices,
    walkStartDates,
    type OutcomeRangeResult,
} from '@/utils/datasets';
import { DAY_MS, defaultPlanWindow, utcDayIndex, utcDayStart } from '@/utils/dates';
import { DEFAULT_PLAN } from '@/data/planDefaults';
import {
    DEFAULT_PRICE_PROVIDER,
    PRICE_ERAS,
    fallbackProviderFor,
    isPriceEra,
    type PriceEra,
    type PriceProvider,
} from '@/data/priceSources';
import {
    FX_FALLBACK_SNAPSHOT,
    FX_QUOTE_CODES,
    type FxQuoteCode,
    type FxSnapshot,
} from '@/data/currencies';
import {
    LIVE_LIFETIME_SECONDS,
    liveFigureMaxAgeMs,
    type BitcoinDominance,
    type FearGreed,
    type HashRateDifficulty,
    type LightningStats,
    type LiveFigure,
    type LiveSidebar,
    type MempoolFees,
    type PurchasingPower,
    type RecentBlock,
    type TickerQuote,
} from '@/app/api/live/contract';
import type { Frequency } from '@/types';

// Every exported function in this file is a PUBLIC HTTP endpoint: anyone can
// call it with any arguments. So nothing here takes a "skip the cache" flag,
// every argument is validated before it reaches a URL or a cache key, and the
// work a caller can trigger is bounded by the caches and cool-offs below.

const MINUTE_MS = 60_000;
const SERIES_TTL_MS = 60 * MINUTE_MS;
const MAX_CACHE_ENTRIES = 50;

class LRUCache {
    private cache = new Map<string, { timestamp: number; data: [number, number][] }>();
    private maxSize: number;

    constructor(maxSize: number) {
        this.maxSize = maxSize;
    }

    get(key: string) {
        const entry = this.cache.get(key);
        if (!entry) return undefined;
        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry;
    }

    set(key: string, value: { timestamp: number; data: [number, number][] }) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Delete oldest (first) entry
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }
}

interface LoadedSeries {
    series: DailySeries;
    /**
     * ms epoch the provider's response was fetched. Not when it was read: a
     * response the Data Cache has held for an hour makes a series an hour old.
     */
    fetchedAt: number;
}

interface StartDateWalkEntry {
    builtAt: number;
    multiples: Float32Array;
    averageCosts: Float32Array;
    spanStart: number;
    spanEnd: number;
    spanDays: number;
    estimatedDays: number;
}

interface ActionsState {
    /** Full bitcoin history per provider; callers get a slice. */
    series: Map<PriceProvider, LoadedSeries>;
    /** Fetches in flight, so concurrent callers share one. */
    inflight: Map<string, Promise<LoadedSeries>>;
    /** Providers that just failed and are not asked again until `until`. */
    cooldown: Map<PriceProvider, { until: number; reason: string }>;
    /** Comparison series (S&P 500, gold, CPI). */
    comparison: LRUCache;
    walks: Map<string, StartDateWalkEntry>;
    fx: { fetchedAt: number; snapshot: FxSnapshot } | null;
    /** Every other upstream that just failed, by name, and when it may be asked again (see coolingOff). */
    retryAt: Record<string, number>;
    /** The most recently dated Lightning row seen (see loadLightningStats). */
    lightning: LightningStats | null;
}

/**
 * All in-memory state, kept on globalThis.
 *
 * Next compiles this module once per bundle layer: the copy a server component
 * calls and the copy the browser reaches through a server action are separate
 * module instances, and module-level caches would exist once in each. One
 * object on globalThis is shared by every copy in the process.
 *
 * The key carries a version: bump it when the shape of a cached value changes,
 * so a long-lived process cannot keep serving the old shape.
 */
const STATE_KEY = Symbol.for('btcdca.actions.state.v4');
type GlobalWithState = typeof globalThis & { [STATE_KEY]?: ActionsState };
const state: ActionsState = ((globalThis as GlobalWithState)[STATE_KEY] ??= {
    series: new Map(),
    inflight: new Map(),
    cooldown: new Map(),
    comparison: new LRUCache(MAX_CACHE_ENTRIES),
    walks: new Map(),
    fx: null,
    retryAt: {},
    lightning: null,
});

/**
 * Coerce an untrusted `provider` argument to a known value.
 *
 * A TypeScript union is erased at runtime, and `provider` picks both the cache
 * key and the fetch branch. Normalising once at every entry point means the
 * two can never disagree about an unknown string, which is what would let a
 * crafted call write one exchange's series into the other's slot. Anything
 * that is not exactly 'kraken' or 'coinbase' gets the default.
 */
const normalizeProvider = (provider: unknown): PriceProvider =>
    provider === 'kraken' ? 'kraken' : provider === 'coinbase' ? 'coinbase' : DEFAULT_PRICE_PROVIDER;

// ── Bitcoin price history ─────────────────────────────────────────────────────
//
// Both providers are fetched over their full range and cached provider-wide;
// callers get a slice, so no caller prices a date from a series that was
// fetched for someone else's window and does not reach it.

/** One request to an exchange's history endpoint. A healthy one answers in well under a second. */
const HISTORY_FETCH_TIMEOUT_MS = 8_000;
/** The whole of one provider's history, retries included, before the other provider is tried. */
const PROVIDER_DEADLINE_MS = 12_000;
/**
 * How long a provider that just failed is left alone, so a request made during
 * an outage falls back at once instead of waiting out the timeout again.
 */
const PROVIDER_COOLDOWN_MS = 30_000;
/** Oldest in-memory series worth serving when both providers are down. */
const STALE_SERVE_MAX_MS = 24 * 60 * MINUTE_MS;

/**
 * The same cool-off for every other upstream: the spot price and the ticker,
 * the exchange rates, the S&P 500, gold and CPI series, the sidebar's figures.
 *
 * A failed request is never cached, by Next or here. Without this, every page
 * load, card and poll during an outage asks the failing provider again and
 * waits out its timeout: slow for the visitor and, against a provider that is
 * rate-limiting this server, the surest way to stay rate-limited. During the
 * cool-off each caller gives its answer for "unavailable" (the other exchange,
 * the last copy, null) straight away.
 *
 * A live probe is never held back: /api/health exists to ask.
 */
const coolingOff = (name: string): boolean => !isLiveProbe() && Date.now() < (state.retryAt[name] ?? 0);
const startCoolOff = (name: string): void => {
    state.retryAt[name] = Date.now() + PROVIDER_COOLDOWN_MS;
};
const endCoolOff = (name: string): void => {
    delete state.retryAt[name];
};

const EXCHANGE_HEADERS = { 'User-Agent': 'BitcoinDcaBot/1.0' };
const KRAKEN_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; BitcoinDcaBot/1.0)' };
/**
 * Both exchanges ignore a query parameter they do not know (checked
 * 2026-10-12), which is what lets a too-old or broken cached response be
 * refetched under a fresh cache key. See utils/upstream.ts.
 */
const EXCHANGE_BUST_PARAM = 't';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The bundled blockchain.info rows. Imported lazily: 48 KB that only the history path needs. */
async function loadSnapshot(): Promise<PricePair[]> {
    const { BTC_HISTORICAL_DAILY } = await import('@/data/btcHistorical');
    return BTC_HISTORICAL_DAILY;
}

/**
 * Run a fetch-and-validate step, and if what came back failed validation, run
 * it once more around the cache.
 *
 * Next's Data Cache stores any 200 response, including one whose body is
 * empty, cut short or not JSON, and then answers with it until it expires.
 * Throwing does not evict it, so without the second attempt one bad response
 * would keep that exchange out of use until the entry expired: an hour, or a
 * day on the daily pages.
 */
async function withCacheBypassRetry<T>(attempt: (retry: boolean) => Promise<T>): Promise<T> {
    try {
        return await attempt(false);
    } catch (error) {
        if (!(error instanceof PriceCoverageError || error instanceof UpstreamPayloadError)) throw error;
        return attempt(true);
    }
}

async function fetchKrakenSeries(revalidate: number): Promise<LoadedSeries> {
    const snapshot = await loadSnapshot();
    const snapshotEndTs = snapshot[snapshot.length - 1][0];
    const url = 'https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080'; // weekly

    return withCacheBypassRetry(async (retry) => {
        const { json, fetchedAt } = await upstreamJson(url, {
            headers: KRAKEN_HEADERS,
            revalidate,
            timeoutMs: HISTORY_FETCH_TIMEOUT_MS,
            bustParam: EXCHANGE_BUST_PARAM,
            retry,
        });

        const envelope = json as { error?: unknown; result?: Record<string, unknown> } | null;
        if (envelope && Array.isArray(envelope.error) && envelope.error.length > 0) {
            throw new PriceCoverageError(`Kraken API error: ${envelope.error.join(', ')}`);
        }
        // Object.keys(undefined) throws a bare TypeError; when Kraken answers with
        // an envelope that has no `result` we want the named error so the provider
        // fallback below logs something meaningful.
        const result = envelope?.result;
        if (!result || typeof result !== 'object') throw new PriceCoverageError('Invalid data format from Kraken');
        const pairKey = Object.keys(result).find((k) => k !== 'last');
        if (!pairKey || !Array.isArray(result[pairKey])) throw new PriceCoverageError('Invalid data format from Kraken');

        // A payload fetched before today's UTC midnight cannot make today's
        // series: its open week is stamped yesterday, so there is no row for
        // today and yesterday's row is a price from before its close. The Data
        // Cache hands one over for up to an hour after midnight (a day, on the
        // daily pages), because this URL never changes. Same cure as a bad
        // payload: once more around the cache. Not on the retry itself, so an
        // exchange whose clock runs a second behind ours is still believed.
        if (!retry && utcDayIndex(fetchedAt) < utcDayIndex(Date.now())) {
            throw new PriceCoverageError('Kraken payload was fetched before today (UTC)');
        }

        // The still-open candle is stamped at the moment the payload was
        // FETCHED, not at the moment it is read: read from a cache an hour
        // later, "now" would date an hour-old price as current.
        const anchors = krakenWeeklyAnchors(result[pairKey], fetchedAt);
        const merged = mergeWithSnapshot(snapshot, anchors);
        // Kraken returns only its 720 most recent candles (its docs, checked
        // 2026-10-12). At weekly size that window reaches back to the bundled
        // snapshot until about May 2029; after that this check fails, rightly,
        // because the weeks between the two could only be invented. Extending
        // the snapshot is what keeps Kraken usable past then.
        assertProviderCoverage('kraken', merged.slice(snapshot.length), snapshotEndTs, Date.now());
        return { series: buildDailySeries(merged), fetchedAt };
    });
}

async function fetchCoinbaseSeries(revalidate: number): Promise<LoadedSeries> {
    const snapshot = await loadSnapshot();
    const snapshotEndTs = snapshot[snapshot.length - 1][0];
    const now = Date.now();
    // Coinbase's first BTC-USD daily candle is 2015-07-20, the day after the
    // snapshot ends, so the crawl starts there. Granularity 86400 = one candle
    // per UTC day, at most 300 per request: about fourteen requests today.
    // The open chunk's `end` is rounded up to the cache lifetime (never under
    // an hour) so its URL repeats within that window and the Data Cache can hit.
    const plan = coinbaseChunkPlan(snapshotEndTs + DAY_MS, now, Math.max(revalidate, 3600) * 1000);

    const requestChunk = async (chunk: CoinbaseChunk, retry: boolean): Promise<{ json: unknown; fetchedAt: number }> => {
        const url = 'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400'
            + `&start=${new Date(chunk.startTs).toISOString()}&end=${new Date(chunk.endTs).toISOString()}`;
        // Coinbase rate-limits hard, and a static build fans out across many
        // workers at once. Without a backoff the whole Coinbase path 429s and
        // degrades to Kraken, whose series is interpolated from WEEKLY closes.
        // The jitter keeps those workers from all retrying on the same tick.
        let lastError: unknown;
        for (let attempt = 0; attempt < 4; attempt++) {
            if (attempt > 0) await sleep(400 * 2 ** (attempt - 1) + Math.random() * 200);
            try {
                return await upstreamJson(url, {
                    headers: EXCHANGE_HEADERS,
                    // A sealed chunk never changes, so it is kept for a week
                    // (and reused by a live probe) while the open one follows
                    // the caller's lifetime. So does a retry: if the second
                    // answer is bad too, it must not be the one kept a week.
                    revalidate: chunk.sealed && !retry ? Math.max(revalidate, SEALED_HISTORY_REVALIDATE) : revalidate,
                    immutable: chunk.sealed,
                    timeoutMs: HISTORY_FETCH_TIMEOUT_MS,
                    bustParam: EXCHANGE_BUST_PARAM,
                    retry,
                });
            } catch (error) {
                lastError = error;
                // Only 429 and 5xx are worth retrying; a 400 will never succeed,
                // and a timeout already cost the visitor eight seconds.
                const retryable = error instanceof UpstreamHttpError && (error.status === 429 || error.status >= 500);
                if (!retryable) throw error;
            }
        }
        // A dropped chunk must fail the whole fetch: a hole of 299 days would
        // otherwise be straight-lined across and served as history.
        throw lastError;
    };

    const fetchChunk = (chunk: CoinbaseChunk): Promise<{ points: PricePair[]; fetchedAt: number }> =>
        withCacheBypassRetry(async (retry) => {
            const { json, fetchedAt } = await requestChunk(chunk, retry);
            const points = parseCoinbaseCandles(json, chunk);
            assertCoinbaseChunkCovered(points, chunk, now);
            return { points, fetchedAt };
        });

    // Coinbase limits public endpoints to 10 requests a second per IP, with
    // bursts to 15 (its docs, checked 2026-10-12). Three at a time puts a cold
    // crawl of fourteen right at that allowance, which is why a 429 above is
    // retried, not treated as failure. In normal running thirteen of the
    // fourteen come from the cache.
    const CONCURRENCY = 3;
    const points: PricePair[] = [];
    // The series is as old as its open chunk: the sealed ones cannot age.
    let fetchedAt = now;
    for (let i = 0; i < plan.length; i += CONCURRENCY) {
        const chunks = plan.slice(i, i + CONCURRENCY);
        const batch = await Promise.all(chunks.map(fetchChunk));
        batch.forEach((result, j) => {
            points.push(...result.points);
            if (!chunks[j].sealed) fetchedAt = Math.min(fetchedAt, result.fetchedAt);
        });
    }

    assertProviderCoverage('coinbase', points, snapshotEndTs, now);
    return { series: buildDailySeries(mergeWithSnapshot(snapshot, points)), fetchedAt };
}

/**
 * Whether a series already fetched is still good enough for this caller.
 *
 * Its age is counted from when the exchange's response was fetched, not from
 * when the series was put in memory, and the limit is the caller's own cache
 * lifetime (an hour unless it asked for longer). The daily pages ask for 24
 * hours and share this memory with the calculator, which must not be handed
 * a response they read from a 20-hour-old cache entry as an hour-fresh series.
 *
 * Never across a UTC midnight, for anyone: the row that was "today, so far"
 * is by then a finished day holding a price from before its close.
 */
const isCurrent = (loaded: LoadedSeries, now: number, revalidate: number): boolean =>
    now - loaded.fetchedAt < Math.max(SERIES_TTL_MS, revalidate * 1000)
    && utcDayIndex(now) === utcDayIndex(loaded.fetchedAt);

/**
 * Fetch one provider's full series, sharing the request with anyone already
 * waiting for it: a cold instance can take several requests before the first
 * one fills the cache, and each would start the same ~14-request Coinbase
 * crawl and rate-limit the others out.
 *
 * The result is written to the in-memory cache by the fetch itself, not by
 * whoever awaited it: a caller that gave up at its deadline still leaves the
 * next caller a finished series.
 */
function loadProviderSeries(provider: PriceProvider, revalidate: number): Promise<LoadedSeries> {
    // A live probe must not be handed a cached-path fetch that happens to be in flight.
    const key = `${isLiveProbe() ? 'probe:' : ''}${provider}`;
    const start = (): Promise<LoadedSeries> => {
        const run = (async (): Promise<LoadedSeries> => {
            const loaded = provider === 'coinbase'
                ? await fetchCoinbaseSeries(revalidate)
                : await fetchKrakenSeries(revalidate);
            const held = state.series.get(provider);
            if (!held || held.fetchedAt <= loaded.fetchedAt) state.series.set(provider, loaded);
            // utils/upstream refetches an answer older than this, and when the
            // refetch fails it hands the old answer back with its true age.
            // That is the exchange not answering: prices from hours ago (for
            // Kraken, whose URL never changes, up to three days) are not
            // current. Thrown after the series is put in memory, so the
            // callers that may serve a copy find it there and say what it is.
            const ageMs = Date.now() - loaded.fetchedAt;
            if (ageMs > maxAcceptableAgeMs(revalidate)) {
                throw new Error(`${provider} history could only be read from a copy ${Math.round(ageMs / MINUTE_MS)} minutes old`);
            }
            state.cooldown.delete(provider);
            return loaded;
        })().finally(() => state.inflight.delete(key));
        state.inflight.set(key, run);
        return run;
    };

    const inFlight = state.inflight.get(key);
    if (!inFlight) return start();
    // A fetch someone else started was made with THEIR cache lifetime: a daily
    // page accepts an open chunk the Data Cache has held since this morning.
    // So what a joined fetch brings back is judged like a series from memory
    // (see isCurrent), and when it is too old for this caller the series is
    // fetched again, together with anyone else in the same position. Once
    // only: the caller keeps what that second fetch returns.
    return inFlight.then((loaded) => (
        isCurrent(loaded, Date.now(), revalidate) ? loaded : state.inflight.get(key) ?? start()
    ));
}

class ProviderCoolingDown extends Error {
    constructor(provider: PriceProvider, reason: string) {
        super(`${provider} skipped, it failed moments ago: ${reason}`);
        this.name = 'ProviderCoolingDown';
    }
}

/** One provider's series, from memory or the network. Throws; never falls back. */
async function getProviderSeries(provider: PriceProvider, revalidate: number): Promise<LoadedSeries> {
    const now = Date.now();
    const cached = state.series.get(provider);
    if (cached && isCurrent(cached, now, revalidate)) return cached;

    const cooling = state.cooldown.get(provider);
    if (cooling && now < cooling.until) throw new ProviderCoolingDown(provider, cooling.reason);

    try {
        return await withDeadline(loadProviderSeries(provider, revalidate), PROVIDER_DEADLINE_MS, `${provider} history`);
    } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown error';
        state.cooldown.set(provider, { until: Date.now() + PROVIDER_COOLDOWN_MS, reason });
        throw error;
    }
}

const logProviderFailure = (context: string, error: unknown): void => {
    // A provider in its cool-off was already logged when it failed.
    if (!(error instanceof ProviderCoolingDown)) console.error(context, error);
};

/**
 * The requested provider's series; failing that, the copy of it fetched
 * earlier today; failing that, the other provider's; failing that, whatever is
 * still in memory. The caller is always told which.
 */
async function resolveSeries(
    requested: PriceProvider,
    revalidate: number,
): Promise<{ loaded: LoadedSeries; served: PriceProvider; stale: boolean }> {
    try {
        return { loaded: await getProviderSeries(requested, revalidate), served: requested, stale: false };
    } catch (error) {
        const fallback = fallbackProviderFor(requested);
        logProviderFailure(`[price history] ${requested} failed:`, error);
        // Whatever is rendered from here on is not the page at its best, so a
        // static page built on it must not be kept for its usual 24 hours.
        await expireRenderSoon();

        // A copy fetched earlier today has every finished day's final price;
        // only today's row has aged, and valuations use the spot price for
        // that. Switching exchanges instead would swap a day of real closes
        // for Kraken's straight lines (or change which exchange a visitor who
        // chose Kraken is looking at) over an outage that is usually minutes.
        const now = Date.now();
        const earlier = state.series.get(requested);
        if (earlier && utcDayIndex(earlier.fetchedAt) === utcDayIndex(now)) {
            return { loaded: earlier, served: requested, stale: true };
        }

        try {
            return { loaded: await getProviderSeries(fallback, revalidate), served: fallback, stale: false };
        } catch (fallbackError) {
            logProviderFailure(`[price history] fallback ${fallback} also failed:`, fallbackError);
            // Expired entries are never deleted. During a short dual outage a
            // series that is a few hours old, labelled as such, is more use
            // than an error page.
            for (const provider of [requested, fallback]) {
                const old = state.series.get(provider);
                if (old && now - old.fetchedAt < STALE_SERVE_MAX_MS) return { loaded: old, served: provider, stale: true };
            }
            throw fallbackError;
        }
    }
}

/**
 * Bitcoin's daily USD price over a window, with provenance.
 *
 * `data` runs from 14 days before `from` (so the first purchase always has a
 * last-known price) to `to`. `kinds` marks each row observed or estimated;
 * `servedProvider`, `fallback` and `stale` say whose series it is. See
 * PriceHistoryResult.
 *
 * Throws only when neither exchange can be reached and nothing usable is left
 * in memory. A window outside the series resolves normally with empty `data`.
 */
export async function getBitcoinPriceHistoryWithMeta(
    from: number,
    to: number,
    providerArg: PriceProvider = DEFAULT_PRICE_PROVIDER,
    revalidateArg: number = HISTORY_REVALIDATE,
): Promise<PriceHistoryResult> {
    // Untrusted input — see normalizeProvider. Everything below uses `requested`.
    const requested = normalizeProvider(providerArg);
    const revalidate = normalizeRevalidate(revalidateArg, HISTORY_REVALIDATE);
    const { loaded, served, stale } = await resolveSeries(requested, revalidate);

    const full = loaded.series;
    const validWindow = typeof from === 'number' && typeof to === 'number' && Number.isFinite(from) && Number.isFinite(to);
    const window: DailySeries = validWindow ? sliceDailySeries(full, from, to, 14) : { data: [], kinds: '' };
    return {
        data: window.data,
        kinds: window.kinds,
        requestedProvider: requested,
        servedProvider: served,
        fallback: served !== requested,
        stale,
        fetchedAt: loaded.fetchedAt,
        seriesStart: full.data[0][0],
        seriesEnd: full.data[full.data.length - 1][0],
    };
}

/** The rows of getBitcoinPriceHistoryWithMeta on their own, for callers that only need prices. */
export async function getBitcoinPriceHistory(
    from: number,
    to: number,
    providerArg: PriceProvider = DEFAULT_PRICE_PROVIDER,
    revalidateArg: number = HISTORY_REVALIDATE,
): Promise<[number, number][]> {
    return (await getBitcoinPriceHistoryWithMeta(from, to, providerArg, revalidateArg)).data;
}

/**
 * Provider-specific history check for /api/health. The visitor-facing read
 * falls back to the other exchange, which would keep 'coinbase-history' green
 * for as long as Kraken was up. This path never falls back and never serves a
 * cooled-off or stale series.
 *
 * Called inside runAsLiveProbe (as the health route does) it asks the exchange
 * directly. Called any other way it is the ordinary read every visitor gets,
 * minus the fallback: from memory while that is current, and not at all while
 * the provider is in its cool-off, so repeating the call during an outage does
 * not send the exchange a fresh crawl each time.
 */
export async function probeProviderHistory(providerArg: PriceProvider): Promise<[number, number][]> {
    const provider = normalizeProvider(providerArg);
    if (!isLiveProbe()) return (await getProviderSeries(provider, HISTORY_REVALIDATE)).series.data;
    const loaded = await withDeadline(
        loadProviderSeries(provider, HISTORY_REVALIDATE),
        PROVIDER_DEADLINE_MS,
        `${provider} history`,
    );
    return loaded.series.data;
}

// ── Comparison series (S&P 500, gold, CPI) ────────────────────────────────────
//
// Fetched ONCE over the full usable range and sliced per request. A cache keyed
// on the window would mint a key for every date range a visitor touched and
// never hit: every keystroke would reach Yahoo.
const ASSET_HISTORY_START = Date.UTC(2009, 0, 1);

/**
 * The only symbols this site charts. `symbol` arrives from a public endpoint,
 * goes into an outbound URL and becomes a cache key: unbounded, a caller could
 * evict the real series from the 50-entry LRU at will and use the action as a
 * generic Yahoo Finance proxy.
 */
const ALLOWED_ASSET_SYMBOLS = new Set(['^SP500TR', '^GSPC', 'GC=F']);

/**
 * A window with no bars in it is reported as "no data" (null), not as an empty
 * series. An empty array is truthy, and a comparison run on one prints
 * "S&P 500 $0 +0.0%" for a plan that starts in the future.
 */
const sliceOrNull = (data: [number, number][], from: number, to: number, leadInDays: number): [number, number][] | null => {
    const rows = data.filter(([ts]) => ts >= from - leadInDays * DAY_MS && ts <= to);
    return rows.length > 0 ? rows : null;
};

/**
 * Read one comparison series from memory unless it has expired or a live probe
 * is asking. A probe also never gets the expired copy back on failure: for a
 * visitor an old series beats a missing overlay, for a health check it is
 * exactly the outage it exists to report.
 */
const readComparison = (key: string, ttlMs: number): { fresh: [number, number][] | null; expired: [number, number][] | null } => {
    const cached = state.comparison.get(key);
    if (!cached || isLiveProbe()) return { fresh: null, expired: null };
    return Date.now() - cached.timestamp < ttlMs ? { fresh: cached.data, expired: null } : { fresh: null, expired: cached.data };
};

export async function getAssetPriceHistory(symbol: string, from: number, to: number): Promise<[number, number][] | null> {
    if (!ALLOWED_ASSET_SYMBOLS.has(symbol)) return null;
    const cacheKey = `asset_${symbol}`;
    // A short lead-in guarantees a last-known bar for the first purchase date even
    // when the range starts on a weekend or market holiday.
    const LEAD_IN_DAYS = 14;

    const { fresh, expired } = readComparison(cacheKey, SERIES_TTL_MS);
    if (fresh) return sliceOrNull(fresh, from, to, LEAD_IN_DAYS);
    // One cool-off per symbol, not one for Yahoo: the calculator falls back
    // from the total-return index to the price index when the first has no
    // data, and that second request has to be allowed through.
    if (coolingOff(cacheKey)) return expired ? sliceOrNull(expired, from, to, LEAD_IN_DAYS) : null;

    try {
        const period1 = Math.floor(ASSET_HISTORY_START / 1000);
        // Rounded UP to the hour (matching revalidate: 3600) so the URL repeats
        // and the Next data cache can hit.
        const period2 = Math.ceil(Date.now() / 3_600_000) * 3600;

        // Use Yahoo Finance v8 chart API (more reliable than v7 download)
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;

        const response = await fetchWithTimeout(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            next: { revalidate: 3600 }
        });

        if (!response.ok) throw new UpstreamHttpError('Yahoo Finance', response.status);

        const json = await response.json();
        const result = json?.chart?.result?.[0];
        if (!result) throw new Error('Yahoo Finance returned no chart result');

        const timestamps = result.timestamp;
        const closes = result.indicators?.quote?.[0]?.close;

        // Yahoo sometimes returns the chart envelope with `null` (or an object)
        // where the arrays should be, so both are checked as arrays.
        if (!Array.isArray(timestamps) || !Array.isArray(closes) || timestamps.length === 0) {
            throw new Error('Yahoo Finance returned no bars');
        }

        const data: [number, number][] = [];
        for (let i = 0; i < timestamps.length; i++) {
            const ts = Number(timestamps[i]) * 1000; // Convert to milliseconds
            // Coerce first, then require a finite positive number: a numeric
            // string must not reach the charts as a string.
            const close = Number(closes[i]);
            if (Number.isFinite(ts) && ts > 0 && Number.isFinite(close) && close > 0) {
                data.push([ts, close]);
            }
        }

        if (data.length === 0) throw new Error('Yahoo Finance returned no usable bars');

        data.sort((a, b) => a[0] - b[0]);
        state.comparison.set(cacheKey, { timestamp: Date.now(), data });
        return sliceOrNull(data, from, to, LEAD_IN_DAYS);
    } catch {
        startCoolOff(cacheKey);
        // A stale series still in the LRU beats dropping the comparison overlay.
        return expired ? sliceOrNull(expired, from, to, LEAD_IN_DAYS) : null;
    }
}

export async function getCpiData(from: number, to: number): Promise<[number, number][] | null> {
    const apiKey = process.env.FRED_API_KEY;
    if (!apiKey) return null;

    // One cached series, sliced per request, as in getAssetPriceHistory.
    const cacheKey = 'cpi_full';
    // CPI is monthly, dated the 1st: 40 days always reaches back to a reading.
    const LEAD_IN_DAYS = 40;

    const { fresh, expired } = readComparison(cacheKey, 24 * 60 * MINUTE_MS); // 24h cache for CPI (monthly data)
    if (fresh) return sliceOrNull(fresh, from, to, LEAD_IN_DAYS);
    if (coolingOff(cacheKey)) return expired ? sliceOrNull(expired, from, to, LEAD_IN_DAYS) : null;

    try {
        const startDate = new Date(ASSET_HISTORY_START).toISOString().split('T')[0];
        const endDate = new Date(Date.now()).toISOString().split('T')[0];
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&api_key=${apiKey}&file_type=json&observation_start=${startDate}&observation_end=${endDate}`;

        const response = await fetchWithTimeout(url, {
            next: { revalidate: 86400 }
        });

        if (!response.ok) throw new UpstreamHttpError('FRED', response.status);

        const json = await response.json();
        if (!json.observations || !Array.isArray(json.observations)) throw new Error('FRED returned no observations');

        const data: [number, number][] = [];
        for (const obs of json.observations) {
            // One non-object entry must not sink the whole series.
            if (!obs || typeof obs !== 'object') continue;
            const dateTs = new Date(obs.date).getTime();
            // FRED writes "." for a month with no reading; Number(".") is NaN so it drops.
            const value = Number(obs.value);
            if (Number.isFinite(dateTs) && Number.isFinite(value) && value > 0) {
                data.push([dateTs, value]);
            }
        }

        if (data.length === 0) throw new Error('FRED returned no usable observations');

        data.sort((a, b) => a[0] - b[0]);
        state.comparison.set(cacheKey, { timestamp: Date.now(), data });
        return sliceOrNull(data, from, to, LEAD_IN_DAYS);
    } catch {
        startCoolOff(cacheKey);
        // Stale monthly CPI is fine; the alternative is losing the inflation overlay.
        return expired ? sliceOrNull(expired, from, to, LEAD_IN_DAYS) : null;
    }
}

/**
 * The three comparison series for one window, in one round trip (see
 * getPriceHistoryAndSpot). `cpiTo` lets inflation run past the window's end.
 *
 * The S&P 500 is the total-return index, which reinvests dividends; the
 * price-only index stands in only when Yahoo has no total-return bars. Each
 * series is null when it cannot be had.
 */
export async function getComparisonSeries(from: number, to: number, cpiTo: number = to): Promise<{
    sp500: [number, number][] | null;
    gold: [number, number][] | null;
    cpi: [number, number][] | null;
}> {
    const [sp500, gold, cpi] = await Promise.all([
        getAssetPriceHistory('^SP500TR', from, to).then(
            (rows) => (rows && rows.length > 0 ? rows : getAssetPriceHistory('^GSPC', from, to)),
        ),
        getAssetPriceHistory('GC=F', from, to),
        getCpiData(from, cpiTo),
    ]);
    return { sp500, gold, cpi };
}

// ── Network figures (the sidebar cards) ───────────────────────────────────────
//
// Each loader returns its figure with the time the provider's answer was
// fetched, so a card can say when it is old. The exported get* functions hand
// back the figure alone, for the server render and /api/health; getLiveSidebar
// returns all of them, dated, for /api/live/sidebar.

/**
 * One figure, or null when it cannot be had.
 *
 * `load` resolves null for an answer that cannot be used and throws when the
 * request fails. Either way the provider is left alone for its cool-off and
 * callers get null at once; every card has an "unavailable" state for that.
 *
 * An answer older than liveFigureMaxAgeMs is null too, but is not counted as
 * a failure. Outside a static render Next's Data Cache hands back an expired
 * entry and refreshes it in the background, so after a quiet spell the first
 * answer is old and the next one is not.
 */
async function figure<T>(
    name: string,
    lifetimeSeconds: number,
    load: (revalidate: number) => Promise<LiveFigure<T> | null>,
): Promise<LiveFigure<T> | null> {
    if (coolingOff(name)) return null;
    let loaded: LiveFigure<T> | null = null;
    try {
        loaded = await load(lifetimeSeconds);
    } catch {
        // Counted as a failure below, like an unusable answer.
    }
    if (!loaded) {
        startCoolOff(name);
        return null;
    }
    endCoolOff(name);
    return Date.now() - loaded.fetchedAt > liveFigureMaxAgeMs(lifetimeSeconds) ? null : loaded;
}

const loadMempoolFees = (): Promise<LiveFigure<MempoolFees> | null> =>
    figure('mempool-fees', LIVE_LIFETIME_SECONDS.mempoolFees, async (revalidate) => {
        const response = await fetchWithTimeout('https://mempool.space/api/v1/fees/precise', { next: { revalidate } });
        if (!response.ok) return null;
        const json = await response.json();
        // An error envelope ({"error":"..."}) or a renamed field has to read as
        // "unavailable", not as "NaN sat/vB".
        const highFee = Number(json?.fastestFee);
        const mediumFee = Number(json?.halfHourFee);
        const lowFee = Number(json?.hourFee);
        if (![highFee, mediumFee, lowFee].every((f) => Number.isFinite(f) && f > 0)) return null;
        return { data: { highFee, mediumFee, lowFee }, fetchedAt: responseTime(response) };
    });

export async function getMempoolFees(): Promise<MempoolFees | null> {
    return (await loadMempoolFees())?.data ?? null;
}

const loadFearGreed = (): Promise<LiveFigure<FearGreed> | null> =>
    figure('fear-greed', LIVE_LIFETIME_SECONDS.fearGreed, async (revalidate) => {
        const response = await fetchWithTimeout('https://api.alternative.me/fng/?limit=1', { next: { revalidate } });
        if (!response.ok) return null;
        const json = await response.json();
        if (!json.data || !Array.isArray(json.data) || json.data.length === 0) return null;
        const entry = json.data[0];
        // Both fields must be present and in range: a renamed one would
        // otherwise render as "NaN/100" next to an empty classification.
        const value = Number(entry?.value);
        const classification = typeof entry?.value_classification === 'string'
            ? entry.value_classification.trim()
            : '';
        if (!Number.isFinite(value) || value < 0 || value > 100) return null;
        if (classification === '') return null;
        return { data: { value: Math.round(value), classification }, fetchedAt: responseTime(response) };
    });

export async function getFearGreedIndex(): Promise<FearGreed | null> {
    return (await loadFearGreed())?.data ?? null;
}

const loadBlockHeight = (): Promise<LiveFigure<number> | null> =>
    figure('block-height', LIVE_LIFETIME_SECONDS.blockHeight, async (revalidate) => {
        const response = await fetchWithTimeout('https://mempool.space/api/v1/blocks/tip/height', { next: { revalidate } });
        if (!response.ok) return null;
        // Bare plaintext digits. parseInt would accept a digit-prefixed error
        // body ("503 Service Unavailable" -> 503) and hand the halving
        // countdown a nonsense height, so the whole body must be an integer.
        const trimmed = (await response.text()).trim();
        if (!/^\d+$/.test(trimmed)) return null;
        const height = Number(trimmed);
        if (!Number.isSafeInteger(height) || height <= 0) return null;
        return { data: height, fetchedAt: responseTime(response) };
    });

export async function getBlockHeight(): Promise<number | null> {
    return (await loadBlockHeight())?.data ?? null;
}

const loadHashRateDifficulty = (): Promise<LiveFigure<HashRateDifficulty> | null> =>
    figure('hashrate', LIVE_LIFETIME_SECONDS.hashRate, async (revalidate) => {
        const [diffRes, hashRes] = await Promise.all([
            fetchWithTimeout('https://mempool.space/api/v1/difficulty-adjustment', { next: { revalidate: 120 } }),
            fetchWithTimeout('https://mempool.space/api/v1/mining/hashrate/1m', { next: { revalidate } }),
        ]);
        if (!diffRes.ok || !hashRes.ok) return null;
        const diffJson = await diffRes.json();
        const hashJson = await hashRes.json();
        if (!diffJson || typeof diffJson !== 'object') return null;
        if (!hashJson || typeof hashJson !== 'object') return null;

        // A missing required field means the API's shape drifted: that reads
        // as "unavailable", never as a zero hashrate, "Difficulty 0" or
        // "+0.00%" rendered as fact. A negative adjustment is legitimate, and
        // so is blocksUntilAdjustment of exactly 0 (the retarget boundary).
        const hashrate = Number(hashJson.currentHashrate);
        if (!Number.isFinite(hashrate) || hashrate <= 0) return null;
        const difficulty = Number(hashJson.currentDifficulty);
        if (!Number.isFinite(difficulty) || difficulty <= 0) return null;
        const adjustmentPercent = Number(diffJson.difficultyChange);
        if (!Number.isFinite(adjustmentPercent)) return null;
        const blocksUntilAdjustment = Number(diffJson.remainingBlocks);
        if (!Number.isFinite(blocksUntilAdjustment) || blocksUntilAdjustment < 0) return null;

        // mempool.space sends an epoch in ms; a date string is accepted too.
        // `new Date(garbage).toISOString()` throws, so anything unparseable
        // becomes the empty string the UI already treats as "no date".
        const rawRetarget = diffJson.estimatedRetargetDate;
        let estimatedRetargetDate = '';
        if (typeof rawRetarget === 'number' || typeof rawRetarget === 'string') {
            const parsed = new Date(rawRetarget);
            if (Number.isFinite(parsed.getTime())) estimatedRetargetDate = parsed.toISOString();
        }

        return {
            data: { hashrate, difficulty, adjustmentPercent, blocksUntilAdjustment, estimatedRetargetDate },
            fetchedAt: Math.min(responseTime(diffRes), responseTime(hashRes)),
        };
    });

export async function getHashRateDifficulty(): Promise<HashRateDifficulty | null> {
    return (await loadHashRateDifficulty())?.data ?? null;
}

const loadCirculatingSupply = (): Promise<LiveFigure<number> | null> =>
    figure('supply', LIVE_LIFETIME_SECONDS.supplySats, async (revalidate) => {
        const response = await fetchWithTimeout('https://blockchain.info/q/totalbc', { next: { revalidate } });
        if (!response.ok) return null;
        // Bare plaintext satoshis, or an HTML error page under load. The whole
        // body must be an integer (parseInt accepts a digit-prefixed error
        // body) and no more than the 21M cap.
        const trimmed = (await response.text()).trim();
        if (!/^\d+$/.test(trimmed)) return null;
        const sats = Number(trimmed);
        if (!Number.isFinite(sats) || sats <= 0 || sats > 21_000_000 * 100_000_000) return null;
        return { data: sats, fetchedAt: responseTime(response) };
    });

/** Bitcoin in circulation, in satoshis. */
export async function getCirculatingSupply(): Promise<number | null> {
    return (await loadCirculatingSupply())?.data ?? null;
}

const loadLightningStats = (): Promise<LiveFigure<LightningStats> | null> =>
    figure('lightning', LIVE_LIFETIME_SECONDS.lightning, async (revalidate) => {
        const response = await fetchWithTimeout('https://mempool.space/api/v1/lightning/statistics/latest', {
            next: { revalidate },
        });
        if (!response.ok) return null;
        const latest = (await response.json())?.latest;
        // Shape drift has to read as "unavailable", not as a Lightning network of zero nodes.
        if (!latest || typeof latest !== 'object') return null;
        // Some mempool.space deployments send the counts as numeric strings:
        // coerce first, then decide whether the value is usable.
        const nodeCount = Number(latest.node_count);
        if (!Number.isFinite(nodeCount) || nodeCount <= 0) return null;
        // The day the row is for. A row that cannot be dated cannot be shown.
        const asOf = typeof latest.added === 'number' ? latest.added * 1000 : Date.parse(String(latest.added));
        if (!Number.isFinite(asOf) || asOf <= 0 || asOf > Date.now() + DAY_MS) return null;
        const channelCount = Number(latest.channel_count);
        const totalCapacitySats = Number(latest.total_capacity);
        const row: LightningStats = {
            nodeCount,
            channelCount: Number.isFinite(channelCount) && channelCount >= 0 ? channelCount : 0,
            totalCapacityBtc: (Number.isFinite(totalCapacitySats) && totalCapacitySats >= 0 ? totalCapacitySats : 0) / 100_000_000,
            asOf,
        };
        // mempool.space's servers do not all hold the same "latest" row: on
        // 2026-10-12 six of its seven addresses answered with one dated between
        // July 13 and August 30. A newer row, once seen, is not given up for an
        // older one.
        if (!state.lightning || row.asOf >= state.lightning.asOf) state.lightning = row;
        return { data: state.lightning, fetchedAt: responseTime(response) };
    });

/** Lightning network counts, with the day mempool.space dates them (`asOf`). */
export async function getLightningStats(): Promise<LightningStats | null> {
    return (await loadLightningStats())?.data ?? null;
}

const loadBitcoinDominance = (): Promise<LiveFigure<BitcoinDominance> | null> =>
    figure('dominance', LIVE_LIFETIME_SECONDS.dominance, async (revalidate) => {
        const response = await fetchWithTimeout('https://api.coingecko.com/api/v3/global', { next: { revalidate } });
        if (!response.ok) return null;
        const data = (await response.json())?.data;
        if (!data || typeof data !== 'object') return null;
        // Both numbers are checked as numbers: junk in either (a string, an
        // error object) would render as "$NaN" beside a plausible percentage.
        const totalMarketCapUsd = Number(data.total_market_cap?.usd);
        const dominancePct = Number(data.market_cap_percentage?.btc);
        if (!Number.isFinite(dominancePct) || dominancePct <= 0 || dominancePct > 100) return null;
        if (!Number.isFinite(totalMarketCapUsd) || totalMarketCapUsd <= 0) return null;
        return {
            data: {
                dominancePercent: dominancePct,
                btcMarketCap: totalMarketCapUsd * (dominancePct / 100),
                totalMarketCap: totalMarketCapUsd,
            },
            fetchedAt: responseTime(response),
        };
    });

export async function getBitcoinDominance(): Promise<BitcoinDominance | null> {
    return (await loadBitcoinDominance())?.data ?? null;
}

const loadRecentBlocks = (): Promise<LiveFigure<RecentBlock[]> | null> =>
    figure('recent-blocks', LIVE_LIFETIME_SECONDS.recentBlocks, async (revalidate) => {
        const response = await fetchWithTimeout('https://mempool.space/api/v1/blocks', { next: { revalidate } });
        if (!response.ok) return null;
        const json = await response.json();
        if (!Array.isArray(json) || json.length === 0) return null;
        // Every element is checked: the widget calls methods on these fields,
        // so a renamed one (or an error object inside the array) would crash
        // the page, not show an empty state.
        const blocks: RecentBlock[] = [];
        for (const block of json.slice(0, 5)) {
            if (!block || typeof block !== 'object') continue;
            const height = Number(block.height);
            const timestamp = Number(block.timestamp);
            const txCount = Number(block.tx_count);
            const size = Number(block.size);
            // height and timestamp are load-bearing (React key + "time ago"); the
            // other two only affect a label, so they degrade to 0.
            if (!Number.isFinite(height) || height < 0) continue;
            if (!Number.isFinite(timestamp) || timestamp <= 0) continue;
            blocks.push({
                height,
                timestamp,
                txCount: Number.isFinite(txCount) && txCount >= 0 ? txCount : 0,
                size: Number.isFinite(size) && size >= 0 ? size : 0,
            });
        }
        return blocks.length > 0 ? { data: blocks, fetchedAt: responseTime(response) } : null;
    });

export async function getRecentBlocks(): Promise<RecentBlock[] | null> {
    return (await loadRecentBlocks())?.data ?? null;
}

/** What a dollar and a bitcoin bought in January 2015 against today. Dated by its bitcoin quote. */
async function loadPurchasingPower(spotQuote: Promise<SpotQuote | null>): Promise<LiveFigure<PurchasingPower> | null> {
    try {
        const jan2015 = Date.UTC(2015, 0, 1);
        const [cpiData, spot, snapshot] = await Promise.all([
            getCpiData(jan2015, Date.now()),
            spotQuote,
            loadSnapshot(),
        ]);
        if (!cpiData || cpiData.length < 2 || !spot) return null;
        // getCpiData's slice keeps a 40-day lead-in, so cpiData[0] is the Dec 2014
        // reading — but the widget labels the baseline "in 2015".
        const cpiStart = cpiData.find(([ts]) => ts >= jan2015)?.[1] ?? NaN;
        const cpiNow = cpiData[cpiData.length - 1][1];
        // The widget divides by cpiStart, so a zero or non-finite reading would render
        // "Infinity%" / "$NaN" instead of the card's own empty state.
        if (!Number.isFinite(cpiStart) || cpiStart <= 0) return null;
        if (!Number.isFinite(cpiNow) || cpiNow <= 0) return null;
        const btcPriceNow = spot.price;
        if (!Number.isFinite(btcPriceNow) || btcPriceNow <= 0) return null;
        // The bundled series' own row for 1 January 2015, the price every
        // calculator on the site uses for that day. Exact match only: the next
        // row down is a different day's price, and no literal stands in for a
        // missing one.
        const btcPriceStart = snapshot.find(([ts]) => ts === jan2015)?.[1] ?? NaN;
        if (!Number.isFinite(btcPriceStart) || btcPriceStart <= 0) return null;
        return { data: { cpiStart, cpiNow, btcPriceStart, btcPriceNow }, fetchedAt: spot.asOf };
    } catch {
        return null;
    }
}

export async function getPurchasingPowerData(): Promise<PurchasingPower | null> {
    return (await loadPurchasingPower(getBitcoinSpot()))?.data ?? null;
}

/**
 * Every sidebar figure in one answer, each with the time it was fetched, for
 * /api/live/sidebar. Takes no arguments, so there is nothing a caller can ask
 * for but this, and never throws: a figure that cannot be had is null.
 */
export async function getLiveSidebar(): Promise<LiveSidebar> {
    // One quote, shared by the purchasing-power card and the sat converter.
    const spotQuote = getBitcoinSpot().catch(() => null);
    const [
        mempoolFees, blockHeight, recentBlocks, hashRate, supplySats, lightning, dominance, fearGreed, purchasingPower, spot,
    ] = await Promise.all([
        loadMempoolFees(),
        loadBlockHeight(),
        loadRecentBlocks(),
        loadHashRateDifficulty(),
        loadCirculatingSupply(),
        loadLightningStats(),
        loadBitcoinDominance(),
        loadFearGreed(),
        loadPurchasingPower(spotQuote),
        spotQuote,
    ]);
    return { mempoolFees, blockHeight, recentBlocks, hashRate, supplySats, lightning, dominance, fearGreed, purchasingPower, spot };
}

// ── Spot price ────────────────────────────────────────────────────────────────

/**
 * A quote older than this (five minutes) is not a live price, whatever a cache
 * says. A quote fetched with a longer lifetime (the daily pages ask for 24
 * hours) is allowed the age that lifetime implies.
 */
const SPOT_MAX_AGE_MS = liveFigureMaxAgeMs(LIVE_LIFETIME_SECONDS.spot);

/**
 * How long one quote request may take. A healthy exchange answers in about a
 * tenth of a second, and the other exchange can quote instead, so one that
 * hangs is given up on quickly.
 */
const QUOTE_TIMEOUT_MS = 3_000;

/**
 * `request`, unless this exchange failed to quote moments ago (see
 * coolingOff): until the cool-off ends, callers go straight to the other
 * exchange without waiting on the failing one first. A live probe always
 * asks, and one that succeeds ends the cool-off for everyone.
 */
async function withQuoteCoolOff<T>(name: string, provider: PriceProvider, request: () => Promise<T>): Promise<T> {
    if (coolingOff(name)) throw new ProviderCoolingDown(provider, 'no current quote');
    try {
        const quote = await request();
        endCoolOff(name);
        return quote;
    } catch (error) {
        startCoolOff(name);
        throw error;
    }
}

/** One exchange's latest trade price. Throws on any failure; never falls back. */
const fetchSpot = (provider: PriceProvider, revalidate: number): Promise<{ price: number; asOf: number }> =>
    withQuoteCoolOff(`spot:${provider}`, provider, () => requestSpot(provider, revalidate));

async function requestSpot(provider: PriceProvider, revalidate: number): Promise<{ price: number; asOf: number }> {
    const url = provider === 'coinbase'
        ? 'https://api.exchange.coinbase.com/products/BTC-USD/ticker'
        : 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD';

    const { json, fetchedAt, refetchFailed } = await upstreamJson(url, {
        headers: EXCHANGE_HEADERS,
        revalidate,
        timeoutMs: QUOTE_TIMEOUT_MS,
        bustParam: EXCHANGE_BUST_PARAM,
    });
    // The cached quote was too old and the exchange did not answer when asked
    // again. That is a failure of this exchange even while the old quote is
    // inside the age limit below: accepting it would leave every later caller
    // waiting out the same timeout, and the price switching between this old
    // quote and the other exchange's live one.
    if (refetchFailed) {
        throw new Error(`${provider} did not answer; its last quote is ${Math.round((Date.now() - fetchedAt) / 1000)}s old`);
    }
    const body = json as { price?: unknown; error?: unknown; result?: Record<string, { c?: unknown[] }> } | null;

    let price: number;
    if (provider === 'coinbase') {
        price = parseFloat(String(body?.price));
    } else {
        if (body && Array.isArray(body.error) && body.error.length > 0) {
            throw new Error(`API Error: ${body.error.join(', ')}`);
        }
        const result = body?.result;
        if (!result) throw new Error('Invalid response from Kraken');
        const pairKey = Object.keys(result)[0];
        price = parseFloat(String(result[pairKey]?.c?.[0] ?? '0'));
    }
    if (!Number.isFinite(price) || price <= 0) throw new Error(`Invalid price from ${provider}`);

    const ageMs = Date.now() - fetchedAt;
    if (ageMs > Math.max(SPOT_MAX_AGE_MS, maxAcceptableAgeMs(revalidate))) {
        throw new Error(`${provider} quote is ${Math.round(ageMs / MINUTE_MS)} minutes old`);
    }
    return { price, asOf: fetchedAt };
}

/**
 * The live price from ONE exchange. Throws when that exchange cannot supply a
 * current quote: /api/health relies on this to see a single-exchange outage.
 * UI surfaces want getBitcoinSpot.
 */
export async function getCurrentBitcoinPrice(
    providerArg: PriceProvider = DEFAULT_PRICE_PROVIDER,
    revalidateArg: number = DEFAULT_PRICE_REVALIDATE,
): Promise<number> {
    const provider = normalizeProvider(providerArg);
    const revalidate = normalizeRevalidate(revalidateArg, DEFAULT_PRICE_REVALIDATE);
    try {
        return (await fetchSpot(provider, revalidate)).price;
    } catch (error) {
        logProviderFailure(`[getCurrentBitcoinPrice] ${provider} failed:`, error);
        // A page that catches this renders without a live price; see utils/isr.
        await expireRenderSoon();
        throw error;
    }
}

/**
 * The live price with cross-exchange fallback, plus when it was quoted and by
 * whom. Null when neither exchange answers — calculateDca then values the
 * stack at the last daily bar, dated at that bar.
 */
export async function getBitcoinSpot(
    providerArg: PriceProvider = DEFAULT_PRICE_PROVIDER,
    revalidateArg: number = DEFAULT_PRICE_REVALIDATE,
): Promise<SpotQuote | null> {
    const requested = normalizeProvider(providerArg);
    const revalidate = normalizeRevalidate(revalidateArg, DEFAULT_PRICE_REVALIDATE);
    try {
        return { ...(await fetchSpot(requested, revalidate)), provider: requested, fallback: false };
    } catch (error) {
        const fallback = fallbackProviderFor(requested);
        logProviderFailure(`[getBitcoinSpot] ${requested} failed, trying ${fallback}:`, error);
        await expireRenderSoon();
        try {
            return { ...(await fetchSpot(fallback, revalidate)), provider: fallback, fallback: true };
        } catch (fallbackError) {
            logProviderFailure(`[getBitcoinSpot] fallback ${fallback} also failed:`, fallbackError);
            return null;
        }
    }
}

/**
 * The price history for a window and the live quote, in one round trip. Next
 * sends a browser's Server Actions one at a time, so two calls made together
 * from a component are two round trips in a row.
 *
 * `history` is null when neither exchange can supply one and nothing usable
 * is in memory; `spot` is null when neither can quote. Never throws.
 */
export async function getPriceHistoryAndSpot(
    from: number,
    to: number,
    providerArg: PriceProvider = DEFAULT_PRICE_PROVIDER,
): Promise<{ history: PriceHistoryResult | null; spot: SpotQuote | null }> {
    const [history, spot] = await Promise.all([
        // Already logged where it failed (resolveSeries).
        getBitcoinPriceHistoryWithMeta(from, to, providerArg).catch(() => null),
        getBitcoinSpot(providerArg),
    ]);
    return { history, spot };
}

// ── Ticker ────────────────────────────────────────────────────────────────────

/** One exchange's price and the price its change is measured from. Throws on any failure. */
async function requestTicker(provider: PriceProvider): Promise<TickerQuote> {
    // Coinbase /ticker has no 24h open (open_24h does not exist there); /stats
    // returns {open, last} for the rolling 24h window.
    const url = provider === 'coinbase'
        ? 'https://api.exchange.coinbase.com/products/BTC-USD/stats'
        : 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD';

    const { json, fetchedAt, refetchFailed } = await upstreamJson(url, {
        headers: EXCHANGE_HEADERS,
        revalidate: LIVE_LIFETIME_SECONDS.ticker,
        timeoutMs: QUOTE_TIMEOUT_MS,
        bustParam: EXCHANGE_BUST_PARAM,
    });
    if (refetchFailed || Date.now() - fetchedAt > SPOT_MAX_AGE_MS) throw new Error(`${provider} quote is out of date`);
    const body = json as {
        last?: unknown;
        open?: unknown;
        error?: unknown;
        result?: Record<string, { c?: unknown[]; o?: unknown }>;
    } | null;

    let price: number;
    let open24h: number;
    if (provider === 'coinbase') {
        price = parseFloat(String(body?.last));
        open24h = parseFloat(String(body?.open));
    } else {
        if (body && Array.isArray(body.error) && body.error.length > 0) {
            throw new Error(`API Error: ${body.error.join(', ')}`);
        }
        const result = body?.result;
        if (!result) throw new Error('Invalid response from Kraken');
        const pairKey = Object.keys(result)[0];
        const ticker = result[pairKey];
        price = parseFloat(String(ticker?.c?.[0] ?? '0'));
        open24h = parseFloat(String(ticker?.o ?? '0'));
    }
    if (!Number.isFinite(price) || price <= 0) throw new Error(`Invalid price from ${provider}`);
    if (!Number.isFinite(open24h) || open24h <= 0) open24h = price;
    return { price, open24h, provider, changeSince: provider === 'kraken' ? 'utc-midnight' : '24h-ago', asOf: fetchedAt };
}

const fetchTicker = (provider: PriceProvider): Promise<TickerQuote> =>
    withQuoteCoolOff(`ticker:${provider}`, provider, () => requestTicker(provider));

/** `requested`'s ticker, the other exchange's when it has none, or null when neither has. */
async function tickerQuote(requested: PriceProvider): Promise<TickerQuote | null> {
    try {
        return await fetchTicker(requested);
    } catch (error) {
        const fallback = fallbackProviderFor(requested);
        logProviderFailure(`[ticker] ${requested} failed, trying ${fallback}:`, error);
        try {
            return await fetchTicker(fallback);
        } catch (fallbackError) {
            logProviderFailure(`[ticker] fallback ${fallback} also failed:`, fallbackError);
            return null;
        }
    }
}

/**
 * The live price and the price it is compared against, for the hero ticker
 * and /api/live/ticker. Null when neither exchange has a current quote; never
 * throws.
 *
 * Kraken first, unlike everything else here, because the two exchanges mean
 * different things by "open": Kraken's ticker gives today's open (00:00 UTC),
 * Coinbase's stats give the price 24 hours ago. `changeSince` says which one
 * the caller got, so a label can follow the data.
 */
export async function getLiveTicker(): Promise<TickerQuote | null> {
    return tickerQuote('kraken');
}

/** getLiveTicker starting from the exchange asked for. Throws when neither exchange has a current quote. */
export async function getCurrentBitcoinPriceWithChange(providerArg: PriceProvider = 'kraken'): Promise<TickerQuote> {
    const quote = await tickerQuote(providerArg === 'coinbase' ? 'coinbase' : 'kraken');
    if (!quote) throw new Error('Neither exchange has a current quote');
    return quote;
}

// ── Same plan, every start date ───────────────────────────────────────────────
//
// What one plan (a frequency and a length) would have returned from every start
// date in the price history: the whole spread, the share of runs that ended
// below cost and how many runs are independent, because neighbouring runs
// share all but a week and only three five-year periods fit in the history
// end to end.

// Same reasoning as normalizeProvider: `frequency` is a public argument AND a
// cache key, so an unknown string must not compute anything or mint an entry.
const ALLOWED_FREQUENCIES = new Set<Frequency>(['daily', 'weekly', 'biweekly', 'monthly']);

/** frequency × length × era is 4 × ~190 × 2 keys at most; this only bounds the memory they can hold. */
const MAX_WALK_ENTRIES = 120;

/**
 * The fee-free walk for one frequency, length and era, cached for an hour.
 *
 * Runs on the default series only (the bundled snapshot, then Coinbase's daily
 * candles) and stops at yesterday: every price in it is one the source
 * reported for a finished day. Null when that series is not available (the
 * Kraken fallback is mostly straight-line estimates, and a statistic about
 * what really happened cannot be built on those) or when the plan is not
 * shorter than the history.
 */
async function loadStartDateWalk(
    frequency: Frequency,
    durationDays: number,
    era: PriceEra,
): Promise<StartDateWalkEntry | null> {
    const cacheKey = `${frequency}_${durationDays}_${era}`;
    const cached = state.walks.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.builtAt < SERIES_TTL_MS && utcDayIndex(now) === utcDayIndex(cached.builtAt)) return cached;

    let loaded: LoadedSeries | undefined;
    try {
        loaded = await getProviderSeries('coinbase', HISTORY_REVALIDATE);
    } catch (error) {
        logProviderFailure('[start-date walk] coinbase history unavailable:', error);
        // An hours-old copy of real closes is still real closes.
        const old = state.series.get('coinbase');
        if (old && now - old.fetchedAt < STALE_SERVE_MAX_MS) loaded = old;
    }
    if (!loaded) return null;

    const { data, kinds } = loaded.series;
    const spanStart = PRICE_ERAS[era].startTs;
    // The row for the day a series was fetched on is the latest trade at that
    // moment, not a close. Normally that day is today. When the copy in hand
    // is yesterday's (the outage path just above), it is yesterday's row that
    // was never finished, so the walk stops the day before the fetch.
    const spanEnd = Math.min(data[data.length - 1][0], utcDayStart(Math.min(now, loaded.fetchedAt)) - DAY_MS);
    const prices = toDailyPrices(data, spanStart, spanEnd);
    if (!prices || durationDays >= prices.length) return null;

    const walk = walkStartDates(prices, durationDays, frequency);
    if (walk.runs === 0) return null;

    const firstRow = utcDayIndex(spanStart) - utcDayIndex(data[0][0]);
    const entry: StartDateWalkEntry = {
        builtAt: now,
        // Single precision is ample for a percentage and halves what a
        // caller cycling through every key can make the cache hold.
        multiples: new Float32Array(walk.multiples),
        averageCosts: new Float32Array(walk.averageCosts),
        spanStart,
        spanEnd,
        spanDays: prices.length - 1,
        estimatedDays: countPriceKinds(kinds.slice(firstRow, firstRow + prices.length)).estimated,
    };
    state.walks.delete(cacheKey);
    if (state.walks.size >= MAX_WALK_ENTRIES) {
        const oldest = state.walks.keys().next().value;
        if (oldest !== undefined) state.walks.delete(oldest);
    }
    state.walks.set(cacheKey, entry);
    return entry;
}

/**
 * The spread of outcomes for one plan across every start date: worst, 10th
 * percentile, median, 90th percentile and best total return, the share of runs
 * that ended below cost, and how many of those runs are independent.
 *
 * `durationDays` is snapped to whole months (see bucketDurationDays); the
 * result says what was actually run. `feePercentage` is the percentage fee per
 * buy, clamped to 0-100. `era` picks the stretch of history (see PRICE_ERAS).
 *
 * Null when the plan is under 90 days, is not shorter than the history, or the
 * daily closes are unavailable. Past outcomes only: nothing here is a forecast.
 */
export async function getOutcomeRange(
    frequency: Frequency,
    durationDays: number,
    feePercentage: number = 0,
    era: PriceEra = 'all',
): Promise<OutcomeRangeResult | null> {
    try {
        if (!ALLOWED_FREQUENCIES.has(frequency)) return null;
        const bucket = bucketDurationDays(durationDays);
        if (!bucket) return null;
        const fee = typeof feePercentage === 'number' && Number.isFinite(feePercentage)
            ? Math.min(100, Math.max(0, feePercentage))
            : 0;
        const eraKey: PriceEra = isPriceEra(era) ? era : 'all';

        const walk = await loadStartDateWalk(frequency, bucket.days, eraKey);
        if (!walk) return null;
        const summary = summariseOutcomes(walk.multiples, fee, walk.spanDays, bucket.days);
        if (!summary || !summary.quantiles.every(Number.isFinite)) return null;

        return {
            ...summary,
            frequency,
            durationDays: bucket.days,
            months: bucket.months,
            feePercentage: fee,
            era: eraKey,
            spanStart: walk.spanStart,
            spanEnd: walk.spanEnd,
            estimatedDays: walk.estimatedDays,
        };
    } catch (error) {
        console.error('[getOutcomeRange] failed:', error);
        return null;
    }
}

/**
 * "Average cost beats N% of all possible start dates for this schedule": the
 * same walk as getOutcomeRange over all history, ranking a given average cost
 * against every run's average cost (the harmonic mean of its buy prices)
 * instead of its return. Fee-free, like the cost it is compared with.
 */
export async function getCostBasisPercentile(
    frequency: Frequency,
    durationDays: number,
    averageCostUsd: number,
): Promise<{ percentile: number; windowCount: number } | null> {
    try {
        // Public endpoint — validate everything. averageCostUsd is only ever
        // compared, never a cache key, so it cannot mint entries.
        if (!ALLOWED_FREQUENCIES.has(frequency)) return null;
        const bucket = bucketDurationDays(durationDays);
        if (!bucket) return null;
        if (typeof averageCostUsd !== 'number' || !Number.isFinite(averageCostUsd) || averageCostUsd <= 0) return null;

        const walk = await loadStartDateWalk(frequency, bucket.days, 'all');
        if (!walk) return null;
        const costs = walk.averageCosts;
        const windowCount = costs.length;
        if (windowCount < 30) return null;

        // Sorted ascending: everything from the first cost above ours is "higher".
        let lo = 0;
        let hi = windowCount;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (costs[mid] > averageCostUsd) hi = mid;
            else lo = mid + 1;
        }
        const percentile = ((windowCount - lo) / windowCount) * 100;
        if (!Number.isFinite(percentile)) return null;
        return { percentile, windowCount };
    } catch (error) {
        console.error('[getCostBasisPercentile] failed:', error);
        return null;
    }
}

// ── Hero headline stat ─────────────────────────────────────────────────────────
// The live number behind the hero: what the default plan is worth today.

/**
 * The default plan (data/planDefaults), run exactly as the calculator below
 * the hero runs it: same amount, frequency, window, fee, provider and price
 * rounding, so the headline and the result one screen down agree. The plan's
 * parameters come back with the figures so the sentence that quotes them can
 * state them.
 */
export async function getHeroStat(): Promise<{
    invested: number;
    value: number;
    roi: number;
    btc: number;
    amount: number;
    frequency: Frequency;
    yearsBack: number;
    feePercentage: number;
    startDate: string;
    endDate: string;
    provider: PriceProvider;
} | null> {
    try {
        const { calculateDca } = await import('@/utils/dca');
        const now = Date.now();
        const window = defaultPlanWindow(now);
        const [history, spot] = await Promise.all([
            getBitcoinPriceHistoryWithMeta(window.startTs, window.endTs + DAY_MS),
            getBitcoinSpot(),
        ]);
        if (history.data.length === 0) return null;
        // The home page ships its seed series to the browser rounded to cents;
        // the same rounding here keeps the two results equal to the dollar.
        const prices = history.data.map(([ts, price]): [number, number] => [ts, Math.round(price * 100) / 100]);
        const result = calculateDca(
            {
                amount: DEFAULT_PLAN.amount,
                frequency: DEFAULT_PLAN.frequency,
                startDate: new Date(window.startTs),
                endDate: new Date(window.endTs),
                feePercentage: DEFAULT_PLAN.feePercentage,
                priceMode: 'api',
                manualPrice: 0,
            },
            prices,
            spot?.price ?? null,
            spot?.asOf ?? now,
        );
        // roi and btcAccumulated are rendered directly in the hero; a non-finite one
        // would print "NaN%" above the fold rather than falling back to static copy.
        if (result.totalInvested <= 0 || !Number.isFinite(result.currentValue)) return null;
        if (!Number.isFinite(result.roi) || !Number.isFinite(result.btcAccumulated)) return null;
        return {
            invested: result.totalInvested,
            value: result.currentValue,
            roi: result.roi,
            btc: result.btcAccumulated,
            amount: DEFAULT_PLAN.amount,
            frequency: DEFAULT_PLAN.frequency,
            yearsBack: DEFAULT_PLAN.yearsBack,
            feePercentage: DEFAULT_PLAN.feePercentage,
            startDate: window.startDate,
            endDate: window.endDate,
            provider: history.servedProvider,
        };
    } catch (error) {
        console.error('[getHeroStat] failed:', error);
        return null;
    }
}

// ── Live FX rates ──────────────────────────────────────────────────────────────
// ECB reference rates via Frankfurter (api.frankfurter.dev, no API key).

export type FxRates = Partial<Record<FxQuoteCode, number>>;

const FX_CACHE_MS = 12 * 60 * MINUTE_MS; // 12h — ECB updates once per business day
const FX_REVALIDATE = 43_200;
const FX_MAX_LIVE_AGE_DAYS = 7;
// The provider route, not /v2/rates: that one blends about a hundred sources
// by default, and the site says "ECB". Frankfurter rejects a query parameter
// it does not know (422), so this URL takes no cache-busting one.
const FX_URL = `https://api.frankfurter.dev/v2/providers/ecb/rates?base=USD&quotes=${FX_QUOTE_CODES.join(',')}`;

/** ECB rates as a snapshot, or null when they cannot be had. */
async function loadLiveFx(): Promise<FxSnapshot | null> {
    const cached = state.fx;
    const probing = isLiveProbe();
    if (cached && !probing && Date.now() - cached.fetchedAt < FX_CACHE_MS) return cached.snapshot;
    // The rates change once a business day; half a minute more on the last
    // ones known, while the provider is failing, costs nothing.
    if (coolingOff('fx')) return cached?.snapshot ?? null;
    try {
        const { json, fetchedAt } = await upstreamJson(FX_URL, { revalidate: FX_REVALIDATE });
        // v2 answers with one row per currency: {date, base, quote, rate}. An
        // unknown provider or currency gives 200 with an empty array.
        if (!Array.isArray(json)) throw new Error('Frankfurter returned an unexpected payload');
        const rates: FxSnapshot['rates'] = { ...FX_FALLBACK_SNAPSHOT.rates };
        const seen = new Set<string>();
        let asOf = '';
        for (const row of json as { date?: unknown; base?: unknown; quote?: unknown; rate?: unknown }[]) {
            if (!row || typeof row !== 'object' || row.base !== 'USD') continue;
            const code = FX_QUOTE_CODES.find((c) => c === row.quote);
            const rate = Number(row.rate);
            if (!code || !Number.isFinite(rate) || rate <= 0) continue;
            rates[code] = rate;
            seen.add(code);
            if (typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.date > asOf) asOf = row.date;
        }
        // All five or nothing: a table that is part live and part constant
        // could not honestly be called either.
        if (seen.size !== FX_QUOTE_CODES.length || asOf === '') throw new Error('Frankfurter returned incomplete rates');

        const snapshot: FxSnapshot = { rates, live: true, asOf };
        // Aged from when the payload was fetched, not when it was read: a copy
        // the Data Cache held past its lifetime is then refetched next time.
        state.fx = { fetchedAt, snapshot };
        return snapshot;
    } catch (error) {
        console.error('[fx] ECB rates unavailable:', error);
        startCoolOff('fx');
        // Real ECB rates from an earlier fetch, dated as such, still beat the constants.
        return probing ? null : cached?.snapshot ?? null;
    }
}

/**
 * Live ECB rates (units per 1 USD) for EUR, GBP, CAD, AUD and JPY, or null
 * when they are unavailable. For rates that are always usable and say whether
 * they are live, use getFxSnapshot.
 */
export async function getFxRates(): Promise<FxRates | null> {
    const snapshot = await loadLiveFx();
    if (!snapshot) return null;
    const rates: FxRates = {};
    for (const code of FX_QUOTE_CODES) rates[code] = snapshot.rates[code];
    return rates;
}

/**
 * Exchange rates that always resolve: current ECB rates when the provider
 * answers, otherwise the last ones fetched or the dated constants in
 * data/currencies, with `live: false`. A caller showing a converted figure
 * should say it is approximate, and as of `asOf`, whenever `live` is false.
 */
export async function getFxSnapshot(): Promise<FxSnapshot> {
    const snapshot = await loadLiveFx();
    if (!snapshot) {
        await expireRenderSoon();
        return FX_FALLBACK_SNAPSHOT;
    }
    // The ECB skips weekends and holidays, so its newest rates are normally up
    // to five days old. Older than a week means the provider has been
    // unreachable and these are leftovers: still the best rates on hand, and
    // still dated, but no longer to be passed off as current.
    const ageDays = (utcDayStart(Date.now()) - Date.parse(`${snapshot.asOf}T00:00:00Z`)) / DAY_MS;
    return ageDays > FX_MAX_LIVE_AGE_DAYS ? { ...snapshot, live: false } : snapshot;
}
