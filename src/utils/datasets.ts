import { DAY_MS, utcDayIndex, utcDayStart } from '@/utils/dates';
import type { Frequency } from '@/types';
import type { PriceEra } from '@/data/priceSources';

/**
 * Pure helpers behind the computed dataset pages (/best-day-to-buy-bitcoin,
 * /lump-sum-vs-dca, /dca/start-date-heatmap) and the "same plan, every start
 * date" comparison in the calculator.
 *
 * These live here rather than inside the page components for one reason: those
 * pages publish their numbers as fact, inside schema.org Dataset markup. A
 * defect here is a false claim, not a rendering glitch, so the logic has to be
 * reachable from a test.
 */

// ── Price lookup ──────────────────────────────────────────────────────────────

/**
 * Binary-search lookup returning the last known price at or before a day.
 *
 * Returns null rather than the earliest price when the target predates every
 * bar. That distinction is the whole point: falling back to the first known
 * price would let a 2009 start date "buy" 18 months of BTC at $0.07.
 */
export function makeDayPriceLookup(priceData: [number, number][]): (ts: number) => number | null {
    const days: number[] = [];
    const prices: number[] = [];
    for (const [ts, price] of priceData) {
        const day = utcDayIndex(ts);
        const lastIndex = days.length - 1;
        if (lastIndex >= 0 && day < days[lastIndex]) continue;   // guard: input expected sorted
        if (lastIndex >= 0 && days[lastIndex] === day) {
            // Last bar of the day wins, the same rule as the engine's lookup
            // (utils/dca) and the public API: it is the one nearest the close.
            prices[lastIndex] = price;
            continue;
        }
        days.push(day);
        prices.push(price);
    }
    return (ts: number): number | null => {
        const target = utcDayIndex(ts);
        let lo = 0;
        let hi = days.length - 1;
        let found = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (days[mid] <= target) {
                found = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return found >= 0 ? prices[found] : null;
    };
}

// ── Weekday anchoring ─────────────────────────────────────────────────────────

/**
 * First UTC day on or after `ts` whose weekday matches (0 = Sunday).
 *
 * The day-of-week comparison MUST be UTC. A local-time getDay() shifts the
 * anchor by one for anyone west of UTC, which would silently compare "Tuesday"
 * against a schedule that actually starts on Monday.
 */
export function firstWeekdayOnOrAfter(ts: number, weekday: number): number {
    let day = utcDayStart(ts);
    for (let i = 0; i < 7; i++) {
        if (new Date(day).getUTCDay() === weekday) return day;
        day += DAY_MS;
    }
    return day;
}

// ── Summary statistics ────────────────────────────────────────────────────────

/** Nearest-rank percentile of an ALREADY-SORTED ascending array. */
export function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
    return sorted[idx];
}

/** Median. Sorts a copy, so the caller's array is untouched. */
export function median(values: number[]): number {
    if (values.length === 0) return 0;
    const s = [...values].sort((a, b) => a - b);
    const n = s.length;
    return n % 2 === 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

// ── Plan length ───────────────────────────────────────────────────────────────

/** Average calendar month, in days (365.25 / 12). */
export const AVG_MONTH_DAYS = 365.25 / 12;

/** Shortest plan the start-date comparison is run for. */
export const MIN_WALK_DAYS = 90;

/**
 * A plan length snapped to a whole number of average months, so "the last five
 * years" and "five years and two days" share one cached comparison.
 *
 * Average months, not multiples of 30 days: those drift (1,826 days becomes
 * 1,830, a "61-month" run for a 60-month plan). Whole average months
 * round-trip exactly, so the window that is simulated and the months that are
 * printed are the same thing.
 *
 * Null for anything under MIN_WALK_DAYS or not a number.
 */
export function bucketDurationDays(days: number): { months: number; days: number } | null {
    if (!Number.isFinite(days) || days < MIN_WALK_DAYS) return null;
    const months = Math.max(3, Math.round(days / AVG_MONTH_DAYS));
    return { months, days: Math.round(months * AVG_MONTH_DAYS) };
}

// ── Same plan, every start date ───────────────────────────────────────────────

/**
 * One price per consecutive UTC day from `fromTs` to `toTs`, inclusive.
 *
 * Null unless the series has a positive price for EVERY one of those days.
 * Filling a hole here (from the day before, or from the first bar) would feed
 * invented prices into a statistic whose whole claim is that it replays what
 * really happened.
 */
export function toDailyPrices(
    data: readonly (readonly [number, number, ...unknown[]])[],
    fromTs: number,
    toTs: number,
): Float64Array | null {
    if (!Number.isFinite(fromTs) || !Number.isFinite(toTs)) return null;
    const fromDay = utcDayIndex(fromTs);
    const toDay = utcDayIndex(toTs);
    if (toDay < fromDay) return null;
    const prices = new Float64Array(toDay - fromDay + 1);
    for (const [ts, price] of data) {
        const day = utcDayIndex(ts);
        if (day < fromDay || day > toDay) continue;
        prices[day - fromDay] = price; // last bar of a day wins
    }
    for (let i = 0; i < prices.length; i++) {
        if (!(prices[i] > 0) || !Number.isFinite(prices[i])) return null;
    }
    return prices;
}

/** Day offsets, from the start date, on which a plan of this length buys. */
export function purchaseOffsets(durationDays: number, frequency: Frequency): number[] {
    const offsets: number[] = [];
    if (frequency === 'monthly') {
        // Average months rather than 30-day steps: over five years a 30-day
        // step drifts 26 days ahead of the calendar and squeezes in a buy
        // the real monthly schedule never makes.
        for (let k = 0; ; k++) {
            const offset = Math.round(k * AVG_MONTH_DAYS);
            if (offset > durationDays) break;
            offsets.push(offset);
        }
        return offsets;
    }
    const step = frequency === 'daily' ? 1 : frequency === 'weekly' ? 7 : 14;
    for (let offset = 0; offset <= durationDays; offset += step) offsets.push(offset);
    return offsets;
}

export interface StartDateWalk {
    /** How many start dates were run. */
    runs: number;
    /**
     * For each run, what the stack was worth at the end of the window divided
     * by what was paid in, before any fee. Sorted ascending.
     */
    multiples: Float64Array;
    /** For each run, the average price paid per coin, before any fee. Sorted ascending. */
    averageCosts: Float64Array;
}

/**
 * Replay one plan from every possible start date.
 *
 * `prices` is one price per consecutive UTC day (see toDailyPrices). A run
 * starts on a day, buys a fixed amount on each scheduled day for
 * `durationDays`, and is valued at the price on its last day. With a fixed
 * amount the result does not depend on the amount, so each buy is 1 unit:
 * coins = Σ 1/price, paid in = number of buys.
 *
 * Start dates step one day at a time. A weekly step would only ever start on
 * one weekday, whichever the series happened to begin on, under a label that
 * says "every" start date.
 *
 * The runs overlap almost completely: two five-year runs that start a day
 * apart share 1,825 of their 1,826 days. Their count says how finely the
 * history was sampled, not how much independent evidence there is. See
 * summariseOutcomes().independentPeriods.
 */
export function walkStartDates(prices: ArrayLike<number>, durationDays: number, frequency: Frequency): StartDateWalk {
    const empty: StartDateWalk = { runs: 0, multiples: new Float64Array(0), averageCosts: new Float64Array(0) };
    if (!Number.isInteger(durationDays) || durationDays < 1 || prices.length <= durationDays) return empty;

    const offsets = purchaseOffsets(durationDays, frequency);
    const maxRuns = prices.length - durationDays;
    const multiples = new Float64Array(maxRuns);
    const averageCosts = new Float64Array(maxRuns);
    let runs = 0;
    for (let start = 0; start < maxRuns; start++) {
        let coins = 0;
        for (const offset of offsets) coins += 1 / prices[start + offset];
        const endPrice = prices[start + durationDays];
        // A zero or missing price makes 1/price infinite and would report a
        // run that ended in limitless profit.
        if (!(coins > 0) || !Number.isFinite(coins) || !(endPrice > 0)) continue;
        multiples[runs] = (endPrice * coins) / offsets.length;
        averageCosts[runs] = offsets.length / coins;
        runs++;
    }
    return {
        runs,
        multiples: multiples.subarray(0, runs).sort(),
        averageCosts: averageCosts.subarray(0, runs).sort(),
    };
}

export interface OutcomeRange {
    /** Start dates run. They overlap almost entirely — read `independentPeriods` with it. */
    runs: number;
    /** Total return on the money paid in, in percent, after the fee. */
    worst: number;
    p10: number;
    median: number;
    p90: number;
    best: number;
    /** Share of runs that ended worth less than was paid in, in percent. */
    shareBelowCostPercent: number;
    /**
     * How many windows of this length fit end to end in the history: the number
     * of runs that share no days with each other. Usually 1 to 5, which is the
     * honest size of the evidence.
     */
    independentPeriods: number;
    /**
     * The return at each whole percentile, 0 to 100 (101 values, ascending).
     * Enough to place one plan among the runs with percentileRank() without
     * shipping every run to the browser.
     */
    quantiles: number[];
}

/**
 * What getOutcomeRange (app/actions.ts) resolves to: the summary plus exactly
 * which comparison it describes, so a label can never claim more than was run.
 */
export interface OutcomeRangeResult extends OutcomeRange {
    frequency: Frequency;
    /** Length of every run in days, after snapping to whole months. */
    durationDays: number;
    /** The same length in months, for the label. */
    months: number;
    /** The fee that was applied, in percent of each buy. */
    feePercentage: number;
    era: PriceEra;
    /** First and last UTC day (midnight ms) of the prices the runs were drawn from. */
    spanStart: number;
    spanEnd: number;
    /** Days in that span whose price was filled in, not observed. 0 in normal operation. */
    estimatedDays: number;
}

/**
 * Summarise a walk for a given fee.
 *
 * A percentage fee scales every run's outcome by the same factor, so the walk
 * is done once without a fee and the fee applied here: a run that turned 1
 * into `multiple` turns 1 into `multiple × (1 − fee)`.
 *
 * `spanDays` is the number of days from the first price to the last.
 * Null when there are no runs.
 */
export function summariseOutcomes(
    multiples: ArrayLike<number>,
    feePercent: number,
    spanDays: number,
    durationDays: number,
): OutcomeRange | null {
    const runs = multiples.length;
    if (runs === 0 || !(durationDays > 0)) return null;
    const keep = 1 - Math.min(100, Math.max(0, Number.isFinite(feePercent) ? feePercent : 0)) / 100;
    const toReturn = (multiple: number): number => (multiple * keep - 1) * 100;
    const at = (p: number): number => toReturn(multiples[Math.round((runs - 1) * p)]);

    // "Below cost" with a hair of tolerance: a flat price gives a multiple of
    // exactly 1 on paper and 0.9999999999999999 in floating point.
    let belowCost = 0;
    while (belowCost < runs && multiples[belowCost] * keep < 1 - 1e-9) belowCost++;

    return {
        runs,
        worst: at(0),
        p10: at(0.1),
        median: at(0.5),
        p90: at(0.9),
        best: at(1),
        shareBelowCostPercent: (belowCost / runs) * 100,
        independentPeriods: Math.floor(spanDays / durationDays),
        quantiles: Array.from({ length: 101 }, (_, k) => at(k / 100)),
    };
}

/**
 * Where `value` falls among the runs behind `quantiles` (OutcomeRange.quantiles):
 * the percentile, 0 to 100, with 50 meaning the median run.
 *
 * When several percentiles share the value (a flat stretch), the middle of the
 * stretch is returned, so a value equal to every run reads 50 and not 0 or 100.
 */
export function percentileRank(quantiles: readonly number[], value: number): number {
    const last = quantiles.length - 1;
    if (last < 1 || !Number.isFinite(value)) return 50;
    if (value < quantiles[0]) return 0;
    if (value > quantiles[last]) return 100;
    let lo = 0;
    while (lo < last && quantiles[lo] < value) lo++;
    let hi = lo;
    while (hi < last && quantiles[hi + 1] <= value) hi++;
    const scale = 100 / last;
    if (quantiles[lo] === value) return ((lo + hi) / 2) * scale;
    // Between two percentiles: place it proportionally.
    const below = quantiles[lo - 1];
    return (lo - 1 + (value - below) / (quantiles[lo] - below)) * scale;
}

/**
 * Where a plan's own return stands among the runs in the every-start-date
 * card: under all of them, over all of them, or at a percentile from 1 to 99.
 *
 * "Under" and "over" are read off the worst and best figures the card prints,
 * never off the rounded percentile: a rank of 0.4 rounds to 0 for a plan that
 * one run still did worse than. The server keeps each run in single precision,
 * so a plan that is itself the worst or best run misses that figure by float
 * noise; the margin (about sixteen times the largest such error) stops it
 * being called outside a set it belongs to.
 */
export function standingAmong(runs: Pick<OutcomeRange, 'worst' | 'best' | 'quantiles'>, ownReturnPercent: number): 'below' | 'above' | number {
    const margin = (bound: number): number => (Math.abs(bound) + 100) * 1e-6;
    if (ownReturnPercent < runs.worst - margin(runs.worst)) return 'below';
    if (ownReturnPercent > runs.best + margin(runs.best)) return 'above';
    return Math.min(99, Math.max(1, Math.round(percentileRank(runs.quantiles, ownReturnPercent))));
}
