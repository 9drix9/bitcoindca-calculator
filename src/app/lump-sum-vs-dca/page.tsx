import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { AlertTriangle, ArrowRight, Info } from 'lucide-react';
import clsx from 'clsx';
import { Card } from '@/components/ui/Card';
import { formatUtc } from '@/utils/dates';
import { FIRST_EXCHANGE_CLOSE_TS } from '@/data/priceSources';
import { loadStudyCloses, studyUnavailable } from '@/app/best-day-to-buy-bitcoin/loadStudyCloses';
import {
    CAPITAL,
    HEADLINE_MONTHS,
    analyseLumpSum,
    type LumpSumAnalysis,
    type OutcomeSpread,
    type PeriodSummary,
} from './analysis';

// Recomputed once a day against fresh prices, like the scenario pages.
export const revalidate = 86400;

const BASE_URL = 'https://btcdollarcostaverage.com';
const PAGE_PATH = '/lump-sum-vs-dca';
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TAG = 'lump-sum-vs-dca';

/**
 * The one outside study the page leans on, read in full on 2026-10-12 (the PDF
 * at this URL, 11 pages). Its headline, in its words: lump-sum strategies
 * "beat common cost averaging investment strategies two-thirds of the time".
 * The figure quoted on this page is its Figure 2: on the MSCI World Index,
 * 1976 to 2022, a lump sum finished ahead of a three-month split 68% of the
 * time after one year. Its split is three months, not twelve, and its asset
 * is a stock index, so it is cited for the direction and the reason, never as
 * a figure for Bitcoin.
 */
const VANGUARD_2023 = {
    label: 'Vanguard, "Cost averaging: Invest now or temporarily hold your cash?" (February 2023)',
    url: 'https://corporate.vanguard.com/content/dam/corp/research/pdf/cost_averaging_invest_now_or_temporarily_hold_your_cash.pdf',
    checkedOn: '2026-10-12',
} as const;

// ── Formatting (server-rendered SEO pages are USD-only by design) ──────────────

function fmtUsd(value: number): string {
    return value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
}

/** A Bitcoin price. Cents below $1,000: the sample starts at six cents. */
function fmtPrice(value: number): string {
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
    // Round first so a tiny negative prints as 0.0%, not -0.0%.
    const rounded = Number(value.toFixed(digits)) || 0;
    const text = rounded.toLocaleString('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
    return `${signed && rounded > 0 ? '+' : ''}${text}%`;
}

/** "15" or "15 to 16". */
const fmtCountRange = (fewest: number, most: number): string => (fewest === most ? `${most}` : `${fewest} to ${most}`);

// ── Sentences that state a result ──────────────────────────────────────────────
//
// Built from the computed analysis and shared by the visible copy, the FAQ and
// the structured data, so a sentence cannot say one thing while the table next
// to it says another.

/**
 * The win rate with its overlap stated. A count of overlapping windows on its
 * own reads as that many separate tests; consecutive start months share all
 * but one month of their period.
 */
function separateSentence(p: PeriodSummary): string {
    const windows = fmtCountRange(p.separate.fewest, p.separate.most);
    const wins =
        fmtPct(p.separate.lowestWinPercent) === fmtPct(p.separate.highestWinPercent)
            ? fmtPct(p.separate.highestWinPercent)
            : `between ${fmtPct(p.separate.lowestWinPercent)} and ${fmtPct(p.separate.highestWinPercent)}`;
    const depends = p.separate.fewest === p.separate.most ? '' : ', depending on which month the count starts from';
    return `Taking only windows that share no months leaves ${windows}${depends}, and across the ${p.months} ways of choosing them the lump sum held more in ${wins}.`;
}

/** Each side's range at the end of the buying period, worst case first. */
function endRangeSentence(p: PeriodSummary): string {
    return `When the last of the ${p.months} buys went in, the worst DCA window stood at ${fmtPct(p.dcaEnd.worst, true)} on the money paid in against ${fmtPct(p.lumpEnd.worst, true)} for the lump sum, and the best at ${fmtPct(p.dcaEnd.best, true)} against ${fmtPct(p.lumpEnd.best, true)}. DCA windows stood below what was paid in ${fmtPct(p.dcaEnd.belowCostPercent)} of the time, lump-sum windows ${fmtPct(p.lumpEnd.belowCostPercent)}.`;
}

// ── Data ───────────────────────────────────────────────────────────────────────

interface Study {
    analysis: LumpSumAnalysis;
    /** Days Coinbase had no candle for, filled in along a straight line. */
    estimatedDays: number;
}

// React's cache: generateMetadata and the page share one computation, so the
// description and the body can never quote different numbers.
const loadStudy = cache(async (): Promise<Study | null> => {
    const study = await loadStudyCloses(PAGE_TAG);
    if (!study) return null;
    const analysis = analyseLumpSum(study.closes);
    if (!analysis) return studyUnavailable(PAGE_TAG, 'too little price history to run the comparison');
    return { analysis, estimatedDays: study.estimatedDays };
});

// ── Metadata ───────────────────────────────────────────────────────────────────

const TITLE = 'Lump Sum vs DCA for Bitcoin: Every Start Month Since 2010';
const FALLBACK_DESCRIPTION =
    'We put the same money into Bitcoin two ways, all at once or spread over 12 monthly buys, starting every month since 2010. How often each ended with more Bitcoin, by how much, and what the comparison leaves out.';

export async function generateMetadata(): Promise<Metadata> {
    let description = FALLBACK_DESCRIPTION;
    try {
        const study = await loadStudy();
        if (study) {
            const { headline } = study.analysis;
            description = `Across ${headline.windows} overlapping start months, putting ${fmtUsd(CAPITAL)} into Bitcoin at once ended with more BTC than ${HEADLINE_MONTHS} monthly buys in ${fmtPct(headline.lumpWinPercent)} of them (median ${fmtPct(headline.medianDiff, true)}, worst ${fmtPct(headline.worst.diffPercent, true)}). Only ${fmtCountRange(headline.separate.fewest, headline.separate.most)} of those windows share no months. Recomputed daily.`;
        }
    } catch {
        // Keep the generic description. The page body makes the same call, and
        // that is where a failure is allowed to surface.
    }

    return {
        title: TITLE,
        description,
        keywords: [
            'lump sum vs dca bitcoin',
            'lump sum vs dollar cost averaging',
            'bitcoin lump sum investing',
            'dca vs lump sum backtest',
            'should i buy bitcoin all at once',
        ],
        alternates: { canonical: PAGE_PATH },
        openGraph: {
            images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
            title: TITLE,
            description,
            url: PAGE_PATH,
            type: 'article',
            siteName: 'Bitcoin DCA Calculator',
            locale: 'en_US',
        },
        twitter: {
            images: ['/opengraph-image'],
            card: 'summary_large_image',
            title: TITLE,
            description,
            creator: '@9drix9',
        },
    };
}

// ── Page ───────────────────────────────────────────────────────────────────────

// No `celebrated` variant: a win rate counted on overlapping windows is not a
// result to dress up as the answer.
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <Card className="p-4 sm:p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tabular-nums">{value}</p>
            {sub && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
        </Card>
    );
}

const diffClass = (value: number): string =>
    value >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-loss';

// A breadcrumb link is one or two short words, about 15px tall as text on a
// phone. The padding makes it a 44px touch target, and the negative margins
// hand the same space back so the row sits exactly where it did.
const crumbLink =
    'inline-flex min-h-11 items-center -my-3.5 px-1.5 -mx-1.5 hover:text-amber-700 dark:hover:text-amber-400 transition-colors';

// The first column of a table that scrolls sideways. It stays at the left edge
// and is painted in the card's own surface colour, so the columns pass under it.
const stickyLabel = 'sticky left-0 bg-white dark:bg-slate-900';
// The headline row is tinted. Its label carries the same tint as a layer over
// the card colour, so it matches the row and still hides what scrolls under it.
const headlineRow = 'bg-amber-50/60 dark:bg-amber-500/[0.06]';
const headlineLabel =
    'bg-linear-to-r from-amber-50/60 to-amber-50/60 dark:from-amber-500/[0.06] dark:to-amber-500/[0.06]';

const strong = 'font-semibold text-slate-900 dark:text-white';
const note = 'text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed';
const sourceLink = 'underline decoration-slate-300 dark:decoration-slate-600 underline-offset-2 hover:text-amber-700 dark:hover:text-amber-400';

/** The rows of the "where each side stood" table: worst case first. */
const END_ROWS: { label: string; pick: (s: OutcomeSpread) => number; signed: boolean }[] = [
    { label: 'Worst window', pick: (s) => s.worst, signed: true },
    { label: '10th percentile', pick: (s) => s.p10, signed: true },
    { label: 'Median', pick: (s) => s.median, signed: true },
    { label: '90th percentile', pick: (s) => s.p90, signed: true },
    { label: 'Best window', pick: (s) => s.best, signed: true },
    { label: 'Stood below what was paid in', pick: (s) => s.belowCostPercent, signed: false },
];

export default async function LumpSumVsDcaPage() {
    const study = await loadStudy();
    const analysis = study?.analysis ?? null;
    const estimatedDays = study?.estimatedDays ?? 0;

    const breadcrumbJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
            { '@type': 'ListItem', position: 2, name: 'Lump Sum vs DCA', item: PAGE_URL },
        ],
    };

    const datasetJsonLd = analysis
        ? {
            '@context': 'https://schema.org',
            '@type': 'Dataset',
            name: 'Bitcoin lump sum versus dollar-cost averaging, by start month',
            description: `For every calendar month from ${formatUtc(analysis.firstStartTs, 'monthYear')} onward, ${fmtUsd(CAPITAL)} is deployed into Bitcoin two ways: as a single purchase on the first of the month, and as equal monthly purchases over 3, 6, 12 and 24 months. Reports the share of start months where the lump sum accumulated more BTC, the same share on windows that share no months, the median and decile differences, each side's return when the last purchase is made, and a breakdown by how far below its highest price so far the market was on the start date. Start months overlap. Prices before ${formatUtc(FIRST_EXCHANGE_CLOSE_TS, 'isoDay')} are blockchain.info's 00:00 UTC market price, not closes. Recomputed daily.`,
            url: PAGE_URL,
            temporalCoverage: `${formatUtc(analysis.firstStartTs, 'isoDay')}/${formatUtc(analysis.lastCloseTs, 'isoDay')}`,
            dateModified: formatUtc(analysis.lastCloseTs, 'isoDay'),
            license: 'https://creativecommons.org/licenses/by/4.0/',
            isAccessibleForFree: true,
            creator: {
                '@type': 'Organization',
                name: 'Bitcoin DCA Calculator',
                url: BASE_URL,
            },
            keywords: ['bitcoin', 'lump sum', 'dollar cost averaging', 'backtest', 'BTC/USD'],
            measurementTechnique:
                'Deterministic backtest on one price per UTC day with zero fees. Both legs deploy identical capital and end up holding only bitcoin, so which holds more does not depend on any later price. Returns at the end of the deployment period are valued at the price on the day of the last monthly purchase.',
            variableMeasured: [
                { '@type': 'PropertyValue', name: 'Start month' },
                { '@type': 'PropertyValue', name: 'Deployment period', unitText: 'months' },
                { '@type': 'PropertyValue', name: 'Share of windows where lump sum accumulated more BTC', unitText: 'percent' },
                { '@type': 'PropertyValue', name: 'Windows that share no months', unitText: 'count' },
                { '@type': 'PropertyValue', name: 'Median difference in BTC accumulated', unitText: 'percent' },
                { '@type': 'PropertyValue', name: 'Return on capital when the last purchase is made', unitText: 'percent' },
                { '@type': 'PropertyValue', name: 'Distance below the highest price so far on the start date', unitText: 'percent' },
            ],
        }
        : null;

    const topRegime = analysis?.regimes.find((r) => r.key === 'top');
    const deepRegime = analysis?.regimes.find((r) => r.key === 'deep');
    const topIsWeakest =
        analysis !== null && topRegime !== undefined && analysis.regimes.every((r) => r.lumpWinPercent >= topRegime.lumpWinPercent);
    const shortest = analysis && analysis.periods[0].months !== HEADLINE_MONTHS ? analysis.periods[0] : null;
    // The explanation under the period table ("money waiting in cash is not in
    // Bitcoin") explains this trend, so it is printed only while the trend holds.
    const leadGrows = analysis !== null && analysis.trends.winRateRises && analysis.trends.medianRises;
    // Sentences reused by the visible copy and the FAQ.
    const priceRise = analysis
        ? `from ${fmtPrice(analysis.firstStartPrice)} on ${formatUtc(analysis.firstStartTs, 'full')} to ${fmtPrice(analysis.lastClose)} on ${formatUtc(analysis.lastCloseTs, 'full')}`
        : '';
    // With equal buys the invested share climbs in even steps from 1/n to
    // (n-1)/n between the first buy and the last, so it averages exactly half.
    const mechanism = analysis
        ? `Money that is waiting to be spent is not in Bitcoin. Spread a fixed sum over ${HEADLINE_MONTHS} monthly buys and, between the first buy and the last, half of it on average is still in cash. Across this sample the price in our series went ${priceRise}, and in ${fmtPct(analysis.headline.lumpWinPercent)} of windows the monthly buys ended up paying a higher average price than the price on day one.`
        : '';
    const stockStudy =
        'The same pattern has been measured in stock markets. Vanguard\'s February 2023 study found a lump sum ahead of a three-month split 68% of the time after one year on the MSCI World Index from 1976 to 2022, and gives the same reason: money held in cash misses the market\'s return while it waits.';

    const faqs: { q: string; a: string; source?: { label: string; url: string } }[] = analysis
        ? [
            {
                q: 'Is lump sum or DCA better for Bitcoin?',
                a: `A lump sum means putting the whole amount in on day one. DCA, or dollar-cost averaging, means splitting it into equal buys spread over time. Across ${analysis.headline.windows} start months since ${formatUtc(analysis.firstStartTs, 'monthYear')}, putting ${fmtUsd(CAPITAL)} in at once ended with more Bitcoin than ${HEADLINE_MONTHS} monthly buys in ${fmtPct(analysis.headline.lumpWinPercent)} of them. The middle result was ${fmtPct(analysis.headline.medianDiff, true)} BTC for the lump sum against DCA, and the worst was ${fmtPct(analysis.headline.worst.diffPercent, true)}. Those windows overlap: each shares ${HEADLINE_MONTHS - 1} of its ${HEADLINE_MONTHS} months with the next. ${separateSentence(analysis.headline)} That is what happened in one price history. Whether it is the better choice for a particular person is a different question, and this page does not answer it.`,
            },
            {
                q: 'What explains the difference between the two?',
                a: `${mechanism} ${stockStudy}`,
                source: VANGUARD_2023,
            },
            {
                q: 'When does DCA beat lump sum?',
                a: `When the price falls after the start date, because the later buys are then made at lower prices.${topRegime && deepRegime ? ` In this sample the lump sum held more in ${fmtPct(topRegime.lumpWinPercent)} of the ${topRegime.windows} windows that started within 10% of the highest price so far, and in ${fmtPct(deepRegime.lumpWinPercent)} of the ${deepRegime.windows} that started 50% or more below it.` : ''}`,
            },
            {
                q: 'Does DCA reduce risk?',
                a: `It changes which prices you pay. ${endRangeSentence(analysis.headline)} Neither approach does anything about the risk that Bitcoin itself falls and stays down.`,
            },
            {
                q: 'I get paid monthly and do not have a lump sum. Does this page apply to me?',
                a: 'No. The comparison only exists if the money is already there as a lump today: an inheritance, a bonus, a house sale. Buying out of income as it arrives is not a choice between a lump sum and DCA, because there is no lump to put in.',
            },
            {
                q: 'How were these numbers calculated?',
                a: `For each start month, ${fmtUsd(CAPITAL)} goes in both ways with zero fees, using the same engine as the main calculator and one price per UTC day: Coinbase's daily close from ${formatUtc(FIRST_EXCHANGE_CLOSE_TS, 'full')}, and before that blockchain.info's market price at 00:00 UTC, which tracks the previous day's close. Both sides end up holding only Bitcoin, so which one holds more does not depend on any later price. Returns "when the last buy went in" value both sides at the price on the day of the final DCA purchase. All dates are UTC. Windows overlap and Bitcoin has exactly one price history, so these are descriptions of the past, not probabilities.`,
            },
        ]
        : [];

    const faqJsonLd =
        faqs.length > 0
            ? {
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                mainEntity: faqs.map(({ q, a }) => ({
                    '@type': 'Question',
                    name: q,
                    acceptedAnswer: { '@type': 'Answer', text: a },
                })),
            }
            : null;

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
            {datasetJsonLd && (
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetJsonLd) }} />
            )}
            {faqJsonLd && (
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
            )}

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8 sm:space-y-10">

                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li>
                            <Link href="/" className={crumbLink}>Home</Link>
                        </li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Lump sum vs DCA</li>
                    </ol>
                </nav>

                {/* Heading + lead */}
                <header className="space-y-3">
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white text-balance">
                        Lump sum vs dollar-cost averaging into Bitcoin
                    </h1>
                    {analysis ? (
                        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                            We took {fmtUsd(CAPITAL)} and put it into Bitcoin two ways. Once as a lump sum, meaning the whole
                            amount on day one. Once as {HEADLINE_MONTHS} equal monthly buys, which is dollar-cost averaging, or
                            DCA. Then we did it again starting on the first of{' '}
                            <strong className={strong}>
                                every month from {formatUtc(analysis.firstStartTs, 'monthYear')} to {formatUtc(analysis.lastStartTs, 'monthYear')}
                            </strong>
                            . That is {analysis.headline.windows} windows, and each shares {HEADLINE_MONTHS - 1} of its{' '}
                            {HEADLINE_MONTHS} months with the next. The lump sum ended up holding more BTC in{' '}
                            <strong className={strong}>{fmtPct(analysis.headline.lumpWinPercent)}</strong> of them. Across
                            all {analysis.headline.windows}, the middle result was{' '}
                            <strong className={strong}>{fmtPct(analysis.headline.medianDiff, true)}</strong> BTC for the
                            lump sum against DCA. {separateSentence(analysis.headline)} The rest of this page is about what
                            those numbers can and cannot tell you.
                        </p>
                    ) : (
                        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                            This page puts the same money into Bitcoin two ways, all at once or spread over several months,
                            across every start month in Bitcoin&apos;s price history. It publishes the full comparison.
                        </p>
                    )}
                </header>

                {analysis ? (
                    <>
                        {/* Headline stats */}
                        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                            <StatCard
                                label="Lump sum held more"
                                value={fmtPct(analysis.headline.lumpWinPercent)}
                                sub={`of ${analysis.headline.windows} overlapping start months`}
                            />
                            <StatCard
                                label="Windows sharing no months"
                                value={
                                    Math.round(analysis.headline.separate.lowestWinPercent) === Math.round(analysis.headline.separate.highestWinPercent)
                                        ? `${Math.round(analysis.headline.separate.highestWinPercent)}%`
                                        : `${Math.round(analysis.headline.separate.lowestWinPercent)}–${Math.round(analysis.headline.separate.highestWinPercent)}%`
                                }
                                sub={`Lump sum held more, across ${fmtCountRange(analysis.headline.separate.fewest, analysis.headline.separate.most)} windows`}
                            />
                            <StatCard
                                label="Worst lump-sum window"
                                value={fmtPct(analysis.headline.worst.diffPercent, true)}
                                sub={`BTC against DCA. Started ${formatUtc(analysis.headline.worst.startTs, 'monthYear')}`}
                            />
                            <StatCard
                                label="Best lump-sum window"
                                value={fmtPct(analysis.headline.best.diffPercent, true)}
                                sub={`BTC against DCA. Started ${formatUtc(analysis.headline.best.startTs, 'monthYear')}`}
                            />
                        </section>

                        {/* The framing note, up front */}
                        <Card className="p-4 sm:p-6 border-amber-500/40 dark:border-amber-500/30">
                            <div className="flex items-start gap-3">
                                <Info className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                                <div className="space-y-2">
                                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                                        Read the question before the answer
                                    </h2>
                                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                        This comparison only exists if the money is already sitting there today. Someone
                                        investing out of a monthly paycheck has no lump sum to compare against: buying as
                                        the money arrives is the only version on offer, and nothing below applies.
                                        Everything on this page is about a windfall: an inheritance, a bonus, a sale.
                                    </p>
                                </div>
                            </div>
                        </Card>

                        {/* Deployment period table */}
                        <Card className="p-4 sm:p-6">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                                {analysis.trends.winRateRises
                                    ? 'The longer the buys were spread, the more often the lump sum held more'
                                    : 'Lump sum against shorter and longer runs of buys'}
                            </h2>
                            <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
                                {fmtUsd(CAPITAL)} deployed either at once, or in equal monthly buys over the period shown.
                                Every start month with a complete deployment period is included. Positive numbers mean the
                                lump sum ended with more BTC.
                            </p>
                            {/* The share the page is about sits second, and the 500px floor
                                leaves it and the window counts whole on a 360px screen. The
                                last two columns scroll sideways inside the card while the
                                period stays put, and the box takes keyboard focus because
                                Safari gives a keyboard no other way to scroll it. */}
                            <div className="overflow-x-auto -mx-1 sm:mx-0" tabIndex={0} role="region" aria-label="Deployment period table">
                                <table className="w-full text-xs sm:text-sm tabular-nums min-w-[500px]">
                                    <caption className="sr-only">
                                        Lump sum versus dollar-cost averaging outcomes by deployment period, with the
                                        number of start months and how many of them share no months
                                    </caption>
                                    <thead>
                                        <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                            <th scope="col" className={clsx(stickyLabel, 'py-2 pr-4 font-medium')}>Spread over</th>
                                            <th scope="col" className="py-2 pr-4 font-medium text-right">Lump sum held more</th>
                                            <th scope="col" className="py-2 pr-4 font-medium text-right">Windows</th>
                                            <th scope="col" className="py-2 pr-4 font-medium text-right">Median difference</th>
                                            <th scope="col" className="py-2 font-medium text-right">Middle 80% range</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-700 dark:text-slate-300">
                                        {analysis.periods.map((p) => (
                                            <tr
                                                key={p.months}
                                                className={clsx(
                                                    'border-b border-slate-100 dark:border-slate-800/60 last:border-0',
                                                    p.months === HEADLINE_MONTHS && headlineRow,
                                                )}
                                            >
                                                <th
                                                    scope="row"
                                                    className={clsx(
                                                        stickyLabel,
                                                        p.months === HEADLINE_MONTHS && headlineLabel,
                                                        'py-2 pr-4 text-left font-medium text-slate-800 dark:text-slate-100',
                                                    )}
                                                >
                                                    {p.months} months
                                                    <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">
                                                        {fmtUsd(p.perPurchase)} per month
                                                    </span>
                                                </th>
                                                <td className="py-2 pr-4 text-right font-medium">
                                                    {fmtPct(p.lumpWinPercent)}
                                                    <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">
                                                        {fmtPct(p.separate.lowestWinPercent)} to {fmtPct(p.separate.highestWinPercent)}
                                                    </span>
                                                </td>
                                                <td className="py-2 pr-4 text-right">
                                                    {p.windows}
                                                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                                                        {fmtCountRange(p.separate.fewest, p.separate.most)} share no months
                                                    </span>
                                                </td>
                                                <td className={clsx('py-2 pr-4 text-right font-medium', diffClass(p.medianDiff))}>
                                                    {fmtPct(p.medianDiff, true)}
                                                </td>
                                                <td className="py-2 text-right text-slate-500 dark:text-slate-400">
                                                    {fmtPct(p.p10, true)} to {fmtPct(p.p90, true)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className={clsx('mt-4', note)}>
                                The large figures count every start month, and consecutive start months share all but one
                                month of their period. The small figures under them are the same comparison on windows that
                                share no months: the lowest and highest share the lump sum reached across the ways of
                                choosing them, and how many there are.
                            </p>
                            <p className={clsx('mt-3', note)}>
                                {leadGrows ? (
                                    <>
                                        In the large figures, the lump sum&apos;s share and its median lead both grow with
                                        every longer period. The reason is mechanical: money waiting in cash is not in
                                        Bitcoin, and across this sample the price in our series went {priceRise}.
                                    </>
                                ) : (
                                    <>
                                        In the large figures, the lump sum&apos;s share and its median lead do not both
                                        grow with every longer period.
                                    </>
                                )}
                                {analysis.trends.rangeWidens && (
                                    <>
                                        {' '}The middle-80% range widens with every longer period{leadGrows ? ' too' : ''}.
                                        {analysis.trends.rangeStretchesBothWays && (
                                            <>
                                                {' '}Spreading the buys for longer stretched the gap between the two in
                                                both directions, not only the middle of it.
                                            </>
                                        )}
                                    </>
                                )}
                            </p>
                        </Card>

                        {/* Where each side stood when the buying finished */}
                        <Card className="p-4 sm:p-6">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                                Where each side stood when the last buy went in
                            </h2>
                            <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
                                The same {analysis.headline.windows} windows of {HEADLINE_MONTHS} months. Each side&apos;s
                                return on the {fmtUsd(CAPITAL)}, at the price on the day of the final DCA purchase. Worst
                                case first.
                            </p>
                            <div className="overflow-x-auto -mx-1 sm:mx-0">
                                <table className="w-full text-xs sm:text-sm tabular-nums">
                                    <caption className="sr-only">
                                        Return on capital at the end of the deployment period for the lump sum and for
                                        dollar-cost averaging: worst, 10th percentile, median, 90th percentile and best
                                        window, and the share of windows below cost
                                    </caption>
                                    <thead>
                                        <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                            <th scope="col" className="py-2 pr-3 font-medium">Across all windows</th>
                                            <th scope="col" className="py-2 pr-3 font-medium text-right">Lump sum</th>
                                            <th scope="col" className="py-2 font-medium text-right">{HEADLINE_MONTHS} monthly buys</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-700 dark:text-slate-300">
                                        {END_ROWS.map(({ label, pick, signed }) => (
                                            <tr key={label} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                                                <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-800 dark:text-slate-100">
                                                    {label}
                                                </th>
                                                <td className="py-2 pr-3 text-right">{fmtPct(pick(analysis.headline.lumpEnd), signed)}</td>
                                                <td className="py-2 text-right">{fmtPct(pick(analysis.headline.dcaEnd), signed)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className={clsx('mt-4', note)}>
                                Both sides are valued on the day the buying finished, so the final DCA purchase counts at
                                exactly what was paid for it. Both columns come from the same overlapping windows as the
                                table above, and at most {analysis.headline.separate.most} of those share no months.
                            </p>
                        </Card>

                        {/* Regime table */}
                        {analysis.regimes.length > 0 && (
                            <Card className="p-4 sm:p-6">
                                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                                    By where the price stood on the start date
                                </h2>
                                <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
                                    The same {HEADLINE_MONTHS}-month windows, grouped by how far below its highest daily
                                    price so far Bitcoin was on the start date.
                                </p>
                                {/* Same order as the table above. The label column is held to
                                    8rem on a phone: left to itself it takes more than half the
                                    width and the figures have to pass under it one at a time. */}
                                <div className="overflow-x-auto -mx-1 sm:mx-0" tabIndex={0} role="region" aria-label="Price on the start date table">
                                    <table className="w-full text-xs sm:text-sm tabular-nums min-w-[480px]">
                                        <caption className="sr-only">
                                            Lump sum versus DCA outcomes grouped by how far below its highest price so far
                                            Bitcoin was on the start date
                                        </caption>
                                        <thead>
                                            <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                                <th scope="col" className={clsx(stickyLabel, 'max-sm:w-32 py-2 pr-4 font-medium')}>Price on the start date</th>
                                                <th scope="col" className="py-2 pr-4 font-medium text-right">Lump sum held more</th>
                                                <th scope="col" className="py-2 pr-4 font-medium text-right">Windows</th>
                                                <th scope="col" className="py-2 pr-4 font-medium text-right">Median difference</th>
                                                <th scope="col" className="py-2 font-medium text-right">Worst / best</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-slate-700 dark:text-slate-300">
                                            {analysis.regimes.map((r) => (
                                                <tr key={r.key} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                                                    <th scope="row" className={clsx(stickyLabel, 'py-2 pr-4 text-left font-medium text-slate-800 dark:text-slate-100')}>
                                                        {r.label}
                                                    </th>
                                                    <td className="py-2 pr-4 text-right font-medium">{fmtPct(r.lumpWinPercent)}</td>
                                                    <td className="py-2 pr-4 text-right">
                                                        {r.windows}
                                                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                                                            {r.separate} share no months
                                                        </span>
                                                    </td>
                                                    <td className={clsx('py-2 pr-4 text-right font-medium', diffClass(r.medianDiff))}>
                                                        {fmtPct(r.medianDiff, true)}
                                                    </td>
                                                    <td className="py-2 text-right text-slate-500 dark:text-slate-400">
                                                        {fmtPct(r.worstDiff, true)} / {fmtPct(r.bestDiff, true)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className={clsx('mt-4', note)}>
                                    {topRegime && deepRegime ? (
                                        <>
                                            The lump sum held more in {fmtPct(topRegime.lumpWinPercent)} of the windows that
                                            started within 10% of the highest price so far, and in{' '}
                                            {fmtPct(deepRegime.lumpWinPercent)} of those that started 50% or more below it.{' '}
                                            {topIsWeakest
                                                ? 'Starting near the high was its weakest case in this sample.'
                                                : 'Starting near the high was not its weakest case in this sample.'}{' '}
                                            {topRegime.lumpWinPercent > 50
                                                ? `${topIsWeakest ? 'Even there' : 'There'} it held more than DCA in most windows.`
                                                : topRegime.lumpWinPercent < 50
                                                    ? 'There it held more than DCA in fewer than half of the windows.'
                                                    : 'There it held more than DCA in exactly half of the windows.'}{' '}
                                            Only {topRegime.separate} of those {topRegime.windows} near-the-high windows can
                                            be chosen without two of them sharing a month, so that row rests on about{' '}
                                            {topRegime.separate === 1 ? '1 separate period' : `${topRegime.separate} separate periods`}.
                                        </>
                                    ) : (
                                        <>
                                            Each window is classified using the highest daily price up to its own start
                                            date, so no later price is involved.
                                        </>
                                    )}
                                </p>
                            </Card>
                        )}

                        {/* Explanation */}
                        <section className="space-y-4">
                            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                                What the numbers do and do not mean
                            </h2>
                            <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                                <p>
                                    <strong className="text-slate-800 dark:text-slate-200">Where the difference comes
                                        from.</strong>{' '}
                                    {mechanism} {stockStudy}{' '}
                                    <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                                        Source:{' '}
                                        <a href={VANGUARD_2023.url} target="_blank" rel="noopener noreferrer" className={sourceLink}>
                                            {VANGUARD_2023.label}
                                        </a>
                                        , read {formatUtc(VANGUARD_2023.checkedOn, 'full')}. Its split is three months and
                                        its asset is a stock index; it is cited for the direction, not as a figure for
                                        Bitcoin.
                                    </span>
                                </p>
                                <p>
                                    <strong className="text-slate-800 dark:text-slate-200">The range each side finished
                                        in.</strong>{' '}
                                    Averaging over {HEADLINE_MONTHS} prices instead of one means no single day sets what
                                    was paid. {endRangeSentence(analysis.headline)}
                                </p>
                                <p>
                                    <strong className="text-slate-800 dark:text-slate-200">The worst window, in full.</strong>{' '}
                                    The lump sum&apos;s worst {HEADLINE_MONTHS}-month window against DCA started in{' '}
                                    {formatUtc(analysis.headline.worst.startTs, 'monthYear')} and finished with{' '}
                                    {fmtPct(Math.abs(analysis.headline.worst.diffPercent))}{' '}
                                    {analysis.headline.worst.diffPercent < 0 ? 'less' : 'more'} Bitcoin than the DCA side.
                                    When the last buy went in, that lump sum stood at{' '}
                                    {fmtPct(analysis.headline.worst.lumpEndReturn, true)} on the money paid in and the DCA
                                    side at {fmtPct(analysis.headline.worst.dcaEndReturn, true)}. This page measures
                                    prices. It cannot say whether anyone would have held through either.
                                </p>
                                <p>
                                    <strong className="text-slate-800 dark:text-slate-200">This is one price history, and
                                        the windows overlap.</strong>{' '}
                                    Bitcoin has only ever taken one path, and back-to-back {HEADLINE_MONTHS}-month windows
                                    share {HEADLINE_MONTHS - 1} of their {HEADLINE_MONTHS} months. So these{' '}
                                    {analysis.headline.windows} windows are nowhere near {analysis.headline.windows}{' '}
                                    separate tests: at most {analysis.headline.separate.most} of them can be chosen without
                                    two sharing a month. The whole sample also sits inside one rise, {priceRise}. A
                                    percentage on this page describes what happened. It is not a probability of what will
                                    happen.
                                </p>
                                {shortest && (
                                    <p>
                                        <strong className="text-slate-800 dark:text-slate-200">The shorter splits sit in
                                            between.</strong>{' '}
                                        Spreading the money over {shortest.months} months instead of {HEADLINE_MONTHS}{' '}
                                        left a median difference of {fmtPct(shortest.medianDiff, true)} BTC for the lump sum
                                        against {fmtPct(analysis.headline.medianDiff, true)}, and a middle-80% range of{' '}
                                        {fmtPct(shortest.p10, true)} to {fmtPct(shortest.p90, true)} against{' '}
                                        {fmtPct(analysis.headline.p10, true)} to {fmtPct(analysis.headline.p90, true)}.
                                        {shortest.medianDiff > 0 &&
                                            analysis.trends.medianRises &&
                                            analysis.trends.rangeStretchesBothWays && (
                                            <>
                                                {' '}In this sample a shorter split gave up less of the lump sum&apos;s
                                                historical edge and stayed closer to it in both directions; a longer one
                                                did the reverse.
                                            </>
                                        )}
                                    </p>
                                )}
                            </div>
                        </section>

                        {/* Methodology */}
                        <Card className="p-4 sm:p-6">
                            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-2">
                                How these numbers were computed
                            </h2>
                            <p className={note}>
                                Start dates step one calendar month at a time from{' '}
                                {formatUtc(analysis.firstStartTs, 'full')} to {formatUtc(analysis.lastStartTs, 'full')}. We keep
                                only the windows that finish inside the price data. For each one, the lump-sum side buys{' '}
                                {fmtUsd(CAPITAL)} of Bitcoin at the price on the start date. The DCA side buys an equal
                                share on the same day of each following month, using the same engine as the main calculator.
                                Fees are zero on both sides. Both end up holding only Bitcoin, so which one holds more does
                                not depend on any later price. The &ldquo;when the last buy went in&rdquo; table values both
                                sides at the price on the day of the final DCA purchase. Each window is grouped by the
                                highest daily price in our series up to its own start date, so no later price is involved.
                            </p>
                            <p className={clsx('mt-3', note)}>
                                Everything uses one price per UTC day. From {formatUtc(FIRST_EXCHANGE_CLOSE_TS, 'full')} that
                                is Coinbase&apos;s daily candle close. Before it, it is blockchain.info&apos;s market price,
                                an average across exchanges stamped at 00:00 UTC, which tracks the previous day&apos;s
                                close; a purchase dated the 1st in those years is priced at about the close of the day
                                before.{' '}
                                {estimatedDays > 0 && (
                                    <>
                                        Coinbase has no candle for {estimatedDays} {estimatedDays === 1 ? 'day' : 'days'} in
                                        the series; those are filled in along a straight line between the days either
                                        side.{' '}
                                    </>
                                )}
                                If Coinbase&apos;s daily closes cannot be loaded the page keeps its last computed figures;
                                it does not switch to another series. Figures refresh once every 24 hours, and the data
                                currently runs to {formatUtc(analysis.lastCloseTs, 'full')}. Price sources, fee math and UTC
                                handling are on the{' '}
                                <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                    methodology page
                                </Link>
                                .
                            </p>
                        </Card>

                        {/* FAQ */}
                        <section className="space-y-4">
                            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                                Common questions
                            </h2>
                            <div className="space-y-3">
                                {faqs.map(({ q, a, source }) => (
                                    <Card key={q} className="p-4 sm:p-5">
                                        <h3 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-100">{q}</h3>
                                        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{a}</p>
                                        {source && (
                                            <p className="mt-2 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                                <span className="font-semibold">Source:</span>{' '}
                                                <a href={source.url} target="_blank" rel="noopener noreferrer" className={sourceLink}>
                                                    {source.label}
                                                </a>
                                            </p>
                                        )}
                                    </Card>
                                ))}
                            </div>
                        </section>
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
                                    it does not publish figures computed on anything else. It tries again within a few
                                    minutes. The calculator on the home page has a second price source to fall back on and
                                    shows a lump-sum comparison next to every DCA result.
                                </p>
                            </div>
                        </div>
                    </Card>
                )}

                {/* CTA */}
                <Card celebrated className="p-6 sm:p-10 text-center">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
                        Run your own numbers
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-5 max-w-xl mx-auto">
                        Your amount, your dates, your fees. The calculator runs a DCA schedule against the same price history
                        and shows the lump-sum version right next to it. You get the trade-off on your own numbers instead of
                        an average.
                    </p>
                    <Link
                        href={`/?amount=${CAPITAL / HEADLINE_MONTHS}&frequency=monthly&fee=0&provider=coinbase`}
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                    >
                        Open the calculator
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </Link>
                </Card>

                {/* Related */}
                <section className="space-y-3">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                        Keep reading
                    </h2>
                    <div className="grid sm:grid-cols-2 gap-2 sm:gap-3">
                        {[
                            { href: '/best-day-to-buy-bitcoin', label: 'Best day to buy Bitcoin', sub: 'Seven weekday schedules and a week-by-week test' },
                            { href: '/dca/start-date-heatmap', label: 'Start-date heatmap', sub: 'Returns by the year a plan started and how long it ran' },
                            { href: '/dca', label: 'DCA scenarios', sub: 'What steady buying would be worth today' },
                            { href: '/methodology', label: 'Methodology', sub: 'Price sources, fee math and UTC handling' },
                            { href: '/why-bitcoin', label: 'Why Bitcoin', sub: 'The case, and the counter-case' },
                        ].map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 hover:border-amber-500/50 transition-colors"
                            >
                                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{link.label}</span>
                                <span className="block mt-0.5 text-xs text-slate-500 dark:text-slate-400">{link.sub}</span>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* Disclaimer */}
                <p className="border-t border-slate-200 dark:border-slate-800 pt-6 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Not financial advice. This page is a historical simulation published for educational purposes. Past
                    performance does not guarantee future results, and a win rate measured on overlapping windows of a single
                    price history is not a probability. Bitcoin is volatile and you can lose money.
                </p>

            </div>
        </>
    );
}
