import { getBitcoinPriceHistoryWithMeta } from '@/app/actions';
import { expireRenderSoon } from '@/utils/isr';
import { DAILY_PRICE_REVALIDATE } from '@/utils/revalidate';
import { DAY_MS, EARLIEST_PRICE_TS } from '@/utils/dates';
import { finishedDailyCloses, type StudyCloses } from './studyCloses';

/**
 * `next build` sets NEXT_PHASE to this (PHASE_PRODUCTION_BUILD in
 * next/constants) before it starts the workers that prerender pages, and they
 * inherit it. Written out, as on the exchange-fees page, so a page does not
 * pull that config-time module into its server bundle.
 */
const BUILD_PHASE = 'phase-production-build';

/**
 * What a study page does when it cannot be computed on real daily closes.
 *
 * It does not publish. These pages are statically generated and refreshed once
 * a day, and each used to catch the failure and render a "price data is
 * temporarily unavailable" card. That render succeeded, so it replaced
 * yesterday's good page and stayed up for 24 hours.
 *
 * Throwing is what keeps the good page: when a page throws while it is being
 * regenerated, Next keeps serving the last version that rendered successfully
 * and tries again (ISR guide, "Handling uncaught exceptions"). Next 16.3's own
 * server re-saves the old page with a 30-second lifetime when that happens
 * (server/response-cache), so the retry is half a minute away, not a day.
 *
 * `next build` is the exception. There is no earlier version to keep, and a
 * thrown error there fails the whole deploy over an exchange outage. So during
 * a build this resolves null, the page renders its unavailable card, and
 * expireRenderSoon() has that card replaced within minutes, not a day.
 * Development resolves null too: a dev server has no cached page to protect,
 * and the card is easier to work on than an error overlay.
 */
export async function studyUnavailable(page: string, reason: unknown): Promise<null> {
    console.error(`[${page}] study not published:`, reason);
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== BUILD_PHASE) {
        throw reason instanceof Error ? reason : new Error(String(reason));
    }
    await expireRenderSoon();
    return null;
}

/**
 * Bitcoin's finished daily closes from the first day of data to the last full
 * UTC day: the bundled blockchain.info rows, then Coinbase's daily candles.
 *
 * Never the Kraken fallback and never today's unfinished row; see
 * studyCloses.ts. Resolves null only where studyUnavailable does.
 */
export async function loadStudyCloses(page: string): Promise<StudyCloses | null> {
    let history;
    try {
        history = await getBitcoinPriceHistoryWithMeta(
            EARLIEST_PRICE_TS,
            Date.now() + DAY_MS,
            'coinbase',
            DAILY_PRICE_REVALIDATE,
        );
    } catch (error) {
        return studyUnavailable(page, error);
    }
    const study = finishedDailyCloses(history);
    return 'reason' in study ? studyUnavailable(page, study.reason) : study;
}
