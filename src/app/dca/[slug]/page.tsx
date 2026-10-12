import type { Metadata } from 'next';
import { cache, type CSSProperties } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ArrowRight, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { Card } from '@/components/ui/Card';
import { getBitcoinPriceHistoryWithMeta, getBitcoinSpot } from '@/app/actions';
import { studyUnavailable } from '@/app/best-day-to-buy-bitcoin/loadStudyCloses';
import { DAILY_PRICE_REVALIDATE } from '@/utils/revalidate';
import { PRICE_KIND_CODE, calculateDca, priceSeriesCovers, withPriceKinds } from '@/utils/dca';
import { DAY_MS, clampToTodayUtc, formatUtc, utcDayStart } from '@/utils/dates';
import { btcToSats } from '@/utils/units';
import {
    DEFAULT_PRICE_PROVIDER,
    FIRST_EXCHANGE_CLOSE_TS,
    PRICE_PROVIDER_LABELS,
    priceFallbackNotice,
    priceStaleNotice,
    type PriceProvider,
} from '@/data/priceSources';
import type { DcaResult } from '@/types';
import {
    CURATED_SCENARIOS,
    SCENARIO_AMOUNTS,
    SCENARIO_YEARS,
    SCENARIOS,
    findScenario,
    getCuratedScenario,
    getScenario,
    type Scenario,
} from '../scenarios';
import { chooseValuation, type Valuation } from './valuation';
import { buildYearRows, type YearRow } from './yearRows';

// Prerender all matrix + curated scenarios and recompute against fresh prices once a day.
export const revalidate = 86400;
// Anything outside the fixed lists is a 404: never compute arbitrary slugs.
export const dynamicParams = false;

const BASE_URL = 'https://btcdollarcostaverage.com';

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams(): { slug: string }[] {
    return [...SCENARIOS.map(({ slug }) => ({ slug })), ...CURATED_SCENARIOS.map(({ slug }) => ({ slug }))];
}

// ── View model ─────────────────────────────────────────────────────────────────
// One shape for both scenario kinds, so the template can never state a curated
// plan's dates or cadence wrong: every date below comes from the entry itself.

const FREQ_NOUN = { daily: 'day', weekly: 'week', biweekly: '2 weeks', monthly: 'month' } as const;

const LONG_DATE = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });

interface ScenarioView {
    slug: string;
    amount: number;
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
    /** "week", "month", "day", "2 weeks" — reads as "every {noun}" */
    freqNoun: string;
    startTs: number;
    startDateIso: string;
    /** "January 1, 2015" / "November 10, 2021" */
    startLong: string;
    /** Set only for fixed-window curated scenarios. */
    endTs?: number;
    endDateIso?: string;
    endLong?: string;
    heading: string;
    metaTitle: string;
    /** Curated entries carry their own hook; matrix pages build one from numbers. */
    curatedDescription?: string;
    shortLabel: string;
    /** Present only for matrix entries — drives the related-scenarios grid. */
    matrix?: Scenario;
}

function buildView(slug: string): ScenarioView | null {
    const matrix = getScenario(slug);
    if (matrix) {
        return {
            slug,
            amount: matrix.amount,
            frequency: matrix.frequency,
            freqNoun: matrix.freqSlug,
            startTs: matrix.startTs,
            startDateIso: matrix.startDateIso,
            startLong: LONG_DATE.format(matrix.startTs),
            heading: `$${matrix.amount} per ${matrix.freqSlug} in Bitcoin since ${matrix.year}`,
            metaTitle: `$${matrix.amount}/${matrix.freqSlug === 'week' ? 'Week' : 'Month'} in Bitcoin Since ${matrix.year}: What It's Worth Today`,
            shortLabel: matrix.shortLabel,
            matrix,
        };
    }
    const curated = getCuratedScenario(slug);
    if (!curated) return null;
    return {
        slug,
        amount: curated.amount,
        frequency: curated.frequency,
        freqNoun: FREQ_NOUN[curated.frequency],
        startTs: curated.startTs,
        startDateIso: curated.startDateIso,
        startLong: LONG_DATE.format(curated.startTs),
        endTs: curated.endTs,
        endDateIso: curated.endDateIso,
        endLong: curated.endTs !== undefined ? LONG_DATE.format(curated.endTs) : undefined,
        heading: curated.title,
        metaTitle: curated.title,
        curatedDescription: curated.description,
        shortLabel: curated.shortLabel,
    };
}

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

// Rounded, as the calculator rounds it (utils/units). Flooring printed one sat
// fewer than the BTC figure beside it whenever the product fell a hair short
// of a whole number: 0.29 BTC is 28,999,999.999999996 sats in floating point.
const fmtSats = (btc: number): string => `${btcToSats(btc).toLocaleString('en-US')} sats`;

const fmtInt = (value: number): string => value.toLocaleString('en-US');

/** "Oct 12, 2026 at 04:50 UTC": a moment, not a day, because a daily page can be a day or more old. */
const fmtUtcMoment = (ts: number): string =>
    `${formatUtc(ts, 'full')} at ${new Date(ts).toISOString().slice(11, 16)} UTC`;

// ── Computation ────────────────────────────────────────────────────────────────

interface ScenarioData {
    result: DcaResult;
    yearRows: YearRow[];
    /** USD per bitcoin the stack is valued at, and the moment that price is from (ms). */
    price: number;
    priceAsOf: number;
    /** Where `price` came from: a quote, or the price history's newest row. */
    priceFrom: Valuation['from'];
    series: {
        requested: PriceProvider;
        /** Whose prices these really are; differs from `requested` only on a fallback. */
        served: PriceProvider;
        /** True when the exchange could not be reached and an earlier copy was used. */
        stale: boolean;
        /** When the series was fetched from the exchange (ms). */
        fetchedAt: number;
    };
}

// React's cache: generateMetadata and the page share one computation (and one
// reading of the clock), so the description and the body can never quote
// different numbers.
const loadScenario = cache(async (slug: string): Promise<ScenarioData | null> => {
    const view = buildView(slug);
    if (!view) return null;
    try {
        const now = Date.now();
        // A fixed-window scenario stops BUYING at its end date; the stack is
        // still valued at the latest price, same as every result on the site.
        // Never past today: a buy dated tomorrow has not happened.
        const buyEndTs = clampToTodayUtc(view.endTs ?? now, now);
        // The site's default series, named so the link to the calculator and
        // the share card below can ask for the same one.
        const [history, spot] = await Promise.all([
            getBitcoinPriceHistoryWithMeta(view.startTs, utcDayStart(now) + DAY_MS, DEFAULT_PRICE_PROVIDER, DAILY_PRICE_REVALIDATE),
            getBitcoinSpot(DEFAULT_PRICE_PROVIDER, DAILY_PRICE_REVALIDATE),
        ]);
        // The engine carries the last price forward without limit, so a short
        // or stale series would still produce a full page of wrong numbers.
        if (!priceSeriesCovers(history.data, view.startTs, buyEndTs)) {
            throw new Error('price history does not cover the schedule');
        }
        const series = withPriceKinds(history.data, history.kinds);
        const valuation = chooseValuation({
            quote: spot,
            lastRow: history.data[history.data.length - 1],
            lastRowObserved: history.kinds.length === history.data.length
                && history.kinds.endsWith(PRICE_KIND_CODE.observed),
            historyFetchedAt: history.fetchedAt,
            historyProvider: history.servedProvider,
        });
        if (!(valuation.price > 0)) throw new Error('no usable price');
        // With no price that has a time to it, the engine values the stack at
        // the series' last row and dates that row itself.
        const timed = valuation.from.kind !== 'lastRow';

        const result = calculateDca(
            {
                amount: view.amount,
                frequency: view.frequency,
                startDate: new Date(view.startTs),
                endDate: new Date(buyEndTs),
                feePercentage: 0,
                priceMode: 'api',
                manualPrice: 0,
            },
            series,
            timed ? valuation.price : null,
            // Dates the XIRR's final cash flow at the moment the price is
            // from, which on a daily page is not the moment it is read.
            timed ? valuation.asOf : now,
        );
        if (result.totalInvested <= 0 || !Number.isFinite(result.currentValue)) {
            throw new Error('the schedule produced no purchases');
        }

        return {
            result,
            yearRows: buildYearRows(result.breakdown, series, {
                currentValue: result.currentValue,
                nowTs: now,
                endTs: view.endTs,
            }),
            price: valuation.price,
            priceAsOf: valuation.asOf,
            priceFrom: valuation.from,
            series: {
                requested: history.requestedProvider,
                served: history.servedProvider,
                stale: history.stale,
                fetchedAt: history.fetchedAt,
            },
        };
    } catch (error) {
        // Once deployed this throws, so Next keeps the last page that rendered,
        // which prints the date of its price. During a build it resolves null
        // and the page renders its unavailable card for a few minutes.
        return studyUnavailable(`dca/${slug}`, error);
    }
});

function relatedScenarios(scenario: Scenario): Scenario[] {
    const related: Scenario[] = [];
    // Same amount and year, the other cadence
    const mirror = findScenario(scenario.amount, scenario.freqSlug === 'week' ? 'month' : 'week', scenario.year);
    if (mirror) related.push(mirror);
    // Same amount and cadence, nearest other years
    const nearbyYears = SCENARIO_YEARS
        .filter((y) => y !== scenario.year)
        .sort((a, b) => Math.abs(a - scenario.year) - Math.abs(b - scenario.year))
        .slice(0, 3);
    for (const year of nearbyYears) {
        const s = findScenario(scenario.amount, scenario.freqSlug, year);
        if (s) related.push(s);
    }
    // Same year and cadence, other amounts
    for (const amount of SCENARIO_AMOUNTS.filter((a) => a !== scenario.amount).slice(0, 2)) {
        const s = findScenario(amount, scenario.freqSlug, scenario.year);
        if (s) related.push(s);
    }
    return related;
}

// ── Metadata ───────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const view = buildView(slug);
    if (!view) return {};

    // Root layout template appends "| Bitcoin DCA Calculator", so no suffix here.
    const title = view.metaTitle;

    let description = view.curatedDescription
        ?? `See what buying $${view.amount} of Bitcoin every ${view.freqNoun} since ${view.startLong} would be worth today: total invested, BTC accumulated, and year-by-year returns from real historical prices.`;
    try {
        // The same computation the page body renders, via React's cache.
        const data = await loadScenario(slug);
        if (data) {
            const { result } = data;
            const window = view.endLong
                ? `from ${view.startLong} to ${view.endLong}`
                : `since ${view.startLong}`;
            // Dated, because a search snippet can outlive the figure by weeks.
            description = `Buying $${view.amount} of Bitcoin every ${view.freqNoun} ${window} adds up to ${fmtUsd(result.totalInvested)} invested, worth ${fmtUsd(result.currentValue)} on ${formatUtc(data.priceAsOf, 'full')} (${fmtPct(result.roi, true)}), with ${fmtBtc(result.btcAccumulated)} accumulated.`;
        }
    } catch {
        // Keep the generic description. Once deployed, the page body throws the
        // same error and Next keeps the last good page (see loadScenario).
    }

    // The /api/og result-card renderer accepts the same query params as /share.
    // fee=0 and the provider match this page's computation; endDate is included
    // only for fixed-window scenarios — omitted, the card defaults to "today".
    const ogImage = `/api/og?${new URLSearchParams({
        amount: String(view.amount),
        frequency: view.frequency,
        startDate: view.startDateIso,
        ...(view.endDateIso ? { endDate: view.endDateIso } : {}),
        fee: '0',
        provider: DEFAULT_PRICE_PROVIDER,
    })}`;

    return {
        title,
        description,
        alternates: { canonical: `/dca/${slug}` },
        openGraph: {
            images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
            title,
            description,
            type: 'article',
            siteName: 'Bitcoin DCA Calculator',
            locale: 'en_US',
        },
        twitter: {
            images: [ogImage],
            card: 'summary_large_image',
            title,
            description,
            creator: '@9drix9',
        },
    };
}

// ── Page ───────────────────────────────────────────────────────────────────────

// A breadcrumb link is one or two short words, about 15px tall as text on a
// phone. The padding makes it a 44px touch target, and the negative margins
// hand the same space back so the row sits exactly where it did.
const crumbLink =
    'inline-flex min-h-11 items-center -my-3.5 px-1.5 -mx-1.5 hover:text-amber-700 dark:hover:text-amber-400 transition-colors';

/**
 * How wide one character of a headline figure is, in ems, with room to spare.
 * In Inter Bold with tabular figures and the tracking below, a digit, "$" or
 * "+" is about 0.63em and a comma, point or space about 0.25em, so the widest
 * mix a money figure can have ("+$100,000") averages just under 0.59. The
 * fallback font is narrower.
 */
const STAT_CHAR_EM = 0.62;

/**
 * The size of the four headline figures: text-2xl (text-3xl from sm), or
 * smaller when the longest of them would not fit its card on one line. A
 * figure must never wrap inside itself, because its first line reads as a
 * complete, different amount. `--stat-fit` is that longest figure's width in
 * ems, set on the row, and `cqw` is the card's own width, so the four stay one
 * size.
 */
const STAT_VALUE_SIZE =
    'text-[length:min(1.5rem,calc(100cqw/var(--stat-fit)))] sm:text-[length:min(1.875rem,calc(100cqw/var(--stat-fit)))]';

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
        <Card celebrated={celebrated} className="@container p-4 sm:p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
            <p className={clsx(STAT_VALUE_SIZE, 'mt-1 font-bold leading-[1.15] tracking-[-0.02em] tabular-nums whitespace-nowrap', valueClassName ?? 'text-slate-900 dark:text-white')}>
                {value}
            </p>
            {sub && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
        </Card>
    );
}

/**
 * Marks a figure that rests on a filled-in price. Visible text on purpose: a
 * colour or a tooltip would not survive a screenshot, or a phone.
 */
function Est() {
    return <span className="ml-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">est.</span>;
}

export default async function DcaScenarioPage({ params }: PageProps) {
    const { slug } = await params;
    const view = buildView(slug);
    if (!view) notFound();

    const { amount, freqNoun } = view;
    const data = await loadScenario(slug);
    const result = data?.result;
    const related = view.matrix
        ? relatedScenarios(view.matrix)
        : [];
    // Curated pages relate to their curated siblings — same story family. The
    // four that follow this one in the list, wrapping round, so every curated
    // page is linked from four others.
    const curatedIndex = CURATED_SCENARIOS.findIndex((c) => c.slug === view.slug);
    const relatedCurated = view.matrix
        ? []
        : [1, 2, 3, 4].map((step) => CURATED_SCENARIOS[(curatedIndex + step) % CURATED_SCENARIOS.length]);

    const heading = view.heading;
    const windowText = view.endLong
        ? `from ${view.startLong} to ${view.endLong}`
        : `from ${view.startLong}`;
    const ctaHref = `/?amount=${amount}&frequency=${view.frequency}&startDate=${view.startDateIso}${view.endDateIso ? `&endDate=${view.endDateIso}` : ''}&fee=0&provider=${DEFAULT_PRICE_PROVIDER}`;
    const pageUrl = `${BASE_URL}/dca/${slug}`;

    const stats = result?.stats;
    // The four headline figures as printed, and the width of the longest in
    // ems, which is what their shared size is worked out from (STAT_VALUE_SIZE).
    const headline = result
        ? {
            invested: fmtUsd(result.totalInvested),
            value: fmtUsd(result.currentValue),
            profit: `${result.profit >= 0 ? '+' : ''}${fmtUsd(result.profit)}`,
            // 4 decimals at headline size, 2 from one bitcoin up: the full
            // figure is in the sats line under it and in the lead paragraph,
            // and 8 decimals here would shrink all four figures to fit.
            btc: `${result.btcAccumulated.toFixed(result.btcAccumulated >= 1 ? 2 : 4)} BTC`,
        }
        : null;
    const statFit = headline
        ? Math.max(...Object.values(headline).map((text) => text.length)) * STAT_CHAR_EM
        : 0;
    const yearRows = data?.yearRows ?? [];
    // No starting stack on these pages, so every breakdown row is a purchase.
    const purchaseCount = result ? result.breakdown.length : 0;
    const profitClass = result && result.profit >= 0
        ? 'text-gain'
        : 'text-loss';

    // ── Which figures rest on estimated prices ────────────────────────────────
    // Read off the series' own markers, never assumed from the exchange's name:
    // the price action falls back from one exchange to the other, and even a
    // daily series can hold a filled-in day. A series with no markers at all is
    // "unknown", and unknown must not be printed as if it were observed.
    const marks = stats?.estimatedPrices;
    const drawdownEstimated = stats?.maxDrawdownPercent != null && (!marks || marks.drawdownDays > 0);
    // The drawdown check ends on the plan's last day, while value, ROI and XIRR
    // run to the day of the price. On a fixed window that has ended those are
    // different days, and a deeper fall since is not in the figure.
    const drawdownStopsEarly = data != null
        && stats?.maxDrawdownPercent != null
        && view.endTs !== undefined
        && utcDayStart(view.endTs) < utcDayStart(data.priceAsOf);
    const bestBuyEstimated = stats?.bestBuy != null && stats.bestBuy.priceKind !== 'observed';
    // The current year is valued at the headline price, not at a year-end row.
    const yearValueEstimated = (row: YearRow): boolean => !row.isCurrentYear && (row.estimated || !marks);
    const yearEndEstimated = yearRows.some(yearValueEstimated);

    const notices: string[] = [];
    if (data) {
        const fallbackNotice = priceFallbackNotice(data.series.requested, data.series.served);
        if (fallbackNotice) notices.push(fallbackNotice);
        if (data.series.stale) notices.push(priceStaleNotice(data.series.served, data.series.fetchedAt));
        if (!marks) {
            notices.push('This price history came without its observed-or-estimated markers, so the figures marked "est." may rest on filled-in prices.');
        } else if (marks.purchases > 0 || marks.drawdownDays > 0) {
            notices.push(
                `${fmtInt(marks.purchases)} of the ${fmtInt(purchaseCount)} purchases and ${fmtInt(marks.drawdownDays)} of the ${fmtInt(marks.drawdownDaysWalked)} days checked for max drawdown were priced on an estimate: a straight-line value between two reported closes, or an earlier close carried forward. Figures marked "est." rest on one.`,
            );
        }
        if (marks && marks.drawdownDays > 0) {
            notices.push('A fall that begins and ends between two reported closes does not show in filled-in prices, so read the max drawdown here as a floor.');
        }
    }

    const priceDay = data ? formatUtc(data.priceAsOf, 'full') : '';
    // Whose price the stack is valued at, and from when. The page is cached for
    // a day and served stale while it rebuilds, so "today's price" is a claim
    // it cannot keep.
    const priceSentence = !data
        ? ''
        : data.priceFrom.kind === 'quote'
            ? `That price was quoted by ${PRICE_PROVIDER_LABELS[data.priceFrom.provider].name} on ${fmtUtcMoment(data.priceAsOf)}.`
            : data.priceFrom.kind === 'latestTrade'
                ? `That price is the latest ${PRICE_PROVIDER_LABELS[data.priceFrom.provider].name} trade in the price history this page was built from, fetched on ${fmtUtcMoment(data.priceAsOf)}.`
                : `No live quote could be fetched when this page was built, so that price is the last row of the daily price history, dated ${priceDay} (UTC).`;
    const servedLabel = data ? PRICE_PROVIDER_LABELS[data.series.served] : null;
    const startsBeforeExchange = view.startTs < FIRST_EXCHANGE_CLOSE_TS;
    const firstExchangeDay = LONG_DATE.format(FIRST_EXCHANGE_CLOSE_TS);

    const breadcrumbJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
            { '@type': 'ListItem', position: 2, name: 'DCA Scenarios', item: `${BASE_URL}/dca` },
            { '@type': 'ListItem', position: 3, name: heading, item: pageUrl },
        ],
    };

    // ONE source for the visible FAQ and the FAQPage markup. These three answers
    // previously existed only as JSON-LD, on all 104 generated scenario pages —
    // structured data describing content no reader could see, which is what earns a
    // manual action. Rendering both from this array is what keeps them honest.
    const drawdownAnswer = stats?.maxDrawdownPercent != null
        ? ` ${drawdownStopsEarly ? `Up to ${view.endLong}, the plan's end date,` : 'Along the way'} the stack's value fell as much as ${fmtPct(stats.maxDrawdownPercent)} from an earlier peak${drawdownEstimated
            ? '. Some of the prices that figure was checked against were filled in between two reported closes, and a fall inside such a gap does not show.'
            : ', checked on every day of the plan at that day\'s price.'}${drawdownStopsEarly
            ? ` Falls after ${view.endLong} are not counted in that figure, while the value and the return above run to ${priceDay}.`
            : ''}`
        : '';
    const faqs: { q: string; a: string }[] = result && data
        ? [
            {
                q: `How much would $${amount} per ${freqNoun} in Bitcoin ${view.endLong ? `${windowText}` : `since ${view.startLong}`} be worth today?`,
                a: `Investing $${amount} every ${freqNoun} ${windowText} totals ${fmtUsd(result.totalInvested)} across ${fmtInt(purchaseCount)} purchases. At a bitcoin price of ${fmtUsd(data.price)} (${priceDay}, UTC) that stack is worth ${fmtUsd(result.currentValue)}, a return of ${fmtPct(result.roi, true)}. This page is rebuilt about once a day.`,
            },
            {
                q: `How much BTC would $${amount} per ${freqNoun} ${view.endLong ? windowText : `since ${view.startLong}`} accumulate?`,
                a: `About ${fmtBtc(result.btcAccumulated)} (${fmtSats(result.btcAccumulated)}), at an average cost of ${fmtUsd(result.averageCost)} per BTC.`,
            },
            {
                q: 'What is the annualized return of this DCA schedule?',
                a: stats?.xirrPercent != null
                    ? `The money-weighted annualized return (XIRR) is ${fmtPct(stats.xirrPercent, true)} per year.${drawdownAnswer}`
                    : `The total return of this schedule is ${fmtPct(result.roi, true)}. No annualized figure is available for it.${drawdownAnswer}`,
            },
        ]
        : [];

    const faqJsonLd = faqs.length > 0
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
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />
            {faqJsonLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
                />
            )}
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8 sm:space-y-10">

                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li><Link href="/" className={crumbLink}>Home</Link></li>
                        <li aria-hidden="true">/</li>
                        <li><Link href="/dca" className={crumbLink}>DCA Scenarios</Link></li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">{view.shortLabel}</li>
                    </ol>
                </nav>

                {/* Heading + lead */}
                <header className="space-y-3">
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white text-balance">
                        {heading}
                    </h1>
                    {view.curatedDescription && (
                        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                            {view.curatedDescription}
                        </p>
                    )}
                    {result && data && (
                        <>
                            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                                Buying <strong className="font-semibold text-slate-900 dark:text-white">${amount}</strong> of
                                Bitcoin every {freqNoun} {windowText} works out
                                to <strong className="font-semibold text-slate-900 dark:text-white">{fmtUsd(result.totalInvested)}</strong> put
                                in across {fmtInt(purchaseCount)} purchases. Those buys total <strong className="font-semibold text-slate-900 dark:text-white">{fmtBtc(result.btcAccumulated)}</strong>,
                                worth <strong className="font-semibold text-slate-900 dark:text-white">{fmtUsd(result.currentValue)}</strong> at
                                a bitcoin price of {fmtUsd(data.price)}, a return of <strong className={clsx('font-semibold', profitClass)}>{fmtPct(result.roi, true)}</strong>.
                            </p>
                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                {priceSentence}
                                {' '}This page is rebuilt about once a day, so the price can be a day or more old. The{' '}
                                <Link href={ctaHref} className="text-amber-700 dark:text-amber-400 hover:underline">calculator</Link>{' '}
                                runs the same plan on current prices.
                            </p>
                        </>
                    )}
                </header>

                {result && data && headline ? (
                    <>
                        {/* Shown only when the prices behind this page are not what it
                            normally runs on: another exchange's, an earlier copy, or
                            partly filled in. */}
                        {notices.length > 0 && (
                            <Card className="p-4 sm:p-5">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
                                    <div className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                        <h2 className="font-semibold text-slate-900 dark:text-white">About the prices on this page</h2>
                                        {notices.map((notice) => (
                                            <p key={notice}>{notice}</p>
                                        ))}
                                    </div>
                                </div>
                            </Card>
                        )}

                        {/* Stat cards */}
                        <section
                            className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
                            style={{ '--stat-fit': statFit.toFixed(2) } as CSSProperties}
                        >
                            <StatCard
                                label="Total invested"
                                value={headline.invested}
                                sub={`${fmtInt(purchaseCount)} purchases of $${amount}`}
                            />
                            <StatCard
                                label="Value"
                                value={headline.value}
                                sub={`At ${fmtUsd(data.price)} per BTC, ${priceDay}`}
                                celebrated
                            />
                            <StatCard
                                label="Profit"
                                value={headline.profit}
                                sub={`${fmtPct(result.roi, true)} ROI`}
                                valueClassName={profitClass}
                            />
                            <StatCard
                                label="BTC stacked"
                                value={headline.btc}
                                sub={fmtSats(result.btcAccumulated)}
                            />
                        </section>

                        {/* Secondary stats */}
                        <Card className="p-4 sm:p-5">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <div>
                                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Annualized (XIRR)</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                                        {stats?.xirrPercent != null ? fmtPct(stats.xirrPercent, true) : '—'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Max drawdown</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                                        {stats?.maxDrawdownPercent != null ? `−${fmtPct(stats.maxDrawdownPercent)}` : '—'}
                                        {drawdownEstimated && <Est />}
                                    </p>
                                    {drawdownStopsEarly && view.endTs !== undefined && (
                                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                            Up to {formatUtc(view.endTs, 'full')} only
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Purchases</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                                        {fmtInt(purchaseCount)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Best buy</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                                        {stats?.bestBuy
                                            ? `${fmtUsd(stats.bestBuy.price)} · ${formatUtc(stats.bestBuy.date, 'full')}`
                                            : '—'}
                                        {bestBuyEstimated && <Est />}
                                    </p>
                                </div>
                            </div>
                        </Card>

                        {/* Year-by-year table */}
                        <Card className="p-4 sm:p-6">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-4">
                                Year-by-year breakdown
                            </h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs sm:text-sm tabular-nums">
                                    <thead>
                                        <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                            <th className="py-2 pr-4 font-medium">Year</th>
                                            <th className="py-2 pr-4 font-medium text-right">Total invested</th>
                                            <th className="py-2 pr-4 font-medium text-right">Value at year end</th>
                                            <th className="py-2 font-medium text-right">ROI</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-700 dark:text-slate-300">
                                        {yearRows.map((row) => (
                                            <tr key={row.year} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                                                <td className="py-2 pr-4 font-medium text-slate-800 dark:text-slate-100">
                                                    {row.year}{row.isCurrentYear ? ' (YTD)' : ''}
                                                </td>
                                                <td className="py-2 pr-4 text-right">{fmtUsd(row.invested)}</td>
                                                <td className="py-2 pr-4 text-right">
                                                    {fmtUsd(row.value)}
                                                    {yearValueEstimated(row) && <Est />}
                                                </td>
                                                <td className={clsx(
                                                    'py-2 text-right font-medium',
                                                    row.roi >= 0
                                                        ? 'text-gain'
                                                        : 'text-loss',
                                                )}>
                                                    {fmtPct(row.roi, true)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                                Each row takes the bitcoin held at the end of that year and values it at the price for
                                December 31 (UTC). ROI is the gain on everything paid in up to then.
                                {yearRows.some((row) => row.isCurrentYear)
                                    ? ` The current year, marked YTD, is valued at ${fmtUsd(data.price)} per BTC, the same price as the figures above.`
                                    : ''}
                                {yearEndEstimated
                                    ? ' A value marked "est." used a filled-in price for December 31, not a close reported for that day.'
                                    : ''}
                            </p>
                        </Card>

                        {/* Methodology note */}
                        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                            <strong className="font-semibold text-slate-600 dark:text-slate-300">How this is calculated:</strong>{' '}
                            purchases are simulated on UTC calendar days.
                            {servedLabel && (
                                startsBeforeExchange
                                    ? ` Days before ${firstExchangeDay} are priced at blockchain.info's daily market price, an average across exchanges. From ${firstExchangeDay} each day is priced from ${servedLabel.name}: ${servedLabel.cadence}.`
                                    : ` Each day is priced from ${servedLabel.name}: ${servedLabel.cadence}.`
                            )}
                            {' '}The price history was fetched on {fmtUtcMoment(data.series.fetchedAt)}, and a row dated that
                            day is the latest trade at that moment, not a close. Amounts are in USD, and no exchange
                            fees are applied. ROI is the gain as a percentage of what you put in. XIRR is the
                            annualized return, meaning the yearly rate of growth, adjusted for money going in a bit at a time.
                            Max drawdown is the deepest fall the stack&apos;s value took from its own earlier peak, checked
                            on every day of the plan and not only on purchase days. One price a day cannot show a fall
                            that happens inside a single day.
                            {drawdownStopsEarly
                                ? ` On this page that check stops on ${view.endLong}. The value, ROI and XIRR use the ${priceDay} price, so a deeper fall after ${view.endLong} is not in the figure.`
                                : ''}
                            {' '}The full{' '}
                            <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline">methodology</Link>{' '}
                            covers the rest.
                        </p>
                    </>
                ) : (
                    <Card className="p-6 sm:p-8">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
                            <div className="space-y-2">
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                    Price data is temporarily unavailable
                                </h2>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                    We couldn&apos;t load Bitcoin price history for this scenario when the page was last
                                    built. The calculator fetches prices on demand, so the same schedule may load there.
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
                        This page assumes ${amount} every {freqNoun} and zero fees. Change any of it in the live
                        calculator: amount, cadence, dates, fees, all backtested against the same historical data.
                    </p>
                    <Link
                        href={ctaHref}
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                    >
                        Open the calculator
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </Card>

                {/* FAQ — same `faqs` array the FAQPage markup above is built from */}
                {faqs.length > 0 && (
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
                )}

                {/* Related scenarios */}
                <section className="space-y-3">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                        Related scenarios
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                        {[...related, ...relatedCurated].map((s) => (
                            <Link
                                key={s.slug}
                                href={`/dca/${s.slug}`}
                                /* py-3 + a 20px line is the 44px touch floor; py-2.5 came to 40. */
                                className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors tabular-nums"
                            >
                                {s.shortLabel}
                            </Link>
                        ))}
                    </div>
                    <p className="text-sm">
                        <Link href="/dca" className="inline-flex min-h-11 items-center gap-1.5 text-amber-700 dark:text-amber-400 hover:underline font-medium">
                            Browse all DCA scenarios
                            <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </p>
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
