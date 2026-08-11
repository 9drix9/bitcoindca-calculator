import { DcaParams, DcaResult, DcaBreakdownItem, DcaStats, LumpSumResult, AssetDcaResult, Frequency } from '@/types';
import { DAY_MS, utcDayIndex, utcDayStart, addUtcMonths } from '@/utils/dates';

// All schedule iteration and price lookups are bucketed by UTC calendar day.
// Exchange candles are UTC-aligned; using local-time day boundaries shifted every
// purchase date by one day for users west of UTC.

/**
 * Chronological "latest price at or before this UTC day" lookup.
 * Exact-day maps break for assets that only trade on weekdays: a weekly schedule
 * that lands on Saturdays would never hit a bar and would price every purchase
 * at the first close. Purchases are queried in ascending order, so a pointer walk
 * is O(n + m).
 */
const createPriceLookup = (priceData: [number, number][]) => {
    const days: [number, number][] = [];
    for (const [ts, price] of priceData) {
        const day = utcDayIndex(ts);
        const last = days[days.length - 1];
        if (last && last[0] === day) continue; // first bar of the day wins
        if (last && day < last[0]) continue;   // guard: input expected sorted
        days.push([day, price]);
    }
    let pointer = -1;
    return (purchaseDay: number): number | undefined => {
        while (pointer + 1 < days.length && days[pointer + 1][0] <= purchaseDay) pointer++;
        if (pointer >= 0) return days[pointer][1];
        // Purchase predates every bar we have. Returning the earliest known price
        // here would fabricate history: a 2009 start date would buy 18 months of
        // BTC at the 2010-08-18 price of ~$0.07 and conjure billions out of $4k.
        // No price means no purchase — the caller skips this date.
        return undefined;
    };
};

/**
 * Prices carried forward past the last bar are intentional (a future end date
 * projects at the last known price), so this lookup deliberately has no upper
 * guard — only the lower one above.
 */

const nextPurchaseTs = (startTs: number, purchaseIndex: number, frequency: Frequency, anchorDay: number): number => {
    switch (frequency) {
        case 'daily': return startTs + purchaseIndex * DAY_MS;
        case 'weekly': return startTs + purchaseIndex * 7 * DAY_MS;
        case 'biweekly': return startTs + purchaseIndex * 14 * DAY_MS;
        case 'monthly': return addUtcMonths(startTs, purchaseIndex, anchorDay);
    }
};

/**
 * Money-weighted annualized return (XIRR) via Newton's method with bisection fallback.
 * Cash flows: -amount at each purchase, +finalValue at the end date.
 * Returns null when the period is too short (<90 days) for an annualized figure to be meaningful.
 */
export function calculateXirr(purchases: { ts: number; amount: number }[], finalValue: number, finalTs: number): number | null {
    if (purchases.length === 0 || finalValue <= 0) return null;
    const t0 = purchases[0].ts;
    if (finalTs - t0 < 90 * DAY_MS) return null;

    const flows = [
        ...purchases.map(p => ({ years: (p.ts - t0) / (365.25 * DAY_MS), amount: -p.amount })),
        { years: (finalTs - t0) / (365.25 * DAY_MS), amount: finalValue },
    ];

    const npv = (r: number) => flows.reduce((sum, f) => sum + f.amount / Math.pow(1 + r, f.years), 0);

    // Newton's method
    let rate = 0.1;
    for (let i = 0; i < 60; i++) {
        const f = npv(rate);
        const h = 1e-6;
        const df = (npv(rate + h) - f) / h;
        if (!isFinite(df) || df === 0) break;
        const next = rate - f / df;
        if (!isFinite(next) || next <= -0.9999) break;
        if (Math.abs(next - rate) < 1e-8) return next;
        rate = next;
    }

    // Bisection fallback on [-0.9999, 1000]
    let lo = -0.9999, hi = 1000;
    let fLo = npv(lo);
    if (!isFinite(fLo)) return null;
    if (fLo * npv(hi) > 0) return null;
    for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        const fMid = npv(mid);
        if (Math.abs(fMid) < 1e-10 || hi - lo < 1e-9) return mid;
        if (fLo * fMid < 0) { hi = mid; } else { lo = mid; fLo = fMid; }
    }
    return (lo + hi) / 2;
}

/**
 * Largest peak-to-trough fall in portfolio value, walked one UTC day at a time.
 *
 * Sampling only on purchase days gave a monthly schedule 12 observations a year,
 * which missed every crash that began and ended between two buys — the March 2020
 * -50% collapse was almost invisible. Understating risk is the worst direction for
 * a backtest to be wrong in, so this walks every day the portfolio existed.
 *
 * Stops at the last real price bar: past it the price is carried forward flat
 * while holdings only grow, so value only rises and no new drawdown can form.
 */
function computeMaxDrawdown(
    holdings: { day: number; totalBtc: number }[],
    priceData: [number, number][] | undefined,
    endTs: number,
): number {
    if (holdings.length === 0 || !priceData || priceData.length === 0) return 0;

    const priceAt = createPriceLookup(priceData);
    const lastDataDay = utcDayIndex(priceData[priceData.length - 1][0]);
    const lastDay = Math.min(utcDayIndex(endTs), lastDataDay);

    let peak = 0;
    let maxDrawdown = 0;
    let held = 0;
    let next = 0;

    for (let day = holdings[0].day; day <= lastDay; day++) {
        while (next < holdings.length && holdings[next].day <= day) held = holdings[next++].totalBtc;
        const price = priceAt(day);
        if (price === undefined || price <= 0) continue;
        const value = held * price;
        if (value > peak) peak = value;
        else if (peak > 0) {
            const drawdown = (peak - value) / peak;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }
    }
    return maxDrawdown;
}

export function calculateDca(params: DcaParams, priceData?: [number, number][], currentPrice?: number | null): DcaResult {
    const { amount, frequency, startDate, endDate, feePercentage, priceMode, manualPrice } = params;

    const startTs = utcDayStart(startDate.getTime());
    const endTs = utcDayStart(endDate.getTime());
    const anchorDay = new Date(startTs).getUTCDate();

    let totalInvested = 0;
    let totalBtc = 0;
    const breakdown: DcaBreakdownItem[] = [];

    const priceAt = priceData && priceData.length > 0 ? createPriceLookup(priceData) : null;

    const clampedFee = Math.min(100, Math.max(0, feePercentage));
    const purchases: { ts: number; amount: number }[] = [];

    // Holdings timeline for the drawdown walk below: one entry per purchase day.
    const holdings: { day: number; totalBtc: number }[] = [];
    let bestBuy: { date: string; price: number } | null = null;
    let worstBuy: { date: string; price: number } | null = null;

    for (let i = 0; ; i++) {
        const ts = nextPurchaseTs(startTs, i, frequency, anchorDay);
        if (ts > endTs) break;
        // Hard stop safeguard: > 100 years of daily purchases is out of scope
        if (i > 40_000) break;

        let purchasePrice = manualPrice;
        if (priceMode === 'api') {
            purchasePrice = priceAt ? (priceAt(utcDayIndex(ts)) ?? 0) : 0;
        }

        if (purchasePrice > 0) {
            const netInvestment = amount * (1 - clampedFee / 100);
            const btcBought = netInvestment / purchasePrice;

            totalInvested += amount;
            totalBtc += btcBought;
            purchases.push({ ts, amount });

            const dateIso = new Date(ts).toISOString();
            if (!bestBuy || purchasePrice < bestBuy.price) bestBuy = { date: dateIso, price: purchasePrice };
            if (!worstBuy || purchasePrice > worstBuy.price) worstBuy = { date: dateIso, price: purchasePrice };

            const portfolioValue = totalBtc * purchasePrice;
            holdings.push({ day: utcDayIndex(ts), totalBtc });

            breakdown.push({
                date: dateIso,
                price: purchasePrice,
                invested: amount,
                totalInvested,
                accumulated: btcBought,
                totalAccumulated: totalBtc,
                portfolioValue,
            });
        }
    }

    let finalPrice = currentPrice || manualPrice;
    // When the spot quote is missing, the stack is valued at the last bar's
    // close — so the XIRR terminal flow below must be dated at that bar, not
    // "now". Dating a window-end valuation at today stretches the same return
    // over extra years and understates the rate.
    let valuationNowTs = Date.now();
    if (!currentPrice && priceMode === 'api' && priceData && priceData.length > 0) {
        finalPrice = priceData[priceData.length - 1][1];
        valuationNowTs = utcDayStart(priceData[priceData.length - 1][0]);
    }

    const currentValue = totalBtc * finalPrice;
    const averageCost = totalBtc > 0 ? totalInvested / totalBtc : 0;
    const profit = currentValue - totalInvested;
    const roi = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

    // The terminal cash flow must be dated at the same instant the stack is
    // valued (usually today's spot; the last bar when the spot is missing).
    // Dating it at `endTs` while valuing at today's price compressed years of
    // growth into the backtest window and inflated XIRR by an order of
    // magnitude ($50/wk 2016-2018 reported +574%/yr instead of +54%).
    // Never earlier than the last purchase, so a future-dated schedule stays sane.
    const valuationTs = purchases.length > 0
        ? Math.max(valuationNowTs, purchases[purchases.length - 1].ts)
        : endTs;
    const xirr = calculateXirr(purchases, currentValue, valuationTs);

    // At a fixed manual price the portfolio can never fall, so a market-data
    // drawdown walk would report risk for a series the user explicitly priced
    // flat. No number is honest here — null renders as "—".
    const maxDrawdown = priceMode === 'manual' ? null : computeMaxDrawdown(holdings, priceData, endTs);

    const stats: DcaStats = {
        xirrPercent: xirr !== null ? xirr * 100 : null,
        maxDrawdownPercent: maxDrawdown !== null ? maxDrawdown * 100 : null,
        bestBuy,
        worstBuy,
        feesPaid: totalInvested * (clampedFee / 100),
    };

    return {
        totalInvested,
        btcAccumulated: totalBtc,
        averageCost,
        currentValue,
        profit,
        roi,
        breakdown,
        stats,
    };
}

export function calculateAssetDca(
    amount: number,
    frequency: Frequency,
    startDate: Date,
    endDate: Date,
    feePercentage: number,
    priceData: [number, number][],
    asset: string,
    label: string
): AssetDcaResult {
    const priceAt = priceData.length > 0 ? createPriceLookup(priceData) : null;

    const startTs = utcDayStart(startDate.getTime());
    const endTs = utcDayStart(endDate.getTime());
    const anchorDay = new Date(startTs).getUTCDate();

    let totalInvested = 0;
    let totalUnits = 0;
    const clampedFee = Math.min(100, Math.max(0, feePercentage));

    const breakdown: { date: string; portfolioValue: number }[] = [];

    for (let i = 0; ; i++) {
        const ts = nextPurchaseTs(startTs, i, frequency, anchorDay);
        if (ts > endTs) break;
        if (i > 40_000) break;

        const purchasePrice = priceAt ? (priceAt(utcDayIndex(ts)) ?? 0) : 0;

        if (purchasePrice > 0) {
            const netInvestment = amount * (1 - clampedFee / 100);
            totalUnits += netInvestment / purchasePrice;
            totalInvested += amount;

            breakdown.push({
                date: new Date(ts).toISOString(),
                portfolioValue: totalUnits * purchasePrice,
            });
        }
    }

    const finalPrice = priceData.length > 0 ? priceData[priceData.length - 1][1] : 0;
    const currentValue = totalUnits * finalPrice;
    const profit = currentValue - totalInvested;
    const roi = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

    return { asset, label, totalInvested, currentValue, profit, roi, breakdown };
}

export function calculateLumpSum(
    totalAmount: number,
    startDate: Date,
    priceData: [number, number][],
    currentPrice: number,
    feePercentage: number = 0
): LumpSumResult {
    if (!priceData || priceData.length === 0 || currentPrice <= 0) {
        return { totalInvested: totalAmount, btcAccumulated: 0, currentValue: 0, profit: -totalAmount, roi: -100 };
    }

    // Price the entry with the same lookback the DCA leg uses (last bar at or
    // before the start day) — a forward scan priced the two strategies on
    // different days whenever the start day itself had no bar, which biased
    // the comparison. Falling forward is kept only for starts that predate
    // all data: the lump sum "waits" and buys at the first bar, mirroring a
    // DCA plan whose earliest purchases are skipped for lack of a price.
    const startTs = utcDayStart(startDate.getTime());
    const priceAt = createPriceLookup(priceData);
    let entryPrice = priceAt(utcDayIndex(startTs)) ?? 0;
    if (entryPrice <= 0) {
        entryPrice = priceData[0][1];
    }
    if (entryPrice <= 0) {
        return { totalInvested: totalAmount, btcAccumulated: 0, currentValue: 0, profit: -totalAmount, roi: -100 };
    }

    // Apply the same exchange fee the DCA side pays, for a fair comparison
    const clampedFee = Math.min(100, Math.max(0, feePercentage));
    const btcAccumulated = (totalAmount * (1 - clampedFee / 100)) / entryPrice;
    const currentValue = btcAccumulated * currentPrice;
    const profit = currentValue - totalAmount;
    const roi = totalAmount > 0 ? (profit / totalAmount) * 100 : 0;

    return { totalInvested: totalAmount, btcAccumulated, currentValue, profit, roi };
}
