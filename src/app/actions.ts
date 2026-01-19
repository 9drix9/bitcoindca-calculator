'use server';

import { differenceInMinutes, addDays, startOfDay, differenceInDays } from 'date-fns';

const CACHE_KEY = 'btc_price_history_cache';
const CACHE_DURATION_MINUTES = 60;

// Simple in-memory cache
let memoryCache: { [key: string]: { timestamp: number; data: [number, number][] } } = {};

export async function getBitcoinPriceHistory(from: number, to: number): Promise<[number, number][]> {
    const cacheKey = `weekly_interp_${from}_${to}`;

    // Check memory cache
    if (memoryCache[cacheKey]) {
        const parsed = memoryCache[cacheKey];
        const age = differenceInMinutes(Date.now(), parsed.timestamp);
        if (age < CACHE_DURATION_MINUTES) {
            console.log('Cache hit for', cacheKey);
            return parsed.data;
        }
    }

    try {
        // Kraken Public API (OHLC)
        // We use interval=10080 (Weekly) to get data back to ~2013.
        // Daily (1440) only gives ~2 years.
        const url = `https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080`;
        console.log('Fetching history from Kraken (Weekly):', url);

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; BitcoinDcaBot/1.0)'
            },
            next: { revalidate: 3600 }
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const json = await response.json();

        if (json.error && json.error.length > 0) {
            throw new Error(`API Error: ${json.error.join(', ')}`);
        }

        const result = json.result;
        const pairKey = Object.keys(result).find(k => k !== 'last');

        if (!pairKey || !Array.isArray(result[pairKey])) {
            throw new Error('Invalid data format from Kraken');
        }

        const weeklyCandles = result[pairKey];

        // Sort just in case
        weeklyCandles.sort((a: any, b: any) => a[0] - b[0]);

        // 1. Convert to simple points [ts, price]
        const weeklyPoints: [number, number][] = weeklyCandles.map((item: any[]) => [
            item[0] * 1000,
            parseFloat(item[4])
        ]);

        // 2. Add Genesis Point (Jan 1 2010 @ $0.05) if needed
        // Kraken starts ~Oct 2013.
        const genesisTs = new Date('2010-01-01T00:00:00Z').getTime();
        if (weeklyPoints[0][0] > genesisTs) {
            weeklyPoints.unshift([genesisTs, 0.05]);
        }

        // 3. Interpolate to Daily
        const dailyPrices: [number, number][] = [];

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

        // Add last point
        dailyPrices.push(weeklyPoints[weeklyPoints.length - 1]);

        // Simple Filter by requested range (optional, but good for efficiency if needed, 
        // though caching the WHOLE history is better for user interaction)
        // We return FULL history so the frontend can slice it or the calculateDca uses what it needs.
        // But `getBitcoinPriceHistory` signature implies range. 
        // Let's filter slightly to match expectation, or return all?
        // Returning all allows the chart to show full history even if calculation is shorter?
        // No, reusing signatures. Let's return all, the component slices logic if needed, 
        // wait, the component calls this with specific from/to.
        // But for "back to creation", the user might change the date inputs.
        // Let's just return the full interpolated set. The dca logic filters by Map lookup anyway.

        // Update memory cache
        memoryCache[cacheKey] = {
            timestamp: Date.now(),
            data: dailyPrices
        };

        return dailyPrices;

    } catch (error) {
        console.error('Server Action Error:', error);
        throw error;
    }
}

export async function getCurrentBitcoinPrice(): Promise<number> {
    try {
        // Kraken Ticker
        const url = 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD';
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; BitcoinDcaBot/1.0)'
            },
            next: { revalidate: 60 }
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const json = await response.json();
        if (json.error && json.error.length > 0) {
            throw new Error(`API Error: ${json.error.join(', ')}`);
        }

        const result = json.result;
        const pairKey = Object.keys(result)[0];
        const lastTrade = parseFloat(result[pairKey].c[0]);

        return lastTrade;
    } catch (error) {
        console.error('Current Price Error:', error);
        throw error;
    }
}
