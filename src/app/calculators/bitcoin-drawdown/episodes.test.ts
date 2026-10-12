import { describe, expect, it } from 'vitest';
import { DAY_MS } from '@/utils/dates';
import { findDrawdowns, listedEpisodes, maxDrawdownPercent, median, type Episode } from './episodes';

const DAY0 = Date.UTC(2020, 0, 1);
const daily = (prices: number[]): [number, number][] => prices.map((p, i) => [DAY0 + i * DAY_MS, p]);

// Day:        0    1    2   3    4   5   6    7    8   9
const SERIES = daily([100, 60, 100, 90, 120, 30, 90, 130, 100, 65]);

describe('findDrawdowns', () => {
    const episodes = findDrawdowns(SERIES, 0.3);

    it('records each fall of at least the minimum depth, and no shallower one', () => {
        // 100 to 60 (40%), 120 to 30 (75%) and 130 to 65 (50%). The 100 to 90 dip is 10%.
        expect(episodes.map((e) => Math.round(e.depthPercent))).toEqual([40, 75, 50]);
        expect(episodes.filter((e) => e.depthPercent >= 30)).toHaveLength(3);
        expect(episodes.filter((e) => e.depthPercent >= 50)).toHaveLength(2);
        expect(episodes.filter((e) => e.depthPercent >= 70)).toHaveLength(1);
    });

    it('dates the peak, the trough and the day the peak is reclaimed', () => {
        expect(episodes[1]).toEqual({
            peakTs: DAY0 + 4 * DAY_MS,
            peakPrice: 120,
            troughTs: DAY0 + 5 * DAY_MS,
            troughPrice: 30,
            depthPercent: 75,
            daysToTrough: 1,
            recoveredTs: DAY0 + 7 * DAY_MS,
            daysToRecover: 3,
        });
    });

    it('counts a return to exactly the old peak as recovered', () => {
        expect(episodes[0].recoveredTs).toBe(DAY0 + 2 * DAY_MS);
        expect(episodes[0].daysToRecover).toBe(2);
    });

    it('keeps the fall still under way, with no recovery date', () => {
        expect(episodes[2]).toMatchObject({
            peakPrice: 130,
            troughPrice: 65,
            recoveredTs: null,
            daysToRecover: null,
        });
    });

    it('ignores rows with no usable price', () => {
        const withGaps: [number, number][] = [...SERIES];
        withGaps.splice(5, 0, [DAY0 + 4.5 * DAY_MS, 0], [DAY0 + 4.6 * DAY_MS, NaN]);
        expect(findDrawdowns(withGaps, 0.3).map((e) => e.depthPercent)).toEqual(episodes.map((e) => e.depthPercent));
    });

    it('finds nothing in a series too short to fall', () => {
        expect(findDrawdowns([], 0.3)).toEqual([]);
        expect(findDrawdowns(daily([100]), 0.3)).toEqual([]);
    });
});

describe('maxDrawdownPercent', () => {
    it('is the deepest fall from a running peak', () => {
        expect(maxDrawdownPercent(SERIES)).toBe(75);
        expect(maxDrawdownPercent(daily([10, 20, 30]))).toBe(0);
        expect(maxDrawdownPercent([])).toBe(0);
    });
});

describe('median', () => {
    it('is the middle value of an odd count', () => {
        expect(median([5])).toBe(5);
        expect(median([3, 1, 2])).toBe(2);
    });

    it('is the mean of the two middle values of an even count', () => {
        expect(median([1, 2, 3, 4])).toBe(2.5);
        // Twelve recoveries: the upper-middle value alone would say 210.
        expect(median([7, 39, 90, 100, 150, 189, 210, 300, 640, 840, 1100, 1170])).toBe(199.5);
    });

    it('is null for an empty list and leaves its input in order', () => {
        expect(median([])).toBeNull();
        const values = [3, 1, 2];
        median(values);
        expect(values).toEqual([3, 1, 2]);
    });
});

describe('listedEpisodes', () => {
    const all = findDrawdowns(SERIES, 0.3);
    const depths = (rows: Episode[]) => rows.map((e) => Math.round(e.depthPercent));

    it('lists the deepest rows in date order', () => {
        expect(depths(listedEpisodes(all, 3, 70))).toEqual([40, 75, 50]);
    });

    it('adds the fall still under way when it ranks below the cut', () => {
        // One row is the 75% fall. The open 50% fall is listed as well, after it in date order.
        const rows = listedEpisodes(all, 1, 70);
        expect(depths(rows)).toEqual([75, 50]);
        expect(rows[1].recoveredTs).toBeNull();
    });

    it('does not list the open fall twice when it already made the cut', () => {
        expect(depths(listedEpisodes(all, 2, 70))).toEqual([75, 50]);
    });

    it('never drops a fall at or past the always-listed depth', () => {
        expect(depths(listedEpisodes(all, 1, 40))).toEqual([40, 75, 50]);
    });

    it('adds nothing when every fall has recovered', () => {
        const recovered = all.filter((e) => e.recoveredTs !== null);
        expect(depths(listedEpisodes(recovered, 1, 70))).toEqual([75]);
    });
});
