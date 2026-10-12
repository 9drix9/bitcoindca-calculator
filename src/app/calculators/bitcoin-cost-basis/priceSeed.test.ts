import { describe, expect, it } from 'vitest';
import { packDailyPrices, unpackDailyPrices } from './priceSeed';
import { calculateDca, withPriceKinds } from '@/utils/dca';
import { DAY_MS } from '@/utils/dates';
import type { PricePoint } from '@/types';

const START = Date.UTC(2024, 0, 1);

/** A daily series with a price that moves, so a shifted row would be noticed. */
const daily = (days: number): [number, number][] =>
    Array.from({ length: days }, (_, i): [number, number] => [START + i * DAY_MS, 40_000 + i * 37.5]);

describe('packDailyPrices / unpackDailyPrices', () => {
    it('gives back exactly the series it was handed', () => {
        const series = daily(400);
        const packed = packDailyPrices(series);
        expect(packed).not.toBeNull();
        expect(packed?.startTs).toBe(START);
        expect(packed?.prices).toHaveLength(400);
        expect(unpackDailyPrices(packed!)).toEqual(series);
    });

    it('carries the observed/estimated markers through', () => {
        const kinds = Array.from({ length: 30 }, (_, i) => (i % 7 === 0 ? 'o' : 'e')).join('');
        const marked = withPriceKinds(daily(30), kinds);
        const packed = packDailyPrices(marked);
        expect(packed?.kinds).toBe(kinds);
        expect(unpackDailyPrices(packed!)).toEqual(marked);
    });

    it('sends no markers for a series that has none', () => {
        const packed = packDailyPrices(daily(10));
        expect(packed).not.toHaveProperty('kinds');
    });

    it('is a fraction of the size of the pairs it replaces', () => {
        const series = daily(5_900);
        const pairs = JSON.stringify(series).length;
        const packed = JSON.stringify(packDailyPrices(series)).length;
        expect(packed).toBeLessThan(pairs / 2);
    });

    it('keeps a gap a gap instead of sliding later days into it', () => {
        const series: PricePoint[] = [
            [START, 100],
            [START + DAY_MS, 101],
            [START + 5 * DAY_MS, 105],
        ];
        const packed = packDailyPrices(series);
        expect(packed?.prices).toEqual([100, 101, 0, 0, 0, 105]);
        expect(unpackDailyPrices(packed!)).toEqual(series);
    });

    it('keeps the last row of a day that appears twice, like the price lookup does', () => {
        const packed = packDailyPrices([[START, 100], [START + 3_600_000, 110], [START + DAY_MS, 120]]);
        expect(unpackDailyPrices(packed!)).toEqual([[START, 110], [START + DAY_MS, 120]]);
    });

    it('has nothing to pack from an empty series', () => {
        expect(packDailyPrices([])).toBeNull();
    });

    it('ignores markers whose length does not match the prices', () => {
        const unpacked = unpackDailyPrices({ startTs: START, prices: [100, 101, 102], kinds: 'oe' });
        expect(unpacked).toEqual([[START, 100], [START + DAY_MS, 101], [START + 2 * DAY_MS, 102]]);
    });

    it('prices a schedule identically before and after the round trip', () => {
        const series = withPriceKinds(daily(800), 'o'.repeat(800));
        const params = {
            amount: 100,
            frequency: 'weekly' as const,
            startDate: new Date(START),
            endDate: new Date(START + 799 * DAY_MS),
            feePercentage: 0.5,
            priceMode: 'api' as const,
            manualPrice: 0,
        };
        const asOf = START + 800 * DAY_MS;
        const direct = calculateDca(params, series, 70_000, asOf);
        const roundTrip = calculateDca(params, unpackDailyPrices(packDailyPrices(series)!), 70_000, asOf);
        expect(roundTrip).toEqual(direct);
    });
});
