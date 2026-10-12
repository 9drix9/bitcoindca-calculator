import { describe, expect, it } from 'vitest';
import { DAY_MS } from '@/utils/dates';
import type { PriceHistoryResult } from '@/utils/priceSeries';
import { finishedDailyCloses, type StudyCloses } from './studyCloses';

const START = Date.UTC(2026, 9, 1);
const day = (n: number): number => START + n * DAY_MS;

/** Ten daily rows, 2026-10-01 to 2026-10-10, fetched at noon on the last of them. */
function history(overrides: Partial<PriceHistoryResult> = {}): PriceHistoryResult {
    const data: [number, number][] = Array.from({ length: 10 }, (_, i) => [day(i), 100 + i]);
    return {
        data,
        kinds: 'o'.repeat(data.length),
        requestedProvider: 'coinbase',
        servedProvider: 'coinbase',
        fallback: false,
        stale: false,
        fetchedAt: day(9) + 12 * 3_600_000,
        seriesStart: data[0][0],
        seriesEnd: data[data.length - 1][0],
        ...overrides,
    };
}

const closesOf = (result: ReturnType<typeof finishedDailyCloses>): StudyCloses => {
    if ('reason' in result) throw new Error(`expected closes, got: ${result.reason}`);
    return result;
};

describe('finishedDailyCloses', () => {
    it('refuses the series the price action falls back to when Coinbase is down', () => {
        // The heatmap and lump-sum pages used to publish this as "real daily
        // closing prices": it is one close a week with straight lines between.
        const result = finishedDailyCloses(history({ servedProvider: 'kraken', fallback: true }));
        expect(result).toEqual({ reason: expect.stringContaining('kraken') });
    });

    it('leaves out the day the series was fetched on: that row is a trade, not a close', () => {
        const study = closesOf(finishedDailyCloses(history()));
        expect(study.closes).toHaveLength(9);
        expect(study.lastCloseTs).toBe(day(8));
        expect(study.lastClose).toBe(108);
    });

    it('judges "finished" by when the series was fetched, not by the clock', () => {
        // A copy fetched on the evening of Oct 8 and served two days later:
        // its Oct 8 row is the price that evening, and Oct 9 and 10 cannot be
        // in it at all. Whatever rows it carries from Oct 8 on are not closes.
        const study = closesOf(finishedDailyCloses(history({ stale: true, fetchedAt: day(7) + 20 * 3_600_000 })));
        expect(study.lastCloseTs).toBe(day(6));
        expect(study.closes).toHaveLength(7);
    });

    it('keeps every row when the series was fetched after its last day', () => {
        const study = closesOf(finishedDailyCloses(history({ fetchedAt: day(10) + 1 })));
        expect(study.closes).toHaveLength(10);
        expect(study.lastCloseTs).toBe(day(9));
    });

    it('counts the filled-in days among the rows it keeps, and only those', () => {
        //                                    0123456789
        const study = closesOf(finishedDailyCloses(history({ kinds: 'ooeeoooooe' })));
        expect(study.estimatedDays).toBe(2); // row 9 is the fetch day and is dropped
        expect(closesOf(finishedDailyCloses(history())).estimatedDays).toBe(0);
    });

    it('refuses a series that cannot say which rows are estimates', () => {
        expect(finishedDailyCloses(history({ kinds: '' }))).toHaveProperty('reason');
    });

    it('refuses a series with a missing day or an unusable price', () => {
        const gap = history();
        gap.data.splice(4, 1);
        gap.kinds = gap.kinds.slice(1);
        expect(finishedDailyCloses(gap)).toEqual({ reason: expect.stringContaining('skips a day') });

        const zero = history();
        zero.data[3] = [day(3), 0];
        expect(finishedDailyCloses(zero)).toEqual({ reason: expect.stringContaining('no usable price') });

        const nan = history();
        nan.data[3] = [day(3), Number.NaN];
        expect(finishedDailyCloses(nan)).toHaveProperty('reason');
    });

    it('refuses a series with no finished day in it', () => {
        expect(finishedDailyCloses(history({ fetchedAt: day(0) + 1 }))).toHaveProperty('reason');
        expect(finishedDailyCloses(history({ data: [], kinds: '' }))).toHaveProperty('reason');
    });
});
