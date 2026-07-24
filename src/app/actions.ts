'use server';

import { differenceInMinutes } from 'date-fns';

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

const COINBASE_CACHE_DURATION = 3600; // 1 hour

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

const GENESIS_TS = Date.UTC(2010, 0, 1);

// Both providers fetch their full available history; callers slice per request.
async function fetchProviderHistory(provider: 'kraken' | 'coinbase'): Promise<[number, number][]> {
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
                const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'BitcoinDcaBot/1.0' }, next: { revalidate: COINBASE_CACHE_DURATION } }, 15_000);
                // A dropped chunk must fail the whole fetch — returning [] here would leave a
                // 300-day hole that gets silently interpolated as a straight line.
                if (!res.ok) throw new Error(`Coinbase chunk ${chunk.start} failed: ${res.status}`);
                const json = await res.json();
                if (!Array.isArray(json)) throw new Error('Coinbase returned unexpected candle payload');
                return json;
            };

            const CONCURRENCY = 5;
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
                const ts = c[0] * 1000;
                const close = c[4];
                if (Number.isFinite(ts) && Number.isFinite(close) && close > 0) {
                    map.set(ts, close);
                }
            });

            // Convert to array and sort
            const coinbaseDailyPrices: [number, number][] = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);

            // Add Genesis Point + interpolate gap (same as Kraken)
            if (coinbaseDailyPrices.length > 0 && coinbaseDailyPrices[0][0] > GENESIS_TS) {
                coinbaseDailyPrices.unshift([GENESIS_TS, 0.05]);
            }

            dailyPrices.push(...interpolateDaily(coinbaseDailyPrices));

        } else {
            // Kraken (Existing Logic)
            const url = `https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080`; // Weekly

            const response = await fetchWithTimeout(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BitcoinDcaBot/1.0)' },
                next: { revalidate: 3600 }
            }, 15_000);

            if (!response.ok) throw new Error(`API Error: ${response.status}`);

            const json = await response.json();
            if (json && Array.isArray(json.error) && json.error.length > 0) {
                throw new Error(`API Error: ${json.error.join(', ')}`);
            }

            const result = json.result;
            const pairKey = Object.keys(result).find(k => k !== 'last');
            if (!pairKey || !Array.isArray(result[pairKey])) throw new Error('Invalid data format from Kraken');

            const weeklyCandles = result[pairKey];
            weeklyCandles.sort((a: number[], b: number[]) => a[0] - b[0]);

            const weeklyPoints: [number, number][] = weeklyCandles
                .map((item: number[]): [number, number] => [item[0] * 1000, parseFloat(String(item[4]))])
                .filter(([ts, price]: [number, number]) => Number.isFinite(ts) && Number.isFinite(price) && price > 0);

            if (weeklyPoints.length === 0) throw new Error('Kraken returned no usable candles');

            // Add Genesis Point
            if (weeklyPoints[0][0] > GENESIS_TS) weeklyPoints.unshift([GENESIS_TS, 0.05]);

            dailyPrices.push(...interpolateDaily(weeklyPoints));
        }
    }

    if (dailyPrices.length === 0) throw new Error(`${provider} returned no price data`);
    return dailyPrices;
}

export async function getBitcoinPriceHistory(from: number, to: number, provider: 'kraken' | 'coinbase' = 'kraken'): Promise<[number, number][]> {
    // Both providers now return their full history, so cache provider-wide and slice per request.
    const keyFor = (p: 'kraken' | 'coinbase') => p === 'kraken' ? 'kraken_full_v2' : 'coinbase_full_v2';
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
        const data = await fetchProviderHistory(provider);
        memoryCache.set(cacheKey, { timestamp: Date.now(), data });
        return slice(data);
    } catch (error) {
        console.error(`[getBitcoinPriceHistory] ${provider} failed, trying ${fallback}:`, error);
        try {
            const data = await fetchProviderHistory(fallback);
            memoryCache.set(keyFor(fallback), { timestamp: Date.now(), data });
            return slice(data);
        } catch (fallbackError) {
            console.error(`[getBitcoinPriceHistory] fallback ${fallback} also failed:`, fallbackError);
            throw fallbackError;
        }
    }
}

export async function getAssetPriceHistory(symbol: string, from: number, to: number): Promise<[number, number][] | null> {
    const cacheKey = `asset_${symbol}_${from}_${to}`;

    const cached = memoryCache.get(cacheKey);
    if (cached) {
        const age = differenceInMinutes(Date.now(), cached.timestamp);
        if (age < CACHE_DURATION_MINUTES) {
            return cached.data;
        }
    }

    try {
        const period1 = Math.floor(from / 1000);
        const period2 = Math.floor(to / 1000);

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

        if (!timestamps || !closes || timestamps.length === 0) return null;

        const data: [number, number][] = [];
        for (let i = 0; i < timestamps.length; i++) {
            const ts = timestamps[i] * 1000; // Convert to milliseconds
            const close = closes[i];
            if (ts && close && !isNaN(close) && close > 0) {
                data.push([ts, close]);
            }
        }

        if (data.length === 0) return null;

        data.sort((a, b) => a[0] - b[0]);
        memoryCache.set(cacheKey, { timestamp: Date.now(), data });
        return data;
    } catch {
        return null;
    }
}

export async function getCpiData(from: number, to: number): Promise<[number, number][] | null> {
    const apiKey = process.env.FRED_API_KEY;
    if (!apiKey) return null;

    const cacheKey = `cpi_${from}_${to}`;

    const cached = memoryCache.get(cacheKey);
    if (cached) {
        const age = differenceInMinutes(Date.now(), cached.timestamp);
        if (age < 1440) { // 24h cache for CPI (monthly data)
            return cached.data;
        }
    }

    try {
        const startDate = new Date(from).toISOString().split('T')[0];
        const endDate = new Date(to).toISOString().split('T')[0];
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&api_key=${apiKey}&file_type=json&observation_start=${startDate}&observation_end=${endDate}`;

        const response = await fetch(url, {
            next: { revalidate: 86400 }
        });

        if (!response.ok) return null;

        const json = await response.json();
        if (!json.observations || !Array.isArray(json.observations)) return null;

        const data: [number, number][] = [];
        for (const obs of json.observations) {
            const dateTs = new Date(obs.date).getTime();
            const value = parseFloat(obs.value);
            if (!isNaN(dateTs) && !isNaN(value) && value > 0) {
                data.push([dateTs, value]);
            }
        }

        if (data.length === 0) return null;

        data.sort((a, b) => a[0] - b[0]);
        memoryCache.set(cacheKey, { timestamp: Date.now(), data });
        return data;
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
        return {
            highFee: json.fastestFee,
            mediumFee: json.halfHourFee,
            lowFee: json.hourFee,
        };
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
        return {
            value: parseInt(entry.value, 10),
            classification: entry.value_classification,
        };
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
        const height = parseInt(text, 10);
        return isNaN(height) ? null : height;
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

        // Missing required fields mean the API shape drifted — say "unavailable",
        // never render a zero hashrate as fact.
        if (!Number.isFinite(hashJson.currentHashrate) || hashJson.currentHashrate <= 0) return null;

        return {
            hashrate: hashJson.currentHashrate,
            difficulty: Number.isFinite(hashJson.currentDifficulty) ? hashJson.currentDifficulty : 0,
            adjustmentPercent: Number.isFinite(diffJson.difficultyChange) ? diffJson.difficultyChange : 0,
            blocksUntilAdjustment: Number.isFinite(diffJson.remainingBlocks) ? diffJson.remainingBlocks : 0,
            estimatedRetargetDate: diffJson.estimatedRetargetDate ? new Date(diffJson.estimatedRetargetDate).toISOString() : '',
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
        const sats = parseInt(text, 10);
        return isNaN(sats) ? null : sats;
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
        const latest = json.latest;
        // Shape drift must read as "unavailable", not a Lightning network of zero nodes
        if (!latest || !Number.isFinite(latest.node_count) || latest.node_count <= 0) return null;
        return {
            nodeCount: latest.node_count,
            channelCount: Number.isFinite(latest.channel_count) ? latest.channel_count : 0,
            totalCapacityBtc: (Number.isFinite(latest.total_capacity) ? latest.total_capacity : 0) / 100_000_000,
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
        const data = json.data;
        if (!data) return null;
        const totalMarketCapUsd = data.total_market_cap?.usd ?? 0;
        const dominancePct = data.market_cap_percentage?.btc ?? 0;
        if (!Number.isFinite(dominancePct) || dominancePct <= 0) return null;
        return {
            dominancePercent: dominancePct,
            btcMarketCap: totalMarketCapUsd * (dominancePct / 100),
            totalMarketCap: totalMarketCapUsd,
        };
    } catch {
        return null;
    }
}

export async function getM2Data(from: number, to: number): Promise<[number, number][] | null> {
    const apiKey = process.env.FRED_API_KEY;
    if (!apiKey) return null;

    const cacheKey = `m2_${from}_${to}`;

    const cached = memoryCache.get(cacheKey);
    if (cached) {
        const age = differenceInMinutes(Date.now(), cached.timestamp);
        if (age < 1440) { // 24h cache for M2 (monthly data)
            return cached.data;
        }
    }

    try {
        const startDate = new Date(from).toISOString().split('T')[0];
        const endDate = new Date(to).toISOString().split('T')[0];
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=M2SL&api_key=${apiKey}&file_type=json&observation_start=${startDate}&observation_end=${endDate}`;

        const response = await fetch(url, {
            next: { revalidate: 86400 }
        });

        if (!response.ok) return null;

        const json = await response.json();
        if (!json.observations || !Array.isArray(json.observations)) return null;

        const data: [number, number][] = [];
        for (const obs of json.observations) {
            const dateTs = new Date(obs.date).getTime();
            const value = parseFloat(obs.value);
            if (!isNaN(dateTs) && !isNaN(value) && value > 0) {
                data.push([dateTs, value]);
            }
        }

        if (data.length === 0) return null;

        data.sort((a, b) => a[0] - b[0]);
        memoryCache.set(cacheKey, { timestamp: Date.now(), data });
        return data;
    } catch {
        return null;
    }
}

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
        return {
            cpiStart: cpiData[0][1],
            cpiNow: cpiData[cpiData.length - 1][1],
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
        return json.slice(0, 5).map((block: { height: number; timestamp: number; tx_count: number; size: number }) => ({
            height: block.height,
            timestamp: block.timestamp,
            txCount: block.tx_count,
            size: block.size,
        }));
    } catch {
        return null;
    }
}

export async function getCurrentBitcoinPriceWithChange(provider: 'kraken' | 'coinbase' = 'kraken'): Promise<{ price: number; open24h: number }> {
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

export async function getCurrentBitcoinPrice(provider: 'kraken' | 'coinbase' = 'kraken'): Promise<number> {
    try {
        let url = '';
        if (provider === 'coinbase') {
            url = 'https://api.exchange.coinbase.com/products/BTC-USD/ticker';
        } else {
            url = 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD';
        }

        const response = await fetchWithTimeout(url, { headers: { 'User-Agent': 'BitcoinDcaBot/1.0' }, next: { revalidate: 60 } });

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
        if (result.totalInvested <= 0 || !Number.isFinite(result.currentValue)) return null;
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
