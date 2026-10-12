import type { PriceKind, PricePoint } from '@/types';
import { DAY_MS, utcDayIndex } from '@/utils/dates';

/**
 * The daily price history, packed for the trip from the server to the browser.
 *
 * The cost-basis page hands the tracker the whole history up front, so that
 * pricing a visitor's positions never needs a request shaped by those
 * positions. The series has one row per UTC day, so the timestamps carry no
 * information beyond the first one, and only the start day and the prices
 * are sent.
 *
 * Measured on 2026-10-12 with 5,900 days of history: 138 KB of JSON as
 * [timestamp, price] pairs, 50 KB packed (44 KB of prices and a 6 KB marker
 * string). The ten years of pairs the page used to send were 89 KB.
 */
export interface PackedDailyPrices {
    /** UTC midnight (ms) of the first day. */
    startTs: number;
    /** One price per UTC day from startTs. 0 marks a day with no price. */
    prices: number[];
    /**
     * One character per entry of `prices`: 'o' observed, 'e' estimated, '-'
     * unknown (PRICE_KIND_CODE in utils/dca). Left out when the series has no
     * markers.
     */
    kinds?: string;
}

const KIND_CODE: Record<PriceKind, string> = { observed: 'o', estimated: 'e' };
const UNKNOWN = '-';

/**
 * Pack a series sorted by day. A day that appears twice keeps its last row,
 * the same rule the price lookup uses. Null for an empty series.
 */
export function packDailyPrices(series: readonly PricePoint[]): PackedDailyPrices | null {
    if (series.length === 0) return null;
    const startDay = utcDayIndex(series[0][0]);
    const prices: number[] = [];
    const kinds: string[] = [];
    let marked = false;

    for (const [ts, price, kind] of series) {
        const index = utcDayIndex(ts) - startDay;
        if (index < 0 || !Number.isFinite(price) || price <= 0) continue;
        // A gap in the series stays a gap: 0 is never a real price.
        while (prices.length < index) {
            prices.push(0);
            kinds.push(UNKNOWN);
        }
        prices[index] = price;
        kinds[index] = kind ? KIND_CODE[kind] : UNKNOWN;
        if (kind) marked = true;
    }

    return { startTs: startDay * DAY_MS, prices, ...(marked ? { kinds: kinds.join('') } : {}) };
}

/** The series packDailyPrices was given, one point per priced day. */
export function unpackDailyPrices(packed: PackedDailyPrices): PricePoint[] {
    const { startTs, prices, kinds } = packed;
    const marked = typeof kinds === 'string' && kinds.length === prices.length;
    const series: PricePoint[] = [];
    for (let i = 0; i < prices.length; i++) {
        const price = prices[i];
        if (!(price > 0)) continue;
        const ts = startTs + i * DAY_MS;
        const code = marked ? kinds[i] : UNKNOWN;
        if (code === KIND_CODE.observed) series.push([ts, price, 'observed']);
        else if (code === KIND_CODE.estimated) series.push([ts, price, 'estimated']);
        else series.push([ts, price]);
    }
    return series;
}
