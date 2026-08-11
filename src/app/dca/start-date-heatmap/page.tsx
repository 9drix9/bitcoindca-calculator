import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { Card } from '@/components/ui/Card';
import { getBitcoinPriceHistory } from '@/app/actions';
import { DAILY_PRICE_REVALIDATE } from '@/utils/revalidate';
import { calculateDca, calculateXirr } from '@/utils/dca';
import { DAY_MS, EARLIEST_PRICE_TS } from '@/utils/dates';
import { makeDayPriceLookup } from '@/utils/datasets';

// Recompute against fresh prices once a day. Only the newest windows can change,
// but the whole grid is cheap once the price history is warm in the server cache.
export const revalidate = 86400;

const BASE_URL = 'https://btcdollarcostaverage.com';
const PAGE_URL = `${BASE_URL}/dca/start-date-heatmap`;

/** Every cell simulates the same schedule: $100 on the 1st of each month, no fees. */
const MONTHLY_AMOUNT = 100;
/** Column headers: holding period in whole years. */
const HOLD_YEARS = [1, 2, 3, 5, 7, 10] as const;
/** First row. 2011-01-01 is comfortably after EARLIEST_PRICE_TS (2010-08-18). */
const FIRST_START_YEAR = 2011;

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

// ── Price lookup ───────────────────────────────────────────────────────────────

/**
 * "Latest price at or before this UTC day", by binary search.
 *
 * The grid needs an out-of-order lookup (each cell asks for its own window end),
 * so the pointer-walk lookup inside dca.ts — which assumes ascending queries —
 * is not reusable here.
 */

// ── Cell computation ───────────────────────────────────────────────────────────

type Cell =
    | { state: 'in-progress' }
    | { state: 'unavailable' }
    | {
        state: 'done';
        annualized: number;
        totalReturn: number;
        invested: number;
        endValue: number;
        purchases: number;
    };

interface Grid {
    startYears: number[];
    cells: Cell[][];
}

/**
 * One cell: a $100/month schedule starting Jan 1 of `startYear` and running for
 * `holdYears`, valued at the price on the window's END date.
 *
 * Two details matter for honesty here:
 *
 * 1. The stack is valued at the window-end price, not today's price. Marking a
 *    2013-2016 window to today's price would attribute a decade of subsequent
 *    price action to a three-year hold.
 * 2. XIRR is recomputed here rather than read from `result.stats`. calculateDca
 *    dates its terminal cash flow at *today* — correct when the stack is valued
 *    at today's price, wrong when it is valued at a past date. Same rule, applied
 *    consistently: value and date the terminal flow at the same moment.
 */
function computeCell(
    startYear: number,
    holdYears: number,
    history: [number, number][],
    priceAt: (ts: number) => number | null,
    nowTs: number,
): Cell {
    const startTs = Date.UTC(startYear, 0, 1);
    const endTs = Date.UTC(startYear + holdYears, 0, 1);
    if (startTs < EARLIEST_PRICE_TS) return { state: 'unavailable' };
    if (endTs > nowTs) return { state: 'in-progress' };

    const endPrice = priceAt(endTs);
    if (endPrice === null || !(endPrice > 0)) return { state: 'unavailable' };

    // endDate is the day BEFORE the window closes, so the schedule is exactly
    // 12 x holdYears buys (Jan of the start year through Dec of the final year)
    // and the window-end date itself is a valuation point, not a purchase.
    const result = calculateDca(
        {
            amount: MONTHLY_AMOUNT,
            frequency: 'monthly',
            startDate: new Date(startTs),
            endDate: new Date(endTs - DAY_MS),
            feePercentage: 0,
            priceMode: 'api',
            manualPrice: 0,
        },
        history,
        endPrice,
    );

    if (result.totalInvested <= 0 || !Number.isFinite(result.currentValue)) {
        return { state: 'unavailable' };
    }

    const purchases = result.breakdown.map((item) => ({
        ts: Date.parse(item.date),
        amount: item.invested,
    }));
    const xirr = calculateXirr(purchases, result.currentValue, endTs);
    if (xirr === null || !Number.isFinite(xirr)) return { state: 'unavailable' };

    return {
        state: 'done',
        annualized: xirr * 100,
        totalReturn: result.roi,
        invested: result.totalInvested,
        endValue: result.currentValue,
        purchases: result.breakdown.length,
    };
}

/** Latest start year whose SHORTEST window (1 year) has already completed. */
function lastStartYear(nowTs: number): number {
    const shortest = HOLD_YEARS[0];
    let year = new Date(nowTs).getUTCFullYear();
    while (year > FIRST_START_YEAR && Date.UTC(year + shortest, 0, 1) > nowTs) year--;
    return year;
}

async function buildGrid(): Promise<Grid | null> {
    try {
        const nowTs = Date.now();
        // ONE fetch for the whole grid. It is server-cached, and every cell reuses
        // this exact array — never fetch per cell.
        // Coinbase, matching the sibling dataset pages. Kraken's series is
        // interpolated from WEEKLY closes, and this page publishes its cells as
        // real market prices in schema.org Dataset markup — on the interpolated
        // series the 2017/1yr cell read +2,235% against +1,857% on real daily
        // candles, a 378pp error asserted as machine-readable fact.
        const history = await getBitcoinPriceHistory(EARLIEST_PRICE_TS, nowTs + DAY_MS, 'coinbase', DAILY_PRICE_REVALIDATE);
        if (!history || history.length === 0) return null;

        const priceAt = makeDayPriceLookup(history);
        const last = lastStartYear(nowTs);
        const startYears: number[] = [];
        for (let y = FIRST_START_YEAR; y <= last; y++) startYears.push(y);

        const cells = startYears.map((year) =>
            HOLD_YEARS.map((hold) => computeCell(year, hold, history, priceAt, nowTs)),
        );
        return { startYears, cells };
    } catch (error) {
        // Never build-fail on a provider outage: the page renders an unavailable state.
        console.error('[dca/start-date-heatmap] grid computation failed:', error);
        return null;
    }
}

// ── Column summary ─────────────────────────────────────────────────────────────

interface ColumnSummary {
    holdYears: number;
    count: number;
    best: number;
    worst: number;
    spread: number;
    negative: number;
}

function summarizeColumns(grid: Grid): ColumnSummary[] {
    return HOLD_YEARS.map((holdYears, col) => {
        const values = grid.cells
            .map((row) => row[col])
            .filter((cell): cell is Extract<Cell, { state: 'done' }> => cell.state === 'done')
            .map((cell) => cell.annualized);
        if (values.length === 0) {
            return { holdYears, count: 0, best: 0, worst: 0, spread: 0, negative: 0 };
        }
        const best = Math.max(...values);
        const worst = Math.min(...values);
        return {
            holdYears,
            count: values.length,
            best,
            worst,
            spread: best - worst,
            negative: values.filter((v) => v < 0).length,
        };
    }).filter((summary) => summary.count > 0);
}

// ── Colour scale ───────────────────────────────────────────────────────────────
//
// Colour is decoration only. Every cell also prints its number as text, so the
// grid is fully readable with the colours stripped out (WCAG 1.4.1).

interface Bucket {
    /** Inclusive lower bound of annualized return, in percent. */
    min: number;
    label: string;
    className: string;
    swatch: string;
}

const BUCKETS: Bucket[] = [
    {
        min: 200,
        label: '200%+ a year',
        className: 'bg-emerald-300 dark:bg-emerald-700/70 text-emerald-950 dark:text-white',
        swatch: 'bg-emerald-300 dark:bg-emerald-700/70',
    },
    {
        min: 100,
        label: '100% to 200%',
        className: 'bg-emerald-200 dark:bg-emerald-800/60 text-emerald-950 dark:text-emerald-50',
        swatch: 'bg-emerald-200 dark:bg-emerald-800/60',
    },
    {
        min: 50,
        label: '50% to 100%',
        className: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-100',
        swatch: 'bg-emerald-100 dark:bg-emerald-900/60',
    },
    {
        min: 20,
        label: '20% to 50%',
        className: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200',
        swatch: 'bg-emerald-50 dark:bg-emerald-950/60',
    },
    {
        min: 0,
        label: '0% to 20%',
        className: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100',
        swatch: 'bg-slate-100 dark:bg-slate-800',
    },
    {
        min: -Infinity,
        label: 'Negative',
        className: 'bg-rose-100 dark:bg-rose-950/70 text-rose-900 dark:text-rose-200',
        swatch: 'bg-rose-100 dark:bg-rose-950/70',
    },
];

const bucketFor = (annualized: number): Bucket =>
    BUCKETS.find((b) => annualized >= b.min) ?? BUCKETS[BUCKETS.length - 1];

// ── Metadata ───────────────────────────────────────────────────────────────────

const TITLE = 'Bitcoin DCA Start Date Heatmap: Annualized Returns by Start Year and Holding Period';
const DESCRIPTION =
    'Annualized (XIRR) returns for a $100/month Bitcoin DCA, by the year you started and how long you held. Each window is valued at its own end date, not today.';

export const metadata: Metadata = {
    title: 'Bitcoin DCA Start Date Heatmap',
    description: DESCRIPTION,
    keywords: [
        'bitcoin dca start date',
        'bitcoin returns heatmap',
        'bitcoin dca annualized return',
        'bitcoin holding period returns',
        'does timing matter bitcoin dca',
    ],
    alternates: { canonical: '/dca/start-date-heatmap' },
    openGraph: {
        images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
        title: TITLE,
        description: DESCRIPTION,
        type: 'article',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        images: ['/opengraph-image'],
        card: 'summary_large_image',
        title: TITLE,
        description: DESCRIPTION,
        creator: '@9drix9',
    },
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function StartDateHeatmapPage() {
    const grid = await buildGrid();
    const columns = grid ? summarizeColumns(grid) : [];
    const shortest = columns[0];
    const longest = columns[columns.length - 1];

    const coverageEnd = grid && grid.startYears.length > 0
        ? `${grid.startYears[grid.startYears.length - 1] + HOLD_YEARS[0]}-01-01`
        : `${FIRST_START_YEAR + HOLD_YEARS[0]}-01-01`;

    const breadcrumbJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
            { '@type': 'ListItem', position: 2, name: 'DCA Scenarios', item: `${BASE_URL}/dca` },
            { '@type': 'ListItem', position: 3, name: 'Start Date Heatmap', item: PAGE_URL },
        ],
    };

    const datasetJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: 'Bitcoin DCA annualized return by start year and holding period',
        description:
            'Money-weighted annualized return (XIRR) of a $100-per-month Bitcoin dollar-cost-averaging schedule, for start years from 2011 onward and holding periods of 1, 2, 3, 5, 7 and 10 years. Each window is valued at the Bitcoin price on that window\'s end date. Fees and taxes are excluded.',
        url: PAGE_URL,
        isAccessibleForFree: true,
        temporalCoverage: `${FIRST_START_YEAR}-01-01/${coverageEnd}`,
        measurementTechnique:
            'Simulated monthly purchases on UTC calendar days against historical Bitcoin market prices; annualized return solved as XIRR over the dated cash flows.',
        variableMeasured: [
            { '@type': 'PropertyValue', name: 'Start year', description: 'Calendar year in which the monthly schedule began (January 1, UTC).' },
            { '@type': 'PropertyValue', name: 'Holding period', description: 'Length of the window in whole years.', unitText: 'YEAR' },
            { '@type': 'PropertyValue', name: 'Annualized return (XIRR)', description: 'Money-weighted annualized return over the window, valued at the window end price.', unitText: 'PERCENT' },
        ],
        creator: { '@type': 'Organization', name: 'Bitcoin DCA Calculator', url: BASE_URL },
        keywords: ['bitcoin', 'dollar cost averaging', 'annualized return', 'XIRR', 'holding period'],
    };

    // ONE source for both the visible FAQ and the FAQPage markup. Google requires
    // FAQ rich-result content to be visible on the page; emitting questions that
    // exist only in JSON-LD risks a structured-data manual action. Rendering both
    // from this array is what keeps them from drifting apart.
    const faqs: { q: string; a: string }[] = [
        {
            q: 'Does the start date matter for Bitcoin DCA?',
            a: shortest && longest && shortest.holdYears !== longest.holdYears
                ? `Enormously over short windows, much less over long ones. Across the completed ${shortest.holdYears}-year windows in this grid, annualized returns ranged from ${fmtPct(shortest.worst, true)} to ${fmtPct(shortest.best, true)} per year, a spread of about ${fmtPct(shortest.spread)}. Across the completed ${longest.holdYears}-year windows the range narrows to ${fmtPct(longest.worst, true)} to ${fmtPct(longest.best, true)}, a spread of about ${fmtPct(longest.spread)}. This is a description of what happened, not a forecast.`
                : 'Historically the start date dominated short holding windows and mattered progressively less as the holding period lengthened. The grid on this page shows the full range of outcomes measured from real prices.',
        },
        {
            q: 'How is the annualized return in each cell calculated?',
            a: 'Each cell simulates $100 bought on the first of every month for the whole window. The resulting Bitcoin is then valued at the market price on the window\'s end date. The annualized figure is XIRR: the yearly rate at which every dated purchase, plus the closing value, nets out to zero. It exists because the money went in gradually rather than all on day one, which a plain "total return divided by years" would get wrong. Historical windows are never valued at today\'s price.',
        },
        {
            q: 'Why do some cells say "in progress"?',
            a: 'A cell is only filled in once its full holding period has elapsed. A 10-year window that started in 2020 has not finished, so showing a partial figure next to completed 10-year windows would be misleading. Those cells are marked in progress instead.',
        },
        {
            q: 'Do these historical returns predict future Bitcoin returns?',
            a: 'No. This grid records what one mechanical schedule produced over one stretch of the past. Across that stretch Bitcoin went from a hobbyist experiment to a widely traded asset. Nothing here should be projected forward. Past performance does not guarantee future results, and you can lose money.',
        },
    ];

    const faqJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map(({ q, a }) => ({
            '@type': 'Question',
            name: q,
            acceptedAnswer: { '@type': 'Answer', text: a },
        })),
    };

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
            {/* Only claim a Dataset when one actually rendered. On a provider outage the
                page shows an unavailable state, and describing a dataset that is not on
                the page would be markup for content that does not exist. */}
            {grid && (
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetJsonLd) }} />
            )}
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8 sm:space-y-10">

                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li><Link href="/" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">Home</Link></li>
                        <li aria-hidden="true">/</li>
                        <li><Link href="/dca" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">DCA Scenarios</Link></li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Start Date Heatmap</li>
                    </ol>
                </nav>

                {/* Heading + lead */}
                <header className="space-y-3">
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white text-balance">
                        Bitcoin DCA start date heatmap
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                        Every cell below is the same plan: <strong className="font-semibold text-slate-900 dark:text-white">$100 on the first of every month</strong>,
                        no fees, starting in January of the row&apos;s year and running for the column&apos;s number of
                        years. The number is the annualized return over that window, meaning the yearly rate of growth
                        that gets you from what went in to what came out. It is measured at the Bitcoin price on the day
                        the window ended, not today&apos;s price. The exact method is XIRR, which accounts for the money
                        going in a bit at a time instead of all on day one.
                    </p>
                    {shortest && longest && shortest.holdYears !== longest.holdYears && (
                        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                            Read down a column and you see how much your start date mattered. Completed{' '}
                            {shortest.holdYears}-year windows landed anywhere from <strong className="font-semibold text-slate-900 dark:text-white">{fmtPct(shortest.worst, true)}</strong> to{' '}
                            <strong className="font-semibold text-slate-900 dark:text-white">{fmtPct(shortest.best, true)}</strong> a year.
                            Completed {longest.holdYears}-year windows sat between <strong className="font-semibold text-slate-900 dark:text-white">{fmtPct(longest.worst, true)}</strong> and{' '}
                            <strong className="font-semibold text-slate-900 dark:text-white">{fmtPct(longest.best, true)}</strong>.
                            The longer you held, the less your starting point decided the outcome.
                        </p>
                    )}
                </header>

                {grid ? (
                    <>
                        {/* The grid */}
                        <Card className="p-4 sm:p-6 space-y-4">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                                Annualized return by start year and holding period
                            </h2>

                            <div className="overflow-x-auto -mx-1 sm:mx-0">
                                <table className="w-full min-w-[560px] text-xs sm:text-sm tabular-nums border-separate border-spacing-1">
                                    <caption className="sr-only">
                                        Annualized (XIRR) return of a $100 per month Bitcoin dollar-cost-averaging
                                        schedule. Rows are the year the schedule started; columns are how many years it
                                        ran. Cells whose holding period has not yet elapsed are marked &quot;in progress&quot;.
                                    </caption>
                                    <thead>
                                        <tr>
                                            <th scope="col" className="text-left font-medium text-slate-500 dark:text-slate-400 px-2 py-1.5">
                                                Started
                                            </th>
                                            {HOLD_YEARS.map((hold) => (
                                                <th
                                                    key={hold}
                                                    scope="col"
                                                    className="text-center font-medium text-slate-500 dark:text-slate-400 px-2 py-1.5 whitespace-nowrap"
                                                >
                                                    {hold} yr{hold === 1 ? '' : 's'}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {grid.startYears.map((year, rowIndex) => (
                                            <tr key={year}>
                                                <th
                                                    scope="row"
                                                    className="text-left font-semibold text-slate-800 dark:text-slate-100 px-2 py-1.5 whitespace-nowrap"
                                                >
                                                    {year}
                                                </th>
                                                {grid.cells[rowIndex].map((cell, colIndex) => {
                                                    const hold = HOLD_YEARS[colIndex];
                                                    if (cell.state === 'done') {
                                                        const bucket = bucketFor(cell.annualized);
                                                        return (
                                                            <td
                                                                key={hold}
                                                                className={clsx(
                                                                    'text-center font-semibold px-1.5 py-2 rounded-md whitespace-nowrap',
                                                                    bucket.className,
                                                                )}
                                                                title={`${year}–${year + hold}: ${fmtUsd(cell.invested)} invested across ${cell.purchases} buys, worth ${fmtUsd(cell.endValue)} at the end of the window (${fmtPct(cell.totalReturn, true)} total).`}
                                                            >
                                                                {fmtPct(cell.annualized, true)}
                                                            </td>
                                                        );
                                                    }
                                                    if (cell.state === 'in-progress') {
                                                        return (
                                                            <td
                                                                key={hold}
                                                                className="text-center px-1.5 py-2 rounded-md whitespace-nowrap border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400"
                                                                title={`A ${hold}-year window starting in ${year} ends in ${year + hold} and has not completed yet.`}
                                                            >
                                                                In progress
                                                            </td>
                                                        );
                                                    }
                                                    return (
                                                        <td
                                                            key={hold}
                                                            className="text-center px-1.5 py-2 rounded-md whitespace-nowrap bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400"
                                                        >
                                                            No data
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Legend */}
                            <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
                                <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Legend: annualized return
                                </h3>
                                <ul className="flex flex-wrap gap-x-4 gap-y-2">
                                    {BUCKETS.map((bucket) => (
                                        <li key={bucket.label} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                            <span
                                                aria-hidden="true"
                                                className={clsx(
                                                    'inline-block w-4 h-4 rounded border border-slate-300/70 dark:border-slate-700',
                                                    bucket.swatch,
                                                )}
                                            />
                                            {bucket.label}
                                        </li>
                                    ))}
                                    <li className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                        <span
                                            aria-hidden="true"
                                            className="inline-block w-4 h-4 rounded border border-dashed border-slate-400 dark:border-slate-600"
                                        />
                                        Window not finished yet
                                    </li>
                                </ul>
                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                    Color is only a shortcut. Every completed cell prints its own number, so the grid
                                    reads the same with the colors ignored.
                                </p>
                            </div>

                            {/* The per-cell dollar detail lives in each cell's hover tooltip, which never
                                fires on touch and is unreliable for screen readers. This native disclosure
                                is the same data reachable by tap and keyboard — no client JS on this page. */}
                            <details className="border-t border-slate-200 dark:border-slate-800 pt-4 group">
                                <summary className="cursor-pointer list-none text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-amber-700 dark:hover:text-amber-400 flex items-center justify-between gap-3">
                                    Every completed window in dollars: invested, end value and total return
                                    <ChevronDown
                                        className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400 transition-transform group-open:rotate-180"
                                        aria-hidden="true"
                                    />
                                </summary>
                                <div className="mt-3 overflow-x-auto">
                                    <table className="w-full min-w-[520px] text-xs sm:text-sm tabular-nums">
                                        <thead>
                                            <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                                <th scope="col" className="py-1.5 pr-3 font-medium">Window</th>
                                                <th scope="col" className="py-1.5 pr-3 font-medium text-right">Invested</th>
                                                <th scope="col" className="py-1.5 pr-3 font-medium text-right">Buys</th>
                                                <th scope="col" className="py-1.5 pr-3 font-medium text-right">End value</th>
                                                <th scope="col" className="py-1.5 pr-3 font-medium text-right">Total return</th>
                                                <th scope="col" className="py-1.5 font-medium text-right">Annualized</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-slate-700 dark:text-slate-300">
                                            {grid.startYears.flatMap((year, rowIndex) =>
                                                grid.cells[rowIndex].flatMap((cell, colIndex) => {
                                                    if (cell.state !== 'done') return [];
                                                    const hold = HOLD_YEARS[colIndex];
                                                    return [(
                                                        <tr key={`${year}-${hold}`} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                                                            <th scope="row" className="py-1.5 pr-3 text-left font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">
                                                                {year}&ndash;{year + hold}
                                                                <span className="font-normal text-slate-500 dark:text-slate-400"> · {hold} yr{hold === 1 ? '' : 's'}</span>
                                                            </th>
                                                            <td className="py-1.5 pr-3 text-right">{fmtUsd(cell.invested)}</td>
                                                            <td className="py-1.5 pr-3 text-right">{cell.purchases}</td>
                                                            <td className="py-1.5 pr-3 text-right">{fmtUsd(cell.endValue)}</td>
                                                            <td className={clsx(
                                                                'py-1.5 pr-3 text-right font-medium',
                                                                cell.totalReturn >= 0
                                                                    ? 'text-emerald-700 dark:text-emerald-400'
                                                                    : 'text-rose-700 dark:text-rose-400',
                                                            )}>
                                                                {fmtPct(cell.totalReturn, true)}
                                                            </td>
                                                            <td className="py-1.5 text-right">{fmtPct(cell.annualized, true)}</td>
                                                        </tr>
                                                    )];
                                                }),
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </details>
                        </Card>

                        {/* Column summary */}
                        {columns.length > 0 && (
                            <Card className="p-4 sm:p-6 space-y-4">
                                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                                    How much did the start date matter?
                                </h2>
                                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                    This is the same data read column by column. &quot;Spread&quot; is the gap between the
                                    best and worst completed window of that length. It measures directly how much of the
                                    outcome was decided by when you happened to start.
                                </p>
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[460px] text-xs sm:text-sm tabular-nums">
                                        <thead>
                                            <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                                <th scope="col" className="py-2 pr-4 font-medium">Hold length</th>
                                                <th scope="col" className="py-2 pr-4 font-medium text-right">Completed windows</th>
                                                <th scope="col" className="py-2 pr-4 font-medium text-right">Worst</th>
                                                <th scope="col" className="py-2 pr-4 font-medium text-right">Best</th>
                                                <th scope="col" className="py-2 pr-4 font-medium text-right">Spread</th>
                                                <th scope="col" className="py-2 font-medium text-right">Ended below zero</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-slate-700 dark:text-slate-300">
                                            {columns.map((col) => (
                                                <tr key={col.holdYears} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                                                    <th scope="row" className="py-2 pr-4 font-medium text-left text-slate-800 dark:text-slate-100 whitespace-nowrap">
                                                        {col.holdYears} year{col.holdYears === 1 ? '' : 's'}
                                                    </th>
                                                    <td className="py-2 pr-4 text-right">{col.count}</td>
                                                    <td className={clsx(
                                                        'py-2 pr-4 text-right font-medium',
                                                        col.worst >= 0
                                                            ? 'text-emerald-700 dark:text-emerald-400'
                                                            : 'text-rose-700 dark:text-rose-400',
                                                    )}>
                                                        {fmtPct(col.worst, true)}
                                                    </td>
                                                    <td className="py-2 pr-4 text-right font-medium text-emerald-700 dark:text-emerald-400">
                                                        {fmtPct(col.best, true)}
                                                    </td>
                                                    <td className="py-2 pr-4 text-right">{fmtPct(col.spread)}</td>
                                                    <td className="py-2 text-right">{col.negative} of {col.count}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                    Sample sizes shrink as the hold length grows: there are simply fewer completed
                                    10-year windows than 1-year ones, and the long windows overlap heavily with each
                                    other. Treat the right-hand rows as illustrative, not statistical.
                                </p>
                            </Card>
                        )}
                    </>
                ) : (
                    <Card className="p-6 sm:p-8">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                            <div className="space-y-2">
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                    Price data is temporarily unavailable
                                </h2>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                    We couldn&apos;t load the historical Bitcoin price series needed to build this grid.
                                    The live calculator pulls from several providers, so you can still backtest any
                                    single window there.
                                </p>
                            </div>
                        </div>
                    </Card>
                )}

                {/* What this shows */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        What the grid actually shows
                    </h2>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                        <p>
                            <strong className="font-semibold text-slate-800 dark:text-slate-100">Short windows were a coin toss on timing.</strong>{' '}
                            One-year windows hold the widest range of outcomes in the whole grid, and they are the only
                            column with a meaningful count of negative results. A year is short enough that one leg of
                            the cycle decides it. Start into a run-up and the number is spectacular. Start into a
                            drawdown, meaning a long slide down from the last peak, and it is deeply red. Nothing about
                            the plan changed between those two cases. Only the calendar did.
                        </p>
                        <p>
                            <strong className="font-semibold text-slate-800 dark:text-slate-100">The range narrows the longer you hold.</strong>{' '}
                            Move right across any row and the numbers converge. Each extra year adds purchases at prices
                            the earlier buys never saw, so no single entry point keeps its grip on your average cost.
                            That convergence is the real content of this page, not the size of any one number. It is
                            also the strongest available argument for settling on a long horizon before you start,
                            instead of trying to pick a moment.
                        </p>
                        <p>
                            <strong className="font-semibold text-slate-800 dark:text-slate-100">Annualized returns fall as you go down the grid.</strong>{' '}
                            The earliest rows cover a period when Bitcoin was tiny, hard to trade, and largely unknown.
                            Those percentages describe a starting point that no longer exists. Reading the top-left of
                            the grid as a baseline expectation would be a mistake. The later rows are the more relevant
                            comparison, and even they are history, not a forecast.
                        </p>
                        <p>
                            <strong className="font-semibold text-slate-800 dark:text-slate-100">Every window here ended in the past.</strong>{' '}
                            A cell fills in only once its full holding period has run out, and it is valued at the price
                            on that end date. That matters more than it sounds. Valuing a completed 2013&ndash;2016
                            window at today&apos;s price would quietly credit a three-year hold with everything that
                            happened in the decade afterwards. Every historical window would look like a success. Cells
                            whose window is still running say &quot;in progress&quot; instead.
                        </p>
                        <p>
                            One thing this grid cannot tell you is what any future window will do. It covers a single
                            asset over a single fifteen-year stretch. The long windows overlap each other heavily, and
                            the conditions that produced these numbers were unusual by construction. It describes what
                            happened. It does not predict.
                        </p>
                    </div>
                </section>

                {/* Methodology */}
                <section className="space-y-3">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                        How each cell is calculated
                    </h2>
                    <ul className="space-y-2 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span>$100 buys on the 1st of each month, on UTC calendar days, for the full window: 12 purchases per year of hold.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span>The stack is valued at the Bitcoin price on the window&apos;s end date, never at today&apos;s price.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span>The percentage is XIRR: the yearly rate at which every dated purchase plus the closing value nets to zero. It is not the total return divided by the number of years, because the money went in gradually.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span>No fees, no taxes, and no spread (the gap between what an exchange sells at and what it buys at) are modeled. Real returns would be lower. This grid uses real daily closing prices: Coinbase from 2015, blockchain.info before that. It does not use the weekly series the calculator fills in by default. The <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline">methodology page</Link> covers the price sources and their limits.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span>The grid recomputes daily against fresh price data, so a window completes and fills in on its own anniversary.</span>
                        </li>
                    </ul>
                </section>

                {/* CTA */}
                <Card celebrated className="p-6 sm:p-10 text-center">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
                        Run your own numbers
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-5 max-w-xl mx-auto">
                        This grid fixes the amount at $100 a month and the cadence at monthly. Change the amount, the
                        cadence, the fee and both dates in the live calculator and it backtests against the same
                        historical price data.
                    </p>
                    <Link
                        href={`/?amount=${MONTHLY_AMOUNT}&frequency=monthly&fee=0`}
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                    >
                        Open the calculator
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </Card>

                {/* FAQ — rendered from the same `faqs` array as the FAQPage markup above */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        Common questions
                    </h2>
                    <div className="space-y-3">
                        {faqs.map(({ q, a }) => (
                            <details
                                key={q}
                                className="group rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 sm:px-5 sm:py-4"
                            >
                                <summary className="cursor-pointer list-none font-semibold text-sm sm:text-base text-slate-900 dark:text-white marker:hidden flex items-center justify-between gap-3">
                                    {q}
                                    <ChevronDown
                                        className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400 transition-transform group-open:rotate-180"
                                        aria-hidden="true"
                                    />
                                </summary>
                                <p className="mt-2.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                    {a}
                                </p>
                            </details>
                        ))}
                    </div>
                </section>

                {/* Related */}
                <section className="space-y-3">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                        Keep reading
                    </h2>
                    <ul className="grid sm:grid-cols-2 gap-2 sm:gap-3">
                        <li>
                            <Link
                                href="/dca"
                                className="block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                            >
                                <span className="font-medium">All DCA scenarios</span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">Fixed amounts and cadences, worked out year by year.</span>
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/methodology"
                                className="block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                            >
                                <span className="font-medium">Methodology &amp; data sources</span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">Where the prices come from and where the model falls short.</span>
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/bitcoin-dca-tax"
                                className="block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                            >
                                <span className="font-medium">DCA and tax lots</span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">Why buying regularly creates hundreds of separate cost bases.</span>
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/why-bitcoin"
                                className="block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                            >
                                <span className="font-medium">Why Bitcoin</span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">The case, the counter-case, and the risks.</span>
                            </Link>
                        </li>
                    </ul>
                </section>

                {/* Disclaimer */}
                <p className="border-t border-slate-200 dark:border-slate-800 pt-6 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Not financial advice. This is a historical simulation for educational purposes; past performance does
                    not guarantee future results. Bitcoin is volatile and you can lose money.
                </p>

            </div>
        </>
    );
}
