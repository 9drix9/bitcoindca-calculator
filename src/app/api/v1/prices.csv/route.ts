import { NextRequest } from 'next/server';
import { formatUtc } from '@/utils/dates';
import { cacheControl, kindLabel, provenanceNote } from '../contract';
import {
    CORS_HEADERS,
    getDailySeries,
    handleOptions,
    jsonError,
    noRowsYetError,
    resolvePriceQuery,
} from '../shared';

/**
 * GET /api/v1/prices.csv — the same daily BTC/USD series as /api/v1/prices,
 * as a downloadable CSV (`date,usd` rows). Same params: from, to, provider,
 * plus kinds=1 for a third `kind` column (observed | estimated).
 *
 * The body stays pure data — no comment rows, so it opens clean in any
 * spreadsheet or parser. Provenance travels in the X-Data-* headers and the
 * /developers docs instead. Errors are still JSON.
 */
export const dynamic = 'force-dynamic';

// Cents are enough once BTC trades above $1; the 2010-2011 era needs four
// decimals or the whole year would flatten to "0.07". The JSON endpoint
// returns unrounded values.
const formatUsd = (close: number): string => (close >= 1 ? close.toFixed(2) : close.toFixed(4));

// HTTP header values must be Latin-1 — undici throws outright on anything
// else, turning every response into a 503. The note is written in ASCII
// (contract.ts); this is the guard for the day someone edits it.
const headerSafe = (value: string): string => value.replace(/[^\x20-\x7E]/g, '-');

/**
 * The `kind` column is opt-in. The file has been `date,usd` since launch, and
 * a third column breaks a caller who loads it by position (a two-column SQL
 * COPY, pandas with explicit names), so the default body is unchanged and the
 * count of estimated rows goes in a header instead.
 */
function wantsKindColumn(searchParams: URLSearchParams): boolean | { error: string } {
    const raw = searchParams.get('kinds');
    if (raw === null || raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
    return { error: "Invalid 'kinds'. Use kinds=1 to add a kind column (observed or estimated), or leave it out." };
}

export function OPTIONS() {
    return handleOptions();
}

export async function GET(request: NextRequest) {
    const now = Date.now();
    const searchParams = request.nextUrl.searchParams;
    const query = resolvePriceQuery(searchParams, now);
    if ('error' in query) return jsonError(400, query.error);
    const withKinds = wantsKindColumn(searchParams);
    if (typeof withKinds === 'object') return jsonError(400, withKinds.error);

    try {
        const result = await getDailySeries(query.fromTs, query.toTs, query.provider);
        const { series, kinds } = result;
        if (series.length === 0) return noRowsYetError(query.fromTs, query.toTs, result);

        const lines = [withKinds ? 'date,usd,kind' : 'date,usd'];
        series.forEach(([ts, close], i) => {
            const row = `${formatUtc(ts, 'isoDay')},${formatUsd(close)}`;
            lines.push(withKinds ? `${row},${kindLabel(kinds[i])}` : row);
        });

        const from = formatUtc(query.fromTs, 'isoDay');
        const to = formatUtc(query.toTs, 'isoDay');
        const note = provenanceNote(result.served, {
            requested: result.requested,
            stale: result.stale,
            fetchedAt: result.fetchedAt,
            lastRowTs: series[series.length - 1][0],
            rows: series.length,
            estimatedRows: result.estimatedCount,
        });
        return new Response(lines.join('\n') + '\n', {
            headers: {
                ...CORS_HEADERS,
                'Content-Type': 'text/csv; charset=utf-8',
                // Named after the exchange whose prices are in the file. During a
                // fallback that is not the one in the URL, and a file saved as
                // "...-coinbase-..." must not hold Kraken's straight lines.
                'Content-Disposition': `attachment; filename="btc-usd-daily-${result.served}-${from}-${to}.csv"`,
                'X-Data-Note': headerSafe(note),
                'X-Data-Served': result.served,
                'X-Data-Fetched-At': new Date(result.fetchedAt).toISOString(),
                'X-Data-Estimated-Rows': String(result.estimatedCount),
                'Cache-Control': cacheControl('prices', result.fallback || result.stale),
            },
        });
    } catch (error) {
        console.error('[api/v1/prices.csv] failed:', error);
        return jsonError(503, 'Both price providers are unreachable right now. Try again in a minute.');
    }
}
