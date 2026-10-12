import { calculateDca, calculateXirr } from '@/utils/dca';
import { DAY_MS, EARLIEST_PRICE_TS } from '@/utils/dates';
import type { PricePoint } from '@/types';

/**
 * The cell computation behind /dca/start-date-heatmap.
 *
 * It lives here, not in the page, because a Next page file can only export
 * the page itself, and the test of the cell valuation has to run this function
 * and not a copy of it.
 */

/** Every cell simulates the same schedule: $100 on the 1st of each month, no fees. */
export const HEATMAP_MONTHLY_AMOUNT = 100;

export type HeatmapCell =
    | { state: 'in-progress' }
    | { state: 'unavailable' }
    | {
        state: 'done';
        annualized: number;
        totalReturn: number;
        invested: number;
        endValue: number;
        purchases: number;
    };

/**
 * One cell: a $100/month schedule starting Jan 1 of `startYear` and running for
 * `holdYears`, valued at the price on the window's END date.
 *
 * Two details matter for honesty here:
 *
 * 1. The stack is valued at the window-end price, not today's price. Marking a
 *    2013-2016 window to today's price would attribute a decade of subsequent
 *    price action to a three-year hold.
 * 2. The annualised return dates its final cash flow at the window end too.
 *    Value and date the terminal flow at the same moment, or the same total
 *    return is spread over the wrong number of years.
 */
export function computeCell(
    startYear: number,
    holdYears: number,
    history: PricePoint[],
    priceAt: (ts: number) => number | null,
    nowTs: number,
): HeatmapCell {
    const startTs = Date.UTC(startYear, 0, 1);
    const endTs = Date.UTC(startYear + holdYears, 0, 1);
    if (startTs < EARLIEST_PRICE_TS) return { state: 'unavailable' };
    if (endTs > nowTs) return { state: 'in-progress' };

    const endPrice = priceAt(endTs);
    if (endPrice === null || !(endPrice > 0)) return { state: 'unavailable' };

    // endDate is the day BEFORE the window closes, so the schedule is exactly
    // 12 x holdYears buys (Jan of the start year through Dec of the final year)
    // and the window-end date itself is a valuation point, not a purchase.
    const result = calculateDca(
        {
            amount: HEATMAP_MONTHLY_AMOUNT,
            frequency: 'monthly',
            startDate: new Date(startTs),
            endDate: new Date(endTs - DAY_MS),
            feePercentage: 0,
            priceMode: 'api',
            manualPrice: 0,
        },
        history,
        endPrice,
        endTs,
    );

    if (result.totalInvested <= 0 || !Number.isFinite(result.currentValue)) {
        return { state: 'unavailable' };
    }

    const purchases = result.breakdown.map((item) => ({
        ts: Date.parse(item.date),
        amount: item.invested,
    }));
    const xirr = calculateXirr(purchases, result.currentValue, endTs);
    if (xirr === null || !Number.isFinite(xirr)) return { state: 'unavailable' };

    return {
        state: 'done',
        annualized: xirr * 100,
        totalReturn: result.roi,
        invested: result.totalInvested,
        endValue: result.currentValue,
        purchases: result.breakdown.length,
    };
}
