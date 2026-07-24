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
        // Purchase predates all data: fall back to the earliest known price
        return days.length > 0 ? days[0][1] : undefined;
    };
};

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

    // Drawdown tracking over the purchase-day portfolio series
    let peakValue = 0;
    let maxDrawdown = 0;
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
            if (portfolioValue > peakValue) peakValue = portfolioValue;
            else if (peakValue > 0) {
                const dd = (peakValue - portfolioValue) / peakValue;
                if (dd > maxDrawdown) maxDrawdown = dd;
            }

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
    if (!currentPrice && priceMode === 'api' && priceData && priceData.length > 0) {
        finalPrice = priceData[priceData.length - 1][1];
    }

    const currentValue = totalBtc * finalPrice;
    const averageCost = totalBtc > 0 ? totalInvested / totalBtc : 0;
    const profit = currentValue - totalInvested;
    const roi = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

    const lastTs = purchases.length > 0 ? Math.min(Date.now(), Math.max(purchases[purchases.length - 1].ts, endTs)) : endTs;
    const xirr = calculateXirr(purchases, currentValue, lastTs);

    const stats: DcaStats = {
        xirrPercent: xirr !== null ? xirr * 100 : null,
        maxDrawdownPercent: maxDrawdown * 100,
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

    // Find the price entry closest to (at or after) the user's start date
    const startTs = utcDayStart(startDate.getTime());
    let entryPrice = 0;
    for (const [ts, price] of priceData) {
        if (ts >= startTs) {
            entryPrice = price;
            break;
        }
    }
    if (entryPrice <= 0) {
        entryPrice = priceData[priceData.length - 1][1];
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
