import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { Card } from '@/components/ui/Card';
import { DrawdownCalculator } from '@/components/DrawdownCalculator';
import { getBitcoinPriceHistory, getCurrentBitcoinPrice } from '@/app/actions';
import { calculateDca } from '@/utils/dca';
import { DAY_MS, EARLIEST_PRICE_TS, formatUtc } from '@/utils/dates';

const BASE_URL = 'https://btcdollarcostaverage.com';
const PATH = '/calculators/bitcoin-drawdown';

// Reads `?btc=` so the spend-down planner can run on the visitor's own stack, which
// makes the route dynamic. The underlying price fetches are server-cached, so every
// render still hits a warm cache and recomputes against fresh prices.

type PageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// ── Formatting (server-rendered SEO pages are USD-only by design) ──────────────

function fmtUsd(value: number): string {
    const whole = Math.abs(value) >= 1000;
    return value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: whole ? 0 : 2,
        maximumFractionDigits: whole ? 0 : 2,
    });
}

function fmtPct(value: number, signed = false): string {
    const digits = Math.abs(value) >= 100 ? 0 : 1;
    const text = value.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
    });
    return `${signed && value > 0 ? '+' : ''}${text}%`;
}

function fmtBtc(value: number): string {
    const decimals = value >= 1 ? 4 : 8;
    const text = value
        .toFixed(decimals)
        .replace(/(\.\d*?)0+$/, '$1')
        .replace(/\.$/, '');
    return `${text} BTC`;
}

/** Human duration for a day count: "47 days", "8 months", "2.9 years". */
function fmtDays(days: number): string {
    if (days < 60) return `${Math.round(days)} days`;
    if (days < 730) return `${Math.round(days / 30.44)} months`;
    return `${(days / 365.25).toFixed(1)} years`;
}

// ── Drawdown detection ────────────────────────────────────────────────────────

interface Episode {
    peakTs: number;
    peakPrice: number;
    troughTs: number;
    troughPrice: number;
    /** Positive percentage, peak close to trough close */
    depthPercent: number;
    daysToTrough: number;
    /** null while the previous peak has never been reclaimed */
    recoveredTs: number | null;
    daysToRecover: number | null;
}

/**
 * Walk a daily close series and record every completed peak-to-trough episode
 * deeper than `minDepth`. A new peak closes the running episode: the drawdown is
 * "over" the day the previous high is reclaimed, which is the standard definition.
 */
function findDrawdowns(series: [number, number][], minDepth: number): Episode[] {
    const episodes: Episode[] = [];
    if (series.length < 2) return episodes;

    let peakTs = series[0][0];
    let peakPrice = series[0][1];
    let troughTs = peakTs;
    let troughPrice = peakPrice;
    let inDrawdown = false;

    const close = (recoveredTs: number | null) => {
        const depth = peakPrice > 0 ? (peakPrice - troughPrice) / peakPrice : 0;
        if (depth >= minDepth) {
            episodes.push({
                peakTs,
                peakPrice,
                troughTs,
                troughPrice,
                depthPercent: depth * 100,
                daysToTrough: (troughTs - peakTs) / DAY_MS,
                recoveredTs,
                daysToRecover: recoveredTs === null ? null : (recoveredTs - peakTs) / DAY_MS,
            });
        }
    };

    for (let i = 1; i < series.length; i++) {
        const [ts, price] = series[i];
        if (!Number.isFinite(price) || price <= 0) continue;

        if (price >= peakPrice) {
            if (inDrawdown) {
                close(ts);
                inDrawdown = false;
            }
            peakTs = ts;
            peakPrice = price;
            troughTs = ts;
            troughPrice = price;
        } else {
            if (!inDrawdown) {
                inDrawdown = true;
                troughTs = ts;
                troughPrice = price;
            } else if (price < troughPrice) {
                troughTs = ts;
                troughPrice = price;
            }
        }
    }
    if (inDrawdown) close(null);
    return episodes;
}

/** Deepest peak-to-trough decline inside a series, as a positive percentage. */
function maxDrawdownPercent(series: [number, number][]): number {
    let peak = 0;
    let worst = 0;
    for (const [, price] of series) {
        if (!Number.isFinite(price) || price <= 0) continue;
        if (price > peak) peak = price;
        else if (peak > 0) {
            const dd = (peak - price) / peak;
            if (dd > worst) worst = dd;
        }
    }
    return worst * 100;
}

// ── Server data ───────────────────────────────────────────────────────────────

const REFERENCE_AMOUNT = 100;
const REFERENCE_YEARS = 5;

interface PageData {
    currentPrice: number;
    athPrice: number;
    athTs: number;
    fromAthPercent: number;
    daysSinceAth: number;
    seriesStartTs: number;
    episodes: Episode[];
    countOver30: number;
    countOver50: number;
    countOver70: number;
    medianRecoveryDays: number | null;
    /** $100/week over the trailing 5 years, computed from the same price series */
    reference: {
        startTs: number;
        btcAccumulated: number;
        totalInvested: number;
        currentValue: number;
        portfolioDrawdownPercent: number;
        priceDrawdownPercent: number;
    } | null;
}

async function loadData(): Promise<PageData | null> {
    try {
        const now = Date.now();
        // Coinbase gives real daily candles from 2015 and the loader prepends real
        // daily market prices for 2010-2015, so this series is not interpolated.
        const [history, livePrice] = await Promise.all([
            getBitcoinPriceHistory(EARLIEST_PRICE_TS, now + DAY_MS, 'coinbase'),
            getCurrentBitcoinPrice('coinbase').catch(() => null),
        ]);
        if (!history || history.length < 500) return null;

        const currentPrice = livePrice ?? history[history.length - 1][1];
        if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

        let athPrice = 0;
        let athTs = history[0][0];
        for (const [ts, price] of history) {
            if (price > athPrice) {
                athPrice = price;
                athTs = ts;
            }
        }
        if (currentPrice > athPrice) {
            athPrice = currentPrice;
            athTs = now;
        }

        const all = findDrawdowns(history, 0.3);
        const episodes = [...all]
            .sort((a, b) => b.depthPercent - a.depthPercent)
            .slice(0, 8)
            .sort((a, b) => a.peakTs - b.peakTs);

        const recoveries = all
            .filter((e) => e.daysToRecover !== null)
            .map((e) => e.daysToRecover as number)
            .sort((a, b) => a - b);
        const medianRecoveryDays = recoveries.length > 0
            ? recoveries[Math.floor(recoveries.length / 2)]
            : null;

        // A concrete DCA-vs-price comparison over the same window.
        let reference: PageData['reference'] = null;
        const d = new Date(now);
        const startTs = Math.max(
            Date.UTC(d.getUTCFullYear() - REFERENCE_YEARS, d.getUTCMonth(), d.getUTCDate()),
            EARLIEST_PRICE_TS,
        );
        const window = history.filter(([ts]) => ts >= startTs);
        if (window.length > 100) {
            const dca = calculateDca(
                {
                    amount: REFERENCE_AMOUNT,
                    frequency: 'weekly',
                    startDate: new Date(startTs),
                    endDate: new Date(now),
                    feePercentage: 0,
                    priceMode: 'api',
                    manualPrice: 0,
                },
                history,
                currentPrice,
            );
            if (dca.btcAccumulated > 0 && Number.isFinite(dca.currentValue)) {
                reference = {
                    startTs,
                    btcAccumulated: dca.btcAccumulated,
                    totalInvested: dca.totalInvested,
                    currentValue: dca.currentValue,
                    portfolioDrawdownPercent: dca.stats?.maxDrawdownPercent ?? 0,
                    priceDrawdownPercent: maxDrawdownPercent(window),
                };
            }
        }

        return {
            currentPrice,
            athPrice,
            athTs,
            fromAthPercent: athPrice > 0 ? ((athPrice - currentPrice) / athPrice) * 100 : 0,
            daysSinceAth: (now - athTs) / DAY_MS,
            seriesStartTs: history[0][0],
            episodes,
            countOver30: all.filter((e) => e.depthPercent >= 30).length,
            countOver50: all.filter((e) => e.depthPercent >= 50).length,
            countOver70: all.filter((e) => e.depthPercent >= 70).length,
            medianRecoveryDays,
            reference,
        };
    } catch (error) {
        // Never build-fail or 500 on a provider outage.
        console.error('[calculators/bitcoin-drawdown] data load failed:', error);
        return null;
    }
}

// ── Stack size from the query string ──────────────────────────────────────────

const firstParam = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;

/** Sanitised stack size, or null when the visitor did not supply a usable one. */
function parseStackBtc(raw: string | undefined): number | null {
    if (!raw) return null;
    const n = Number(raw.replace(/[,\s]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.min(n, 21_000_000);
}

const trimBtc = (v: number): string =>
    v.toFixed(8).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata(): Promise<Metadata> {
    const title = 'Bitcoin Drawdown Calculator';
    let description =
        'See every Bitcoin drawdown deeper than 30% since 2010, measured peak-to-trough on real daily prices, and plan how long a stack would last if you started spending it down.';

    try {
        const data = await loadData();
        if (data) {
            description =
                `Bitcoin is ${fmtPct(data.fromAthPercent)} below its ${fmtUsd(data.athPrice)} all-time high. ` +
                `It has had ${data.countOver30} drawdowns deeper than 30% since 2010 on real daily prices. See the deepest ones peak-to-trough, ` +
                `why a DCA portfolio's drawdown differs from the price drawdown, and how long a stack would last in retirement.`;
        }
    } catch {
        // Keep the generic description.
    }

    return {
        title,
        description,
        keywords: [
            'bitcoin drawdown calculator',
            'bitcoin drawdown history',
            'bitcoin peak to trough',
            'btc max drawdown',
            'bitcoin bear market history',
            'bitcoin retirement drawdown',
        ],
        alternates: { canonical: PATH },
        openGraph: {
            title,
            description,
            url: PATH,
            type: 'article',
            siteName: 'Bitcoin DCA Calculator',
            locale: 'en_US',
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            creator: '@9drix9',
        },
    };
}

// ── Small presentational helpers ──────────────────────────────────────────────

function StatCard({
    label,
    value,
    sub,
    celebrated = false,
    valueClassName,
}: {
    label: string;
    value: string;
    sub?: string;
    celebrated?: boolean;
    valueClassName?: string;
}) {
    return (
        <Card celebrated={celebrated} className="p-4 sm:p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
            <p className={clsx('mt-1 text-2xl sm:text-3xl font-bold tracking-tight', valueClassName ?? 'text-slate-900 dark:text-white')}>
                {value}
            </p>
            {sub && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
        </Card>
    );
}

const proseLink = 'text-amber-700 dark:text-amber-400 hover:underline font-medium';

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BitcoinDrawdownPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const data = await loadData();

    const requestedBtc = parseStackBtc(firstParam(params.btc));
    const defaultBtc = data?.reference?.btcAccumulated ?? null;
    const stackBtc = requestedBtc ?? defaultBtc;
    const usingOwnStack = requestedBtc !== null;

    const pageUrl = `${BASE_URL}${PATH}`;

    const breadcrumbJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
            { '@type': 'ListItem', position: 2, name: 'Calculators', item: `${BASE_URL}/calculators` },
            { '@type': 'ListItem', position: 3, name: 'Bitcoin Drawdown Calculator', item: pageUrl },
        ],
    };

    const worst = data && data.episodes.length > 0
        ? data.episodes.reduce((a, b) => (b.depthPercent > a.depthPercent ? b : a))
        : null;
    const seriesStartLabel = data ? formatUtc(data.seriesStartTs, 'monthYear') : '';

    const faqs: { q: string; a: string }[] = [
        {
            q: 'What is a drawdown in Bitcoin?',
            a:
                'A drawdown is the decline from a previous high to the lowest point before that high is reclaimed, stated as a percentage of the peak. ' +
                'If Bitcoin peaks at $100,000 and later trades at $40,000 without ever having recovered in between, that is a 60% drawdown. ' +
                'The drawdown only ends when the old peak is taken out again, so a drawdown can last for years even while the price is rising.',
        },
        {
            q: 'What is the biggest Bitcoin drawdown ever recorded?',
            a: worst
                ? `On daily closing prices since ${seriesStartLabel}, the deepest completed decline in this dataset ran from ` +
                  `${formatUtc(worst.peakTs, 'full')} at ${fmtUsd(worst.peakPrice)} down to ${formatUtc(worst.troughTs, 'full')} at ${fmtUsd(worst.troughPrice)}, ` +
                  `a fall of ${fmtPct(worst.depthPercent)}. Intraday lows were deeper than the closes shown here, and the earliest years traded on thin, ` +
                  'unreliable venues, so treat the very early numbers as indicative rather than exact.'
                : 'Bitcoin has repeatedly fallen more than 70% from a high on daily closing prices. Exact figures for each episode are shown in the table on this page when price data is available.',
        },
        {
            q: 'How is drawdown different from volatility?',
            a:
                'Volatility measures how much prices scatter around their average, in both directions. Drawdown only measures downside, and only the path-dependent kind: ' +
                'how far you were underwater versus your best previous moment. Two assets can share the same volatility while one grinds sideways and the other cuts 80% ' +
                'and takes three years to recover. Drawdown is usually the number that decides whether someone actually holds a position.',
        },
        {
            q: 'Does dollar-cost averaging reduce drawdown?',
            a: data?.reference
                ? `It changes the shape of it rather than removing it. Over the last ${REFERENCE_YEARS} years the Bitcoin price fell ${fmtPct(data.reference.priceDrawdownPercent)} ` +
                  `peak-to-trough, while a $${REFERENCE_AMOUNT}-a-week schedule started at the same time saw its portfolio value fall ${fmtPct(data.reference.portfolioDrawdownPercent)} at worst. ` +
                  'The difference is that new contributions keep arriving during the fall, adding value that a lump sum does not get. What DCA does not do is protect the coins ' +
                  'you already own: those still lose the full percentage the price loses.'
                : 'It changes the shape of it rather than removing it. Contributions keep arriving during a decline, which adds value a lump sum never gets and lowers the ' +
                  'measured portfolio drawdown. The coins you already hold still lose the full percentage the price loses.',
        },
        {
            q: 'How long does Bitcoin take to recover from a drawdown?',
            a: data?.medianRecoveryDays != null
                ? `Across the completed episodes in this dataset, the median time from the old peak back to the old peak was about ${fmtDays(data.medianRecoveryDays)}. ` +
                  'That is a median over a small sample from a single asset with roughly fifteen years of history. It is a description of what happened, not a schedule ' +
                  'for what will happen, and nothing guarantees that a given drawdown ever recovers.'
                : 'Historical recoveries have ranged from weeks to several years. A small sample from one asset with roughly fifteen years of history cannot tell you how ' +
                  'long the next one takes, and nothing guarantees that a given drawdown recovers at all.',
        },
        {
            q: 'Could Bitcoin fall more than 80% again?',
            a:
                'Yes. Nothing in the historical record puts a floor under future declines. The deepest past drawdown is a sample maximum, not a limit: it is the worst thing ' +
                'that happened to survive into the data, and the next decline is free to be worse. Size a position on the assumption that a fall of that size is possible ' +
                'and that it may take years to recover, if it recovers.',
        },
    ];

    const faqJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
            />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8 sm:space-y-10">

                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li><Link href="/" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">Home</Link></li>
                        <li aria-hidden="true">/</li>
                        <li><Link href="/calculators" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">Calculators</Link></li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Bitcoin Drawdown</li>
                    </ol>
                </nav>

                {/* Heading + lead */}
                <header className="space-y-3">
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white text-balance">
                        Bitcoin drawdown calculator
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                        &ldquo;Drawdown&rdquo; means two different things to Bitcoin holders, and both matter. It is the
                        peak-to-trough fall that measures how far underwater you went, and it is the act of selling a
                        stack down to live on. This page covers the first with real historical prices, then hands you a
                        planner for the second.
                    </p>
                </header>

                {data ? (
                    <>
                        {/* Where things stand */}
                        <section className="space-y-4">
                            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                                Where Bitcoin sits right now
                            </h2>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                                <StatCard
                                    label="Price"
                                    value={fmtUsd(data.currentPrice)}
                                    sub="Latest market price"
                                    celebrated
                                />
                                <StatCard
                                    label="All-time high"
                                    value={fmtUsd(data.athPrice)}
                                    sub={formatUtc(data.athTs, 'full')}
                                />
                                <StatCard
                                    label="Below the high"
                                    value={data.fromAthPercent < 0.05 ? 'At the high' : `−${fmtPct(data.fromAthPercent)}`}
                                    sub="Current drawdown"
                                    valueClassName={
                                        data.fromAthPercent < 0.05
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : 'text-rose-600 dark:text-rose-400'
                                    }
                                />
                                <StatCard
                                    label="Since that high"
                                    value={data.daysSinceAth < 1 ? 'Today' : fmtDays(data.daysSinceAth)}
                                    sub="Time under water"
                                />
                            </div>
                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                Measured on daily closing prices from {formatUtc(data.seriesStartTs, 'monthYear')} onward.
                                Intraday wicks went lower than any close shown here, so every depth on this page is a
                                conservative reading of what a holder actually lived through.
                            </p>
                        </section>

                        {/* What peak-to-trough means */}
                        <section className="space-y-3">
                            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                                What peak-to-trough actually measures
                            </h2>
                            <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                <p>
                                    A drawdown starts at a high-water mark and ends when that mark is reclaimed. In between,
                                    the drawdown at any moment is{' '}
                                    <code className="text-xs sm:text-sm bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                        (peak &minus; current) &divide; peak
                                    </code>
                                    , and the episode&apos;s headline number is the worst value that expression ever reached.
                                    The maximum drawdown is simply the deepest of those episodes across the whole history.
                                </p>
                                <p>
                                    Two details are easy to miss. First, the peak is a <em>running</em> peak: once a price
                                    is printed it becomes the reference for everything after it, so you are always measured
                                    against your best moment, not your entry. Second, the clock does not stop at the bottom.
                                    A 75% fall that takes eight months to bottom and another two and a half years to recover
                                    is three years of being worse off than you once were, and that duration is usually what
                                    breaks people&apos;s conviction rather than the percentage itself.
                                </p>
                                <p>
                                    Drawdown is the honest counterpart to a headline return. A backtest that shows a large
                                    gain while quietly passing through an 80% decline is describing a strategy most people
                                    would have abandoned somewhere in the middle. That is why the main{' '}
                                    <Link href="/" className={proseLink}>DCA calculator</Link> reports max drawdown next to
                                    ROI and XIRR rather than tucking it away.
                                </p>
                            </div>
                        </section>

                        {/* History table */}
                        {data.episodes.length > 0 && (
                            <section className="space-y-3">
                                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                                    Bitcoin&apos;s deepest drawdowns on record
                                </h2>
                                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                    Since {formatUtc(data.seriesStartTs, 'monthYear')} there have been{' '}
                                    <strong className="font-semibold text-slate-900 dark:text-white">{data.countOver30}</strong>{' '}
                                    declines of 30% or more,{' '}
                                    <strong className="font-semibold text-slate-900 dark:text-white">{data.countOver50}</strong>{' '}
                                    of 50% or more, and{' '}
                                    <strong className="font-semibold text-slate-900 dark:text-white">{data.countOver70}</strong>{' '}
                                    of 70% or more. The {Math.min(8, data.episodes.length)} deepest are listed below in date order.
                                </p>
                                <Card className="p-4 sm:p-6">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs sm:text-sm tabular-nums min-w-[560px]">
                                            <thead>
                                                <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                                    <th scope="col" className="py-2 pr-4 font-medium">Peak</th>
                                                    <th scope="col" className="py-2 pr-4 font-medium">Trough</th>
                                                    <th scope="col" className="py-2 pr-4 font-medium text-right">Fall</th>
                                                    <th scope="col" className="py-2 pr-4 font-medium text-right">Time down</th>
                                                    <th scope="col" className="py-2 font-medium text-right">Back to the peak</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-slate-700 dark:text-slate-300">
                                                {data.episodes.map((e) => (
                                                    <tr
                                                        key={e.peakTs}
                                                        className="border-b border-slate-100 dark:border-slate-800/60 last:border-0 align-top"
                                                    >
                                                        <td className="py-2 pr-4">
                                                            <span className="font-medium text-slate-800 dark:text-slate-100">
                                                                {formatUtc(e.peakTs, 'monthYear')}
                                                            </span>
                                                            <span className="block text-slate-500 dark:text-slate-400">{fmtUsd(e.peakPrice)}</span>
                                                        </td>
                                                        <td className="py-2 pr-4">
                                                            <span className="font-medium text-slate-800 dark:text-slate-100">
                                                                {formatUtc(e.troughTs, 'monthYear')}
                                                            </span>
                                                            <span className="block text-slate-500 dark:text-slate-400">{fmtUsd(e.troughPrice)}</span>
                                                        </td>
                                                        <td className="py-2 pr-4 text-right font-semibold text-rose-600 dark:text-rose-400">
                                                            −{fmtPct(e.depthPercent)}
                                                        </td>
                                                        <td className="py-2 pr-4 text-right">{fmtDays(e.daysToTrough)}</td>
                                                        <td className="py-2 text-right">
                                                            {e.daysToRecover === null
                                                                ? <span className="text-amber-700 dark:text-amber-400">Not yet</span>
                                                                : fmtDays(e.daysToRecover)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                        &ldquo;Time down&rdquo; is peak to trough. &ldquo;Back to the peak&rdquo; is peak to the
                                        first close at or above that peak, so it includes the fall as well as the recovery.
                                        Overlapping episodes are not double-counted: a new high closes the previous drawdown.
                                    </p>
                                </Card>
                            </section>
                        )}

                        {/* DCA vs lump sum */}
                        <section className="space-y-3">
                            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                                Why a DCA investor lives a different drawdown
                            </h2>
                            <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                <p>
                                    The numbers above are <em>price</em> drawdowns. A portfolio drawdown is not the same
                                    thing, because a portfolio that is still receiving contributions gains value from new
                                    money at the same time it loses value to the price. Somebody who bought once at the top
                                    experiences the price drawdown exactly. Somebody buying every week experiences something
                                    shallower, and buys the whole way down.
                                </p>
                                {data.reference && (
                                    <Card className="p-4 sm:p-5">
                                        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                            Worked example, computed from the same price series
                                        </p>
                                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                                    Bitcoin price, worst fall since {formatUtc(data.reference.startTs, 'monthYear')}
                                                </p>
                                                <p className="mt-1 text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400 tabular-nums">
                                                    −{fmtPct(data.reference.priceDrawdownPercent)}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                                    ${REFERENCE_AMOUNT}/week portfolio over the same window, worst fall
                                                </p>
                                                <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
                                                    −{fmtPct(data.reference.portfolioDrawdownPercent)}
                                                </p>
                                            </div>
                                        </div>
                                        <p className="mt-3 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                            That schedule put in {fmtUsd(data.reference.totalInvested)} and holds{' '}
                                            {fmtBtc(data.reference.btcAccumulated)}, worth {fmtUsd(data.reference.currentValue)} today.
                                            Portfolio drawdown is walked day by day across the whole holding period, not just on
                                            purchase dates, so short collapses are not smoothed away.
                                        </p>
                                    </Card>
                                )}
                                <p>
                                    Read that gap carefully, because it is easy to draw the wrong conclusion from it. DCA did
                                    not make the asset safer. The coins already in the stack fell by the full price percentage.
                                    What changed is that the portfolio was small when the fall began and kept being topped up
                                    at lower prices, which flatters the measured peak-to-trough number. Run the same comparison
                                    on someone who stopped contributing at the top and the two figures converge.
                                </p>
                                <p>
                                    There is a second, less comfortable implication. The reason a DCA drawdown looks mild early
                                    on is that there is not much money in it yet. As the stack grows, each future contribution
                                    is a smaller fraction of the total, so a DCA portfolio&apos;s drawdown behaviour drifts
                                    toward the price&apos;s own drawdown behaviour over time. The longer you have been stacking,
                                    the more the history above describes your experience rather than the softened version.
                                </p>
                                <p>
                                    Finally: none of these figures bound the future. The deepest fall in the table is the worst
                                    thing that has happened to an asset that is roughly fifteen years old and has never been
                                    tested through a full global credit cycle as an institutional holding. A sample maximum is
                                    not a limit. Plan for worse than the worst row.
                                </p>
                            </div>
                        </section>
                    </>
                ) : (
                    <Card className="p-6 sm:p-8">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                            <div className="space-y-2">
                                <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                                    Price data is temporarily unavailable
                                </h2>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                    We could not load historical Bitcoin prices to compute the drawdown history right now.
                                    Nothing on this page is estimated when that happens, so the tables are hidden rather than
                                    filled with guesses. The{' '}
                                    <Link href="/" className={proseLink}>main calculator</Link> pulls from several providers,
                                    so it may still work.
                                </p>
                            </div>
                        </div>
                    </Card>
                )}

                {/* The interactive planner */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                        The other drawdown: spending the stack down
                    </h2>
                    <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                        <p>
                            In retirement planning, &ldquo;drawdown&rdquo; is the withdrawal phase: you stop adding and start
                            selling. For a volatile asset this is a genuinely different problem from accumulation, because
                            selling a fixed amount of money every month means selling <em>more coins</em> when the price is
                            low. A decline early in the withdrawal phase permanently removes coins that would otherwise have
                            participated in any later recovery.
                        </p>
                        <p>
                            The planner below spends a stack down month by month. Set the monthly withdrawal, an assumed
                            growth rate, how fast withdrawals rise with inflation, and a floor of coins you refuse to sell.
                            It reports how long the stack lasts, the same answer under a bear and a bull path, and the
                            largest monthly withdrawal that survives 30 years.
                        </p>
                    </div>

                    {/* Stack size: plain GET form, so it works without JavaScript */}
                    <Card className="p-4 sm:p-5">
                        <form method="get" action={PATH} className="space-y-2">
                            <label
                                htmlFor="btc-stack"
                                className="block text-xs font-medium text-slate-500 dark:text-slate-400"
                            >
                                How much BTC are you planning around?
                            </label>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                    id="btc-stack"
                                    name="btc"
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    defaultValue={stackBtc !== null ? trimBtc(stackBtc) : ''}
                                    placeholder="0.5"
                                    className="h-10 w-full sm:max-w-xs rounded-lg border border-slate-200 bg-white px-3 text-base tabular-nums text-slate-800 outline-none transition-shadow focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:text-sm"
                                />
                                <button
                                    type="submit"
                                    className="h-10 shrink-0 rounded-lg bg-amber-600 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-700"
                                >
                                    Update the stack
                                </button>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                {usingOwnStack
                                    ? 'Using the amount you entered. Everything below recalculates against the live price.'
                                    : data?.reference
                                        ? `Defaulting to ${fmtBtc(data.reference.btcAccumulated)}, the stack a $${REFERENCE_AMOUNT}-a-week schedule would have accumulated since ${formatUtc(data.reference.startTs, 'monthYear')} at real historical prices. Replace it with your own.`
                                        : 'Enter the amount of BTC you want to model.'}
                            </p>
                        </form>
                    </Card>

                    {stackBtc !== null && data ? (
                        <DrawdownCalculator btcAccumulated={stackBtc} livePrice={data.currentPrice} />
                    ) : (
                        <Card className="p-6">
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                The planner needs a live Bitcoin price and a stack size to run. Enter an amount of BTC above,
                                or open the{' '}
                                <Link href="/" className={proseLink}>full calculator</Link> to derive one from a DCA schedule.
                            </p>
                        </Card>
                    )}

                    <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                        <p>
                            <strong className="font-semibold text-slate-900 dark:text-white">How to read the result.</strong>{' '}
                            The number it gives you is an upper bound, not a plan. The model compounds the price smoothly at
                            whatever rate you type, which is the one thing Bitcoin has never done. A real path with the same
                            average return but a deep decline in the first few years drains the stack far faster, because
                            those early withdrawals sell many more coins. That is sequence-of-returns risk, and a
                            constant-growth model has none of it by construction.
                        </p>
                        <p>
                            <strong className="font-semibold text-slate-900 dark:text-white">What it leaves out.</strong>{' '}
                            No capital gains tax, no exchange or withdrawal fees, no spread, and no lump-sum expenses. It also
                            assumes you keep selling on schedule through a 70% decline, which is exactly the moment most
                            people stop. Treat the bear column as the interesting one.
                        </p>
                        <p>
                            The <Link href="/methodology" className={proseLink}>methodology page</Link> lists every data
                            source and every known limitation behind these numbers.
                        </p>
                    </div>
                </section>

                {/* FAQ */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Common questions about Bitcoin drawdowns
                    </h2>
                    <div className="space-y-3">
                        {faqs.map((f) => (
                            <Card key={f.q} className="p-4 sm:p-5">
                                <h3 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-100">{f.q}</h3>
                                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{f.a}</p>
                            </Card>
                        ))}
                    </div>
                </section>

                {/* CTA */}
                <Card celebrated className="p-6 sm:p-10 text-center">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-3">
                        Run your own numbers
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-5 max-w-xl mx-auto">
                        The full calculator backtests any DCA schedule you like and reports its max drawdown alongside ROI,
                        XIRR, and a year-by-year breakdown, all from the same historical data used on this page.
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                    >
                        Open the calculator
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </Card>

                {/* Related */}
                <section className="space-y-3">
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Keep going
                    </h2>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm">
                        <li>
                            <Link href="/calculators" className="block rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                All Bitcoin calculators
                            </Link>
                        </li>
                        <li>
                            <Link href="/calculators/bitcoin-fire" className="block rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                Bitcoin FIRE calculator
                            </Link>
                        </li>
                        <li>
                            <Link href="/dca" className="block rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                Historical DCA scenarios
                            </Link>
                        </li>
                        <li>
                            <Link href="/methodology" className="block rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                Methodology &amp; data sources
                            </Link>
                        </li>
                    </ul>
                </section>

                {/* Disclaimer */}
                <p className="border-t border-slate-200 dark:border-slate-800 pt-6 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Not financial advice. Everything here is a historical measurement or a simulation for educational
                    purposes. Past drawdowns do not bound future ones, past performance does not guarantee future results,
                    and Bitcoin is volatile enough that you can lose money.
                </p>

            </div>
        </>
    );
}
