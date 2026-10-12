import { unstable_cache } from 'next/cache';
import { FAILURE_REVALIDATE } from '@/utils/revalidate';

/**
 * Keeps a failure from being cached for a day.
 *
 * The data pages are statically rendered and refreshed every 24 hours
 * (`export const revalidate = 86400`). If an exchange is unreachable at the
 * moment one of them is rendered, the page that gets cached is the degraded
 * one, and without this it would stay up long after the exchange was back.
 *
 * Next lowers a route's revalidate to the smallest one any cached read inside
 * the render asks for, so a cached read with a short lifetime shortens the
 * life of that one render and nothing else. The value read is irrelevant; the
 * lifetime is the point. Outside a static render (a server action, a route
 * handler, a dynamic page) there is no page lifetime to shorten and this does
 * nothing.
 *
 * app/actions.ts calls this whenever it serves a fallback or a stale series,
 * or fails outright; a page that renders a degraded state of its own making
 * can call it too.
 *
 * Next's docs state the "lowest revalidate wins" rule for `fetch` only; that
 * `unstable_cache` counts the same way is in its source. Checked on a
 * production build (`next start`, Next 16.3.8) on 2026-10-12: with requests
 * to the exchanges made to fail, a page normally served with `s-maxage=86400`
 * was regenerated and served with `s-maxage=300`. Repeat the check after a
 * Next upgrade.
 */
const shortLivedRead = unstable_cache(async () => 0, ['render-expires-soon'], { revalidate: FAILURE_REVALIDATE });

export async function expireRenderSoon(): Promise<void> {
    try {
        await shortLivedRead();
    } catch {
        // No Next request in progress (a unit test, a script): nothing to shorten.
    }
}
