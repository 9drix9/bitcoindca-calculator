'use server';

import { differenceInMinutes, addDays, differenceInDays } from 'date-fns';

const CACHE_DURATION_MINUTES = 60;
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

const memoryCache = new LRUCache(MAX_CACHE_ENTRIES);

const COINBASE_CACHE_DURATION = 3600; // 1 hour

export async function getBitcoinPriceHistory(from: number, to: number, provider: 'kraken' | 'coinbase' = 'kraken'): Promise<[number, number][]> {
    const cacheKey = `${provider}_weekly_interp_${from}_${to}`;

    // Check memory cache
    const cached = memoryCache.get(cacheKey);
    if (cached) {
        const age = differenceInMinutes(Date.now(), cached.timestamp);
        if (age < CACHE_DURATION_MINUTES) {
            return cached.data;
        }
    }

    try {
        const dailyPrices: [number, number][] = [];

        if (provider === 'coinbase') {
            // Coinbase Exchange Public API
            // Granularity 86400 = 1 day. Max 300 candles per request.
            // To get full history (e.g., 2015-2024 ~3300 days), we need ~11 requests.
            // We'll fetch in parallel chunks.

            // 1. Calculate required chunks
            const chunks: { start: string; end: string }[] = [];
            let currentEnd = to; // Work backwards from 'to'
            const minStart = from; // Don't go past 'from'

            // Coinbase BTC-USD started around 2015. 
            // If 'from' is 2010 (app default), we should clamp it effectively or just let empty results return.
            // But to avoid 100 empty requests from 2010-2015, let's clamp start to 2015-01-01 if 'from' is older.
            const coinbaseLaunchMs = new Date('2015-01-01').getTime();
            const effectiveStart = Math.max(minStart, coinbaseLaunchMs);

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
                const res = await fetch(url, { headers: { 'User-Agent': 'BitcoinDcaBot/1.0' }, next: { revalidate: COINBASE_CACHE_DURATION } });
                if (!res.ok) return [];
                const json = await res.json();
                return Array.isArray(json) ? json : [];
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
                // Coinbase: [time, low, high, open, close, volume]
                // time is seconds.
                map.set(c[0] * 1000, c[4]);
            });

            // Convert to array and sort
            const coinbaseDailyPrices: [number, number][] = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);

            // Add Genesis Point + interpolate gap (same as Kraken)
            const genesisTs = new Date('2010-01-01T00:00:00Z').getTime();
            if (coinbaseDailyPrices.length > 0 && coinbaseDailyPrices[0][0] > genesisTs) {
                coinbaseDailyPrices.unshift([genesisTs, 0.05]);
            }

            // Interpolate any gaps > 1 day (fills genesis-to-first-real-data gap)
            for (let i = 0; i < coinbaseDailyPrices.length - 1; i++) {
                const [startTs, startPrice] = coinbaseDailyPrices[i];
                const [endTs, endPrice] = coinbaseDailyPrices[i + 1];
                dailyPrices.push([startTs, startPrice]);

                const daysDiff = differenceInDays(new Date(endTs), new Date(startTs));
                if (daysDiff > 1) {
                    const priceStep = (endPrice - startPrice) / daysDiff;
                    for (let d = 1; d < daysDiff; d++) {
                        const interpTs = addDays(new Date(startTs), d).getTime();
                        const interpPrice = startPrice + (priceStep * d);
                        dailyPrices.push([interpTs, interpPrice]);
                    }
                }
            }
            if (coinbaseDailyPrices.length > 0) {
                dailyPrices.push(coinbaseDailyPrices[coinbaseDailyPrices.length - 1]);
            }

        } else {
            // Kraken (Existing Logic)
            const url = `https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080`; // Weekly

            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BitcoinDcaBot/1.0)' },
                next: { revalidate: 3600 }
            });

            if (!response.ok) throw new Error(`API Error: ${response.status}`);

            const json = await response.json();
            if (json.error && json.error.length > 0) throw new Error(`API Error: ${json.error.join(', ')}`);

            const result = json.result;
            const pairKey = Object.keys(result).find(k => k !== 'last');
            if (!pairKey || !Array.isArray(result[pairKey])) throw new Error('Invalid data format from Kraken');

            const weeklyCandles = result[pairKey];
            weeklyCandles.sort((a: number[], b: number[]) => a[0] - b[0]);

            const weeklyPoints: [number, number][] = weeklyCandles.map((item: number[]) => [item[0] * 1000, parseFloat(String(item[4]))]);

            // Add Genesis Point
            const genesisTs = new Date('2010-01-01T00:00:00Z').getTime();
            if (weeklyPoints[0][0] > genesisTs) weeklyPoints.unshift([genesisTs, 0.05]);

            // Interpolate
            for (let i = 0; i < weeklyPoints.length - 1; i++) {
                const [startTs, startPrice] = weeklyPoints[i];
                const [endTs, endPrice] = weeklyPoints[i + 1];
                dailyPrices.push([startTs, startPrice]);

                const daysDiff = differenceInDays(new Date(endTs), new Date(startTs));
                if (daysDiff > 1) {
                    const priceStep = (endPrice - startPrice) / daysDiff;
                    for (let d = 1; d < daysDiff; d++) {
                        const interpTs = addDays(new Date(startTs), d).getTime();
                        const interpPrice = startPrice + (priceStep * d);
                        dailyPrices.push([interpTs, interpPrice]);
                    }
                }
            }
            dailyPrices.push(weeklyPoints[weeklyPoints.length - 1]);
        }

        // Update memory cache
        memoryCache.set(cacheKey, { timestamp: Date.now(), data: dailyPrices });
        return dailyPrices;

    } catch (error) {
        throw error;
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
        const url = `https://query1.finance.yahoo.com/v7/finance/download/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&events=history`;

        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BitcoinDcaBot/1.0)' },
            next: { revalidate: 3600 }
        });

        if (!response.ok) return null;

        const csv = await response.text();
        const lines = csv.trim().split('\n');
        if (lines.length < 2) return null;

        const data: [number, number][] = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            if (cols.length < 5) continue;
            const dateTs = new Date(cols[0]).getTime();
            const close = parseFloat(cols[4]);
            if (!isNaN(dateTs) && !isNaN(close) && close > 0) {
                data.push([dateTs, close]);
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
        const response = await fetch('https://mempool.space/api/v1/fees/mempool-blocks', {
            next: { revalidate: 300 } // 5 min cache
        });
        if (!response.ok) return null;
        const blocks: { medianFee: number }[] = await response.json();
        if (!Array.isArray(blocks) || blocks.length === 0) return null;
        return {
            highFee: blocks[0]?.medianFee ?? 0,
            mediumFee: blocks[Math.min(1, blocks.length - 1)]?.medianFee ?? 0,
            lowFee: blocks[Math.min(2, blocks.length - 1)]?.medianFee ?? 0,
        };
    } catch {
        return null;
    }
}

export async function getFearGreedIndex(): Promise<{ value: number; classification: string } | null> {
    try {
        const response = await fetch('https://api.alternative.me/fng/?limit=1', {
            next: { revalidate: 3600 } // 1 hour cache
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

export async function getCurrentBitcoinPrice(provider: 'kraken' | 'coinbase' = 'kraken'): Promise<number> {
    try {
        let url = '';
        if (provider === 'coinbase') {
            url = 'https://api.exchange.coinbase.com/products/BTC-USD/ticker';
        } else {
            url = 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD';
        }

        const response = await fetch(url, { headers: { 'User-Agent': 'BitcoinDcaBot/1.0' }, next: { revalidate: 60 } });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const json = await response.json();

        if (provider === 'coinbase') {
            return parseFloat(json.price);
        } else {
            if (json.error && json.error.length > 0) throw new Error(`API Error: ${json.error.join(', ')}`);
            const result = json.result;
            const pairKey = Object.keys(result)[0];
            return parseFloat(result[pairKey].c[0]);
        }
    } catch (error) {
        throw error;
    }
}
