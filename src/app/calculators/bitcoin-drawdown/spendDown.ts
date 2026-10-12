/**
 * The spend-down planner's arithmetic: sell a stack month by month and see when
 * it runs out. Kept out of the component so every figure the planner prints can
 * be tested. Nothing here touches the clock, the network or a currency: every
 * amount is USD and every rate is a fraction per year.
 */

/** The yearly price change the planner accepts, as fractions (-0.9 = -90%). */
export const GROWTH_MIN = -0.9;
export const GROWTH_MAX = 3;

export interface SimParams {
    startBtc: number;
    priceUsd: number;
    monthlyWithdrawalUsd: number;
    annualGrowth: number;
    annualInflation: number;
    floorBtc: number;
}

export interface PathPoint {
    /** Years elapsed since today */
    year: number;
    /** Stack value in USD at that month */
    value: number;
    /** BTC remaining at that month */
    btc: number;
}

export interface SimResult {
    /** Complete months funded by the stack */
    monthsSurvived: number;
    /** True when the stack outlived the simulated horizon */
    neverExhausted: boolean;
    btcRemaining: number;
    /** Nominal USD withdrawn (not inflation-adjusted back to today) */
    totalWithdrawnUsd: number;
    path: PathPoint[];
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/**
 * Spend the stack down month by month.
 *
 * Each month the price compounds by `(1+g)^(1/12)-1`, the withdrawal compounds by the
 * monthly inflation rate, and `withdrawal / price` BTC is sold. The month the sale can
 * no longer be funded (down to the floor) is the month the stack runs out.
 */
export function simulateDrawdown(p: SimParams, maxMonths: number, collectPath: boolean): SimResult {
    const growth = clamp(p.annualGrowth, GROWTH_MIN, GROWTH_MAX);
    const monthlyGrowth = Math.pow(1 + growth, 1 / 12) - 1;
    const monthlyInflation = Math.pow(1 + clamp(p.annualInflation, -0.5, 0.5), 1 / 12) - 1;

    let btc = p.startBtc;
    let price = p.priceUsd;
    let withdrawal = p.monthlyWithdrawalUsd;
    let totalWithdrawn = 0;
    let months = 0;

    const path: PathPoint[] = collectPath ? [{ year: 0, value: btc * price, btc }] : [];

    for (let m = 1; m <= maxMonths; m++) {
        price *= 1 + monthlyGrowth;
        if (!Number.isFinite(price) || price <= 0) break; // degenerate assumptions

        const spendable = btc - p.floorBtc;
        const btcNeeded = withdrawal / price;

        if (!Number.isFinite(btcNeeded) || btcNeeded >= spendable) {
            // Final, partially funded month: sell what is left above the floor and stop.
            if (spendable > 0) totalWithdrawn += spendable * price;
            btc = p.floorBtc;
            if (collectPath) path.push({ year: m / 12, value: btc * price, btc });
            break;
        }

        btc -= btcNeeded;
        totalWithdrawn += withdrawal;
        withdrawal *= 1 + monthlyInflation;
        months = m;
        if (collectPath) path.push({ year: m / 12, value: btc * price, btc });
    }

    return {
        monthsSurvived: months,
        neverExhausted: months >= maxMonths,
        btcRemaining: btc,
        totalWithdrawnUsd: totalWithdrawn,
        path,
    };
}

/**
 * Largest monthly withdrawal (USD, today's money) that still funds `targetMonths`.
 * Months survived is monotonically non-increasing in the withdrawal amount, so bisection
 * converges; the upper bound (one month = the whole stack) always fails.
 */
export function solveSustainableWithdrawal(base: SimParams, targetMonths: number): number | null {
    const spendable = base.startBtc - base.floorBtc;
    if (!(spendable > 0) || !(base.priceUsd > 0)) return null;

    const lasts = (w: number): boolean =>
        simulateDrawdown({ ...base, monthlyWithdrawalUsd: w }, targetMonths, false).monthsSurvived >= targetMonths;

    let lo = 0;
    let hi = Math.max(spendable * base.priceUsd, 1);
    if (lasts(hi)) return hi; // unreachable in practice; keeps the result bounded
    if (!lasts(lo)) return null;

    for (let i = 0; i < 48; i++) {
        const mid = (lo + hi) / 2;
        if (lasts(mid)) lo = mid;
        else hi = mid;
    }
    return lo;
}

/**
 * A money amount rounded DOWN to what is printed: whole units, or four
 * decimals under one unit.
 *
 * For the largest-withdrawal figure. Rounded to the nearest unit it can sit
 * above the solved amount, and that printed number, typed into the withdrawal
 * field, runs out a month short of the years it is labelled with. Rounded
 * down it always lasts them.
 */
export const floorMoney = (value: number): number => {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value >= 1 ? Math.floor(value) : Math.floor(value * 1e4) / 1e4;
};
