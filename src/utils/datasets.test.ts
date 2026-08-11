import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    makeDayPriceLookup,
    firstWeekdayOnOrAfter,
    looksInterpolated,
    percentile,
    median,
} from './datasets';
import { calculateDca, calculateXirr } from './dca';
import { DAY_MS } from './dates';
import { BTC_HISTORICAL_DAILY } from '@/data/btcHistorical';

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

    it('keeps the first bar when a day has several', () => {
        const dupes: [number, number][] = [
            [start, 100],
            [start + 3600_000, 999],
            [start + DAY_MS, 110],
        ];
        expect(makeDayPriceLookup(dupes)(start)).toBe(100);
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

// ── Interpolation detection ───────────────────────────────────────────────────

describe('looksInterpolated', () => {
    const start = Date.UTC(2020, 0, 1);

    it('flags a straight-line series', () => {
        // What Kraken's weekly closes become after being straight-lined to daily.
        expect(looksInterpolated(series(start, 400, (i) => 100 + i * 2.5))).toBe(true);
    });

    it('does not flag a real, non-collinear series', () => {
        const real = series(start, 400, (i) => 100 + i + (i % 3 === 0 ? 7 : -5) + Math.sin(i) * 11);
        expect(looksInterpolated(real)).toBe(false);
    });

    it('does not flag a series too short to judge', () => {
        expect(looksInterpolated(series(start, 40, (i) => 100 + i))).toBe(false);
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
     */
    const start = Date.UTC(2015, 0, 1);
    const endTs = Date.UTC(2018, 0, 1);
    // Flat at 1000 for the whole window, then a 10x spike afterwards.
    const history = series(start, 365 * 5, (i) => (start + i * DAY_MS >= endTs ? 10_000 : 1000));

    const runCell = (terminalPrice: number, terminalTs: number) => {
        const result = calculateDca(
            {
                amount: 100,
                frequency: 'monthly',
                startDate: new Date(start),
                endDate: new Date(endTs - DAY_MS),
                feePercentage: 0,
                priceMode: 'api',
                manualPrice: 0,
            },
            history,
            terminalPrice,
        );
        const purchases = result.breakdown.map((b) => ({ ts: Date.parse(b.date), amount: b.invested }));
        return { result, xirr: calculateXirr(purchases, result.currentValue, terminalTs) };
    };

    it('reports ~0% for a window whose price never moved', () => {
        const priceAt = makeDayPriceLookup(history);
        const endPrice = priceAt(endTs);
        expect(endPrice).toBe(10_000); // the spike day itself

        // Value at the last price INSIDE the window, which is what the window earned.
        const inWindowPrice = priceAt(endTs - DAY_MS)!;
        expect(inWindowPrice).toBe(1000);

        const { result, xirr } = runCell(inWindowPrice, endTs);
        expect(result.roi).toBeCloseTo(0, 6);
        expect(xirr).not.toBeNull();
        expect(Math.abs(xirr!)).toBeLessThan(0.02);
    });

    it('does NOT let post-window price action leak into the cell', () => {
        const inWindow = runCell(1000, endTs);
        const markedToLater = runCell(10_000, endTs);
        // Same schedule, same window — only the valuation price differs.
        expect(markedToLater.result.roi).toBeGreaterThan(inWindow.result.roi + 500);
        // Which is exactly why the valuation price must come from the window end.
        expect(inWindow.result.roi).toBeCloseTo(0, 6);
    });

    it('dates the terminal flow at the valuation instant, not today', () => {
        // The return must be non-zero for the terminal DATE to matter at all:
        // 0% annualises to 0% over any horizon. Value the stack at 2x cost.
        const correct = runCell(2000, endTs);
        const misdated = runCell(2000, endTs + 8 * 365 * DAY_MS);

        expect(correct.xirr).not.toBeNull();
        expect(misdated.xirr).not.toBeNull();
        // Same total return, but spread over 11 years instead of 3, so the
        // annualised figure must be materially lower. If these ever converge,
        // the terminal flow has stopped tracking the valuation instant.
        expect(correct.xirr!).toBeGreaterThan(misdated.xirr! * 2);
        expect(correct.xirr!).toBeGreaterThan(0.3);
        expect(misdated.xirr!).toBeLessThan(0.2);
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
});

// ── Kraken-mode provider merging (regression) ─────────────────────────────────

describe('kraken-mode history merging', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('keeps every bundled real daily price and only appends provider data after the snapshot', async () => {
        const WEEK_S = 604_800;
        // Fake weekly closes from Kraken's real first candle (2013-10-03), priced
        // far from the snapshot so any replacement of real days is unmistakable.
        const candles: number[][] = [];
        for (let t = Date.UTC(2013, 9, 3) / 1000; t < Date.UTC(2016, 0, 1) / 1000; t += WEEK_S) {
            candles.push([t, 0, 0, 0, 999_999, 0, 0, 0]);
        }
        vi.stubGlobal('fetch', vi.fn(async () =>
            new Response(JSON.stringify({ error: [], result: { XXBTZUSD: candles, last: 0 } })),
        ));

        const { getBitcoinPriceHistory } = await import('@/app/actions');
        const merged = await getBitcoinPriceHistory(0, Date.UTC(2016, 0, 1), 'kraken');
        const byTs = new Map(merged);

        // The old `ts < firstProviderTs` merge discarded ~630 real daily rows
        // (2013-10-10..2015-07-19) and rebuilt them from weekly straight lines.
        for (const [ts, price] of BTC_HISTORICAL_DAILY) {
            expect(byTs.get(ts)).toBe(price);
        }

        // Provider candles still supply everything after the snapshot's last day.
        const snapEnd = BTC_HISTORICAL_DAILY[BTC_HISTORICAL_DAILY.length - 1][0];
        expect(merged[merged.length - 1][0]).toBeGreaterThan(snapEnd);
        const anchoredAfterSnap = candles
            .map((c) => (c[0] + WEEK_S) * 1000)
            .filter((ts) => ts > snapEnd && ts <= Date.UTC(2016, 0, 1));
        expect(anchoredAfterSnap.length).toBeGreaterThan(0);
        for (const ts of anchoredAfterSnap) {
            expect(byTs.get(ts)).toBe(999_999);
        }

        // Sorted, deduped, and gapless across the seam.
        const gaps = merged.filter((row, i) => i > 0 && row[0] - merged[i - 1][0] !== DAY_MS);
        expect(gaps).toEqual([]);
    });
});
