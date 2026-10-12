import type { Metadata } from 'next';
import Link from 'next/link';
import {
    computeShareCard,
    encodeShareQuery,
    resolveShareParams,
    toCalculatorParams,
} from './shareData';
import { ShareRedirect } from './ShareRedirect';
import { Logo } from '@/components/brand/Logo';
import { withDeadline } from '@/utils/upstream';

// Every request carries its own params and the OG copy depends on live prices.
export const dynamic = 'force-dynamic';

interface SharePageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const GENERIC_TITLE = 'Bitcoin DCA Calculator — Backtest Dollar-Cost Averaging BTC';
const GENERIC_DESCRIPTION =
    'Backtest a Bitcoin dollar-cost averaging strategy with real market data: invested total, current value, ROI, and BTC stacked.';

/**
 * The longest the title and description wait for the figures. A client that is
 * sent its metadata in <head> instead of streamed (htmlLimitedBots in
 * next.config) gets nothing of this page until generateMetadata answers, the
 * redirect to the calculator included, and an exchange that hangs can hold a
 * price request for far longer than anyone waits on a link. Past this the
 * link gets the generic copy; its image is /api/og's own request either way.
 *
 * Long enough for one exchange's live quote to time out and the other one to
 * answer in its place.
 */
const CARD_WAIT_MS = 4_000;

function buildMetadata(title: string, description: string, query: string): Metadata {
    const shareUrl = query ? `/share?${query}` : '/share';
    const imageUrl = query ? `/api/og?${query}` : '/api/og';
    return {
        title: { absolute: title },
        description,
        // Parameterized share pages must not enter the index; the calculator is canonical.
        robots: { index: false, follow: true },
        alternates: { canonical: '/' },
        openGraph: {
            title,
            description,
            url: shareUrl,
            siteName: 'Bitcoin DCA Calculator',
            type: 'website',
            images: [{ url: imageUrl, width: 1200, height: 630, alt: title }],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: [imageUrl],
        },
    };
}

export async function generateMetadata({ searchParams }: SharePageProps): Promise<Metadata> {
    try {
        const raw = await searchParams;
        // One reading of the clock for the default dates and for "today" in
        // the figures. Read twice, the two could land either side of a UTC
        // midnight: a default end date of yesterday, counted up to today, and
        // a plan still running worded as one that had ended.
        const now = Date.now();
        const resolved = resolveShareParams(toCalculatorParams(raw), now);
        // The link and the image URL carry the plan as shared, future end date
        // and all. The title and description describe it up to today only
        // (computeShareCard), and fall back to the generic copy when there is
        // no history to describe: a plan that has not started, or no prices.
        const query = encodeShareQuery(resolved);
        const card = await withDeadline(computeShareCard(resolved, now), CARD_WAIT_MS, 'share card').catch(() => null);
        if (!card) return buildMetadata(GENERIC_TITLE, GENERIC_DESCRIPTION, query);
        return buildMetadata(card.title, card.description, query);
    } catch {
        return buildMetadata(GENERIC_TITLE, GENERIC_DESCRIPTION, '');
    }
}

export default async function SharePage({ searchParams }: SharePageProps) {
    let query = '';
    try {
        query = encodeShareQuery(resolveShareParams(toCalculatorParams(await searchParams)));
    } catch {
        query = '';
    }
    const target = query ? `/?${query}` : '/';

    return (
        // A full screen tall, so the footer starts below the fold. The
        // calculator replaces this page a moment later, and a footer that was
        // in view would jump out of it: a layout shift for everyone a link is
        // sent to.
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-16 dark:bg-slate-950">
            <ShareRedirect target={target} />
            <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <Logo className="mx-auto mb-5 h-12 w-12 text-amber-600 dark:text-amber-400" />
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                    Opening the calculator&hellip;
                </h1>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    Taking you to this shared DCA backtest now.
                </p>
                {/* min-h-11: the fallback for anyone the redirect does not carry, at the 44px touch-target floor. */}
                <Link
                    href={target}
                    className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-600"
                >
                    Open the calculator
                </Link>
            </div>
        </div>
    );
}
