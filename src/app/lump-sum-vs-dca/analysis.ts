import { calculateDca, calculateLumpSum } from '@/utils/dca';
import { addUtcMonths, utcDayIndex } from '@/utils/dates';
import { makeDayPriceLookup, median, percentile } from '@/utils/datasets';
import type { PricePair } from '@/utils/priceSeries';

/**
 * The numbers behind /lump-sum-vs-dca.
 *
 * Kept out of page.tsx so they can be tested: a Next page file can only export
 * the page, and this one publishes its results as fact in Dataset markup.
 */

/** The same total capital is deployed both ways in every window. */
export const CAPITAL = 12_000;
/** The headline deployment period, in months. */
export const HEADLINE_MONTHS = 12;
export const DEPLOYMENT_PERIODS = [3, 6, 12, 24] as const;

export interface WindowRow {
    startTs: number;
    lumpBtc: number;
    dcaBtc: number;
    /** How much more BTC the lump sum ended up holding, in percent. Negative = DCA held more. */
    diffPercent: number;
    /** How far below the highest daily price so far the price was on the start date, 0 to 1. */
    drawdownAtStart: number;
    /**
     * Each side's return on the capital, in percent, at the price on the day of
     * the last DCA purchase: the first moment both are fully invested.
     */
    lumpEndReturn: number;
    dcaEndReturn: number;
}

/** Where one side stood when the deployment period ended, across every window. */
export interface OutcomeSpread {
    worst: number;
    p10: number;
    median: number;
    p90: number;
    best: number;
    /** Share of windows that ended worth less than the capital, in percent. */
    belowCostPercent: number;
}

export interface PeriodSummary {
    months: number;
    perPurchase: number;
    /** Start months run. Consecutive ones share all but one month of their period. */
    windows: number;
    lumpWinPercent: number;
    medianDiff: number;
    p10: number;
    p90: number;
    worst: WindowRow;
    best: WindowRow;
    /**
     * The same comparison on windows that share no months: one start every
     * `months` months. There are `months` ways to choose them (start counting
     * from the 1st, 2nd, ... start month), each leaving between `fewest` and
     * `most` windows, and the lump sum's win rate across those choices runs
     * from `lowestWinPercent` to `highestWinPercent`.
     */
    separate: { fewest: number; most: number; lowestWinPercent: number; highestWinPercent: number };
    lumpEnd: OutcomeSpread;
    dcaEnd: OutcomeSpread;
}

export interface RegimeSummary {
    key: string;
    label: string;
    windows: number;
    /**
     * The most of those windows that can be chosen without two sharing a month.
     * Thirty start months near a high are far fewer than thirty separate looks
     * at the market when each window runs for a year.
     */
    separate: number;
    lumpWinPercent: number;
    medianDiff: number;
    worstDiff: number;
    bestDiff: number;
}

const REGIMES = [
    { key: 'top', label: 'Within 10% of the highest price so far', test: (dd: number) => dd <= 0.1 },
    { key: 'mid', label: '10% to 50% below it', test: (dd: number) => dd > 0.1 && dd < 0.5 },
    { key: 'deep', label: '50% or more below it', test: (dd: number) => dd >= 0.5 },
] as const;

export interface LumpSumAnalysis {
    headline: PeriodSummary;
    /** Shortest deployment period first. */
    periods: PeriodSummary[];
    regimes: RegimeSummary[];
    firstStartTs: number;
    lastStartTs: number;
    /** Price on the first start date and at the last close: the rise every window sits inside. */
    firstStartPrice: number;
    lastCloseTs: number;
    lastClose: number;
    /**
     * How the period table changes with every longer period: whether the lump
     * sum's share rises, whether its median lead rises, and whether the
     * middle-80% range gets wider.
     *
     * `rangeStretchesBothWays` is the stronger claim, and the only one that
     * supports the words "in both directions": the low end of the range is
     * below zero and falls at every step, and the high end is above zero and
     * rises at every step. A range can widen with one end standing still or
     * moving the same way as the other. On a price that only climbs, both ends
     * rise and the range still widens.
     */
    trends: { winRateRises: boolean; medianRises: boolean; rangeWidens: boolean; rangeStretchesBothWays: boolean };
}

const spreadOf = (returns: number[]): OutcomeSpread => {
    const sorted = [...returns].sort((a, b) => a - b);
    return {
        worst: sorted[0],
        p10: percentile(sorted, 0.1),
        median: median(sorted),
        p90: percentile(sorted, 0.9),
        best: sorted[sorted.length - 1],
        belowCostPercent: (sorted.filter((r) => r < 0).length / sorted.length) * 100,
    };
};

const winPercent = (rows: WindowRow[]): number =>
    (rows.filter((r) => r.diffPercent > 0).length / rows.length) * 100;

/**
 * The most windows that can be chosen from `rows` (oldest first) without two
 * of them sharing a month: take the earliest, skip every window that starts
 * before it has finished, repeat.
 */
export function separateCount(rows: { startTs: number }[], months: number): number {
    let count = 0;
    let free = -Infinity;
    for (const row of rows) {
        if (row.startTs < free) continue;
        count++;
        free = addUtcMonths(row.startTs, months, 1);
    }
    return count;
}

function summarise(months: number, rows: WindowRow[]): PeriodSummary | null {
    if (rows.length < 12) return null;
    const diffs = rows.map((r) => r.diffPercent);
    const sorted = [...diffs].sort((a, b) => a - b);
    let worst = rows[0];
    let best = rows[0];
    for (const row of rows) {
        if (row.diffPercent < worst.diffPercent) worst = row;
        if (row.diffPercent > best.diffPercent) best = row;
    }

    const separateSets = Array.from({ length: months }, (_, phase) => rows.filter((_row, i) => i % months === phase))
        .filter((set) => set.length > 0);
    const separateWins = separateSets.map(winPercent);

    return {
        months,
        perPurchase: CAPITAL / months,
        windows: rows.length,
        lumpWinPercent: winPercent(rows),
        medianDiff: median(diffs),
        p10: percentile(sorted, 0.1),
        p90: percentile(sorted, 0.9),
        worst,
        best,
        separate: {
            fewest: Math.min(...separateSets.map((set) => set.length)),
            most: Math.max(...separateSets.map((set) => set.length)),
            lowestWinPercent: Math.min(...separateWins),
            highestWinPercent: Math.max(...separateWins),
        },
        lumpEnd: spreadOf(rows.map((r) => r.lumpEndReturn)),
        dcaEnd: spreadOf(rows.map((r) => r.dcaEndReturn)),
    };
}

const risesThroughout = (values: number[]): boolean => values.every((v, i) => i === 0 || v > values[i - 1]);
const fallsThroughout = (values: number[]): boolean => values.every((v, i) => i === 0 || v < values[i - 1]);

/**
 * Lump sum against equal monthly buys, from the first of every month that has
 * a full deployment period of price data behind it.
 *
 * `closes` is one finished daily close per UTC day (see StudyCloses). Both
 * sides go through the shared engine with zero fees. Both end up holding only
 * bitcoin, so which one holds more does not depend on any later price.
 * Null when the headline period has fewer than a year of start months.
 */
export function analyseLumpSum(closes: PricePair[]): LumpSumAnalysis | null {
    if (closes.length < 400) return null;
    const last = closes[closes.length - 1];
    const lastDay = utcDayIndex(last[0]);
    const firstDay = utcDayIndex(closes[0][0]);
    const priceAt = makeDayPriceLookup(closes);

    // Highest daily price up to and including each day. Used only to say where
    // the market stood on a start date; no later price is involved.
    const highSoFar = new Float64Array(closes.length);
    let runningMax = 0;
    closes.forEach(([, price], i) => {
        if (price > runningMax) runningMax = price;
        highSoFar[i] = runningMax;
    });

    // Start dates step one calendar month at a time, from the first full month
    // of price data onward.
    const firstDate = new Date(closes[0][0]);
    const firstStartTs = Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + 1, 1);

    const rowsByPeriod = new Map<number, WindowRow[]>();
    for (const months of DEPLOYMENT_PERIODS) {
        const rows: WindowRow[] = [];
        for (let startTs = firstStartTs; ; startTs = addUtcMonths(startTs, 1, 1)) {
            // The deployment period has to finish inside the data, otherwise the
            // DCA leg would be cut short and the comparison unfair.
            const endTs = addUtcMonths(startTs, months - 1, 1);
            if (utcDayIndex(endTs) > lastDay) break;
            const endPrice = priceAt(endTs);
            const startIndex = utcDayIndex(startTs) - firstDay;
            if (endPrice === null || startIndex < 0) continue;

            const dca = calculateDca(
                {
                    amount: CAPITAL / months,
                    frequency: 'monthly',
                    startDate: new Date(startTs),
                    endDate: new Date(endTs),
                    feePercentage: 0,
                    priceMode: 'api',
                    manualPrice: 0,
                },
                closes,
                endPrice,
                endTs,
            );
            if (dca.breakdown.length !== months || dca.btcAccumulated <= 0) continue;

            const lump = calculateLumpSum(CAPITAL, new Date(startTs), closes, endPrice, 0);
            if (!Number.isFinite(lump.btcAccumulated) || lump.btcAccumulated <= 0) continue;

            rows.push({
                startTs,
                lumpBtc: lump.btcAccumulated,
                dcaBtc: dca.btcAccumulated,
                diffPercent: (lump.btcAccumulated / dca.btcAccumulated - 1) * 100,
                drawdownAtStart: 1 - closes[startIndex][1] / highSoFar[startIndex],
                lumpEndReturn: lump.roi,
                dcaEndReturn: dca.roi,
            });
        }
        rowsByPeriod.set(months, rows);
    }

    const periods = DEPLOYMENT_PERIODS.map((m) => summarise(m, rowsByPeriod.get(m) ?? [])).filter(
        (p): p is PeriodSummary => p !== null,
    );
    const headline = periods.find((p) => p.months === HEADLINE_MONTHS);
    const headlineRows = rowsByPeriod.get(HEADLINE_MONTHS) ?? [];
    if (!headline || headlineRows.length === 0) return null;

    const regimes: RegimeSummary[] = REGIMES.map(({ key, label, test }) => {
        const group = headlineRows.filter((r) => test(r.drawdownAtStart));
        const diffs = group.map((r) => r.diffPercent);
        return {
            key,
            label,
            windows: group.length,
            separate: separateCount(group, HEADLINE_MONTHS),
            lumpWinPercent: group.length > 0 ? winPercent(group) : 0,
            medianDiff: median(diffs),
            worstDiff: group.length > 0 ? Math.min(...diffs) : 0,
            bestDiff: group.length > 0 ? Math.max(...diffs) : 0,
        };
    }).filter((r) => r.windows > 0);

    const lowEnds = periods.map((p) => p.p10);
    const highEnds = periods.map((p) => p.p90);

    return {
        headline,
        periods,
        regimes,
        firstStartTs,
        lastStartTs: headlineRows[headlineRows.length - 1].startTs,
        firstStartPrice: priceAt(firstStartTs) ?? closes[0][1],
        lastCloseTs: last[0],
        lastClose: last[1],
        trends: {
            winRateRises: risesThroughout(periods.map((p) => p.lumpWinPercent)),
            medianRises: risesThroughout(periods.map((p) => p.medianDiff)),
            rangeWidens: risesThroughout(periods.map((p) => p.p90 - p.p10)),
            // The first low end below zero and falling means every one is; the
            // same for the high ends above it.
            rangeStretchesBothWays:
                lowEnds[0] < 0 && highEnds[0] > 0 && fallsThroughout(lowEnds) && risesThroughout(highEnds),
        },
    };
}
