import { NextRequest, NextResponse } from 'next/server';
import { formatUtc } from '@/utils/dates';
import {
    CORS_HEADERS,
    getDailyCloseSeries,
    handleOptions,
    jsonError,
    provenanceNote,
    resolvePriceQuery,
} from '../shared';

/**
 * GET /api/v1/prices — daily BTC/USD closes as JSON. Free, no auth, CORS open.
 *
 * Params (all optional):
 *   from, to   ISO dates (yyyy-MM-dd); default full history (2010-08-18 → today)
 *   provider   kraken | coinbase; default kraken
 *
 * Documented at /developers. force-dynamic keeps the build from prerendering
 * this route (and hitting the exchanges at build time); the CDN caches instead,
 * via the explicit Cache-Control below.
 */
export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';

export function OPTIONS() {
    return handleOptions();
}

export async function GET(request: NextRequest) {
    const query = resolvePriceQuery(request.nextUrl.searchParams);
    if ('error' in query) return jsonError(400, query.error);

    try {
        const series = await getDailyCloseSeries(query.fromTs, query.toTs, query.provider);
        return NextResponse.json(
            {
                source: query.provider,
                asOf: new Date().toISOString(),
                from: formatUtc(query.fromTs, 'isoDay'),
                to: formatUtc(query.toTs, 'isoDay'),
                count: series.length,
                note: provenanceNote(query.provider),
                series,
            },
            { headers: { ...CORS_HEADERS, 'Cache-Control': CACHE_CONTROL } },
        );
    } catch (error) {
        console.error('[api/v1/prices] failed:', error);
        return jsonError(503, 'Both price providers are unreachable right now. Try again in a minute.');
    }
}
