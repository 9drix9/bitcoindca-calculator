import { PRICE_KIND_CODE, PRICE_STALE_TOLERANCE_DAYS } from '@/utils/dca';
import { DAY_MS, utcDayIndex } from '@/utils/dates';
import type { PriceProvider } from '@/data/priceSources';

/**
 * Pure pieces of the price-history pipeline: turning what an exchange returns
 * into one USD price per UTC day, and saying for every day whether that price
 * was observed or filled in.
 *
 * They live here rather than in app/actions.ts for the same reason as
 * utils/datasets.ts: that file is 'use server', which can only export async
 * functions, and logic that decides which prices the whole site treats as real
 * has to be reachable from a test. Nothing in this file touches the network or
 * the clock: `nowMs` is always an argument.
 */

// ── Shapes ────────────────────────────────────────────────────────────────────

/** [UTC ms, USD price]. */
export type PricePair = [number, number];

/**
 * A daily series plus its provenance.
 *
 * `data` has exactly one row per UTC day, stamped at UTC midnight, with no gaps.
 * `kinds` has one character per row in the same order: 'o' for a price the
 * source reported for that day, 'e' for one filled in along a straight line
 * between two reported prices (PRICE_KIND_CODE in utils/dca). Pass both to
 * withPriceKinds() to get marked points for the engine.
 */
export interface DailySeries {
    data: PricePair[];
    kinds: string;
}

/**
 * What getBitcoinPriceHistoryWithMeta (app/actions.ts) resolves to: the rows
 * for the requested window, their markers, and where they really came from.
 */
export interface PriceHistoryResult extends DailySeries {
    /** The provider that was asked for (after defaulting). */
    requestedProvider: PriceProvider;
    /** The provider whose series this actually is. */
    servedProvider: PriceProvider;
    /** True when the requested provider could not be reached and the other one answered. */
    fallback: boolean;
    /**
     * True when the provider could not be reached just now and this is a copy
     * the server fetched earlier: the same provider's from earlier today, or,
     * with both exchanges down, the last series it had (at most a day old).
     * `fetchedAt` says when.
     */
    stale: boolean;
    /** ms epoch the served series was fetched from the provider. */
    fetchedAt: number;
    /**
     * First and last UTC day (midnight ms) of the whole series the window was
     * cut from. An empty `data` with no error thrown means the window lies
     * outside these, which is a date problem, not an outage.
     */
    seriesStart: number;
    seriesEnd: number;
}

/** A spot price and the moment it was quoted. */
export interface SpotQuote {
    price: number;
    /** ms epoch the quote was fetched from the exchange. Pass it to calculateDca as `asOf`. */
    asOf: number;
    /** The exchange that answered. */
    provider: PriceProvider;
    /** True when that is not the exchange that was asked for. */
    fallback: boolean;
}

/**
 * What an exchange sent cannot stand as price history: not a list of candles,
 * or a list with a hole in it, or one that stops short. Thrown by the parsers
 * and the coverage checks below so the caller can tell "bad payload" (worth
 * one retry around the cache) from "request failed".
 */
export class PriceCoverageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PriceCoverageError';
    }
}

// The engine's own codes, not a second copy of them: withPriceKinds (utils/dca)
// reads these strings back, and a letter that differed here would turn every
// marker into "unknown" without anything failing.
const OBSERVED = PRICE_KIND_CODE.observed;
const ESTIMATED = PRICE_KIND_CODE.estimated;

// ── Building a daily series ───────────────────────────────────────────────────

/**
 * One row per UTC day from the first observed point to the last.
 *
 * Days with no observation are filled along a straight line between their
 * neighbours and marked estimated. That fill is the whole of Kraken's series
 * between weekly closes, and a rare patch on Coinbase's.
 *
 * Two observations on one UTC day keep the later one. Kraken's still-open week
 * is stamped at "now", so its final day can arrive as two bars: a straight-line
 * value at 00:00 and the live price a few hours later.
 *
 * Input must be sorted ascending; an out-of-order point is dropped.
 */
export function buildDailySeries(observed: readonly PricePair[]): DailySeries {
    const days: number[] = [];
    const prices: number[] = [];
    for (const [ts, price] of observed) {
        if (!Number.isFinite(ts) || !Number.isFinite(price) || price <= 0) continue;
        const day = utcDayIndex(ts);
        const last = days.length - 1;
        if (last >= 0 && day < days[last]) continue;
        if (last >= 0 && day === days[last]) {
            prices[last] = price;
            continue;
        }
        days.push(day);
        prices.push(price);
    }

    const data: PricePair[] = [];
    let kinds = '';
    for (let i = 0; i < days.length; i++) {
        data.push([days[i] * DAY_MS, prices[i]]);
        kinds += OBSERVED;
        if (i === days.length - 1) break;
        const gap = days[i + 1] - days[i];
        if (gap > 1) {
            const step = (prices[i + 1] - prices[i]) / gap;
            for (let d = 1; d < gap; d++) {
                data.push([(days[i] + d) * DAY_MS, prices[i] + step * d]);
                kinds += ESTIMATED;
            }
        }
    }
    return { data, kinds };
}

/**
 * The bundled snapshot followed by the provider's points after its last day.
 *
 * The snapshot wins for its whole span whichever provider follows it: it has a
 * price for every day, where Kraken would contribute straight lines.
 */
export function mergeWithSnapshot(snapshot: readonly PricePair[], providerPoints: readonly PricePair[]): PricePair[] {
    if (snapshot.length === 0) return [...providerPoints];
    // Boundary read from the data itself so it can never drift from the file.
    const snapEndDay = utcDayIndex(snapshot[snapshot.length - 1][0]);
    return [...snapshot, ...providerPoints.filter(([ts]) => utcDayIndex(ts) > snapEndDay)];
}

/** Rows of `series` between `from - leadInDays` and `to`, with their markers. */
export function sliceDailySeries(series: DailySeries, from: number, to: number, leadInDays: number): DailySeries {
    const { data, kinds } = series;
    const lower = from - leadInDays * DAY_MS;
    let lo = 0;
    while (lo < data.length && data[lo][0] < lower) lo++;
    let hi = data.length;
    while (hi > lo && data[hi - 1][0] > to) hi--;
    return { data: data.slice(lo, hi), kinds: kinds.slice(lo, hi) };
}

/**
 * How many rows of a `kinds` string are observed and how many estimated.
 *
 * A row marked neither (PRICE_KIND_CODE.unknown, which a caller writes when
 * its markers do not line up with its rows) is counted as neither.
 */
export function countPriceKinds(kinds: string): { observed: number; estimated: number } {
    let observed = 0;
    let estimated = 0;
    for (let i = 0; i < kinds.length; i++) {
        if (kinds[i] === OBSERVED) observed++;
        else if (kinds[i] === ESTIMATED) estimated++;
    }
    return { observed, estimated };
}

// ── Kraken weekly candles ─────────────────────────────────────────────────────

const WEEK_SECONDS = 604_800;
const DAY_SECONDS = 86_400;

/**
 * Kraken weekly candles as [stamp, close] anchors.
 *
 * A Kraken weekly candle opens on Thursday 00:00 UTC and its close is the last
 * trade before the next Thursday 00:00 — that is, the close of WEDNESDAY. The
 * rest of the site labels a day with its own close (a Coinbase candle dated D
 * holds the last trade of D), so the anchor belongs on the Wednesday: candle
 * open + 6 days.
 *
 * Stamped on the Thursday instead (open + 7 days) the anchors are a day late.
 * Measured against Coinbase's daily closes over 586 closed weeks (2015-07 to
 * 2026-10), Thursday stamps are off by a median 1.70% (worst 63.5%: 2020-03-12
 * shows $7,943 on a day that closed at $4,857) and Wednesday stamps by a
 * median 0.03% (worst 3.2%).
 *
 * The final candle is usually still open: its "close" is the latest trade. It
 * is stamped at `nowMs` when that is earlier than its Wednesday, so it never
 * sits in the future.
 */
export function krakenWeeklyAnchors(candles: unknown, nowMs: number): PricePair[] {
    if (!Array.isArray(candles)) return [];
    const anchors: PricePair[] = [];
    for (const candle of candles) {
        if (!Array.isArray(candle)) continue;
        const open = Number(candle[0]);
        const close = parseFloat(String(candle[4]));
        if (!Number.isFinite(open) || open <= 0 || !Number.isFinite(close) || close <= 0) continue;
        anchors.push([Math.min((open + WEEK_SECONDS - DAY_SECONDS) * 1000, nowMs), close]);
    }
    return anchors.sort((a, b) => a[0] - b[0]);
}

// ── Coinbase daily candles ────────────────────────────────────────────────────

/**
 * Days per Coinbase request. The endpoint returns at most 300 candles; 299
 * leaves room for one extra day, because a chunk whose last day was yesterday
 * is still requested "up to now" for a short while (see `sealed` below).
 */
export const COINBASE_CHUNK_DAYS = 299;

export interface CoinbaseChunk {
    /** First UTC day of the chunk (midnight ms). */
    startTs: number;
    /** Last UTC day that belongs to the chunk (midnight ms). */
    lastDayTs: number;
    /** `end` to send: `lastDayTs` once sealed, otherwise a time at or after now. */
    endTs: number;
    /**
     * True once every day in the chunk closed at least a day ago. Its candles
     * can no longer change, so its URL never changes either and the response
     * can be cached for a long time.
     */
    sealed: boolean;
}

/**
 * The requests that cover `firstDayTs` to today.
 *
 * Chunk boundaries are counted from `firstDayTs`, not back from today: counted
 * back, every URL would change every day and none of yesterday's cached
 * responses could be reused. Fixed boundaries mean a finished chunk is fetched
 * once and only the last one is refetched.
 *
 * `openEndStepMs` rounds the open chunk's `end` up, so its URL repeats within
 * that window and a cache keyed by URL can hit.
 */
export function coinbaseChunkPlan(firstDayTs: number, nowMs: number, openEndStepMs: number): CoinbaseChunk[] {
    const today = utcDayIndex(nowMs) * DAY_MS;
    const openEnd = Math.ceil(nowMs / openEndStepMs) * openEndStepMs;
    const chunks: CoinbaseChunk[] = [];
    for (let startTs = firstDayTs; startTs <= today; startTs += COINBASE_CHUNK_DAYS * DAY_MS) {
        const lastDayTs = startTs + (COINBASE_CHUNK_DAYS - 1) * DAY_MS;
        // Yesterday's candle is final in practice, but one more day costs
        // nothing and means a chunk is never sealed on a close still settling.
        const sealed = lastDayTs < today - DAY_MS;
        chunks.push({ startTs, lastDayTs, endTs: sealed ? lastDayTs : openEnd, sealed });
        // Guard against a nonsense start date turning this into thousands of requests.
        if (chunks.length >= 60) break;
    }
    return chunks;
}

/**
 * Coinbase candles ([time s, low, high, open, close, volume]) as sorted
 * [day ms, close] pairs, one per day, limited to the chunk's own days.
 * Throws PriceCoverageError when the body is not an array at all.
 */
export function parseCoinbaseCandles(json: unknown, chunk: CoinbaseChunk): PricePair[] {
    if (!Array.isArray(json)) throw new PriceCoverageError('Coinbase returned an unexpected candle payload');
    const byDay = new Map<number, number>();
    for (const candle of json) {
        // A non-array element (an error object inside an otherwise-array body)
        // would index to undefined and slip through as NaN.
        if (!Array.isArray(candle)) continue;
        const ts = Number(candle[0]) * 1000;
        const close = Number(candle[4]);
        if (!Number.isFinite(ts) || !Number.isFinite(close) || close <= 0) continue;
        if (ts < chunk.startTs || ts > chunk.lastDayTs + DAY_MS - 1) continue;
        byDay.set(utcDayIndex(ts) * DAY_MS, close);
    }
    return Array.from(byDay.entries()).sort((a, b) => a[0] - b[0]);
}

// ── Coverage ──────────────────────────────────────────────────────────────────

/**
 * Longest run of missing days tolerated between two observed points, in days
 * between the points. Weekly candles are 7 apart, so 14 allows one missing
 * week; for daily candles 7 allows an exchange outage of most of a week.
 * Anything longer is not a hole in the market, it is a hole in the response.
 */
export const MAX_OBSERVED_GAP_DAYS: Record<PriceProvider, number> = { coinbase: 7, kraken: 14 };

/**
 * A series whose newest observation is older than this is not current history.
 * The same tolerance the engine allows a series it is asked to price with.
 */
export const MAX_SERIES_LAG_DAYS = PRICE_STALE_TOLERANCE_DAYS;

/** The snapshot's last day and the provider's first may be this far apart at most. */
const MAX_SEAM_GAP_DAYS = 10;

const isoDay = (ts: number): string => new Date(ts).toISOString().slice(0, 10);

const longestGap = (points: readonly PricePair[]): { days: number; afterTs: number } => {
    let days = 0;
    let afterTs = 0;
    for (let i = 1; i < points.length; i++) {
        const gap = utcDayIndex(points[i][0]) - utcDayIndex(points[i - 1][0]);
        if (gap > days) {
            days = gap;
            afterTs = points[i - 1][0];
        }
    }
    return { days, afterTs };
};

/**
 * Throws unless one Coinbase chunk's candles cover the chunk.
 *
 * Coinbase can answer 200 with an empty or short array for a range that has
 * data. Accepted, the missing days would be straight-lined across (up to a
 * 299-day line through a whole chunk) and the result cached as real history.
 * An empty array is only legitimate for a chunk that began a day or so ago.
 */
export function assertCoinbaseChunkCovered(points: readonly PricePair[], chunk: CoinbaseChunk, nowMs: number): void {
    const maxGap = MAX_OBSERVED_GAP_DAYS.coinbase;
    const today = utcDayIndex(nowMs);
    const startDay = utcDayIndex(chunk.startTs);
    const label = `Coinbase chunk ${isoDay(chunk.startTs)}`;
    if (points.length === 0) {
        if (!chunk.sealed && today - startDay <= 1) return;
        throw new PriceCoverageError(`${label} came back empty`);
    }
    const firstDay = utcDayIndex(points[0][0]);
    if (firstDay - startDay >= maxGap) {
        throw new PriceCoverageError(`${label} starts ${firstDay - startDay} days late`);
    }
    // An open chunk is expected to stop at today; the series-wide check below
    // decides whether its last candle is recent enough.
    if (chunk.sealed) {
        const missingAtEnd = utcDayIndex(chunk.lastDayTs) - utcDayIndex(points[points.length - 1][0]);
        if (missingAtEnd >= maxGap) throw new PriceCoverageError(`${label} stops ${missingAtEnd} days early`);
    }
    const gap = longestGap(points);
    if (gap.days > maxGap) {
        throw new PriceCoverageError(`${label} has a ${gap.days}-day hole after ${isoDay(gap.afterTs)}`);
    }
}

/**
 * Throws unless a provider's points (already limited to the days after the
 * snapshot) run from the snapshot to today without a hole.
 *
 * Checked on the OBSERVED points, before any straight-line fill: afterwards
 * every gap is one day and there is nothing left to measure. Without it, a
 * Kraken response cut down to two candles would become a single straight line
 * from $277 in 2015 to today's price and be served as the series.
 */
export function assertProviderCoverage(
    provider: PriceProvider,
    points: readonly PricePair[],
    snapshotEndTs: number,
    nowMs: number,
): void {
    if (points.length === 0) throw new PriceCoverageError(`${provider} returned no usable candles`);
    const seam = utcDayIndex(points[0][0]) - utcDayIndex(snapshotEndTs);
    if (seam > MAX_SEAM_GAP_DAYS) {
        throw new PriceCoverageError(`${provider} history starts ${isoDay(points[0][0])}, ${seam} days after the bundled data ends`);
    }
    const gap = longestGap(points);
    if (gap.days > MAX_OBSERVED_GAP_DAYS[provider]) {
        throw new PriceCoverageError(`${provider} history has a ${gap.days}-day hole after ${isoDay(gap.afterTs)}`);
    }
    const lag = utcDayIndex(nowMs) - utcDayIndex(points[points.length - 1][0]);
    if (lag > MAX_SERIES_LAG_DAYS) {
        throw new PriceCoverageError(`${provider} history stops ${isoDay(points[points.length - 1][0])}, ${lag} days ago`);
    }
}
