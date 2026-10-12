import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowDown, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { Card } from '@/components/ui/Card';
import { DrawdownCalculator } from '@/components/DrawdownCalculator';
import { getBitcoinPriceHistoryWithMeta, getBitcoinSpot } from '@/app/actions';
import { calculateDca, priceSeriesCovers } from '@/utils/dca';
import { DAY_MS, EARLIEST_PRICE_TS, formatUtc, utcFullYearsBetween, utcYearsBefore } from '@/utils/dates';
import {
    FIRST_EXCHANGE_CLOSE_DATE, PRICE_PROVIDER_LABELS, priceStaleNotice, type PriceProvider,
} from '@/data/priceSources';
import {
    findDrawdowns, listedEpisodes, maxDrawdownPercent, median, type Episode,
} from '@/app/calculators/bitcoin-drawdown/episodes';
import { readTypedAmount } from '@/app/calculators/bitcoin-drawdown/typedAmount';

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

/** Human duration for a day count: "1 day", "47 days", "8 months", "2.9 years". */
function fmtDays(days: number): string {
    if (days < 60) {
        const whole = Math.round(days);
        return `${whole} ${whole === 1 ? 'day' : 'days'}`;
    }
    if (days < 730) return `${Math.round(days / 30.44)} months`;
    return `${(days / 365.25).toFixed(1)} years`;
}

// ── Server data ───────────────────────────────────────────────────────────────

const REFERENCE_AMOUNT = 100;
const REFERENCE_YEARS = 5;
/** Rows in the history table, unless more than this many falls reached DEEP_FALL_PERCENT. */
const TABLE_ROWS = 8;
/** Every fall at least this deep is listed, however many there are. */
const DEEP_FALL_PERCENT = 70;
/**
 * The one day in the bundled 2010-2015 series where the price jumps and falls
 * straight back: $0.06, $0.09, $0.15, $0.06 across 14 to 17 September 2010.
 * data/btcHistorical.ts keeps those values because blockchain.info still
 * publishes them, and datasets.test.ts pins them. Measured peak to trough they
 * are a 60% fall in one day, deep enough to be a row of the table, so the
 * table prints the four values that row rests on, and what the counts above
 * it come to without the two days in the middle.
 */
const EARLY_SPIKE_PEAK_TS = Date.UTC(2010, 8, 16);

interface PageData {
    currentPrice: number;
    /** The exchange that quoted currentPrice and when; null when it is the newest row of the daily series. */
    quote: { provider: PriceProvider; asOf: number } | null;
    /**
     * The daily series every depth on the page is measured on, as it was
     * actually served. Coinbase is asked for; when it cannot be reached the
     * price action answers with Kraken's weekly series, on which falls read
     * shallower, and the page then says so instead of describing daily prices.
     */
    series: { provider: PriceProvider; stale: boolean; fetchedAt: number };
    athPrice: number;
    athTs: number;
    fromAthPercent: number;
    daysSinceAth: number;
    seriesStartTs: number;
    /** The rows of the history table, in date order. */
    episodes: Episode[];
    /** How many of those rows are there for their depth. One more than this means the fall still under way was added. */
    deepestRows: number;
    /** Set when EARLY_SPIKE_PEAK_TS heads a listed row. */
    earlySpike: {
        /** The daily values from two days before that day to the day after. */
        days: { ts: number; price: number }[];
        /** The counts with that day and the day before it left out of the series. */
        countOver30: number;
        countOver50: number;
    } | null;
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
        // Coinbase gives a close for every day from 2015-07-20 and the loader
        // prepends blockchain.info's daily prices for 2010-2015, so that series
        // has no straight-line fills. The action falls back to Kraken's weekly
        // series when Coinbase is down, so which one answered is read off the
        // result and carried to the copy.
        const [meta, spot] = await Promise.all([
            getBitcoinPriceHistoryWithMeta(EARLIEST_PRICE_TS, now + DAY_MS, 'coinbase'),
            getBitcoinSpot('coinbase'),
        ]);
        const history = meta.data;
        // A series that stops short of today would report a "current drawdown"
        // against a stale last row.
        if (history.length < 500 || !priceSeriesCovers(history, EARLIEST_PRICE_TS, now)) return null;

        const lastRow = history[history.length - 1];
        const currentPrice = spot ? spot.price : lastRow[1];
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
        const countOver70 = all.filter((e) => e.depthPercent >= DEEP_FALL_PERCENT).length;
        // The deepest TABLE_ROWS, and never fewer than every fall of 70% or more:
        // the sentence above the table says all of those are in it, and other
        // pages send readers here for exactly those rows. The fall still under
        // way is listed too, wherever it ranks.
        const episodes = listedEpisodes(all, TABLE_ROWS, DEEP_FALL_PERCENT);
        const deepestRows = Math.min(all.length, Math.max(TABLE_ROWS, countOver70));

        // Read from the series, not typed in, so the note cannot disagree with the row.
        let earlySpike: PageData['earlySpike'] = null;
        if (episodes.some((e) => e.peakTs === EARLY_SPIKE_PEAK_TS)) {
            const days = [-2, -1, 0, 1].flatMap((offset) => {
                const row = history.find(([ts]) => ts === EARLY_SPIKE_PEAK_TS + offset * DAY_MS);
                return row ? [{ ts: row[0], price: row[1] }] : [];
            });
            if (days.length === 4) {
                const without = findDrawdowns(
                    history.filter(([ts]) => ts !== EARLY_SPIKE_PEAK_TS && ts !== EARLY_SPIKE_PEAK_TS - DAY_MS),
                    0.3,
                );
                earlySpike = {
                    days,
                    countOver30: without.length,
                    countOver50: without.filter((e) => e.depthPercent >= 50).length,
                };
            }
        }

        const medianRecoveryDays = median(all.flatMap((e) => (e.daysToRecover === null ? [] : [e.daysToRecover])));

        // A concrete DCA-vs-price comparison over the same window.
        let reference: PageData['reference'] = null;
        const startTs = Math.max(utcYearsBefore(now, REFERENCE_YEARS), EARLIEST_PRICE_TS);
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
                spot ? spot.asOf : lastRow[0],
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
            quote: spot ? { provider: spot.provider, asOf: spot.asOf } : null,
            series: { provider: meta.servedProvider, stale: meta.stale, fetchedAt: meta.fetchedAt },
            athPrice,
            athTs,
            fromAthPercent: athPrice > 0 ? ((athPrice - currentPrice) / athPrice) * 100 : 0,
            daysSinceAth: (now - athTs) / DAY_MS,
            seriesStartTs: history[0][0],
            episodes,
            deepestRows,
            earlySpike,
            countOver30: all.filter((e) => e.depthPercent >= 30).length,
            countOver50: all.filter((e) => e.depthPercent >= 50).length,
            countOver70,
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

/**
 * Sanitised stack size, or null when the visitor did not supply a usable one.
 * A comma is read as the decimal mark ("0,5" is half a bitcoin), and anything
 * under one satoshi is not a stack.
 */
function parseStackBtc(raw: string | undefined): number | null {
    if (!raw) return null;
    const n = readTypedAmount(raw, 'decimal');
    if (n === null || n < 1e-8) return null;
    return Math.min(n, 21_000_000);
}

const trimBtc = (v: number): string =>
    v.toFixed(8).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata(): Promise<Metadata> {
    const title = 'Bitcoin Drawdown Calculator';
    let description =
        'See every Bitcoin drawdown deeper than 30% since 2010, measured peak-to-trough on daily prices, and plan how long a stack would last if you started spending it down.';

    try {
        const data = await loadData();
        if (data) {
            // "on daily prices" only when the daily series is what answered: on the
            // Kraken fallback the count below comes from weekly closes.
            const basis = data.series.provider === 'coinbase' ? ' on daily prices' : '';
            description =
                `Bitcoin is ${fmtPct(data.fromAthPercent)} below its ${fmtUsd(data.athPrice)} all-time high. ` +
                `It has had ${data.countOver30} drawdowns deeper than 30% since 2010${basis}. See the deepest ones peak-to-trough, ` +
                `why a DCA portfolio's drawdown differs from the price drawdown, and how long a stack would last if you spent it down.`;
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
        images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
            title,
            description,
            url: PATH,
            type: 'article',
            siteName: 'Bitcoin DCA Calculator',
            locale: 'en_US',
        },
        twitter: {
        images: ['/opengraph-image'],
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
            <p className={clsx('mt-1 text-2xl sm:text-3xl font-bold', valueClassName ?? 'text-slate-900 dark:text-white')}>
                {value}
            </p>
            {sub && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
        </Card>
    );
}

const proseLink = 'text-amber-700 dark:text-amber-400 hover:underline font-medium';
// First column of a table that scrolls sideways: it keeps its place, on the
// card's own background so the columns passing under it do not show through.
const stickyCell = 'sticky left-0 bg-white dark:bg-slate-900';
// A breadcrumb link is one or two short words, about 15px tall as text on a
// phone. The padding makes it a 44px touch target, and the negative margins
// hand the same space back so the row sits exactly where it did.
const crumbLink =
    'inline-flex min-h-11 items-center -my-3.5 px-1.5 -mx-1.5 hover:text-amber-700 dark:hover:text-amber-400 transition-colors';

/**
 * Whole years of price history this site has, counted from the first day of
 * its series. Derived, so the prose cannot go stale the way a hard-coded
 * "roughly fifteen years" did.
 */
const priceHistoryYears = (now: number = Date.now()): number => utcFullYearsBetween(EARLIEST_PRICE_TS, now);

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BitcoinDrawdownPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const data = await loadData();

    const typedBtc = firstParam(params.btc)?.trim() ?? '';
    const requestedBtc = parseStackBtc(typedBtc);
    // Something was sent and could not be used (not a number, or under one
    // satoshi): said in so many words, because the field goes back to showing
    // the default.
    const unusableNote = typedBtc !== '' && requestedBtc === null ? 'That amount could not be used. ' : '';
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
    const historyYears = priceHistoryYears();
    // Which series answered is read off the result, not assumed.
    const onFallbackSeries = data !== null && data.series.provider !== 'coinbase';
    const firstExchangeDay = formatUtc(FIRST_EXCHANGE_CLOSE_DATE, 'full');
    const seriesWords = onFallbackSeries
        ? `Kraken's weekly closing prices from ${firstExchangeDay}, with the days in between filled in along a straight line, and blockchain.info's daily average market price before that`
        : `one price per UTC day: Coinbase's daily close from ${firstExchangeDay}, and blockchain.info's daily average market price before that`;

    const faqs: { q: string; a: string }[] = [
        {
            q: 'What is a drawdown in Bitcoin?',
            a:
                'A drawdown is the decline from a previous high to the lowest point before that high is reclaimed, stated as a percentage of the peak. ' +
                'If Bitcoin peaks at $100,000 and later trades at $40,000 without ever having recovered in between, that is a 60% drawdown. ' +
                'The drawdown only ends when the old peak is taken out again. So a drawdown can last for years, even while the price is rising.',
        },
        {
            q: 'What is the biggest Bitcoin drawdown ever recorded?',
            a: worst
                ? `In this page's price series, which starts in ${seriesStartLabel}, the deepest completed decline ran from ` +
                  `${formatUtc(worst.peakTs, 'full')} at ${fmtUsd(worst.peakPrice)} down to ${formatUtc(worst.troughTs, 'full')} at ${fmtUsd(worst.troughPrice)}, ` +
                  `a fall of ${fmtPct(worst.depthPercent)}. The series is ${seriesWords}. Intraday lows were deeper than the prices shown here, and the earliest years traded on thin, ` +
                  'unreliable venues, so treat the very early numbers as indicative rather than exact.'
                : 'Bitcoin has repeatedly fallen more than 70% from a high on daily prices. Exact figures for each episode are shown in the table on this page when price data is available.',
        },
        {
            q: 'How is drawdown different from volatility?',
            a:
                'Volatility measures how much prices scatter around their average, in both directions. Drawdown only measures downside, and only the path-dependent kind: ' +
                'how far you were underwater versus your best previous moment. Two assets can share the same volatility while one grinds sideways and the other cuts 80% ' +
                'and takes three years to recover. Drawdown is usually the number that decides whether someone actually holds on.',
        },
        {
            q: 'Does dollar-cost averaging reduce drawdown?',
            a: data?.reference
                ? `It changes the shape of it rather than removing it. Over the last ${REFERENCE_YEARS} years the Bitcoin price fell ${fmtPct(data.reference.priceDrawdownPercent)} ` +
                  `peak-to-trough. A $${REFERENCE_AMOUNT}-a-week schedule started at the same time saw its portfolio value fall ${fmtPct(data.reference.portfolioDrawdownPercent)} at worst. ` +
                  'The difference is that new contributions keep arriving during the fall, adding value that a lump sum does not get. What DCA does not do is protect the coins ' +
                  'you already own: those still lose the full percentage the price loses.'
                : 'It changes the shape of it rather than removing it. Contributions keep arriving during a decline, which adds value a lump sum never gets and lowers the ' +
                  'measured portfolio drawdown. The coins you already hold still lose the full percentage the price loses.',
        },
        {
            q: 'How long does Bitcoin take to recover from a drawdown?',
            a: data?.medianRecoveryDays != null
                ? `Across the completed episodes in this dataset, the median time from the old peak back to the old peak was about ${fmtDays(data.medianRecoveryDays)}. ` +
                  `That is a median over a small sample from a single asset with about ${historyYears} years of price history. It is a description of what happened, not a schedule ` +
                  'for what will happen, and nothing guarantees that a given drawdown ever recovers.'
                : `Historical recoveries have ranged from weeks to several years. A small sample from one asset with about ${historyYears} years of price history cannot tell you how ` +
                  'long the next one takes, and nothing guarantees that a given drawdown recovers at all.',
        },
        {
            q: 'Could Bitcoin fall more than 80% again?',
            a:
                'Yes. Nothing in the historical record puts a floor under future declines. The deepest past drawdown is a sample maximum, not a limit: it is the worst thing ' +
                'that happened to survive into the data, and the next decline is free to be worse. A fall of that size can take years to recover from, if it ' +
                'recovers at all.',
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
                        <li><Link href="/" className={crumbLink}>Home</Link></li>
                        <li aria-hidden="true">/</li>
                        <li><Link href="/calculators" className={crumbLink}>Calculators</Link></li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Bitcoin Drawdown</li>
                    </ol>
                </nav>

                {/* Heading + lead */}
                <header className="space-y-3">
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white text-balance">
                        Bitcoin drawdown calculator
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                        &ldquo;Drawdown&rdquo; means two different things to Bitcoin holders, and both matter. It is the
                        peak-to-trough fall that measures how far underwater you went, from a previous high down to the
                        low that followed. It is also the act of selling a stack down to live on. This page covers the
                        first with historical prices, then hands you a planner for the second.
                    </p>
                    {/* The planner is several screens down, below the whole history. */}
                    <p>
                        <a
                            href="#planner"
                            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                        >
                            Skip to the spend-down planner
                            <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                        </a>
                    </p>
                </header>

                {data ? (
                    <>
                        {/* Said at the top, not in a footnote: on the weekly series every
                            depth below is a different, shallower number. */}
                        {onFallbackSeries && (
                            <Card className="p-4 sm:p-5 border-amber-500/40 dark:border-amber-500/30">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                                        Coinbase&apos;s daily prices could not be reached just now, so this page is
                                        running on Kraken&apos;s weekly closing prices with the days in between filled
                                        in along a straight line. A straight line through a week cannot fall as far as
                                        the week did, so the falls measured below can read shallower than daily prices
                                        show, and their dates can be off by several days. Reload in a few minutes for
                                        the daily series.
                                    </p>
                                </div>
                            </Card>
                        )}

                        {/* Where things stand */}
                        <section className="space-y-4">
                            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                                Where Bitcoin sits right now
                            </h2>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                                <StatCard
                                    label="Price"
                                    value={fmtUsd(data.currentPrice)}
                                    sub={
                                        data.quote
                                            ? `${PRICE_PROVIDER_LABELS[data.quote.provider].name}, ${new Date(data.quote.asOf).toISOString().slice(11, 16)} UTC`
                                            : 'Newest daily price'
                                    }
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
                                            ? 'text-gain'
                                            : 'text-loss'
                                    }
                                />
                                <StatCard
                                    label="Since that high"
                                    value={data.daysSinceAth < 1 ? 'Today' : fmtDays(data.daysSinceAth)}
                                    sub="Time under water"
                                />
                            </div>
                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                Measured from {formatUtc(data.seriesStartTs, 'monthYear')} onward on {seriesWords}.
                                Intraday wicks went lower than any price shown here, so every depth on this page is a
                                conservative reading of what a holder actually lived through.
                                {data.series.stale ? ` ${priceStaleNotice(data.series.provider, data.series.fetchedAt)}` : ''}
                            </p>
                        </section>

                        {/* What peak-to-trough means */}
                        <section className="space-y-3">
                            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
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
                                    Picture a 75% fall that takes eight months to bottom and another two and a half years to
                                    recover. That is more than three years of being worse off than you once were. The duration is
                                    usually what breaks people&apos;s conviction, not the percentage itself.
                                </p>
                                <p>
                                    Drawdown is the honest counterpart to a headline return. A backtest that shows a large
                                    gain while quietly passing through an 80% decline is describing a strategy most people
                                    would have abandoned somewhere in the middle. That is why the main{' '}
                                    <Link href="/" className={proseLink}>DCA calculator</Link> puts max drawdown next to its
                                    return figures rather than tucking it away. DCA is dollar-cost averaging: buying a fixed
                                    amount on a fixed schedule instead of all at once.
                                </p>
                            </div>
                        </section>

                        {/* History table */}
                        {data.episodes.length > 0 && (
                            <section className="space-y-3">
                                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                                    Bitcoin&apos;s deepest drawdowns on record
                                </h2>
                                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                    Since {formatUtc(data.seriesStartTs, 'monthYear')} there have been{' '}
                                    <strong className="font-semibold text-slate-900 dark:text-white">{data.countOver30}</strong>{' '}
                                    declines of 30% or more,{' '}
                                    <strong className="font-semibold text-slate-900 dark:text-white">{data.countOver50}</strong>{' '}
                                    of 50% or more, and{' '}
                                    <strong className="font-semibold text-slate-900 dark:text-white">{data.countOver70}</strong>{' '}
                                    of {DEEP_FALL_PERCENT}% or more. The {data.deepestRows} deepest are listed below in
                                    date order
                                    {data.countOver70 > 0
                                        ? `, ${data.countOver70 === 1 ? 'the one fall' : `all ${data.countOver70} falls`} of ${DEEP_FALL_PERCENT}% or more among them`
                                        : ''}
                                    {data.episodes.length > data.deepestRows ? ', along with the fall still under way' : ''}
                                    .
                                    {data.earlySpike && (
                                        <>
                                            {' '}
                                            One of them, in {formatUtc(EARLY_SPIKE_PEAK_TS, 'monthYear')}, rests on two
                                            days of prices that look wrong. The note under the table has the details.
                                        </>
                                    )}
                                </p>
                                <Card className="p-4 sm:p-6">
                                    {/* Wider than a phone. Focusable and named, because Safari gives
                                        a keyboard no other way to scroll it sideways, and the Peak
                                        column stays put, because a row scrolled past it no longer
                                        says which fall it is. */}
                                    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Deepest drawdowns table">
                                        <table className="w-full text-xs sm:text-sm tabular-nums min-w-[560px]">
                                            <thead>
                                                <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                                    <th scope="col" className={clsx(stickyCell, 'py-2 pr-4 font-medium')}>Peak</th>
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
                                                        <td className={clsx(stickyCell, 'py-2 pr-4')}>
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
                                                        <td className="py-2 pr-4 text-right font-semibold text-loss">
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
                                        first day the price is back at or above that peak, so it includes the fall as well
                                        as the recovery.
                                        Overlapping episodes are not double-counted: a new high closes the previous drawdown.
                                    </p>
                                    {data.earlySpike && (
                                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                            The {formatUtc(EARLY_SPIKE_PEAK_TS, 'monthYear')} row comes from two days of
                                            blockchain.info&apos;s series, where the price jumped and fell straight back:{' '}
                                            {data.earlySpike.days
                                                .map((day) => `${fmtUsd(day.price)} on ${formatUtc(day.ts, 'monthDay')}`)
                                                .join(', ')
                                                .replace(/, ([^,]*)$/, ' and $1')}
                                            . Those two days look wrong: Coin Metrics, a second source, shows no such
                                            jump, and the{' '}
                                            <Link href="/methodology" className={proseLink}>methodology page</Link> has
                                            both sets of figures. The row is listed and counted here as blockchain.info
                                            publishes it. Without those two days there are {data.earlySpike.countOver30}{' '}
                                            declines of 30% or more and {data.earlySpike.countOver50} of 50% or more.
                                        </p>
                                    )}
                                </Card>
                            </section>
                        )}

                        {/* DCA vs lump sum */}
                        <section className="space-y-3">
                            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                                Why a DCA investor lives a different drawdown
                            </h2>
                            <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                <p>
                                    The numbers above are <em>price</em> drawdowns, and a portfolio drawdown is not
                                    the same thing. A portfolio that is still receiving contributions gains value from new
                                    money at the same time it loses value to the price. Somebody who bought once at the top
                                    lives the price drawdown exactly. Somebody buying every week lives something shallower,
                                    and buys the whole way down.
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
                                                <p className="mt-1 text-2xl font-bold text-loss tabular-nums">
                                                    −{fmtPct(data.reference.priceDrawdownPercent)}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                                    ${REFERENCE_AMOUNT}/week portfolio over the same window, worst fall
                                                </p>
                                                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
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
                                    is a smaller fraction of the total, so a DCA portfolio&apos;s drawdown behavior drifts
                                    toward the price&apos;s own behavior over time. The longer you have been stacking,
                                    the more the history above describes your experience rather than the softened version.
                                </p>
                                <p>
                                    Finally: none of these figures bound the future. Bitcoin has about {historyYears} years of
                                    price history and has never been tested through a full global credit cycle as an
                                    institutional holding. The
                                    deepest fall in the table is just the worst thing that has happened to it so far. A sample
                                    maximum is not a limit.
                                </p>
                            </div>
                        </section>
                    </>
                ) : (
                    <Card className="p-6 sm:p-8">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                            <div className="space-y-2">
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                    Price data is temporarily unavailable
                                </h2>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                    We could not load historical Bitcoin prices to compute the drawdown history right now.
                                    Nothing on this page is estimated when that happens, so the tables are hidden rather than
                                    filled with guesses. The{' '}
                                    <Link href="/" className={proseLink}>main calculator</Link> reads the same two exchanges,
                                    so it may be affected as well. Try again in a few minutes.
                                </p>
                            </div>
                        </div>
                    </Card>
                )}

                {/* The interactive planner */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
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
                            The planner below spends a stack down month by month. Set the monthly withdrawal, a yearly
                            price change, how fast withdrawals rise with inflation, and a floor of coins you refuse to
                            sell. The price change opens at zero, a flat price, because any other starting number would
                            be a forecast you never made. A negative number models a falling price. The planner reports
                            how long the stack lasts, the same answer with the price change 20 points lower and 20 points
                            higher, and the largest monthly withdrawal that lasts 30 years. Beside every non-zero rate it
                            prints the bitcoin price that rate works out to, so the assumption is in plain sight.
                        </p>
                    </div>

                    {/* Stack size: plain GET form, so it works without JavaScript. The
                        fragment brings the reloaded page back here, to the field and the
                        planner under it, not to the top several screens above. */}
                    <Card className="p-4 sm:p-5">
                        <form id="planner" method="get" action={`${PATH}#planner`} className="space-y-2">
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
                                    // 44px and 16px text on a touch screen: under 640px, and on a
                                    // coarse pointer at any width. A mouse keeps the denser 40px row.
                                    className="h-10 max-sm:h-11 pointer-coarse:h-11 w-full sm:max-w-xs rounded-lg border border-slate-200 bg-white px-3 text-sm max-sm:text-base pointer-coarse:text-base tabular-nums text-slate-800 outline-none transition-shadow focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                />
                                <button
                                    type="submit"
                                    className="h-10 max-sm:h-11 pointer-coarse:h-11 shrink-0 rounded-lg bg-amber-600 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-700"
                                >
                                    Update the stack
                                </button>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                {usingOwnStack
                                    ? 'Using the amount you entered. Everything below is worked out at the price shown at the top of this page.'
                                    : data?.reference
                                        ? `${unusableNote}Defaulting to ${fmtBtc(data.reference.btcAccumulated)}, the stack a $${REFERENCE_AMOUNT}-a-week schedule would have accumulated since ${formatUtc(data.reference.startTs, 'monthYear')} at historical prices, with no fee. Replace it with your own.`
                                        : `${unusableNote}Enter the amount of BTC you want to model.`}
                            </p>
                        </form>
                    </Card>

                    {stackBtc !== null && data ? (
                        <DrawdownCalculator btcAccumulated={stackBtc} livePrice={data.currentPrice} />
                    ) : (
                        <Card className="p-6">
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                The planner needs a current Bitcoin price and a stack size to run. Enter an amount of BTC above,
                                or open the{' '}
                                <Link href="/" className={proseLink}>full calculator</Link> to derive one from a DCA schedule.
                            </p>
                        </Card>
                    )}

                    <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                        <p>
                            <strong className="font-semibold text-slate-900 dark:text-white">How to read the result.</strong>{' '}
                            The number it gives you is arithmetic on the rate you typed, not a plan. The model compounds
                            the price smoothly at that rate, which is the one thing Bitcoin has never done. A real path
                            with the same average return but a deep decline in the first few years drains the stack far
                            faster, because those early withdrawals sell many more coins. That is sequence-of-returns
                            risk, and a constant-growth model has none of it by construction.
                        </p>
                        <p>
                            <strong className="font-semibold text-slate-900 dark:text-white">What it leaves out.</strong>{' '}
                            No capital gains tax, no exchange or withdrawal fees, no spread, and no lump-sum expenses. It also
                            assumes you keep selling on schedule through a 70% decline, which is exactly the moment most
                            people stop. Treat the card with the lowest rate as the interesting one.
                        </p>
                        <p>
                            The <Link href="/methodology" className={proseLink}>methodology page</Link> lists every data
                            source and every known limitation behind these numbers.
                        </p>
                    </div>
                </section>

                {/* FAQ */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
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
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
                        Run your own numbers
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-5 max-w-xl mx-auto">
                        The full calculator backtests any DCA schedule you like. It reports max drawdown alongside ROI
                        and XIRR, and lists every purchase, all from the same historical data used here. ROI is your
                        total gain or loss. XIRR is the annual return rate, adjusted for money going in at different
                        times.
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
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                        Keep going
                    </h2>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm">
                        <li>
                            <Link href="/calculators" className="block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-3 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                All Bitcoin calculators
                            </Link>
                        </li>
                        <li>
                            <Link href="/calculators/bitcoin-fire" className="block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-3 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                Bitcoin FIRE calculator
                            </Link>
                        </li>
                        <li>
                            <Link href="/dca" className="block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-3 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                Historical DCA scenarios
                            </Link>
                        </li>
                        <li>
                            <Link href="/methodology" className="block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-3 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
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
