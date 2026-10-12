import { describe, expect, it } from 'vitest';
import { DAY_MS, addUtcMonths } from '@/utils/dates';
import { CAPITAL, HEADLINE_MONTHS, analyseLumpSum, separateCount } from './analysis';

const FIRST_DAY = Date.UTC(2010, 7, 18);
const LAST_CLOSE = Date.UTC(2026, 9, 11);
const DAYS = Math.round((LAST_CLOSE - FIRST_DAY) / DAY_MS) + 1;

/** One price per consecutive UTC day over the span of the real series. */
const daily = (price: (ts: number, i: number) => number, days = DAYS): [number, number][] =>
    Array.from({ length: days }, (_, i): [number, number] => [FIRST_DAY + i * DAY_MS, price(FIRST_DAY + i * DAY_MS, i)]);

const rising = daily((_, i) => 10 * 1.001 ** i);
const falling = daily((_, i) => 100_000 * 0.999 ** i);
/** $100 until 2020, $200 from New Year's Day 2020 on. */
const STEP = Date.UTC(2020, 0, 1);
const stepUp = daily((ts) => (ts < STEP ? 100 : 200));

describe('analyseLumpSum', () => {
    it('starts on the first of every month that has a whole period of prices behind it', () => {
        const analysis = analyseLumpSum(rising)!;
        expect(analysis.firstStartTs).toBe(Date.UTC(2010, 8, 1)); // the first full month of data
        expect(analysis.firstStartPrice).toBeCloseTo(10 * 1.001 ** 14, 9);
        // 12 monthly buys from Nov 1, 2025 end on Oct 1, 2026, inside the data;
        // from Dec 1 they would end on Nov 1, 2026, which has no price yet.
        expect(analysis.lastStartTs).toBe(Date.UTC(2025, 10, 1));
        expect(analysis.periods.map((p) => [p.months, p.windows])).toEqual([
            [3, 192],
            [6, 189],
            [12, 183],
            [24, 171],
        ]);
        expect(analysis.headline.months).toBe(HEADLINE_MONTHS);
        expect(analysis.headline.perPurchase).toBe(CAPITAL / HEADLINE_MONTHS);
        expect(analysis.lastCloseTs).toBe(LAST_CLOSE);
    });

    it('says how many of those overlapping windows share no months', () => {
        const { headline, periods } = analyseLumpSum(rising)!;
        // 183 monthly starts of a 12-month window: every twelfth one, counted
        // from each of the twelve possible first months.
        expect(headline.separate.fewest).toBe(15);
        expect(headline.separate.most).toBe(16);
        expect(periods.map((p) => [p.separate.fewest, p.separate.most])).toEqual([
            [64, 64],
            [31, 32],
            [15, 16],
            [7, 8],
        ]);
    });

    it('has the lump sum ahead in every window when the price only rises, and behind when it only falls', () => {
        const up = analyseLumpSum(rising)!;
        for (const period of up.periods) {
            expect(period.lumpWinPercent).toBe(100);
            expect(period.separate.lowestWinPercent).toBe(100);
            expect(period.worst.diffPercent).toBeGreaterThan(0);
        }
        // The longer the money waits, the more the wait costs. The range widens
        // too, but only upward: its low end rises with the rest, so nothing
        // here was stretched "in both directions".
        expect(up.trends).toEqual({
            winRateRises: false,
            medianRises: true,
            rangeWidens: true,
            rangeStretchesBothWays: false,
        });

        const down = analyseLumpSum(falling)!;
        for (const period of down.periods) {
            expect(period.lumpWinPercent).toBe(0);
            expect(period.separate.highestWinPercent).toBe(0);
            expect(period.best.diffPercent).toBeLessThan(0);
            expect(period.lumpEnd.belowCostPercent).toBe(100);
            expect(period.dcaEnd.belowCostPercent).toBe(100);
            // Spreading the buys down a falling price loses less.
            expect(period.dcaEnd.worst).toBeGreaterThan(period.lumpEnd.worst);
        }
    });

    it('says the range stretched both ways only when its low end fell and its high end rose', () => {
        // A price that swings around $1,000 on an eight-year cycle and goes
        // nowhere: starts on the way down favour DCA, starts on the way up
        // favour the lump sum, and a longer split pushes both further out.
        const cycle = daily((_, i) => 1000 * Math.exp(Math.sin((2 * Math.PI * i) / (8 * 365.25))));
        const { periods, trends } = analyseLumpSum(cycle)!;
        for (let i = 1; i < periods.length; i++) {
            expect(periods[i].p10).toBeLessThan(periods[i - 1].p10);
            expect(periods[i].p90).toBeGreaterThan(periods[i - 1].p90);
        }
        expect(periods[0].p10).toBeLessThan(0);
        expect(periods[0].p90).toBeGreaterThan(0);
        expect(trends.rangeWidens).toBe(true);
        expect(trends.rangeStretchesBothWays).toBe(true);

        // A price that only falls: the range sits wholly below zero, so it
        // cannot have stretched upward whatever its width did.
        expect(analyseLumpSum(falling)!.trends.rangeStretchesBothWays).toBe(false);
    });

    it('measures the difference in bitcoin held', () => {
        const { headline } = analyseLumpSum(stepUp)!;
        // Only the eleven windows that straddle the step differ at all: starts
        // from Feb 2019 (last buy on the step day) to Dec 2019 (first buy before it).
        expect(headline.lumpWinPercent).toBeCloseTo((11 / 183) * 100, 9);
        expect(headline.worst.diffPercent).toBe(0);
        // The widest gap is the Dec 2019 start: the lump buys 120 BTC at $100,
        // DCA buys 10 BTC at $100 and then eleven lots of 5 BTC at $200.
        expect(headline.best.startTs).toBe(Date.UTC(2019, 11, 1));
        expect(headline.best.lumpBtc).toBeCloseTo(120, 9);
        expect(headline.best.dcaBtc).toBeCloseTo(65, 9);
        expect(headline.best.diffPercent).toBeCloseTo((120 / 65 - 1) * 100, 9);
        expect(headline.best.drawdownAtStart).toBe(0);
    });

    it('values both sides at the price on the day of the last purchase', () => {
        const { headline } = analyseLumpSum(stepUp)!;
        // Dec 2019 start, last buy Nov 1, 2020 at $200: 120 BTC against 65 BTC, on $12,000.
        expect(headline.best.lumpEndReturn).toBeCloseTo(100, 9);
        expect(headline.best.dcaEndReturn).toBeCloseTo(((65 * 200) / CAPITAL - 1) * 100, 9);
        // Across every window: the lump sum's best is that doubling, and nothing ended below cost.
        expect(headline.lumpEnd.best).toBeCloseTo(100, 9);
        expect(headline.lumpEnd.worst).toBeCloseTo(0, 9);
        expect(headline.lumpEnd.belowCostPercent).toBe(0);
        expect(headline.dcaEnd.belowCostPercent).toBe(0);
        // DCA's best is the Feb 2019 start: eleven buys at $100 and one on the step day.
        expect(headline.dcaEnd.best).toBeCloseTo(((115 * 200) / CAPITAL - 1) * 100, 9);
    });

    it('groups windows by where the price stood against its highest so far, on the start date only', () => {
        // Always at a new high: every start date is "within 10%".
        const up = analyseLumpSum(rising)!;
        expect(up.regimes.map((r) => [r.key, r.windows])).toEqual([['top', 183]]);
        expect(up.regimes[0].separate).toBe(16);

        // Always falling from the first day: early starts are near the high, later ones far below.
        const down = analyseLumpSum(falling)!;
        expect(down.regimes.map((r) => r.key)).toEqual(['top', 'mid', 'deep']);
        expect(down.regimes.reduce((sum, r) => sum + r.windows, 0)).toBe(183);
        // 0.999^n is still above 0.9 on day 105 (Dec 1, 2010) and below it from day 106,
        // so the first four start months (Sep 1 to Dec 1) are within 10% and no later one is.
        expect(down.regimes[0].windows).toBe(4);
        for (const regime of down.regimes) expect(regime.separate).toBeLessThanOrEqual(regime.windows);
    });

    it('keeps only windows that finish inside the data', () => {
        const cut = rising.filter(([ts]) => ts <= Date.UTC(2015, 0, 15));
        const analysis = analyseLumpSum(cut)!;
        expect(analysis.lastStartTs).toBe(Date.UTC(2014, 1, 1)); // 12 buys from Feb 2014 end Jan 1, 2015
        expect(analysis.headline.windows).toBe(42);
    });

    it('returns null without enough history for a year of start months', () => {
        expect(analyseLumpSum([])).toBeNull();
        expect(analyseLumpSum(rising.slice(0, 399))).toBeNull();
        expect(analyseLumpSum(rising.slice(0, 600))).toBeNull(); // fewer than 12 twelve-month windows
        expect(analyseLumpSum(rising.slice(0, 760))).not.toBeNull();
    });
});

describe('separateCount', () => {
    const monthly = (count: number): { startTs: number }[] =>
        Array.from({ length: count }, (_, i) => ({ startTs: addUtcMonths(Date.UTC(2010, 8, 1), i, 1) }));

    it('counts the most windows that can be chosen without two sharing a month', () => {
        expect(separateCount(monthly(183), 12)).toBe(16);
        expect(separateCount(monthly(12), 12)).toBe(1);
        expect(separateCount(monthly(13), 12)).toBe(2);
        expect(separateCount(monthly(6), 1)).toBe(6);
        expect(separateCount([], 12)).toBe(0);
    });

    it('counts start months that are far apart separately', () => {
        const rows = [0, 1, 2, 30, 31, 60].map((i) => ({ startTs: addUtcMonths(Date.UTC(2010, 8, 1), i, 1) }));
        expect(separateCount(rows, 12)).toBe(3);
    });
});
