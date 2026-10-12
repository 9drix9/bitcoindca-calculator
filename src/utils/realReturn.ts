// Inflation-adjusted ("real") return of a DCA plan.
//
// Each purchase is restated at the price level of the valuation date: the
// amount paid is multiplied by CPI at the valuation date and divided by CPI
// for the month the purchase was made. Those restated amounts are added up,
// and the value of the stack on the valuation date is compared with that sum.
// Real ROI = value / restated cost - 1.
//
// The cost is restated purchase by purchase because a DCA plan pays in across
// the whole window: on average its money was exposed to about half the
// window's inflation, and deflating the final value by all of it would charge
// every purchase the full amount. CPI is read through the valuation date, not
// the plan's end date, because that is the day the value is struck. The value
// is already in those dollars and needs no adjustment. Only the cost moves.
//
// CPI is the monthly US series the site already fetches (FRED CPIAUCSL:
// Consumer Price Index for All Urban Consumers, all items, published by the
// Bureau of Labor Statistics). Each reading is dated the 1st of its month and
// describes that whole month, so a purchase uses the latest reading dated on
// or before it. Readings come out about a month in arrears, so the most
// recent purchases have no reading of their own yet; they use the latest one,
// which treats them as not yet inflated. That slightly understates the cost,
// and the card names the reading it stopped at so the gap is visible.
//
// Pure: nothing here reads the clock or the network.

/** [UTC ms of the reading's date, index level], ascending by date. */
export type CpiSeries = readonly (readonly [number, number])[];

export interface RealReturn {
    /** Every contribution restated at the price level of the end reading, USD. */
    realInvested: number;
    /** (value / realInvested - 1) x 100. */
    realRoiPercent: number;
    /** CPI change from the start reading to the end reading, %. */
    inflationPercent: number;
    /** Date (UTC ms) of the reading used for the first contribution. */
    startObsTs: number;
    /** Date (UTC ms) of the reading every amount is restated to. */
    endObsTs: number;
}

/**
 * Index of the latest reading dated on or before `ts`, or 0 when `ts` is
 * earlier than every reading (the caller then uses the first one, which is the
 * nearest thing to a reading for that date the series has).
 */
const readingIndexAt = (cpi: CpiSeries, ts: number, from: number = 0): number => {
    let i = Math.max(0, from);
    while (i + 1 < cpi.length && cpi[i + 1][0] <= ts) i++;
    return i;
};

/**
 * Real return of a set of dated contributions against a value on `valuationTs`.
 *
 * `contributions` are the engine's breakdown rows (`date` ISO, `invested` USD,
 * oldest first): every scheduled buy at its full amount, fee included, plus
 * the starting-stack row at the plan's start date, which is the only date that
 * stack has. `value` is the stack's USD value on `valuationTs`.
 *
 * Null when there is nothing to measure: no money paid in, no positive value,
 * or the first contribution and the valuation date share one CPI reading (a
 * plan younger than a month of data has no measured inflation yet).
 */
export function calculateRealReturn(
    contributions: readonly { date: string; invested: number }[],
    value: number,
    cpi: CpiSeries | null | undefined,
    valuationTs: number,
): RealReturn | null {
    if (!cpi || cpi.length < 2 || !Number.isFinite(valuationTs) || !(value > 0)) return null;

    const endIndex = readingIndexAt(cpi, valuationTs);
    const endCpi = cpi[endIndex][1];
    if (!(endCpi > 0)) return null;

    let realInvested = 0;
    let startIndex = -1;
    // Contributions arrive oldest first, so the reading pointer only moves forward.
    let pointer = 0;
    for (const { date, invested } of contributions) {
        if (!(invested > 0)) continue;
        const ts = Date.parse(date);
        if (!Number.isFinite(ts)) continue;
        // A buy dated after the end reading (the last month or two, or a
        // purchase after the valuation date) is not inflated at all.
        pointer = Math.min(readingIndexAt(cpi, ts, pointer), endIndex);
        const cpiThen = cpi[pointer][1];
        if (!(cpiThen > 0)) return null;
        if (startIndex === -1) startIndex = pointer;
        realInvested += invested * (endCpi / cpiThen);
    }

    if (startIndex === -1 || !(realInvested > 0) || startIndex >= endIndex) return null;

    const startCpi = cpi[startIndex][1];
    return {
        realInvested,
        realRoiPercent: (value / realInvested - 1) * 100,
        inflationPercent: (endCpi / startCpi - 1) * 100,
        startObsTs: cpi[startIndex][0],
        endObsTs: cpi[endIndex][0],
    };
}
