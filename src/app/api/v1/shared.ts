import { NextResponse } from 'next/server';
import { getBitcoinPriceHistoryWithMeta } from '@/app/actions';
import { DEFAULT_PRICE_PROVIDER, PRICE_PROVIDERS, isPriceProvider, type PriceProvider } from '@/data/priceSources';
import { DAY_MS, EARLIEST_PRICE_DATE, EARLIEST_PRICE_TS, formatUtc, utcDayStart, utcIsoToday } from '@/utils/dates';
import { PRICE_KIND_CODE } from '@/utils/dca';
import { countPriceKinds, sliceDailySeries } from '@/utils/priceSeries';
import { EXPOSED_HEADERS } from './contract';

// Shared plumbing for the public /api/v1 endpoints (documented at /developers).
//
// These routes are deliberately open: no API keys, no accounts, no rate-limit
// code. Every success response carries a long s-maxage, so a repeat of the
// exact same URL is absorbed at the CDN edge. That is a courtesy to repeat
// callers, not a limit: a URL that differs in any way is its own cache entry
// and runs here. What it cannot do is multiply calls to the exchanges, because
// the price series is cached server-side whatever the URL (app/actions.ts).

export const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': EXPOSED_HEADERS.join(', '),
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
 * Strict 'yyyy-MM-dd' parse to UTC midnight ms. The parts are read back, so
 * 2023-02-30 is rejected rather than rolled over to March 2. setUTCFullYear,
 * not Date.UTC, which maps years 0-99 to 1900-1999: any real date parses, and
 * the range checks decide what to do with it.
 */
export function parseIsoDayParam(value: string): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) return null;
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
    return date.getTime();
}

export interface PriceQuery {
    fromTs: number;
    toTs: number;
    provider: PriceProvider;
}

/**
 * Validate and resolve ?from, ?to, ?provider for the two price endpoints.
 * Garbage 400s loudly; a missing param falls back to the documented default
 * (full history, the site's default provider). Dates outside the priceable
 * range are clamped, same as the calculator: nothing before 2010-08-18 can be
 * priced honestly, and the future has no prices.
 *
 * A range that lies wholly outside it cannot be clamped into anything, so it
 * is refused with the reason, each case in its own words: a caller who asked
 * for next year should not be told their dates are in the wrong order.
 */
export function resolvePriceQuery(
    searchParams: URLSearchParams,
    now: number = Date.now(),
): PriceQuery | { error: string } {
    const providerRaw = searchParams.get('provider');
    if (providerRaw !== null && !isPriceProvider(providerRaw)) {
        return { error: `Invalid 'provider'. Valid values: ${PRICE_PROVIDERS.join(', ')}.` };
    }
    const provider: PriceProvider = providerRaw ?? DEFAULT_PRICE_PROVIDER;

    const todayTs = utcDayStart(now);

    const fromRaw = searchParams.get('from');
    const from = fromRaw === null ? null : parseIsoDayParam(fromRaw);
    if (fromRaw !== null && from === null) {
        return { error: "Invalid 'from'. Expected an ISO date like 2017-01-31." };
    }

    const toRaw = searchParams.get('to');
    const to = toRaw === null ? null : parseIsoDayParam(toRaw);
    if (toRaw !== null && to === null) {
        return { error: "Invalid 'to'. Expected an ISO date like 2024-12-31." };
    }

    if (from !== null && to !== null && from > to) {
        return { error: `'from' (${fromRaw}) must be on or before 'to' (${toRaw}).` };
    }
    if (to !== null && to < EARLIEST_PRICE_TS) {
        return { error: `'to' (${toRaw}) is before the price data begins (${EARLIEST_PRICE_DATE}).` };
    }
    if (from !== null && from > todayTs) {
        return { error: `'from' (${fromRaw}) is after today (${utcIsoToday(now)}, UTC). There are no prices for future dates.` };
    }

    return {
        fromTs: Math.max(from ?? EARLIEST_PRICE_TS, EARLIEST_PRICE_TS),
        toTs: Math.min(to ?? todayTs, todayTs),
        provider,
    };
}

export interface ApiPriceSeries {
    /** One [utcMidnightMs, usd] entry per UTC day over the requested range, oldest first. */
    series: [number, number][];
    /** One character per entry of `series`, same order: 'o' observed, 'e' straight-line estimate. */
    kinds: string;
    /** How many entries of `series` are estimates. */
    estimatedCount: number;
    /** The provider that was asked for. */
    requested: PriceProvider;
    /** The provider whose series this is. */
    served: PriceProvider;
    /** True when the requested provider could not be reached and the other one answered. */
    fallback: boolean;
    /** True when the provider could not be reached just now and this is a copy fetched earlier. */
    stale: boolean;
    /** ms epoch the series was fetched from the exchange. */
    fetchedAt: number;
    /** Last UTC day (midnight ms) the served series has a price for. */
    seriesEndTs: number;
}

/**
 * The daily series over [fromTs, toTs], inclusive, with its provenance.
 *
 * The action returns a 14-day lead-in before `from` (the calculator needs a
 * last-known price for its first purchase); the public contract is the
 * requested days and nothing else, so the lead-in is cut here, from the rows
 * and from their markers together.
 */
export async function getDailySeries(
    fromTs: number,
    toTs: number,
    provider: PriceProvider,
): Promise<ApiPriceSeries> {
    const history = await getBitcoinPriceHistoryWithMeta(fromTs, toTs + DAY_MS - 1, provider);
    // A marker on the wrong row would label a real close as an estimate, so a
    // string that does not line up with the rows is reported as "unknown".
    const allKinds = history.kinds.length === history.data.length
        ? history.kinds
        : PRICE_KIND_CODE.unknown.repeat(history.data.length);
    const { data: series, kinds } = sliceDailySeries({ data: history.data, kinds: allKinds }, fromTs, toTs, 0);

    return {
        series,
        kinds,
        estimatedCount: countPriceKinds(kinds).estimated,
        requested: history.requestedProvider,
        served: history.servedProvider,
        fallback: history.fallback,
        stale: history.stale,
        fetchedAt: history.fetchedAt,
        seriesEndTs: history.seriesEnd,
    };
}

/**
 * The 503 for a range the served series has no row in yet. Validation has
 * already confined the range to 2010-08-18..today, so this only happens for
 * the newest day or two: just after 00:00 UTC before the exchange has traded,
 * or while an earlier copy of the series is being served. Unlike the 400s,
 * asking again later does work.
 */
export function noRowsYetError(fromTs: number, toTs: number, result: ApiPriceSeries): NextResponse {
    const range = fromTs === toTs
        ? formatUtc(fromTs, 'isoDay')
        : `${formatUtc(fromTs, 'isoDay')} to ${formatUtc(toTs, 'isoDay')}`;
    return jsonError(
        503,
        `No price for ${range} yet: the ${result.served} series currently ends ${formatUtc(result.seriesEndTs, 'isoDay')}. `
        + 'Try again in a few minutes.',
    );
}
