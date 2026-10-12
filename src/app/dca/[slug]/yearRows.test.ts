import { describe, expect, it } from 'vitest';
import { calculateDca } from '@/utils/dca';
import { DAY_MS } from '@/utils/dates';
import type { Frequency, PricePoint } from '@/types';
import { buildYearRows } from './yearRows';

/** One price per UTC day from `from` to `to`, inclusive. */
function dailySeries(from: number, to: number, priceAt: (ts: number) => number): PricePoint[] {
    const points: PricePoint[] = [];
    for (let ts = from; ts <= to; ts += DAY_MS) points.push([ts, priceAt(ts)]);
    return points;
}

function plan(frequency: Frequency, startTs: number, endTs: number, series: PricePoint[], spot: number, asOf: number) {
    return calculateDca(
        {
            amount: 100,
            frequency,
            startDate: new Date(startTs),
            endDate: new Date(endTs),
            feePercentage: 0,
            priceMode: 'api',
            manualPrice: 0,
        },
        series,
        spot,
        asOf,
    );
}

const D = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

describe('buildYearRows', () => {
    it('values a finished year at the 31 December price, not at the last purchase', () => {
        // Monthly buys land on the 1st. The price is $100 all year and doubles
        // on 15 December, so the year's last purchase (1 Dec) still sees $100.
        const start = D('2020-01-01');
        const now = D('2021-06-15');
        const series = dailySeries(start, now, (ts) => (ts >= D('2020-12-15') && ts <= D('2020-12-31') ? 200 : 100));
        const result = plan('monthly', start, now, series, 100, now);

        const rows = buildYearRows(result.breakdown, series, { currentValue: result.currentValue, nowTs: now });
        const y2020 = rows.find((r) => r.year === 2020);

        // 12 buys of $100 at $100 = 12 BTC, worth $2,400 at the year-end $200.
        expect(y2020).toMatchObject({ invested: 1200, isCurrentYear: false, estimated: false });
        expect(y2020?.value).toBeCloseTo(2400, 6);
        expect(y2020?.roi).toBeCloseTo(100, 6);

        // What the table used to print: the last purchase's own valuation.
        const lastBuyOf2020 = result.breakdown.filter((b) => b.date.startsWith('2020')).at(-1);
        expect(lastBuyOf2020?.date.slice(0, 10)).toBe('2020-12-01');
        expect(lastBuyOf2020?.portfolioValue).toBeCloseTo(1200, 6);
    });

    it('uses the 31 December price for a weekly plan whose last buy of the year is days earlier', () => {
        // Weekly from Sunday 3 January 2021: the last buy of the year is 26 December.
        const start = D('2021-01-03');
        const now = D('2022-03-01');
        const series = dailySeries(start, now, (ts) => (ts >= D('2021-12-27') && ts <= D('2021-12-31') ? 50 : 100));
        const result = plan('weekly', start, now, series, 100, now);

        const lastBuyOf2021 = result.breakdown.filter((b) => b.date.startsWith('2021')).at(-1);
        expect(lastBuyOf2021?.date.slice(0, 10)).toBe('2021-12-26');

        const rows = buildYearRows(result.breakdown, series, { currentValue: result.currentValue, nowTs: now });
        const y2021 = rows.find((r) => r.year === 2021);
        // 52 buys of 1 BTC each, valued at the $50 the year closed on.
        expect(y2021?.invested).toBe(5200);
        expect(y2021?.value).toBeCloseTo(52 * 50, 6);
        expect(y2021?.roi).toBeCloseTo(-50, 6);
    });

    it('agrees with the purchase row when the last buy of the year is on 31 December', () => {
        const start = D('2021-01-01'); // weekly from a Friday: 31 Dec 2021 is a purchase day
        const now = D('2022-02-01');
        const series = dailySeries(start, now, (ts) => 100 + ((ts - start) / DAY_MS) * 0.5);
        const result = plan('weekly', start, now, series, 300, now);

        const lastBuyOf2021 = result.breakdown.filter((b) => b.date.startsWith('2021')).at(-1);
        expect(lastBuyOf2021?.date.slice(0, 10)).toBe('2021-12-31');

        const rows = buildYearRows(result.breakdown, series, { currentValue: result.currentValue, nowTs: now });
        expect(rows.find((r) => r.year === 2021)?.value).toBeCloseTo(lastBuyOf2021!.portfolioValue, 6);
    });

    it('makes the current-year row the headline value, labelled as still running', () => {
        const start = D('2024-03-10');
        const now = D('2026-10-12') + 5 * 3_600_000; // mid-morning UTC
        const series = dailySeries(start, D('2026-10-12'), () => 100);
        const result = plan('weekly', start, D('2026-10-12'), series, 137, now);

        const rows = buildYearRows(result.breakdown, series, { currentValue: result.currentValue, nowTs: now });
        expect(rows.map((r) => r.year)).toEqual([2024, 2025, 2026]);
        const current = rows.at(-1)!;
        expect(current.isCurrentYear).toBe(true);
        expect(current.estimated).toBe(false);
        expect(current.value).toBe(result.currentValue);
        expect(current.invested).toBe(result.totalInvested);
        expect(current.roi).toBeCloseTo(result.roi, 9);
        expect(rows.slice(0, -1).every((r) => !r.isCurrentYear)).toBe(true);
    });

    it('gives a running plan a year-to-date row before the first purchase of a new year', () => {
        // Weekly from Sunday 3 Jan 2021: the first buy of 2022 is 2 January.
        const start = D('2021-01-03');
        const now = D('2022-01-01');
        const series = dailySeries(start, now, () => 100);
        const result = plan('weekly', start, now, series, 120, now);
        expect(result.breakdown.at(-1)?.date.slice(0, 10)).toBe('2021-12-26');

        const rows = buildYearRows(result.breakdown, series, { currentValue: result.currentValue, nowTs: now });
        expect(rows.map((r) => r.year)).toEqual([2021, 2022]);
        expect(rows[1]).toMatchObject({ isCurrentYear: true, invested: result.totalInvested, value: result.currentValue });
    });

    it('ends a fixed-window plan at its own last year, valued at that year end', () => {
        const start = D('2025-01-01');
        const end = D('2025-12-31');
        const now = D('2026-10-12');
        const series = dailySeries(start, now, (ts) => (ts <= end ? 100 : 400));
        const result = plan('weekly', start, end, series, 400, now);

        const rows = buildYearRows(result.breakdown, series, { currentValue: result.currentValue, nowTs: now, endTs: end });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ year: 2025, isCurrentYear: false, estimated: false });
        // Valued at the $100 of 31 December 2025, not at today's $400.
        expect(rows[0].value).toBeCloseTo(result.btcAccumulated * 100, 6);
        expect(rows[0].roi).toBeCloseTo(0, 6);
    });

    it('marks a year end that rests on a filled-in or carried-forward price', () => {
        const start = D('2019-01-01');
        const now = D('2022-06-01');
        const marked: PricePoint[] = dailySeries(start, now, () => 100).map(([ts, price]): PricePoint => {
            if (ts === D('2019-12-31')) return [ts, price, 'estimated'];
            return [ts, price, 'observed'];
        });
        // 2020 has no row for 30 or 31 December: the 29th is carried forward.
        const holed = marked.filter(([ts]) => ts !== D('2020-12-30') && ts !== D('2020-12-31'));
        const result = plan('monthly', start, now, holed, 100, now);

        const rows = buildYearRows(result.breakdown, holed, { currentValue: result.currentValue, nowTs: now });
        expect(rows.map((r) => [r.year, r.estimated])).toEqual([
            [2019, true],
            [2020, true],
            [2021, false],
            [2022, false],
        ]);
    });

    it('leaves out a finished year it has no price for, and returns nothing for no purchases', () => {
        const start = D('2020-06-01');
        const now = D('2022-03-01');
        const full = dailySeries(start, now, () => 100);
        const result = plan('monthly', start, now, full, 100, now);

        // A series that only begins in 2021 cannot value the end of 2020... but
        // it can value every later year.
        const late = full.filter(([ts]) => ts >= D('2021-01-05'));
        const rows = buildYearRows(result.breakdown, late, { currentValue: result.currentValue, nowTs: now });
        expect(rows.map((r) => r.year)).toEqual([2021, 2022]);

        expect(buildYearRows([], full, { currentValue: 0, nowTs: now })).toEqual([]);
    });
});
