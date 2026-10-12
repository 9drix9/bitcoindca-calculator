import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    calculateDca, calculateDcaToDate, calculateXirr, calculateLumpSum, calculateAssetDca,
    withPriceKinds, priceSeriesCovers, seriesThroughDay,
    MAX_SCHEDULE_PURCHASES, PRICE_STALE_TOLERANCE_DAYS,
} from './dca';
import { DAY_MS, EARLIEST_PRICE_TS, MAX_END_TS, utcDayStart } from './dates';
import type { Frequency, PriceKind, PricePoint } from '@/types';

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
        expect(calculateXirr([{ ts: t0, amount: 100 }], 150, t0 + 75 * DAY_MS)).toBeNull();
        expect(calculateXirr([{ ts: t0, amount: 100 }], 150, t0 + 90 * DAY_MS - 1)).toBeNull();
        expect(calculateXirr([{ ts: t0, amount: 100 }], 150, t0 + 90 * DAY_MS)).not.toBeNull();
        // The same floor through the engine: a 75-day plan has no annualized rate.
        const prices = flat(t0, 76, 10_000);
        const short = calculateDca(params({ startDate: new Date(t0), endDate: new Date(t0 + 75 * DAY_MS) }), prices, 12_000, t0 + 75 * DAY_MS);
        expect(short.roi).toBeCloseTo(20, 9);
        expect(short.stats!.xirrPercent).toBeNull();
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

// ── Buys still to come ────────────────────────────────────────────────────────

describe('buys still to come', () => {
    // Daily closes to today. The series' row for today reads 100,000; the live
    // quote, taken later, reads 101,000.
    const today = Date.UTC(2026, 9, 12);
    const asOf = today + 14 * 3_600_000;
    const prices = flat(today - 400 * DAY_MS, 401, 100_000);
    const quote = 101_000;
    const upcoming = params({ startDate: new Date(Date.UTC(2027, 0, 4)), endDate: new Date(Date.UTC(2027, 11, 27)) });

    it('are priced at the quote the stack is valued at, so a fee-free projection shows no gain or loss', () => {
        const result = calculateDca(upcoming, prices, quote, asOf);
        expect(result.breakdown).toHaveLength(52);
        expect(result.breakdown.every((row) => row.price === quote)).toBe(true);
        expect(result.totalInvested).toBe(5_200);
        expect(result.currentValue).toBeCloseTo(5_200, 9);
        expect(result.roi).toBeCloseTo(0, 9);
    });

    it('lose exactly the fee', () => {
        const result = calculateDca({ ...upcoming, feePercentage: 0.5 }, prices, quote, asOf);
        expect(result.profit).toBeCloseTo(-26, 9);
        expect(result.roi).toBeCloseTo(-0.5, 9);
    });

    it('leave a buy dated today on the series row', () => {
        const straddling = params({ startDate: new Date(today - 7 * DAY_MS), endDate: new Date(today + 7 * DAY_MS) });
        const result = calculateDca(straddling, prices, quote, asOf);
        expect(result.breakdown.map((row) => row.price)).toEqual([100_000, 100_000, quote]);
    });

    it('take the last known price when there is no quote', () => {
        const result = calculateDca(upcoming, prices, null, asOf);
        expect(result.breakdown.every((row) => row.price === 100_000)).toBe(true);
    });

    it('are still marked as estimates: no price has been observed for those days', () => {
        const marked = withPriceKinds(prices, 'o'.repeat(prices.length));
        const result = calculateDca(upcoming, marked, quote, asOf);
        expect(result.breakdown.every((row) => row.priceKind === 'estimated')).toBe(true);
        expect(result.stats!.estimatedPrices!.purchases).toBe(52);
    });

    it('cost a starting stack that is not held yet at the same quote', () => {
        const result = calculateDca({ ...upcoming, startingBtc: 0.1 }, prices, quote, asOf);
        expect(result.breakdown[0]).toMatchObject({ isStartingStack: true, price: quote, invested: 10_100 });
        expect(result.profit).toBeCloseTo(0, 9);
    });

    it('are priced by the visitor at a fixed manual price, quote or no quote', () => {
        const result = calculateDca({ ...upcoming, priceMode: 'manual', manualPrice: 50_000 }, prices, quote, asOf);
        expect(result.breakdown.every((row) => row.price === 50_000)).toBe(true);
    });
});

// ── A plan that buys nothing ──────────────────────────────────────────────────

describe('a plan that buys nothing', () => {
    // One bitcoin held from 1 January 2026 while the price slides 50 a day.
    const start = Date.UTC(2026, 0, 1);
    const asOf = Date.UTC(2026, 9, 12);
    const prices = series(start, 285, (i) => 90_000 - 50 * i);
    const hold = params({ amount: 0, frequency: 'monthly', startDate: new Date(start), endDate: new Date(asOf), startingBtc: 1 });

    it('reports the stack it holds and no purchases', () => {
        const result = calculateDca(hold, withPriceKinds(prices, 'e'.repeat(prices.length)), 80_000, asOf);
        expect(result.breakdown).toHaveLength(1);
        expect(result.breakdown[0].isStartingStack).toBe(true);
        expect(result.stats!.bestBuy).toBeNull();
        expect(result.stats!.worstBuy).toBeNull();
        expect(result.stats!.estimatedPrices!.purchases).toBe(0);
        expect(result.stats!.feesPaid).toBe(0);
        // The money is all there: cost, value, return, and the fall along the way.
        expect(result.totalInvested).toBe(90_000);
        expect(result.currentValue).toBe(80_000);
        expect(result.roi).toBeCloseTo(-100 / 9, 9);
        expect(result.stats!.maxDrawdownPercent).toBeCloseTo((50 * 284 / 90_000) * 100, 9);
        expect(result.stats!.estimatedPrices!.drawdownDaysWalked).toBe(285);
    });

    it('reports nothing at all when there is no stack either', () => {
        const result = calculateDca({ ...hold, startingBtc: 0 }, prices, 80_000, asOf);
        expect(result.breakdown).toEqual([]);
        expect(result.totalInvested).toBe(0);
        expect(result.currentValue).toBe(0);
    });

    it('gives the comparison assets no purchases either', () => {
        const asset = calculateAssetDca(0, 'monthly', new Date(start), new Date(asOf), 0.5, prices, 'gold', 'Gold');
        expect(asset.breakdown).toEqual([]);
        expect(asset.totalInvested).toBe(0);
        expect(asset.currentValue).toBe(0);
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

    it('never dates the terminal flow before the last purchase of a plan that runs into the future', () => {
        // Closes to 2026-10-12, the quote equal to the last of them, and a
        // weekly plan that keeps buying until January 2028.
        const start = Date.UTC(2024, 0, 1);
        const asOf = Date.UTC(2026, 9, 12);
        const prices = series(start, 1016, (i) => 40_000 + 60 * i);
        const result = calculateDca(
            params({ startDate: new Date(Date.UTC(2025, 0, 6)), endDate: new Date(Date.UTC(2028, 0, 3)) }),
            prices,
            prices[prices.length - 1][1],
            asOf,
        );
        const flows = result.breakdown.map((row) => ({ ts: Date.parse(row.date), amount: row.invested }));
        const lastTs = flows[flows.length - 1].ts;
        expect(lastTs).toBe(Date.UTC(2028, 0, 3));
        expect(result.stats!.xirrPercent).toBeCloseTo(calculateXirr(flows, result.currentValue, lastTs)! * 100, 9);
        // Dated at asOf, money "paid in" after the valuation would count as growth.
        expect(result.stats!.xirrPercent).not.toBeCloseTo(calculateXirr(flows, result.currentValue, asOf)! * 100, 1);
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

    it('starts no earlier than the first day of our price data', () => {
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

// ── Determinism: the valuation instant ────────────────────────────────────────

describe('valuation instant (asOf)', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    const start = Date.UTC(2020, 0, 1);
    const prices = series(start, 900, (i) => 10_000 + 20 * i);
    const plan = params({ startDate: new Date(start), endDate: new Date(start + 899 * DAY_MS) });

    it('returns the same result for the same inputs, whatever the clock says', () => {
        // The home page is prerendered and hydrated later, sometimes on another
        // UTC day. Both sides pass the server's instant and must agree exactly.
        const asOf = Date.UTC(2026, 9, 11, 12);
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-11T12:00:00Z'));
        const first = calculateDca(plan, prices, 30_000, asOf);
        vi.setSystemTime(new Date('2031-03-05T07:00:00Z'));
        const later = calculateDca(plan, prices, 30_000, asOf);
        expect(later).toStrictEqual(first);
        expect(first.stats!.xirrPercent).not.toBeNull();
    });

    it('dates the final XIRR cash flow at asOf, and nothing else', () => {
        const early = calculateDca(plan, prices, 30_000, Date.UTC(2026, 9, 11));
        const late = calculateDca(plan, prices, 30_000, Date.UTC(2027, 9, 11));
        // The same gain spread over one more year is a lower annual rate.
        expect(late.stats!.xirrPercent!).toBeLessThan(early.stats!.xirrPercent!);
        expect(late.stats!.xirrPercent!).toBeGreaterThan(0);
        expect({ ...late, stats: { ...late.stats, xirrPercent: null } })
            .toStrictEqual({ ...early, stats: { ...early.stats, xirrPercent: null } });
    });

    it('gives the exact rate for one buy that doubles in one year', () => {
        const oneBuy = params({ startDate: new Date(start), endDate: new Date(start) });
        const { stats } = calculateDca(oneBuy, flat(start, 5, 10_000), 20_000, start + Math.round(365.25 * DAY_MS));
        expect(stats!.xirrPercent).toBeCloseTo(100, 4);
    });

    it('falls back to the current time when asOf is left out', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-11T00:00:00Z'));
        expect(calculateDca(plan, prices, 30_000))
            .toStrictEqual(calculateDca(plan, prices, 30_000, Date.UTC(2026, 9, 11)));
    });

    it('is not used when there is no spot price: the stack is valued and dated at the last bar', () => {
        const a = calculateDca(plan, prices, null, Date.UTC(2026, 9, 11));
        const b = calculateDca(plan, prices, null, Date.UTC(2040, 0, 1));
        expect(b).toStrictEqual(a);
        expect(a.currentValue).toBeCloseTo(a.btcAccumulated * prices[prices.length - 1][1], 6);
    });
});

// ── Past-only: what has actually happened ─────────────────────────────────────

describe('calculateDcaToDate', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    // Weekly from 2026-01-05. Forty weeks on is 2026-10-12, so "today" is a
    // purchase day: the case where an off-by-one on the day boundary shows.
    const start = Date.UTC(2026, 0, 5);
    const today = Date.UTC(2026, 9, 12);
    const prices = flat(start, 281, 100_000); // the last bar is today's
    const plan = params({ startDate: new Date(start), endDate: new Date(Date.UTC(2027, 0, 4)) });

    it('counts a plan that runs into the future only up to today', () => {
        const projected = calculateDca(plan, prices, 100_000, today);
        const soFar = calculateDcaToDate(plan, prices, 100_000, today);
        // The plain run schedules all 53 buys, pricing the 12 that have not
        // happened at the last known price.
        expect(projected.breakdown.length).toBe(53);
        expect(soFar.breakdown.length).toBe(41);
        expect(soFar.totalInvested).toBe(4_100);
        expect(soFar.breakdown[40].date).toBe('2026-10-12T00:00:00.000Z');
        expect(soFar.endsInFuture).toBe(true);
        expect(soFar.notStarted).toBe(false);
        expect(soFar.plannedEndTs).toBe(Date.UTC(2027, 0, 4));
        expect(soFar.throughTs).toBe(today);
    });

    it('includes a buy dated today (UTC) from the first second of the day to the last', () => {
        expect(calculateDcaToDate(plan, prices, 100_000, today - 1_000).breakdown.length).toBe(40);
        expect(calculateDcaToDate(plan, prices, 100_000, today).breakdown.length).toBe(41);
        expect(calculateDcaToDate(plan, prices, 100_000, today + DAY_MS - 1).breakdown.length).toBe(41);
        expect(calculateDcaToDate(plan, prices, 100_000, today + DAY_MS).breakdown.length).toBe(41);
    });

    it('is the whole backtest when the plan already ended', () => {
        const ended = params({ startDate: new Date(start), endDate: new Date(start + 70 * DAY_MS) });
        const { plannedEndTs, throughTs, endsInFuture, notStarted, ...result } = calculateDcaToDate(ended, prices, 100_000, today);
        expect(result).toStrictEqual(calculateDca(ended, prices, 100_000, today));
        expect({ plannedEndTs, throughTs, endsInFuture, notStarted }).toEqual({
            plannedEndTs: start + 70 * DAY_MS,
            throughTs: start + 70 * DAY_MS,
            endsInFuture: false,
            notStarted: false,
        });
    });

    it('buys nothing for a plan that has not started', () => {
        const upcoming = params({ startDate: new Date(today + 30 * DAY_MS), endDate: new Date(today + 400 * DAY_MS) });
        const soFar = calculateDcaToDate(upcoming, prices, 100_000, today);
        expect(soFar.notStarted).toBe(true);
        expect(soFar.endsInFuture).toBe(true);
        expect(soFar.breakdown).toEqual([]);
        expect(soFar.totalInvested).toBe(0);
        expect(soFar.btcAccumulated).toBe(0);
    });

    it('keeps a starting stack for a plan that has not started, and no purchase', () => {
        const upcoming = params({ startDate: new Date(today + 30 * DAY_MS), endDate: new Date(today + 400 * DAY_MS), startingBtc: 1 });
        const soFar = calculateDcaToDate(upcoming, prices, 100_000, today);
        expect(soFar.notStarted).toBe(true);
        // The one row is the position, not a buy: anything that counts
        // purchases or offers an export has to count rows that are not it.
        expect(soFar.breakdown).toHaveLength(1);
        expect(soFar.breakdown[0].isStartingStack).toBe(true);
        expect(soFar.btcAccumulated).toBe(1);
        expect(soFar.profit).toBe(0);
    });

    it('does not call a plan that ends today unfinished, at any hour of the day', () => {
        const endsToday = params({ startDate: new Date(start), endDate: new Date(today) });
        for (const asOf of [today, today + DAY_MS - 1]) {
            const soFar = calculateDcaToDate(endsToday, prices, 100_000, asOf);
            expect(soFar.endsInFuture).toBe(false);
            expect(soFar.throughTs).toBe(today);
        }
    });

    it('counts a plan that starts today as started', () => {
        const startsToday = params({ startDate: new Date(today), endDate: new Date(today + 400 * DAY_MS) });
        const soFar = calculateDcaToDate(startsToday, prices, 100_000, today + 5 * 3_600_000);
        expect(soFar.notStarted).toBe(false);
        expect(soFar.breakdown).toHaveLength(1);
    });

    it('equals the run the calculator has always used for its "so far" figures', () => {
        // DcaCalculator's pastResults: the same plan with its end date capped at
        // today's UTC midnight, valued at the same instant.
        const asOf = today + 5 * 3_600_000;
        const capped = calculateDca({ ...plan, endDate: new Date(utcDayStart(asOf)) }, prices, 100_000, asOf);
        expect(calculateDcaToDate(plan, prices, 100_000, asOf)).toMatchObject(capped);
    });

    it('takes "today" from the clock when asOf is left out', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-02T09:00:00Z'));
        // Jan 5 to Mar 2 is 56 days: buys on day 0, 7, …, 56.
        expect(calculateDcaToDate(plan, prices, 100_000).breakdown.length).toBe(9);
    });

    it('returns a zeroed result for an invalid end date', () => {
        const soFar = calculateDcaToDate(params({ endDate: new Date(NaN) }), prices, 100_000, today);
        expect(soFar.breakdown).toEqual([]);
        expect(soFar.endsInFuture).toBe(false);
    });
});

// ── Flat fee per buy ──────────────────────────────────────────────────────────

describe('flat fee per buy', () => {
    const start = Date.UTC(2021, 0, 1);
    const end = start + 21 * DAY_MS; // four weekly buys
    const asOf = Date.UTC(2026, 9, 12);
    const prices = flat(start, 800, 100);
    const plan = (over: Partial<Parameters<typeof calculateDca>[0]> = {}) =>
        params({ startDate: new Date(start), endDate: new Date(end), amount: 50, feePercentage: 0.5, ...over });

    it('takes the flat fee and the percentage fee out of every buy', () => {
        const result = calculateDca(plan({ flatFee: 2.99 }), prices, 100, asOf);
        expect(result.breakdown.length).toBe(4);
        for (const row of result.breakdown) {
            // $50 less 0.5% ($0.25) less $2.99 leaves $46.76 to spend at $100.
            expect(row.fee).toBeCloseTo(3.24, 12);
            expect(row.accumulated).toBeCloseTo(0.4676, 12);
            // The full $50 still left the bank.
            expect(row.invested).toBe(50);
        }
        expect(result.totalInvested).toBe(200);
        expect(result.btcAccumulated).toBeCloseTo(4 * 0.4676, 12);
        expect(result.stats!.feesPaid).toBeCloseTo(4 * 3.24, 12);
        expect(result.stats!.feePercentOfBuy).toBeCloseTo(6.48, 10);
    });

    it('changes nothing when the flat fee is 0 or absent', () => {
        const without = calculateDca(plan(), prices, 100, asOf);
        expect(calculateDca(plan({ flatFee: 0 }), prices, 100, asOf)).toStrictEqual(without);
        // The percentage-only arithmetic, exactly as it was before the flat fee existed.
        expect(without.breakdown.every((row) => row.accumulated === (50 * (1 - 0.5 / 100)) / 100)).toBe(true);
        expect(without.breakdown.every((row) => row.fee === 50 * (0.5 / 100))).toBe(true);
        expect(without.stats!.feesPaid).toBe(200 * (0.5 / 100));
        expect(without.stats!.feePercentOfBuy).toBe(0.5);
    });

    it('buys no bitcoin when the flat fee is at least the purchase amount', () => {
        for (const flatFee of [50, 75]) {
            const result = calculateDca(plan({ flatFee }), prices, 100, asOf);
            expect(result.btcAccumulated).toBe(0);
            // Four buys were still paid for, so they are still counted and invested.
            expect(result.breakdown.length).toBe(4);
            expect(result.breakdown.every((row) => row.accumulated === 0 && row.fee === 50)).toBe(true);
            expect(result.totalInvested).toBe(200);
            expect(result.stats!.feesPaid).toBe(200);
            expect(result.stats!.feePercentOfBuy).toBe(100);
            expect(result.roi).toBe(-100);
            expect(result.averageCost).toBe(0);
        }
    });

    it('does not grow the flat fee with the yearly raise', () => {
        const jan15 = Date.UTC(2020, 0, 15);
        const result = calculateDca(
            params({
                startDate: new Date(jan15),
                endDate: new Date(Date.UTC(2021, 0, 20)),
                frequency: 'monthly',
                feePercentage: 1,
                flatFee: 2,
                annualEscalationPct: 10,
            }),
            flat(jan15, 800, 10_000),
            10_000,
            asOf,
        );
        expect(result.breakdown[0].fee).toBeCloseTo(1 + 2, 12);
        // The 13th buy is $110: the percentage part follows it, the flat part does not.
        expect(result.breakdown[12].invested).toBeCloseTo(110, 10);
        expect(result.breakdown[12].fee).toBeCloseTo(1.1 + 2, 10);
    });

    it('never charges the starting stack', () => {
        const result = calculateDca(plan({ flatFee: 2.99, startingBtc: 1, startingAvgCost: 80 }), prices, 100, asOf);
        expect(result.breakdown[0].isStartingStack).toBe(true);
        expect(result.breakdown[0].fee).toBe(0);
        expect(result.stats!.feesPaid).toBeCloseTo(4 * 3.24, 12);
        // The percentage is of the money put into buys, not of the stack's cost.
        expect(result.stats!.feePercentOfBuy).toBeCloseTo(6.48, 10);
    });

    it('keeps the full amount paid as the XIRR cash flow', () => {
        // A fee changes what the money bought, not how much money went in.
        const longPlan = plan({ flatFee: 2.99, endDate: new Date(start + 700 * DAY_MS) });
        const result = calculateDca(longPlan, prices, 150, asOf);
        const flows = result.breakdown.map((row) => ({ ts: Date.parse(row.date), amount: row.invested }));
        expect(flows.every((flow) => flow.amount === 50)).toBe(true);
        expect(result.stats!.xirrPercent).toBeCloseTo(calculateXirr(flows, result.currentValue, asOf)! * 100, 9);
    });

    it('applies at a fixed manual price too', () => {
        const result = calculateDca(plan({ flatFee: 2.99, priceMode: 'manual', manualPrice: 100 }), undefined, undefined, asOf);
        expect(result.breakdown.length).toBe(4);
        expect(result.btcAccumulated).toBeCloseTo(4 * 0.4676, 12);
        expect(result.stats!.feesPaid).toBeCloseTo(4 * 3.24, 12);
    });

    it('treats a negative or non-numeric flat fee as no flat fee', () => {
        const without = calculateDca(plan(), prices, 100, asOf);
        expect(calculateDca(plan({ flatFee: -5 }), prices, 100, asOf)).toStrictEqual(without);
        expect(calculateDca(plan({ flatFee: NaN }), prices, 100, asOf)).toStrictEqual(without);
    });

    it('charges a lump sum the flat fee once', () => {
        const withFlat = calculateLumpSum(10_000, new Date(start), prices, 100, 1, 2.99);
        expect(withFlat.btcAccumulated).toBeCloseTo((10_000 - 100 - 2.99) / 100, 12);
        expect(withFlat.totalInvested).toBe(10_000);
        expect(calculateLumpSum(10_000, new Date(start), prices, 100, 1, 0))
            .toStrictEqual(calculateLumpSum(10_000, new Date(start), prices, 100, 1));
    });

    it('charges the comparison assets the same fee per buy', () => {
        const btc = calculateDca(plan({ flatFee: 2.99 }), prices, null, asOf);
        const asset = calculateAssetDca(50, 'weekly', new Date(start), new Date(end), 0.5, prices, 'X', 'Asset', 0, 2.99);
        expect(asset.totalInvested).toBe(btc.totalInvested);
        expect(asset.currentValue).toBe(btc.currentValue);
    });
});

// ── Observed vs estimated prices ──────────────────────────────────────────────

describe('observed and estimated prices', () => {
    const start = Date.UTC(2024, 0, 4);
    const asOf = Date.UTC(2026, 9, 12);
    // The shape of a weekly source filled in to daily: one real close a week,
    // six straight-line values between.
    const kinds: PriceKind[] = Array.from({ length: 29 }, (_, i) => (i % 7 === 0 ? 'observed' : 'estimated'));
    const bare = series(start, 29, (i) => (i === 10 ? 30_000 : 40_000 + 100 * i));
    const marked = withPriceKinds(bare, kinds);
    const daily = params({ startDate: new Date(start), endDate: new Date(start + 28 * DAY_MS), frequency: 'daily' });

    it('labels every purchase with the kind of price it was bought at', () => {
        const result = calculateDca(daily, marked, 45_000, asOf);
        expect(result.breakdown.map((row) => row.priceKind)).toEqual(kinds);
        expect(result.stats!.estimatedPrices).toEqual({ purchases: 24, drawdownDays: 24, drawdownDaysWalked: 29 });
    });

    it('says when the best or worst buy is an estimate', () => {
        const { stats } = calculateDca(daily, marked, 45_000, asOf);
        // Day 10 is the cheapest day and sits between two weekly closes.
        expect(stats!.bestBuy).toEqual({ date: new Date(start + 10 * DAY_MS).toISOString(), price: 30_000, priceKind: 'estimated' });
        expect(stats!.worstBuy).toEqual({ date: new Date(start + 28 * DAY_MS).toISOString(), price: 42_800, priceKind: 'observed' });
    });

    it('leaves a series without markers exactly as it was', () => {
        const result = calculateDca(daily, bare, 45_000, asOf);
        expect(result.breakdown.every((row) => !('priceKind' in row))).toBe(true);
        expect('estimatedPrices' in result.stats!).toBe(false);
        expect(result.stats!.bestBuy).toStrictEqual({ date: new Date(start + 10 * DAY_MS).toISOString(), price: 30_000 });
    });

    it('never changes a number', () => {
        const withMarkers = calculateDca(daily, marked, 45_000, asOf);
        const without = calculateDca(daily, bare, 45_000, asOf);
        expect(withMarkers).toMatchObject({
            ...without,
            breakdown: without.breakdown.map((row) => expect.objectContaining(row)),
            stats: expect.objectContaining({
                xirrPercent: without.stats!.xirrPercent,
                maxDrawdownPercent: without.stats!.maxDrawdownPercent,
                feesPaid: without.stats!.feesPaid,
            }),
        });
    });

    it('counts a price carried forward from an earlier day as an estimate', () => {
        // Weekly buys run four weeks past the end of the series.
        const weekly = params({ startDate: new Date(start), endDate: new Date(start + 56 * DAY_MS) });
        const result = calculateDca(weekly, marked, 45_000, asOf);
        expect(result.breakdown.map((row) => row.priceKind)).toEqual([
            'observed', 'observed', 'observed', 'observed', 'observed',
            'estimated', 'estimated', 'estimated', 'estimated',
        ]);
        expect(result.stats!.estimatedPrices!.purchases).toBe(4);
    });

    it('labels a starting stack only when it is costed at a market price', () => {
        const atMarket = calculateDca({ ...daily, startingBtc: 1 }, marked, 45_000, asOf);
        expect(atMarket.breakdown[0].isStartingStack).toBe(true);
        expect(atMarket.breakdown[0].priceKind).toBe('observed');
        // A stated average cost is the user's number, not a market price.
        const atStatedCost = calculateDca({ ...daily, startingBtc: 1, startingAvgCost: 20_000 }, marked, 45_000, asOf);
        expect('priceKind' in atStatedCost.breakdown[0]).toBe(false);
        expect(atStatedCost.breakdown[1].priceKind).toBe('observed');
    });

    it('labels nothing at a fixed manual price', () => {
        const result = calculateDca({ ...daily, priceMode: 'manual', manualPrice: 50_000 }, marked, undefined, asOf);
        expect(result.breakdown.every((row) => !('priceKind' in row))).toBe(true);
        expect('estimatedPrices' in result.stats!).toBe(false);
    });

    it('counts a row whose kind is unknown as neither observed nor estimated', () => {
        const five = withPriceKinds(bare.slice(0, 5), 'o-e-o');
        const plan = params({ startDate: new Date(start), endDate: new Date(start + 4 * DAY_MS), frequency: 'daily' });
        const result = calculateDca(plan, five, 45_000, asOf);
        expect(result.breakdown.map((row) => row.priceKind)).toEqual(['observed', undefined, 'estimated', undefined, 'observed']);
        expect(result.stats!.estimatedPrices).toEqual({ purchases: 1, drawdownDays: 1, drawdownDaysWalked: 5 });
    });

    it('reads the markers packed as one character per point', () => {
        expect(withPriceKinds(bare, 'oeeeeeeoeeeeeeoeeeeeeoeeeeeeo')).toStrictEqual(marked);
    });

    it('leaves points unmarked rather than guess', () => {
        const unknown: PricePoint[] = withPriceKinds(bare.slice(0, 3), 'o-e');
        expect(unknown).toStrictEqual([[...bare[0], 'observed'], bare[1], [...bare[2], 'estimated']]);
        // No markers, or a count that does not match the series: unknown throughout.
        expect(withPriceKinds(bare, null)).toBe(bare);
        expect(withPriceKinds(bare, undefined)).toBe(bare);
        expect(withPriceKinds(bare, 'oe')).toBe(bare);
        expect(withPriceKinds(bare, kinds.slice(1))).toBe(bare);
    });
});

// ── Several bars on one UTC day ───────────────────────────────────────────────

describe('several bars on one UTC day', () => {
    const today = Date.UTC(2026, 9, 11);

    it('prices a purchase at the last bar of its day', () => {
        // The tail of a still-open Kraken week: a straight-line value stamped
        // 00:00, then the live price later the same UTC day.
        const prices: [number, number][] = [
            ...flat(today - 10 * DAY_MS, 10, 83_000),
            [today, 83_549.475],
            [today + 23 * 3_600_000 + 50 * 60_000, 83_640.6],
        ];
        const result = calculateDca(
            params({ startDate: new Date(today), endDate: new Date(today), frequency: 'daily' }),
            prices,
            83_640.6,
            today + 23 * 3_600_000 + 51 * 60_000,
        );
        expect(result.breakdown.length).toBe(1);
        expect(result.breakdown[0].price).toBe(83_640.6);
        // Bought and valued at the same price: no gain or loss on day one.
        expect(result.profit).toBeCloseTo(0, 9);
    });

    it('applies the same rule mid-series and to the lump-sum and asset legs', () => {
        const day = Date.UTC(2021, 0, 1);
        const prices: [number, number][] = [
            [day, 100],
            [day + 3_600_000, 110],
            [day + 20 * 3_600_000, 125],
            [day + DAY_MS, 200],
        ];
        const oneBuy = params({ startDate: new Date(day), endDate: new Date(day), frequency: 'daily' });
        expect(calculateDca(oneBuy, prices, 200, day + DAY_MS).breakdown[0].price).toBe(125);
        expect(calculateLumpSum(1_000, new Date(day), prices, 200, 0).btcAccumulated).toBe(8);
        expect(calculateAssetDca(1_000, 'daily', new Date(day), new Date(day), 0, prices, 'X', 'Asset').currentValue).toBe(1_600);
    });

    it('takes the kind of the bar it keeps', () => {
        const prices: PricePoint[] = [
            [today - DAY_MS, 83_000, 'observed'],
            [today, 83_549.475, 'estimated'],
            [today + 12 * 3_600_000, 83_640.6, 'observed'],
        ];
        const result = calculateDca(
            params({ startDate: new Date(today - DAY_MS), endDate: new Date(today), frequency: 'daily' }),
            prices,
            83_640.6,
            today + 13 * 3_600_000,
        );
        expect(result.breakdown.map((row) => row.priceKind)).toEqual(['observed', 'observed']);
    });
});

// ── Inputs the engine cannot schedule ─────────────────────────────────────────

describe('unschedulable dates', () => {
    const prices = flat(Date.UTC(2020, 0, 1), 400, 10_000);

    it('returns a zeroed result for an Invalid Date instead of running to the purchase limit', () => {
        const cases = [
            { endDate: new Date(NaN) },
            { startDate: new Date(NaN) },
            { startDate: new Date('not a date'), endDate: new Date(NaN) },
        ];
        for (const over of cases) {
            const result = calculateDca(params(over), prices, 10_000);
            expect(result.breakdown).toEqual([]);
            expect(result.totalInvested).toBe(0);
            expect(result.btcAccumulated).toBe(0);
            expect(result.roi).toBe(0);
            expect(result.stats!.xirrPercent).toBeNull();

            const asset = calculateAssetDca(
                100, 'weekly', over.startDate ?? new Date(Date.UTC(2020, 0, 1)), over.endDate ?? new Date(Date.UTC(2020, 11, 31)),
                0, prices, 'X', 'Asset',
            );
            expect(asset.breakdown).toEqual([]);
            expect(asset.totalInvested).toBe(0);
        }
    });
});

// ── Horizon ───────────────────────────────────────────────────────────────────

describe('plan horizon', () => {
    it('keeps the longest plan the app accepts under the purchase limit', () => {
        // If either constant moves so that this fails, a plan inside the
        // accepted date range would be cut short without any sign of it.
        const longestDailyPlan = (MAX_END_TS - EARLIEST_PRICE_TS) / DAY_MS + 1;
        expect(longestDailyPlan).toBe(33_008);
        expect(longestDailyPlan).toBeLessThan(MAX_SCHEDULE_PURCHASES);
    });

    it('runs that plan to its last day, with finite totals at the largest amount and raise a link can carry', () => {
        const result = calculateDca(
            params({
                amount: 1e9,
                frequency: 'daily',
                startDate: new Date(EARLIEST_PRICE_TS),
                endDate: new Date(MAX_END_TS),
                feePercentage: 0,
                annualEscalationPct: 200,
                startingBtc: 21_000_000,
                startingAvgCost: 1e9,
            }),
            flat(EARLIEST_PRICE_TS, 30, 0.07),
            1e9,
            Date.UTC(2026, 9, 12),
        );
        expect(result.breakdown.length).toBe(1 + 33_008); // the stack row, then one buy a day
        expect(result.breakdown[result.breakdown.length - 1].date).toBe('2100-12-31T00:00:00.000Z');
        for (const value of [result.totalInvested, result.btcAccumulated, result.averageCost, result.currentValue, result.profit, result.roi]) {
            expect(Number.isFinite(value)).toBe(true);
        }
    });

    it('stops a direct call that runs past the limit at exactly MAX_SCHEDULE_PURCHASES buys', () => {
        const result = calculateDca(
            params({
                frequency: 'daily',
                startDate: new Date(Date.UTC(2000, 0, 1)),
                endDate: new Date(Date.UTC(2200, 0, 1)),
                priceMode: 'manual',
                manualPrice: 50_000,
            }),
        );
        expect(result.breakdown.length).toBe(MAX_SCHEDULE_PURCHASES);
    });
});

// ── Does this series cover this window? ───────────────────────────────────────

describe('priceSeriesCovers', () => {
    const today = Date.UTC(2026, 9, 12);
    const fiveYearsAgo = Date.UTC(2021, 9, 12);
    const between = (fromTs: number, toTs: number, price: number) => flat(fromTs, (toTs - fromTs) / DAY_MS + 1, price);

    it('accepts a series fetched for the window, lead-in included', () => {
        expect(priceSeriesCovers(between(fiveYearsAgo - 14 * DAY_MS, today, 60_000), fiveYearsAgo, today)).toBe(true);
        expect(priceSeriesCovers(between(fiveYearsAgo, today, 60_000), fiveYearsAgo, today)).toBe(true);
    });

    it('rejects a 2017-2019 window for a schedule that runs to today', () => {
        const window = between(Date.UTC(2016, 11, 18), Date.UTC(2020, 0, 1), 7_000);
        expect(priceSeriesCovers(window, fiveYearsAgo, today)).toBe(false);
        // The engine alone would not notice. It carries the last close forward,
        // so five years of daily buys are all priced at the 1 January 2020 bar.
        const fabricated = calculateDca(
            params({ amount: 5, frequency: 'daily', startDate: new Date(fiveYearsAgo), endDate: new Date(today) }),
            window,
            100_000,
            today,
        );
        expect(fabricated.breakdown.length).toBe(1_827);
        expect(fabricated.breakdown.every((row) => row.price === 7_000)).toBe(true);
    });

    it('rejects a series that begins after the first purchase', () => {
        expect(priceSeriesCovers(between(fiveYearsAgo + DAY_MS, today, 60_000), fiveYearsAgo, today)).toBe(false);
    });

    it('tolerates a newest bar a few days old, and no older', () => {
        const through = (daysBehind: number) => between(fiveYearsAgo, today - daysBehind * DAY_MS, 60_000);
        expect(priceSeriesCovers(through(PRICE_STALE_TOLERANCE_DAYS), fiveYearsAgo, today)).toBe(true);
        expect(priceSeriesCovers(through(PRICE_STALE_TOLERANCE_DAYS + 1), fiveYearsAgo, today)).toBe(false);
        expect(priceSeriesCovers(through(1), fiveYearsAgo, today, 0)).toBe(false);
        expect(priceSeriesCovers(through(0), fiveYearsAgo, today, 0)).toBe(true);
    });

    it('treats the first day of our data as covering any earlier start', () => {
        const fromTheStart = between(EARLIEST_PRICE_TS, Date.UTC(2012, 0, 1), 5);
        expect(priceSeriesCovers(fromTheStart, Date.UTC(2009, 0, 3), Date.UTC(2012, 0, 1))).toBe(true);
        expect(priceSeriesCovers(fromTheStart.slice(1), Date.UTC(2009, 0, 3), Date.UTC(2012, 0, 1))).toBe(false);
    });

    it('is false with no series or no valid dates', () => {
        expect(priceSeriesCovers([], fiveYearsAgo, today)).toBe(false);
        expect(priceSeriesCovers(null, fiveYearsAgo, today)).toBe(false);
        expect(priceSeriesCovers(undefined, fiveYearsAgo, today)).toBe(false);
        expect(priceSeriesCovers(between(fiveYearsAgo, today, 1), NaN, today)).toBe(false);
        expect(priceSeriesCovers(between(fiveYearsAgo, today, 1), fiveYearsAgo, NaN)).toBe(false);
    });
});

// ── Cutting a series at the plan's end ────────────────────────────────────────

describe('seriesThroughDay', () => {
    // A weekly plan ending 2020-03-11, on a series fetched through the day
    // after, as the calculator fetches it. The last two rows are Coinbase's
    // closes for 11 and 12 March 2020, either side of the crash.
    const start = Date.UTC(2019, 2, 13);
    const end = Date.UTC(2020, 2, 11);
    const rows = (end - start) / DAY_MS + 2;
    const fetched = series(start, rows, (i) => (i === rows - 1 ? 4857.10 : i === rows - 2 ? 7938.05 : 5_000 + 7 * i));
    const plan = params({ startDate: new Date(start), endDate: new Date(end) });
    const asOf = Date.UTC(2026, 9, 12);

    it('values a plan with no spot price on its end date, not on the day after', () => {
        const asFetched = calculateDca(plan, fetched, undefined, asOf);
        const trimmed = calculateDca(plan, seriesThroughDay(fetched, end), undefined, asOf);
        expect(asFetched.currentValue).toBeCloseTo(asFetched.btcAccumulated * 4857.10, 9);
        expect(trimmed.currentValue).toBeCloseTo(trimmed.btcAccumulated * 7938.05, 9);
        // Nothing else moves: the same 53 buys at the same prices.
        expect(trimmed.breakdown).toHaveLength(53);
        expect(trimmed.breakdown).toEqual(asFetched.breakdown);
        expect(trimmed.btcAccumulated).toBe(asFetched.btcAccumulated);
        expect(trimmed.totalInvested).toBe(asFetched.totalInvested);
        expect(trimmed.stats!.maxDrawdownPercent).toBe(asFetched.stats!.maxDrawdownPercent);
    });

    it('cuts by UTC day, whatever the time of day', () => {
        expect(seriesThroughDay(fetched, end + DAY_MS - 1)).toHaveLength(rows - 1);
        expect(seriesThroughDay(fetched, end - 1)).toHaveLength(rows - 2);
        // A bar stamped mid-session, as an index or gold bar is, stays with its day.
        const session = 13.5 * 3_600_000;
        const bars: [number, number][] = [[end - DAY_MS + session, 1], [end + session, 2], [end + DAY_MS + session, 3]];
        expect(seriesThroughDay(bars, end)).toEqual(bars.slice(0, 2));
    });

    it('returns the same array when nothing is past the end day', () => {
        expect(seriesThroughDay(fetched, end + DAY_MS)).toBe(fetched);
        expect(seriesThroughDay(fetched, end + 30 * DAY_MS)).toBe(fetched);
        const none: [number, number][] = [];
        expect(seriesThroughDay(none, end)).toBe(none);
        // Marked points keep their markers.
        const marked = withPriceKinds(fetched, 'o'.repeat(rows));
        expect(seriesThroughDay(marked, end).at(-1)).toEqual([end, 7938.05, 'observed']);
    });
});

// ── Comparison assets ─────────────────────────────────────────────────────────

describe('calculateAssetDca', () => {
    it('computes a known answer', () => {
        // Three weekly $100 buys at 50, 100 and 200 with a 1% fee:
        // 99/50 + 99/100 + 99/200 = 3.465 units, valued at the last bar (200).
        const start = Date.UTC(2021, 0, 4);
        const prices: [number, number][] = [[start, 50], [start + 7 * DAY_MS, 100], [start + 14 * DAY_MS, 200]];
        const result = calculateAssetDca(100, 'weekly', new Date(start), new Date(start + 14 * DAY_MS), 1, prices, 'TEST', 'Test asset');
        expect(result.asset).toBe('TEST');
        expect(result.label).toBe('Test asset');
        expect(result.totalInvested).toBe(300);
        expect(result.currentValue).toBeCloseTo(693, 9);
        expect(result.profit).toBeCloseTo(393, 9);
        expect(result.roi).toBeCloseTo(131, 9);
        expect(result.breakdown.map((row) => row.date.slice(0, 10))).toEqual(['2021-01-04', '2021-01-11', '2021-01-18']);
        const values = result.breakdown.map((row) => row.portfolioValue);
        expect(values[0]).toBeCloseTo(99, 9);
        expect(values[1]).toBeCloseTo(297, 9);
        expect(values[2]).toBeCloseTo(693, 9);
    });

    it('prices a weekend buy at the previous close', () => {
        const friday = Date.UTC(2021, 0, 8);
        const prices: [number, number][] = [[friday, 100], [friday + 3 * DAY_MS, 400]]; // Friday, then Monday
        const saturday = friday + DAY_MS;
        const result = calculateAssetDca(100, 'daily', new Date(saturday), new Date(saturday), 0, prices, 'X', 'Asset');
        // One unit bought at Friday's 100, valued at Monday's 400.
        expect(result.currentValue).toBe(400);
    });

    it('returns zeros for an empty series', () => {
        const result = calculateAssetDca(100, 'weekly', new Date(Date.UTC(2021, 0, 1)), new Date(Date.UTC(2021, 5, 1)), 0, [], 'X', 'Asset');
        expect(result).toStrictEqual({ asset: 'X', label: 'Asset', totalInvested: 0, currentValue: 0, profit: 0, roi: 0, breakdown: [] });
    });

    const frequencies: Frequency[] = ['daily', 'weekly', 'biweekly', 'monthly'];
    it.each(frequencies)('gives the same deposit stream and value as calculateDca on the same series (%s)', (frequency) => {
        // Weekday-only bars, a Feb 29 start (a Saturday), a fee and a yearly
        // raise: every place the two loops could drift apart.
        const firstBar = Date.UTC(2020, 1, 3);
        const lastBar = Date.UTC(2023, 5, 30);
        const bars: [number, number][] = [];
        for (let ts = firstBar, i = 0; ts <= lastBar; ts += DAY_MS, i++) {
            const weekday = new Date(ts).getUTCDay();
            if (weekday !== 0 && weekday !== 6) bars.push([ts, 3_000 + 7 * i]);
        }
        const startDate = new Date(Date.UTC(2020, 1, 29));
        const endDate = new Date(Date.UTC(2023, 5, 15));

        const asset = calculateAssetDca(250, frequency, startDate, endDate, 0.5, bars, 'X', 'Asset', 10);
        // No spot price: calculateDca then values at the last bar, as the asset leg always does.
        const btc = calculateDca(
            params({ amount: 250, frequency, startDate, endDate, feePercentage: 0.5, annualEscalationPct: 10 }),
            bars,
            null,
        );
        expect(asset.totalInvested).toBe(btc.totalInvested);
        expect(asset.currentValue).toBe(btc.currentValue);
        expect(asset.roi).toBe(btc.roi);
        expect(asset.breakdown).toStrictEqual(btc.breakdown.map((row) => ({ date: row.date, portfolioValue: row.portfolioValue })));
        expect(asset.breakdown.length).toBeGreaterThan(30);
    });
});

// ── Leap-day and month-end schedules ──────────────────────────────────────────

describe('leap-day and month-end schedules', () => {
    it('keeps a monthly plan started on Feb 29 on the last day of February in other years', () => {
        const start = Date.UTC(2020, 1, 29);
        const result = calculateDca(
            params({ startDate: new Date(start), endDate: new Date(Date.UTC(2024, 2, 1)), frequency: 'monthly' }),
            flat(start, 1_500, 10_000),
            10_000,
        );
        expect(result.breakdown.length).toBe(49); // Feb 2020 through Feb 2024
        const februaries = result.breakdown.map((row) => row.date.slice(0, 10)).filter((iso) => iso.slice(5, 7) === '02');
        expect(februaries).toEqual(['2020-02-29', '2021-02-28', '2022-02-28', '2023-02-28', '2024-02-29']);
        const otherMonths = result.breakdown.map((row) => row.date.slice(0, 10)).filter((iso) => iso.slice(5, 7) !== '02');
        expect(otherMonths.every((iso) => iso.endsWith('-29'))).toBe(true);
    });

    it.each(['2019-12-31', '2020-01-15', '2020-01-31', '2020-02-28', '2020-02-29', '2020-03-31'])(
        'steps the yearly raise on the 13th monthly buy for a plan started on %s',
        (iso) => {
            // A Feb 29 start must not get its raise one buy late, as it would
            // if its first anniversary were Mar 1, the day after the 13th buy.
            const start = Date.parse(`${iso}T00:00:00Z`);
            const result = calculateDca(
                params({
                    startDate: new Date(start),
                    endDate: new Date(start + 800 * DAY_MS),
                    frequency: 'monthly',
                    annualEscalationPct: 10,
                }),
                flat(start, 900, 10_000),
                10_000,
            );
            expect(result.breakdown.findIndex((row) => row.invested > 100.5)).toBe(12);
            expect(result.breakdown.findIndex((row) => row.invested > 110.5)).toBe(24);
        },
    );

    it('buys on every day of a leap year for a daily plan', () => {
        const start = Date.UTC(2024, 0, 1);
        const result = calculateDca(
            params({ startDate: new Date(start), endDate: new Date(Date.UTC(2024, 11, 31)), frequency: 'daily' }),
            flat(start, 400, 10_000),
            10_000,
        );
        expect(result.breakdown.length).toBe(366);
        expect(result.breakdown[59].date).toBe('2024-02-29T00:00:00.000Z');
    });

    it('keeps weekly and biweekly plans on a fixed cadence across Feb 29', () => {
        const start = Date.UTC(2024, 1, 15);
        const prices = flat(start, 100, 10_000);
        const dates = (frequency: Frequency) => calculateDca(
            params({ startDate: new Date(start), endDate: new Date(Date.UTC(2024, 2, 14)), frequency }),
            prices,
            10_000,
        ).breakdown.map((row) => row.date.slice(0, 10));
        expect(dates('weekly')).toEqual(['2024-02-15', '2024-02-22', '2024-02-29', '2024-03-07', '2024-03-14']);
        expect(dates('biweekly')).toEqual(['2024-02-15', '2024-02-29', '2024-03-14']);
    });
});
