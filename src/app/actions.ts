'use server';

import { differenceInMinutes, addDays, startOfDay, differenceInDays } from 'date-fns';

const CACHE_KEY = 'btc_price_history_cache';
const CACHE_DURATION_MINUTES = 60;

// Simple in-memory cache
let memoryCache: { [key: string]: { timestamp: number; data: [number, number][] } } = {};

const COINBASE_CACHE_DURATION = 3600; // 1 hour

export async function getBitcoinPriceHistory(from: number, to: number, provider: 'kraken' | 'coinbase' = 'kraken'): Promise<[number, number][]> {
    const cacheKey = `${provider}_weekly_interp_${from}_${to}`;

    // Check memory cache
    if (memoryCache[cacheKey]) {
        const parsed = memoryCache[cacheKey];
        const age = differenceInMinutes(Date.now(), parsed.timestamp);
        if (age < CACHE_DURATION_MINUTES) {
            console.log(`Cache hit for ${cacheKey}`);
            return parsed.data;
        }
    }

    try {
        let dailyPrices: [number, number][] = [];

        if (provider === 'coinbase') {
            // Coinbase Exchange Public API
            // Granularity 86400 = 1 day. Max 300 candles per request.
            // To get full history (e.g., 2015-2024 ~3300 days), we need ~11 requests.
            // We'll fetch in parallel chunks.

            console.log(`Fetching history from Coinbase (Chunked) from ${new Date(from).toISOString()} to ${new Date(to).toISOString()}`);

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

            console.log(`Prepared ${chunks.length} chunks for Coinbase.`);

            // 2. Fetch all chunks in parallel
            // Note: Coinbase rate limit is public but bursting might 429. 
            // 10-15 requests in parallel *usually* works, but sequential batching or limited concurrency is safer.
            // Let's try Promise.all for speed, user requested "entire history".

            const fetchChunk = async (chunk: { start: string, end: string }) => {
                const url = `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400&start=${chunk.start}&end=${chunk.end}`;
                const res = await fetch(url, { headers: { 'User-Agent': 'BitcoinDcaBot/1.0' }, next: { revalidate: COINBASE_CACHE_DURATION } });
                if (!res.ok) {
                    console.warn(`Coinbase chunk failed: ${res.status} for ${chunk.start}`);
                    return [];
                }
                const json = await res.json();
                return Array.isArray(json) ? json : [];
            };

            const chunkResults = await Promise.all(chunks.map(fetchChunk));

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
            dailyPrices = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);

            console.log(`Fetched ${dailyPrices.length} total days from Coinbase.`);

        } else {
            // Kraken (Existing Logic)
            const url = `https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080`; // Weekly
            console.log('Fetching history from Kraken (Weekly):', url);

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
            weeklyCandles.sort((a: any, b: any) => a[0] - b[0]);

            const weeklyPoints: [number, number][] = weeklyCandles.map((item: any[]) => [item[0] * 1000, parseFloat(item[4])]);

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
        memoryCache[cacheKey] = { timestamp: Date.now(), data: dailyPrices };
        return dailyPrices;

    } catch (error) {
        console.error('Server Action Error:', error);
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

        console.log(`Fetching from provider: ${provider}`);
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
        console.error('Current Price Error:', error);
        // Fallback to manual/null handling in UI
        throw error;
    }
}
