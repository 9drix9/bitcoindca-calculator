import { describe, expect, it } from 'vitest';
import { FLAT_EXAMPLE_USD, feeLevels } from './feeLevels';
import { DEFAULT_PLAN } from '@/data/planDefaults';
import { feeExamplePair, type ExchangeFeeRecord } from '@/data/exchangeFees';

const day = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

const row = (id: string, terms: Partial<ExchangeFeeRecord>): ExchangeFeeRecord => ({
    id,
    name: id,
    percent: 1,
    flatUsd: 0,
    rateLabel: '1%',
    includes: 'fee',
    note: 'fee only',
    detail: 'Fixture.',
    sources: [{ label: 'Fixture', url: 'https://example.com/fees' }],
    verifiedOn: '2026-08-01',
    ...terms,
});

/** A 1% platform that ran a 0.25% offer through 2026-09-08. */
const PROMO = row('promo', {
    promo: {
        validUntil: '2026-09-08',
        terms: { percent: 0.25, flatUsd: 0, rateLabel: '0.25%', includes: 'fee', note: 'promotional rate' },
    },
});
const SPREAD = row('spread', { percent: 0.22, rateLabel: '~0.22%', includes: 'spread', note: 'spread only' });
const TWIN = row('twin', {});
const FLAT = row('flat', { percent: 0.5, flatUsd: 2.99, rateLabel: '$2.99 + 0.5%', includes: 'both', note: 'flat fee per buy plus spread' });
const UNPUBLISHED = row('unpublished', { percent: null, includes: null, rateLabel: 'Set per order', note: 'no fixed rate published' });

const REGISTRY = [PROMO, SPREAD, TWIN, FLAT, UNPUBLISHED];
const EXAMPLE = { percent: 0, flatUsd: FLAT_EXAMPLE_USD, example: true };
const percentLevel = (percent: number) => ({ percent, flatUsd: 0, example: false });
/** The default fee is whatever planDefaults says, so the expected order is worked out, not typed in. */
const ascending = (...percents: number[]): number[] => [...new Set(percents)].sort((a, b) => a - b);

describe('feeLevels', () => {
    it('lists zero, each published percentage once and the default fee, cheapest first', () => {
        // TWIN keeps 1% on the table while PROMO is on its offer.
        expect(feeLevels(day('2026-09-01'), REGISTRY)).toEqual([
            ...ascending(0, 0.22, 0.25, DEFAULT_PLAN.feePercentage, 1).map(percentLevel),
            { percent: 0.5, flatUsd: 2.99, example: false },
            EXAMPLE,
        ]);
    });

    it('drops a promotional rate the day after it ends', () => {
        const percents = (asOf: number) =>
            feeLevels(asOf, [PROMO]).filter((l) => l.flatUsd === 0).map((l) => l.percent);
        expect(percents(day('2026-09-08'))).toEqual(ascending(0, 0.25, DEFAULT_PLAN.feePercentage));
        expect(percents(day('2026-09-09'))).toEqual(ascending(0, DEFAULT_PLAN.feePercentage, 1));
    });

    it('does not repeat the default fee when a platform charges the same rate', () => {
        const sameAsDefault = row('same', { percent: DEFAULT_PLAN.feePercentage });
        const levels = feeLevels(day('2026-10-12'), [sameAsDefault]);
        expect(levels).toEqual([percentLevel(0), percentLevel(DEFAULT_PLAN.feePercentage), EXAMPLE]);
    });

    it('gives a platform with no published figure no row', () => {
        expect(feeLevels(day('2026-10-12'), [UNPUBLISHED])).toEqual([
            percentLevel(0),
            percentLevel(DEFAULT_PLAN.feePercentage),
            EXAMPLE,
        ]);
    });

    it('always has the zero-fee row the others are measured against, and one example row, last', () => {
        for (const registry of [REGISTRY, [], undefined]) {
            const levels = feeLevels(day('2026-10-12'), registry);
            expect(levels[0]).toEqual(percentLevel(0));
            expect(levels.filter((l) => l.example)).toEqual([EXAMPLE]);
            expect(levels[levels.length - 1]).toEqual(EXAMPLE);
            expect(new Set(levels.map((l) => `${l.percent}/${l.flatUsd}/${l.example}`)).size).toBe(levels.length);
        }
    });

    // The page finds the rows for its worked sentences by rate. A rate that is
    // not a row would drop those sentences back to generic copy without an error.
    it('carries both rates the page builds its worked sentences on', () => {
        const asOf = day('2026-10-12');
        const pair = feeExamplePair(asOf);
        expect(pair).not.toBeNull();
        if (!pair) return;
        const levels = feeLevels(asOf);
        expect(levels).toContainEqual(percentLevel(pair.higher.percent));
        expect(levels).toContainEqual(percentLevel(pair.lower.percent));
    });
});
