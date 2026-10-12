import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAY_MS } from '@/utils/dates';
import type { PriceHistoryResult } from '@/utils/priceSeries';

/**
 * What a study page does when Coinbase's daily closes are not available.
 *
 * The three pages used to catch every failure and render their "temporarily
 * unavailable" card, or, worse, render normally on the fallback series. Both
 * renders succeeded, so each replaced the last good page for 24 hours. The
 * rule now: once deployed, throw (Next keeps the last good page and retries);
 * during `next build`, where there is no last good page, render the card.
 */

const getBitcoinPriceHistoryWithMeta = vi.fn<() => Promise<PriceHistoryResult>>();
const expireRenderSoon = vi.fn(async () => {});

vi.mock('@/app/actions', () => ({ getBitcoinPriceHistoryWithMeta: () => getBitcoinPriceHistoryWithMeta() }));
vi.mock('@/utils/isr', () => ({ expireRenderSoon: () => expireRenderSoon() }));

const START = Date.UTC(2026, 9, 1);

function history(overrides: Partial<PriceHistoryResult> = {}): PriceHistoryResult {
    const data: [number, number][] = Array.from({ length: 10 }, (_, i) => [START + i * DAY_MS, 100 + i]);
    return {
        data,
        kinds: 'o'.repeat(data.length),
        requestedProvider: 'coinbase',
        servedProvider: 'coinbase',
        fallback: false,
        stale: false,
        fetchedAt: START + 9 * DAY_MS + 3_600_000,
        seriesStart: data[0][0],
        seriesEnd: data[data.length - 1][0],
        ...overrides,
    };
}

const krakenFallback = (): PriceHistoryResult => history({ servedProvider: 'kraken', fallback: true });

/** The three situations a page is rendered in. */
const during = {
    build: () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    },
    production: () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('NEXT_PHASE', '');
    },
    development: () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('NEXT_PHASE', 'phase-development-server');
    },
};

beforeEach(() => {
    getBitcoinPriceHistoryWithMeta.mockReset();
    expireRenderSoon.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('loadStudyCloses', () => {
    it('returns finished closes when Coinbase answered', async () => {
        during.production();
        getBitcoinPriceHistoryWithMeta.mockResolvedValue(history());
        const { loadStudyCloses } = await import('./loadStudyCloses');
        const study = await loadStudyCloses('test');
        expect(study?.closes).toHaveLength(9); // the fetch day is not a close
        expect(study?.lastCloseTs).toBe(START + 8 * DAY_MS);
        expect(expireRenderSoon).not.toHaveBeenCalled();
    });

    it('throws in production when only the fallback series is available, so the last good page stays up', async () => {
        during.production();
        getBitcoinPriceHistoryWithMeta.mockResolvedValue(krakenFallback());
        const { loadStudyCloses } = await import('./loadStudyCloses');
        await expect(loadStudyCloses('test')).rejects.toThrow(/kraken/);
    });

    it('throws in production when the price action itself fails, with the original error', async () => {
        during.production();
        const outage = new Error('both exchanges unreachable');
        getBitcoinPriceHistoryWithMeta.mockRejectedValue(outage);
        const { loadStudyCloses } = await import('./loadStudyCloses');
        await expect(loadStudyCloses('test')).rejects.toBe(outage);
    });

    it('never fails a build: it resolves null and asks for the page to be replaced soon', async () => {
        during.build();
        const { loadStudyCloses } = await import('./loadStudyCloses');

        getBitcoinPriceHistoryWithMeta.mockResolvedValue(krakenFallback());
        await expect(loadStudyCloses('test')).resolves.toBeNull();
        expect(expireRenderSoon).toHaveBeenCalledTimes(1);

        getBitcoinPriceHistoryWithMeta.mockRejectedValue(new Error('both exchanges unreachable'));
        await expect(loadStudyCloses('test')).resolves.toBeNull();
        expect(expireRenderSoon).toHaveBeenCalledTimes(2);
    });

    it('resolves null in development, where there is no cached page to protect', async () => {
        during.development();
        getBitcoinPriceHistoryWithMeta.mockResolvedValue(krakenFallback());
        const { loadStudyCloses } = await import('./loadStudyCloses');
        await expect(loadStudyCloses('test')).resolves.toBeNull();
    });
});

describe('studyUnavailable', () => {
    it('turns a reason given as text into an Error when it throws', async () => {
        during.production();
        const { studyUnavailable } = await import('./loadStudyCloses');
        await expect(studyUnavailable('test', 'too little price history')).rejects.toThrow('too little price history');
    });
});
