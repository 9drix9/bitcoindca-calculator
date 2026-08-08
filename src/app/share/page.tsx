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

// Every request carries its own params and the OG copy depends on live prices.
export const dynamic = 'force-dynamic';

interface SharePageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const GENERIC_TITLE = 'Bitcoin DCA Calculator — Backtest Dollar-Cost Averaging BTC';
const GENERIC_DESCRIPTION =
    'Backtest a Bitcoin dollar-cost averaging strategy with real market data — invested total, current value, ROI, and BTC stacked.';

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
        const resolved = resolveShareParams(toCalculatorParams(await searchParams));
        const query = encodeShareQuery(resolved);
        const card = await computeShareCard(resolved);
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
        <div className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-4 py-16 dark:bg-slate-950">
            <ShareRedirect target={target} />
            <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <Logo className="mx-auto mb-5 h-12 w-12 text-amber-600 dark:text-amber-400" />
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                    Opening the calculator&hellip;
                </h1>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    You are being forwarded to this shared DCA backtest.
                </p>
                <Link
                    href={target}
                    className="mt-6 inline-block rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-600"
                >
                    Open the calculator
                </Link>
            </div>
        </div>
    );
}
