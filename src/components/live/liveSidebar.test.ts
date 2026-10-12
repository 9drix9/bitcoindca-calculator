import { describe, it, expect } from 'vitest';
import { LIVE_LIFETIME_SECONDS, liveFigureMaxAgeMs, type LightningStats } from '@/app/api/live/contract';
import type { PollState } from './livePoller';
import { acceptSidebar, figureView, type FigureName, type SidebarFigures } from './liveSidebar';

const T0 = Date.UTC(2026, 9, 12, 12, 0, 0);
const MINUTE = 60_000;
const DAY = 86_400_000;

const NOTHING: SidebarFigures = { figures: {}, brought: new Set() };

const fees = (highFee: number, fetchedAt: number) => ({ data: { highFee, mediumFee: 2, lowFee: 1 }, fetchedAt });
const lightning = (asOf: number, fetchedAt: number, nodeCount = 16_000): { data: LightningStats; fetchedAt: number } =>
    ({ data: { nodeCount, channelCount: 30_000, totalCapacityBtc: 3_600, asOf }, fetchedAt });
const spot = (price: number, asOf: number) => ({ price, asOf, provider: 'coinbase', fallback: false });

/** What /api/live/sidebar answers with: every figure, null unless given. */
const body = (figures: Record<string, unknown>): Record<string, unknown> => ({
    generatedAt: T0,
    mempoolFees: null, blockHeight: null, recentBlocks: null, hashRate: null, supplySats: null,
    lightning: null, dominance: null, fearGreed: null, purchasingPower: null, spot: null,
    ...figures,
});

const accept = (previous: SidebarFigures, figures: Record<string, unknown>, wanted: FigureName[] = []) =>
    acceptSidebar(previous, body(figures), wanted);

describe('acceptSidebar', () => {
    it('takes each figure with the time it was fetched, and dates the spot quote by its own asOf', () => {
        const accepted = accept(NOTHING, { mempoolFees: fees(4, T0 - 5_000), blockHeight: { data: 971_100, fetchedAt: T0 - 9_000 }, spot: spot(83_000, T0 - 20_000) });
        expect(accepted?.value.figures.mempoolFees).toEqual(fees(4, T0 - 5_000));
        expect(accepted?.value.figures.blockHeight).toEqual({ data: 971_100, fetchedAt: T0 - 9_000 });
        expect(accepted?.value.figures.spot).toEqual({ data: spot(83_000, T0 - 20_000), fetchedAt: T0 - 20_000 });
        expect([...accepted!.value.brought].sort()).toEqual(['blockHeight', 'mempoolFees', 'spot']);
    });

    it('keeps the figure a later answer lacks, and says the answer did not bring it', () => {
        const first = accept(NOTHING, { mempoolFees: fees(4, T0), blockHeight: { data: 971_100, fetchedAt: T0 } })!.value;
        const second = accept(first, { blockHeight: { data: 971_101, fetchedAt: T0 + 30_000 } })!.value;
        expect(second.figures.mempoolFees).toEqual(fees(4, T0));
        expect(second.figures.blockHeight?.data).toBe(971_101);
        expect(second.brought.has('mempoolFees')).toBe(false);
        expect(second.brought.has('blockHeight')).toBe(true);
    });

    it('never goes back to a figure fetched earlier than the one it holds', () => {
        const first = accept(NOTHING, { mempoolFees: fees(9, T0) })!.value;
        const second = accept(first, { mempoolFees: fees(4, T0 - 25_000) })!.value;
        expect(second.figures.mempoolFees).toBe(first.figures.mempoolFees);
        // The provider did answer, so the card has nothing to report.
        expect(second.brought.has('mempoolFees')).toBe(true);
    });

    it('holds on to the same object when the server fetched nothing new, so cards do not redraw', () => {
        const first = accept(NOTHING, { mempoolFees: fees(4, T0) })!.value;
        const second = accept(first, { mempoolFees: fees(4, T0) })!.value;
        expect(second.figures.mempoolFees).toBe(first.figures.mempoolFees);
    });

    it('keeps the newer Lightning day when a later fetch carries an earlier one', () => {
        const october = Date.UTC(2026, 9, 12);
        const august = Date.UTC(2026, 7, 30);
        const first = accept(NOTHING, { lightning: lightning(october, T0, 16_024) })!.value;
        const second = accept(first, { lightning: lightning(august, T0 + 10 * MINUTE, 16_230) })!.value;
        expect(second.figures.lightning).toEqual(lightning(october, T0 + 10 * MINUTE, 16_024));

        const third = accept(second, { lightning: lightning(october + DAY, T0 + 20 * MINUTE, 16_030) })!.value;
        expect(third.figures.lightning?.data.asOf).toBe(october + DAY);
    });

    it('turns down what is not a figure', () => {
        const accepted = accept(NOTHING, {
            mempoolFees: { data: { highFee: 4 } },
            blockHeight: { data: null, fetchedAt: T0 },
            fearGreed: 'greedy',
            spot: { price: 0, asOf: T0, provider: 'coinbase', fallback: false },
            dominance: { data: { dominancePercent: 58 }, fetchedAt: T0 },
        });
        expect([...accepted!.value.brought]).toEqual(['dominance']);
    });

    it('turns down a fetch time no date can hold, which would throw where a card prints it', () => {
        const accepted = accept(NOTHING, {
            mempoolFees: fees(4, Number.NaN),
            blockHeight: { data: 971_100, fetchedAt: 9e15 },
            fearGreed: { data: { value: 41, classification: 'Fear' }, fetchedAt: '2026-10-12' },
            spot: spot(83_000, Infinity),
            dominance: { data: { dominancePercent: 58 }, fetchedAt: T0 },
        });
        expect([...accepted!.value.brought]).toEqual(['dominance']);
    });

    it('is null when the answer holds no figure at all', () => {
        expect(accept(NOTHING, {})).toBeNull();
        expect(acceptSidebar(NOTHING, { generatedAt: T0 }, [])).toBeNull();
    });

    it('is complete when it brought every figure that has a card on the page', () => {
        const both = { mempoolFees: fees(4, T0), spot: spot(83_000, T0) };
        expect(accept(NOTHING, both, ['mempoolFees', 'spot'])?.complete).toBe(true);
        expect(accept(NOTHING, both, ['mempoolFees', 'purchasingPower'])?.complete).toBe(false);
        // A figure nothing on the page shows is not waited for.
        expect(accept(NOTHING, both, [])?.complete).toBe(true);
    });
});

describe('figureView', () => {
    const state = (over: Partial<PollState<SidebarFigures>> = {}): PollState<SidebarFigures> =>
        ({ value: NOTHING, settledAt: null, failures: 0, offline: false, ...over });
    const seed = { highFee: 7, mediumFee: 2, lowFee: 1 };

    it('is the page\'s own figure, unmarked, until a refresh has finished', () => {
        // Hours old: the server's HTML and the render that hydrates it still agree.
        expect(figureView('mempoolFees', state(), seed, T0 - 180 * MINUTE)).toEqual({
            data: seed, fetchedAt: T0 - 180 * MINUTE, old: false, failed: false, checkedAt: null,
        });
        expect(figureView('spot', state(), null, null)).toEqual({ data: null, fetchedAt: null, old: false, failed: false, checkedAt: null });
    });

    it('prefers what the poll brought, unless the page\'s figure was fetched later', () => {
        const polled = accept(NOTHING, { mempoolFees: fees(4, T0) })!.value;
        const after = state({ value: polled, settledAt: T0 + 1_000 });
        expect(figureView('mempoolFees', after, seed, T0 - MINUTE).data).toEqual(fees(4, T0).data);
        expect(figureView('mempoolFees', after, seed, null).data).toEqual(fees(4, T0).data);
        // A CDN copy older than freshly built HTML.
        expect(figureView('mempoolFees', after, seed, T0 + 500)).toMatchObject({ data: seed, fetchedAt: T0 + 500 });
    });

    it('marks a figure old once a refresh has finished and left it past its bound', () => {
        const bound = liveFigureMaxAgeMs(LIVE_LIFETIME_SECONDS.mempoolFees);
        expect(bound).toBe(5 * MINUTE);
        const failed = (settledAt: number) => state({ settledAt, failures: 1 });
        expect(figureView('mempoolFees', failed(T0 + bound), seed, T0)).toMatchObject({ old: false, failed: true });
        expect(figureView('mempoolFees', failed(T0 + bound + 1), seed, T0)).toMatchObject({ old: true, failed: true, fetchedAt: T0 });
    });

    it('gives a slow figure its own, longer bound', () => {
        const row = lightning(Date.UTC(2026, 9, 12), T0).data;
        const failed = (settledAt: number) => state({ settledAt, failures: 3 });
        expect(figureView('lightning', failed(T0 + 30 * MINUTE), row, T0).old).toBe(false);
        expect(figureView('lightning', failed(T0 + 30 * MINUTE + 1), row, T0).old).toBe(true);
    });

    it('marks a figure the poll brought old too, when later refreshes stop bringing it', () => {
        const polled = accept(NOTHING, { mempoolFees: fees(4, T0), blockHeight: { data: 971_100, fetchedAt: T0 } })!.value;
        const later = accept(polled, { blockHeight: { data: 971_101, fetchedAt: T0 + 6 * MINUTE } })!.value;
        const after = state({ value: later, settledAt: T0 + 6 * MINUTE });
        expect(figureView('mempoolFees', after, null, null)).toMatchObject({ old: true, failed: true, fetchedAt: T0 });
        expect(figureView('blockHeight', after, null, null)).toMatchObject({ old: false, failed: false });
    });

    it('cannot date a figure the page did not date: old as soon as a refresh fails to replace it', () => {
        expect(figureView('mempoolFees', state({ settledAt: T0, failures: 1 }), seed, null)).toMatchObject({ old: true, fetchedAt: null });
        const others = accept(NOTHING, { blockHeight: { data: 971_100, fetchedAt: T0 } })!.value;
        expect(figureView('mempoolFees', state({ value: others, settledAt: T0 }), seed, null)).toMatchObject({ old: true, failed: true });
    });

    it('has nothing to mark when there is no figure', () => {
        expect(figureView('spot', state({ settledAt: T0, failures: 2 }), null, null)).toEqual({
            data: null, fetchedAt: null, old: false, failed: true, checkedAt: T0,
        });
    });
});
