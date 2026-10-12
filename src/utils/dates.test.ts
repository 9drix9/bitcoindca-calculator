import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    DAY_MS,
    DEFAULT_YEARS_BACK,
    EARLIEST_PRICE_DATE,
    EARLIEST_PRICE_TS,
    MAX_END_DATE,
    MAX_END_TS,
    addUtcMonths,
    clampToTodayUtc,
    defaultPlanWindow,
    defaultStartFor,
    formatUtc,
    hasHappenedUtc,
    parseUtcDate,
    utcDayIndex,
    utcDayStart,
    utcFullYearsBetween,
    utcIsoToday,
    utcIsoYearsAgo,
    utcMonthsBefore,
    utcMonthsBetween,
    utcYearsBefore,
} from './dates';
import { DEFAULT_PLAN } from '@/data/planDefaults';

/** UTC midnight of an ISO day, for readable fixtures. */
const day = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
const iso = (ts: number): string => new Date(ts).toISOString().slice(0, 10);

afterEach(() => {
    vi.useRealTimers();
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe('date range constants', () => {
    it('keeps each ISO date and its timestamp in step', () => {
        expect(parseUtcDate(EARLIEST_PRICE_DATE)).toBe(EARLIEST_PRICE_TS);
        expect(parseUtcDate(MAX_END_DATE)).toBe(MAX_END_TS);
        expect(EARLIEST_PRICE_DATE).toBe('2010-08-18');
        expect(MAX_END_DATE).toBe('2100-12-31');
    });

    it('needs the timestamp, not the string, to catch a five-digit year', () => {
        // A date field can hand over a five-digit year. As a string it sorts
        // BEFORE the ceiling; parsed, it is NaN and fails the comparison.
        expect('20300-10-11' > MAX_END_DATE).toBe(false);
        expect(parseUtcDate('20300-10-11') <= MAX_END_TS).toBe(false);
        expect(parseUtcDate('2101-01-01') <= MAX_END_TS).toBe(false);
        expect(parseUtcDate(MAX_END_DATE) <= MAX_END_TS).toBe(true);
    });

    it('takes the default look-back from the default plan', () => {
        expect(DEFAULT_YEARS_BACK).toBe(DEFAULT_PLAN.yearsBack);
        expect(DEFAULT_PLAN).toEqual({ amount: 50, frequency: 'weekly', yearsBack: 5, feePercentage: 0.5 });
    });
});

// ── Day bucketing ─────────────────────────────────────────────────────────────

describe('UTC day bucketing', () => {
    it('maps every instant of a UTC day to the same index', () => {
        const midnight = day('2026-10-12');
        expect(utcDayIndex(midnight)).toBe(utcDayIndex(midnight + DAY_MS - 1));
        expect(utcDayIndex(midnight - 1)).toBe(utcDayIndex(midnight) - 1);
        expect(utcDayIndex(midnight + DAY_MS)).toBe(utcDayIndex(midnight) + 1);
    });

    it('floors to UTC midnight', () => {
        expect(utcDayStart(Date.parse('2026-10-12T23:59:59.999Z'))).toBe(day('2026-10-12'));
        expect(utcDayStart(day('2026-10-12'))).toBe(day('2026-10-12'));
        // Before 1970 too: floor, not truncation toward zero.
        expect(utcDayStart(Date.parse('1969-12-31T12:00:00Z'))).toBe(day('1969-12-31'));
    });
});

describe('parseUtcDate', () => {
    it('reads a yyyy-MM-dd value as UTC midnight', () => {
        expect(parseUtcDate('2026-10-12')).toBe(Date.UTC(2026, 9, 12));
        expect(parseUtcDate('2024-02-29')).toBe(Date.UTC(2024, 1, 29));
    });

    it.each(['', '2026-10', '2026-1-2', '12/10/2026', '2026-10-12T00:00:00Z', '20300-10-11', ' 2026-10-12', 'abcd-ef-gh'])(
        'returns NaN for %j',
        (value) => {
            expect(parseUtcDate(value)).toBeNaN();
        },
    );
});

// ── Month and year arithmetic ─────────────────────────────────────────────────

describe('addUtcMonths', () => {
    it('clamps to the month length but keeps the original day as the anchor', () => {
        const jan31 = day('2021-01-31');
        expect(iso(addUtcMonths(jan31, 1, 31))).toBe('2021-02-28');
        expect(iso(addUtcMonths(jan31, 2, 31))).toBe('2021-03-31');
        expect(iso(addUtcMonths(jan31, 3, 31))).toBe('2021-04-30');
        expect(iso(addUtcMonths(day('2020-01-31'), 1, 31))).toBe('2020-02-29');
    });

    it('rolls the year over in both directions', () => {
        expect(iso(addUtcMonths(day('2021-11-15'), 3, 15))).toBe('2022-02-15');
        expect(iso(addUtcMonths(day('2021-12-15'), 12, 15))).toBe('2022-12-15');
        expect(iso(addUtcMonths(day('2021-02-15'), -3, 15))).toBe('2020-11-15');
        expect(iso(addUtcMonths(day('2021-01-15'), -13, 15))).toBe('2019-12-15');
        expect(iso(addUtcMonths(day('2021-06-15'), 0, 15))).toBe('2021-06-15');
    });

    it('returns UTC midnight whatever time of day it is given', () => {
        expect(addUtcMonths(Date.parse('2021-01-31T17:45:00Z'), 1, 31)).toBe(day('2021-02-28'));
    });
});

describe('utcMonthsBefore / utcYearsBefore', () => {
    it('steps back whole months, clamping to the shorter month', () => {
        expect(iso(utcMonthsBefore(day('2026-03-31'), 1))).toBe('2026-02-28');
        expect(iso(utcMonthsBefore(day('2026-10-11'), 3))).toBe('2026-07-11');
        expect(iso(utcMonthsBefore(Date.parse('2026-10-11T23:30:00Z'), 3))).toBe('2026-07-11');
    });

    it('steps back whole years, taking Feb 29 to Feb 28', () => {
        expect(iso(utcYearsBefore(day('2026-10-12'), 5))).toBe('2021-10-12');
        expect(iso(utcYearsBefore(day('2028-02-29'), 5))).toBe('2023-02-28');
        expect(iso(utcYearsBefore(day('2028-02-29'), 4))).toBe('2024-02-29');
    });

    it.each([
        // The day does not exist in the target month: it must not roll into the next one.
        ['2026-03-31', 1, '2026-02-28'],
        ['2026-10-31', 1, '2026-09-30'],
        ['2026-05-31', 6, '2025-11-30'],
        ['2028-03-31', 1, '2028-02-29'],
        ['2026-03-30', 1, '2026-02-28'],
        ['2026-01-31', 1, '2025-12-31'],
        // The ordinary cases.
        ['2026-10-11', 1, '2026-09-11'],
        ['2026-10-11', 3, '2026-07-11'],
        ['2026-01-15', 13, '2024-12-15'],
        ['2026-10-11', 0, '2026-10-11'],
    ])('%s minus %i month(s) is %s', (today, months, expected) => {
        expect(iso(utcMonthsBefore(day(today), months))).toBe(expected);
    });
});

describe('utcMonthsBetween', () => {
    it.each([
        ['2021-01-01', '2021-07-01', 6],
        ['2021-01-01', '2021-06-30', 5],
        ['2021-03-01', '2021-03-29', 0],
        ['2021-01-15', '2022-01-15', 12],
        ['2021-01-15', '2022-01-14', 11],
        ['2020-11-30', '2021-02-28', 3],
        // Month-end starts count the clamped day as the month completing.
        ['2021-01-31', '2021-02-27', 0],
        ['2021-01-31', '2021-02-28', 1],
        ['2021-01-31', '2021-04-30', 3],
        ['2020-02-29', '2021-02-28', 12],
        ['2020-02-29', '2024-02-28', 47],
        ['2020-02-29', '2024-02-29', 48],
    ])('%s to %s is %i', (from, to, months) => {
        expect(utcMonthsBetween(day(from), day(to))).toBe(months);
    });

    it('is 0 when the end is not after the start', () => {
        expect(utcMonthsBetween(day('2021-07-01'), day('2021-01-01'))).toBe(0);
        expect(utcMonthsBetween(day('2021-07-01'), day('2021-07-01'))).toBe(0);
        expect(utcMonthsBetween(NaN, day('2021-07-01'))).toBe(0);
    });

    it('agrees with the monthly schedule: purchase k is exactly k months after the first', () => {
        for (const start of ['2020-01-31', '2020-02-29', '2021-05-30', '2021-08-15']) {
            const startTs = day(start);
            const anchor = new Date(startTs).getUTCDate();
            for (let k = 0; k <= 60; k++) {
                expect(utcMonthsBetween(startTs, addUtcMonths(startTs, k, anchor))).toBe(k);
            }
        }
    });
});

describe('utcFullYearsBetween', () => {
    it('counts completed anniversaries', () => {
        const start = day('2020-01-15');
        expect(utcFullYearsBetween(start, start)).toBe(0);
        expect(utcFullYearsBetween(start, day('2021-01-14'))).toBe(0);
        expect(utcFullYearsBetween(start, day('2021-01-15'))).toBe(1);
        expect(utcFullYearsBetween(start, day('2026-01-14'))).toBe(5);
        expect(utcFullYearsBetween(start, day('2026-01-15'))).toBe(6);
    });

    it('is 0 when the end is not after the start', () => {
        expect(utcFullYearsBetween(day('2021-01-15'), day('2020-01-15'))).toBe(0);
    });

    it('puts a Feb 29 anniversary on Feb 28 in a non-leap year', () => {
        const leapDay = day('2020-02-29');
        expect(utcFullYearsBetween(leapDay, day('2021-02-27'))).toBe(0);
        expect(utcFullYearsBetween(leapDay, day('2021-02-28'))).toBe(1);
        expect(utcFullYearsBetween(leapDay, day('2024-02-28'))).toBe(3);
        expect(utcFullYearsBetween(leapDay, day('2024-02-29'))).toBe(4);
    });

    it('leaves a Feb 28 start on Feb 28 in a leap year', () => {
        const feb28 = day('2019-02-28');
        expect(utcFullYearsBetween(feb28, day('2020-02-27'))).toBe(0);
        expect(utcFullYearsBetween(feb28, day('2020-02-28'))).toBe(1);
    });
});

// ── "Today" ───────────────────────────────────────────────────────────────────

describe('utcIsoToday / utcIsoYearsAgo', () => {
    it('uses the instant it is given, to the millisecond', () => {
        expect(utcIsoToday(Date.parse('2026-10-11T23:59:59.999Z'))).toBe('2026-10-11');
        expect(utcIsoToday(Date.parse('2026-10-12T00:00:00.000Z'))).toBe('2026-10-12');
        expect(utcIsoYearsAgo(5, Date.parse('2026-10-11T23:59:59.999Z'))).toBe('2021-10-11');
        expect(utcIsoYearsAgo(5, Date.parse('2026-10-12T00:00:00.000Z'))).toBe('2021-10-12');
    });

    it('falls back to the clock when no instant is given', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-12T01:40:00Z'));
        expect(utcIsoToday()).toBe('2026-10-12');
        expect(utcIsoYearsAgo(5)).toBe('2021-10-12');
    });

    it('takes a leap day back to Feb 28 when the target year has no Feb 29', () => {
        expect(utcIsoYearsAgo(5, day('2028-02-29'))).toBe('2023-02-28');
        expect(utcIsoYearsAgo(1, day('2028-02-29'))).toBe('2027-02-28');
        expect(utcIsoYearsAgo(4, day('2028-02-29'))).toBe('2024-02-29');
    });

});

describe('defaultPlanWindow', () => {
    it('is the last five years ending today (UTC)', () => {
        const now = Date.parse('2026-10-12T01:40:00Z');
        expect(defaultPlanWindow(now)).toEqual({
            startDate: '2021-10-12',
            endDate: '2026-10-12',
            startTs: day('2021-10-12'),
            endTs: day('2026-10-12'),
        });
    });

    it('matches the helpers the home page and the calculator each called on their own', () => {
        for (const now of [Date.parse('2026-10-11T23:59:59Z'), Date.parse('2028-02-29T12:00:00Z'), Date.parse('2027-01-01T00:00:00Z')]) {
            const window = defaultPlanWindow(now);
            expect(window.endDate).toBe(utcIsoToday(now));
            expect(window.startDate).toBe(utcIsoYearsAgo(DEFAULT_YEARS_BACK, now));
            expect(parseUtcDate(window.startDate)).toBe(window.startTs);
            expect(parseUtcDate(window.endDate)).toBe(window.endTs);
        }
    });

    it('reads the clock only when no instant is given', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-12T01:40:00Z'));
        const pinned = defaultPlanWindow(Date.parse('2026-10-12T01:40:00Z'));
        expect(defaultPlanWindow()).toEqual(pinned);
        vi.setSystemTime(new Date('2026-10-13T00:00:01Z'));
        expect(defaultPlanWindow(Date.parse('2026-10-12T01:40:00Z'))).toEqual(pinned);
        expect(defaultPlanWindow().endDate).toBe('2026-10-13');
    });
});

describe('defaultStartFor', () => {
    it('is the default number of years before the end day', () => {
        expect(defaultStartFor(day('2026-10-12'))).toBe('2021-10-12');
        expect(defaultStartFor(Date.parse('2026-10-12T23:59:59Z'))).toBe('2021-10-12');
        expect(defaultStartFor(day('2028-02-29'))).toBe('2023-02-28');
    });

    it('never starts before the first day that can be priced', () => {
        // Five years before 2012 is 2007, three years before the data begins.
        expect(defaultStartFor(day('2012-01-01'))).toBe(EARLIEST_PRICE_DATE);
        expect(defaultStartFor(day('2015-08-18'))).toBe(EARLIEST_PRICE_DATE);
        expect(defaultStartFor(day('2015-08-19'))).toBe('2010-08-19');
    });
});

// ── What has happened ─────────────────────────────────────────────────────────

describe('hasHappenedUtc', () => {
    const now = Date.parse('2026-10-12T01:40:00Z');

    it('is true for any day up to and including today (UTC)', () => {
        expect(hasHappenedUtc(day('2026-10-11'), now)).toBe(true);
        expect(hasHappenedUtc(day('2026-10-12'), now)).toBe(true);
        // Later the same UTC day still counts: the rule is by day, not by instant.
        expect(hasHappenedUtc(Date.parse('2026-10-12T23:00:00Z'), now)).toBe(true);
    });

    it('is false from tomorrow (UTC) on', () => {
        expect(hasHappenedUtc(day('2026-10-13'), now)).toBe(false);
        expect(hasHappenedUtc(day('2027-01-04'), now)).toBe(false);
    });

    it('turns over at UTC midnight', () => {
        const purchase = day('2026-10-12');
        expect(hasHappenedUtc(purchase, purchase - 1)).toBe(false);
        expect(hasHappenedUtc(purchase, purchase)).toBe(true);
    });

    it('reads the clock only when no instant is given', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-12T01:40:00Z'));
        expect(hasHappenedUtc(day('2026-10-12'))).toBe(true);
        expect(hasHappenedUtc(day('2026-10-13'))).toBe(false);
    });
});

describe('clampToTodayUtc', () => {
    const now = Date.parse('2026-10-12T01:40:00Z');

    it('leaves a past end date alone and cuts a future one back to today', () => {
        expect(clampToTodayUtc(day('2019-12-31'), now)).toBe(day('2019-12-31'));
        expect(clampToTodayUtc(day('2026-10-12'), now)).toBe(day('2026-10-12'));
        expect(clampToTodayUtc(day('2027-10-11'), now)).toBe(day('2026-10-12'));
    });

    it('always returns a UTC midnight', () => {
        expect(clampToTodayUtc(Date.parse('2019-12-31T18:00:00Z'), now)).toBe(day('2019-12-31'));
    });

    it('passes an invalid date through as NaN', () => {
        expect(clampToTodayUtc(NaN, now)).toBeNaN();
    });
});

// ── Display ───────────────────────────────────────────────────────────────────

describe('formatUtc', () => {
    const lateEvening = Date.parse('2026-01-31T23:30:00Z');

    it('formats in UTC in every style', () => {
        expect(formatUtc(lateEvening, 'monthDay')).toBe('Jan 31');
        expect(formatUtc(lateEvening, 'monthYear')).toBe('Jan 2026');
        expect(formatUtc(lateEvening, 'shortMonthYear')).toBe('Jan 26');
        expect(formatUtc(lateEvening, 'full')).toBe('Jan 31, 2026');
        expect(formatUtc(lateEvening, 'isoDay')).toBe('2026-01-31');
    });

    it('accepts an ISO string as well as a timestamp', () => {
        expect(formatUtc('2026-02-01T00:00:00.000Z', 'full')).toBe('Feb 1, 2026');
        expect(formatUtc('2026-02-01T00:00:00.000Z', 'isoDay')).toBe('2026-02-01');
    });

    it('round-trips with parseUtcDate', () => {
        for (const value of ['2010-08-18', '2024-02-29', '2026-12-31', '2100-12-31']) {
            expect(formatUtc(parseUtcDate(value), 'isoDay')).toBe(value);
        }
    });

    it('throws on an invalid date rather than print a blank', () => {
        // Server-rendered pages publish these strings. A loud failure at build
        // or revalidation beats "Since ." going out as copy.
        expect(() => formatUtc(NaN, 'full')).toThrow(RangeError);
    });
});
