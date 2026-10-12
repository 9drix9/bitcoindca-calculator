import type { DcaBreakdownItem, PricePoint } from '@/types';
import { utcDayIndex } from '@/utils/dates';

/**
 * The year-by-year table on a scenario page.
 *
 * It lives here, apart from the page component, because the column it fills
 * is headed "Value at year end" and for a long time was not that. Each row took
 * `portfolioValue` from the year's LAST PURCHASE, which the engine prices on
 * the purchase day: 1 December for every monthly plan. A stack bought monthly
 * since 2013 read $2,431 (+1,926%) for 2013 when it was worth $1,600 (+1,233%)
 * on 31 December, and the rows were off by anything from -34% to +51%.
 * Logic that states a figure for a date needs to be reachable from a test.
 */

export interface YearRow {
    year: number;
    /** Paid in by the end of that year (so far, for the current year). */
    invested: number;
    /** What the bitcoin held at the end of that year was worth. */
    value: number;
    /** Gain on everything paid in up to then, in percent. */
    roi: number;
    /** The year is still running: `value` is the latest valuation, not a year-end one. */
    isCurrentYear: boolean;
    /**
     * True when the 31 December price was filled in (a straight-line value
     * between two closes, or an earlier close carried forward), not one the
     * source reported for that day. Always false for the current year.
     */
    estimated: boolean;
}

export interface YearRowOptions {
    /** The stack's value at the latest price: the page's headline figure. */
    currentValue: number;
    /** "Now" in ms. Decides which year is the current one. */
    nowTs: number;
    /**
     * Last day of a fixed-window plan (ms). Left out, the plan is still
     * running and the table ends with a year-to-date row.
     */
    endTs?: number;
}

const utcYear = (ts: number): number => new Date(ts).getUTCFullYear();

/**
 * One row per UTC calendar year, from the year of the first purchase to the
 * year the plan ends (the current year for a plan that is still running).
 *
 * A finished year takes the bitcoin held after that year's last purchase and
 * values it at the series price for 31 December: the latest price point at or
 * before that day, the same "last known price" rule the engine buys with. The
 * current year is valued at `currentValue`, so its row and the headline above
 * it are the same number.
 *
 * `breakdown` and `priceData` must be in date order, as the engine and the
 * price action return them. A finished year the series has no price for is
 * left out: there is nothing honest to print for it.
 */
export function buildYearRows(
    breakdown: readonly DcaBreakdownItem[],
    priceData: readonly PricePoint[],
    { currentValue, nowTs, endTs }: YearRowOptions,
): YearRow[] {
    if (breakdown.length === 0) return [];

    const currentYear = utcYear(nowTs);
    const firstYear = utcYear(Date.parse(breakdown[0].date));
    const lastYear = Math.min(currentYear, endTs === undefined ? currentYear : utcYear(endTs));

    const rows: YearRow[] = [];
    let held: DcaBreakdownItem | undefined;
    let next = 0;
    let bar = -1;

    for (let year = firstYear; year <= lastYear; year++) {
        const yearEndTs = Date.UTC(year, 11, 31);
        while (next < breakdown.length && utcDayIndex(Date.parse(breakdown[next].date)) <= utcDayIndex(yearEndTs)) {
            held = breakdown[next++];
        }
        if (!held || held.totalInvested <= 0) continue;

        const invested = held.totalInvested;
        const toRow = (value: number, isCurrentYear: boolean, estimated: boolean): YearRow => ({
            year,
            invested,
            value,
            roi: ((value - invested) / invested) * 100,
            isCurrentYear,
            estimated,
        });

        if (year === currentYear) {
            rows.push(toRow(currentValue, true, false));
            continue;
        }

        const yearEndDay = utcDayIndex(yearEndTs);
        while (bar + 1 < priceData.length && utcDayIndex(priceData[bar + 1][0]) <= yearEndDay) bar++;
        if (bar < 0) continue;
        const [barTs, price, kind] = priceData[bar];
        if (!(price > 0)) continue;
        // A close carried forward from an earlier day stands in for the one
        // that is missing, so it is an estimate even if it was itself observed.
        const estimated = kind === 'estimated' || utcDayIndex(barTs) < yearEndDay;
        rows.push(toRow(held.totalAccumulated * price, false, estimated));
    }
    return rows;
}
