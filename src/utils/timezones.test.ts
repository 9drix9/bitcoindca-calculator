import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    DAY_MS, addUtcMonths, clampToTodayUtc, defaultPlanWindow, formatUtc, hasHappenedUtc, parseUtcDate,
    utcFullYearsBetween, utcIsoToday, utcIsoYearsAgo, utcMonthsBefore, utcMonthsBetween,
} from './dates';
import { decodeParams, encodeParams } from './urlParams';
import { generateCsvContent } from './csv';
import { calculateDca, calculateDcaToDate } from './dca';

/**
 * Everything dated in this app is a UTC calendar day. These cases are the
 * places a local-time call has slipped in before, run with the process in
 * zones on both sides of UTC:
 *
 *  - America/Los_Angeles: behind UTC, so UTC midnight is still "yesterday".
 *  - Pacific/Kiritimati: UTC+14, so most of its day is already "tomorrow",
 *    and its local calendar has no 1994-12-31.
 *  - Pacific/Apia: its local calendar has no 2011-12-30.
 *  - UTC: the control.
 *
 * `offsetMinutes` is what getTimezoneOffset() must report at noon UTC on
 * 15 July 2015. It is asserted first so that if switching zones ever stops
 * working, these tests fail instead of quietly running four times in the
 * same zone.
 *
 * Running the whole suite under a zone works too, and is worth doing before a
 * release: TZ=Pacific/Kiritimati npx vitest run
 */
const ZONES = [
    { tz: 'UTC', offsetMinutes: 0 },
    { tz: 'America/Los_Angeles', offsetMinutes: 420 },
    { tz: 'Pacific/Kiritimati', offsetMinutes: -840 },
    { tz: 'Pacific/Apia', offsetMinutes: -780 },
];

const day = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

describe.each(ZONES)('with the process in $tz', ({ tz, offsetMinutes }) => {
    const originalTz = process.env.TZ;

    beforeAll(() => {
        process.env.TZ = tz;
    });

    afterAll(() => {
        if (originalTz === undefined) delete process.env.TZ;
        else process.env.TZ = originalTz;
    });

    it('is really running in that zone', () => {
        expect(new Date(Date.UTC(2015, 6, 15, 12)).getTimezoneOffset()).toBe(offsetMinutes);
    });

    it('takes "today" and the default window from the UTC date', () => {
        // 02:00 UTC is still the previous evening in Los Angeles;
        // 22:00 UTC is already the next day in Kiritimati and Apia.
        const earlyUtc = Date.parse('2026-10-12T02:00:00Z');
        const lateUtc = Date.parse('2026-10-11T22:00:00Z');
        expect(utcIsoToday(earlyUtc)).toBe('2026-10-12');
        expect(utcIsoToday(lateUtc)).toBe('2026-10-11');
        expect(utcIsoYearsAgo(5, earlyUtc)).toBe('2021-10-12');
        expect(utcIsoYearsAgo(5, lateUtc)).toBe('2021-10-11');
        expect(formatUtc(utcMonthsBefore(Date.parse('2026-03-31T02:00:00Z'), 1), 'isoDay')).toBe('2026-02-28');
        expect(defaultPlanWindow(earlyUtc)).toMatchObject({ startDate: '2021-10-12', endDate: '2026-10-12' });
        expect(defaultPlanWindow(lateUtc)).toMatchObject({ startDate: '2021-10-11', endDate: '2026-10-11' });
    });

    it('decides what has happened by the UTC day', () => {
        const earlyUtc = Date.parse('2026-10-12T02:00:00Z');
        expect(hasHappenedUtc(day('2026-10-12'), earlyUtc)).toBe(true);
        expect(hasHappenedUtc(day('2026-10-13'), earlyUtc)).toBe(false);
        expect(clampToTodayUtc(day('2027-01-04'), earlyUtc)).toBe(day('2026-10-12'));
    });

    it('parses and prints dates without shifting the day', () => {
        expect(parseUtcDate('2026-10-12')).toBe(Date.UTC(2026, 9, 12));
        expect(formatUtc(day('2026-01-01'), 'full')).toBe('Jan 1, 2026');
        expect(formatUtc(day('2026-01-01'), 'monthDay')).toBe('Jan 1');
        expect(formatUtc(day('2026-01-01'), 'monthYear')).toBe('Jan 2026');
        expect(formatUtc(day('2026-01-01'), 'shortMonthYear')).toBe('Jan 26');
        expect(formatUtc(day('2026-01-01'), 'isoDay')).toBe('2026-01-01');
        expect(formatUtc('2026-01-01T00:00:00.000Z', 'isoDay')).toBe('2026-01-01');
    });

    it('counts months and years between UTC dates', () => {
        // The duration chip read "5mo" for this six-month span in the Americas.
        expect(utcMonthsBetween(day('2021-01-01'), day('2021-07-01'))).toBe(6);
        expect(utcMonthsBetween(day('2021-03-01'), day('2021-03-29'))).toBe(0);
        expect(utcFullYearsBetween(day('2020-02-29'), day('2021-02-28'))).toBe(1);
        expect(addUtcMonths(day('2021-01-31'), 1, 31)).toBe(day('2021-02-28'));
    });

    it('accepts every real calendar date in a link, including days this zone never had', () => {
        expect(decodeParams({ endDate: '1994-12-31' })?.endDate).toBe('1994-12-31');
        expect(decodeParams({ endDate: '2011-12-30' })?.endDate).toBe('2011-12-30');
        expect(decodeParams({ startDate: '2024-02-29' })?.startDate).toBe('2024-02-29');
        // Spring-forward and fall-back days in the US.
        expect(decodeParams({ startDate: '2026-03-08', endDate: '2026-11-01' })).toEqual({ startDate: '2026-03-08', endDate: '2026-11-01' });
        expect(decodeParams({ endDate: '2023-02-29' })).toBeNull();
        expect(decodeParams({ endDate: '2021-02-30' })).toBeNull();
    });

    it('round-trips a link', () => {
        const query = encodeParams({
            amount: 50, frequency: 'monthly', startDate: '2020-02-29', endDate: '2024-02-29',
            feePercentage: 0.5, priceMode: 'api', provider: 'kraken', manualPrice: 0, currency: 'EUR',
        });
        expect(decodeParams(Object.fromEntries(new URLSearchParams(query).entries()))).toEqual({
            amount: 50, frequency: 'monthly', startDate: '2020-02-29', endDate: '2024-02-29',
            feePercentage: 0.5, priceMode: 'api', provider: 'kraken', currency: 'EUR',
        });
    });

    it('schedules month-end and leap-day plans on the same UTC days', () => {
        const dates = (startIso: string, endIso: string) => calculateDca(
            {
                amount: 100, frequency: 'monthly', startDate: new Date(parseUtcDate(startIso)), endDate: new Date(parseUtcDate(endIso)),
                feePercentage: 0, priceMode: 'manual', manualPrice: 50_000,
            },
            undefined,
            undefined,
            day('2026-10-12'),
        ).breakdown.map((row) => row.date);

        expect(dates('2021-01-31', '2021-05-31')).toEqual([
            '2021-01-31T00:00:00.000Z', '2021-02-28T00:00:00.000Z', '2021-03-31T00:00:00.000Z',
            '2021-04-30T00:00:00.000Z', '2021-05-31T00:00:00.000Z',
        ]);
        expect(dates('2020-02-29', '2020-05-29')).toEqual([
            '2020-02-29T00:00:00.000Z', '2020-03-29T00:00:00.000Z', '2020-04-29T00:00:00.000Z', '2020-05-29T00:00:00.000Z',
        ]);
        expect(dates('2023-11-30', '2024-03-30')).toEqual([
            '2023-11-30T00:00:00.000Z', '2023-12-30T00:00:00.000Z', '2024-01-30T00:00:00.000Z',
            '2024-02-29T00:00:00.000Z', '2024-03-30T00:00:00.000Z',
        ]);
    });

    it('cuts a running plan off at UTC midnight, not local midnight', () => {
        // Weekly from 2026-01-05; the 41st buy is dated 2026-10-12.
        const start = day('2026-01-05');
        const today = day('2026-10-12');
        const prices = Array.from({ length: 281 }, (_, i): [number, number] => [start + i * DAY_MS, 100_000]);
        const plan = {
            amount: 100, frequency: 'weekly' as const, startDate: new Date(start), endDate: new Date(day('2027-01-04')),
            feePercentage: 0, priceMode: 'api' as const, manualPrice: 0,
        };
        expect(calculateDcaToDate(plan, prices, 100_000, today - 1).breakdown.length).toBe(40);
        expect(calculateDcaToDate(plan, prices, 100_000, today).breakdown.length).toBe(41);
        expect(calculateDcaToDate(plan, prices, 100_000, today + DAY_MS - 1).breakdown.length).toBe(41);
    });

    it('exports the UTC date of each purchase', () => {
        const start = day('2026-01-01');
        const prices = Array.from({ length: 10 }, (_, i): [number, number] => [start + i * DAY_MS, 100_000]);
        const result = calculateDca(
            {
                amount: 100, frequency: 'daily', startDate: new Date(start), endDate: new Date(start + 2 * DAY_MS),
                feePercentage: 0, priceMode: 'api', manualPrice: 0,
            },
            prices,
            100_000,
            day('2026-10-12'),
        );
        const dates = generateCsvContent(result.breakdown).split('\n').slice(1).map((line) => line.split(',')[0]);
        expect(dates).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    });
});
