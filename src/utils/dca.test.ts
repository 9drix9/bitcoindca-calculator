import { describe, expect, it } from 'vitest';
import { calculateDca, calculateXirr, calculateLumpSum } from './dca';
import { DAY_MS, EARLIEST_PRICE_TS } from './dates';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Daily bars from `startTs`, price given by `priceFn(dayIndex)`. */
const series = (startTs: number, days: number, priceFn: (i: number) => number): [number, number][] =>
    Array.from({ length: days }, (_, i) => [startTs + i * DAY_MS, priceFn(i)] as [number, number]);

const flat = (startTs: number, days: number, price: number) => series(startTs, days, () => price);

const params = (over: Partial<Parameters<typeof calculateDca>[0]> = {}) => ({
    amount: 100,
    frequency: 'weekly' as const,
    startDate: new Date(Date.UTC(2020, 0, 1)),
    endDate: new Date(Date.UTC(2020, 11, 31)),
    feePercentage: 0,
    priceMode: 'api' as const,
    manualPrice: 0,
    ...over,
});

// ── XIRR ──────────────────────────────────────────────────────────────────────

describe('calculateXirr', () => {
    it('returns the exact rate for a single cash flow doubling over one year', () => {
        const t0 = Date.UTC(2020, 0, 1);
        const rate = calculateXirr([{ ts: t0, amount: 100 }], 200, t0 + Math.round(365.25 * DAY_MS));
        expect(rate).toBeCloseTo(1.0, 4); // +100%/yr
    });

    it('returns null for periods under 90 days (annualizing them is meaningless)', () => {
        const t0 = Date.UTC(2020, 0, 1);
        expect(calculateXirr([{ ts: t0, amount: 100 }], 150, t0 + 30 * DAY_MS)).toBeNull();
    });

    it('returns a negative rate when the terminal value is below contributions', () => {
        const t0 = Date.UTC(2020, 0, 1);
        const rate = calculateXirr([{ ts: t0, amount: 100 }], 50, t0 + Math.round(365.25 * DAY_MS));
        expect(rate).toBeLessThan(0);
        expect(rate).toBeCloseTo(-0.5, 4);
    });

    it('handles many contributions without diverging', () => {
        const t0 = Date.UTC(2015, 0, 1);
        const purchases = Array.from({ length: 260 }, (_, i) => ({ ts: t0 + i * 7 * DAY_MS, amount: 50 }));
        const rate = calculateXirr(purchases, 40_000, t0 + 260 * 7 * DAY_MS);
        expect(rate).not.toBeNull();
        expect(Number.isFinite(rate!)).toBe(true);
        expect(rate!).toBeGreaterThan(0);
        expect(rate!).toBeLessThan(5);
    });
});

// ── The regression this suite exists for ──────────────────────────────────────

describe('XIRR terminal-flow dating (regression)', () => {
    // The engine values the stack at TODAY's price. Dating the terminal cash flow
    // at the backtest's end date instead compressed years of growth into the
    // window and inflated the annualized return by an order of magnitude.
    it('does not inflate XIRR when the end date is far in the past', () => {
        const start = Date.UTC(2020, 0, 1);
        const end = Date.UTC(2020, 11, 31);
        // Price flat at 10k for the whole backtest; "today" spot is also 10k, so a
        // truthful annualized return is ~0% — not a huge positive number.
        const prices = flat(start, 400, 10_000);
        const { stats } = calculateDca(
            params({ startDate: new Date(start), endDate: new Date(end) }),
            prices,
            10_000,
        );
        expect(stats!.xirrPercent).not.toBeNull();
        // Any positive-return reading here would be the old bug resurfacing.
        expect(Math.abs(stats!.xirrPercent!)).toBeLessThan(5);
    });

    it('reports a plausible annualized rate for a real-shaped run', () => {
        const start = Date.UTC(2020, 0, 1);
        const end = Date.UTC(2021, 0, 1);
        const prices = flat(start, 400, 10_000);
        // Stack doubled by today's spot.
        const { stats, roi } = calculateDca(
            params({ startDate: new Date(start), endDate: new Date(end) }),
            prices,
            20_000,
        );
        expect(roi).toBeCloseTo(100, 0);
        // Total return is +100%, but it was earned over the years between the end
        // date and today, so the ANNUALIZED figure must be well under 100%.
        expect(stats!.xirrPercent!).toBeLessThan(100);
        expect(stats!.xirrPercent!).toBeGreaterThan(0);
    });
});

// ── Price lookup guards ───────────────────────────────────────────────────────

describe('pre-data start dates', () => {
    it('skips purchases that predate every price bar instead of inventing a price', () => {
        // Bars start in 2015; the schedule starts in 2013.
        const dataStart = Date.UTC(2015, 0, 1);
        const prices = flat(dataStart, 400, 300);
        const result = calculateDca(
            params({
                startDate: new Date(Date.UTC(2013, 0, 1)),
                endDate: new Date(Date.UTC(2015, 5, 1)),
                frequency: 'monthly',
            }),
            prices,
            300,
        );
        // Only the months from 2015-01 onward may be counted.
        expect(result.breakdown.length).toBeGreaterThan(0);
        for (const item of result.breakdown) {
            expect(new Date(item.date).getTime()).toBeGreaterThanOrEqual(dataStart);
        }
        expect(result.btcAccumulated).toBeLessThan(10);
    });

    it('carries the last known price forward for future-dated purchases', () => {
        // This direction is intentional: a future end date projects at spot.
        const start = Date.UTC(2020, 0, 1);
        const prices = flat(start, 30, 10_000);
        const result = calculateDca(
            params({
                startDate: new Date(start),
                endDate: new Date(start + 90 * DAY_MS),
                frequency: 'weekly',
            }),
            prices,
            10_000,
        );
        // Days 0,7,...,84 fall within the 90-day window: 13 buys, every one priced
        // even though the bars ran out at day 29.
        expect(result.breakdown.length).toBe(13);
        expect(result.breakdown.every((b) => b.price === 10_000)).toBe(true);
    });
});

// ── Schedules ─────────────────────────────────────────────────────────────────

describe('purchase schedules', () => {
    const start = Date.UTC(2021, 0, 1);
    const prices = flat(start, 800, 50_000);

    it('generates one purchase per period, inclusive of both endpoints', () => {
        const weekly = calculateDca(
            params({ startDate: new Date(start), endDate: new Date(start + 70 * DAY_MS) }),
            prices,
            50_000,
        );
        expect(weekly.breakdown.length).toBe(11); // day 0,7,...,70
    });

    it('does not skip February for a month-end anchored schedule', () => {
        const jan31 = Date.UTC(2021, 0, 31);
        const result = calculateDca(
            params({
                startDate: new Date(jan31),
                endDate: new Date(Date.UTC(2021, 4, 1)),
                frequency: 'monthly',
            }),
            flat(jan31, 200, 50_000),
            50_000,
        );
        const months = result.breakdown.map((b) => new Date(b.date).getUTCMonth());
        expect(months).toEqual([0, 1, 2, 3]); // Jan, Feb, Mar, Apr — February present
    });

    it('re-anchors to the original day-of-month after a short month', () => {
        const jan31 = Date.UTC(2021, 0, 31);
        const result = calculateDca(
            params({
                startDate: new Date(jan31),
                endDate: new Date(Date.UTC(2021, 3, 1)),
                frequency: 'monthly',
            }),
            flat(jan31, 200, 50_000),
            50_000,
        );
        const days = result.breakdown.map((b) => new Date(b.date).getUTCDate());
        expect(days).toEqual([31, 28, 31]); // no drift to the 28th
    });

    it('buckets by UTC day regardless of the host timezone', () => {
        // A Date built from a local-midnight string still lands on the UTC day.
        const result = calculateDca(
            params({
                startDate: new Date(Date.UTC(2021, 0, 1)),
                endDate: new Date(Date.UTC(2021, 0, 8)),
            }),
            prices,
            50_000,
        );
        expect(new Date(result.breakdown[0].date).toISOString()).toBe('2021-01-01T00:00:00.000Z');
    });
});

// ── Fees ──────────────────────────────────────────────────────────────────────

describe('fees', () => {
    const start = Date.UTC(2021, 0, 1);
    const prices = flat(start, 100, 10_000);

    it('charges the fee out of each contribution, not on top of it', () => {
        const result = calculateDca(
            params({
                startDate: new Date(start),
                endDate: new Date(start + 7 * DAY_MS),
                amount: 100,
                feePercentage: 1,
            }),
            prices,
            10_000,
        );
        expect(result.totalInvested).toBe(200); // two buys of exactly 100
        expect(result.btcAccumulated).toBeCloseTo((2 * 99) / 10_000, 12);
        expect(result.stats!.feesPaid).toBeCloseTo(2, 12);
    });

    it('clamps out-of-range fee percentages', () => {
        const over = calculateDca(
            params({ startDate: new Date(start), endDate: new Date(start), feePercentage: 900 }),
            prices,
            10_000,
        );
        expect(over.btcAccumulated).toBe(0);
        const under = calculateDca(
            params({ startDate: new Date(start), endDate: new Date(start), feePercentage: -50 }),
            prices,
            10_000,
        );
        expect(under.btcAccumulated).toBeCloseTo(100 / 10_000, 12);
    });
});

// ── Max drawdown ──────────────────────────────────────────────────────────────

describe('max drawdown', () => {
    it('catches a crash that happens entirely between two monthly purchases', () => {
        // Price sits at 100, collapses to 40 mid-month, recovers before the next buy.
        // Sampling only on purchase days scored this as 0% drawdown.
        const start = Date.UTC(2021, 0, 1);
        const prices = series(start, 200, (i) => (i >= 40 && i <= 50 ? 40 : 100));
        const { stats } = calculateDca(
            params({
                startDate: new Date(start),
                endDate: new Date(start + 180 * DAY_MS),
                frequency: 'monthly',
            }),
            prices,
            100,
        );
        expect(stats!.maxDrawdownPercent).toBeGreaterThan(50);
    });

    it('reports no drawdown for a monotonically rising price', () => {
        const start = Date.UTC(2021, 0, 1);
        const prices = series(start, 200, (i) => 100 + i);
        const { stats } = calculateDca(
            params({ startDate: new Date(start), endDate: new Date(start + 180 * DAY_MS) }),
            prices,
            300,
        );
        expect(stats!.maxDrawdownPercent).toBeCloseTo(0, 6);
    });

    it('reports null in manual mode, even when a crashing market series is supplied', () => {
        const start = Date.UTC(2021, 0, 1);
        const prices = series(start, 200, (i) => (i > 100 ? 20 : 100));
        const { stats } = calculateDca(
            params({
                startDate: new Date(start),
                endDate: new Date(start + 180 * DAY_MS),
                priceMode: 'manual',
                manualPrice: 50_000,
            }),
            prices,
            null,
        );
        expect(stats!.maxDrawdownPercent).toBeNull();
    });
});

// ── XIRR terminal-flow dating ─────────────────────────────────────────────────

describe('XIRR valuation dating', () => {
    it('dates the terminal flow at the last bar when no spot price is available', () => {
        // Window ends long ago, no currentPrice: value = last bar's close.
        // Dated "today" the same doubling would be diluted over ~5x the years.
        const start = Date.UTC(2020, 0, 1);
        const prices = series(start, 366, (i) => 10_000 + (10_000 * i) / 365);
        const { stats } = calculateDca(
            params({
                startDate: new Date(start),
                endDate: new Date(start + 365 * DAY_MS),
                frequency: 'monthly',
            }),
            prices,
            null,
        );
        // Money went in across the year at rising prices and the stack roughly
        // doubled versus its average cost — an annualized rate way above what
        // today-dating (extra years, same gain) could ever produce.
        expect(stats!.xirrPercent).not.toBeNull();
        expect(stats!.xirrPercent!).toBeGreaterThan(50);
    });
});

// ── Aggregates ────────────────────────────────────────────────────────────────

describe('result aggregates', () => {
    const start = Date.UTC(2021, 0, 1);

    it('computes average cost, profit and ROI consistently', () => {
        const prices = series(start, 100, (i) => (i < 7 ? 10_000 : 20_000));
        const result = calculateDca(
            params({
                startDate: new Date(start),
                endDate: new Date(start + 7 * DAY_MS),
                amount: 1000,
            }),
            prices,
            20_000,
        );
        // 1000 at 10k + 1000 at 20k = 0.1 + 0.05 = 0.15 BTC for 2000 spent
        expect(result.btcAccumulated).toBeCloseTo(0.15, 12);
        expect(result.averageCost).toBeCloseTo(2000 / 0.15, 6);
        expect(result.currentValue).toBeCloseTo(3000, 6);
        expect(result.profit).toBeCloseTo(1000, 6);
        expect(result.roi).toBeCloseTo(50, 6);
    });

    it('returns a zeroed result rather than NaN when nothing can be priced', () => {
        const result = calculateDca(
            params({ startDate: new Date(start), endDate: new Date(start + 30 * DAY_MS) }),
            [],
            null,
        );
        expect(result.totalInvested).toBe(0);
        expect(result.btcAccumulated).toBe(0);
        expect(Number.isNaN(result.roi)).toBe(false);
        expect(Number.isNaN(result.averageCost)).toBe(false);
    });

    it('starts no earlier than the first day with real price data', () => {
        expect(EARLIEST_PRICE_TS).toBe(Date.UTC(2010, 7, 18));
    });
});

// ── Starting stack & escalation ───────────────────────────────────────────────

describe('starting stack', () => {
    const start = Date.UTC(2021, 0, 1);

    it('adds the held coins, costed at the start-date price when no cost is given', () => {
        const prices = flat(start, 30, 10_000);
        const result = calculateDca(
            params({ startDate: new Date(start), endDate: new Date(start + 14 * DAY_MS), startingBtc: 0.5 }),
            prices,
            10_000,
        );
        // 0.5 BTC costed at $10k = $5,000, plus 3 weekly $100 buys.
        expect(result.totalInvested).toBeCloseTo(5_300, 6);
        expect(result.btcAccumulated).toBeCloseTo(0.5 + 300 / 10_000, 12);
        expect(result.stats!.startingStackCost).toBeCloseTo(5_000, 6);
    });

    it('uses the stated average cost when given, and never charges fees on the stack', () => {
        const prices = flat(start, 30, 10_000);
        const result = calculateDca(
            params({
                startDate: new Date(start),
                endDate: new Date(start + 14 * DAY_MS),
                startingBtc: 1,
                startingAvgCost: 2_000,
                feePercentage: 1,
            }),
            prices,
            10_000,
        );
        expect(result.stats!.startingStackCost).toBeCloseTo(2_000, 6);
        // Fees apply to the 3 × $100 scheduled buys only.
        expect(result.stats!.feesPaid).toBeCloseTo(3, 6);
        expect(result.totalInvested).toBeCloseTo(2_300, 6);
    });

    it('keeps best/worst buy about the schedule, not the stack', () => {
        const prices = series(start, 30, (i) => (i < 7 ? 10_000 : 20_000));
        const result = calculateDca(
            params({
                startDate: new Date(start),
                endDate: new Date(start + 14 * DAY_MS),
                startingBtc: 1,
                startingAvgCost: 50, // far below any scheduled price
            }),
            prices,
            20_000,
        );
        expect(result.stats!.bestBuy!.price).toBe(10_000);
    });
});

describe('annual escalation', () => {
    it('steps the purchase amount up on each 12-month anniversary', () => {
        const start = Date.UTC(2020, 0, 15);
        const prices = flat(start, 800, 10_000);
        const result = calculateDca(
            params({
                startDate: new Date(start),
                endDate: new Date(Date.UTC(2021, 0, 20)),
                frequency: 'monthly',
                annualEscalationPct: 10,
            }),
            prices,
            10_000,
        );
        // 12 buys in year one at $100, the 13th (Jan 15 2021, the anniversary) at $110.
        expect(result.breakdown.length).toBe(13);
        expect(result.breakdown[0].invested).toBeCloseTo(100, 6);
        expect(result.breakdown[11].invested).toBeCloseTo(100, 6);
        expect(result.breakdown[12].invested).toBeCloseTo(110, 6);
        expect(result.totalInvested).toBeCloseTo(12 * 100 + 110, 6);
    });

    it('is a no-op at 0%', () => {
        const start = Date.UTC(2020, 0, 1);
        const prices = flat(start, 800, 10_000);
        const a = calculateDca(params({ startDate: new Date(start), endDate: new Date(start + 700 * DAY_MS) }), prices, 10_000);
        const b = calculateDca(params({ startDate: new Date(start), endDate: new Date(start + 700 * DAY_MS), annualEscalationPct: 0 }), prices, 10_000);
        expect(a.totalInvested).toBe(b.totalInvested);
        expect(a.btcAccumulated).toBe(b.btcAccumulated);
    });
});

// ── Lump sum ──────────────────────────────────────────────────────────────────

describe('calculateLumpSum', () => {
    const start = Date.UTC(2021, 0, 1);

    it('buys once at the start date bar', () => {
        const prices = series(start, 100, (i) => (i === 0 ? 10_000 : 50_000));
        const result = calculateLumpSum(10_000, new Date(start), prices, 20_000, 0);
        expect(result.btcAccumulated).toBeCloseTo(1, 12);
        expect(result.currentValue).toBeCloseTo(20_000, 6);
        expect(result.roi).toBeCloseTo(100, 6);
    });

    it('prices a gap day at the previous close, matching the DCA leg', () => {
        // Bars on day 0 and day 5 only; a start on day 3 must look BACK to
        // day 0's close, exactly like the DCA engine, not forward to day 5.
        const prices: [number, number][] = [
            [start, 10_000],
            [start + 5 * DAY_MS, 50_000],
        ];
        const result = calculateLumpSum(10_000, new Date(start + 3 * DAY_MS), prices, 20_000, 0);
        expect(result.btcAccumulated).toBeCloseTo(1, 12);
    });

    it('falls forward to the first bar only when the start predates all data', () => {
        const prices = series(start, 10, () => 20_000);
        const result = calculateLumpSum(10_000, new Date(start - 30 * DAY_MS), prices, 20_000, 0);
        expect(result.btcAccumulated).toBeCloseTo(0.5, 12);
    });

    it('applies the same fee the DCA side pays, for a fair comparison', () => {
        const prices = flat(start, 10, 10_000);
        const result = calculateLumpSum(10_000, new Date(start), prices, 10_000, 1);
        expect(result.btcAccumulated).toBeCloseTo(0.99, 12);
        expect(result.totalInvested).toBe(10_000);
    });

    it('degrades safely with no price data', () => {
        const result = calculateLumpSum(5_000, new Date(start), [], 10_000, 0);
        expect(result.roi).toBe(-100);
        expect(Number.isNaN(result.currentValue)).toBe(false);
    });
});
