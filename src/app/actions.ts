'use server';

import { differenceInMinutes } from 'date-fns';
import { DEFAULT_PRICE_REVALIDATE, HISTORY_REVALIDATE, normalizeRevalidate } from '@/utils/revalidate';

const DAY_MS = 86_400_000;
const CACHE_DURATION_MINUTES = 60;
const MAX_CACHE_ENTRIES = 50;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000; // 10 seconds

function fetchWithTimeout(url: string, options: RequestInit & { next?: { revalidate?: number } } = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

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

const memoryCache = new LRUCache(MAX_CACHE_ENTRIES);

/**
 * Request coalescing for the expensive full-history fetches.
 *
 * A static build renders ~130 pages across many workers, and a cold serverless
 * instance can take several concurrent requests before the first one populates
 * the cache. Each of those would independently kick off the same ~14-request
 * Coinbase crawl and rate-limit the others out. Callers that arrive while a
 * fetch is already in flight now await that same promise instead.
 */
const inflight = new Map<string, Promise<[number, number][]>>();

function coalesced(key: string, run: () => Promise<[number, number][]>): Promise<[number, number][]> {
    const existing = inflight.get(key);
    if (existing) return existing;
    const promise = run().finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
}

export type Provider = 'kraken' | 'coinbase';

/**
 * Coerce an untrusted `provider` argument to a known value.
 *
 * A TypeScript union is erased at runtime, and every exported function in a
 * 'use server' file is a PUBLIC HTTP endpoint that anyone can call with
 * arbitrary arguments. That mattered here: `keyFor` mapped every string that
 * was not exactly 'kraken' to the COINBASE cache key, while
 * `fetchProviderHistory` ran its KRAKEN branch for anything that was not
 * exactly 'coinbase'. So a single call with provider="pwned" wrote Kraken's
 * weekly-interpolated series into the Coinbase slot, and for the next hour
 * every visitor asking for Coinbase got straight-lined data instead of real
 * daily candles.
 *
 * Normalising once at every entry point means the cache key and the branch that
 * produced the data can never disagree again.
 */
const normalizeProvider = (provider: unknown): Provider =>
    provider === 'coinbase' ? 'coinbase' : 'kraken';

/** Fill day gaps between points with linear interpolation. Pure UTC ms math — no local-time day shifts. */
function interpolateDaily(points: [number, number][]): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i < points.length - 1; i++) {
        const [startTs, startPrice] = points[i];
        const [endTs, endPrice] = points[i + 1];
        out.push([startTs, startPrice]);
        const daysDiff = Math.round((endTs - startTs) / DAY_MS);
        if (daysDiff > 1) {
            const priceStep = (endPrice - startPrice) / daysDiff;
            for (let d = 1; d < daysDiff; d++) {
                out.push([startTs + d * DAY_MS, startPrice + priceStep * d]);
            }
        }
    }
    if (points.length > 0) out.push(points[points.length - 1]);
    return out;
}

/**
 * Prepend real daily market prices (blockchain.info, 2010-2015) for the era
 * before the provider's own candles begin. Replaces the old synthetic
 * $0.05-anchor linear interpolation.
 */
async function prependHistorical(points: [number, number][]): Promise<[number, number][]> {
    const { BTC_HISTORICAL_DAILY } = await import('@/data/btcHistorical');
    if (points.length === 0) return [...BTC_HISTORICAL_DAILY];
    const firstTs = points[0][0];
    const pre = BTC_HISTORICAL_DAILY.filter(([ts]) => ts < firstTs);
    return pre.length > 0 ? [...pre, ...points] : points;
}

// Both providers fetch their full available history; callers slice per request.
// `revalidate` is the fetch cache lifetime; it also sets the floor on the effective
// `revalidate` of any route that calls this. See DAILY_PRICE_REVALIDATE.
async function fetchProviderHistory(
    provider: 'kraken' | 'coinbase',
    revalidate: number = HISTORY_REVALIDATE,
): Promise<[number, number][]> {
    const dailyPrices: [number, number][] = [];

    {
        if (provider === 'coinbase') {
            // Coinbase Exchange Public API
            // Granularity 86400 = 1 day. Max 300 candles per request.
            // To get full history (e.g., 2015-2024 ~3300 days), we need ~11 requests.
            // We'll fetch in parallel chunks.

            // 1. Calculate required chunks.
            // Always fetch the FULL 2015→now range regardless of the requested window:
            // consumers (opportunity cost, cost basis) read dates outside the window, and a
            // partial fetch previously caused those dates to be linearly fabricated from the
            // 2010 genesis point. Full history is ~14 chunks and cached for an hour.
            const chunks: { start: string; end: string }[] = [];
            let currentEnd = Date.now();
            const coinbaseLaunchMs = Date.UTC(2015, 0, 1);
            const effectiveStart = coinbaseLaunchMs;

            // Safety: if effectiveStart > currentEnd, just fetch one recent chunk
            if (effectiveStart < currentEnd) {
                while (currentEnd > effectiveStart) {
                    // Coinbase accepts start/end in ISO.
                    // Max 300 days = 300 * 86400 * 1000 ms
                    const chunkDuration = 300 * 86400 * 1000;
                    const chunkStart = Math.max(effectiveStart, currentEnd - chunkDuration);

                    chunks.push({
                        start: new Date(chunkStart).toISOString(),
                        end: new Date(currentEnd).toISOString()
                    });

                    currentEnd = chunkStart;

                    // Safety break for infinite loops
                    if (chunks.length > 50) break;
                }
            } else {
                chunks.push({
                    start: new Date(effectiveStart).toISOString(),
                    end: new Date(currentEnd).toISOString()
                });
            }

            // 2. Fetch chunks with limited concurrency to avoid 429s
            const fetchChunk = async (chunk: { start: string, end: string }) => {
                const url = `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400&start=${chunk.start}&end=${chunk.end}`;
                // Coinbase rate-limits hard, and a static build fans out across many
                // workers at once. Without a backoff the whole Coinbase path 429s and
                // silently degrades to Kraken — whose series is interpolated from
                // WEEKLY closes, which would quietly flatten any day-of-week analysis.
                let lastStatus = 0;
                for (let attempt = 0; attempt < 4; attempt++) {
                    if (attempt > 0) {
                        await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1)));
                    }
                    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'BitcoinDcaBot/1.0' }, next: { revalidate } }, 15_000);
                    if (res.ok) {
                        const json = await res.json();
                        if (!Array.isArray(json)) throw new Error('Coinbase returned unexpected candle payload');
                        return json;
                    }
                    lastStatus = res.status;
                    // Only 429 and 5xx are worth retrying; a 400 will never succeed.
                    if (res.status !== 429 && res.status < 500) break;
                }
                // A dropped chunk must fail the whole fetch — returning [] here would leave a
                // 300-day hole that gets silently interpolated as a straight line.
                throw new Error(`Coinbase chunk ${chunk.start} failed: ${lastStatus}`);
            };

            const CONCURRENCY = 3;
            const chunkResults: number[][][] = [];
            for (let i = 0; i < chunks.length; i += CONCURRENCY) {
                const batch = chunks.slice(i, i + CONCURRENCY);
                const batchResults = await Promise.all(batch.map(fetchChunk));
                chunkResults.push(...batchResults);
            }

            // 3. Flatten and Deduplicate
            const candles = chunkResults.flat();

            // Deduplicate by timestamp (index 0)
            const map = new Map<number, number>(); // timestamp -> close
            candles.forEach((c: number[]) => {
                // Coinbase: [time, low, high, open, close, volume]. time is seconds.
                // A non-array element (an error object inside an otherwise-array body)
                // used to index to undefined and slip through as NaN.
                if (!Array.isArray(c)) return;
                const ts = Number(c[0]) * 1000;
                const close = Number(c[4]);
                if (Number.isFinite(ts) && ts > 0 && Number.isFinite(close) && close > 0) {
                    map.set(ts, close);
                }
            });

            // Convert to array and sort
            const coinbaseDailyPrices: [number, number][] = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);

            // If every chunk parsed to zero usable candles the payload shape changed.
            // Without this the fetch still "succeeded" on the strength of the
            // blockchain.info prepend alone, and the UI presented a 2010-2015 series
            // as if it were current history.
            if (coinbaseDailyPrices.length === 0) throw new Error('Coinbase returned no usable candles');

            dailyPrices.push(...interpolateDaily(await prependHistorical(coinbaseDailyPrices)));

        } else {
            // Kraken (Existing Logic)
            const url = `https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080`; // Weekly

            const response = await fetchWithTimeout(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BitcoinDcaBot/1.0)' },
                next: { revalidate }
            }, 15_000);

            if (!response.ok) throw new Error(`API Error: ${response.status}`);

            const json = await response.json();
            if (json && Array.isArray(json.error) && json.error.length > 0) {
                throw new Error(`API Error: ${json.error.join(', ')}`);
            }

            // Object.keys(undefined) throws a bare TypeError; when Kraken answers with
            // an envelope that has no `result` we want the named error so the provider
            // fallback below logs something meaningful.
            const result = json?.result;
            if (!result || typeof result !== 'object') throw new Error('Invalid data format from Kraken');
            const pairKey = Object.keys(result).find(k => k !== 'last');
            if (!pairKey || !Array.isArray(result[pairKey])) throw new Error('Invalid data format from Kraken');

            const weeklyCandles = result[pairKey];
            weeklyCandles.sort((a: number[], b: number[]) => a[0] - b[0]);

            // Kraken's item[0] is the interval START but item[4] is its CLOSE, so
            // pairing them dates each weekly close ~6 days early — a look-ahead that
            // makes the interpolated daily series systematically wrong. Anchor the
            // close at the end of its week, and clamp the still-open final candle to
            // now so it is not dated in the future.
            const WEEK_SECONDS = 604_800;
            const nowMs = Date.now();
            const weeklyPoints: [number, number][] = weeklyCandles
                .map((item: number[]): [number, number] => [
                    Math.min((item[0] + WEEK_SECONDS) * 1000, nowMs),
                    parseFloat(String(item[4])),
                ])
                .filter(([ts, price]: [number, number]) => Number.isFinite(ts) && Number.isFinite(price) && price > 0);

            if (weeklyPoints.length === 0) throw new Error('Kraken returned no usable candles');

            dailyPrices.push(...interpolateDaily(await prependHistorical(weeklyPoints)));
        }
    }

    if (dailyPrices.length === 0) throw new Error(`${provider} returned no price data`);
    return dailyPrices;
}

export async function getBitcoinPriceHistory(
    from: number,
    to: number,
    providerArg: Provider = 'kraken',
    revalidateArg: number = HISTORY_REVALIDATE,
): Promise<[number, number][]> {
    // Untrusted input — see normalizeProvider. Everything below uses `provider`.
    const provider = normalizeProvider(providerArg);
    const revalidate = normalizeRevalidate(revalidateArg, HISTORY_REVALIDATE);
    // Both providers now return their full history, so cache provider-wide and slice per request.
    const keyFor = (p: Provider) => p === 'kraken' ? 'kraken_full_v2' : 'coinbase_full_v2';
    const cacheKey = keyFor(provider);

    const readCache = (): [number, number][] | null => {
        const cached = memoryCache.get(cacheKey);
        if (cached && differenceInMinutes(Date.now(), cached.timestamp) < CACHE_DURATION_MINUTES) {
            return cached.data;
        }
        return null;
    };

    // A short lead-in before `from` guarantees the calculator has a last-known price
    // for the first purchase date even when candles are sparse.
    const slice = (data: [number, number][]): [number, number][] => {
        const leadIn = from - 14 * DAY_MS;
        return data.filter(([ts]) => ts >= leadIn && ts <= to);
    };

    const cachedData = readCache();
    if (cachedData) return slice(cachedData);

    const fallback: 'kraken' | 'coinbase' = provider === 'kraken' ? 'coinbase' : 'kraken';
    try {
        const data = await coalesced(cacheKey, () => fetchProviderHistory(provider, revalidate));
        memoryCache.set(cacheKey, { timestamp: Date.now(), data });
        return slice(data);
    } catch (error) {
        console.error(`[getBitcoinPriceHistory] ${provider} failed, trying ${fallback}:`, error);
        try {
            const fallbackKey = keyFor(fallback);
            const cachedFallback = memoryCache.get(fallbackKey);
            if (cachedFallback && differenceInMinutes(Date.now(), cachedFallback.timestamp) < CACHE_DURATION_MINUTES) {
                return slice(cachedFallback.data);
            }
            const data = await coalesced(fallbackKey, () => fetchProviderHistory(fallback, revalidate));
            memoryCache.set(fallbackKey, { timestamp: Date.now(), data });
            return slice(data);
        } catch (fallbackError) {
            console.error(`[getBitcoinPriceHistory] fallback ${fallback} also failed:`, fallbackError);
            throw fallbackError;
        }
    }
}

// Comparison series are fetched ONCE over the full usable range and sliced per
// request. Keying the cache on exact `from`/`to` milliseconds (as this used to)
// minted a fresh key for every date range a user touched, so the cache never hit
// and thrashed the 50-entry LRU — every keystroke re-hit Yahoo.
const ASSET_HISTORY_START = Date.UTC(2009, 0, 1);

/**
 * The only symbols this site actually charts. Same reasoning as
 * normalizeProvider: `symbol` arrives from a public endpoint, is interpolated
 * into an outbound URL, AND becomes a cache key. Unbounded keys would let a
 * caller evict the real series from the 50-entry LRU at will, and an
 * unrestricted symbol turns the action into a generic Yahoo Finance proxy.
 */
const ALLOWED_ASSET_SYMBOLS = new Set(['^SP500TR', '^GSPC', 'GC=F']);

export async function getAssetPriceHistory(symbol: string, from: number, to: number): Promise<[number, number][] | null> {
    if (!ALLOWED_ASSET_SYMBOLS.has(symbol)) return null;
    const cacheKey = `asset_${symbol}`;

    // A short lead-in guarantees a last-known bar for the first purchase date even
    // when the range starts on a weekend or market holiday.
    const slice = (data: [number, number][]): [number, number][] =>
        data.filter(([ts]) => ts >= from - 14 * DAY_MS && ts <= to);

    const cached = memoryCache.get(cacheKey);
    if (cached) {
        const age = differenceInMinutes(Date.now(), cached.timestamp);
        if (age < CACHE_DURATION_MINUTES) {
            return slice(cached.data);
        }
    }

    try {
        const period1 = Math.floor(ASSET_HISTORY_START / 1000);
        const period2 = Math.floor(Date.now() / 1000);

        // Use Yahoo Finance v8 chart API (more reliable than v7 download)
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;

        const response = await fetchWithTimeout(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            next: { revalidate: 3600 }
        });

        if (!response.ok) return null;

        const json = await response.json();
        const result = json?.chart?.result?.[0];
        if (!result) return null;

        const timestamps = result.timestamp;
        const closes = result.indicators?.quote?.[0]?.close;

        // Yahoo sometimes returns the chart envelope with `null` (or an object) where
        // the arrays should be. `.length` on those is undefined, so the old truthiness
        // check passed and the loop silently produced an empty series.
        if (!Array.isArray(timestamps) || !Array.isArray(closes) || timestamps.length === 0) return null;

        const data: [number, number][] = [];
        for (let i = 0; i < timestamps.length; i++) {
            const ts = Number(timestamps[i]) * 1000; // Convert to milliseconds
            // `!isNaN(close)` passed for numeric *strings*, which then flowed into the
            // charts as strings. Coerce first, then require a finite positive number.
            const close = Number(closes[i]);
            if (Number.isFinite(ts) && ts > 0 && Number.isFinite(close) && close > 0) {
                data.push([ts, close]);
            }
        }

        if (data.length === 0) return null;

        data.sort((a, b) => a[0] - b[0]);
        memoryCache.set(cacheKey, { timestamp: Date.now(), data });
        return slice(data);
    } catch {
        return null;
    }
}

export async function getCpiData(from: number, to: number): Promise<[number, number][] | null> {
    const apiKey = process.env.FRED_API_KEY;
    if (!apiKey) return null;

    // Same fix as getAssetPriceHistory: one cached series, sliced per request.
    const cacheKey = 'cpi_full';

    const slice = (data: [number, number][]): [number, number][] =>
        data.filter(([ts]) => ts >= from - 40 * DAY_MS && ts <= to);

    const cached = memoryCache.get(cacheKey);
    if (cached) {
        const age = differenceInMinutes(Date.now(), cached.timestamp);
        if (age < 1440) { // 24h cache for CPI (monthly data)
            return slice(cached.data);
        }
    }

    try {
        const startDate = new Date(ASSET_HISTORY_START).toISOString().split('T')[0];
        const endDate = new Date(Date.now()).toISOString().split('T')[0];
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&api_key=${apiKey}&file_type=json&observation_start=${startDate}&observation_end=${endDate}`;

        const response = await fetch(url, {
            next: { revalidate: 86400 }
        });

        if (!response.ok) return null;

        const json = await response.json();
        if (!json.observations || !Array.isArray(json.observations)) return null;

        const data: [number, number][] = [];
        for (const obs of json.observations) {
            // A non-object entry made `obs.date` throw and killed the whole series.
            if (!obs || typeof obs !== 'object') continue;
            const dateTs = new Date(obs.date).getTime();
            // FRED writes "." for a month with no reading; Number(".") is NaN so it drops.
            const value = Number(obs.value);
            if (Number.isFinite(dateTs) && Number.isFinite(value) && value > 0) {
                data.push([dateTs, value]);
            }
        }

        if (data.length === 0) return null;

        data.sort((a, b) => a[0] - b[0]);
        memoryCache.set(cacheKey, { timestamp: Date.now(), data });
        return slice(data);
    } catch {
        return null;
    }
}

export async function getMempoolFees(): Promise<{ highFee: number; mediumFee: number; lowFee: number } | null> {
    try {
        const response = await fetchWithTimeout('https://mempool.space/api/v1/fees/precise', {
            next: { revalidate: 30 },
        });
        if (!response.ok) return null;
        const json = await response.json();
        // These three were handed to the widget completely unchecked. When
        // mempool.space answers with an error envelope ({"error":"..."}) or renames a
        // field, the values are undefined and the widget rendered "NaN sat/vB" in
        // place of its own "Data unavailable" state.
        const highFee = Number(json?.fastestFee);
        const mediumFee = Number(json?.halfHourFee);
        const lowFee = Number(json?.hourFee);
        if (![highFee, mediumFee, lowFee].every((f) => Number.isFinite(f) && f > 0)) return null;
        return { highFee, mediumFee, lowFee };
    } catch {
        return null;
    }
}

export async function getFearGreedIndex(): Promise<{ value: number; classification: string } | null> {
    try {
        const response = await fetchWithTimeout('https://api.alternative.me/fng/?limit=1', {
            next: { revalidate: 300 },
        });
        if (!response.ok) return null;
        const json = await response.json();
        if (!json.data || !Array.isArray(json.data) || json.data.length === 0) return null;
        const entry = json.data[0];
        // parseInt(undefined, 10) is NaN, so a renamed field rendered "NaN/100" next
        // to an empty classification. Both fields must be present and in range.
        const value = Number(entry?.value);
        const classification = typeof entry?.value_classification === 'string'
            ? entry.value_classification.trim()
            : '';
        if (!Number.isFinite(value) || value < 0 || value > 100) return null;
        if (classification === '') return null;
        return { value: Math.round(value), classification };
    } catch {
        return null;
    }
}

export async function getBlockHeight(): Promise<number | null> {
    try {
        const response = await fetchWithTimeout('https://mempool.space/api/v1/blocks/tip/height', {
            next: { revalidate: 30 },
        });
        if (!response.ok) return null;
        const text = await response.text();
        // The endpoint answers with bare plaintext digits. parseInt would happily
        // accept a digit-prefixed error body ("503 Service Unavailable" -> 503) and
        // hand the halving countdown a nonsense block height, so require the whole
        // body to be an integer.
        const trimmed = text.trim();
        if (!/^\d+$/.test(trimmed)) return null;
        const height = Number(trimmed);
        return Number.isSafeInteger(height) && height > 0 ? height : null;
    } catch {
        return null;
    }
}

export async function getHashRateDifficulty(): Promise<{
    hashrate: number;
    difficulty: number;
    adjustmentPercent: number;
    blocksUntilAdjustment: number;
    estimatedRetargetDate: string;
} | null> {
    try {
        const [diffRes, hashRes] = await Promise.all([
            fetchWithTimeout('https://mempool.space/api/v1/difficulty-adjustment', { next: { revalidate: 120 } }),
            fetchWithTimeout('https://mempool.space/api/v1/mining/hashrate/1m', { next: { revalidate: 300 } }),
        ]);
        if (!diffRes.ok || !hashRes.ok) return null;
        const diffJson = await diffRes.json();
        const hashJson = await hashRes.json();
        if (!diffJson || typeof diffJson !== 'object') return null;
        if (!hashJson || typeof hashJson !== 'object') return null;

        // Missing required fields mean the API shape drifted — say "unavailable",
        // never render a zero hashrate as fact.
        const hashrate = Number(hashJson.currentHashrate);
        if (!Number.isFinite(hashrate) || hashrate <= 0) return null;

        const difficulty = Number(hashJson.currentDifficulty);
        const adjustmentPercent = Number(diffJson.difficultyChange);
        const blocksUntilAdjustment = Number(diffJson.remainingBlocks);

        // `new Date(garbage).toISOString()` throws a RangeError, which the catch below
        // turned into a null for the entire widget. mempool.space sends an epoch in ms,
        // but accept a date string too; anything unparseable becomes the empty string
        // the UI already treats as "no date".
        const rawRetarget = diffJson.estimatedRetargetDate;
        let estimatedRetargetDate = '';
        if (typeof rawRetarget === 'number' || typeof rawRetarget === 'string') {
            const parsed = new Date(rawRetarget);
            if (Number.isFinite(parsed.getTime())) estimatedRetargetDate = parsed.toISOString();
        }

        return {
            hashrate,
            difficulty: Number.isFinite(difficulty) && difficulty > 0 ? difficulty : 0,
            adjustmentPercent: Number.isFinite(adjustmentPercent) ? adjustmentPercent : 0,
            blocksUntilAdjustment: Number.isFinite(blocksUntilAdjustment) && blocksUntilAdjustment >= 0 ? blocksUntilAdjustment : 0,
            estimatedRetargetDate,
        };
    } catch {
        return null;
    }
}

export async function getCirculatingSupply(): Promise<number | null> {
    try {
        const response = await fetchWithTimeout('https://blockchain.info/q/totalbc', {
            next: { revalidate: 300 },
        });
        if (!response.ok) return null;
        const text = await response.text();
        // blockchain.info serves bare plaintext satoshis, but returns an HTML/plaintext
        // error page under load. parseInt accepted a digit-prefixed error body and the
        // scarcity widget rendered the result as circulating supply, so require the
        // whole body to be an integer and bound it by the 21M cap.
        const trimmed = text.trim();
        if (!/^\d+$/.test(trimmed)) return null;
        const sats = Number(trimmed);
        if (!Number.isFinite(sats) || sats <= 0 || sats > 21_000_000 * 100_000_000) return null;
        return sats;
    } catch {
        return null;
    }
}

export async function getLightningStats(): Promise<{
    nodeCount: number;
    channelCount: number;
    totalCapacityBtc: number;
} | null> {
    try {
        const response = await fetchWithTimeout('https://mempool.space/api/v1/lightning/statistics/latest', {
            next: { revalidate: 600 },
        });
        if (!response.ok) return null;
        const json = await response.json();
        const latest = json?.latest;
        // Shape drift must read as "unavailable", not a Lightning network of zero nodes
        if (!latest || typeof latest !== 'object') return null;
        // mempool.space returns these as numeric strings on some deployments, which
        // Number.isFinite rejected outright — coerce first so a valid string payload
        // still renders, and only then decide whether the value is usable.
        const nodeCount = Number(latest.node_count);
        if (!Number.isFinite(nodeCount) || nodeCount <= 0) return null;
        const channelCount = Number(latest.channel_count);
        const totalCapacitySats = Number(latest.total_capacity);
        return {
            nodeCount,
            channelCount: Number.isFinite(channelCount) && channelCount >= 0 ? channelCount : 0,
            totalCapacityBtc: (Number.isFinite(totalCapacitySats) && totalCapacitySats >= 0 ? totalCapacitySats : 0) / 100_000_000,
        };
    } catch {
        return null;
    }
}

export async function getBitcoinDominance(): Promise<{
    dominancePercent: number;
    btcMarketCap: number;
    totalMarketCap: number;
} | null> {
    try {
        const response = await fetchWithTimeout('https://api.coingecko.com/api/v3/global', {
            next: { revalidate: 300 }, // 5min revalidate for rate limits
        });
        if (!response.ok) return null;
        const json = await response.json();
        const data = json?.data;
        if (!data || typeof data !== 'object') return null;
        // `?? 0` only defended against null/undefined: any other junk (a string, an
        // error object) flowed through and produced a NaN btcMarketCap rendered as
        // "$NaN" beside a plausible-looking dominance percentage.
        const totalMarketCapUsd = Number(data.total_market_cap?.usd);
        const dominancePct = Number(data.market_cap_percentage?.btc);
        if (!Number.isFinite(dominancePct) || dominancePct <= 0 || dominancePct > 100) return null;
        if (!Number.isFinite(totalMarketCapUsd) || totalMarketCapUsd <= 0) return null;
        return {
            dominancePercent: dominancePct,
            btcMarketCap: totalMarketCapUsd * (dominancePct / 100),
            totalMarketCap: totalMarketCapUsd,
        };
    } catch {
        return null;
    }
}

// getM2Data was removed along with the chart's M2 overlay: normalizing M2 onto the
// portfolio's axis implied a correlation the data does not support. FRED is still
// used for CPI (getCpiData above).

export async function getPurchasingPowerData(): Promise<{
    cpiStart: number;
    cpiNow: number;
    btcPriceStart: number;
    btcPriceNow: number;
} | null> {
    try {
        const jan2015 = new Date('2015-01-01').getTime();
        const now = Date.now();
        const [cpiData, btcPriceNow] = await Promise.all([
            getCpiData(jan2015, now),
            getCurrentBitcoinPrice(),
        ]);
        if (!cpiData || cpiData.length < 2) return null;
        const cpiStart = cpiData[0][1];
        const cpiNow = cpiData[cpiData.length - 1][1];
        // The widget divides by cpiStart, so a zero or non-finite reading would render
        // "Infinity%" / "$NaN" instead of the card's own empty state.
        if (!Number.isFinite(cpiStart) || cpiStart <= 0) return null;
        if (!Number.isFinite(cpiNow) || cpiNow <= 0) return null;
        if (!Number.isFinite(btcPriceNow) || btcPriceNow <= 0) return null;
        return {
            cpiStart,
            cpiNow,
            btcPriceStart: 314, // BTC price Jan 2015 — historical fact
            btcPriceNow,
        };
    } catch {
        return null;
    }
}

export async function getRecentBlocks(): Promise<{
    height: number;
    timestamp: number;
    txCount: number;
    size: number;
}[] | null> {
    try {
        const response = await fetchWithTimeout('https://mempool.space/api/v1/blocks', {
            next: { revalidate: 30 },
        });
        if (!response.ok) return null;
        const json = await response.json();
        if (!Array.isArray(json) || json.length === 0) return null;
        // This used to assert the element shape with a type annotation and return it
        // unchecked. A renamed field (or an error object inside the array) yielded
        // `height: undefined`, and the widget crashed outright on
        // `block.height.toLocaleString()` — a whole-page error, not an empty state.
        const blocks: { height: number; timestamp: number; txCount: number; size: number }[] = [];
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
        return blocks.length > 0 ? blocks : null;
    } catch {
        return null;
    }
}

export async function getCurrentBitcoinPriceWithChange(providerArg: Provider = 'kraken'): Promise<{ price: number; open24h: number }> {
    const provider = normalizeProvider(providerArg);
    try {
        let url = '';
        if (provider === 'coinbase') {
            url = 'https://api.exchange.coinbase.com/products/BTC-USD/ticker';
        } else {
            url = 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD';
        }

        const response = await fetchWithTimeout(url, { headers: { 'User-Agent': 'BitcoinDcaBot/1.0' }, next: { revalidate: 30 } });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const json = await response.json();

        let price: number;
        let open24h: number;
        if (provider === 'coinbase') {
            price = parseFloat(json.price);
            open24h = parseFloat(json.open_24h ?? json.price);
        } else {
            if (json && Array.isArray(json.error) && json.error.length > 0) {
                throw new Error(`API Error: ${json.error.join(', ')}`);
            }
            const result = json?.result;
            if (!result) throw new Error('Invalid response from Kraken');
            const pairKey = Object.keys(result)[0];
            const ticker = result[pairKey];
            price = parseFloat(ticker?.c?.[0] ?? '0');
            open24h = parseFloat(ticker?.o ?? '0');
        }
        if (!Number.isFinite(price) || price <= 0) throw new Error(`Invalid price from ${provider}`);
        if (!Number.isFinite(open24h) || open24h <= 0) open24h = price;
        return { price, open24h };
    } catch (error) {
        console.error(`[getCurrentBitcoinPriceWithChange] ${provider} failed:`, error);
        throw error;
    }
}

export async function getCurrentBitcoinPrice(
    providerArg: Provider = 'kraken',
    revalidateArg: number = DEFAULT_PRICE_REVALIDATE,
): Promise<number> {
    const provider = normalizeProvider(providerArg);
    const revalidate = normalizeRevalidate(revalidateArg, DEFAULT_PRICE_REVALIDATE);
    try {
        let url = '';
        if (provider === 'coinbase') {
            url = 'https://api.exchange.coinbase.com/products/BTC-USD/ticker';
        } else {
            url = 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD';
        }

        const response = await fetchWithTimeout(url, { headers: { 'User-Agent': 'BitcoinDcaBot/1.0' }, next: { revalidate } });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const json = await response.json();

        let price: number;
        if (provider === 'coinbase') {
            price = parseFloat(json.price);
        } else {
            if (json && Array.isArray(json.error) && json.error.length > 0) {
                throw new Error(`API Error: ${json.error.join(', ')}`);
            }
            const result = json?.result;
            if (!result) throw new Error('Invalid response from Kraken');
            const pairKey = Object.keys(result)[0];
            price = parseFloat(result[pairKey]?.c?.[0] ?? '0');
        }
        if (!Number.isFinite(price) || price <= 0) throw new Error(`Invalid price from ${provider}`);
        return price;
    } catch (error) {
        console.error(`[getCurrentBitcoinPrice] ${provider} failed:`, error);
        throw error;
    }
}

// ── Profitable windows ─────────────────────────────────────────────────────────
// "X% of all N-month DCA windows in history ended in profit" — computed over the
// full price history, windows stepped weekly. Fee-free (stated in the UI).

let windowsCache: Map<string, { timestamp: number; result: { profitablePercent: number; windowCount: number; durationDays: number } }> | null = null;

export async function getProfitableWindows(
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly',
    durationDays: number,
): Promise<{ profitablePercent: number; windowCount: number; durationDays: number } | null> {
    try {
        // Bucket duration so the cache stays small and results stable
        const bucketed = Math.max(90, Math.round(durationDays / 30) * 30);
        const cacheKey = `${frequency}_${bucketed}`;
        if (!windowsCache) windowsCache = new Map();
        const cached = windowsCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 60 * 60 * 1000) return cached.result;

        const history = await getBitcoinPriceHistory(0, Date.now(), 'kraken');
        if (!history || history.length < 400) return null;

        // Daily series indexed by UTC day for O(1) lookups
        const firstDay = Math.floor(history[0][0] / DAY_MS);
        const lastDay = Math.floor(history[history.length - 1][0] / DAY_MS);
        const prices = new Float64Array(lastDay - firstDay + 1);
        // The gap-fill below seeds every empty day from this value, and the window
        // loop divides by it. A zero/non-finite first price would make every 1/pᵢ
        // Infinity and report 100% of windows profitable.
        if (!Number.isFinite(history[0][1]) || history[0][1] <= 0) return null;
        let lastPrice = history[0][1];
        for (const [ts, price] of history) {
            const idx = Math.floor(ts / DAY_MS) - firstDay;
            if (idx >= 0 && idx < prices.length) prices[idx] = price;
        }
        for (let i = 0; i < prices.length; i++) {
            if (prices[i] > 0) lastPrice = prices[i];
            else prices[i] = lastPrice;
        }

        const stepDays = frequency === 'daily' ? 1 : frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : 30;
        const totalDays = prices.length;
        if (bucketed >= totalDays) return null;

        let windowCount = 0;
        let profitable = 0;
        // Window start advances weekly; $1 per purchase, profit iff endPrice·Σ(1/pᵢ) > n
        for (let start = 0; start + bucketed < totalDays; start += 7) {
            let invSum = 0;
            let n = 0;
            for (let d = start; d <= start + bucketed; d += stepDays) {
                invSum += 1 / prices[d];
                n++;
            }
            const endValue = prices[start + bucketed] * invSum;
            windowCount++;
            if (endValue > n) profitable++;
        }

        if (windowCount === 0) return null;
        const profitablePercent = (profitable / windowCount) * 100;
        if (!Number.isFinite(profitablePercent)) return null;
        const result = {
            profitablePercent,
            windowCount,
            durationDays: bucketed,
        };
        windowsCache.set(cacheKey, { timestamp: Date.now(), result });
        return result;
    } catch (error) {
        console.error('[getProfitableWindows] failed:', error);
        return null;
    }
}

// ── Hero headline stat ─────────────────────────────────────────────────────────
// The live number behind the hero: what $50/week for the last 5 years is worth today.

export async function getHeroStat(): Promise<{
    invested: number;
    value: number;
    roi: number;
    btc: number;
} | null> {
    try {
        const { calculateDca } = await import('@/utils/dca');
        const now = Date.now();
        const start = now - Math.round(5 * 365.25) * DAY_MS;
        const [history, price] = await Promise.all([
            getBitcoinPriceHistory(start, now, 'kraken'),
            getCurrentBitcoinPrice('kraken').catch(() => null),
        ]);
        if (!history || history.length === 0) return null;
        const result = calculateDca(
            {
                amount: 50,
                frequency: 'weekly',
                startDate: new Date(start),
                endDate: new Date(now),
                feePercentage: 0,
                priceMode: 'api',
                manualPrice: 0,
            },
            history,
            price,
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
        };
    } catch (error) {
        console.error('[getHeroStat] failed:', error);
        return null;
    }
}

// ── Live FX rates ──────────────────────────────────────────────────────────────
// ECB reference rates via frankfurter.app (no API key). Falls back to the
// hardcoded defaults in CurrencyContext when unavailable.

export type FxRates = Partial<Record<'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY', number>>;

let fxCache: { timestamp: number; rates: FxRates } | null = null;
const FX_CACHE_MS = 12 * 60 * 60 * 1000; // 12h — ECB updates once per business day

export async function getFxRates(): Promise<FxRates | null> {
    if (fxCache && Date.now() - fxCache.timestamp < FX_CACHE_MS) {
        return fxCache.rates;
    }
    try {
        const response = await fetchWithTimeout(
            'https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,CAD,AUD,JPY',
            { next: { revalidate: 43200 } },
        );
        if (!response.ok) return fxCache?.rates ?? null;
        const json = await response.json();
        const raw = json?.rates;
        if (!raw || typeof raw !== 'object') return fxCache?.rates ?? null;

        const rates: FxRates = {};
        for (const code of ['EUR', 'GBP', 'CAD', 'AUD', 'JPY'] as const) {
            const v = Number(raw[code]);
            if (Number.isFinite(v) && v > 0) rates[code] = v;
        }
        if (Object.keys(rates).length === 0) return fxCache?.rates ?? null;

        fxCache = { timestamp: Date.now(), rates };
        return rates;
    } catch {
        return fxCache?.rates ?? null;
    }
}
