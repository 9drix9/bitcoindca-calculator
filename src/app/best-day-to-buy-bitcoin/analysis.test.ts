import { describe, expect, it } from 'vitest';
import { DAY_MS } from '@/utils/dates';
import { FIRST_EXCHANGE_CLOSE_TS } from '@/data/priceSources';
import {
    WEEKLY_AMOUNT,
    analyseBestDay,
    largestRankMove,
    sevenPlans,
    sevenPlansWithoutSpike,
    shuffleWeekdays,
    weekdayAgainstItsWeek,
    type MeasuredDay,
    type SevenPlans,
} from './analysis';

const SUNDAY = 0;
const MONDAY = 1;
const TUESDAY = 2;

/** One price per consecutive UTC day from `fromTs`. */
const daily = (fromTs: number, days: number, price: (i: number, ts: number) => number): [number, number][] =>
    Array.from({ length: days }, (_, i): [number, number] => [fromTs + i * DAY_MS, price(i, fromTs + i * DAY_MS)]);

const daysBetween = (fromTs: number, toTs: number): number => Math.round((toTs - fromTs) / DAY_MS) + 1;

/** Repeatable noise in [0, 1): the same series on every run. */
const seeded = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
};

const LAST_CLOSE = Date.UTC(2026, 9, 11);
const EXCHANGE_DAYS = daysBetween(FIRST_EXCHANGE_CLOSE_TS, LAST_CLOSE);

/** A price that climbs by the same fraction every day: it has a trend and no weekday in it at all. */
const steadyClimb = daily(FIRST_EXCHANGE_CLOSE_TS, EXCHANGE_DAYS, (i) => 250 * 1.0014 ** i);

/** Noise of a few percent a day around a flat price, with no weekday in it either. */
const noisy = (() => {
    const random = seeded(7);
    return daily(FIRST_EXCHANGE_CLOSE_TS, EXCHANGE_DAYS, () => 1000 * (0.96 + 0.08 * random()));
})();

/**
 * A random walk with daily moves of about 3.5%, the size of Bitcoin's own since
 * 2015, and no weekday in it. Unlike `noisy` its swings carry over from one
 * day to the next, which is what real prices do.
 */
const randomWalk = (() => {
    const random = seeded(2015);
    let log = Math.log(1000);
    return daily(FIRST_EXCHANGE_CLOSE_TS, EXCHANGE_DAYS, () => {
        log += 0.035 * Math.sqrt(12) * (random() - 0.5);
        return Math.exp(log);
    });
})();

/** The same noise, with every Tuesday close 2% lower: a real weekday effect of known size. */
const cheapTuesdays = noisy.map(([ts, price]): [number, number] => [
    ts,
    new Date(ts).getUTCDay() === TUESDAY ? price * 0.98 : price,
]);

describe('sevenPlans', () => {
    it('puts the same money into every plan, one purchase a week', () => {
        const plans = sevenPlans(FIRST_EXCHANGE_CLOSE_TS, steadyClimb)!;
        expect(plans.purchases).toBe(Math.floor((EXCHANGE_DAYS - 1 - 6) / 7) + 1);
        expect(plans.invested).toBe(plans.purchases * WEEKLY_AMOUNT);
        expect(plans.firstBuyTs).toBe(FIRST_EXCHANGE_CLOSE_TS);
        // Seven weekdays, seven consecutive start days, each on its own weekday.
        expect(plans.rows.map((row) => new Date(row.startTs).getUTCDay())).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect([...plans.rows].sort((a, b) => a.startOrder - b.startOrder).map((row) => row.startTs)).toEqual(
            Array.from({ length: 7 }, (_, i) => FIRST_EXCHANGE_CLOSE_TS + i * DAY_MS),
        );
        expect(plans.lastBuyTs).toBe(FIRST_EXCHANGE_CLOSE_TS + 6 * DAY_MS + (plans.purchases - 1) * 7 * DAY_MS);
    });

    it('ranks the plans in the order they started when the price only climbs', () => {
        // The comparison the page is named after cannot tell a weekday from a
        // start date: on a series with no weekday in it, whoever starts first
        // wins and whoever starts last loses, every time.
        const plans = sevenPlans(FIRST_EXCHANGE_CLOSE_TS, steadyClimb)!;
        expect(plans.ranksInStartOrder).toBe(7);
        expect(plans.bestName).toBe('Monday'); // 2015-07-20 is a Monday
        expect(plans.worstName).toBe('Sunday');
        expect(plans.spreadPercent).toBeGreaterThan(0.5);

        // Start one day later and the "best weekday" becomes the worst.
        const later = sevenPlans(FIRST_EXCHANGE_CLOSE_TS + DAY_MS, steadyClimb)!;
        expect(later.bestName).toBe('Tuesday');
        expect(later.worstName).toBe('Monday');
        expect(largestRankMove(plans, later)).toEqual({ name: 'Monday', from: 1, to: 7 });
    });

    it('values every plan at the last close, whenever it is run', () => {
        const plans = sevenPlans(FIRST_EXCHANGE_CLOSE_TS, steadyClimb)!;
        const lastClose = steadyClimb[steadyClimb.length - 1][1];
        for (const row of plans.rows) expect(row.finalValue).toBeCloseTo(row.btc * lastClose, 6);
        expect(sevenPlans(FIRST_EXCHANGE_CLOSE_TS, steadyClimb)).toEqual(plans);
    });

    it('measures how much of each plan its opening purchases bought', () => {
        // Ten weeks at ten cents, then $1,000: the shape of the real 2010 start.
        const start = Date.UTC(2010, 7, 18); // a Wednesday
        const closes = daily(start, 400, (i) => (i < 70 ? 0.1 : 1000));
        const plans = sevenPlans(start, closes)!;
        expect(plans.purchases).toBe(57);

        const openingBtc = 10 * (WEEKLY_AMOUNT / 0.1);
        const laterBtc = 47 * (WEEKLY_AMOUNT / 1000);
        expect(plans.opening.buys).toBe(10);
        expect(plans.opening.sharePercent).toBeCloseTo((openingBtc / (openingBtc + laterBtc)) * 100, 6);
        // The plan that starts last (day 6) makes its tenth buy nine weeks later.
        expect(plans.opening.endTs).toBe(start + (6 + 9 * 7) * DAY_MS);
        expect(plans.opening.minPrice).toBe(0.1);
        expect(plans.opening.maxPrice).toBe(0.1);
        expect(plans.opening.wholeCents).toBe(true);

        const withOpeningAt = (price: number): number =>
            ((10 * (WEEKLY_AMOUNT / price) + laterBtc) / (openingBtc + laterBtc) - 1) * 100;
        expect(plans.opening.centHigherPercent).toBeCloseTo(withOpeningAt(0.11), 6);
        expect(plans.opening.centLowerPercent).toBeCloseTo(withOpeningAt(0.09), 6);

        // Every purchase predates the first exchange close.
        expect(plans.beforeExchangePercent).toBeCloseTo(100, 6);
        expect(sevenPlans(FIRST_EXCHANGE_CLOSE_TS, steadyClimb)!.beforeExchangePercent).toBe(0);
    });

    it('does not report a cent lower than a one-cent price, or call fractional prices whole cents', () => {
        const start = Date.UTC(2010, 7, 18);
        const pennies = sevenPlans(start, daily(start, 400, () => 0.01))!;
        expect(pennies.opening.centLowerPercent).toBeNull();
        const fractions = sevenPlans(start, daily(start, 400, () => 0.0495))!;
        expect(fractions.opening.wholeCents).toBe(false);
    });

    it('refuses a window too short to compare, or with no prices at all', () => {
        expect(sevenPlans(FIRST_EXCHANGE_CLOSE_TS, steadyClimb.slice(0, 150))).toBeNull(); // under 26 buys each
        expect(sevenPlans(FIRST_EXCHANGE_CLOSE_TS, [])).toBeNull();
        expect(sevenPlans(FIRST_EXCHANGE_CLOSE_TS, steadyClimb.slice(0, 200))).not.toBeNull();
    });
});

describe('largestRankMove', () => {
    const run = (ranks: number[]): SevenPlans =>
        ({
            rows: ranks.map((rank, weekday) => ({ weekday, name: `day${weekday}`, rank, startOrder: weekday + 1 })),
        }) as unknown as SevenPlans;

    it('names the plan whose place changed most', () => {
        expect(largestRankMove(run([1, 2, 3, 4, 5, 6, 7]), run([7, 1, 2, 3, 4, 5, 6]))).toEqual({
            name: 'day0',
            from: 1,
            to: 7,
        });
    });

    it('prefers the plan that started first when two moved equally', () => {
        expect(largestRankMove(run([1, 2, 3, 4, 5, 6, 7]), run([2, 1, 3, 4, 5, 6, 7]))).toEqual({
            name: 'day0',
            from: 1,
            to: 2,
        });
    });

    it('returns null when nothing moved', () => {
        expect(largestRankMove(run([1, 2, 3, 4, 5, 6, 7]), run([1, 2, 3, 4, 5, 6, 7]))).toBeNull();
    });
});

describe('sevenPlansWithoutSpike', () => {
    const start = Date.UTC(2010, 7, 18); // a Wednesday
    const WEDNESDAY_SPIKE = Date.UTC(2010, 8, 15);
    const THURSDAY_SPIKE = Date.UTC(2010, 8, 16);
    /** Six cents for twenty weeks, then $1,000, with the given prices on the two days. */
    const early = (wednesday: number, thursday: number): [number, number][] =>
        daily(start, 400, (i, ts) =>
            ts === WEDNESDAY_SPIKE ? wednesday : ts === THURSDAY_SPIKE ? thursday : i < 140 ? 0.06 : 1000,
        );

    it('prices the two days like the days either side and runs the seven plans again', () => {
        const asPublished = early(0.09, 0.15);
        // Each is the fifth purchase of one plan, and it bought less than the other six plans' fifth did.
        const plain = sevenPlans(start, asPublished)!;
        expect(plain.worstName).toBe('Thursday');
        expect(plain.spreadPercent).toBeGreaterThan(1);

        const level = sevenPlans(start, early(0.06, 0.06))!;
        expect(sevenPlansWithoutSpike(start, asPublished)).toEqual({
            days: [
                { ts: WEDNESDAY_SPIKE, price: 0.09 },
                { ts: THURSDAY_SPIKE, price: 0.15 },
            ],
            neighbourPrice: 0.06,
            bestName: level.bestName,
            worstName: level.worstName,
            spreadPercent: level.spreadPercent,
        });
        // Twenty buys at six cents each, whichever day a plan started on.
        expect(level.spreadPercent).toBeCloseTo(0, 9);
    });

    it('has nothing to report when the two days do not stand out or are not in the series', () => {
        expect(sevenPlansWithoutSpike(start, early(0.06, 0.06))).toBeNull();
        expect(sevenPlansWithoutSpike(FIRST_EXCHANGE_CLOSE_TS, steadyClimb)).toBeNull();
        // A series that opens on the first of them has no day before it to read a price from.
        const fromSpike = early(0.09, 0.15).filter(([ts]) => ts >= WEDNESDAY_SPIKE);
        expect(sevenPlansWithoutSpike(WEDNESDAY_SPIKE, fromSpike)).toBeNull();
    });

    it('does not guess a price when the days either side disagree', () => {
        const climbing = early(0.09, 0.15).map(([ts, price]): [number, number] => [
            ts,
            ts === THURSDAY_SPIKE + DAY_MS ? 0.07 : price,
        ]);
        expect(sevenPlansWithoutSpike(start, climbing)).toBeNull();
    });
});

describe('weekdayAgainstItsWeek', () => {
    it('finds nothing on a price that only climbs, where the seven plans found a ranking', () => {
        const test = weekdayAgainstItsWeek(steadyClimb, FIRST_EXCHANGE_CLOSE_TS)!;
        // Every day sits in the same place relative to the week centred on it.
        for (const row of test.rows) expect(Math.abs(row.edgePercent)).toBeLessThan(0.001);
        expect(test.gapPercent).toBeCloseTo(0, 9);
        expect(test.typicalDayPercent).toBeLessThan(0.001);
    });

    it('scores a day with nothing special about it at zero, on prices that wander', () => {
        // Measured as dollars spread over the week, every day of this walk
        // would sit about 0.035 below zero, whatever its weekday.
        const test = weekdayAgainstItsWeek(randomWalk, FIRST_EXCHANGE_CLOSE_TS)!;
        const days = test.rows.reduce((sum, row) => sum + row.weeks, 0);
        const meanOfAllDays = test.rows.reduce((sum, row) => sum + row.edgePercent * row.weeks, 0) / days;
        expect(Math.abs(meanOfAllDays)).toBeLessThan(0.01);
    });

    it('measures only days whose centred week lies inside the window', () => {
        const test = weekdayAgainstItsWeek(noisy, FIRST_EXCHANGE_CLOSE_TS)!;
        expect(test.fromTs).toBe(FIRST_EXCHANGE_CLOSE_TS + 3 * DAY_MS);
        expect(test.toTs).toBe(LAST_CLOSE - 3 * DAY_MS);
        expect(test.rows.reduce((sum, row) => sum + row.weeks, 0)).toBe(EXCHANGE_DAYS - 6);
        expect(test.weeks).toBe(Math.floor((EXCHANGE_DAYS - 6) / 7));
        expect(test.rows.map((row) => row.name)).toEqual([
            'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
        ]);
    });

    it('leaves out the rows before the window: they are not exchange closes', () => {
        // Two years of wildly different prices ahead of the window change nothing.
        const before = daily(FIRST_EXCHANGE_CLOSE_TS - 730 * DAY_MS, 730, (i) => (i % 7 === 0 ? 1 : 5000));
        expect(weekdayAgainstItsWeek([...before, ...noisy], FIRST_EXCHANGE_CLOSE_TS)).toEqual(
            weekdayAgainstItsWeek(noisy, FIRST_EXCHANGE_CLOSE_TS),
        );
    });

    it('recovers a real weekday effect of known size', () => {
        const test = weekdayAgainstItsWeek(cheapTuesdays, FIRST_EXCHANGE_CLOSE_TS)!;
        expect(test.best.weekday).toBe(TUESDAY);
        // A close 2% lower sits ln(1/0.98) under the other six; against a week
        // that holds one such day in seven that is about +1.73.
        const expected = (6 / 7) * Math.log(1 / 0.98) * 100;
        expect(test.best.edgePercent).toBeGreaterThan(expected - 0.2);
        expect(test.best.edgePercent).toBeLessThan(expected + 0.2);
        expect(test.beyondMargin.map((row) => row.weekday)).toContain(TUESDAY);
        // It shows up in every calendar year, and no random deal reproduces it.
        expect(test.best.yearsAhead).toBe(test.best.yearsCounted);
        expect(test.lopsided.map((row) => row.weekday)).toContain(TUESDAY);
        expect(test.shuffle.gapAtLeastPercent).toBe(0);
    });

    it('does not mistake noise for an effect', () => {
        const test = weekdayAgainstItsWeek(noisy, FIRST_EXCHANGE_CLOSE_TS)!;
        expect(test.gapPercent).toBeLessThan(0.5);
        expect(test.widestMarginPercent).toBeGreaterThan(0.1);
        // Random labels do at least as "well" as the real ones a good share of the time.
        expect(test.shuffle.deals).toBe(2000);
        expect(test.shuffle.gapAtLeastPercent).toBeGreaterThan(5);
    });

    it('gives the same shares every time for the same closes', () => {
        expect(weekdayAgainstItsWeek(noisy, FIRST_EXCHANGE_CLOSE_TS)).toEqual(
            weekdayAgainstItsWeek(noisy, FIRST_EXCHANGE_CLOSE_TS),
        );
    });

    it('counts a calendar year only when every one of its days was measured', () => {
        // Measured days run 2015-07-23 to 2026-10-08: 2015 and 2026 are partial.
        const test = weekdayAgainstItsWeek(noisy, FIRST_EXCHANGE_CLOSE_TS)!;
        expect(test.years).toEqual({ first: 2016, last: 2025, count: 10 });
        for (const row of test.rows) expect(row.yearsCounted).toBe(10);

        // Closes to 2026-01-03 measure up to 2025-12-31, so 2025 is whole.
        const toYearEnd = noisy.filter(([ts]) => ts <= Date.UTC(2026, 0, 3));
        expect(weekdayAgainstItsWeek(toYearEnd, FIRST_EXCHANGE_CLOSE_TS)!.years).toEqual({ first: 2016, last: 2025, count: 10 });
        // One day fewer and the last day measured is Dec 30: 2025 no longer counts.
        expect(weekdayAgainstItsWeek(toYearEnd.slice(0, -1), FIRST_EXCHANGE_CLOSE_TS)!.years).toEqual({
            first: 2016,
            last: 2024,
            count: 9,
        });
        // A window that opens on Dec 29 measures from Jan 1, so that year is whole too.
        expect(weekdayAgainstItsWeek(noisy, Date.UTC(2017, 11, 29))!.years?.first).toBe(2018);
    });

    it('needs two years of weeks', () => {
        expect(weekdayAgainstItsWeek(noisy.slice(0, 104 * 7 + 5), FIRST_EXCHANGE_CLOSE_TS)).toBeNull();
        expect(weekdayAgainstItsWeek(noisy.slice(0, 104 * 7 + 6), FIRST_EXCHANGE_CLOSE_TS)).not.toBeNull();
        expect(weekdayAgainstItsWeek(noisy, LAST_CLOSE + DAY_MS)).toBeNull();
    });
});

describe('shuffleWeekdays', () => {
    /** `weeks` runs of seven days starting on a Sunday, one year, with the given edge per day. */
    const measured = (weeks: number, edge: (weekday: number, week: number) => number): MeasuredDay[] =>
        Array.from({ length: weeks * 7 }, (_, i) => ({
            weekday: i % 7,
            yearIndex: Math.floor(i / 7 / 52),
            edge: edge(i % 7, Math.floor(i / 7)),
        }));

    it('never matches a gap that every week agrees on', () => {
        // Monday ahead of its week every single week; the figures of a week sum to zero.
        const check = shuffleWeekdays(measured(520, (weekday) => (weekday === MONDAY ? 6 : -1)), 10, 500);
        expect(check).toEqual({ deals: 500, gapAtLeastPercent: 0, lopsidedAtLeastPercent: 0 });
    });

    it('always matches a table with no gap in it, and calls a year that came out level neither side', () => {
        const check = shuffleWeekdays(measured(520, () => 0), 10, 200);
        expect(check.gapAtLeastPercent).toBe(100);
        expect(check.lopsidedAtLeastPercent).toBeNull(); // nothing lopsided to weigh
    });

    it('ignores a trailing run of fewer than seven days', () => {
        const whole = measured(520, (weekday, week) => ((weekday * 7 + week * 3) % 11) - 5);
        const withTail = [...whole, { weekday: SUNDAY, yearIndex: -1, edge: 1e6 }];
        expect(shuffleWeekdays(withTail, 10, 300)).toEqual(shuffleWeekdays(whole, 10, 300));
    });
});

describe('analyseBestDay', () => {
    it('runs the plans from the first day of data and the test on exchange closes only', () => {
        // Five years of bundled-style rows ahead of the exchange closes.
        const start = Date.UTC(2010, 7, 18);
        const early = daily(start, daysBetween(start, FIRST_EXCHANGE_CLOSE_TS) - 1, (i) => 0.07 * 1.005 ** i);
        const closes = [...early, ...noisy];
        const analysis = analyseBestDay(closes)!;

        expect(analysis.full.firstBuyTs).toBe(start);
        expect(analysis.exchange?.firstBuyTs).toBe(FIRST_EXCHANGE_CLOSE_TS);
        expect(analysis.test).toEqual(weekdayAgainstItsWeek(noisy, FIRST_EXCHANGE_CLOSE_TS));
        expect(analysis.lastCloseTs).toBe(LAST_CLOSE);
        expect(analysis.lastClose).toBe(noisy[noisy.length - 1][1]);
        // The early rows climb, so moving the start a day moves the first starter.
        expect(analysis.fullOneDayLater).toEqual({ name: 'Wednesday', from: 1, to: 7 });
        // They climb through September 2010 too: no two days stand out from their neighbours.
        expect(analysis.fullWithoutSpike).toBeNull();
    });

    it('returns null when there is too little history for either table', () => {
        expect(analyseBestDay([])).toBeNull();
        expect(analyseBestDay(noisy.slice(0, 300))).toBeNull();
    });
});
