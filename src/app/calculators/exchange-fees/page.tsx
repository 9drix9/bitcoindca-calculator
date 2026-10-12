import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Receipt } from 'lucide-react';
import clsx from 'clsx';
import { Card } from '@/components/ui/Card';
import { ExchangeFeeComparison } from '@/components/ExchangeFeeComparison';
import { getBitcoinPriceHistoryWithMeta, getBitcoinSpot } from '@/app/actions';
import { DAILY_PRICE_REVALIDATE } from '@/utils/revalidate';
import { expireRenderSoon } from '@/utils/isr';
import { calculateDca, priceSeriesCovers } from '@/utils/dca';
import { DAY_MS, EARLIEST_PRICE_TS, formatUtc, utcDayStart, utcYearsBefore } from '@/utils/dates';
import {
    DEFAULT_PRICE_PROVIDER,
    PRICE_PROVIDER_LABELS,
    priceFallbackNotice,
    type PriceProvider,
} from '@/data/priceSources';
import {
    EXCHANGE_FEES,
    feeExamplePair,
    feesLastVerified,
    hasPublishedFee,
    plainRateLabel,
    resolveExchangeFees,
} from '@/data/exchangeFees';
import { FLAT_EXAMPLE_USD, feeLevels, type FeeLevel } from './feeLevels';

// Recomputed once a day against fresh prices.
export const revalidate = 86400;

const BASE_URL = 'https://btcdollarcostaverage.com';
const PAGE_PATH = '/calculators/exchange-fees';

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

/** A round dollar amount in prose: "$50", "$2,400". */
const fmtWholeUsd = (value: number): string =>
    value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const fmtInt = (value: number): string => Math.round(value).toLocaleString('en-US');

function fmtBtc(value: number): string {
    const decimals = value >= 1 ? 4 : 8;
    return `${value.toFixed(decimals).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')} BTC`;
}

/** A computed percentage without float noise: 2, 0.46, 1.2. */
const fmtNum = (value: number): string => String(Number(value.toFixed(2)));

/** "Oct 12, 2026 at 04:50 UTC". Every date on the site is a UTC date. */
function fmtUtcMoment(ts: number): string {
    return `${formatUtc(ts, 'full')} at ${new Date(ts).toISOString().slice(11, 16)} UTC`;
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const countWord = (n: number): string => NUMBER_WORDS[n] ?? String(n);

const listNames = (names: string[]): string =>
    names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

// ── Data ───────────────────────────────────────────────────────────────────────

const SAMPLE_AMOUNT = 50;
const SAMPLE_YEARS = 5;

// Used only when the registry's example rows cannot be compared (see
// feeExamplePair): the worked arithmetic then runs on a plain round rate.
const FALLBACK_EXAMPLE_PERCENT = 1;

interface FeeRow extends FeeLevel {
    label: string;
    feesPaid: number;
    /** Fees as a share of the money put in, %. Equals `percent` when there is no flat part. */
    feePercentOfBuy: number;
    btcAccumulated: number;
    currentValue: number;
    /** Value shortfall against the same schedule paying no fee at all. */
    valueVsZero: number;
    satsVsZero: number;
}

interface PageData {
    /** USD per BTC that every bitcoin amount on the page is valued at. */
    price: number;
    /**
     * When that price is from: the instant an exchange quoted it, or, when no
     * quote could be had, the UTC day of the newest row in the daily series.
     * Printed wherever the price is: this page is rebuilt about once a day,
     * so "the latest price" on its own says nothing about how old it is.
     */
    priceAsOf: number;
    /** The exchange that quoted `price`; null when it is the newest row of the daily series. */
    quotedBy: PriceProvider | null;
    /**
     * Whose daily series priced the schedule, as the price action reported it.
     * `served` differs from `requested` when the action fell back to the other
     * exchange; `stale` means the exchange could not be reached just then and
     * the action answered with a copy it had fetched earlier, at `fetchedAt`.
     */
    series: { requested: PriceProvider; served: PriceProvider; stale: boolean; fetchedAt: number };
    startDateIso: string;
    endDateIso: string;
    purchaseCount: number;
    totalInvested: number;
    rows: FeeRow[];
}

/**
 * Whether a failed load should throw instead of rendering the fallback card.
 *
 * `next build` must never fail on a provider outage, so there the page
 * publishes its "temporarily unavailable" card, and expireRenderSoon() has
 * that card rendered again within minutes instead of a day. Once deployed the
 * opposite is right: the page is regenerated in the background once a day, and
 * a render that completes replaces the cached page, fallback card included. A
 * render that throws leaves the last good page in place and is retried on the
 * next request. Development keeps the card so it can be seen.
 *
 * `next build` sets NEXT_PHASE to PHASE_PRODUCTION_BUILD (next/constants)
 * before it starts the workers that prerender pages, and they inherit it. The
 * value is written out here so this page does not pull that config-time
 * module into its server bundle.
 */
const BUILD_PHASE = 'phase-production-build';
const keepLastGoodPage = (): boolean =>
    process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== BUILD_PHASE;

async function loadData(now: number): Promise<PageData | null> {
    try {
        const nowTs = utcDayStart(now);
        const startTs = Math.max(EARLIEST_PRICE_TS, utcYearsBefore(nowTs, SAMPLE_YEARS));

        // The site's default series, asked for by name: the calculator this
        // page links to opens on the same constant, so the two cannot drift
        // apart. The action can still answer with the other exchange's series
        // when this one is unreachable, and it says so; the copy describes
        // the series it reports having served (see `series`).
        const [history, spot] = await Promise.all([
            getBitcoinPriceHistoryWithMeta(startTs, nowTs + DAY_MS, DEFAULT_PRICE_PROVIDER, DAILY_PRICE_REVALIDATE),
            getBitcoinSpot(DEFAULT_PRICE_PROVIDER, DAILY_PRICE_REVALIDATE),
        ]);
        // The engine carries the last bar forward without limit, so a short or
        // stale series would still produce a full table of wrong numbers.
        if (!priceSeriesCovers(history.data, startTs, nowTs)) throw new Error('price history does not cover the schedule');

        // With no quote from either exchange the stack is valued at the newest
        // daily row, and the price is dated as that row, not as "now".
        const lastRow = history.data[history.data.length - 1];
        const price = spot ? spot.price : lastRow[1];
        const priceAsOf = spot ? spot.asOf : lastRow[0];
        if (!(price > 0)) throw new Error('no usable price');

        const levels = feeLevels(now);
        const results = levels.map((level) =>
            calculateDca(
                {
                    amount: SAMPLE_AMOUNT,
                    frequency: 'weekly',
                    startDate: new Date(startTs),
                    endDate: new Date(nowTs),
                    feePercentage: level.percent,
                    flatFee: level.flatUsd,
                    priceMode: 'api',
                    manualPrice: 0,
                },
                history.data,
                price,
                priceAsOf,
            ),
        );

        const zero = results[levels.findIndex((l) => l.percent === 0 && l.flatUsd === 0)];
        if (!zero || zero.totalInvested <= 0 || !Number.isFinite(zero.currentValue)) {
            throw new Error('fee comparison produced no purchases');
        }

        const rows: FeeRow[] = results.map((result, i) => ({
            ...levels[i],
            label: plainRateLabel(levels[i].percent, levels[i].flatUsd),
            feesPaid: result.stats?.feesPaid ?? 0,
            feePercentOfBuy: result.stats?.feePercentOfBuy ?? levels[i].percent,
            btcAccumulated: result.btcAccumulated,
            currentValue: result.currentValue,
            valueVsZero: zero.currentValue - result.currentValue,
            satsVsZero: (zero.btcAccumulated - result.btcAccumulated) * 1e8,
        }));

        return {
            price,
            priceAsOf,
            quotedBy: spot ? spot.provider : null,
            series: {
                requested: history.requestedProvider,
                served: history.servedProvider,
                stale: history.stale,
                fetchedAt: history.fetchedAt,
            },
            startDateIso: formatUtc(startTs, 'isoDay'),
            endDateIso: formatUtc(nowTs, 'isoDay'),
            purchaseCount: zero.breakdown.length,
            totalInvested: zero.totalInvested,
            rows,
        };
    } catch (error) {
        console.error('[calculators/exchange-fees] data load failed:', error);
        if (keepLastGoodPage()) throw error;
        // The card is about to be rendered (`next build`, or development). The
        // price action shortens a render's life when it fails, but not every
        // way into this branch is a failed action: a series that came back
        // short, a price of zero and a schedule with no purchases all raise
        // their error here, after the action succeeded. Without this the card
        // baked into a deploy would be served for the full 24 hours.
        await expireRenderSoon();
        return null;
    }
}

/**
 * One reading of the clock for the whole render: the schedule's end day, the
 * fee rows in force, and the instant the client component is told to resolve
 * against all come from it.
 */
async function loadPage(): Promise<{ asOfTs: number; data: PageData | null }> {
    const asOfTs = Date.now();
    return { asOfTs, data: await loadData(asOfTs) };
}

// ── Metadata ───────────────────────────────────────────────────────────────────

// Any rate named in the metadata comes from the same registry rows as the page
// body, so the snippet cannot advertise a rate the table does not show.
const META_PAIR = feeExamplePair();
const META_RATES = META_PAIR ? `a ${META_PAIR.lower.percent}% or a ${META_PAIR.higher.percent}% fee` : 'a fee';
const SOCIAL_DESCRIPTION = META_PAIR
    ? `What a ${META_PAIR.lower.percent}% vs ${META_PAIR.higher.percent}% fee costs across a five-year weekly DCA schedule, plus the spread that never shows up as a fee.`
    : 'What a fee costs across a five-year weekly DCA schedule, plus the spread that never shows up as a fee.';

export const metadata: Metadata = {
    title: 'Bitcoin Exchange Fee Calculator — What DCA Fees Really Cost',
    description:
        `What Bitcoin exchange fees cost a five-year weekly DCA plan on historical prices: the bitcoin ${META_RATES} gives up, fee versus spread, and what ${countWord(EXCHANGE_FEES.length)} platforms publish about recurring-buy costs.`,
    keywords: [
        'bitcoin exchange fees',
        'bitcoin exchange fee calculator',
        'cheapest way to buy bitcoin',
        'coinbase fees vs kraken fees',
        'dca fees bitcoin',
        'bitcoin spread vs fee',
    ],
    alternates: { canonical: PAGE_PATH },
    openGraph: {
        images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
        title: 'Bitcoin Exchange Fee Calculator — What DCA Fees Really Cost',
        description: SOCIAL_DESCRIPTION,
        url: PAGE_PATH,
        type: 'article',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        images: ['/opengraph-image'],
        card: 'summary_large_image',
        title: 'Bitcoin Exchange Fee Calculator — What DCA Fees Really Cost',
        description: SOCIAL_DESCRIPTION,
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

const CHECKLIST: { title: string; body: string }[] = [
    {
        title: 'Trading fee vs. instant-buy fee',
        body: 'Many exchanges run two products on one platform. One is a spot order book, where you trade against other users. It charges a maker fee if your order sits on the book and a taker fee if it fills straight away, both quoted in basis points. A basis point is one hundredth of a percent. The other product is a one-click "buy" or "convert" button that usually charges more. The low number on a fee page is usually the order book, and it applies only to orders placed there.',
    },
    {
        title: 'The spread on the quoted price',
        body: 'Compare the price you are quoted against the mid price on a large spot market at the same moment. The gap is a cost whether or not anyone calls it a fee. A platform that charges no fee on an order usually earns on the spread instead, and some show that spread only in the order preview.',
    },
    {
        title: 'Deposit and funding costs',
        body: 'Bank transfers (ACH, SEPA, Faster Payments) are commonly free or close to it. Debit and credit card funding usually costs more, and that charge comes on top of the trading fee. If the way you move money in costs more than the trade itself, the trading fee is the smaller of the two numbers.',
    },
    {
        title: 'Withdrawal fee for moving to self-custody',
        body: 'Where an on-chain withdrawal is charged, it is normally a flat amount in bitcoin rather than a percentage. That weighs on small frequent withdrawals and hardly matters on large ones. Some platforms charge nothing, some pass the network fee through at cost, and others charge a fixed amount above it. Check whether the platform lets you withdraw to your own address at all.',
    },
    {
        title: 'Recurring-buy terms specifically',
        body: 'Recurring buys sometimes get a different fee schedule than manual ones, in either direction. With DCA the recurring buy is the only order you ever place. So that is the number that matters to you.',
    },
    {
        title: 'Currency conversion',
        body: 'If you fund in one currency and the pair is quoted in another, there is an FX conversion in the middle with its own margin. Buying a BTC pair quoted in your own currency avoids paying two spreads.',
    },
];

export default async function ExchangeFeesPage() {
    const { asOfTs, data } = await loadPage();

    const fees = resolveExchangeFees(asOfTs);
    const pair = feeExamplePair(asOfTs);
    const checkedOn = formatUtc(feesLastVerified(), 'full');
    const unpublishedNames = fees.filter((f) => !hasPublishedFee(f)).map((f) => f.name);
    const anySpreadOnly = fees.some((f) => f.includes === 'spread');
    const anyPublishedFlat = fees.some((f) => hasPublishedFee(f) && f.flatUsd > 0);

    // The worked sentences are built on two registry rows and worded as rates.
    // Both rates are rows of the table by construction (see feeLevels).
    const highRow = pair ? data?.rows.find((r) => r.percent === pair.higher.percent && r.flatUsd === 0) : undefined;
    const lowRow = pair ? data?.rows.find((r) => r.percent === pair.lower.percent && r.flatUsd === 0) : undefined;
    const flatRow = data?.rows.find((r) => r.example);

    const exampleRate = pair ? pair.higher.percent : FALLBACK_EXAMPLE_PERCENT;
    const exampleBuys = data ? data.purchaseCount : SAMPLE_YEARS * 52;
    const levelCount = data ? countWord(data.rows.length) : 'several';
    // Which series answered is read off the result, not assumed: the price action
    // falls back from one exchange to the other when the first cannot be reached.
    // Kraken's public history is weekly, so only its series is straight-line fills.
    const seriesWords = data?.series.served === 'kraken'
        ? "Kraken's weekly closing prices, with the days in between filled in along a straight line"
        : "Coinbase's daily closing prices";
    // "the Coinbase price on Oct 12, 2026 at 04:50 UTC", or the newest daily row
    // when neither exchange gave a quote. The page is cached for a day, so the
    // copy says whose price and from when, and never "live" or "today".
    const priceWords = data
        ? data.quotedBy
            ? `the ${PRICE_PROVIDER_LABELS[data.quotedBy].name} price on ${fmtUtcMoment(data.priceAsOf)}`
            : `the newest price in the daily series, dated ${formatUtc(data.priceAsOf, 'full')} (UTC)`
        : '';
    // Said only when the series is not the usual one. Both cases already
    // shorten this render's life (the price action calls expireRenderSoon), so
    // the note goes away within minutes of the exchange coming back.
    const seriesNotes: string[] = [];
    if (data) {
        const fallbackNotice = priceFallbackNotice(data.series.requested, data.series.served);
        if (fallbackNotice) seriesNotes.push(fallbackNotice);
        if (data.series.stale) {
            seriesNotes.push(
                `${PRICE_PROVIDER_LABELS[data.series.served].name} could not be reached when this page was last rebuilt, so the daily prices are a copy fetched on ${fmtUtcMoment(data.series.fetchedAt)}.`,
            );
        }
    }
    const largerBuy = SAMPLE_AMOUNT * 4;

    const faqs: { question: string; answer: string }[] = [
        {
            question: 'How much do Bitcoin exchange fees actually cost over a DCA plan?',
            answer:
                data && pair && highRow && lowRow
                    ? `Take a schedule of ${fmtWholeUsd(SAMPLE_AMOUNT)} a week for ${SAMPLE_YEARS} years, run on historical prices: ${data.purchaseCount} purchases and ${fmtUsd(data.totalInvested)} put in. A ${pair.higher.percent}% fee takes ${fmtUsd(highRow.feesPaid)} out in fees and leaves you ${fmtInt(highRow.satsVsZero)} sats short of the same schedule with no fee. A sat is one hundred-millionth of a bitcoin, and that shortfall was worth ${fmtUsd(highRow.valueVsZero)} at a bitcoin price of ${fmtUsd(data.price)}, ${priceWords}. A ${pair.lower.percent}% fee takes ${fmtUsd(lowRow.feesPaid)}.`
                    : 'A percentage fee removes that percentage of bitcoin from every single purchase. After hundreds of buys you own that same percentage less bitcoin than you otherwise would, so the shortfall scales directly with the rate.',
        },
        {
            question: 'What is the difference between a fee and a spread?',
            answer:
                `A fee is an explicit charge that appears on your receipt: ${exampleRate}% of the order, itemized. A spread is the gap between the price the platform quotes you and the mid-market price at that moment. It is built into the price instead of being listed as a fee. Some platforms show it in the order preview and some do not publish it at all, and it can exceed the fee it replaces. "Zero fee" often means the cost has moved into the spread, though not always: a platform can state that one kind of order carries neither. The way to measure a spread is to compare the quote you were given against a large spot market at the same moment.`,
        },
        {
            question: 'Does a percentage fee compound?',
            answer:
                `Not against itself. The fee is a percentage of each buy, so after ${exampleBuys} buys at ${exampleRate}% you hold about ${exampleRate}% less bitcoin. It is not ${exampleRate}% compounded ${exampleBuys} times. What compounds is the value of the bitcoin you did not get. That missing bitcoin rides the same price as the rest of your stack, so the shortfall grows in fiat terms exactly as fast as your portfolio does. A fee is best understood as permanently owning a slightly smaller slice, not as a one-off cost.`,
        },
        {
            question: 'Is the cheapest exchange always the right choice?',
            answer:
                'No, and this page does not recommend one. Fees are one input among several. Can you withdraw to your own wallet? How is the platform regulated in your jurisdiction? What is its custody and security record, and does it publish reserve attestations? How often did it go down during volatile periods, and does it support your bank? A platform with a lower fee that will not let you withdraw to your own wallet is not the same product as one with a higher fee that will.',
        },
        {
            question: 'Does buying less often save on fees?',
            answer:
                `Not with a percentage fee, which costs the same in total however the money is split: twelve monthly buys of $200 and fifty-two weekly buys of about $46 both put in $2,400 and pay the same share of it. A flat fee per order is different because it is charged once per buy. At a flat ${fmtWholeUsd(FLAT_EXAMPLE_USD)}, fifty-two weekly buys pay ${fmtWholeUsd(52 * FLAT_EXAMPLE_USD)} a year and twelve monthly buys pay ${fmtWholeUsd(12 * FLAT_EXAMPLE_USD)}. The ${fmtWholeUsd(FLAT_EXAMPLE_USD)} is an example, not any platform's price.`,
        },
        {
            question: 'Are the rates on this page current?',
            answer:
                `Each figure in the platform list was read from that platform's own pricing page and last checked on ${checkedOn}. Platforms reprice without much notice${unpublishedNames.length > 0 ? `, and ${listNames(unpublishedNames)} ${unpublishedNames.length === 1 ? 'publishes' : 'publish'} no fixed rate at all, so the list shows no total there` : ''}. The figures are a starting point and the platform's own page is the authority. Some fees also depend on how much you trade in a month or on how you pay, so a headline rate may not be the one you pay.`,
        },
    ];

    const breadcrumbJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
            { '@type': 'ListItem', position: 2, name: 'Calculators', item: `${BASE_URL}/calculators` },
            { '@type': 'ListItem', position: 3, name: 'Exchange Fees', item: `${BASE_URL}${PAGE_PATH}` },
        ],
    };

    const faqJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((f) => ({
            '@type': 'Question',
            name: f.question,
            acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
    };

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8 sm:space-y-12">

                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li><Link href="/" className={crumbLink}>Home</Link></li>
                        <li aria-hidden="true">/</li>
                        <li><Link href="/calculators" className={crumbLink}>Calculators</Link></li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Exchange fees</li>
                    </ol>
                </nav>

                {/* Header */}
                <header className="space-y-4">
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white text-balance">
                        What Bitcoin exchange fees really cost a DCA plan
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                        {data && pair && highRow ? (
                            <>
                                A single {pair.higher.percent}% fee is easy to ignore. Paid {data.purchaseCount} times it is not. The table
                                below runs one schedule at {levelCount} fee levels: {fmtWholeUsd(SAMPLE_AMOUNT)} a week since{' '}
                                {formatUtc(data.startDateIso, 'full')}, {fmtUsd(data.totalInvested)} put in, priced on {seriesWords}.
                                At {pair.higher.percent}% you end up {fmtInt(highRow.satsVsZero)} sats short of the zero-fee version,
                                worth <strong className="font-semibold text-slate-900 dark:text-white">{fmtUsd(highRow.valueVsZero)}</strong> at
                                a bitcoin price of {fmtUsd(data.price)}. A sat is one hundred-millionth of a bitcoin.
                            </>
                        ) : (
                            <>
                                A small percentage fee is easy to ignore on one buy. Paid a few hundred times it is not. This page
                                runs one five-year weekly DCA schedule at several fee levels. It also explains the difference
                                between an explicit fee and a spread, and lists what to check before committing to an exchange.
                            </>
                        )}
                    </p>
                    {/* The as-of line. The page is cached for a day and served
                        stale while it rebuilds, so it says whose price the
                        bitcoin is valued at and from when. */}
                    {data && (
                        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                            The schedule runs through {formatUtc(data.endDateIso, 'full')} (UTC). Bitcoin is valued
                            at {fmtUsd(data.price)}, {priceWords}. This page is rebuilt about once a day, so that price can
                            be a day or more old. The{' '}
                            <Link href="/" className="text-amber-700 dark:text-amber-400 hover:underline">calculator on the home page</Link>{' '}
                            pulls a fresh price.
                        </p>
                    )}
                </header>

                {/* Fee impact table */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        The same schedule at {levelCount} fee levels
                    </h2>
                    {data ? (
                        <>
                            <Card className="p-4 sm:p-6">
                                {/* Sats given up sits third so a phone shows it without
                                    scrolling: it is the column the text below reads from.
                                    The 500px floor is what the five columns need at
                                    phone text size and no more, so that column is whole
                                    on a 360px screen. The two columns after it scroll
                                    sideways inside the card, and the fee column stays
                                    put so every figure keeps its row label. */}
                                <div className="overflow-x-auto -mx-4 sm:mx-0">
                                    <table className="w-full min-w-[500px] text-xs sm:text-sm tabular-nums">
                                        <thead>
                                            <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                                <th scope="col" className={clsx(stickyLabel, 'px-3 sm:px-4 py-2 font-medium whitespace-nowrap')}>Fee per buy</th>
                                                <th scope="col" className="px-3 sm:px-4 py-2 font-medium text-right whitespace-nowrap">Fees paid</th>
                                                <th scope="col" className="px-3 sm:px-4 py-2 font-medium text-right whitespace-nowrap">Sats given up</th>
                                                <th scope="col" className="px-3 sm:px-4 py-2 font-medium text-right whitespace-nowrap">BTC ended with</th>
                                                <th scope="col" className="px-3 sm:px-4 py-2 font-medium text-right whitespace-nowrap">Value</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-slate-700 dark:text-slate-300">
                                            {data.rows.map((row) => {
                                                const isZero = row.percent === 0 && row.flatUsd === 0;
                                                return (
                                                    <tr key={`${row.label}${row.example ? ' example' : ''}`} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                                                        <th scope="row" className={clsx(
                                                            stickyLabel,
                                                            'px-3 sm:px-4 py-2 align-top text-left font-medium whitespace-nowrap',
                                                            isZero
                                                                ? 'text-emerald-700 dark:text-emerald-400'
                                                                : 'text-slate-800 dark:text-slate-100',
                                                        )}>
                                                            {row.label}{row.example ? ' (example)' : ''}
                                                            {row.flatUsd > 0 && (
                                                                <span className="block text-2xs font-normal text-slate-500 dark:text-slate-400">
                                                                    {fmtNum(row.feePercentOfBuy)}% of each buy
                                                                </span>
                                                            )}
                                                        </th>
                                                        <td className="px-3 sm:px-4 py-2 align-top text-right whitespace-nowrap">{fmtUsd(row.feesPaid)}</td>
                                                        <td className={clsx(
                                                            'px-3 sm:px-4 py-2 align-top text-right whitespace-nowrap',
                                                            isZero ? 'text-slate-500 dark:text-slate-400' : 'text-loss',
                                                        )}>
                                                            {isZero ? '—' : (
                                                                <>
                                                                    {fmtInt(row.satsVsZero)}{' '}
                                                                    <span className="block sm:inline">({fmtUsd(row.valueVsZero)})</span>
                                                                </>
                                                            )}
                                                        </td>
                                                        <td className="px-3 sm:px-4 py-2 align-top text-right whitespace-nowrap">{fmtBtc(row.btcAccumulated)}</td>
                                                        <td className="px-3 sm:px-4 py-2 align-top text-right whitespace-nowrap">{fmtUsd(row.currentValue)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                    {fmtWholeUsd(SAMPLE_AMOUNT)} bought every week from {formatUtc(data.startDateIso, 'full')} to{' '}
                                    {formatUtc(data.endDateIso, 'full')} (UTC), priced on {seriesWords} (
                                    <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline">methodology</Link>
                                    ), and valued at {fmtUsd(data.price)}, {priceWords}. The
                                    fee is taken off each purchase before conversion, which is how exchanges charge it. Every
                                    row puts in the identical {fmtUsd(data.totalInvested)}. Only the bitcoin that reaches your
                                    account differs. A rate here is whatever each buy loses, whether a platform calls it a fee or
                                    builds it into the price as a spread.
                                </p>
                                {seriesNotes.length > 0 && (
                                    <p role="note" className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                        {seriesNotes.join(' ')}
                                    </p>
                                )}
                            </Card>

                            {pair && highRow && lowRow && (
                                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                                    Read the sats column as the real price of the fee. Paying {pair.higher.percent}% on every buy instead
                                    of {pair.lower.percent}% across this window cost{' '}
                                    <strong className="font-semibold text-slate-900 dark:text-white">
                                        {fmtUsd(highRow.valueVsZero - lowRow.valueVsZero)}
                                    </strong>{' '}
                                    of bitcoin at that price. The rate is the only difference between those two rows.
                                </p>
                            )}

                            {flatRow && (
                                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                                    The last row is an example, not any platform&apos;s price. A fixed {fmtWholeUsd(FLAT_EXAMPLE_USD)} per
                                    order is {fmtNum(flatRow.feePercentOfBuy)}% of a {fmtWholeUsd(SAMPLE_AMOUNT)} buy, and the
                                    same {fmtWholeUsd(FLAT_EXAMPLE_USD)} would be {fmtNum((FLAT_EXAMPLE_USD / largerBuy) * 100)}% of
                                    a {fmtWholeUsd(largerBuy)} one, so a flat charge falls hardest on small, frequent buys. Over this
                                    schedule it took {fmtUsd(flatRow.feesPaid)} and left {fmtInt(flatRow.satsVsZero)} sats
                                    fewer than paying nothing.
                                    {!anyPublishedFlat && ' None of the figures in the platform list below includes a flat per-order charge.'}
                                </p>
                            )}
                        </>
                    ) : (
                        <Card className="p-6 sm:p-8">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                                <div className="space-y-2">
                                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                                        Price data is temporarily unavailable
                                    </h3>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                        We could not load historical prices to run the fee comparison. The{' '}
                                        <Link href="/" className="text-amber-700 dark:text-amber-400 hover:underline">main calculator</Link>{' '}
                                        has a fee input, but it reads the same two exchanges, so it may be affected as well.
                                        Try again in a few minutes.
                                    </p>
                                </div>
                            </div>
                        </Card>
                    )}
                </section>

                {/* Fee vs spread */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        A fee and a spread are not the same thing
                    </h2>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">An explicit fee</strong> is a line item.
                            You send {fmtWholeUsd(SAMPLE_AMOUNT)}, the platform takes {exampleRate}%, and{' '}
                            {fmtUsd(SAMPLE_AMOUNT * (1 - exampleRate / 100))} buys bitcoin at the market price. It shows up
                            on your receipt and in your tax records.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">A spread</strong> is the difference between
                            the price the platform quotes you and the price the market is actually trading at. If the mid
                            price is $100,000 and the app offers to sell you bitcoin at $100,900, you paid 0.9%. It is not
                            listed as a fee. Your receipt can say {fmtWholeUsd(SAMPLE_AMOUNT)} in, {fmtWholeUsd(SAMPLE_AMOUNT)} of
                            bitcoin out, zero fees, and be technically accurate.
                        </p>
                        <p>
                            This is why &ldquo;0% fees&rdquo; is the start of a question, not the answer to one. A platform
                            that quotes you a price and takes the other side of your trade needs revenue, and it is often in
                            the spread instead of the fee.
                            {anySpreadOnly && ' Some platforms in the list below charge no fee on recurring buys and state a spread instead.'}{' '}
                            A platform can also state that one kind of order carries neither a fee nor a spread while it
                            charges both on others. The fee number alone cannot tell you which situation you are in.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">How to measure it yourself:</strong> at the
                            moment you buy, note the price you were quoted, then check the BTC/USD price on a large spot
                            exchange. The percentage gap is your spread. Do it two or three times, at different times of day.
                            That gives you a better estimate of your true all-in cost than any comparison table can, including
                            this one.
                        </p>
                    </div>
                </section>

                {/* Why it hurts over hundreds of buys */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        Why a small percentage matters across hundreds of buys
                    </h2>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            Be precise about the mechanism, because the loose version of this claim is wrong. A percentage
                            fee does <em>not</em> compound against itself. Paying {exampleRate}% on {exampleBuys} separate
                            purchases leaves you with about {exampleRate}% less bitcoin, not {exampleRate}% compounded{' '}
                            {exampleBuys} times. A percentage fee cannot take a third of your stack unless the percentage
                            itself is a third. A flat fee per order is different: on a small enough buy it can.
                        </p>
                        <p>
                            What compounds is the <em>value</em> of the bitcoin you never received. That missing slice tracks
                            the same price as everything else you own. If your stack goes up tenfold, so does the shortfall.
                            Do not think of a fee as a one-time cost you absorb and move past. It permanently reduces the
                            fraction of the supply you hold, and the market prices that reduction forever after.
                        </p>
                        <p>
                            There is a second, blunter way to frame it. A {exampleRate}% fee takes {fmtUsd(exampleRate)} of
                            every $100 you put in. Over ten years of buying, that adds up to about{' '}
                            {fmtNum(120 * exampleRate / 100)} months&apos; worth of contributions that bought no bitcoin.
                        </p>
                        <p>
                            Fees are one of the very few inputs to a DCA plan that the buyer sets. The price, the falls along
                            the way and the timing are not yours to choose. The rate you pay to convert is, and finding it
                            out costs an afternoon of reading fee schedules.
                        </p>
                    </div>
                </section>

                {/* Live comparison widget */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Receipt className="w-6 h-6 sm:w-7 sm:h-7 text-amber-700 dark:text-amber-400 shrink-0" />
                        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                            What each platform charges on a recurring buy
                        </h2>
                    </div>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        Applied to the same {data ? fmtUsd(data.totalInvested) : 'total'} across{' '}
                        {data ? data.purchaseCount : 'several hundred'} purchases. This is a list of what each platform
                        itself states for a recurring buy, not a ranking or a recommendation. The rows are not
                        like-for-like: some figures are a fee and some are a spread, and the line under each name says
                        which.{unpublishedNames.length > 0 && ` ${listNames(unpublishedNames)} ${unpublishedNames.length === 1 ? 'publishes' : 'publish'} no fixed figure, so no total is shown there.`}{' '}
                        Where a platform takes a spread but does not publish a number for it, the spread is left out and
                        that row understates the cost.
                    </p>
                    {data ? (
                        <ExchangeFeeComparison
                            totalInvested={data.totalInvested}
                            purchaseCount={data.purchaseCount}
                            asOf={asOfTs}
                            notesOpen
                        />
                    ) : (
                        <Card className="p-6">
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                The per-exchange comparison needs a calculated schedule to price against. It appears on every
                                result in the{' '}
                                <Link href="/" className="text-amber-700 dark:text-amber-400 hover:underline">main calculator</Link>.
                            </p>
                        </Card>
                    )}
                </section>

                {/* Checklist */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        What to check on any exchange
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        The headline trading fee is often the smallest of the numbers below. All {countWord(CHECKLIST.length)} are
                        part of what a buy costs.
                    </p>
                    <div className="space-y-3">
                        {CHECKLIST.map((item, i) => (
                            <Card key={item.title} className="p-4 sm:p-5">
                                <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white mb-1.5">
                                    <span className="text-amber-700 dark:text-amber-400 tabular-nums mr-2">{i + 1}.</span>
                                    {item.title}
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.body}</p>
                            </Card>
                        ))}
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        This site takes no position on which exchange you should use and earns nothing from any of them.
                        Exchange names appear here only because their own pricing pages are where the calculator&apos;s fee
                        presets are read from.
                    </p>
                </section>

                {/* FAQ */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        Frequently asked questions
                    </h2>
                    <div className="space-y-3">
                        {faqs.map((faq) => (
                            <Card key={faq.question} className="p-4 sm:p-5">
                                <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white mb-1.5">
                                    {faq.question}
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{faq.answer}</p>
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
                        Put your own amount, cadence, dates and fee into the calculator. It runs the whole schedule on
                        historical prices and itemizes what the fee cost.
                    </p>
                    <Link
                        href={`/?amount=${SAMPLE_AMOUNT}&frequency=weekly&fee=${exampleRate}`}
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                    >
                        Open the calculator
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </Card>

                {/* Related */}
                <section className="space-y-3">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                        Related
                    </h2>
                    <ul className="grid sm:grid-cols-2 gap-2 text-sm">
                        <li>
                            <Link href="/calculators" className="block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-3 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                All calculators
                            </Link>
                        </li>
                        <li>
                            <Link href="/calculators/stack-sats-goal" className="block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-3 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                How long to stack 1 bitcoin
                            </Link>
                        </li>
                        <li>
                            <Link href="/calculators/bitcoin-cost-basis" className="block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-3 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                Bitcoin cost basis calculator
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
                    Not financial advice, and not a recommendation of any exchange. Fee rates change, so verify them on the
                    provider&apos;s own fee page before you act. The figures above are a historical simulation for
                    education. Past performance does not guarantee future results, bitcoin is volatile, and you can lose money.
                </p>
            </div>
        </>
    );
}
