import { differenceInMinutes } from 'date-fns';

const CACHE_KEY = 'btc_price_history_cache';
const CACHE_DURATION_MINUTES = 60;

interface CacheData {
    timestamp: number;
    data: [number, number][]; // [timestamp, price]
}

export async function fetchBitcoinPriceHistory(from: number, to: number): Promise<[number, number][]> {
    // CoinGecko expects unix timestamp in seconds
    const fromUnix = Math.floor(from / 1000);
    const toUnix = Math.floor(to / 1000);

    // Check cache first (simplified: if we have a cache that covers the range or is recent enough)
    // For simplicity, we'll cache the "max" range request if possible, or just request simplified.
    // Actually, standardizing on fetching the last X years might be better, but let's just fetch what is asked.
    // To avoid complex partial cache hits, we'll cache specific requests by a key composition or just one "master" cache.
    // Let's implement a simple request-based cache.

    const cacheKey = `${CACHE_KEY}_${fromUnix}_${toUnix}`;
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
        const parsed: CacheData = JSON.parse(cached);
        const age = differenceInMinutes(new Date(), new Date(parsed.timestamp));
        if (age < CACHE_DURATION_MINUTES) {
            return parsed.data;
        }
    }

    try {
        const response = await fetch(
            `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range?vs_currency=usd&from=${fromUnix}&to=${toUnix}`
        );

        if (!response.ok) {
            throw new Error('Failed to fetch price data');
        }

        const data = await response.json();
        const prices = data.prices as [number, number][];

        localStorage.setItem(cacheKey, JSON.stringify({
            timestamp: Date.now(),
            data: prices,
        }));

        return prices;
    } catch (error) {
        console.error('API Fetch Error:', error);
        throw error;
    }
}

export async function fetchCurrentBitcoinPrice(): Promise<number> {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
        const data = await response.json();
        return data.bitcoin.usd;
    } catch (error) {
        console.error('Current Price Fetch Error:', error);
        throw error;
    }
}
