import { describe, expect, it } from 'vitest';
import {
    AVG_MONTH_DAYS,
    makeDayPriceLookup,
    firstWeekdayOnOrAfter,
    percentile,
    median,
    bucketDurationDays,
    toDailyPrices,
    purchaseOffsets,
    walkStartDates,
    summariseOutcomes,
    percentileRank,
    standingAmong,
} from './datasets';
import { calculateDca } from './dca';
import { computeCell } from './heatmap';
import { DAY_MS, EARLIEST_PRICE_TS } from './dates';
import { BTC_HISTORICAL_DAILY } from '@/data/btcHistorical';
import {
    FIRST_EXCHANGE_CLOSE_DATE,
    FIRST_EXCHANGE_CLOSE_TS,
    PRICE_ERAS,
    SNAPSHOT_END_DATE,
    SNAPSHOT_END_TS,
} from '@/data/priceSources';
import type { Frequency } from '@/types';

const series = (startTs: number, days: number, priceFn: (i: number) => number): [number, number][] =>
    Array.from({ length: days }, (_, i) => [startTs + i * DAY_MS, priceFn(i)] as [number, number]);

// ── Price lookup ──────────────────────────────────────────────────────────────

describe('makeDayPriceLookup', () => {
    const start = Date.UTC(2020, 0, 1);
    const data = series(start, 10, (i) => 100 + i);

    it('returns the price for an exact day', () => {
        const at = makeDayPriceLookup(data);
        expect(at(start)).toBe(100);
        expect(at(start + 5 * DAY_MS)).toBe(105);
    });

    it('carries the last known price forward across a gap', () => {
        const sparse: [number, number][] = [
            [start, 100],
            [start + 7 * DAY_MS, 200],
        ];
        const at = makeDayPriceLookup(sparse);
        expect(at(start + 3 * DAY_MS)).toBe(100);
        expect(at(start + 7 * DAY_MS)).toBe(200);
        expect(at(start + 90 * DAY_MS)).toBe(200);
    });

    it('returns null — never the earliest price — for a day before all data', () => {
        // Falling back to the first known bar is how a pre-2010 start date once
        // bought 18 months of BTC at $0.07.
        const at = makeDayPriceLookup(data);
        expect(at(start - DAY_MS)).toBeNull();
        expect(at(Date.UTC(2009, 0, 1))).toBeNull();
    });

    it('is insensitive to the time of day within a UTC day', () => {
        const at = makeDayPriceLookup(data);
        expect(at(start + 23 * 60 * 60 * 1000)).toBe(100);
    });

    it('keeps the last bar when a day has several', () => {
        // The bar nearest the close, the same rule the engine's own lookup and
        // the public API use. Taking the first one priced today's purchase at a
        // stale value whenever a series ended with two bars on one day.
        const dupes: [number, number][] = [
            [start, 100],
            [start + 3600_000, 999],
            [start + DAY_MS, 110],
        ];
        const at = makeDayPriceLookup(dupes);
        expect(at(start)).toBe(999);
        expect(at(start + DAY_MS)).toBe(110);
    });

    it('handles an empty series', () => {
        expect(makeDayPriceLookup([])(start)).toBeNull();
    });
});

// ── Weekday anchoring ─────────────────────────────────────────────────────────

describe('firstWeekdayOnOrAfter', () => {
    // 2021-01-01 was a Friday (UTC).
    const friday = Date.UTC(2021, 0, 1);

    it('returns the same day when it already matches', () => {
        expect(firstWeekdayOnOrAfter(friday, 5)).toBe(friday);
    });

    it('advances to the next matching weekday', () => {
        const monday = firstWeekdayOnOrAfter(friday, 1);
        expect(new Date(monday).getUTCDay()).toBe(1);
        expect(monday).toBe(friday + 3 * DAY_MS);
    });

    it('never advances more than six days', () => {
        for (let w = 0; w < 7; w++) {
            const got = firstWeekdayOnOrAfter(friday, w);
            expect(got - friday).toBeLessThanOrEqual(6 * DAY_MS);
            expect(new Date(got).getUTCDay()).toBe(w);
        }
    });

    it('produces seven distinct anchors — the premise of the whole comparison', () => {
        const anchors = new Set(Array.from({ length: 7 }, (_, w) => firstWeekdayOnOrAfter(friday, w)));
        expect(anchors.size).toBe(7);
    });
});

// ── Summary statistics ────────────────────────────────────────────────────────

describe('percentile and median', () => {
    it('takes percentiles by nearest rank on a sorted array', () => {
        const s = [1, 2, 3, 4, 5];
        expect(percentile(s, 0)).toBe(1);
        expect(percentile(s, 0.5)).toBe(3);
        expect(percentile(s, 1)).toBe(5);
    });

    it('averages the middle pair for an even-length median', () => {
        expect(median([1, 2, 3, 4])).toBe(2.5);
        expect(median([3, 1, 4, 2])).toBe(2.5); // unsorted input
    });

    it('does not mutate the caller array', () => {
        const input = [3, 1, 2];
        median(input);
        expect(input).toEqual([3, 1, 2]);
    });

    it('returns 0 rather than NaN for empty input', () => {
        expect(median([])).toBe(0);
        expect(percentile([], 0.5)).toBe(0);
    });
});

// ── The heatmap's core invariant ──────────────────────────────────────────────

describe('heatmap cell valuation (regression)', () => {
    /**
     * Every completed cell must be valued at its WINDOW-END price and have its
     * XIRR terminal flow dated at that same instant. Marking a finished
     * 2013-2016 window to today's price would attribute a decade of later price
     * action to a three-year hold — the same class of error that made the engine
     * report +574%/yr instead of +54%, and that put one published cell 378
     * percentage points out.
     *
     * These call the function the page renders with, not a copy of it: a copy
     * is something editing the real one could never fail.
     */
    const start = Date.UTC(2015, 0, 1);
    const endTs = Date.UTC(2018, 0, 1);
    const longAfter = Date.UTC(2026, 0, 1);
    const cell = (history: [number, number][], nowTs: number) =>
        computeCell(2015, 3, history, makeDayPriceLookup(history), nowTs);

    // Flat at 1000 up to and including the window-end day, then a 10x spike.
    const spikeAfter = series(start, 365 * 12, (i) => (start + i * DAY_MS > endTs ? 10_000 : 1000));
    // Flat at 1000 inside the window, 2000 from the window-end day on.
    const doublesAtEnd = series(start, 365 * 12, (i) => (start + i * DAY_MS >= endTs ? 2000 : 1000));

    it('reports ~0% for a window whose price never moved', () => {
        const result = cell(spikeAfter, longAfter);
        expect(result.state).toBe('done');
        if (result.state !== 'done') return;
        expect(result.purchases).toBe(36); // Jan 2015 through Dec 2017
        expect(result.invested).toBe(3600);
        expect(result.totalReturn).toBeCloseTo(0, 6);
        expect(Math.abs(result.annualized)).toBeLessThan(0.01);
    });

    it('does NOT let post-window price action leak into the cell', () => {
        // The 10x move the day after the window closes belongs to no part of it.
        const result = cell(spikeAfter, longAfter);
        expect(result.state === 'done' && result.endValue).toBeCloseTo(3600, 6);
        // And when the page happens to be rendered changes nothing.
        expect(cell(spikeAfter, endTs + DAY_MS)).toEqual(result);
    });

    it('values the cell at the window-end price', () => {
        const result = cell(doublesAtEnd, longAfter);
        expect(result.state === 'done' && result.totalReturn).toBeCloseTo(100, 6);
        expect(result.state === 'done' && result.endValue).toBeCloseTo(7200, 6);
    });

    it('dates the terminal flow at the window end, not today', () => {
        // The return must be non-zero for the terminal DATE to matter at all:
        // 0% annualises to 0% over any horizon. A doubling over a three-year
        // schedule is well over 30%/yr money-weighted; spread to "today", eight
        // years later, it would be under 10%.
        const soon = cell(doublesAtEnd, endTs + DAY_MS);
        const later = cell(doublesAtEnd, longAfter);
        expect(soon.state).toBe('done');
        if (soon.state !== 'done') return;
        expect(soon.annualized).toBeGreaterThan(30);
        expect(later).toEqual(soon);
    });

    it('does not report a window that has not finished, or one it cannot price', () => {
        expect(cell(spikeAfter, endTs - DAY_MS)).toEqual({ state: 'in-progress' });
        expect(computeCell(2009, 1, spikeAfter, makeDayPriceLookup(spikeAfter), longAfter)).toEqual({ state: 'unavailable' });
        const missingEnd = spikeAfter.filter(([ts]) => ts >= Date.UTC(2019, 0, 1));
        expect(cell(missingEnd, longAfter)).toEqual({ state: 'unavailable' });
    });
});

// ── Bundled historical snapshot (regression) ──────────────────────────────────

describe('bundled historical snapshot', () => {
    it('runs daily with no gaps through 2015-07-19', () => {
        const last = BTC_HISTORICAL_DAILY[BTC_HISTORICAL_DAILY.length - 1];
        expect(last[0]).toBe(Date.UTC(2015, 6, 19));
        expect(last[1]).toBeCloseTo(276.74);
        const gaps = BTC_HISTORICAL_DAILY.filter(
            (row, i) => i > 0 && row[0] - BTC_HISTORICAL_DAILY[i - 1][0] !== DAY_MS,
        );
        expect(gaps).toEqual([]);
    });

    it('meets the first Coinbase daily candle (2015-07-20) with no seam hole', () => {
        // Anything short of this re-opens the 19-day gap that interpolateDaily
        // silently straight-lined — pricing 2015-07-13 ~13% under reality.
        const COINBASE_FIRST_CANDLE = Date.UTC(2015, 6, 20);
        const last = BTC_HISTORICAL_DAILY[BTC_HISTORICAL_DAILY.length - 1];
        expect(last[0]).toBeGreaterThanOrEqual(COINBASE_FIRST_CANDLE - DAY_MS);
    });

    it('is what the shared date constants say it is', () => {
        // data/priceSources repeats these dates as literals so client code can
        // use them without bundling the rows. They must describe this file.
        const first = BTC_HISTORICAL_DAILY[0];
        const last = BTC_HISTORICAL_DAILY[BTC_HISTORICAL_DAILY.length - 1];
        expect(first[0]).toBe(EARLIEST_PRICE_TS);
        expect(last[0]).toBe(SNAPSHOT_END_TS);
        expect(new Date(last[0]).toISOString().slice(0, 10)).toBe(SNAPSHOT_END_DATE);
        expect(FIRST_EXCHANGE_CLOSE_TS).toBe(last[0] + DAY_MS);
        expect(new Date(FIRST_EXCHANGE_CLOSE_TS).toISOString().slice(0, 10)).toBe(FIRST_EXCHANGE_CLOSE_DATE);
        expect(PRICE_ERAS.all.startTs).toBe(first[0]);
        expect(PRICE_ERAS.exchange.startTs).toBe(FIRST_EXCHANGE_CLOSE_TS);
    });

    it('holds one positive price per UTC midnight, to the cent', () => {
        for (const [ts, price] of BTC_HISTORICAL_DAILY) {
            expect(ts % DAY_MS).toBe(0);
            expect(price).toBeGreaterThan(0);
            expect(Math.abs(price * 100 - Math.round(price * 100))).toBeLessThan(1e-6);
        }
    });

    it('keeps the 2010-09-15/16 values exactly as the source publishes them', () => {
        // The one place the series jumps and falls back within two days (see
        // the file header). The source still publishes these values and nothing
        // on hand proves them wrong, so they are documented, not "corrected".
        const byTs = new Map(BTC_HISTORICAL_DAILY);
        expect(byTs.get(Date.UTC(2010, 8, 14))).toBe(0.06);
        expect(byTs.get(Date.UTC(2010, 8, 15))).toBe(0.09);
        expect(byTs.get(Date.UTC(2010, 8, 16))).toBe(0.15);
        expect(byTs.get(Date.UTC(2010, 8, 17))).toBe(0.06);

        const spikes = BTC_HISTORICAL_DAILY.filter((row, i, rows) => {
            if (i === 0 || i === rows.length - 1) return false;
            const [before, here, after] = [rows[i - 1][1], row[1], rows[i + 1][1]];
            return (here > 1.5 * before && here > 1.5 * after) || (here < before / 1.5 && here < after / 1.5);
        });
        expect(spikes.map(([ts]) => new Date(ts).toISOString().slice(0, 10))).toEqual(['2010-09-16']);
    });
});

// ── Plan length ───────────────────────────────────────────────────────────────

describe('bucketDurationDays', () => {
    it('snaps a plan to whole months and reports the same months it simulates', () => {
        // Multiples of 30 days turned a five-year plan into a "61-month" run.
        expect(bucketDurationDays(1826)).toEqual({ months: 60, days: 1826 });
        expect(bucketDurationDays(1830)).toEqual({ months: 60, days: 1826 });
        expect(bucketDurationDays(1096)).toEqual({ months: 36, days: 1096 });
        expect(bucketDurationDays(913)).toEqual({ months: 30, days: 913 });
        expect(bucketDurationDays(365)).toEqual({ months: 12, days: 365 });
    });

    it('round-trips every month count', () => {
        for (let months = 3; months <= 600; months++) {
            const days = Math.round(months * AVG_MONTH_DAYS);
            expect(bucketDurationDays(days)).toEqual({ months, days });
        }
    });

    it('has a three-month floor and rejects anything shorter or not a number', () => {
        expect(bucketDurationDays(90)).toEqual({ months: 3, days: 91 });
        expect(bucketDurationDays(89)).toBeNull();
        expect(bucketDurationDays(NaN)).toBeNull();
        expect(bucketDurationDays(Infinity)).toBeNull();
        expect(bucketDurationDays('365' as unknown as number)).toBeNull();
    });
});

// ── Same plan, every start date ───────────────────────────────────────────────

describe('toDailyPrices', () => {
    const start = Date.UTC(2020, 0, 1);
    const data = series(start, 10, (i) => 100 + i);

    it('returns one price per day of the window', () => {
        const prices = toDailyPrices(data, start + 2 * DAY_MS, start + 5 * DAY_MS);
        expect(Array.from(prices!)).toEqual([102, 103, 104, 105]);
    });

    it('refuses to fill a hole or carry a price past the data', () => {
        const holed = data.filter((_, i) => i !== 4);
        expect(toDailyPrices(holed, start, start + 9 * DAY_MS)).toBeNull();
        expect(toDailyPrices(data, start - DAY_MS, start + 9 * DAY_MS)).toBeNull();
        expect(toDailyPrices(data, start, start + 10 * DAY_MS)).toBeNull();
    });

    it('refuses a zero or missing price and a backwards window', () => {
        const zero = data.map(([ts, p], i): [number, number] => [ts, i === 3 ? 0 : p]);
        expect(toDailyPrices(zero, start, start + 9 * DAY_MS)).toBeNull();
        expect(toDailyPrices(data, start + 5 * DAY_MS, start)).toBeNull();
        expect(toDailyPrices(data, NaN, start)).toBeNull();
    });
});

describe('purchaseOffsets', () => {
    it('steps daily, weekly and fortnightly, including the last day when it lands there', () => {
        expect(purchaseOffsets(3, 'daily')).toEqual([0, 1, 2, 3]);
        expect(purchaseOffsets(28, 'weekly')).toEqual([0, 7, 14, 21, 28]);
        expect(purchaseOffsets(30, 'biweekly')).toEqual([0, 14, 28]);
    });

    it('steps monthly by average months, matching the calendar schedule’s number of buys', () => {
        const fiveYears = purchaseOffsets(1826, 'monthly');
        const engine = calculateDca(
            {
                amount: 1, frequency: 'monthly', startDate: new Date(Date.UTC(2020, 0, 15)), endDate: new Date(Date.UTC(2025, 0, 15)),
                feePercentage: 0, priceMode: 'manual', manualPrice: 1,
            },
        );
        expect(fiveYears).toHaveLength(engine.breakdown.length);
        expect(fiveYears).toHaveLength(61);
        expect(fiveYears[0]).toBe(0);
        expect(fiveYears[fiveYears.length - 1]).toBe(1826);
        for (let i = 1; i < fiveYears.length; i++) {
            expect([30, 31]).toContain(fiveYears[i] - fiveYears[i - 1]);
        }
    });
});

describe('walkStartDates', () => {
    const flat = Float64Array.from({ length: 400 }, () => 250);

    it('runs once from every day a full window fits', () => {
        const walk = walkStartDates(flat, 100, 'weekly');
        expect(walk.runs).toBe(300);
        expect(walk.multiples).toHaveLength(300);
        expect(walk.averageCosts).toHaveLength(300);
    });

    it('gives every run 0% on a price that never moves, and a loss once a fee is charged', () => {
        const walk = walkStartDates(flat, 100, 'weekly');
        const free = summariseOutcomes(walk.multiples, 0, flat.length - 1, 100)!;
        for (const key of ['worst', 'p10', 'median', 'p90', 'best'] as const) expect(free[key]).toBeCloseTo(0, 9);
        expect(free.shareBelowCostPercent).toBe(0);
        expect(Array.from(walk.averageCosts).every((cost) => Math.abs(cost - 250) < 1e-9)).toBe(true);

        const withFee = summariseOutcomes(walk.multiples, 1.5, flat.length - 1, 100)!;
        for (const key of ['worst', 'p10', 'median', 'p90', 'best'] as const) expect(withFee[key]).toBeCloseTo(-1.5, 9);
        expect(withFee.shareBelowCostPercent).toBe(100);
    });

    it('finds the known worst and best run on a price that doubles half way', () => {
        // 100 for days 0-199, 200 from day 200. Daily buys over 100 days.
        const doubling = Float64Array.from({ length: 400 }, (_, i) => (i < 200 ? 100 : 200));
        const walk = walkStartDates(doubling, 100, 'daily');
        const summary = summariseOutcomes(walk.multiples, 0, doubling.length - 1, 100)!;

        // Worst: a run wholly on one side of the step never sees a price change.
        expect(summary.worst).toBeCloseTo(0, 9);
        // Best: the run from day 100 buys 100 times at 100 and once at 200,
        // then is valued at 200. 200 x (100/100 + 1/200) / 101 paid in.
        expect(summary.best).toBeCloseTo(((200 * 1.005) / 101 - 1) * 100, 9);
        expect(summary.shareBelowCostPercent).toBe(0);
        // Its average cost is the harmonic mean of its 101 buy prices, 101 / 1.005.
        expect(Array.from(walk.averageCosts).some((cost) => Math.abs(cost - 101 / 1.005) < 1e-9)).toBe(true);
        expect(walk.averageCosts[0]).toBeCloseTo(100, 9);
        expect(walk.averageCosts[walk.runs - 1]).toBeCloseTo(200, 9);
    });

    it('agrees with the engine run for run', () => {
        // A walk that drifted from calculateDca would rank a plan against runs
        // the calculator itself could never produce.
        const start = Date.UTC(2021, 0, 4);
        const data = series(start, 500, (i) => 20_000 + Math.sin(i / 9) * 6000 + (i % 11) * 310 + i * 12);
        const prices = toDailyPrices(data, start, start + 499 * DAY_MS)!;
        const duration = 364;

        for (const [frequency, fee] of [['daily', 0], ['weekly', 0], ['biweekly', 0], ['weekly', 1.25]] as [Frequency, number][]) {
            const walk = walkStartDates(prices, duration, frequency);
            const summary = summariseOutcomes(walk.multiples, fee, prices.length - 1, duration)!;
            const engine: number[] = [];
            for (let s = 0; s + duration < prices.length; s++) {
                const endTs = start + (s + duration) * DAY_MS;
                engine.push(calculateDca(
                    {
                        amount: 100, frequency, startDate: new Date(start + s * DAY_MS), endDate: new Date(endTs),
                        feePercentage: fee, priceMode: 'api', manualPrice: 0,
                    },
                    data,
                    prices[s + duration],
                    endTs,
                ).roi);
            }
            engine.sort((a, b) => a - b);
            expect(walk.runs).toBe(engine.length);
            expect(summary.worst).toBeCloseTo(engine[0], 8);
            expect(summary.best).toBeCloseTo(engine[engine.length - 1], 8);
            expect(summary.median).toBeCloseTo(engine[Math.round((engine.length - 1) * 0.5)], 8);
            expect(summary.shareBelowCostPercent).toBeCloseTo((engine.filter((roi) => roi < -1e-7).length / engine.length) * 100, 8);
        }
    });

    it('returns no runs when the plan is not shorter than the history, or for a nonsense length', () => {
        expect(walkStartDates(flat, 400, 'weekly').runs).toBe(0);
        expect(walkStartDates(flat, 399, 'weekly').runs).toBe(1);
        expect(walkStartDates(flat, 0, 'weekly').runs).toBe(0);
        expect(walkStartDates(flat, 30.5, 'weekly').runs).toBe(0);
    });

    it('skips a run it cannot price instead of reporting limitless profit', () => {
        const withZero = Float64Array.from(flat);
        withZero[50] = 0;
        const walk = walkStartDates(withZero, 10, 'daily');
        // Eleven runs include day 50 (as a buy, or as the valuation day).
        expect(walk.runs).toBe(390 - 11);
        expect(Array.from(walk.multiples).every(Number.isFinite)).toBe(true);
    });
});

describe('summariseOutcomes', () => {
    const multiples = Float64Array.from({ length: 101 }, (_, i) => 0.5 + i * 0.01); // 0.50 .. 1.50

    it('counts independent periods as the windows that fit end to end', () => {
        expect(summariseOutcomes(multiples, 0, 5899, 1826)!.independentPeriods).toBe(3);
        expect(summariseOutcomes(multiples, 0, 4100, 1826)!.independentPeriods).toBe(2);
        expect(summariseOutcomes(multiples, 0, 1825, 1826)!.independentPeriods).toBe(0);
    });

    it('reports percentiles of total return and the share below cost', () => {
        const summary = summariseOutcomes(multiples, 0, 1000, 100)!;
        expect(summary.runs).toBe(101);
        expect(summary.worst).toBeCloseTo(-50, 9);
        expect(summary.p10).toBeCloseTo(-40, 9);
        expect(summary.median).toBeCloseTo(0, 9);
        expect(summary.p90).toBeCloseTo(40, 9);
        expect(summary.best).toBeCloseTo(50, 9);
        // Multiples 0.50 .. 0.99 lost money; exactly 1.00 did not.
        expect(summary.shareBelowCostPercent).toBeCloseTo((50 / 101) * 100, 9);
        expect(summary.quantiles).toHaveLength(101);
        expect(summary.quantiles[0]).toBe(summary.worst);
        expect(summary.quantiles[50]).toBe(summary.median);
        expect(summary.quantiles[100]).toBe(summary.best);
    });

    it('moves every outcome, and the share below cost, with the fee', () => {
        const free = summariseOutcomes(multiples, 0, 1000, 100)!;
        const fee = summariseOutcomes(multiples, 2, 1000, 100)!;
        expect(fee.median).toBeCloseTo(-2, 9);
        expect(fee.best).toBeCloseTo(1.5 * 0.98 * 100 - 100, 9);
        expect(fee.shareBelowCostPercent).toBeGreaterThan(free.shareBelowCostPercent);
        // An out-of-range fee is clamped, not trusted.
        expect(summariseOutcomes(multiples, -5, 1000, 100)!.median).toBeCloseTo(0, 9);
        expect(summariseOutcomes(multiples, 250, 1000, 100)!.best).toBeCloseTo(-100, 9);
    });

    it('returns null when there is nothing to summarise', () => {
        expect(summariseOutcomes(new Float64Array(0), 0, 1000, 100)).toBeNull();
        expect(summariseOutcomes(multiples, 0, 1000, 0)).toBeNull();
    });
});

describe('percentileRank', () => {
    const quantiles = Array.from({ length: 101 }, (_, k) => -50 + k); // -50 .. +50

    it('puts a value equal to the median at 50', () => {
        expect(percentileRank(quantiles, 0)).toBe(50);
    });

    it('places a value between two percentiles proportionally', () => {
        expect(percentileRank(quantiles, -40)).toBe(10);
        expect(percentileRank(quantiles, 12.25)).toBeCloseTo(62.25, 9);
    });

    it('pins values beyond every run to 0 and 100', () => {
        expect(percentileRank(quantiles, -80)).toBe(0);
        expect(percentileRank(quantiles, 500)).toBe(100);
        expect(percentileRank(quantiles, -50)).toBe(0);
        expect(percentileRank(quantiles, 50)).toBe(100);
    });

    it('returns the middle of a flat stretch, so "the same as every run" reads 50', () => {
        expect(percentileRank(Array.from({ length: 101 }, () => 7), 7)).toBe(50);
        const stepped = Array.from({ length: 101 }, (_, k) => (k < 20 ? 0 : k < 60 ? 5 : 10));
        expect(percentileRank(stepped, 5)).toBe(39.5); // percentiles 20-59 all equal 5
    });

    it('answers 50 when it has nothing to rank against', () => {
        expect(percentileRank([], 3)).toBe(50);
        expect(percentileRank(quantiles, NaN)).toBe(50);
    });
});

describe('standingAmong', () => {
    // 101 whole percentiles from -50 to +50, as getOutcomeRange returns them.
    const quantiles = Array.from({ length: 101 }, (_, k) => k - 50);
    const runs = { worst: -50, best: 50, quantiles };

    it('places a return inside the range at its percentile, never at 0 or 100', () => {
        expect(standingAmong(runs, 0)).toBe(50);
        expect(standingAmong(runs, -49.7)).toBe(1);
        expect(standingAmong(runs, 49.7)).toBe(99);
    });

    it('counts a plan that is itself the worst or the best run as inside the set', () => {
        expect(standingAmong(runs, -50)).toBe(1);
        expect(standingAmong(runs, 50)).toBe(99);
        // The server keeps each run in single precision, so the plan's own
        // double-precision return can miss the printed bound by float noise.
        expect(standingAmong(runs, Math.fround(-50.000001))).toBe(1);
        expect(standingAmong(runs, -50 - 1e-6)).toBe(1);
        expect(standingAmong(runs, 50 + 1e-6)).toBe(99);
    });

    it('says below or above only for a return clearly outside every run', () => {
        expect(standingAmong(runs, -50.01)).toBe('below');
        expect(standingAmong(runs, -80)).toBe('below');
        expect(standingAmong(runs, 50.01)).toBe('above');
        expect(standingAmong(runs, 400)).toBe('above');
    });

    it('scales its tolerance with the size of the bound', () => {
        const wide = { worst: -90, best: 15000, quantiles: Array.from({ length: 101 }, (_, k) => -90 + k * 150.9) };
        expect(standingAmong(wide, 15000.01)).toBe(99);
        expect(standingAmong(wide, 15001)).toBe('above');
    });
});
