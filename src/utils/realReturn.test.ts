import { describe, it, expect } from 'vitest';
import { calculateRealReturn, type CpiSeries } from './realReturn';
import { DAY_MS } from './dates';

const iso = (ts: number): string => new Date(ts).toISOString();

/** Monthly readings dated the 1st, compounding at `annualRate` from `fromYear`-`fromMonth`. */
const monthlyCpi = (fromYear: number, fromMonth: number, months: number, annualRate: number): [number, number][] =>
    Array.from({ length: months }, (_, i): [number, number] => [
        Date.UTC(fromYear, fromMonth + i, 1),
        100 * Math.pow(1 + annualRate, i / 12),
    ]);

const weekly = (startTs: number, endTs: number, amount: number) => {
    const rows: { date: string; invested: number }[] = [];
    for (let ts = startTs; ts <= endTs; ts += 7 * DAY_MS) rows.push({ date: iso(ts), invested: amount });
    return rows;
};

describe('calculateRealReturn', () => {
    // Bitcoin's price never moves, so the nominal return is exactly 0% and
    // everything the function reports is the inflation adjustment itself.
    const start = Date.UTC(2021, 9, 12);
    const end = Date.UTC(2026, 9, 11);
    const cpi = monthlyCpi(2021, 8, 62, 0.03); // Sep 2021 .. Oct 2026
    const fiveYearInflation = (Math.pow(1.03, 5) - 1) * 100; // Oct 2021 reading to Oct 2026 reading

    it('charges a lump sum the whole period of inflation', () => {
        const result = calculateRealReturn([{ date: iso(start), invested: 13_050 }], 13_050, cpi, end)!;
        expect(result.inflationPercent).toBeCloseTo(fiveYearInflation, 6);
        // value / (cost x (1 + inflation)) - 1
        expect(result.realRoiPercent).toBeCloseTo((1 / (1 + fiveYearInflation / 100) - 1) * 100, 6);
        expect(result.realRoiPercent).toBeCloseTo(-13.74, 1);
        expect(result.startObsTs).toBe(Date.UTC(2021, 9, 1));
        expect(result.endObsTs).toBe(Date.UTC(2026, 9, 1));
    });

    it('charges a DCA plan only for the inflation each purchase was exposed to', () => {
        const buys = weekly(start, end, 50);
        expect(buys).toHaveLength(261);
        const result = calculateRealReturn(buys, 13_050, cpi, end)!;

        // Deflating the value by the whole window and leaving the cost
        // nominal would report the lump-sum figure for every plan.
        const wholeWindow = (13_050 * (cpi[1][1] / cpi[cpi.length - 1][1]) - 13_050) / 13_050 * 100;
        expect(wholeWindow).toBeCloseTo(-13.74, 1);

        // Money paid in evenly over the window saw about half of it.
        expect(result.realRoiPercent).toBeGreaterThan(-7.6);
        expect(result.realRoiPercent).toBeLessThan(-6.9);
        expect(result.realInvested).toBeGreaterThan(13_050);
        expect(result.realInvested).toBeLessThan(13_050 * (1 + fiveYearInflation / 100));
        // The inflation tile still describes the whole span.
        expect(result.inflationPercent).toBeCloseTo(fiveYearInflation, 6);
    });

    it('restates each purchase from its own month, not from the first one', () => {
        const flat: CpiSeries = [
            [Date.UTC(2024, 0, 1), 100],
            [Date.UTC(2024, 1, 1), 110],
            [Date.UTC(2024, 2, 1), 121],
        ];
        const result = calculateRealReturn(
            [
                { date: iso(Date.UTC(2024, 0, 15)), invested: 100 }, // x 121/100
                { date: iso(Date.UTC(2024, 1, 15)), invested: 100 }, // x 121/110
                { date: iso(Date.UTC(2024, 2, 15)), invested: 100 }, // x 1
            ],
            331,
            flat,
            Date.UTC(2024, 2, 20),
        )!;
        expect(result.realInvested).toBeCloseTo(121 + 110 + 100, 9);
        expect(result.realRoiPercent).toBeCloseTo(0, 9);
        expect(result.inflationPercent).toBeCloseTo(21, 9);
    });

    // FRED CPIAUCSL readings (Dec 2016, Jan 2017, Jan 2019, Aug 2026) and a
    // worked example: $5,250 put in, worth $141,418 on 2026-10-12.
    const fred: CpiSeries = [
        [Date.UTC(2016, 11, 1), 242.637],
        [Date.UTC(2017, 0, 1), 243.618],
        [Date.UTC(2019, 0, 1), 252.561],
        [Date.UTC(2026, 7, 1), 334.131],
    ];
    const lump = [{ date: iso(Date.UTC(2017, 0, 1)), invested: 5_250 }];

    it('reads CPI through the day the stack is valued, not the day the plan ended', () => {
        const valuedToday = calculateRealReturn(lump, 141_418, fred, Date.UTC(2026, 9, 12))!;
        expect(valuedToday.endObsTs).toBe(Date.UTC(2026, 7, 1));
        expect(valuedToday.inflationPercent).toBeCloseTo((334.131 / 243.618 - 1) * 100, 6); // about 37%
        expect(valuedToday.realInvested).toBeCloseTo(5_250 * 334.131 / 243.618, 6);
        expect(valuedToday.realRoiPercent).toBeCloseTo(1864, 0);
    });

    it('uses the window-end reading when the stack is valued at the window end', () => {
        const valuedAtEnd = calculateRealReturn(lump, 141_418, fred, Date.UTC(2019, 0, 2))!;
        expect(valuedAtEnd.endObsTs).toBe(Date.UTC(2019, 0, 1));
        expect(valuedAtEnd.inflationPercent).toBeCloseTo((252.561 / 243.618 - 1) * 100, 6); // about 3.7%
    });

    it('does not inflate purchases made after the latest reading', () => {
        const result = calculateRealReturn(
            [
                { date: iso(Date.UTC(2017, 0, 1)), invested: 1_000 },
                { date: iso(Date.UTC(2026, 8, 15)), invested: 1_000 }, // September: no reading yet
            ],
            5_000,
            fred,
            Date.UTC(2026, 9, 12),
        )!;
        expect(result.realInvested).toBeCloseTo(1_000 * 334.131 / 243.618 + 1_000, 6);
    });

    it('prices a purchase that predates every reading at the first one', () => {
        const result = calculateRealReturn(
            [{ date: iso(Date.UTC(2016, 5, 1)), invested: 1_000 }],
            5_000,
            fred,
            Date.UTC(2026, 9, 12),
        )!;
        expect(result.startObsTs).toBe(Date.UTC(2016, 11, 1));
        expect(result.realInvested).toBeCloseTo(1_000 * 334.131 / 242.637, 6);
    });

    it('counts a starting-stack row like any other contribution, and skips empty rows', () => {
        const result = calculateRealReturn(
            [
                { date: iso(Date.UTC(2017, 0, 1)), invested: 2_000 }, // the stack, dated at the plan start
                { date: iso(Date.UTC(2017, 0, 8)), invested: 0 },
                { date: iso(Date.UTC(2019, 0, 5)), invested: 500 },
            ],
            9_000,
            fred,
            Date.UTC(2026, 9, 12),
        )!;
        expect(result.realInvested).toBeCloseTo(2_000 * 334.131 / 243.618 + 500 * 334.131 / 252.561, 6);
    });

    it('returns null when there is no inflation to measure', () => {
        expect(calculateRealReturn(lump, 141_418, null, Date.UTC(2026, 9, 12))).toBeNull();
        expect(calculateRealReturn(lump, 141_418, [[Date.UTC(2017, 0, 1), 243.618]], Date.UTC(2026, 9, 12))).toBeNull();
        expect(calculateRealReturn([], 141_418, fred, Date.UTC(2026, 9, 12))).toBeNull();
        expect(calculateRealReturn(lump, 0, fred, Date.UTC(2026, 9, 12))).toBeNull();
        expect(calculateRealReturn(lump, 141_418, fred, NaN)).toBeNull();
        // First purchase and valuation fall under the same reading.
        expect(calculateRealReturn(lump, 5_300, fred, Date.UTC(2017, 0, 20))).toBeNull();
    });
});
