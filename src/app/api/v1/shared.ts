import { NextResponse } from 'next/server';
import { getBitcoinPriceHistory, type Provider } from '@/app/actions';
import { DAY_MS, EARLIEST_PRICE_DATE, parseUtcDate, formatUtc, utcDayIndex, utcDayStart } from '@/utils/dates';

// Shared plumbing for the public /api/v1 endpoints (documented at /developers).
//
// These routes are deliberately open: no API keys, no accounts, no rate-limit
// code. The protection is the CDN — every success response carries a long
// s-maxage, so repeated identical requests are absorbed at the edge and never
// reach this server or the upstream exchanges.

export const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
} as const;

/** CORS preflight for browser callers. Shared by all /api/v1 routes. */
export function handleOptions(): Response {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Errors are always JSON and never cached: a transient upstream outage must
 * not be pinned at the edge for an hour, and a 400 for a garbage URL gains
 * nothing from caching (each garbage URL is its own cache key anyway).
 */
export function jsonError(status: number, message: string): NextResponse {
    return NextResponse.json(
        { error: message },
        { status, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } },
    );
}

/**
 * Strict 'yyyy-MM-dd' parse to UTC midnight ms. Round-trips through the
 * formatter so 2023-02-30 is rejected rather than rolled over to March 2.
 */
export function parseIsoDayParam(value: string): number | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const ts = parseUtcDate(value);
    if (Number.isNaN(ts) || formatUtc(ts, 'isoDay') !== value) return null;
    return ts;
}

export interface PriceQuery {
    fromTs: number;
    toTs: number;
    provider: Provider;
}

/**
 * Validate and resolve ?from, ?to, ?provider for the two price endpoints.
 * Garbage 400s loudly; a missing param falls back to the documented default
 * (full history, kraken). Dates outside the priceable range are clamped, same
 * as the calculator: nothing before 2010-08-18 can be priced honestly, and the
 * future has no closes.
 */
export function resolvePriceQuery(searchParams: URLSearchParams): PriceQuery | { error: string } {
    const providerRaw = searchParams.get('provider');
    if (providerRaw !== null && providerRaw !== 'kraken' && providerRaw !== 'coinbase') {
        return { error: "Invalid 'provider'. Valid values: kraken, coinbase." };
    }
    const provider: Provider = providerRaw === 'coinbase' ? 'coinbase' : 'kraken';

    const earliestTs = parseUtcDate(EARLIEST_PRICE_DATE);
    const todayTs = utcDayStart(Date.now());

    let fromTs = earliestTs;
    const fromRaw = searchParams.get('from');
    if (fromRaw !== null) {
        const ts = parseIsoDayParam(fromRaw);
        if (ts === null) return { error: "Invalid 'from'. Expected an ISO date like 2017-01-31." };
        fromTs = Math.max(ts, earliestTs);
    }

    let toTs = todayTs;
    const toRaw = searchParams.get('to');
    if (toRaw !== null) {
        const ts = parseIsoDayParam(toRaw);
        if (ts === null) return { error: "Invalid 'to'. Expected an ISO date like 2024-12-31." };
        toTs = Math.min(ts, todayTs);
    }

    if (fromTs > toTs) {
        return { error: `'from' must be on or before 'to' (and within the priceable range, ${EARLIEST_PRICE_DATE} to today).` };
    }

    return { fromTs, toTs, provider };
}

/**
 * One [utcMidnightMs, closeUsd] entry per UTC day over [fromTs, toTs], inclusive.
 *
 * getBitcoinPriceHistory keeps a 14-day lead-in before `from`, and Kraken's
 * still-open final candle can carry an intra-day timestamp — so the raw series
 * is re-bucketed by UTC day (last value per day wins) to make the public
 * contract exact: timestamps are always UTC midnights, one point per day.
 */
export async function getDailyCloseSeries(
    fromTs: number,
    toTs: number,
    provider: Provider,
): Promise<[number, number][]> {
    const history = await getBitcoinPriceHistory(fromTs, toTs + DAY_MS - 1, provider);
    const fromDay = utcDayIndex(fromTs);
    const toDay = utcDayIndex(toTs);
    const byDay = new Map<number, number>();
    for (const [ts, close] of history) {
        const day = utcDayIndex(ts);
        if (day >= fromDay && day <= toDay) byDay.set(day, close);
    }
    return Array.from(byDay.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([day, close]) => [day * DAY_MS, close]);
}

/** Last day covered by the bundled blockchain.info snapshot (see data/btcHistorical.ts). */
export const SNAPSHOT_END_DATE = '2015-07-19';

/**
 * Honest provenance, stated in the payload itself so a downloaded series can
 * never be mistaken for something it is not. Mirrors /methodology.
 */
export function provenanceNote(provider: Provider): string {
    const shared =
        `All prices are USD, one close per UTC day. ${EARLIEST_PRICE_DATE} through ${SNAPSHOT_END_DATE} ` +
        'are real daily closes from a bundled blockchain.info snapshot.';
    const providerPart = provider === 'coinbase'
        ? ' Later dates are real Coinbase daily candles.'
        : ' Later dates are Kraken weekly closes linearly interpolated to daily — intra-week moves are smoothed estimates, not real daily prices.'
        + ' For real daily candles use provider=coinbase.';
    const fallback =
        ' If the requested exchange is unreachable, the server transparently serves the other exchange\'s series' +
        ' (or an up-to-an-hour-stale cache) rather than failing.';
    return shared + providerPart + fallback;
}
