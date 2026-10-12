import { NextResponse } from 'next/server';
import { getLiveTicker } from '@/app/actions';
import { LIVE_CDN_SECONDS, liveCacheControl, type LiveTickerResponse, type LiveUnavailable } from '../contract';

/**
 * The hero ticker's price: a GET to a fixed address that takes no parameters,
 * so the request says nothing about the visitor or the plan on screen.
 *
 * A GET, not a Server Action, for two reasons. A browser sends a page's Server
 * Actions one at a time, so a poll in that queue holds up the calculator's own
 * requests. And an action is a POST to the page's address, which no CDN can
 * answer; this response can be held at the edge for a few seconds and shared
 * by everyone polling.
 *
 * The work is bounded by what getLiveTicker does: one cached read per exchange
 * and lifetime, a three-second timeout, and a cool-off for an exchange that
 * just failed. A query string changes none of that.
 *
 * Disallowed in robots.txt (/api/ is blocked), and public/sw.js passes /api/
 * straight to the network.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<LiveTickerResponse | LiveUnavailable>> {
    const quote = await getLiveTicker();
    if (!quote) {
        // Not held at the CDN: an outage must not outlast itself there.
        return NextResponse.json(
            { error: 'Neither exchange has a current quote.' },
            { status: 503, headers: { 'Cache-Control': liveCacheControl(0) } },
        );
    }
    return NextResponse.json(
        { ...quote, generatedAt: Date.now() },
        { headers: { 'Cache-Control': liveCacheControl(LIVE_CDN_SECONDS.ticker) } },
    );
}
