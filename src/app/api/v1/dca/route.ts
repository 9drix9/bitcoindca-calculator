import { NextRequest, NextResponse } from 'next/server';
import type { CalculatorSearchParams } from '@/types';
import { decodeParams } from '@/utils/urlParams';
import { calculateDca } from '@/utils/dca';
import { getBitcoinPriceHistory, getCurrentBitcoinPriceWithFallback } from '@/app/actions';
import { DAY_MS, EARLIEST_PRICE_TS, formatUtc, parseUtcDate } from '@/utils/dates';
import { CORS_HEADERS, handleOptions, jsonError, provenanceNote } from '../shared';

/**
 * GET /api/v1/dca — the calculator's full backtest as JSON. Free, no auth,
 * CORS open. Params mirror the calculator's shareable URLs (all optional):
 *
 *   amount      USD per purchase (default 50)
 *   frequency   daily | weekly | biweekly | monthly (default weekly)
 *   startDate   ISO date (default 5 years before endDate)
 *   endDate     ISO date (default today)
 *   fee         exchange fee %, 0-50 (default 0.5)
 *   provider    kraken | coinbase (default kraken)
 *
 * Same pipeline as the on-site calculator and the /share cards: price history
 * + live spot into calculateDca. All figures are USD. Documented at /developers.
 */
export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'public, s-maxage=1800, stale-while-revalidate=86400';

/**
 * Full daily history for >5 years of purchases is a large payload; ~2000 rows
 * keeps the response under ~500KB while purchaseCount stays the true total.
 */
const BREAKDOWN_CAP = 2000;

export function OPTIONS() {
    return handleOptions();
}

export async function GET(request: NextRequest) {
    const sp = request.nextUrl.searchParams;
    const raw: CalculatorSearchParams = {
        amount: sp.get('amount') ?? undefined,
        frequency: sp.get('frequency') ?? undefined,
        startDate: sp.get('startDate') ?? undefined,
        endDate: sp.get('endDate') ?? undefined,
        fee: sp.get('fee') ?? undefined,
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
    if (raw.amount !== undefined && decoded.amount === undefined) {
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
        rejections.push("'fee' must be a percentage between 0 and 50");
    }
    if (raw.provider !== undefined && decoded.provider === undefined) {
        rejections.push("'provider' must be kraken or coinbase");
    }
    if (raw.startingBtc !== undefined && decoded.startingBtc === undefined) {
        rejections.push("'startingBtc' must be a positive number of BTC already held (max 21,000,000)");
    }
    if (raw.startingCost !== undefined && decoded.startingAvgCost === undefined) {
        rejections.push("'startingCost' must be a positive USD cost per BTC for the starting stack");
    }
    if (raw.esc !== undefined && decoded.annualEscalationPct === undefined) {
        rejections.push("'esc' must be a yearly purchase-amount increase between 0 and 200 (percent)");
    }
    if (raw.startingCost !== undefined && !(decoded.startingBtc && decoded.startingBtc > 0)) {
        rejections.push("'startingCost' only makes sense together with a positive 'startingBtc'");
    }
    if (rejections.length > 0) return jsonError(400, rejections.join('; ') + '.');

    // Defaults mirror the calculator: $50/week over the last 5 years, 0.5% fee.
    const endDate = decoded.endDate ?? formatUtc(Date.now(), 'isoDay');
    let startDate = decoded.startDate;
    if (!startDate) {
        const end = new Date(parseUtcDate(endDate));
        startDate = formatUtc(
            Date.UTC(end.getUTCFullYear() - 5, end.getUTCMonth(), end.getUTCDate()),
            'isoDay',
        );
    }
    const amount = decoded.amount ?? 50;
    const frequency = decoded.frequency ?? 'weekly';
    const feePercentage = decoded.feePercentage ?? 0.5;
    const provider = decoded.provider ?? 'kraken';

    const startTs = parseUtcDate(startDate);
    let endTs = parseUtcDate(endDate);
    if (startTs > endTs) {
        return jsonError(400, `'startDate' (${startDate}) must be on or before 'endDate' (${endDate}). Note: start dates before 2010-08-18 are clamped to 2010-08-18, the first day with a real market price.`);
    }

    // This endpoint reports HISTORY. The engine can extend a schedule past today
    // by carrying the last price forward (the site's Projection tab uses that,
    // clearly labeled) — but an API response has no place to carry that caveat
    // per-row, so future purchases would masquerade as backtest data. Clamp
    // instead of reject: the caller still gets the real backtest-to-date, with
    // the clamp declared in `inputs` and `note`.
    const todayTs = parseUtcDate(formatUtc(Date.now(), 'isoDay'));
    let endDateClamped = false;
    if (endTs > todayTs) {
        endTs = todayTs;
        endDateClamped = true;
    }
    // A window that ends before our data begins is a caller error, not an
    // outage — do not tell them to retry something that can never succeed.
    if (endTs < EARLIEST_PRICE_TS) {
        return jsonError(400, `The requested window ends before the price data begins (2010-08-18). Pick an endDate on or after it.`);
    }

    try {
        const [history, spot] = await Promise.all([
            getBitcoinPriceHistory(startTs, endTs + DAY_MS, provider),
            getCurrentBitcoinPriceWithFallback(provider),
        ]);
        if (!history || history.length === 0) {
            return jsonError(503, 'No price history available right now. Try again in a minute.');
        }

        const result = calculateDca(
            {
                amount,
                frequency,
                startDate: new Date(startTs),
                endDate: new Date(endTs),
                feePercentage,
                priceMode: 'api',
                manualPrice: 0,
                startingBtc: decoded.startingBtc,
                startingAvgCost: decoded.startingAvgCost,
                annualEscalationPct: decoded.annualEscalationPct ?? 0,
            },
            history,
            spot,
        );
        if (!Number.isFinite(result.totalInvested) || !Number.isFinite(result.currentValue)) {
            return jsonError(500, 'The backtest produced a non-finite result. Please report this at github.com/9drix9/bitcoindca-calculator.');
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

        return NextResponse.json(
            {
                inputs: {
                    amountUsd: amount, frequency, startDate,
                    endDate: endDateClamped ? formatUtc(endTs, 'isoDay') : endDate,
                    ...(endDateClamped ? { endDateClamped: true, requestedEndDate: endDate } : {}),
                    feePercent: feePercentage, provider,
                    // Echoed only when supplied, so the common response shape stays stable.
                    ...(decoded.startingBtc !== undefined ? { startingBtc: decoded.startingBtc } : {}),
                    ...(decoded.startingAvgCost !== undefined ? { startingCostUsd: decoded.startingAvgCost } : {}),
                    ...(decoded.annualEscalationPct !== undefined ? { annualEscalationPercent: decoded.annualEscalationPct } : {}),
                },
                asOf: new Date().toISOString(),
                currency: 'USD',
                totalInvested: result.totalInvested,
                btcAccumulated: result.btcAccumulated,
                averageCost: result.averageCost,
                currentValue: result.currentValue,
                profit: result.profit,
                roiPercent: result.roi,
                xirrPercent: result.stats?.xirrPercent ?? null,
                maxDrawdownPercent: result.stats?.maxDrawdownPercent ?? null,
                // Scheduled market buys only — a starting stack adds a breakdown
                // row (flagged isStartingStack) but is a position, not a purchase.
                purchaseCount: full.filter((b) => !b.isStartingStack).length,
                spotPriceUsd: spot,
                breakdownSampled,
                breakdown,
                note:
                    'All figures are USD. currentValue uses the live spot price when available, otherwise the last candle\'s close. '
                    + `xirrPercent is null for windows under 90 days. When a schedule exceeds ${BREAKDOWN_CAP} purchases, `
                    + 'breakdown is evenly thinned (breakdownSampled: true) and purchaseCount is the true total of scheduled buys '
                    + '(a startingBtc stack appears as a breakdown row flagged isStartingStack, not as a purchase). '
                    + 'This endpoint reports history only: a future endDate is clamped to today (inputs.endDateClamped). '
                    + 'Out-of-range numeric params are clamped to their documented bounds. '
                    + provenanceNote(provider)
                    + ' Educational simulation, not investment advice.',
            },
            { headers: { ...CORS_HEADERS, 'Cache-Control': CACHE_CONTROL } },
        );
    } catch (error) {
        console.error('[api/v1/dca] failed:', error);
        return jsonError(503, 'Both price providers are unreachable right now. Try again in a minute.');
    }
}
