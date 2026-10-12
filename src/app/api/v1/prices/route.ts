import { NextRequest, NextResponse } from 'next/server';
import { formatUtc } from '@/utils/dates';
import { cacheControl, provenanceNote } from '../contract';
import {
    CORS_HEADERS,
    getDailySeries,
    handleOptions,
    jsonError,
    noRowsYetError,
    resolvePriceQuery,
} from '../shared';

/**
 * GET /api/v1/prices — daily BTC/USD prices as JSON. Free, no auth, CORS open.
 *
 * Params (all optional):
 *   from, to   ISO dates (yyyy-MM-dd); default full history (2010-08-18 → today)
 *   provider   coinbase | kraken; default coinbase
 *
 * Documented at /developers. force-dynamic keeps the build from prerendering
 * this route (and hitting the exchanges at build time); the CDN caches instead,
 * via the explicit Cache-Control below.
 */
export const dynamic = 'force-dynamic';

export function OPTIONS() {
    return handleOptions();
}

export async function GET(request: NextRequest) {
    const now = Date.now();
    const query = resolvePriceQuery(request.nextUrl.searchParams, now);
    if ('error' in query) return jsonError(400, query.error);

    try {
        const result = await getDailySeries(query.fromTs, query.toTs, query.provider);
        const { series, kinds } = result;
        if (series.length === 0) return noRowsYetError(query.fromTs, query.toTs, result);

        return NextResponse.json(
            {
                // `source` is what was ASKED for, which is how existing callers
                // read it. `served` is whose series this is; the two differ only
                // when `fallback` is true.
                source: query.provider,
                served: result.served,
                fallback: result.fallback,
                stale: result.stale,
                asOf: new Date(now).toISOString(),
                seriesFetchedAt: new Date(result.fetchedAt).toISOString(),
                from: formatUtc(query.fromTs, 'isoDay'),
                to: formatUtc(query.toTs, 'isoDay'),
                count: series.length,
                estimatedCount: result.estimatedCount,
                kinds,
                note: provenanceNote(result.served, {
                    requested: result.requested,
                    stale: result.stale,
                    fetchedAt: result.fetchedAt,
                    lastRowTs: series[series.length - 1][0],
                    rows: series.length,
                    estimatedRows: result.estimatedCount,
                }),
                series,
            },
            {
                headers: {
                    ...CORS_HEADERS,
                    'Cache-Control': cacheControl('prices', result.fallback || result.stale),
                },
            },
        );
    } catch (error) {
        console.error('[api/v1/prices] failed:', error);
        return jsonError(503, 'Both price providers are unreachable right now. Try again in a minute.');
    }
}
