import { NextRequest, NextResponse } from 'next/server';
import type { CalculatorSearchParams, DcaBreakdownItem } from '@/types';
import { decodeParams, URL_PARAM_LIMITS } from '@/utils/urlParams';
import { calculateDcaToDate, priceSeriesCovers, withPriceKinds } from '@/utils/dca';
import { getBitcoinPriceHistoryWithMeta, getBitcoinSpot } from '@/app/actions';
import { DEFAULT_PLAN } from '@/data/planDefaults';
import { DEFAULT_PRICE_PROVIDER, PRICE_PROVIDER_LABELS } from '@/data/priceSources';
import { formatUtc } from '@/utils/dates';
import { BREAKDOWN_CAP, cacheControl, degradedNotices, provenanceNote, resolveDcaWindow } from '../contract';
import { CORS_HEADERS, handleOptions, jsonError } from '../shared';

/**
 * GET /api/v1/dca — the calculator's full backtest as JSON. Free, no auth,
 * CORS open. Params are named as in the calculator's shareable URLs (all
 * optional):
 *
 *   amount        USD per purchase (default 50)
 *   frequency     daily | weekly | biweekly | monthly (default weekly)
 *   startDate     ISO date (default 5 years before endDate, never before 2010-08-18)
 *   endDate       ISO date (default today)
 *   fee           exchange fee %, 0-50 (default 0.5)
 *   flat          flat fee per purchase in USD, 0-1,000,000 (default 0)
 *   provider      coinbase | kraken (default coinbase)
 *   startingBtc   BTC already held at the start date (default none)
 *   startingCost  USD cost per BTC of that stack (default: the start date's price)
 *   esc           yearly increase of the purchase amount in % (default 0)
 *   currency      USD only
 *   mode          api only
 *
 * A link's manualPrice is not read: without mode=manual the calculator does
 * not use it either.
 *
 * Same pipeline as the on-site calculator and the /share cards: price history
 * + live spot into the engine. All figures are USD. Documented at /developers.
 */
export const dynamic = 'force-dynamic';

const LIMITS = URL_PARAM_LIMITS;
const grouped = (n: number): string => n.toLocaleString('en-US');

/**
 * One breakdown row as the API publishes it, spelled out field by field: a
 * field added to the engine's row for the calculator's own use must not become
 * part of the API by accident.
 */
const toRow = (b: DcaBreakdownItem) => ({
    date: b.date,
    price: b.price,
    invested: b.invested,
    totalInvested: b.totalInvested,
    accumulated: b.accumulated,
    totalAccumulated: b.totalAccumulated,
    portfolioValue: b.portfolioValue,
    fee: b.fee,
    // Absent only on a starting-stack row whose cost the caller stated: that
    // price is theirs, not the market's.
    ...(b.priceKind ? { priceKind: b.priceKind } : {}),
    ...(b.isStartingStack ? { isStartingStack: true } : {}),
});

export function OPTIONS() {
    return handleOptions();
}

export async function GET(request: NextRequest) {
    // One reading of the clock decides what "today" is for the whole request.
    const now = Date.now();
    const sp = request.nextUrl.searchParams;
    const raw: CalculatorSearchParams = {
        amount: sp.get('amount') ?? undefined,
        frequency: sp.get('frequency') ?? undefined,
        startDate: sp.get('startDate') ?? undefined,
        endDate: sp.get('endDate') ?? undefined,
        fee: sp.get('fee') ?? undefined,
        flat: sp.get('flat') ?? undefined,
        provider: sp.get('provider') ?? undefined,
        startingBtc: sp.get('startingBtc') ?? undefined,
        startingCost: sp.get('startingCost') ?? undefined,
        esc: sp.get('esc') ?? undefined,
    };

    // decodeParams gives this route the exact acceptance rules of the
    // calculator's shared links (amount capped at $1B, fee 0-50, strict date
    // strings, startDate clamped to the first priceable day). But it silently
    // DROPS what it can't accept — right for a shared link, wrong for an API,
    // where garbage must 400 loudly instead of computing a default-looking
    // backtest the caller never asked for.
    const decoded = decodeParams(raw) ?? {};
    const rejections: string[] = [];
    // decodeParams accepts amount=0 (a hold-only plan in the calculator). Here
    // it is refused: with no purchases there is no backtest to report, only a
    // cacheable response of zeros.
    if (raw.amount !== undefined && !(decoded.amount !== undefined && decoded.amount > 0)) {
        rejections.push("'amount' must be a positive number (USD per purchase)");
    }
    if (raw.frequency !== undefined && decoded.frequency === undefined) {
        rejections.push("'frequency' must be one of: daily, weekly, biweekly, monthly");
    }
    if (raw.startDate !== undefined && decoded.startDate === undefined) {
        rejections.push("'startDate' must be an ISO date like 2017-01-31");
    }
    if (raw.endDate !== undefined && decoded.endDate === undefined) {
        rejections.push("'endDate' must be an ISO date like 2024-12-31");
    }
    if (raw.fee !== undefined && decoded.feePercentage === undefined) {
        rejections.push(`'fee' must be a percentage between 0 and ${LIMITS.maxFeePct}`);
    }
    if (raw.flat !== undefined && decoded.flatFee === undefined) {
        rejections.push(`'flat' must be a flat fee per purchase in USD, between 0 and ${grouped(LIMITS.maxFlatFee)}`);
    }
    if (raw.provider !== undefined && decoded.provider === undefined) {
        rejections.push("'provider' must be coinbase or kraken");
    }
    if (raw.startingBtc !== undefined && decoded.startingBtc === undefined) {
        rejections.push(`'startingBtc' must be a number of BTC already held, 0 or more (above ${grouped(LIMITS.maxStartingBtc)} is clamped)`);
    }
    if (raw.startingCost !== undefined && decoded.startingAvgCost === undefined) {
        rejections.push("'startingCost' must be a USD cost per BTC for the starting stack, 0 or more");
    }
    if (raw.esc !== undefined && decoded.annualEscalationPct === undefined) {
        rejections.push(`'esc' must be a yearly purchase-amount increase in percent, 0 or more (above ${LIMITS.maxEscalationPct} is clamped)`);
    }
    if (raw.startingCost !== undefined && !(decoded.startingBtc && decoded.startingBtc > 0)) {
        rejections.push("'startingCost' only makes sense together with a positive 'startingBtc'");
    }
    // Every calculator link carries currency and mode. A link in another
    // currency or at a manual price describes a plan this endpoint cannot run,
    // and answering it in USD at market prices would look like that plan.
    const currency = sp.get('currency');
    if (currency !== null && currency !== 'USD') {
        rejections.push("'currency' must be USD or left out: every amount on this endpoint is in US dollars");
    }
    const mode = sp.get('mode');
    if (mode !== null && mode !== 'api') {
        rejections.push("'mode' must be api or left out: purchases are priced at the market price here, never at a manual one");
    }
    if (rejections.length > 0) return jsonError(400, rejections.join('; ') + '.');

    // Defaults are the calculator's own (data/planDefaults, data/priceSources).
    const amount = decoded.amount ?? DEFAULT_PLAN.amount;
    const frequency = decoded.frequency ?? DEFAULT_PLAN.frequency;
    const feePercentage = decoded.feePercentage ?? DEFAULT_PLAN.feePercentage;
    const provider = decoded.provider ?? DEFAULT_PRICE_PROVIDER;

    // Every date problem is settled here, before anything is fetched: a window
    // that can never be priced is the caller's error, not an outage.
    const range = resolveDcaWindow(decoded.startDate, decoded.endDate, now);
    if ('error' in range) return jsonError(400, range.error);

    try {
        // The series runs to now, not to the window's end, so that when no live
        // quote is available the stack is still valued at the newest price we
        // have, also for a window that ended years ago.
        const [history, spot] = await Promise.all([
            getBitcoinPriceHistoryWithMeta(range.startTs, now, provider),
            getBitcoinSpot(provider),
        ]);
        const points = withPriceKinds(history.data, history.kinds);

        // This endpoint reports HISTORY. The engine can extend a schedule past
        // today by carrying the last price forward (the site's Projection tab
        // uses that, clearly labeled) — but an API response has no place to
        // carry that caveat per-row, so future purchases would masquerade as
        // backtest data. Cut back instead of reject: the caller still gets the
        // real backtest-to-date, with the cut declared in `inputs` and `note`.
        const result = calculateDcaToDate(
            {
                amount,
                frequency,
                startDate: new Date(range.startTs),
                endDate: new Date(range.endTs),
                feePercentage,
                flatFee: decoded.flatFee,
                priceMode: 'api',
                manualPrice: 0,
                startingBtc: decoded.startingBtc,
                startingAvgCost: decoded.startingAvgCost,
                annualEscalationPct: decoded.annualEscalationPct ?? 0,
            },
            points,
            spot?.price ?? null,
            now,
        );

        // The engine carries the newest price forward without limit, so a
        // series that stops short of the window would price every later buy at
        // an old close and say nothing. The dates were validated above, so a
        // gap here is on our side and temporary: a 503, not a 400.
        if (!priceSeriesCovers(points, range.startTs, result.throughTs)) {
            return jsonError(
                503,
                `The ${history.servedProvider} price series does not reach ${formatUtc(result.throughTs, 'isoDay')} right now `
                + `(it ends ${formatUtc(history.seriesEnd, 'isoDay')}). Try again in a few minutes.`,
            );
        }
        // Refused, not defaulted: a response that filled in zeros here would
        // state fees and a drawdown nobody computed.
        const { stats } = result;
        if (!stats || !Number.isFinite(result.totalInvested) || !Number.isFinite(result.currentValue)) {
            return jsonError(500, 'The backtest did not produce a usable result. Please report this at github.com/9drix9/bitcoindca-calculator.');
        }

        // Even thinning, never truncation: cutting the tail would drop the most
        // recent (most interesting) purchases. Cumulative columns stay exact at
        // every kept row, and the final purchase is always kept.
        const full = result.breakdown;
        let breakdown = full;
        let breakdownSampled = false;
        if (full.length > BREAKDOWN_CAP) {
            const stride = Math.ceil(full.length / BREAKDOWN_CAP);
            breakdown = full.filter((_, i) => i % stride === 0);
            if (breakdown[breakdown.length - 1] !== full[full.length - 1]) {
                breakdown.push(full[full.length - 1]);
            }
            breakdownSampled = true;
        }

        const startDateClamped = raw.startDate !== undefined && raw.startDate !== range.startDate;
        const lastPriceTs = Math.min(result.throughTs, history.data[history.data.length - 1][0]);

        return NextResponse.json(
            {
                inputs: {
                    amountUsd: amount, frequency, startDate: range.startDate,
                    ...(startDateClamped ? { startDateClamped: true, requestedStartDate: raw.startDate } : {}),
                    endDate: formatUtc(result.throughTs, 'isoDay'),
                    // The date the caller typed, not decodeParams' own ceiling for it.
                    ...(result.endsInFuture ? { endDateClamped: true, requestedEndDate: raw.endDate ?? range.endDate } : {}),
                    feePercent: feePercentage, provider,
                    // Echoed only when supplied, so the common response shape stays stable.
                    ...(decoded.flatFee !== undefined ? { flatFeeUsd: decoded.flatFee } : {}),
                    ...(decoded.startingBtc !== undefined ? { startingBtc: decoded.startingBtc } : {}),
                    ...(decoded.startingAvgCost !== undefined ? { startingCostUsd: decoded.startingAvgCost } : {}),
                    ...(decoded.annualEscalationPct !== undefined ? { annualEscalationPercent: decoded.annualEscalationPct } : {}),
                },
                asOf: new Date(now).toISOString(),
                currency: 'USD',
                totalInvested: result.totalInvested,
                btcAccumulated: result.btcAccumulated,
                averageCost: result.averageCost,
                currentValue: result.currentValue,
                profit: result.profit,
                roiPercent: result.roi,
                xirrPercent: stats.xirrPercent,
                maxDrawdownPercent: stats.maxDrawdownPercent,
                feesPaid: stats.feesPaid,
                feePercentOfBuy: stats.feePercentOfBuy,
                // Scheduled market buys only — a starting stack adds a breakdown
                // row (flagged isStartingStack) but is a position, not a purchase.
                purchaseCount: full.filter((b) => !b.isStartingStack).length,
                // Counted over every purchase and every day walked, thinned breakdown or not.
                estimatedPrices: stats.estimatedPrices ?? null,
                spotPriceUsd: spot?.price ?? null,
                spotSource: spot?.provider ?? null,
                spotAsOf: spot ? new Date(spot.asOf).toISOString() : null,
                // `inputs.provider` is what was asked for; `served` is whose
                // series priced the purchases. They differ only when `fallback`.
                served: history.servedProvider,
                fallback: history.fallback,
                stale: history.stale,
                seriesFetchedAt: new Date(history.fetchedAt).toISOString(),
                breakdownSampled,
                breakdown: breakdown.map(toRow),
                note: [
                    // First, so a fallback or an earlier copy is not buried
                    // under the description of the fields.
                    ...degradedNotices(history.servedProvider, {
                        requested: history.requestedProvider,
                        stale: history.stale,
                        fetchedAt: history.fetchedAt,
                    }),
                    'All figures are USD.',
                    spot
                        ? `currentValue uses the live ${PRICE_PROVIDER_LABELS[spot.provider].name} price (spotPriceUsd), quoted at spotAsOf.`
                        : 'No live price was available, so spotPriceUsd is null and currentValue uses the newest price in the daily series.',
                    // The stack is valued now, so the 90 days run from the first
                    // purchase to today, whatever the window's own length.
                    'currentValue, profit, roiPercent and xirrPercent value the stack today, not at endDate. '
                    + 'xirrPercent is null when the first purchase is less than 90 days old or no bitcoin was bought.',
                    'Each breakdown row is one purchase: invested is what left the bank, fee is the part of it that went to fees '
                    + '(fee percent plus flat fee, never more than the purchase), and the rest bought bitcoin at price. '
                    + 'priceKind says whether that price was observed or estimated; estimatedPrices counts the estimates.',
                    `When a schedule exceeds ${BREAKDOWN_CAP} purchases, breakdown is evenly thinned (breakdownSampled: true) `
                    + 'and purchaseCount is the true total of scheduled buys '
                    + '(a startingBtc stack appears as a breakdown row flagged isStartingStack, not as a purchase).',
                    'This endpoint reports history only: purchases dated after today (UTC) are left out, '
                    + 'and a future endDate is cut back to today (inputs.endDateClamped).',
                    'Numeric params above their upper bound are clamped to it and the value used is echoed in inputs '
                    + `(amount and startingCost ${grouped(LIMITS.maxAmount)}; startingBtc ${grouped(LIMITS.maxStartingBtc)}; `
                    + `esc ${LIMITS.maxEscalationPct}). fee outside 0-${LIMITS.maxFeePct}, flat outside 0-${grouped(LIMITS.maxFlatFee)}, `
                    + 'an amount of zero and any negative value are rejected with a 400.',
                    provenanceNote(history.servedProvider, { fetchedAt: history.fetchedAt, lastRowTs: lastPriceTs }),
                    'Educational simulation, not investment advice.',
                ].join(' '),
            },
            {
                headers: {
                    ...CORS_HEADERS,
                    // A response priced on a fallback, an earlier copy, or
                    // without a live quote is not kept for the full half hour.
                    'Cache-Control': cacheControl('dca', history.fallback || history.stale || spot === null),
                },
            },
        );
    } catch (error) {
        console.error('[api/v1/dca] failed:', error);
        return jsonError(503, 'Both price providers are unreachable right now. Try again in a minute.');
    }
}
