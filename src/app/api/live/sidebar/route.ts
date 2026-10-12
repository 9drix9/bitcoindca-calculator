import { NextResponse } from 'next/server';
import { getLiveSidebar } from '@/app/actions';
import { LIVE_CDN_SECONDS, liveCacheControl, type LiveSidebarResponse, type LiveUnavailable } from '../contract';

/**
 * Every figure the sidebar cards show, in one response: a GET to a fixed
 * address that takes no parameters. See ../ticker/route.ts for why this is a
 * route and not a Server Action; here it is also one request where each card
 * polling for itself is ten.
 *
 * Each figure carries the time it was fetched from its provider. One that is
 * unavailable is null, and the response is then held at the CDN for less time,
 * so the figure is back soon after its provider is. With no figure at all the
 * answer is a 503, which is not held.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<LiveSidebarResponse | LiveUnavailable>> {
    const sidebar = await getLiveSidebar();
    // Without a FRED key the purchasing-power card is switched off, not failing.
    const figures = Object.entries(sidebar)
        .filter(([name]) => name !== 'purchasingPower' || Boolean(process.env.FRED_API_KEY))
        .map(([, figure]) => figure);
    const missing = figures.filter((figure) => figure === null).length;

    if (missing === figures.length) {
        return NextResponse.json(
            { error: 'No figure is available right now.' },
            { status: 503, headers: { 'Cache-Control': liveCacheControl(0) } },
        );
    }
    const seconds = missing > 0 ? LIVE_CDN_SECONDS.sidebarDegraded : LIVE_CDN_SECONDS.sidebar;
    return NextResponse.json(
        { ...sidebar, generatedAt: Date.now() },
        { headers: { 'Cache-Control': liveCacheControl(seconds) } },
    );
}
