import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { AlertTriangle, ArrowRight, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { Card } from '@/components/ui/Card';
import { formatUtc } from '@/utils/dates';
import { HEATMAP_MONTHLY_AMOUNT } from '@/utils/heatmap';
import { FIRST_EXCHANGE_CLOSE_TS } from '@/data/priceSources';
import { loadStudyCloses, studyUnavailable } from '@/app/best-day-to-buy-bitcoin/loadStudyCloses';
import {
    FIRST_START_YEAR,
    HOLD_YEARS,
    buildGrid,
    gridLastModified,
    type ColumnSummary,
    type Grid,
} from './grid';

// Recompute against fresh prices once a day. Only the newest windows can change,
// but the whole grid is cheap once the price history is warm in the server cache.
export const revalidate = 86400;

const BASE_URL = 'https://btcdollarcostaverage.com';
const PAGE_URL = `${BASE_URL}/dca/start-date-heatmap`;
const PAGE_TAG = 'dca/start-date-heatmap';

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
    // Round first so a tiny negative prints as 0%, not -0%.
    const rounded = Number(value.toFixed(digits)) || 0;
    const text = rounded.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
    });
    return `${signed && rounded > 0 ? '+' : ''}${text}%`;
}

/** A gap between two annualized returns, in percentage points. */
const fmtPoints = (value: number): string =>
    `${value.toLocaleString('en-US', { maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 1 })} points`;

const years = (n: number): string => `${n} year${n === 1 ? '' : 's'}`;

/** "5-", "5- and 7-", "5-, 7- and 10-": hold lengths ahead of the word "year". */
const joinHolds = (holds: number[]): string => {
    const parts = holds.map((h) => `${h}-`);
    return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
};

// ── Sentences that state a result ──────────────────────────────────────────────
//
// Each one reads the finished grid. The earlier copy was written once, by
// hand, about a grid that has since gained rows: "the range narrows the longer
// you hold" while the 7-year column was spread wider than the 5-year one.

/** How much separate history a column of overlapping windows amounts to. */
const overlapSentence = (column: ColumnSummary): string =>
    column.separate >= column.count
        ? `The ${column.count} completed ${column.holdYears}-year windows share no years with each other.`
        : `The ${column.count} completed ${column.holdYears}-year windows start a year apart and overlap: only ${column.separate} of that length ${column.separate === 1 ? 'fits' : 'fit'} in the data without sharing a year.`;

/** Which columns contain a window that ended worth less than was paid in. */
function belowZeroSentence(columns: ColumnSummary[]): string {
    const some = columns.filter((column) => column.negative > 0);
    const none = columns.filter((column) => column.negative === 0);
    if (some.length === 0) return 'No completed window in the grid ended worth less than was paid in.';
    const listed = some.map((column) => `${column.negative} of ${column.count} at ${years(column.holdYears)}`);
    const head = `Windows that ended worth less than was paid in: ${listed.join(', ')}`;
    return none.length === 0
        ? `${head}.`
        : `${head}, and none of the completed ${joinHolds(none.map((column) => column.holdYears))}year windows.`;
}

/** How the best-to-worst spread changes from the shortest hold to the longest. */
function spreadSentence(grid: Grid): string {
    const shortest = grid.columns[0];
    const longest = grid.columns[grid.columns.length - 1];
    if (shortest === longest) return '';
    const ends = `The gap between the best and worst start year was ${fmtPoints(shortest.spread)} for ${shortest.holdYears}-year windows and ${fmtPoints(longest.spread)} for ${longest.holdYears}-year windows.`;
    if (grid.spreadWidensAt.length === 0) return `${ends} It was narrower at every longer hold.`;
    return `${ends} It was not narrower at every step: the ${joinHolds(grid.spreadWidensAt)}year ${grid.spreadWidensAt.length === 1 ? 'column is' : 'columns are'} spread wider than the one before.`;
}

// ── Data ───────────────────────────────────────────────────────────────────────

interface Study {
    grid: Grid;
    /** Days Coinbase had no candle for, filled in along a straight line. */
    estimatedDays: number;
}

const loadStudy = cache(async (): Promise<Study | null> => {
    const study = await loadStudyCloses(PAGE_TAG);
    if (!study) return null;
    const grid = buildGrid(study.closes);
    if (!grid) return studyUnavailable(PAGE_TAG, 'no window in the grid has completed');
    return { grid, estimatedDays: study.estimatedDays };
});

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
    `Annualized (XIRR) returns for a $${HEATMAP_MONTHLY_AMOUNT}/month Bitcoin DCA, by the year you started and how long you held. Each window is valued at its own end date, not today.`;

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
        url: '/dca/start-date-heatmap',
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

// A breadcrumb link is one or two short words, about 15px tall as text on a
// phone. The padding makes it a 44px touch target, and the negative margins
// hand the same space back so the row sits exactly where it did.
const crumbLink =
    'inline-flex min-h-11 items-center -my-3.5 px-1.5 -mx-1.5 hover:text-amber-700 dark:hover:text-amber-400 transition-colors';

// The first column of a table that scrolls sideways. It stays at the left edge
// and is painted in the card's own surface colour, so the columns pass under it.
const stickyLabel = 'sticky left-0 bg-white dark:bg-slate-900';

const strong = 'font-semibold text-slate-900 dark:text-white';
const lead = 'font-semibold text-slate-800 dark:text-slate-100';

export default async function StartDateHeatmapPage() {
    const study = await loadStudy();
    const grid = study?.grid ?? null;
    const estimatedDays = study?.estimatedDays ?? 0;
    const columns = grid?.columns ?? [];
    const shortest = columns[0];
    const longest = columns[columns.length - 1];
    const twoEnds = shortest !== undefined && longest !== undefined && shortest !== longest;

    const coverageEnd = grid ? formatUtc(grid.lastEndTs, 'isoDay') : `${FIRST_START_YEAR + HOLD_YEARS[0]}-01-01`;

    // The price rise the whole grid sits inside, and how long it is. Both run
    // to the newest window end, the last price any cell uses, and both ends are
    // a January 1, so the span is a whole number of years.
    const priceRise =
        grid && grid.firstStartPrice !== null && grid.lastEndPrice !== null
            ? `from ${fmtUsd(grid.firstStartPrice)} on ${formatUtc(Date.UTC(FIRST_START_YEAR, 0, 1), 'full')} to ${fmtUsd(grid.lastEndPrice)} on ${formatUtc(grid.lastEndTs, 'full')}`
            : null;
    const spanYears = grid ? new Date(grid.lastEndTs).getUTCFullYear() - FIRST_START_YEAR : null;

    // The earliest window of the longest length that is still running: the
    // example for "why does a cell say in progress". Read from the grid so it
    // does not go on naming a window that has since finished.
    const longestHold = HOLD_YEARS[HOLD_YEARS.length - 1];
    const stillRunning = grid
        ? grid.startYears.find((_, row) => grid.cells[row][HOLD_YEARS.length - 1].state === 'in-progress')
        : undefined;

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
            `Money-weighted annualized return (XIRR) of a $${HEATMAP_MONTHLY_AMOUNT}-per-month Bitcoin dollar-cost-averaging schedule, for start years from ${FIRST_START_YEAR} onward and holding periods of ${HOLD_YEARS.slice(0, -1).join(', ')} and ${longestHold} years. Each window is valued at the Bitcoin price on that window's end date. Windows of the same length start one year apart and overlap. Prices are Coinbase daily closes from ${formatUtc(FIRST_EXCHANGE_CLOSE_TS, 'isoDay')} and blockchain.info's 00:00 UTC market price before that. Fees and taxes are excluded.`,
        url: PAGE_URL,
        isAccessibleForFree: true,
        temporalCoverage: `${FIRST_START_YEAR}-01-01/${coverageEnd}`,
        ...(grid ? { dateModified: gridLastModified(grid.lastCloseTs) } : {}),
        measurementTechnique:
            'Simulated monthly purchases on UTC calendar days against one historical price per day; annualized return solved as XIRR over the dated cash flows.',
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
            a: grid && twoEnds
                ? `Across the completed ${shortest.holdYears}-year windows in this grid, annualized returns ranged from ${fmtPct(shortest.worst, true)} to ${fmtPct(shortest.best, true)} per year. Across the completed ${longest.holdYears}-year windows they ranged from ${fmtPct(longest.worst, true)} to ${fmtPct(longest.best, true)}. ${spreadSentence(grid)} ${overlapSentence(longest)} This is a description of what happened, not a forecast.`
                : 'The grid on this page shows the range of outcomes by the year a plan started and by how long it ran, measured on historical prices.',
        },
        {
            q: 'How is the annualized return in each cell calculated?',
            a: `Each cell simulates $${HEATMAP_MONTHLY_AMOUNT} bought on the first of every month for the whole window. The resulting Bitcoin is then valued at the market price on the window's end date. The annualized figure is XIRR: the yearly rate at which every dated purchase, plus the closing value, nets out to zero. It exists because the money went in gradually rather than all on day one, which a plain "total return divided by years" would get wrong. Historical windows are never valued at today's price.`,
        },
        {
            q: 'Why do some cells say "in progress"?',
            a: `A cell is only filled in once its full holding period has elapsed and its end date has a daily closing price.${stillRunning !== undefined ? ` A ${longestHold}-year window that started in ${stillRunning} has not finished, so showing a partial figure next to completed ${longestHold}-year windows would be misleading.` : ''} Until then a cell is marked in progress.`,
        },
        {
            q: 'Do these historical returns predict future Bitcoin returns?',
            a: `No. This grid records what one mechanical schedule produced over one stretch of the past${priceRise ? `, during which the price in our series went ${priceRise}` : ''}. Nothing here should be projected forward. Past performance does not guarantee future results, and you can lose money.`,
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
                        <li><Link href="/" className={crumbLink}>Home</Link></li>
                        <li aria-hidden="true">/</li>
                        <li><Link href="/dca" className={crumbLink}>DCA Scenarios</Link></li>
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
                        Every cell below is the same plan: <strong className={strong}>${HEATMAP_MONTHLY_AMOUNT} on the first of every month</strong>,
                        no fees, starting in January of the row&apos;s year and running for the column&apos;s number of
                        years. The number is the annualized return over that window, meaning the yearly rate of growth
                        that gets you from what went in to what came out. It is measured at the Bitcoin price on the day
                        the window ended, not today&apos;s price. The exact method is XIRR, which accounts for the money
                        going in a bit at a time instead of all on day one.
                    </p>
                    {grid && twoEnds && (
                        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                            Read down a column and you see how much the start year mattered. Completed{' '}
                            {shortest.holdYears}-year windows landed anywhere from <strong className={strong}>{fmtPct(shortest.worst, true)}</strong> to{' '}
                            <strong className={strong}>{fmtPct(shortest.best, true)}</strong> a year.
                            Completed {longest.holdYears}-year windows sat between <strong className={strong}>{fmtPct(longest.worst, true)}</strong> and{' '}
                            <strong className={strong}>{fmtPct(longest.best, true)}</strong>.{' '}
                            {overlapSentence(longest)}
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

                            {/* Wider than a phone. The start year stays put while the columns
                                scroll under it, and the box takes keyboard focus because Safari
                                gives a keyboard no other way to scroll it sideways. */}
                            <div className="overflow-x-auto -mx-1 sm:mx-0" tabIndex={0} role="region" aria-label="Start year by holding period table">
                                <table className="w-full min-w-[560px] text-xs sm:text-sm tabular-nums border-separate border-spacing-1">
                                    <caption className="sr-only">
                                        Annualized (XIRR) return of a ${HEATMAP_MONTHLY_AMOUNT} per month Bitcoin
                                        dollar-cost-averaging schedule. Rows are the year the schedule started; columns are
                                        how many years it ran. Cells whose holding period has not yet elapsed are marked
                                        &quot;in progress&quot;.
                                    </caption>
                                    <thead>
                                        <tr>
                                            <th scope="col" className={clsx(stickyLabel, 'text-left font-medium text-slate-500 dark:text-slate-400 px-2 py-1.5')}>
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
                                                    className={clsx(stickyLabel, 'text-left font-semibold text-slate-800 dark:text-slate-100 px-2 py-1.5 whitespace-nowrap')}
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
                                <summary className="cursor-pointer list-none min-h-11 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-amber-700 dark:hover:text-amber-400 flex items-center justify-between gap-3">
                                    Every completed window in dollars: invested, end value and total return
                                    <ChevronDown
                                        className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400 transition-transform group-open:rotate-180"
                                        aria-hidden="true"
                                    />
                                </summary>
                                <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Completed windows in dollars table">
                                    <table className="w-full min-w-[520px] text-xs sm:text-sm tabular-nums">
                                        <thead>
                                            <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                                <th scope="col" className={clsx(stickyLabel, 'py-1.5 pr-3 font-medium')}>Window</th>
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
                                                            <th scope="row" className={clsx(stickyLabel, 'py-1.5 pr-3 text-left font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap')}>
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
                        <Card className="p-4 sm:p-6 space-y-4">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                                How much did the start date matter?
                            </h2>
                            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                This is the same data read column by column. &quot;Spread&quot; is the gap between the
                                best and worst completed window of that length, in percentage points of annualized
                                return.
                            </p>
                            {/* Worst, best and spread answer the heading, so they come first and
                                a phone shows them without scrolling. */}
                            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Holding period summary table">
                                <table className="w-full min-w-[480px] text-xs sm:text-sm tabular-nums">
                                    <caption className="sr-only">
                                        For each holding period: the worst and best annualized return and the spread
                                        between them, the completed windows and how many of them share no years, and
                                        how many windows ended below zero
                                    </caption>
                                    <thead>
                                        <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                            <th scope="col" className={clsx(stickyLabel, 'py-2 pr-4 font-medium')}>Hold length</th>
                                            <th scope="col" className="py-2 pr-4 font-medium text-right">Worst</th>
                                            <th scope="col" className="py-2 pr-4 font-medium text-right">Best</th>
                                            <th scope="col" className="py-2 pr-4 font-medium text-right">Spread</th>
                                            <th scope="col" className="py-2 pr-4 font-medium text-right">Completed windows</th>
                                            <th scope="col" className="py-2 font-medium text-right">Ended below zero</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-700 dark:text-slate-300">
                                        {columns.map((col) => (
                                            <tr key={col.holdYears} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                                                <th scope="row" className={clsx(stickyLabel, 'py-2 pr-4 font-medium text-left text-slate-800 dark:text-slate-100 whitespace-nowrap')}>
                                                    {years(col.holdYears)}
                                                </th>
                                                <td className={clsx(
                                                    'py-2 pr-4 text-right font-medium',
                                                    col.worst >= 0
                                                        ? 'text-emerald-700 dark:text-emerald-400'
                                                        : 'text-rose-700 dark:text-rose-400',
                                                )}>
                                                    {fmtPct(col.worst, true)}
                                                    <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">{col.worstStartYear}</span>
                                                </td>
                                                <td className={clsx(
                                                    'py-2 pr-4 text-right font-medium',
                                                    col.best >= 0
                                                        ? 'text-emerald-700 dark:text-emerald-400'
                                                        : 'text-rose-700 dark:text-rose-400',
                                                )}>
                                                    {fmtPct(col.best, true)}
                                                    <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">{col.bestStartYear}</span>
                                                </td>
                                                <td className="py-2 pr-4 text-right">{fmtPoints(col.spread)}</td>
                                                <td className="py-2 pr-4 text-right">
                                                    {col.count}
                                                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                                        {col.separate} {col.separate === 1 ? 'shares' : 'share'} no years
                                                    </span>
                                                </td>
                                                <td className="py-2 text-right">{col.negative} of {col.count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                Windows in a column start one year apart, so the longer ones overlap, and the small figure
                                under each count is how many windows of that length fit end to end in the data.{' '}
                                {longest && overlapSentence(longest)} The year under each worst and best figure is the
                                start year it belongs to. Read the bottom rows as a description of one stretch of history,
                                not as a sample.
                            </p>
                        </Card>
                    </>
                ) : (
                    <Card className="p-6 sm:p-8">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                            <div className="space-y-2">
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                    Price data is temporarily unavailable
                                </h2>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                    Coinbase&apos;s daily closing prices could not be loaded when this page was built, and
                                    it does not publish a grid computed on anything else. It tries again within a few
                                    minutes. The calculator on the home page has a second price source to fall back on, so
                                    any single window can still be backtested there.
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
                        {grid && (
                            <>
                                <p>
                                    <strong className={lead}>Below zero, column by column.</strong>{' '}
                                    {belowZeroSentence(columns)} Nothing about the plan changed between the best and worst
                                    row of a column. Only the start year did.
                                </p>
                                {twoEnds && (
                                    <p>
                                        <strong className={lead}>The spread, shortest hold to longest.</strong>{' '}
                                        {spreadSentence(grid)} Each extra year adds purchases at prices the earlier ones
                                        never saw, so one entry price counts for less of the average cost. The long columns
                                        also hold fewer windows, those windows overlap, and each had to start long enough
                                        ago to have finished, so a narrow spread there is not a like-for-like comparison
                                        with the shortest column.
                                    </p>
                                )}
                                <p>
                                    <strong className={lead}>Where the largest figures sit.</strong>{' '}
                                    In every column the highest figure belongs to a start year of{' '}
                                    {grid.latestBestStartYear} or earlier.
                                    {grid.firstStartPrice !== null && (
                                        <>
                                            {' '}On {formatUtc(Date.UTC(FIRST_START_YEAR, 0, 1), 'full')} the price in our
                                            series was {fmtUsd(grid.firstStartPrice)}. The top rows describe a starting
                                            point at that price.
                                        </>
                                    )}{' '}
                                    The later rows are nearer to recent prices, and they are history too, not a forecast.
                                </p>
                            </>
                        )}
                        <p>
                            <strong className={lead}>Every window here ended in the past.</strong>{' '}
                            A cell fills in only once its full holding period has run out, and it is valued at the price
                            on that end date. That matters more than it sounds. Valuing a completed 2013&ndash;2016
                            window at today&apos;s price would credit a three-year hold with everything that happened in
                            the decade afterwards. Cells whose window is still running say &quot;in progress&quot;
                            instead.
                        </p>
                        <p>
                            One thing this grid cannot tell you is what any future window will do. It covers a single
                            asset over a single{spanYears !== null ? ` ${spanYears}-year` : ''} stretch
                            {priceRise ? `, in which the price in our series went ${priceRise}` : ''}. The long windows
                            overlap each other heavily. It describes what happened. It does not predict.
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
                            <span>${HEATMAP_MONTHLY_AMOUNT} buys on the 1st of each month, on UTC calendar days, for the full window: 12 purchases per year of hold.</span>
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
                            <span>No fees, no taxes, and no spread (the gap between what an exchange sells at and what it buys at) are modeled. Real returns would be lower.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span>
                                One price per UTC day. From {formatUtc(FIRST_EXCHANGE_CLOSE_TS, 'full')} that is
                                Coinbase&apos;s daily candle close. Before it, it is blockchain.info&apos;s market price, an
                                average across exchanges stamped at 00:00 UTC, which tracks the previous day&apos;s close, so
                                purchases and window-end values in those years are priced about a day early.{' '}
                                {estimatedDays > 0 && (
                                    <>
                                        Coinbase has no candle for {estimatedDays} {estimatedDays === 1 ? 'day' : 'days'} in
                                        the series; those are filled in along a straight line between the days either
                                        side.{' '}
                                    </>
                                )}
                                If Coinbase&apos;s closes cannot be loaded the page keeps its last computed grid; it does
                                not switch to another series. The{' '}
                                <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline">methodology page</Link>{' '}
                                covers the price sources and their limits.
                            </span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span>
                                The grid recomputes daily. A window fills in once its end date has a daily closing price,
                                which is the day after its anniversary.
                                {grid && <> The data currently runs to {formatUtc(grid.lastCloseTs, 'full')}.</>}
                            </span>
                        </li>
                    </ul>
                </section>

                {/* CTA */}
                <Card celebrated className="p-6 sm:p-10 text-center">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
                        Run your own numbers
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-5 max-w-xl mx-auto">
                        This grid fixes the amount at ${HEATMAP_MONTHLY_AMOUNT} a month and the cadence at monthly. Change
                        the amount, the cadence, the fee and both dates in the live calculator and it backtests against the
                        same historical price data.
                    </p>
                    <Link
                        href={`/?amount=${HEATMAP_MONTHLY_AMOUNT}&frequency=monthly&fee=0&provider=coinbase`}
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                    >
                        Open the calculator
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
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
                                <summary className="cursor-pointer list-none min-h-11 font-semibold text-sm sm:text-base text-slate-900 dark:text-white marker:hidden flex items-center justify-between gap-3">
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
                        {[
                            { href: '/dca', label: 'All DCA scenarios', sub: 'Fixed amounts and cadences, worked out year by year.' },
                            { href: '/lump-sum-vs-dca', label: 'Lump sum vs DCA', sub: 'Both strategies, every start month since 2010.' },
                            { href: '/best-day-to-buy-bitcoin', label: 'Best day to buy Bitcoin', sub: 'Seven weekday schedules and a week-by-week test.' },
                            { href: '/methodology', label: 'Methodology & data sources', sub: 'Where the prices come from and where the model falls short.' },
                            { href: '/bitcoin-dca-tax', label: 'DCA and tax lots', sub: 'Why buying regularly creates hundreds of separate cost bases.' },
                            { href: '/why-bitcoin', label: 'Why Bitcoin', sub: 'The case, the counter-case, and the risks.' },
                        ].map((link) => (
                            <li key={link.href}>
                                <Link
                                    href={link.href}
                                    className="block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                                >
                                    <span className="font-medium">{link.label}</span>
                                    <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{link.sub}</span>
                                </Link>
                            </li>
                        ))}
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
