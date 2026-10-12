import {
    DcaParams, DcaResult, DcaToDateResult, DcaBreakdownItem, DcaStats, LumpSumResult, AssetDcaResult,
    Frequency, PriceKind, PricePoint,
} from '@/types';
import {
    DAY_MS, EARLIEST_PRICE_TS, utcDayIndex, utcDayStart, addUtcMonths, utcFullYearsBetween, clampToTodayUtc,
} from '@/utils/dates';

// All schedule iteration and price lookups are bucketed by UTC calendar day.
// Exchange candles are UTC-aligned; local-time day boundaries would shift every
// purchase date by one day for users west of UTC.
//
// Nothing in this file reads the clock when the caller supplies `asOf`: the same
// plan, prices, spot and `asOf` always produce the same result.

/**
 * Hard stop on the number of scheduled purchases in one run.
 *
 * Every plan the app accepts runs between EARLIEST_PRICE_DATE and MAX_END_DATE
 * (utils/dates), which is 33,008 daily buys at most, so the UI and shared links
 * never reach this and no schedule they produce is cut short. It only bounds a
 * direct call with dates outside that range.
 */
export const MAX_SCHEDULE_PURCHASES = 40_000;

// ── Price provenance ──────────────────────────────────────────────────────────

/**
 * One character per price point, in series order. A compact way to ship the
 * observed/estimated markers beside a [ts, price][] series (server action
 * payloads, the public API) instead of a third element on every row.
 */
export const PRICE_KIND_CODE = { observed: 'o', estimated: 'e', unknown: '-' } as const;

/**
 * Attach observed/estimated markers to a price series. `kinds` is either a
 * string of PRICE_KIND_CODE characters or an array, one entry per point.
 *
 * A missing `kinds`, or one whose length does not match the series, returns
 * the series unmarked: a marker on the wrong row would label a real close as
 * an estimate (or the reverse), and "unknown" is the honest fallback.
 */
export function withPriceKinds(
    data: [number, number][],
    kinds: string | readonly (PriceKind | undefined)[] | null | undefined,
): PricePoint[] {
    if (!kinds || kinds.length !== data.length) return data;
    return data.map(([ts, price], i): PricePoint => {
        const raw = kinds[i];
        const kind: PriceKind | undefined =
            raw === 'observed' || raw === PRICE_KIND_CODE.observed ? 'observed'
                : raw === 'estimated' || raw === PRICE_KIND_CODE.estimated ? 'estimated'
                    : undefined;
        return kind ? [ts, price, kind] : [ts, price];
    });
}

// ── Price lookup ──────────────────────────────────────────────────────────────

/**
 * Chronological "latest price at or before this UTC day" lookup.
 * Exact-day maps break for assets that only trade on weekdays: a weekly schedule
 * that lands on Saturdays would never hit a bar and would price every purchase
 * at the first close. Purchases are queried in ascending order, so a pointer walk
 * is O(n + m).
 */
const createPriceLookup = (priceData: PricePoint[]) => {
    const days: number[] = [];
    const prices: number[] = [];
    const kinds: (PriceKind | undefined)[] = [];
    let kindAware = false;
    for (const [ts, price, kind] of priceData) {
        const day = utcDayIndex(ts);
        const last = days.length - 1;
        if (last >= 0 && day < days[last]) continue; // guard: input expected sorted
        if (kind !== undefined) kindAware = true;
        if (last >= 0 && days[last] === day) {
            // Last bar of the day wins: it is the one nearest that day's close.
            // Kraken's still-open week can end in two bars on the final day (a
            // straight-line value at 00:00, then the live price), and the
            // first of them is the stale one.
            prices[last] = price;
            kinds[last] = kind;
            continue;
        }
        days.push(day);
        prices.push(price);
        kinds.push(kind);
    }
    let pointer = -1;
    const seek = (day: number) => {
        while (pointer + 1 < days.length && days[pointer + 1] <= day) pointer++;
    };
    return {
        /** True when at least one point carries an observed/estimated marker. */
        kindAware,
        priceAt(day: number): number | undefined {
            seek(day);
            if (pointer >= 0) return prices[pointer];
            // Purchase predates every bar we have. Returning the earliest known price
            // here would fabricate history: a 2009 start date would buy 18 months of
            // BTC at the 2010-08-18 price of ~$0.07 and conjure billions out of $4k.
            // No price means no purchase — the caller skips this date.
            return undefined;
        },
        /**
         * Provenance of the price priceAt(day) returns. Undefined on a series
         * with no markers, so nothing is labelled that the data cannot back.
         * A price carried forward from an earlier day is an estimate even when
         * the bar it came from was observed.
         */
        kindAt(day: number): PriceKind | undefined {
            if (!kindAware) return undefined;
            seek(day);
            if (pointer < 0) return undefined;
            return days[pointer] < day ? 'estimated' : kinds[pointer];
        },
    };
};

// Prices carried forward past the last bar are intentional (a future end date
// projects at the last known price), so the lookup has no upper guard, only the
// lower one above. The caller is responsible for handing over a series that
// reaches the dates it asks about; priceSeriesCovers() below is the check.

/**
 * How many days a series' newest bar may trail the day being priced before
 * the "latest" price is really a stale close. A day or two is normal (today's
 * candle is still open, or a cached series is being served); beyond this the
 * series simply does not cover the window.
 */
export const PRICE_STALE_TOLERANCE_DAYS = 3;

/**
 * True when `priceData` can honestly price a schedule running from `fromTs`
 * to `toTs`: it starts on or before the first day (or at the first day we have
 * any data for), and its newest bar is within `maxStaleDays` of the last.
 *
 * The engine carries the last bar forward without limit, so a panel that
 * simulates its own window on a series fetched for a different one gets every
 * later purchase priced at an old close with no error: on a 2017-2019 series,
 * "the last five years" buys at the December 2019 price throughout. Check
 * before computing, and show nothing (or fetch the right window) when this is
 * false.
 *
 * For a plan that ends in the future pass clampToTodayUtc(endTs) as `toTs`:
 * no series reaches past today, and the future leg is a projection by design.
 */
export function priceSeriesCovers(
    priceData: PricePoint[] | null | undefined,
    fromTs: number,
    toTs: number,
    maxStaleDays: number = PRICE_STALE_TOLERANCE_DAYS,
): boolean {
    if (!priceData || priceData.length === 0) return false;
    if (!Number.isFinite(fromTs) || !Number.isFinite(toTs)) return false;
    const firstDay = utcDayIndex(priceData[0][0]);
    const lastDay = utcDayIndex(priceData[priceData.length - 1][0]);
    // Nothing before EARLIEST_PRICE_TS can be priced, so a series that begins
    // there covers any earlier start as well as it can be covered.
    const fromDay = Math.max(utcDayIndex(fromTs), utcDayIndex(EARLIEST_PRICE_TS));
    return firstDay <= fromDay && lastDay >= utcDayIndex(toTs) - maxStaleDays;
}

/**
 * The rows of `series` dated on or before the UTC day of `endTs`. Returns the
 * same array when nothing is past it.
 *
 * With no spot price the engine values a stack at the series' last row, and a
 * series is fetched through the day after a plan's end. A run that is meant to
 * be valued on the end date itself (to compare it with another asset's bar for
 * that day) has to be handed the series without the later row.
 */
export function seriesThroughDay<P extends PricePoint>(series: P[], endTs: number): P[] {
    const bound = utcDayStart(endTs) + DAY_MS;
    let hi = series.length;
    while (hi > 0 && series[hi - 1][0] >= bound) hi--;
    return hi === series.length ? series : series.slice(0, hi);
}

const nextPurchaseTs = (startTs: number, purchaseIndex: number, frequency: Frequency, anchorDay: number): number => {
    switch (frequency) {
        case 'daily': return startTs + purchaseIndex * DAY_MS;
        case 'weekly': return startTs + purchaseIndex * 7 * DAY_MS;
        case 'biweekly': return startTs + purchaseIndex * 14 * DAY_MS;
        case 'monthly': return addUtcMonths(startTs, purchaseIndex, anchorDay);
    }
};

/**
 * Fee taken out of one buy and what is left to spend on the asset.
 *
 * The flat fee is added to the percentage fee and the total is capped at the
 * purchase amount: a $2.99 fee on a $2 buy takes the $2, it does not buy a
 * negative amount of bitcoin. With no flat fee the percentage is applied as a
 * single multiplication, so a percentage-only result is the same to the bit
 * whether or not a flat fee of zero was passed.
 */
const applyFees = (amount: number, feePct: number, flatFee: number): { fee: number; net: number } => {
    const percentFee = amount * (feePct / 100);
    if (flatFee <= 0) return { fee: percentFee, net: amount * (1 - feePct / 100) };
    const fee = Math.min(amount, percentFee + flatFee);
    return { fee, net: amount - fee };
};

const clampFeePct = (feePercentage: number): number => Math.min(100, Math.max(0, feePercentage));
const clampFlatFee = (flatFee: number | undefined): number =>
    flatFee !== undefined && Number.isFinite(flatFee) ? Math.max(0, flatFee) : 0;

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
 * Sampling only on purchase days would give a monthly schedule 12 observations
 * a year and miss every crash that began and ended between two buys (the March
 * 2020 -50% collapse, for one). Understating risk is the worst direction for a
 * backtest to be wrong in, so this walks every day the portfolio existed.
 *
 * Stops at the last real price bar: past it the price is carried forward flat
 * while holdings only grow, so value only rises and no new drawdown can form.
 *
 * Also counts how many of the walked days were priced on an estimate. A walk
 * over straight-line fills between weekly closes cannot see a crash inside a
 * week, so the caller needs to know how much of the figure rests on them.
 */
function computeMaxDrawdown(
    holdings: { day: number; totalBtc: number }[],
    priceData: PricePoint[] | undefined,
    endTs: number,
): { maxDrawdown: number; daysWalked: number; estimatedDays: number } {
    if (holdings.length === 0 || !priceData || priceData.length === 0) {
        return { maxDrawdown: 0, daysWalked: 0, estimatedDays: 0 };
    }

    const lookup = createPriceLookup(priceData);
    const lastDataDay = utcDayIndex(priceData[priceData.length - 1][0]);
    const lastDay = Math.min(utcDayIndex(endTs), lastDataDay);

    let peak = 0;
    let maxDrawdown = 0;
    let held = 0;
    let next = 0;
    let daysWalked = 0;
    let estimatedDays = 0;

    for (let day = holdings[0].day; day <= lastDay; day++) {
        while (next < holdings.length && holdings[next].day <= day) held = holdings[next++].totalBtc;
        const price = lookup.priceAt(day);
        if (price === undefined || price <= 0) continue;
        daysWalked++;
        if (lookup.kindAt(day) === 'estimated') estimatedDays++;
        const value = held * price;
        if (value > peak) peak = value;
        else if (peak > 0) {
            const drawdown = (peak - value) / peak;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }
    }
    return { maxDrawdown, daysWalked, estimatedDays };
}

/** What a plan that cannot be run returns: zeros, not NaN and not a 40,000-step loop. */
export const emptyDcaResult = (): DcaResult => ({
    totalInvested: 0,
    btcAccumulated: 0,
    averageCost: 0,
    currentValue: 0,
    profit: 0,
    roi: 0,
    breakdown: [],
    stats: {
        xirrPercent: null,
        maxDrawdownPercent: null,
        bestBuy: null,
        worstBuy: null,
        feesPaid: 0,
        feePercentOfBuy: 0,
        startingStackCost: 0,
    },
});

/**
 * Run a DCA plan over a price series.
 *
 * `asOf` (ms) is the instant the stack is valued at: the time `currentPrice`
 * was quoted. It dates the final XIRR cash flow, and it is the only thing in
 * here that depends on "now", so pass it whenever the result must be
 * reproducible (a server render that is hydrated later, a cached page, a
 * test). Left out, it falls back to the current time.
 *
 * The schedule runs to `endDate` even when that is in the future. A buy dated
 * after `asOf`'s UTC day is priced at `currentPrice`, the quote the stack is
 * valued at, or at the last known price when there is no quote. That is a
 * projection. For "what has actually been bought so far", use
 * calculateDcaToDate.
 */
export function calculateDca(
    params: DcaParams,
    priceData?: PricePoint[],
    currentPrice?: number | null,
    asOf?: number,
): DcaResult {
    const {
        amount, frequency, startDate, endDate, feePercentage, flatFee, priceMode, manualPrice,
        startingBtc = 0, startingAvgCost, annualEscalationPct = 0,
    } = params;

    const startTs = utcDayStart(startDate.getTime());
    const endTs = utcDayStart(endDate.getTime());
    // An Invalid Date makes every `ts > endTs` test false, so the loop would run
    // to its hard stop. Callers build these dates from typed strings, and
    // parseUtcDate gives NaN for anything but yyyy-MM-dd (a five-digit year,
    // say), so this is reachable.
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) return emptyDcaResult();
    const anchorDay = new Date(startTs).getUTCDate();

    let totalInvested = 0;
    let totalBtc = 0;
    // Fees apply to scheduled buys only, so their base is tracked separately
    // from totalInvested once a starting stack contributes cost.
    let scheduledInvested = 0;
    let feeSum = 0;
    let estimatedPurchases = 0;
    const breakdown: DcaBreakdownItem[] = [];

    const lookup = priceData && priceData.length > 0 ? createPriceLookup(priceData) : null;
    // Markers describe market prices. In manual mode every buy is priced by the
    // user, so there is nothing to label.
    const kindAware = priceMode === 'api' && lookup !== null && lookup.kindAware;

    const clampedFee = clampFeePct(feePercentage);
    const flat = clampFlatFee(flatFee);
    const escalation = Math.max(0, annualEscalationPct) / 100;
    const purchases: { ts: number; amount: number }[] = [];

    // A buy still to come is priced at the quote the stack is valued at, so a
    // projection "at today's price" nets to exactly minus its fees. Priced
    // from the series instead, it would show a gain or a loss that is only
    // the difference in age between two readings of the same price.
    const quote = priceMode === 'api' && currentPrice && currentPrice > 0 ? currentPrice : null;
    const quoteDay = quote !== null ? utcDayIndex(asOf === undefined ? Date.now() : asOf) : Infinity;

    // Holdings timeline for the drawdown walk below: one entry per purchase day.
    const holdings: { day: number; totalBtc: number }[] = [];
    let bestBuy: DcaStats['bestBuy'] = null;
    let worstBuy: DcaStats['worstBuy'] = null;

    // Starting stack: coins held before the first scheduled buy. Costed at the
    // user's stated average, else at the start date's market price — never free,
    // or ROI would be fiction. Excluded from best/worst buy (those describe the
    // schedule) and from fees (the coins are already held).
    let startingStackCost = 0;
    if (startingBtc > 0) {
        const startDay = utcDayIndex(startTs);
        const startPrice = priceMode === 'api'
            ? (quote !== null && startDay > quoteDay ? quote : (lookup ? (lookup.priceAt(startDay) ?? 0) : 0))
            : manualPrice;
        const statedCost = startingAvgCost !== undefined && startingAvgCost > 0;
        const costPerBtc = statedCost ? startingAvgCost : startPrice;
        if (costPerBtc > 0) {
            startingStackCost = startingBtc * costPerBtc;
            totalInvested += startingStackCost;
            totalBtc += startingBtc;
            purchases.push({ ts: startTs, amount: startingStackCost });
            holdings.push({ day: startDay, totalBtc });
            // The row's price is a market price only when no cost was stated.
            const stackKind = kindAware && !statedCost ? lookup.kindAt(startDay) : undefined;
            breakdown.push({
                date: new Date(startTs).toISOString(),
                price: costPerBtc,
                invested: startingStackCost,
                totalInvested,
                accumulated: startingBtc,
                totalAccumulated: totalBtc,
                portfolioValue: totalBtc * (startPrice > 0 ? startPrice : costPerBtc),
                fee: 0,
                ...(stackKind ? { priceKind: stackKind } : {}),
                isStartingStack: true,
            });
        }
    }

    for (let i = 0; i < MAX_SCHEDULE_PURCHASES; i++) {
        const ts = nextPurchaseTs(startTs, i, frequency, anchorDay);
        if (ts > endTs) break;

        // The per-purchase amount steps up on each 12-month anniversary, the way
        // real plans grow with income — not continuously, which nobody does.
        const scheduledAmount = escalation > 0
            ? amount * Math.pow(1 + escalation, utcFullYearsBetween(startTs, ts))
            : amount;

        let purchasePrice = manualPrice;
        let priceKind: PriceKind | undefined;
        if (priceMode === 'api') {
            const day = utcDayIndex(ts);
            purchasePrice = lookup ? (lookup.priceAt(day) ?? 0) : 0;
            if (kindAware) priceKind = lookup.kindAt(day);
            // Still marked estimated: no price has been observed for that day.
            if (quote !== null && day > quoteDay && purchasePrice > 0) purchasePrice = quote;
        }

        // A plan that buys nothing (amount 0, to hold a starting stack) has no
        // purchases: no rows, no best or worst buy, nothing priced on estimates.
        if (purchasePrice > 0 && scheduledAmount > 0) {
            // The flat fee is a fixed charge per order: it does not grow with
            // the yearly raise, only the percentage part does.
            const { fee, net: netInvestment } = applyFees(scheduledAmount, clampedFee, flat);
            const btcBought = netInvestment / purchasePrice;

            // The full amount left the bank, fee included, so that is what is
            // invested and what the XIRR cash flow carries.
            totalInvested += scheduledAmount;
            scheduledInvested += scheduledAmount;
            feeSum += fee;
            totalBtc += btcBought;
            purchases.push({ ts, amount: scheduledAmount });
            if (priceKind === 'estimated') estimatedPurchases++;

            const dateIso = new Date(ts).toISOString();
            if (!bestBuy || purchasePrice < bestBuy.price) {
                bestBuy = { date: dateIso, price: purchasePrice, ...(priceKind ? { priceKind } : {}) };
            }
            if (!worstBuy || purchasePrice > worstBuy.price) {
                worstBuy = { date: dateIso, price: purchasePrice, ...(priceKind ? { priceKind } : {}) };
            }

            const portfolioValue = totalBtc * purchasePrice;
            holdings.push({ day: utcDayIndex(ts), totalBtc });

            breakdown.push({
                date: dateIso,
                price: purchasePrice,
                invested: scheduledAmount,
                totalInvested,
                accumulated: btcBought,
                totalAccumulated: totalBtc,
                portfolioValue,
                fee,
                ...(priceKind ? { priceKind } : {}),
            });
        }
    }

    let finalPrice = currentPrice || manualPrice;
    // When the spot quote is missing, the stack is valued at the last bar's
    // close — so the XIRR terminal flow below must be dated at that bar, not
    // "now". Dating a window-end valuation at today stretches the same return
    // over extra years and understates the rate.
    let valuationNowTs = asOf === undefined ? Date.now() : asOf;
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
    // Dated at `endTs` but valued at today's price, years of growth would be
    // compressed into the backtest window and XIRR inflated by an order of
    // magnitude ($50/wk 2016-2018: +574%/yr instead of +54%).
    // Never earlier than the last purchase, so a future-dated schedule stays sane.
    const valuationTs = purchases.length > 0
        ? Math.max(valuationNowTs, purchases[purchases.length - 1].ts)
        : endTs;
    const xirr = calculateXirr(purchases, currentValue, valuationTs);

    // At a fixed manual price the portfolio can never fall, so a market-data
    // drawdown walk would report risk for a series the user explicitly priced
    // flat. No number is honest here — null renders as "—".
    const drawdown = priceMode === 'manual' ? null : computeMaxDrawdown(holdings, priceData, endTs);

    const stats: DcaStats = {
        xirrPercent: xirr !== null ? xirr * 100 : null,
        maxDrawdownPercent: drawdown !== null ? drawdown.maxDrawdown * 100 : null,
        bestBuy,
        worstBuy,
        // Summed per buy once a flat fee is involved (the cap makes it differ
        // from buy to buy); otherwise a single multiplication.
        feesPaid: flat > 0 ? feeSum : scheduledInvested * (clampedFee / 100),
        feePercentOfBuy: scheduledInvested > 0
            ? (flat > 0 ? (feeSum / scheduledInvested) * 100 : clampedFee)
            : 0,
        startingStackCost,
        ...(kindAware && drawdown !== null
            ? {
                estimatedPrices: {
                    purchases: estimatedPurchases,
                    drawdownDays: drawdown.estimatedDays,
                    drawdownDaysWalked: drawdown.daysWalked,
                },
            }
            : {}),
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

/**
 * The plan as it stands today: only purchases dated on or before today (UTC)
 * have happened, so the schedule is cut off at the earlier of its end date and
 * `asOf`'s UTC day.
 *
 * calculateDca runs a future-dated plan to its end date and prices the buys
 * that have not happened yet. That is right for a labelled projection and
 * wrong everywhere a figure is read as history: a share card, an embed, an API
 * response, "invested so far", coins "stacked". Those surfaces call this
 * instead. `endsInFuture` tells them the plan continues, so they can say so
 * rather than imply it is finished.
 *
 * `asOf` is both "today" and the valuation instant (see calculateDca).
 *
 * Two things this does not do. A starting stack is still counted when the
 * plan has not started: those coins are already held. And it does not check
 * that the price series reaches today; priceSeriesCovers is for that.
 */
export function calculateDcaToDate(
    params: DcaParams,
    priceData?: PricePoint[],
    currentPrice?: number | null,
    asOf: number = Date.now(),
): DcaToDateResult {
    const startTs = utcDayStart(params.startDate.getTime());
    const plannedEndTs = utcDayStart(params.endDate.getTime());
    const todayTs = utcDayStart(asOf);
    const throughTs = clampToTodayUtc(plannedEndTs, asOf);
    const result = calculateDca({ ...params, endDate: new Date(throughTs) }, priceData, currentPrice, asOf);
    return {
        ...result,
        plannedEndTs,
        throughTs,
        endsInFuture: plannedEndTs > todayTs,
        notStarted: startTs > todayTs,
    };
}

export function calculateAssetDca(
    amount: number,
    frequency: Frequency,
    startDate: Date,
    endDate: Date,
    feePercentage: number,
    priceData: PricePoint[],
    asset: string,
    label: string,
    annualEscalationPct: number = 0,
    flatFee: number = 0,
): AssetDcaResult {
    const lookup = priceData.length > 0 ? createPriceLookup(priceData) : null;

    const startTs = utcDayStart(startDate.getTime());
    const endTs = utcDayStart(endDate.getTime());
    // Same Invalid Date guard as calculateDca.
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) {
        return { asset, label, totalInvested: 0, currentValue: 0, profit: 0, roi: 0, breakdown: [] };
    }
    const anchorDay = new Date(startTs).getUTCDate();

    let totalInvested = 0;
    let totalUnits = 0;
    const clampedFee = clampFeePct(feePercentage);
    // Mirrors calculateDca's fees and anniversary step — the comparison is only
    // fair if every asset receives the same deposit stream at the same cost.
    const flat = clampFlatFee(flatFee);
    const escalation = Math.max(0, annualEscalationPct) / 100;

    const breakdown: { date: string; portfolioValue: number }[] = [];

    for (let i = 0; i < MAX_SCHEDULE_PURCHASES; i++) {
        const ts = nextPurchaseTs(startTs, i, frequency, anchorDay);
        if (ts > endTs) break;

        const scheduledAmount = escalation > 0
            ? amount * Math.pow(1 + escalation, utcFullYearsBetween(startTs, ts))
            : amount;

        const purchasePrice = lookup ? (lookup.priceAt(utcDayIndex(ts)) ?? 0) : 0;

        if (purchasePrice > 0 && scheduledAmount > 0) {
            const { net: netInvestment } = applyFees(scheduledAmount, clampedFee, flat);
            totalUnits += netInvestment / purchasePrice;
            totalInvested += scheduledAmount;

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
    priceData: PricePoint[],
    currentPrice: number,
    feePercentage: number = 0,
    flatFee: number = 0,
): LumpSumResult {
    if (!priceData || priceData.length === 0 || currentPrice <= 0) {
        return { totalInvested: totalAmount, btcAccumulated: 0, currentValue: 0, profit: -totalAmount, roi: -100 };
    }

    // Price the entry with the same lookback the DCA leg uses (last bar at or
    // before the start day): a forward scan would price the two strategies on
    // different days whenever the start day itself had no bar. Falling
    // forward is kept only for starts that predate all data: the lump sum
    // "waits" and buys at the first bar, mirroring a DCA plan whose earliest
    // purchases are skipped for lack of a price.
    const startTs = utcDayStart(startDate.getTime());
    const lookup = createPriceLookup(priceData);
    let entryPrice = lookup.priceAt(utcDayIndex(startTs)) ?? 0;
    if (entryPrice <= 0) {
        entryPrice = priceData[0][1];
    }
    if (entryPrice <= 0) {
        return { totalInvested: totalAmount, btcAccumulated: 0, currentValue: 0, profit: -totalAmount, roi: -100 };
    }

    // Apply the same exchange fee the DCA side pays, for a fair comparison.
    // A lump sum is one order, so it pays the flat fee once where the DCA
    // schedule pays it on every buy.
    const { net } = applyFees(totalAmount, clampFeePct(feePercentage), clampFlatFee(flatFee));
    const btcAccumulated = net / entryPrice;
    const currentValue = btcAccumulated * currentPrice;
    const profit = currentValue - totalAmount;
    const roi = totalAmount > 0 ? (profit / totalAmount) * 100 : 0;

    return { totalInvested: totalAmount, btcAccumulated, currentValue, profit, roi };
}
