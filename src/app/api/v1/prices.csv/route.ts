import { NextRequest } from 'next/server';
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
 * GET /api/v1/prices.csv — the same daily BTC/USD series as /api/v1/prices,
 * as a downloadable CSV (`date,usd` rows). Same params: from, to, provider.
 *
 * The body stays pure data — no comment rows, so it opens clean in any
 * spreadsheet or parser. Provenance travels in the X-Data-Note header and the
 * /developers docs instead. Errors are still JSON.
 */
export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';

// Cents are enough once BTC trades above $1; the 2010-2011 era needs four
// decimals or the whole year would flatten to "0.07". The JSON endpoint
// returns unrounded values.
const formatUsd = (close: number): string => (close >= 1 ? close.toFixed(2) : close.toFixed(4));

// HTTP header values must be Latin-1 — undici throws outright on the note's
// em dash, turning every response into a 503.
const headerSafe = (value: string): string => value.replace(/[^\x20-\x7E]/g, '-');

export function OPTIONS() {
    return handleOptions();
}

export async function GET(request: NextRequest) {
    const query = resolvePriceQuery(request.nextUrl.searchParams);
    if ('error' in query) return jsonError(400, query.error);

    try {
        const series = await getDailyCloseSeries(query.fromTs, query.toTs, query.provider);
        const lines = ['date,usd'];
        for (const [ts, close] of series) {
            lines.push(`${formatUtc(ts, 'isoDay')},${formatUsd(close)}`);
        }

        const from = formatUtc(query.fromTs, 'isoDay');
        const to = formatUtc(query.toTs, 'isoDay');
        return new Response(lines.join('\n') + '\n', {
            headers: {
                ...CORS_HEADERS,
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="btc-usd-daily-${query.provider}-${from}-${to}.csv"`,
                'X-Data-Note': headerSafe(provenanceNote(query.provider)),
                'Cache-Control': CACHE_CONTROL,
            },
        });
    } catch (error) {
        console.error('[api/v1/prices.csv] failed:', error);
        return jsonError(503, 'Both price providers are unreachable right now. Try again in a minute.');
    }
}
