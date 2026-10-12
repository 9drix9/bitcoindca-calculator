import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FxSnapshot } from '@/data/currencies';
import type { PriceProvider } from '@/data/priceSources';
import { DEFAULT_PLAN } from '@/data/planDefaults';
import { calculateDca } from '@/utils/dca';
import { DAY_MS, utcDayStart } from '@/utils/dates';
import { decodeParams } from '@/utils/urlParams';
import type { PriceHistoryResult, SpotQuote } from '@/utils/priceSeries';

/**
 * The share surfaces (/share metadata, the /api/og image, the /embed widget)
 * against a fake price feed.
 *
 * These are the figures people screenshot and paste into other sites, with no
 * calculator beside them to check against, so the rules that keep them honest
 * are pinned here: count only purchases that have happened, and name whatever
 * else shaped the number.
 */

const actions = vi.hoisted(() => ({
    getBitcoinPriceHistoryWithMeta: vi.fn(),
    getBitcoinSpot: vi.fn(),
    getFxSnapshot: vi.fn(),
}));
vi.mock('@/app/actions', () => actions);

// The image route is run for what it decides (which card, cached for how
// long), not for pixels. ImageResponse is replaced by a stand-in that behaves
// like the real one where it matters: nothing is drawn, and nothing can fail,
// until the body is read.
const og = vi.hoisted(() => ({ drawn: [] as unknown[], failures: 0 }));
vi.mock('next/og', () => ({
    ImageResponse: class {
        constructor(private element: unknown) {}
        async arrayBuffer(): Promise<ArrayBuffer> {
            if (og.failures > 0) {
                og.failures -= 1;
                throw new Error('Expected <div> to have explicit "display: flex"');
            }
            og.drawn.push(this.element);
            return new ArrayBuffer(8);
        }
    },
}));

import { GET as ogImage } from '@/app/api/og/route';
import { generateMetadata } from './page';
import {
    computeShareCard,
    computeShareResult,
    defaultShareStartDate,
    describeSharePlan,
    encodeShareQuery,
    formatSignedPercent,
    resolveShareParams,
    toCalculatorParams,
    type ResolvedShareParams,
    type ShareCardData,
    type ShareComputed,
} from './shareData';

const NOW = Date.UTC(2026, 9, 12, 4, 10); // Monday 2026-10-12 04:10 UTC
const TODAY = utcDayStart(NOW);
const SERIES_START = Date.UTC(2010, 7, 18);

/** Every close is $20,000 and the live quote is $40,000: results can be checked by hand. */
const CLOSE = 20_000;
const SPOT = 40_000;

interface Feed {
    lastDay: number;
    served: PriceProvider | null;
    stale: boolean;
    /** One marker per row; defaults to all observed. */
    kindAt: (ts: number) => 'o' | 'e';
    spot: number | null;
    fx: FxSnapshot;
}

const LIVE_FX: FxSnapshot = {
    // Round numbers on purpose: EUR 0.5 means €100 is $200.
    rates: { USD: 1, EUR: 0.5, GBP: 0.8, CAD: 1.25, AUD: 1.6, JPY: 150 },
    live: true,
    asOf: '2026-10-09',
};

let feed: Feed;

beforeEach(() => {
    feed = { lastDay: TODAY, served: null, stale: false, kindAt: () => 'o', spot: SPOT, fx: LIVE_FX };

    actions.getBitcoinPriceHistoryWithMeta.mockReset().mockImplementation(
        async (from: number, to: number, provider: PriceProvider): Promise<PriceHistoryResult> => {
            const data: [number, number][] = [];
            let kinds = '';
            const first = Math.max(SERIES_START, utcDayStart(from) - 14 * DAY_MS);
            for (let ts = first; ts <= Math.min(to, feed.lastDay); ts += DAY_MS) {
                data.push([ts, CLOSE]);
                kinds += feed.kindAt(ts);
            }
            const servedProvider = feed.served ?? provider;
            return {
                data,
                kinds,
                requestedProvider: provider,
                servedProvider,
                fallback: servedProvider !== provider,
                stale: feed.stale,
                fetchedAt: NOW,
                seriesStart: SERIES_START,
                seriesEnd: feed.lastDay,
            };
        },
    );
    actions.getBitcoinSpot.mockReset().mockImplementation(
        async (provider: PriceProvider): Promise<SpotQuote | null> =>
            feed.spot === null ? null : { price: feed.spot, asOf: NOW, provider, fallback: false },
    );
    actions.getFxSnapshot.mockReset().mockImplementation(async () => feed.fx);
});

const resolve = (query: Record<string, string>): ResolvedShareParams =>
    resolveShareParams(toCalculatorParams(query), NOW);

const ok = async (query: Record<string, string>): Promise<{ p: ResolvedShareParams; computed: ShareComputed }> => {
    const p = resolve(query);
    const computed = await computeShareResult(p, NOW);
    if (computed.status !== 'ok') throw new Error(`expected a result, got '${computed.status}'`);
    return { p, computed };
};

/** $100 a week from 2025-01-01: 93 Wednesdays up to 2026-10-07, the last one before NOW. */
const WEEKLY_2025 = { amount: '100', frequency: 'weekly', startDate: '2025-01-01', fee: '0.5' };
const BUYS_2025 = 93;

describe('resolveShareParams', () => {
    it('falls back to the default plan and the default price source', () => {
        const p = resolve({});
        expect(p).toMatchObject({
            amount: DEFAULT_PLAN.amount,
            frequency: DEFAULT_PLAN.frequency,
            feePercentage: DEFAULT_PLAN.feePercentage,
            flatFee: 0,
            priceMode: 'api',
            provider: 'coinbase',
            currency: 'USD',
            startDate: '2021-10-12',
            endDate: '2026-10-12',
        });
    });

    it('never defaults the start date to before the first priceable day', () => {
        // A link with only an end date used to produce "since Jan 2007".
        expect(resolve({ endDate: '2012-01-01' }).startDate).toBe('2010-08-18');
        expect(defaultShareStartDate('2015-08-18')).toBe('2010-08-18');
        expect(defaultShareStartDate('2020-06-15')).toBe('2015-06-15');
        // A leap-day end has no same day five years back: Feb 28, not Mar 1.
        expect(defaultShareStartDate('2024-02-29')).toBe('2019-02-28');
    });

    it('reads the flat fee and keeps the first value of a repeated param', () => {
        const p = resolveShareParams(toCalculatorParams({ flat: ['2.99', '9'], amount: ['25', '500'] }), NOW);
        expect(p.flatFee).toBe(2.99);
        expect(p.amount).toBe(25);
    });
});

describe('encodeShareQuery', () => {
    it('round-trips the whole plan, future end date and currency included', () => {
        const p = resolve({
            ...WEEKLY_2025, endDate: '2030-12-31', flat: '1.5', currency: 'EUR',
            startingBtc: '0.5', startingCost: '30000', esc: '10', provider: 'kraken',
        });
        const back = decodeParams(Object.fromEntries(new URLSearchParams(encodeShareQuery(p))));
        expect(back).toMatchObject({
            amount: 100, frequency: 'weekly', startDate: '2025-01-01', endDate: '2030-12-31',
            feePercentage: 0.5, flatFee: 1.5, currency: 'EUR', provider: 'kraken',
            startingBtc: 0.5, startingAvgCost: 30000, annualEscalationPct: 10,
        });
    });

    it('always names the currency, so a recipient cannot reread the amount in their own', () => {
        expect(new URLSearchParams(encodeShareQuery(resolve({ amount: '50' }))).get('currency')).toBe('USD');
    });
});

describe('a plan whose end date is in the future', () => {
    it('counts only the purchases that have happened', async () => {
        const future = await ok({ ...WEEKLY_2025, endDate: '2030-12-31' });
        const toToday = await ok({ ...WEEKLY_2025, endDate: '2026-10-12' });

        expect(future.computed.purchaseCount).toBe(BUYS_2025);
        expect(future.computed.result.totalInvested).toBe(BUYS_2025 * 100);
        expect(future.computed.result.totalInvested).toBe(toToday.computed.result.totalInvested);
        expect(future.computed.result.btcAccumulated).toBe(toToday.computed.result.btcAccumulated);
        expect(future.computed.result.endsInFuture).toBe(true);
        expect(future.computed.result.throughTs).toBe(TODAY);
        // The whole plan would be 313 buys; none of the 220 still to come is in here.
        expect(future.computed.result.breakdown.every((row) => Date.parse(row.date) <= TODAY)).toBe(true);
    });

    it('says so on the card instead of wording a projection as history', async () => {
        const card = await computeShareCard(resolve({ ...WEEKLY_2025, endDate: '2030-12-31' }), NOW);
        expect(card).not.toBeNull();
        // 93 buys of $99.50 net at $20,000 = 0.462675 BTC, worth $18,507 at $40,000.
        expect(card!.title).toBe('$100/week in Bitcoin since Jan 2025 → $18,507 (+99%)');
        expect(card!.description).toContain('Invested $9,300 so far since Jan 2025, now worth $18,507 (+99.0% ROI)');
        expect(card!.description).toContain('The plan runs to Dec 2030; only purchases made so far are counted.');
        expect(card!.paramsLine).toBe('$100 every week · Jan 2025 → Oct 2026 · 0.4627 BTC stacked · 0.5% fee · plan runs to Dec 2030');
        // $31,300 is what the full 313-buy plan would total. It has not been invested.
        expect(`${card!.title} ${card!.description} ${card!.paramsLine}`).not.toContain('31,300');
    });

    it('keeps the full plan in the link the card points to', () => {
        const p = resolve({ ...WEEKLY_2025, endDate: '2030-12-31' });
        expect(new URLSearchParams(encodeShareQuery(p)).get('endDate')).toBe('2030-12-31');
    });

    it('has nothing to show before the first purchase date', async () => {
        const p = resolve({ ...WEEKLY_2025, startDate: '2027-01-01', endDate: '2028-01-01' });
        expect(await computeShareResult(p, NOW)).toEqual({ status: 'not-started', startTs: Date.UTC(2027, 0, 1) });
        expect(await computeShareCard(p, NOW)).toBeNull();
        // A date problem, so no price request is made for it.
        expect(actions.getBitcoinPriceHistoryWithMeta).not.toHaveBeenCalled();
    });

    it('does not count a starting stack as history either when the plan has not started', async () => {
        const p = resolve({ ...WEEKLY_2025, startDate: '2026-10-13', endDate: '2027-10-13', startingBtc: '1' });
        expect((await computeShareResult(p, NOW)).status).toBe('not-started');
    });

    it('says not started, not "start after end", for a link with only a future start date', async () => {
        // No endDate in the link, so it is today: a day the start is after.
        // The link never named that end date and must not be blamed for it.
        const p = resolve({ amount: '100', startDate: '2027-01-01' });
        expect(p.endDate).toBe('2026-10-12');
        expect(await computeShareResult(p, NOW)).toEqual({ status: 'not-started', startTs: Date.UTC(2027, 0, 1) });
    });
});

describe('a plan that ended in the past', () => {
    it('is worded as a closed range and valued at today\'s price', async () => {
        const query = { amount: '50', frequency: 'monthly', startDate: '2021-01-15', endDate: '2021-12-31', fee: '0' };
        const card = await computeShareCard(resolve(query), NOW);
        // 12 monthly buys of $50 at $20,000 = 0.03 BTC, worth $1,200 at $40,000.
        expect(card!.title).toBe('$50/month in Bitcoin from Jan 2021 to Dec 2021 → $1,200 (+100%)');
        expect(card!.description).toContain('Invested $600 from Jan 2021 to Dec 2021, now worth $1,200 (+100.0% ROI)');
        expect(card!.description).toContain('No fees applied.');
        expect(card!.paramsLine).toBe('$50 every month · Jan 2021 → Dec 2021 · 0.03 BTC stacked · no fee');
        expect(card!.description).not.toContain('so far');

        const { p, computed } = await ok(query);
        expect(describeSharePlan(p, computed)).toMatchObject({ running: false, since: 'Jan 2021', until: 'Dec 2021' });
    });

    it('still values the stack at the newest price when there is no live quote', async () => {
        feed.spot = null;
        const { computed } = await ok({ amount: '50', frequency: 'monthly', startDate: '2021-01-15', endDate: '2021-12-31', fee: '0' });
        // History is asked for through today, not through the plan's end.
        expect(actions.getBitcoinPriceHistoryWithMeta).toHaveBeenCalledWith(Date.UTC(2021, 0, 15), TODAY, 'coinbase');
        expect(computed.prices).toMatchObject({ liveQuote: false });
        expect(computed.result.currentValue).toBeCloseTo(0.03 * CLOSE, 6);
    });
});

describe('what shaped the number is named', () => {
    it('an assumed price', async () => {
        const card = await computeShareCard(
            resolve({ amount: '50', frequency: 'weekly', startDate: '2026-09-01', mode: 'manual', manualPrice: '1', fee: '0' }),
            NOW,
        );
        // 6 Tuesdays from Sep 1 to Oct 6: $300 at $1/BTC.
        expect(card!.title).toBe('$50/week in Bitcoin since Sep 2026 at an assumed $1/BTC → $300 (0%)');
        expect(card!.valueLabel).toBe('Value at the assumed price');
        expect(card!.description).toContain('at an assumed $1 per BTC, worth $300 at that price');
        expect(card!.description).toContain('Hypothetical, not market data.');
        expect(card!.description).not.toContain('now worth');
        expect(card!.paramsLine).toContain('at an assumed $1/BTC (hypothetical)');
        // No exchange was involved, so none is asked.
        expect(actions.getBitcoinPriceHistoryWithMeta).not.toHaveBeenCalled();
        expect(actions.getBitcoinSpot).not.toHaveBeenCalled();
    });

    it('labels a market-priced card "Current value"', async () => {
        expect((await computeShareCard(resolve(WEEKLY_2025), NOW))!.valueLabel).toBe('Current value');
    });

    it('a starting stack, with what it was counted at', async () => {
        const query = { ...WEEKLY_2025, startingBtc: '1', startingCost: '30000' };
        const card = await computeShareCard(resolve(query), NOW);
        expect(card!.title).toContain('$100/week in Bitcoin plus 1 BTC already held, since Jan 2025 →');
        expect(card!.description).toContain('Invested $39,300 since Jan 2025');
        expect(card!.description).toContain('Includes 1 BTC already held at the start, counted at $30,000.');
        expect(card!.paramsLine).toContain('incl. 1 BTC held at the start');

        // The stack is a position, not a purchase.
        const { computed } = await ok(query);
        expect(computed.result.breakdown).toHaveLength(BUYS_2025 + 1);
        expect(computed.purchaseCount).toBe(BUYS_2025);
    });

    it('a yearly raise', async () => {
        const card = await computeShareCard(resolve({ ...WEEKLY_2025, esc: '100' }), NOW);
        // 53 buys at $100, then 40 at $200 once a year has passed (from 2026-01-07).
        expect(card!.title).toContain('$100/week (+100%/yr) in Bitcoin since Jan 2025');
        expect(card!.description).toContain('Invested $13,300 since Jan 2025');
        expect(card!.description).toContain('The amount rises 100% a year.');
        expect(card!.paramsLine).toContain('amount rises 100%/yr');
    });

    it('a flat fee, taken out of every buy', async () => {
        const { p, computed } = await ok({ ...WEEKLY_2025, flat: '2.5' });
        // $100 less 0.5% less $2.50 = $97 buys 0.00485 BTC.
        expect(computed.result.btcAccumulated).toBeCloseTo(BUYS_2025 * 97 / CLOSE, 9);
        expect(computed.result.stats?.feesPaid).toBeCloseTo(BUYS_2025 * 3, 9);
        expect(describeSharePlan(p, computed).notes).toContain('0.5% + $2.50 fee per buy');

        const card = await computeShareCard(p, NOW);
        expect(card!.description).toContain('Fees: 0.5% + $2.50 per buy.');
    });

    it('estimated prices, when the series marks them', async () => {
        // Kraken-shaped: only Wednesdays are real closes. The plan buys on Thursdays.
        feed.kindAt = (ts) => (new Date(ts).getUTCDay() === 3 ? 'o' : 'e');
        const { p, computed } = await ok({ ...WEEKLY_2025, startDate: '2025-01-02', provider: 'kraken' });
        expect(computed.result.stats?.estimatedPrices?.purchases).toBe(computed.purchaseCount);
        expect(describeSharePlan(p, computed).notes).toContain('93 of 93 buy prices are estimates');
        const card = await computeShareCard(p, NOW);
        expect(card!.description).toContain('93 of 93 purchase prices are estimates rather than recorded closes.');
    });

    it('nothing extra on a plain plan', async () => {
        const { p, computed } = await ok(WEEKLY_2025);
        expect(describeSharePlan(p, computed)).toEqual({
            cadence: '$100/week', since: 'Jan 2025', until: 'Oct 2026', running: true, notes: ['0.5% fee'],
        });
    });
});

describe('currency', () => {
    it('divides the contribution by the rate before any bitcoin is bought', async () => {
        const { computed } = await ok({ ...WEEKLY_2025, currency: 'EUR', fee: '0' });
        // €100 at 0.5 EUR per USD is $200 a week.
        expect(computed.result.totalInvested).toBe(BUYS_2025 * 200);
        const card = await computeShareCard(resolve({ ...WEEKLY_2025, currency: 'EUR', fee: '0' }), NOW);
        expect(card!.title).toBe('€100/week in Bitcoin since Jan 2025 → €18,600 (+100%)');
        expect(card!.degraded).toBe(false);
    });

    it('says that one dated rate converted every buy, on the card, the image line and the embed line', async () => {
        // The figures are the dollar result at one rate, not what the plan
        // cost in euros day by day. A card that leaves that out reads as a
        // euro backtest.
        const query = { ...WEEKLY_2025, currency: 'EUR', fee: '0' };
        const card = await computeShareCard(resolve(query), NOW);
        expect(card!.description).toContain('Every buy is converted at the EUR exchange rate of 2026-10-09, not the rate on its own date.');
        expect(card!.paramsLine).toBe(
            '€100 every week · Jan 2025 → Oct 2026 · 0.93 BTC stacked · no fee · every buy at the EUR rate of 2026-10-09',
        );
        const { p, computed } = await ok(query);
        expect(describeSharePlan(p, computed).notes).toEqual(['no fee', 'every buy at the EUR rate of 2026-10-09']);
        // On live rates the figures themselves are not approximate.
        expect(card!.description).not.toContain('approx');
        expect(card!.description).not.toContain('about');
    });

    it('marks the rate-dependent figures when only the constant rates were available', async () => {
        feed.fx = { ...LIVE_FX, live: false };
        const card = await computeShareCard(resolve({ ...WEEKLY_2025, currency: 'EUR', fee: '0' }), NOW);
        expect(card!.description).toContain('with about 0.93 BTC stacked');
        expect(card!.description).toContain('Every buy is converted at an approximate EUR exchange rate of 2026-10-09, not the rate on its own date.');
        expect(card!.paramsLine).toContain('every buy at an approx. EUR rate of 2026-10-09');
        expect(card!.degraded).toBe(true);
    });

    it('has no history to convert at an assumed price, so only an approximate rate is named there', async () => {
        const query = { amount: '50', frequency: 'weekly', startDate: '2026-09-01', mode: 'manual', manualPrice: '1', fee: '0', currency: 'EUR' };
        const live = await computeShareCard(resolve(query), NOW);
        expect(`${live!.description} ${live!.paramsLine}`).not.toMatch(/rate/i);

        feed.fx = { ...LIVE_FX, live: false };
        const constant = await computeShareCard(resolve(query), NOW);
        expect(constant!.description).toContain('Converted at an approximate EUR rate of 2026-10-09.');
        expect(constant!.paramsLine.endsWith(' · approx. EUR rate of 2026-10-09')).toBe(true);
        expect(`${constant!.description} ${constant!.paramsLine}`).not.toContain('very buy');
    });

    it('never mentions a rate on a USD card: it needs none', async () => {
        feed.fx = { ...LIVE_FX, live: false };
        const card = await computeShareCard(resolve(WEEKLY_2025), NOW);
        expect(`${card!.description} ${card!.paramsLine}`).not.toMatch(/approx|rate/i);
        expect(card!.degraded).toBe(false);
    });
});

describe('when the result cannot be computed', () => {
    const invalid = { status: 'invalid' };

    it('treats a link with nothing to compute as the link\'s problem', async () => {
        expect(await computeShareResult(resolve({ startDate: '2024-01-01', endDate: '2023-01-01' }), NOW)).toEqual(invalid);
        expect(await computeShareResult(resolve({ mode: 'manual' }), NOW)).toEqual(invalid);
        // A hold-only link: there is no "$0/week" to headline.
        expect(await computeShareResult(resolve({ amount: '0', startingBtc: '1' }), NOW)).toEqual(invalid);
        // An end date before the data begins leaves the clamped start after it.
        expect(await computeShareResult(resolve({ endDate: '2009-06-01' }), NOW)).toEqual(invalid);
        expect(actions.getBitcoinPriceHistoryWithMeta).not.toHaveBeenCalled();
    });

    it('does not call it an outage when the fees take the whole of every buy', async () => {
        expect(await computeShareResult(resolve({ ...WEEKLY_2025, amount: '5', flat: '10' }), NOW)).toEqual(invalid);
        expect(await computeShareCard(resolve({ ...WEEKLY_2025, amount: '5', flat: '10' }), NOW)).toBeNull();
    });

    it('words a plan that began and ended in one month as that month', async () => {
        const card = await computeShareCard(
            resolve({ amount: '50', frequency: 'weekly', startDate: '2024-03-04', endDate: '2024-03-25', fee: '0' }),
            NOW,
        );
        expect(card!.title).toBe('$50/week in Bitcoin during Mar 2024 → $400 (+100%)');
        expect(card!.paramsLine).toBe('$50 every week · Mar 2024 → Mar 2024 · 0.01 BTC stacked · no fee');
    });

    it('reports an outage as unavailable and never throws', async () => {
        actions.getBitcoinPriceHistoryWithMeta.mockRejectedValueOnce(new Error('both exchanges down'));
        expect(await computeShareResult(resolve(WEEKLY_2025), NOW)).toEqual({ status: 'unavailable' });
        actions.getBitcoinPriceHistoryWithMeta.mockRejectedValueOnce(new Error('both exchanges down'));
        expect(await computeShareCard(resolve(WEEKLY_2025), NOW)).toBeNull();
    });

    it('refuses a series that stops short of today rather than pricing recent buys at an old close', async () => {
        feed.lastDay = TODAY - 10 * DAY_MS;
        expect(await computeShareResult(resolve(WEEKLY_2025), NOW)).toEqual({ status: 'unavailable' });
    });

    it('flags a card drawn on the other exchange so it is not cached for long', async () => {
        feed.served = 'kraken';
        const p = resolve(WEEKLY_2025);
        const card = await computeShareCard(p, NOW);
        expect(card!.degraded).toBe(true);
        expect(card!.paramsLine).toContain('Kraken prices');
        expect(card!.description).toContain('Priced on Kraken data because Coinbase could not be reached.');
    });
});

describe('figures', () => {
    it('match the engine run directly over the same days', async () => {
        const { computed } = await ok({ amount: '75', frequency: 'biweekly', startDate: '2023-03-10', fee: '1.5' });
        const prices: [number, number][] = [];
        for (let ts = Date.UTC(2023, 2, 1); ts <= TODAY; ts += DAY_MS) prices.push([ts, CLOSE]);
        const direct = calculateDca(
            {
                amount: 75, frequency: 'biweekly', startDate: new Date(Date.UTC(2023, 2, 10)), endDate: new Date(TODAY),
                feePercentage: 1.5, priceMode: 'api', manualPrice: 0,
            },
            prices, SPOT, NOW,
        );
        expect(computed.result.totalInvested).toBe(direct.totalInvested);
        expect(computed.result.btcAccumulated).toBe(direct.btcAccumulated);
        expect(computed.result.currentValue).toBe(direct.currentValue);
        expect(computed.result.roi).toBe(direct.roi);
    });

    it('stay finite and readable at the largest plan a link can carry', async () => {
        const card = await computeShareCard(
            resolve({ amount: '1e308', frequency: 'daily', startDate: '2010-08-18', esc: '999', fee: '0' }),
            NOW,
        );
        expect(card).not.toBeNull();
        for (const text of [card!.title, card!.description, card!.currentValueText, card!.profitText, card!.paramsLine]) {
            expect(text).not.toMatch(/NaN|Infinity|∞|e\+/);
        }
        expect(card!.title.startsWith('$1,000,000,000/day (+200%/yr) in Bitcoin since Aug 2010')).toBe(true);
    });

    it('never print a return that rounds to zero as "-0%"', async () => {
        feed.spot = CLOSE;
        const card = await computeShareCard(resolve({ ...WEEKLY_2025, fee: '0.04' }), NOW);
        expect(card!.title.endsWith('(0%)')).toBe(true);
        expect(card!.profitText).toBe('-$4 (0.0%)');
    });
});

describe('the routes that serve these cards', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    /** What the image route decided: the card it drew (null for the generic one) and its cache lifetime. */
    const image = async (query = ''): Promise<{ card: ShareCardData | null; cacheControl: string | null; response: Response }> => {
        og.drawn.length = 0;
        const response = await ogImage(new Request(`https://example.test/api/og${query}`));
        const element = og.drawn.at(-1) as { props: { card?: ShareCardData } };
        return { card: element.props.card ?? null, cacheControl: response.headers.get('Cache-Control'), response };
    };

    const titleOf = async (query: Record<string, string>): Promise<string> =>
        ((await generateMetadata({ searchParams: Promise.resolve(query) })).title as { absolute: string }).absolute;

    /** The clock reads 23:59:59.999 UTC once, and the next UTC day on every reading after that. */
    const crossMidnight = () =>
        vi.spyOn(Date, 'now').mockReturnValue(TODAY + DAY_MS).mockReturnValueOnce(TODAY + DAY_MS - 1);

    it('read the clock once, so a link with no dates is one plan on one day', async () => {
        // Read twice, the default end date came from the first reading and
        // "today" from the second: the plan ended yesterday, and a running
        // plan was worded as a closed range.
        const running = /^\$50\/week in Bitcoin since Oct 2021 → /;
        crossMidnight();
        expect(await titleOf({})).toMatch(running);

        crossMidnight();
        expect((await image()).card!.title).toMatch(running);
    });

    it('point the page at an image of the same plan, flat fee and future end date included', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(NOW);
        const metadata = await generateMetadata({
            searchParams: Promise.resolve({ ...WEEKLY_2025, flat: '2.5', endDate: '2030-12-31' }),
        });
        const [ogUrl] = [metadata.openGraph?.images].flat();
        const query = new URL(String((ogUrl as { url: string }).url), 'https://example.test').searchParams;
        expect(query.get('flat')).toBe('2.5');
        expect(query.get('endDate')).toBe('2030-12-31');
        expect((await image(`?${query}`)).card!.title).toBe((metadata.title as { absolute: string }).absolute);
        expect((metadata.title as { absolute: string }).absolute).toMatch(/^\$100\/week in Bitcoin since Jan 2025 → /);
    });

    it('keep a card for an hour only when it is the requested exchange, a live quote and live rates', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(NOW);
        const hour = 'public, max-age=3600, s-maxage=3600';
        const fiveMinutes = 'public, max-age=300, s-maxage=300';
        expect((await image('?amount=100')).cacheControl).toBe(hour);

        feed.spot = null;
        expect((await image('?amount=100')).cacheControl).toBe(fiveMinutes);
        feed.spot = SPOT;

        feed.served = 'kraken';
        expect((await image('?amount=100')).cacheControl).toBe(fiveMinutes);
        feed.served = null;

        expect((await image('?amount=100&currency=EUR')).cacheControl).toBe(hour);
        feed.fx = { ...LIVE_FX, live: false };
        expect((await image('?amount=100&currency=EUR')).cacheControl).toBe(fiveMinutes);
        feed.fx = LIVE_FX;

        // No card at all: a link with nothing to compute, or an outage.
        const generic = await image('?amount=0');
        expect(generic.card).toBeNull();
        expect(generic.cacheControl).toBe(fiveMinutes);
    });

    it('answer with the generic image, kept five minutes, when a card cannot be drawn', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(NOW);
        const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
        // The failure comes when the image is read, not when it is created:
        // answered unread, it would go out as a 200 PNG, cacheable for an
        // hour, whose body breaks off.
        og.failures = 1;
        const failed = await image('?amount=100');
        expect(failed.card).toBeNull();
        expect(failed.response.status).toBe(200);
        expect(failed.response.headers.get('Content-Type')).toBe('image/png');
        expect(failed.cacheControl).toBe('public, max-age=300, s-maxage=300');
        expect((await failed.response.arrayBuffer()).byteLength).toBeGreaterThan(0);
        expect(reported).toHaveBeenCalledWith('[api/og] render failed:', expect.any(Error));
    });

    it('stop waiting for the figures after four seconds and send the generic title with the plan\'s own image', async () => {
        vi.useFakeTimers({ now: NOW });
        try {
            // An exchange that never answers.
            actions.getBitcoinPriceHistoryWithMeta.mockImplementation(() => new Promise(() => {}));
            const answered: Awaited<ReturnType<typeof generateMetadata>>[] = [];
            void generateMetadata({ searchParams: Promise.resolve(WEEKLY_2025) }).then((m) => answered.push(m));

            await vi.advanceTimersByTimeAsync(3_900);
            expect(answered).toHaveLength(0);
            await vi.advanceTimersByTimeAsync(200);
            expect(answered).toHaveLength(1);
            const { title, openGraph } = answered[0];
            expect((title as { absolute: string }).absolute).toMatch(/^Bitcoin DCA Calculator/);
            const [ogImageUrl] = [openGraph?.images].flat();
            expect(String((ogImageUrl as { url: string }).url)).toContain('/api/og?amount=100&frequency=weekly&startDate=2025-01-01');
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('formatSignedPercent', () => {
    it('takes its sign from the rounded figure and groups thousands, for the card and the embed alike', () => {
        expect(formatSignedPercent(-0.04, 1)).toBe('0.0%');
        expect(formatSignedPercent(0.04, 0)).toBe('0%');
        expect(formatSignedPercent(-0.06, 1)).toBe('-0.1%');
        expect(formatSignedPercent(92.24, 1)).toBe('+92.2%');
        expect(formatSignedPercent(15061.2, 0)).toBe('+15,061%');
    });
});

