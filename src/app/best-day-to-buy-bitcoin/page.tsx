import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { AlertTriangle, ArrowRight, Info } from 'lucide-react';
import clsx from 'clsx';
import { Card } from '@/components/ui/Card';
import { DAY_MS, formatUtc } from '@/utils/dates';
import { FIRST_EXCHANGE_CLOSE_TS } from '@/data/priceSources';
import { feeCostUsd, feeExamplePair, feeTiersAsOf, feesLastVerified } from '@/data/exchangeFees';
import { loadStudyCloses, studyUnavailable } from './loadStudyCloses';
import { SNAPSHOT_VS_COINBASE_CLOSE } from './studyCloses';
import { WEEKLY_AMOUNT, analyseBestDay, type BestDayAnalysis, type WeekTest, type WeekdayEdge } from './analysis';

// Recomputed once a day against fresh prices, like the scenario pages.
export const revalidate = 86400;

const BASE_URL = 'https://btcdollarcostaverage.com';
const PAGE_PATH = '/best-day-to-buy-bitcoin';
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TAG = 'best-day-to-buy-bitcoin';

// Table order is Mon..Sun (how most people read a week), not JS's Sun..Sat.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

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
    const digits = Math.abs(value) >= 100 ? 0 : 2;
    // Round first so a tiny negative prints as 0.00%, not -0.00%.
    const rounded = Number(value.toFixed(digits)) || 0;
    const text = rounded.toLocaleString('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
    return `${signed && rounded > 0 ? '+' : ''}${text}%`;
}

function fmtBtc(value: number): string {
    const decimals = value >= 100 ? 2 : value >= 1 ? 4 : 6;
    return value.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

const fmtInt = (value: number): string => value.toLocaleString('en-US');

/** A rough yearly figure: whole dollars, so it does not read as exact. */
const fmtWholeUsd = (value: number): string => `$${fmtInt(Math.round(value))}`;

/** "Monday", "Monday and Wednesday", "Monday, Wednesday and Friday". */
const joinNames = (names: string[]): string =>
    names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** 1st, 2nd, 3rd, 4th. Ranks here only run 1 to 7. */
const ordinal = (n: number): string => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

// ── Sentences that state a result ──────────────────────────────────────────────
//
// Every conclusion the page prints is built here from the computed analysis,
// once, and reused by the visible copy, the FAQ and the structured data. The
// earlier version typed its conclusions as prose ("None of them do", "the gap
// is smaller than your fees") and the tables beside them moved on without it.

const isOutside = (row: WeekdayEdge): boolean => Math.abs(row.edgePercent) > row.marginPercent;

/** One weekday's row as a clause. */
const edgePhrase = (row: WeekdayEdge): string =>
    `${row.name} averaged ${fmtPct(row.edgePercent, true)} against the seven days around it (margin of error ±${fmtPct(row.marginPercent)})`;

/**
 * Said whenever a weekday lands outside its margin. 1 - 0.95^7 = 0.30: the
 * chance that at least one of seven averages with nothing behind them falls
 * outside a two-standard-error margin.
 */
const SEVEN_TRIES = 'With seven weekdays tested, at least one lands outside by chance in about three such tables out of ten.';

/** Whether the weekday averages can be told apart from chance. */
function marginSentence(test: WeekTest): string {
    if (test.beyondMargin.length === 0) {
        return 'None of the seven averages is larger than its own margin of error.';
    }
    const one = test.beyondMargin.length === 1;
    return `${joinNames(test.beyondMargin.map((row) => row.name))} ${one ? 'is' : 'are'} outside ${one ? 'its' : 'their'} own margin of error. ${SEVEN_TRIES}`;
}

/** A share of the random deals, to the nearest percent. */
const dealShare = (percent: number): string =>
    percent > 0 && percent < 0.5 ? 'under 1%' : `${Math.round(percent)}%`;

/** What the calendar-year column shows. Empty when no whole year was measured. */
function yearsSentence(test: WeekTest): string {
    if (!test.years) return '';
    const { count } = test.years;
    if (test.lopsided.length === 0) {
        return `Across the ${count} calendar years measured, no weekday was on the same side of its week in as many as four years out of five.`;
    }
    const parts = test.lopsided.map((row) => {
        const ahead = row.yearsAhead >= row.yearsBehind;
        return `${row.name} was ${ahead ? 'cheaper' : 'dearer'} than its week in ${ahead ? row.yearsAhead : row.yearsBehind} of ${count} calendar years (average ${fmtPct(row.edgePercent, true)}, margin of error ±${fmtPct(row.marginPercent)})`;
    });
    const many = test.lopsided.length;
    const byChance =
        test.shuffle.lopsidedAtLeastPercent === null
            ? ''
            : ` With the weekday labels dealt at random, at least ${many} ${many === 1 ? 'weekday comes' : 'weekdays come'} out that lopsided in ${dealShare(test.shuffle.lopsidedAtLeastPercent)} of deals.`;
    return `${parts.join('; ')}. That is the nearest thing to a pattern in the table.${byChance}`;
}

/**
 * The shuffle check on the best-to-worst gap: how often weekday labels that
 * mean nothing produce a gap at least as large as the real one.
 */
function shuffleSentence(test: WeekTest): string {
    const { deals, gapAtLeastPercent } = test.shuffle;
    return gapAtLeastPercent === 0
        ? `Deal the weekday labels at random within each week and a gap that large did not turn up once in ${fmtInt(deals)} deals.`
        : `Deal the weekday labels at random within each week and the gap between the best and worst label is at least that large in ${dealShare(gapAtLeastPercent)} of ${fmtInt(deals)} deals.`;
}

/** The answer to "is the weekend cheaper", from the Saturday and Sunday rows. */
function weekendSentence(test: WeekTest): string {
    const days = [test.rows[6], test.rows[0]];
    const outside = days.filter(isOutside);
    const lead =
        outside.length === 0
            ? 'Not by an amount this data can separate from chance.'
            : `${joinNames(outside.map((row) => row.name))} ${outside.length === 1 ? 'is' : 'are'} outside ${outside.length === 1 ? 'its' : 'their'} margin of error. ${SEVEN_TRIES}`;
    const detail = days
        .map((row) => `${edgePhrase(row)}${row.yearsCounted > 0 ? ` and was cheaper than its week in ${row.yearsAhead} of ${row.yearsCounted} calendar years` : ''}`)
        .join('; ');
    return `${lead} Across ${fmtInt(test.weeks)} weeks of Coinbase daily closes, ${detail}.`;
}

/** The whole best-to-worst gap as money on one purchase. */
const gapUsd = (test: WeekTest): number => (test.gapPercent / 100) * WEEKLY_AMOUNT;

/**
 * The two September 2010 rows that look wrong, and what the full-history table
 * comes to without them. In two parts so the visible note can link the
 * methodology page between them. Null when the series does not hold the rows.
 */
function spikeSentences(analysis: BestDayAnalysis): { rows: string; effect: string } | null {
    const spike = analysis.fullWithoutSpike;
    if (!spike) return null;
    const level = fmtUsd(spike.neighbourPrice);
    const days = spike.days.map((day) => `${formatUtc(day.ts, 'full')} at ${fmtUsd(day.price)}`);
    const first =
        spike.bestName === analysis.full.bestName
            ? `${spike.bestName} would still finish first`
            : `${spike.bestName} would finish first instead of ${analysis.full.bestName}`;
    return {
        rows: `Two early prices in our series look wrong: ${joinNames(days)}, between days at ${level}. Coin Metrics, a second source, shows no such jump`,
        effect: `With both priced at ${level}, ${first} and the table would span ${fmtPct(spike.spreadPercent)}.`,
    };
}

// ── Data ───────────────────────────────────────────────────────────────────────

/** What the platforms in the fee registry charge on one purchase of WEEKLY_AMOUNT. */
interface FeeContext {
    lowUsd: number;
    highUsd: number;
    /** yyyy-MM-dd the oldest of those figures was last checked against its source. */
    checkedOn: string;
    pair: { higher: string; lower: string; differenceUsd: number } | null;
}

function feeContext(asOf: number): FeeContext | null {
    const costs = feeTiersAsOf(asOf)
        .map((tier) => feeCostUsd(tier, WEEKLY_AMOUNT, 1))
        .filter((cost): cost is number => cost !== null);
    if (costs.length === 0) return null;

    const example = feeExamplePair(asOf);
    const higherUsd = example ? feeCostUsd(example.higher, WEEKLY_AMOUNT, 1) : null;
    const lowerUsd = example ? feeCostUsd(example.lower, WEEKLY_AMOUNT, 1) : null;
    return {
        lowUsd: Math.min(...costs),
        highUsd: Math.max(...costs),
        checkedOn: feesLastVerified(),
        pair:
            example && higherUsd !== null && lowerUsd !== null
                ? {
                    higher: `${example.higher.name} (${example.higher.rateLabel})`,
                    lower: `${example.lower.name} (${example.lower.rateLabel})`,
                    differenceUsd: higherUsd - lowerUsd,
                }
                : null,
    };
}

interface Study {
    analysis: BestDayAnalysis;
    /** Days Coinbase had no candle for, filled in along a straight line. */
    estimatedDays: number;
    fees: FeeContext | null;
}

// React's cache: generateMetadata and the page share one computation, so the
// description and the body can never quote different numbers.
const loadStudy = cache(async (): Promise<Study | null> => {
    const study = await loadStudyCloses(PAGE_TAG);
    if (!study) return null;
    const analysis = analyseBestDay(study.closes);
    if (!analysis) return studyUnavailable(PAGE_TAG, 'too little price history to compare weekdays');
    return { analysis, estimatedDays: study.estimatedDays, fees: feeContext(Date.now()) };
});

// ── Metadata ───────────────────────────────────────────────────────────────────

const TITLE = 'Best Day of the Week to Buy Bitcoin? We Ran All Seven';
const FALLBACK_DESCRIPTION =
    'Seven identical weekly Bitcoin DCA schedules, one for each weekday, and a week-by-week test of whether any weekday was reliably cheaper. All seven results are published.';

export async function generateMetadata(): Promise<Metadata> {
    let description = FALLBACK_DESCRIPTION;
    try {
        const study = await loadStudy();
        if (study) {
            const { test } = study.analysis;
            // The answer comes first: a search result shows about 155 characters.
            description = `Best day to DCA into Bitcoin? Over ${fmtInt(test.weeks)} weeks of Coinbase daily closes ${test.beyondMargin.length === 0 ? 'no weekday is outside the margin of error' : `${joinNames(test.beyondMargin.map((row) => row.name))} fell outside the margin of error`}; the largest gap is ${fmtPct(test.gapPercent)} of a purchase. All seven weekday plans are published.`;
        }
    } catch {
        // Keep the generic description. The page body makes the same call, and
        // that is where a failure is allowed to surface.
    }

    return {
        title: TITLE,
        description,
        keywords: [
            'best day to buy bitcoin',
            'best day to dca bitcoin',
            'best day of the week to buy bitcoin',
            'bitcoin weekly dca',
            'bitcoin buying schedule',
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

// No `celebrated` variant on purpose: no figure on this page is a result to aim
// for, and styling one as a result is how a reader ends up quoting it.
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <Card className="p-4 sm:p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tabular-nums">{value}</p>
            {sub && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
        </Card>
    );
}

// A breadcrumb link is one or two short words, about 15px tall as text on a
// phone. The padding makes it a 44px touch target, and the negative margins
// hand the same space back so the row sits exactly where it did.
const crumbLink =
    'inline-flex min-h-11 items-center -my-3.5 px-1.5 -mx-1.5 hover:text-amber-700 dark:hover:text-amber-400 transition-colors';

// The first column of a table that scrolls sideways. It stays at the left edge
// and is painted in the card's own surface colour, so the columns pass under it.
const stickyLabel = 'sticky left-0 bg-white dark:bg-slate-900';

const strong = 'font-semibold text-slate-900 dark:text-white';
const cardStrong = 'font-semibold text-slate-800 dark:text-slate-100';
const noteStrong = 'font-semibold text-slate-600 dark:text-slate-300';
const note = 'text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed';

export default async function BestDayToBuyBitcoinPage() {
    const study = await loadStudy();
    const analysis = study?.analysis ?? null;
    const fees = study?.fees ?? null;
    const estimatedDays = study?.estimatedDays ?? 0;

    const breadcrumbJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
            { '@type': 'ListItem', position: 2, name: 'Best Day to Buy Bitcoin', item: PAGE_URL },
        ],
    };

    const datasetJsonLd = analysis
        ? {
            '@context': 'https://schema.org',
            '@type': 'Dataset',
            name: 'Bitcoin weekly DCA outcomes by day of the week',
            description: `Two tables. First, for each UTC weekday, the mean gap between that day's close and the geometric mean close of the seven days centred on it (positive means the day closed below its week), across ${analysis.test.weeks} weeks of Coinbase daily closes from ${formatUtc(analysis.test.fromTs, 'isoDay')}, with a two-standard-error margin. Second, seven identical weekly dollar-cost-averaging schedules of $${WEEKLY_AMOUNT} per purchase, each anchored to a different UTC weekday and each making exactly ${analysis.full.purchases} purchases from ${formatUtc(analysis.full.firstBuyTs, 'isoDay')}: BTC accumulated, average cost per BTC and value at the last daily close. Prices before ${formatUtc(FIRST_EXCHANGE_CLOSE_TS, 'isoDay')} are blockchain.info's 00:00 UTC market price, not closes. Recomputed daily.`,
            url: PAGE_URL,
            temporalCoverage: `${formatUtc(analysis.full.firstBuyTs, 'isoDay')}/${formatUtc(analysis.lastCloseTs, 'isoDay')}`,
            dateModified: formatUtc(analysis.lastCloseTs, 'isoDay'),
            license: 'https://creativecommons.org/licenses/by/4.0/',
            isAccessibleForFree: true,
            creator: {
                '@type': 'Organization',
                name: 'Bitcoin DCA Calculator',
                url: BASE_URL,
            },
            keywords: ['bitcoin', 'dollar cost averaging', 'day of week effect', 'backtest', 'BTC/USD'],
            measurementTechnique:
                'Deterministic backtest on one price per UTC day with zero fees. The weekday comparison averages, by UTC weekday, 100 times the natural log of the geometric mean of the seven closes centred on a day over that day\'s close. The schedules buy a fixed USD amount on their anchor weekday over an identical number of purchases.',
            variableMeasured: [
                { '@type': 'PropertyValue', name: 'Weekday', description: 'UTC weekday the purchases land on' },
                { '@type': 'PropertyValue', name: 'Mean gap between the day\'s close and the geometric mean close of the seven days centred on it', unitText: 'percent' },
                { '@type': 'PropertyValue', name: 'Margin of error (two standard errors)', unitText: 'percentage points' },
                { '@type': 'PropertyValue', name: 'BTC accumulated', unitText: 'BTC' },
                { '@type': 'PropertyValue', name: 'Average cost per BTC', unitText: 'USD' },
                { '@type': 'PropertyValue', name: 'Value at the last daily close', unitText: 'USD' },
            ],
        }
        : null;

    // Whether the full-history table rests mostly on each plan's opening buys.
    const openingDominates = analysis !== null && analysis.full.opening.sharePercent > 50;
    const centNote =
        analysis !== null && analysis.full.opening.wholeCents && analysis.full.opening.centLowerPercent !== null
            ? {
                higher: fmtPct(Math.abs(analysis.full.opening.centHigherPercent)),
                lower: fmtPct(analysis.full.opening.centLowerPercent),
            }
            : null;
    const spike = analysis ? spikeSentences(analysis) : null;

    const faqs: { q: string; a: string }[] = analysis
        ? [
            {
                q: 'Is there a best day of the week to buy Bitcoin?',
                a: `Measured week by week on Coinbase daily closes from ${formatUtc(analysis.test.fromTs, 'full')} to ${formatUtc(analysis.test.toTs, 'full')}, the cheapest weekday was ${analysis.test.best.name} (${fmtPct(analysis.test.best.edgePercent, true)} against the seven days around it) and the dearest was ${analysis.test.worst.name} (${fmtPct(analysis.test.worst.edgePercent, true)}). Each average has a margin of error of up to ±${fmtPct(analysis.test.widestMarginPercent)}. ${marginSentence(analysis.test)} On a $${WEEKLY_AMOUNT} purchase the whole gap between the best and worst weekday is ${fmtUsd(gapUsd(analysis.test))}. ${shuffleSentence(analysis.test)} ${yearsSentence(analysis.test)}`.trim(),
            },
            {
                q: 'Which weekday came out ahead over the full history?',
                a: `${analysis.full.bestName}, by ${fmtPct(analysis.full.spreadPercent)} over the worst weekday (${analysis.full.worstName}), for seven $${WEEKLY_AMOUNT}-a-week plans run from ${formatUtc(analysis.full.firstBuyTs, 'full')}. Three things sit behind that number. About ${Math.round(analysis.full.opening.sharePercent)}% of every plan's final Bitcoin came from its first ${analysis.full.opening.buys} purchases, made between ${formatUtc(analysis.full.firstBuyTs, 'full')} and ${formatUtc(analysis.full.opening.endTs, 'full')} at prices from ${fmtUsd(analysis.full.opening.minPrice)} to ${fmtUsd(analysis.full.opening.maxPrice)}.${centNote ? ` Our price series for those weeks is rounded to whole cents. Had each of those prices been one cent higher, a plan would have ended with ${centNote.higher} less Bitcoin; one cent lower, ${centNote.lower} more.` : ''}${spike ? ` ${spike.rows}. ${spike.effect}` : ''} The seven plans also start on seven different days, because no two weekdays share a date${analysis.fullOneDayLater ? `, and starting the whole comparison one day later moves ${analysis.fullOneDayLater.name} from ${ordinal(analysis.fullOneDayLater.from)} to ${ordinal(analysis.fullOneDayLater.to)}` : ''}. And before ${formatUtc(FIRST_EXCHANGE_CLOSE_TS, 'full')} the prices are 00:00 UTC figures, so a purchase labelled Monday was priced at about Sunday's close.`,
            },
            {
                q: 'Is Bitcoin cheaper at the weekend?',
                a: `${weekendSentence(analysis.test)} Bitcoin trades on every day of the week, and Coinbase publishes a daily close for a Saturday or a Sunday like any other day.`,
            },
            {
                q: 'How much money is a weekday difference actually worth?',
                a: `The whole gap between the cheapest and dearest weekday in the week-by-week test is ${fmtPct(analysis.test.gapPercent)} of a purchase. On $${WEEKLY_AMOUNT} a week that is ${fmtUsd(gapUsd(analysis.test))} a purchase, about ${fmtWholeUsd(gapUsd(analysis.test) * 52)} over a year. It is an average with a margin of error, not an amount anyone was paid.${fees?.pair ? ` For scale: the published costs of ${fees.pair.higher} and ${fees.pair.lower} differ by ${fmtUsd(fees.pair.differenceUsd)} on every $${WEEKLY_AMOUNT} purchase.` : ''}`,
            },
            {
                q: 'What moves the result more than the weekday?',
                a: `How much goes in and for how long scale the result directly: twice the amount buys twice the Bitcoin at every price. The fee is taken from every purchase.${fees ? ` The platforms in our fee comparison publish costs from ${fmtUsd(fees.lowUsd)} to ${fmtUsd(fees.highUsd)} on a $${WEEKLY_AMOUNT} recurring buy (their own pricing pages, checked ${formatUtc(fees.checkedOn, 'full')}).` : ''} The largest weekday gap measured on this page is ${fmtUsd(gapUsd(analysis.test))} on the same purchase.`,
            },
            {
                q: 'How are these numbers calculated?',
                a: `Everything uses one price per UTC day. From ${formatUtc(FIRST_EXCHANGE_CLOSE_TS, 'full')} that is Coinbase's daily close; before it, blockchain.info's market price at 00:00 UTC, which tracks the previous day's close. The week-by-week test uses the Coinbase closes only. For each day it compares that close with the average close of the seven days centred on it (a geometric average, so a day with nothing special about it scores zero), then averages by weekday; the margin of error is two standard errors. The seven plans each buy $${WEEKLY_AMOUNT} on their weekday with no fees, make exactly the same number of purchases (${fmtInt(analysis.full.purchases)} from ${formatUtc(analysis.full.firstBuyTs, 'full')}) and are valued at the last daily close. The figures are recomputed once a day.`,
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
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Best day to buy Bitcoin</li>
                    </ol>
                </nav>

                {/* Heading + lead */}
                <header className="space-y-3">
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white text-balance">
                        Is there a best day of the week to buy Bitcoin?
                    </h1>
                    {analysis ? (
                        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                            We ran seven buying plans side by side: ${WEEKLY_AMOUNT} every Monday, ${WEEKLY_AMOUNT} every
                            Tuesday, and so on through the week. That is dollar-cost averaging, or DCA, which just means
                            buying the same amount on a fixed schedule whatever the price is doing. Run from{' '}
                            <strong className={strong}>{formatUtc(analysis.full.firstBuyTs, 'full')}</strong> to{' '}
                            <strong className={strong}>{formatUtc(analysis.lastCloseTs, 'full')}</strong>, the seven finish{' '}
                            <strong className={strong}>{fmtPct(analysis.full.spreadPercent)}</strong> apart.
                            {openingDominates && (
                                <>
                                    {' '}About {Math.round(analysis.full.opening.sharePercent)}% of each plan&apos;s Bitcoin
                                    came from its first {analysis.full.opening.buys} purchases, all made by{' '}
                                    {formatUtc(analysis.full.opening.endTs, 'full')}, so that gap mostly describes those
                                    weeks.
                                </>
                            )}{' '}
                            The fairer test sets each weekday against the seven days around it, over{' '}
                            <strong className={strong}>{fmtInt(analysis.test.weeks)} weeks</strong> of Coinbase daily
                            closes. There the largest difference between two weekdays is{' '}
                            <strong className={strong}>{fmtPct(analysis.test.gapPercent)}</strong> of a purchase.
                        </p>
                    ) : (
                        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                            This page runs seven identical weekly DCA schedules, one anchored to each weekday, and tests
                            each weekday&apos;s closing price against the seven days around it. DCA, or dollar-cost
                            averaging, is buying the same amount on a fixed schedule whatever the price is doing.
                        </p>
                    )}
                </header>

                {analysis ? (
                    <>
                        {/* The conclusion, up front */}
                        <Card className="p-4 sm:p-6 border-amber-500/40 dark:border-amber-500/30">
                            <div className="flex items-start gap-3">
                                <Info className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                                <div className="space-y-2">
                                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                                        {analysis.test.beyondMargin.length === 0
                                            ? 'The short answer: none that this data can tell apart from chance'
                                            : `The short answer: ${analysis.test.beyondMargin.length} of seven weekdays fell outside the margin of error`}
                                    </h2>
                                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                        Measured week by week on Coinbase daily closes, the cheapest weekday was{' '}
                                        <strong className={cardStrong}>{analysis.test.best.name}</strong>{' '}
                                        ({fmtPct(analysis.test.best.edgePercent, true)} against the days around it) and the
                                        dearest was <strong className={cardStrong}>{analysis.test.worst.name}</strong>{' '}
                                        ({fmtPct(analysis.test.worst.edgePercent, true)}). Each of those averages is only
                                        known to within about ±{fmtPct(analysis.test.widestMarginPercent)}.{' '}
                                        {marginSentence(analysis.test)} The whole gap is {fmtUsd(gapUsd(analysis.test))} on
                                        a ${WEEKLY_AMOUNT} purchase. {shuffleSentence(analysis.test)}
                                    </p>
                                    {analysis.test.years && (
                                        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                            {yearsSentence(analysis.test)}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </Card>

                        {/* Headline stats */}
                        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                            <StatCard
                                label="Largest weekday gap"
                                value={fmtPct(analysis.test.gapPercent)}
                                sub={`${analysis.test.best.name} against ${analysis.test.worst.name}, per purchase`}
                            />
                            <StatCard
                                label="Margin of error"
                                value={`±${fmtPct(analysis.test.widestMarginPercent)}`}
                                sub="Widest of the seven weekday averages"
                            />
                            <StatCard
                                label="Weeks measured"
                                value={fmtInt(analysis.test.weeks)}
                                sub={`Coinbase daily closes from ${formatUtc(analysis.test.fromTs, 'monthYear')}`}
                            />
                            <StatCard
                                label={`Seven plans since ${formatUtc(analysis.full.firstBuyTs, 'monthYear')}`}
                                value={fmtPct(analysis.full.spreadPercent)}
                                sub={`${analysis.full.bestName} ahead of ${analysis.full.worstName}. Read the notes under that table`}
                            />
                        </section>

                        {/* The test that measures weekdays */}
                        <Card className="p-4 sm:p-6">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                                Each weekday against the week around it
                            </h2>
                            <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
                                For every day from {formatUtc(analysis.test.fromTs, 'full')} to{' '}
                                {formatUtc(analysis.test.toTs, 'full')} we compare that day&apos;s close with the average
                                close of the seven days centred on it, then average by weekday. Positive means the day
                                closed below its week: cheaper.
                            </p>
                            <div className="overflow-x-auto -mx-1 sm:mx-0">
                                <table className="w-full text-xs sm:text-sm tabular-nums">
                                    <caption className="sr-only">
                                        Each weekday&apos;s close against the average close of the seven days centred on
                                        it, with a margin of error and the number of calendar years the weekday was cheaper
                                        than its week
                                    </caption>
                                    <thead>
                                        <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                            <th scope="col" className="py-2 pr-3 font-medium">Buy day</th>
                                            <th scope="col" className="py-2 pr-3 font-medium text-right">Against its week</th>
                                            <th scope="col" className="py-2 pr-3 font-medium text-right">Margin of error</th>
                                            <th scope="col" className="py-2 font-medium text-right">Cheaper than its week in</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-700 dark:text-slate-300">
                                        {DISPLAY_ORDER.map((weekday) => {
                                            const row = analysis.test.rows[weekday];
                                            return (
                                                <tr key={weekday} className="border-b border-slate-100 dark:border-slate-800/60">
                                                    <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-800 dark:text-slate-100">
                                                        {row.name}
                                                    </th>
                                                    <td className="py-2 pr-3 text-right font-medium">{fmtPct(row.edgePercent, true)}</td>
                                                    <td className="py-2 pr-3 text-right text-slate-500 dark:text-slate-400">
                                                        ±{fmtPct(row.marginPercent)}
                                                    </td>
                                                    <td className="py-2 text-right">
                                                        {row.yearsCounted > 0 ? `${row.yearsAhead} of ${row.yearsCounted} years` : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                                            <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-800 dark:text-slate-100">
                                                Best minus worst
                                            </th>
                                            <td className="py-2 pr-3 text-right font-medium">{fmtPct(analysis.test.gapPercent)}</td>
                                            <td className="py-2 pr-3" />
                                            <td className="py-2" />
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <p className={clsx('mt-4', note)}>
                                <strong className={noteStrong}>How to read it.</strong>{' '}
                                One day&apos;s price typically sits {fmtPct(analysis.test.typicalDayPercent)} above or below
                                its own week, so a single week says nothing and it takes {fmtInt(analysis.test.weeks)} of
                                them to pin an average down even this far. The margin of error is two standard errors: if
                                chance alone were at work, an average would land inside it about 19 times in 20.{' '}
                                {marginSentence(analysis.test)}
                            </p>
                            {analysis.test.years && (
                                <p className={clsx('mt-3', note)}>
                                    <strong className={noteStrong}>The last column needs no statistics.</strong>{' '}
                                    It splits the same days into {analysis.test.years.count} calendar years,{' '}
                                    {analysis.test.years.first} to {analysis.test.years.last}, which share no days with each
                                    other. A weekday with no edge comes out ahead in about half of them.
                                </p>
                            )}
                            <p className={clsx('mt-3', note)}>
                                <strong className={noteStrong}>A check that assumes nothing.</strong>{' '}
                                Inside every run of seven days we dealt the seven figures to the weekdays at random,{' '}
                                {fmtInt(analysis.test.shuffle.deals)} times over. That removes any real weekday effect and
                                leaves everything else as it was.{' '}
                                {analysis.test.shuffle.gapAtLeastPercent === 0
                                    ? `A best-to-worst gap as large as the real ${fmtPct(analysis.test.gapPercent)} did not turn up once.`
                                    : `The best-to-worst gap came out at least as large as the real ${fmtPct(analysis.test.gapPercent)} in ${dealShare(analysis.test.shuffle.gapAtLeastPercent)} of those deals.`}
                                {analysis.test.shuffle.lopsidedAtLeastPercent !== null && (
                                    <>
                                        {' '}At least {analysis.test.lopsided.length}{' '}
                                        {analysis.test.lopsided.length === 1 ? 'weekday' : 'weekdays'} came out as
                                        one-sided across the calendar years as in the real table in{' '}
                                        {dealShare(analysis.test.shuffle.lopsidedAtLeastPercent)} of them.
                                    </>
                                )}
                            </p>
                            <p className={clsx('mt-3', note)}>
                                <strong className={noteStrong}>What it is in money.</strong>{' '}
                                The whole gap, {analysis.test.best.name} against {analysis.test.worst.name}, is{' '}
                                {fmtPct(analysis.test.gapPercent)} of a purchase: {fmtUsd(gapUsd(analysis.test))} on a $
                                {WEEKLY_AMOUNT} buy, about {fmtWholeUsd(gapUsd(analysis.test) * 52)} over a year of weekly
                                buys.
                                This table describes {fmtInt(analysis.test.weeks)} past weeks. It is not a forecast of the
                                next one.
                            </p>
                        </Card>

                        {/* The seven plans */}
                        <Card className="p-4 sm:p-6">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                                The seven plans, full price history
                            </h2>
                            <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
                                ${WEEKLY_AMOUNT} per week, {fmtInt(analysis.full.purchases)} purchases each
                                ({fmtUsd(analysis.full.invested)} invested), no fees, valued at the{' '}
                                {formatUtc(analysis.lastCloseTs, 'full')} close of {fmtUsd(analysis.lastClose)}. The last
                                purchases land in the week ending {formatUtc(analysis.full.lastBuyTs, 'full')}.
                            </p>
                            {/* The two columns that rank the plans come first, and the 500px
                                floor leaves both whole on a 360px screen. The other two scroll
                                sideways inside the card while the weekday stays put, and the box
                                takes keyboard focus because Safari gives a keyboard no other way
                                to scroll it. */}
                            <div className="overflow-x-auto -mx-1 sm:mx-0" tabIndex={0} role="region" aria-label="Seven plans table">
                                <table className="w-full text-xs sm:text-sm tabular-nums min-w-[500px]">
                                    <caption className="sr-only">
                                        BTC accumulated, average cost and value for seven identical weekly Bitcoin DCA
                                        schedules, one anchored to each weekday, with the date each made its first purchase
                                    </caption>
                                    <thead>
                                        <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                            <th scope="col" className={clsx(stickyLabel, 'py-2 pr-4 font-medium')}>Buy day</th>
                                            <th scope="col" className="py-2 pr-4 font-medium text-right">BTC accumulated</th>
                                            <th scope="col" className="py-2 pr-4 font-medium text-right">vs. average plan</th>
                                            <th scope="col" className="py-2 pr-4 font-medium text-right">Average cost / BTC</th>
                                            <th scope="col" className="py-2 font-medium text-right">Value at last close</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-700 dark:text-slate-300">
                                        {DISPLAY_ORDER.map((weekday) => {
                                            const row = analysis.full.rows[weekday];
                                            return (
                                                <tr
                                                    key={weekday}
                                                    className="border-b border-slate-100 dark:border-slate-800/60 last:border-0"
                                                >
                                                    <th scope="row" className={clsx(stickyLabel, 'py-2 pr-4 text-left font-medium text-slate-800 dark:text-slate-100')}>
                                                        {row.name}
                                                        {/* A real space, not only a margin: without one a screen
                                                            reader and a copy-paste both get "Fridaymost BTC". */}
                                                        {row.rank === 1 && (
                                                            <>
                                                                {' '}
                                                                <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                                                                    most BTC
                                                                </span>
                                                            </>
                                                        )}
                                                        <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">
                                                            First buy {formatUtc(row.startTs, 'full')}
                                                        </span>
                                                    </th>
                                                    <td className="py-2 pr-4 text-right">{fmtBtc(row.btc)}</td>
                                                    <td
                                                        className={clsx(
                                                            'py-2 pr-4 text-right font-medium',
                                                            row.vsMeanPercent >= 0
                                                                ? 'text-emerald-700 dark:text-emerald-400'
                                                                : 'text-loss',
                                                        )}
                                                    >
                                                        {fmtPct(row.vsMeanPercent, true)}
                                                    </td>
                                                    <td className="py-2 pr-4 text-right">{fmtUsd(row.averageCost)}</td>
                                                    <td className="py-2 text-right">{fmtUsd(row.finalValue)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <p className={clsx('mt-4', note)}>
                                <strong className={noteStrong}>Read this table carefully before quoting it.</strong>{' '}
                                About <strong className={noteStrong}>{Math.round(analysis.full.opening.sharePercent)}%</strong>{' '}
                                of the Bitcoin in every row came from that row&apos;s first {analysis.full.opening.buys}{' '}
                                purchases, made between {formatUtc(analysis.full.firstBuyTs, 'full')} and{' '}
                                {formatUtc(analysis.full.opening.endTs, 'full')} at prices from{' '}
                                {fmtUsd(analysis.full.opening.minPrice)} to {fmtUsd(analysis.full.opening.maxPrice)}. That
                                is {fmtUsd(analysis.full.opening.buys * WEEKLY_AMOUNT)} of the{' '}
                                {fmtUsd(analysis.full.invested)} invested.
                                {centNote && (
                                    <>
                                        {' '}Our price series for those weeks is rounded to whole cents. Had each of those
                                        prices been one cent higher, a row would hold {centNote.higher} less Bitcoin; one
                                        cent lower, {centNote.lower} more. The whole table spans{' '}
                                        {fmtPct(analysis.full.spreadPercent)}.
                                    </>
                                )}
                                {spike && (
                                    <>
                                        {' '}{spike.rows}, and the{' '}
                                        <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                            methodology page
                                        </Link>{' '}
                                        has both sets of figures. {spike.effect}
                                    </>
                                )}
                            </p>
                            <p className={clsx('mt-3', note)}>
                                <strong className={noteStrong}>The plans do not start together.</strong>{' '}
                                Only one weekday falls on any given date, so seven weekly plans begin on seven days in a
                                row, and every purchase of the plan that starts first lands six days ahead of the matching
                                purchase of the plan that starts last. While the price is climbing, earlier is cheaper.
                                {analysis.fullOneDayLater && (
                                    <>
                                        {' '}Start this whole comparison one day later and {analysis.fullOneDayLater.name}{' '}
                                        moves from {ordinal(analysis.fullOneDayLater.from)} to{' '}
                                        {ordinal(analysis.fullOneDayLater.to)}.
                                    </>
                                )}
                                {analysis.exchange && (
                                    <>
                                        {' '}Run the same seven plans from {formatUtc(analysis.exchange.firstBuyTs, 'full')},
                                        where the Coinbase closes in our series begin, and{' '}
                                        {analysis.exchange.ranksInStartOrder === analysis.exchange.rows.length
                                            ? 'they finish in exactly the order they started in'
                                            : `${analysis.exchange.ranksInStartOrder} of the seven finish in the place they started in`}
                                        :{' '}
                                        {joinNames(
                                            [...analysis.exchange.rows].sort((a, b) => a.rank - b.rank).map((row) => row.name),
                                        )}
                                        , {fmtPct(analysis.exchange.spreadPercent)} apart from first to last.
                                    </>
                                )}
                            </p>
                            <p className={clsx('mt-3', note)}>
                                <strong className={noteStrong}>
                                    Before {formatUtc(FIRST_EXCHANGE_CLOSE_TS, 'full')} the weekday labels are a day out.
                                </strong>{' '}
                                For those years our prices are blockchain.info&apos;s market price, an average across
                                exchanges stamped at 00:00 UTC, which tracks the previous day&apos;s close. A purchase
                                labelled Monday in those years was priced at about Sunday&apos;s close, and{' '}
                                {fmtPct(analysis.full.beforeExchangePercent)} of the Bitcoin in this table was bought in
                                those years. That is why the first table uses Coinbase closes only. The value column here
                                is arithmetic on a{' '}
                                {Math.round((analysis.full.lastBuyTs - analysis.full.firstBuyTs) / (365.25 * DAY_MS))}-year
                                schedule. It is published for completeness, not as a target.
                            </p>
                        </Card>

                        {/* Reading the result */}
                        <section className="space-y-4">
                            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                                What the two tables do and do not show
                            </h2>
                            <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                                <p>
                                    <strong className="text-slate-800 dark:text-slate-200">Bitcoin trades every day of the
                                        week.</strong>{' '}
                                    The Coinbase series has a closing price for{' '}
                                    {estimatedDays === 0
                                        ? 'every calendar day'
                                        : `all but ${fmtInt(estimatedDays)} of the calendar days`}{' '}
                                    since {formatUtc(FIRST_EXCHANGE_CLOSE_TS, 'full')}, weekends included, so there is no
                                    weekly open or close for a pattern to hang on. That does not prove no pattern exists.
                                    It is why the first table is the test, and why its result is stated with a margin of
                                    error.
                                </p>
                                <p>
                                    <strong className="text-slate-800 dark:text-slate-200">Seven buckets, one history.</strong>{' '}
                                    Split any price history into seven groups and one of them comes out on top. That is
                                    arithmetic, not a finding. What separates an effect from luck is whether the same group
                                    stays ahead in stretches of time that share no days. The last column of the first
                                    table is that check.
                                </p>
                                <p>
                                    <strong className="text-slate-800 dark:text-slate-200">The fee is certain; the weekday gap
                                        is not.</strong>{' '}
                                    The largest gap in the first table is {fmtUsd(gapUsd(analysis.test))} on a $
                                    {WEEKLY_AMOUNT} purchase, and it is an average with a margin of error. A fee is taken
                                    from every purchase.
                                    {fees && (
                                        <>
                                            {' '}The platforms in our{' '}
                                            <Link href="/calculators/exchange-fees" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                                fee comparison
                                            </Link>{' '}
                                            publish costs from {fmtUsd(fees.lowUsd)} to {fmtUsd(fees.highUsd)} on a $
                                            {WEEKLY_AMOUNT} recurring buy (their own pricing pages, checked{' '}
                                            {formatUtc(fees.checkedOn, 'full')}).
                                            {fees.pair && (
                                                <>
                                                    {' '}The published costs of {fees.pair.higher} and {fees.pair.lower}{' '}
                                                    differ by {fmtUsd(fees.pair.differenceUsd)} on every purchase.
                                                </>
                                            )}
                                        </>
                                    )}
                                </p>
                                <p>
                                    <strong className="text-slate-800 dark:text-slate-200">A skipped purchase is missing in
                                        full.</strong>{' '}
                                    In the first table the weekday moved what one purchase bought by{' '}
                                    {fmtPct(Math.max(Math.abs(analysis.test.best.edgePercent), Math.abs(analysis.test.worst.edgePercent)))}{' '}
                                    at most, on average. A purchase that does not happen buys nothing. A buy that runs
                                    automatically on a fixed day, whichever day that is, takes the weekday out of the
                                    question.
                                </p>
                            </div>
                        </section>

                        {/* Methodology */}
                        <Card className="p-4 sm:p-6">
                            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-2">
                                How these numbers were computed
                            </h2>
                            <p className={note}>
                                Everything uses one price per UTC day. From {formatUtc(FIRST_EXCHANGE_CLOSE_TS, 'full')}{' '}
                                that is Coinbase&apos;s daily candle close, the last trade of the UTC day. Before it, it is
                                blockchain.info&apos;s market price, an average across exchanges stamped at 00:00 UTC. Over
                                the {fmtInt(SNAPSHOT_VS_COINBASE_CLOSE.daysCompared)} days where both exist, that figure
                                sits a median {SNAPSHOT_VS_COINBASE_CLOSE.previousDayPercent}% from Coinbase&apos;s close of
                                the day before and {SNAPSHOT_VS_COINBASE_CLOSE.sameDayPercent}% from its close of the same
                                day (measured {formatUtc(SNAPSHOT_VS_COINBASE_CLOSE.measuredOn, 'full')}), so it is in
                                effect the previous day&apos;s close.{' '}
                                {estimatedDays > 0 && (
                                    <>
                                        Coinbase has no candle for {fmtInt(estimatedDays)}{' '}
                                        {estimatedDays === 1 ? 'day' : 'days'} in the series; those are filled in along a
                                        straight line between the days either side.{' '}
                                    </>
                                )}
                                All dates are UTC. An automatic buy that fires at another time of day is priced
                                differently from the close used here.
                            </p>
                            <p className={clsx('mt-3', note)}>
                                <strong className={noteStrong}>Week-by-week test.</strong>{' '}
                                Coinbase closes only. For each day, the close is compared with the geometric mean of the
                                seven closes centred on it: three before, the day itself, three after. The figure is 100
                                times the natural log of that mean over the day&apos;s close, which for gaps this small is
                                the percentage the day closed below its week. A plain dollar spread over the week is not
                                used, because a fixed amount spread over seven moving prices buys slightly more than the
                                same amount on the middle day whatever the weekday, which would put every weekday a few
                                hundredths of a percent below zero. Centring the week on the day keeps a rising price out
                                of the answer. Against a fixed Monday-to-Sunday week, later days would look dearer simply
                                for being later.
                                The figure shown is the mean over every Monday, every Tuesday and so on, and the margin of
                                error is two standard errors of that mean. A calendar year is counted only when all of its
                                days were measured. The random deals shuffle the seven figures within each consecutive run
                                of seven measured days, {fmtInt(analysis.test.shuffle.deals)} times, from a fixed starting
                                seed so the same prices always give the same shares.
                            </p>
                            <p className={clsx('mt-3', note)}>
                                <strong className={noteStrong}>Seven plans.</strong>{' '}
                                For each weekday we find the first UTC date on or after the start of the data that falls on
                                it and run a weekly schedule from there: ${WEEKLY_AMOUNT} per purchase, zero fees, using
                                the same engine as the main calculator. The number of purchases is capped at the lowest of
                                the seven, so all seven invest exactly the same total. Every row is valued at the same last
                                daily close, so ranking by value and ranking by BTC are the same thing. Figures refresh
                                once every 24 hours; the data runs from {formatUtc(analysis.full.firstBuyTs, 'full')} to{' '}
                                {formatUtc(analysis.lastCloseTs, 'full')}. Price sources, fee math and UTC handling are on
                                the{' '}
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
                                {faqs.map(({ q, a }) => (
                                    <Card key={q} className="p-4 sm:p-5">
                                        <h3 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-100">{q}</h3>
                                        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{a}</p>
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
                                    minutes. The calculator on the home page has a second price source to fall back on, so
                                    a weekly schedule can still be run there.
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
                        The calculator runs a weekly plan on the same Coinbase closes. Change the amount, the fee and the
                        dates to see what each one does to the result.
                    </p>
                    <Link
                        href={`/?amount=${WEEKLY_AMOUNT}&frequency=weekly&fee=0&provider=coinbase`}
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
                            { href: '/lump-sum-vs-dca', label: 'Lump sum vs DCA', sub: 'Both strategies, every start month since 2010' },
                            { href: '/dca/start-date-heatmap', label: 'Start-date heatmap', sub: 'Returns by the year a plan started and how long it ran' },
                            { href: '/dca', label: 'DCA scenarios', sub: 'What steady buying would be worth today' },
                            { href: '/calculators/exchange-fees', label: 'Exchange fees', sub: 'What each platform publishes, with its source' },
                            { href: '/methodology', label: 'Methodology', sub: 'Price sources, fee math and UTC handling' },
                            { href: '/features', label: 'Calculator features', sub: 'What the tool can actually do' },
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
                    performance does not guarantee future results, and a pattern found in historical data is not a
                    prediction. That is the entire point of this page. Bitcoin is volatile and you can lose money.
                </p>

            </div>
        </>
    );
}
