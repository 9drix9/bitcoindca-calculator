import { describe, expect, it } from 'vitest';
import {
    MAX_POSITION_FEE_PERCENT,
    checkNewPosition,
    defaultPositionAmount,
    describePositionWindow,
    formatEnteredAmount,
    isTrackedPosition,
    positionAmountUsd,
    positionCurrency,
    positionSpan,
    type TrackedPosition,
} from './positions';
import { calculateDcaToDate, priceSeriesCovers } from '@/utils/dca';
import { DAY_MS, EARLIEST_PRICE_TS } from '@/utils/dates';
import { BTC_HISTORICAL_DAILY } from '@/data/btcHistorical';

/** UTC midnight of an ISO day, for readable fixtures. */
const day = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

const TODAY = day('2026-10-11');

const position = (over: Partial<TrackedPosition> = {}): TrackedPosition => ({
    id: 'abc1234',
    label: 'Weekly DCA',
    startDate: '2024-01-01',
    endDate: '2026-10-11',
    amount: 50,
    frequency: 'weekly',
    feePercentage: 0.5,
    ...over,
});

/** One flat-priced row per day from the first day of data to TODAY. */
const flatSeries = (price: number): [number, number][] => {
    const rows: [number, number][] = [];
    for (let ts = EARLIEST_PRICE_TS; ts <= TODAY; ts += DAY_MS) rows.push([ts, price]);
    return rows;
};

/** A position run the way the tracker runs it: converted to USD, cut off at today. */
const run = (pos: TrackedPosition, unitsPerUsd: number, series: [number, number][], now: number = TODAY) => {
    const window = describePositionWindow(pos, now);
    return calculateDcaToDate(
        {
            amount: positionAmountUsd(pos, unitsPerUsd),
            frequency: pos.frequency,
            startDate: new Date(window.startTs),
            endDate: new Date(window.endTs),
            feePercentage: pos.feePercentage,
            priceMode: 'api',
            manualPrice: 0,
        },
        series,
        60_000,
        now,
    );
};

// ── Storage ───────────────────────────────────────────────────────────────────

describe('isTrackedPosition', () => {
    it('accepts a position saved before the currency was stored, and reads it as USD', () => {
        const legacy = position();
        expect(isTrackedPosition(legacy)).toBe(true);
        expect(positionCurrency(legacy)).toBe('USD');
    });

    it('accepts every supported currency and nothing else', () => {
        expect(isTrackedPosition(position({ currency: 'JPY' }))).toBe(true);
        expect(isTrackedPosition({ ...position(), currency: 'XYZ' })).toBe(false);
        expect(isTrackedPosition({ ...position(), currency: 42 })).toBe(false);
    });

    it('rejects a cadence the engine has no schedule for', () => {
        // nextPurchaseTs has no branch for it, so the run would never reach its end date.
        expect(isTrackedPosition({ ...position(), frequency: 'hourly' })).toBe(false);
    });

    it('rejects amounts that cannot be a purchase', () => {
        for (const amount of [0, -50, NaN, Infinity, '50', null]) {
            expect(isTrackedPosition({ ...position(), amount })).toBe(false);
        }
    });

    it('rejects anything that is not a position at all', () => {
        for (const value of [null, undefined, 'x', 7, [], { id: 'only' }]) {
            expect(isTrackedPosition(value)).toBe(false);
        }
    });
});

// ── Amounts must not drift ────────────────────────────────────────────────────

describe('amounts entered in another currency', () => {
    const series = flatSeries(50_000);
    const euros = position({ amount: 100, currency: 'EUR', startDate: '2023-01-02', endDate: '2023-12-25', feePercentage: 0 });

    it('show the same amount invested whatever the exchange rate does afterwards', () => {
        // Saved as typed. The old tracker stored amount / rate-at-save-time and
        // multiplied by the rate on each later visit: EUR 100 x 52 saved at 0.92
        // read EUR 5,043.89 once the rate was 0.89238.
        for (const rate of [0.92, 0.89238, 1.05]) {
            const result = run(euros, rate, series);
            expect(result.breakdown).toHaveLength(52);
            expect(result.totalInvested * rate).toBeCloseTo(5_200, 6);
        }
    });

    it('still depend on the rate for the bitcoin bought, which is why the tracker labels it approximate', () => {
        const strongEuro = run(euros, 0.85, series);
        const weakEuro = run(euros, 0.95, series);
        expect(strongEuro.btcAccumulated).toBeGreaterThan(weakEuro.btcAccumulated);
    });

    it('are exact for USD', () => {
        const dollars = position({ amount: 100, currency: 'USD', startDate: '2023-01-02', endDate: '2023-12-25', feePercentage: 0 });
        const result = run(dollars, 1, series);
        expect(result.totalInvested).toBe(5_200);
        expect(result.btcAccumulated).toBeCloseTo(5_200 / 50_000, 12);
    });

    it('fall back to the amount as stored when the rate is unusable', () => {
        expect(positionAmountUsd(euros, 0)).toBe(100);
        expect(positionAmountUsd(euros, NaN)).toBe(100);
    });
});

describe('formatEnteredAmount', () => {
    it('prints the stored amount in its own currency', () => {
        expect(formatEnteredAmount(position({ amount: 100, currency: 'EUR' }))).toBe('€100');
        expect(formatEnteredAmount(position({ amount: 7900, currency: 'JPY' }))).toBe('¥7,900');
        // A legacy row: USD, with the odd figure the old conversion left behind.
        expect(formatEnteredAmount(position({ amount: 108.69565217391303 }))).toBe('$108.7');
    });
});

describe('defaultPositionAmount', () => {
    it('is $50 in USD and a comparable round figure elsewhere', () => {
        expect(defaultPositionAmount(1)).toBe(50);
        expect(defaultPositionAmount(0.89238)).toBe(45);
        // Not 50 yen, which is about 32 cents.
        expect(defaultPositionAmount(158.25)).toBe(7_900);
    });
});

// ── What is counted ───────────────────────────────────────────────────────────

describe('describePositionWindow', () => {
    it('flags a plan that runs past today', () => {
        const window = describePositionWindow(position({ endDate: '2028-01-01' }), TODAY);
        expect(window).toMatchObject({ valid: true, endsInFuture: true, notStarted: false });
    });

    it('does not flag a plan that ends today', () => {
        expect(describePositionWindow(position(), TODAY).endsInFuture).toBe(false);
    });

    it('goes by the UTC day, whatever time of day it is', () => {
        const lateEvening = TODAY + 23 * 3_600_000;
        expect(describePositionWindow(position(), lateEvening).endsInFuture).toBe(false);
        expect(describePositionWindow(position({ endDate: '2026-10-12' }), lateEvening).endsInFuture).toBe(true);
    });

    it('flags a plan that has not started', () => {
        const window = describePositionWindow(position({ startDate: '2027-01-04', endDate: '2027-12-27' }), TODAY);
        expect(window).toMatchObject({ valid: true, notStarted: true, endsInFuture: true });
    });

    it('flags a start before the first day of price data', () => {
        const partly = describePositionWindow(position({ startDate: '2009-01-05', endDate: '2012-12-31' }), TODAY);
        expect(partly).toMatchObject({ startsBeforeData: true, endsBeforeData: false });
        const wholly = describePositionWindow(position({ startDate: '2009-01-05', endDate: '2009-12-28' }), TODAY);
        expect(wholly).toMatchObject({ startsBeforeData: true, endsBeforeData: true });
    });

    it('does not flag a start on the first day of price data', () => {
        expect(describePositionWindow(position({ startDate: '2010-08-18' }), TODAY).startsBeforeData).toBe(false);
    });

    it('is invalid for unreadable or inverted dates, and flags nothing else then', () => {
        for (const over of [{ startDate: 'soon' }, { endDate: '20300-01-01' }, { startDate: '2025-01-01', endDate: '2024-01-01' }]) {
            const window = describePositionWindow(position(over), TODAY);
            expect(window).toMatchObject({
                valid: false, endsInFuture: false, notStarted: false, startsBeforeData: false, endsBeforeData: false,
            });
        }
    });
});

describe('a position with a future end date', () => {
    const series = flatSeries(50_000);

    it('counts exactly the buys a plan ending today would, not the ones still to come', () => {
        const ended = run(position({ startDate: '2024-01-01', endDate: '2026-10-11', feePercentage: 0 }), 1, series);
        const running = run(position({ startDate: '2024-01-01', endDate: '2028-01-01', feePercentage: 0 }), 1, series);
        // 2024-01-01 is a Monday; the last Monday on or before 2026-10-11 is 2026-10-05.
        expect(ended.breakdown).toHaveLength(145);
        expect(running.breakdown).toHaveLength(145);
        expect(running.totalInvested).toBe(7_250);
        expect(running.breakdown[running.breakdown.length - 1].date.slice(0, 10)).toBe('2026-10-05');
        expect(running.endsInFuture).toBe(true);
    });

    it('grows by itself as buys come due', () => {
        const pos = position({ startDate: '2024-01-01', endDate: '2028-01-01', feePercentage: 0 });
        const longer = flatSeries(50_000);
        longer.push([TODAY + DAY_MS, 50_000]);
        const nextDay = run(pos, 1, longer, TODAY + DAY_MS); // Monday 2026-10-12
        expect(nextDay.breakdown).toHaveLength(146);
    });

    it('counts nothing for a plan that has not started', () => {
        const result = run(position({ startDate: '2027-01-04', endDate: '2027-12-27' }), 1, series);
        expect(result.breakdown).toHaveLength(0);
        expect(result.totalInvested).toBe(0);
        expect(result.notStarted).toBe(true);
    });
});

describe('a position that starts before the price data', () => {
    // The real 2010-2015 rows, so the first priced day is the real one.
    const series = BTC_HISTORICAL_DAILY;

    it('counts only the buys that have a price, which is why the row carries a note', () => {
        const pos = position({ startDate: '2009-01-03', endDate: '2010-12-31', feePercentage: 0 });
        const result = run(pos, 1, series);
        // Weekly from Saturday 2009-01-03: the first Saturday with a price is 2010-08-21.
        expect(result.breakdown[0].date.slice(0, 10)).toBe('2010-08-21');
        expect(result.breakdown).toHaveLength(19);
        expect(result.totalInvested).toBe(950);
        expect(describePositionWindow(pos, TODAY).startsBeforeData).toBe(true);
    });

    it('counts nothing when the whole plan predates the data', () => {
        const pos = position({ startDate: '2009-01-05', endDate: '2009-12-28' });
        expect(run(pos, 1, series).totalInvested).toBe(0);
        expect(describePositionWindow(pos, TODAY).endsBeforeData).toBe(true);
    });
});

// ── Whether the prices on the page are enough ─────────────────────────────────

describe('positionSpan', () => {
    it('runs from the earliest start to the latest end', () => {
        const span = positionSpan([
            position({ startDate: '2021-03-01', endDate: '2022-03-01' }),
            position({ startDate: '2019-06-03', endDate: '2020-06-01' }),
        ], TODAY);
        expect(span).toEqual({ min: day('2019-06-03'), max: day('2022-03-01') });
    });

    it('is cut to the days that can be priced', () => {
        const span = positionSpan([position({ startDate: '2009-01-05', endDate: '2030-01-01' })], TODAY);
        expect(span).toEqual({ min: EARLIEST_PRICE_TS, max: TODAY });
    });

    it('ignores positions with nothing to price', () => {
        expect(positionSpan([], TODAY)).toBeNull();
        expect(positionSpan([
            position({ startDate: 'bad' }),
            position({ startDate: '2027-01-04', endDate: '2027-12-27' }),
            position({ startDate: '2009-01-05', endDate: '2009-12-28' }),
        ], TODAY)).toBeNull();
    });

    it('lets the tracker refuse a window that stops short of a position', () => {
        // A calculator window of 2017-2019 used to price a 2021 position at the
        // last 2019 close. The tracker only uses a series that covers the span.
        const calculatorWindow: [number, number][] = [];
        for (let ts = day('2017-01-01'); ts <= day('2019-12-31'); ts += DAY_MS) calculatorWindow.push([ts, 7_000]);
        const span = positionSpan([position({ startDate: '2021-01-04', endDate: '2021-12-27' })], TODAY)!;
        expect(priceSeriesCovers(calculatorWindow, span.min, span.max)).toBe(false);
        expect(priceSeriesCovers(flatSeries(7_000), span.min, span.max)).toBe(true);
    });
});

// ── The add-plan form ─────────────────────────────────────────────────────────

describe('checkNewPosition', () => {
    const form = (over: Partial<{ label: string; startDate: string; endDate: string; amount: string; fee: string }> = {}) => ({
        label: 'Weekly DCA 2024',
        startDate: '2024-01-01',
        endDate: '2024-12-30',
        amount: '50',
        ...over,
    });

    it('accepts a complete, sensible plan', () => {
        expect(checkNewPosition(form(), TODAY).canAdd).toBe(true);
    });

    it('accepts a future end date, which is how a plan still running is entered', () => {
        const check = checkNewPosition(form({ endDate: '2028-01-01' }), TODAY);
        expect(check).toMatchObject({ canAdd: true, endOutOfRange: false });
    });

    it('rejects a start before the price data, and does not move it', () => {
        const check = checkNewPosition(form({ startDate: '2009-01-03' }), TODAY);
        expect(check).toMatchObject({ canAdd: false, startBeforeData: true });
        expect(checkNewPosition(form({ startDate: '2010-08-18' }), TODAY).startBeforeData).toBe(false);
    });

    it('rejects a start after today', () => {
        const check = checkNewPosition(form({ startDate: '2026-10-12', endDate: '2027-10-12' }), TODAY);
        expect(check).toMatchObject({ canAdd: false, startInFuture: true });
        expect(checkNewPosition(form({ startDate: '2026-10-11', endDate: '2027-10-12' }), TODAY).canAdd).toBe(true);
    });

    it('rejects an end before the start', () => {
        expect(checkNewPosition(form({ endDate: '2023-12-31' }), TODAY)).toMatchObject({ canAdd: false, datesInverted: true });
    });

    it('rejects dates a browser can hand over but the engine cannot use', () => {
        // A typed five-digit year sorts before 2100 as a string; parsed, it is NaN.
        expect(checkNewPosition(form({ endDate: '20300-01-01' }), TODAY)).toMatchObject({ canAdd: false, endOutOfRange: true });
        expect(checkNewPosition(form({ endDate: '2101-01-01' }), TODAY)).toMatchObject({ canAdd: false, endOutOfRange: true });
        expect(checkNewPosition(form({ startDate: '20200-01-01' }), TODAY)).toMatchObject({ canAdd: false, startBeforeData: true });
    });

    it('rejects an amount that is not more than zero, without nagging about an empty field', () => {
        expect(checkNewPosition(form({ amount: '0' }), TODAY)).toMatchObject({ canAdd: false, amountInvalid: true });
        expect(checkNewPosition(form({ amount: '-5' }), TODAY)).toMatchObject({ canAdd: false, amountInvalid: true });
        expect(checkNewPosition(form({ amount: '' }), TODAY)).toMatchObject({ canAdd: false, amountInvalid: false });
    });

    it('needs every field before a plan can be added, and shows no error for the blanks', () => {
        for (const over of [{ label: '  ' }, { startDate: '' }, { endDate: '' }]) {
            const check = checkNewPosition(form(over), TODAY);
            expect(check.canAdd).toBe(false);
            expect(check).toMatchObject({
                datesInverted: false, startBeforeData: false, startInFuture: false, endOutOfRange: false,
            });
        }
    });

    it('names the fields still empty, in the order the form shows them', () => {
        expect(checkNewPosition(form(), TODAY).missing).toEqual([]);
        expect(checkNewPosition(form({ label: '  ' }), TODAY).missing).toEqual(['label']);
        expect(checkNewPosition(form({ amount: '' }), TODAY).missing).toEqual(['amount']);
        expect(checkNewPosition(form({ startDate: '' }), TODAY).missing).toEqual(['startDate']);
        expect(checkNewPosition(form({ endDate: '' }), TODAY).missing).toEqual(['endDate']);
        // The form as it opens: the amount is pre-filled, the rest is blank.
        expect(checkNewPosition(form({ label: '', startDate: '', endDate: '' }), TODAY).missing)
            .toEqual(['label', 'startDate', 'endDate']);
    });

    it('does not call a wrong value missing', () => {
        expect(checkNewPosition(form({ amount: '0' }), TODAY)).toMatchObject({ missing: [], amountInvalid: true, canAdd: false });
        expect(checkNewPosition(form({ endDate: '2023-12-31' }), TODAY)).toMatchObject({ missing: [], canAdd: false });
    });

    it('refuses a fee outside 0 to 50%, and reads a blank fee as no fee', () => {
        for (const fee of ['0', '0.5', '50', '']) {
            expect(checkNewPosition(form({ fee }), TODAY), fee).toMatchObject({ canAdd: true, feeInvalid: false });
        }
        for (const fee of ['80', '50.1', '-1', 'abc']) {
            expect(checkNewPosition(form({ fee }), TODAY), fee).toMatchObject({ canAdd: false, feeInvalid: true });
        }
        // A caller that has no fee field is not asked for one.
        expect(checkNewPosition(form(), TODAY).feeInvalid).toBe(false);
        expect(MAX_POSITION_FEE_PERCENT).toBe(50);
    });
});
