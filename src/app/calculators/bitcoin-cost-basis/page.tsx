import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Lock, Layers } from 'lucide-react';
import { Card, StatRow } from '@/components/ui/Card';
import { getBitcoinPriceHistoryWithMeta, getBitcoinSpot } from '@/app/actions';
import { DAILY_PRICE_REVALIDATE } from '@/utils/revalidate';
import { calculateDca, priceSeriesCovers, withPriceKinds } from '@/utils/dca';
import { DAY_MS, EARLIEST_PRICE_DATE, EARLIEST_PRICE_TS, formatUtc, utcDayStart, utcYearsBefore } from '@/utils/dates';
import {
    DEFAULT_PRICE_PROVIDER, FIRST_EXCHANGE_CLOSE_DATE, PRICE_PROVIDER_LABELS, type PriceProvider,
} from '@/data/priceSources';
import { disposalCostByRule, type Lot } from '@/app/calculators/bitcoin-cost-basis/lots';
import { packDailyPrices, type PackedDailyPrices } from '@/app/calculators/bitcoin-cost-basis/priceSeed';
import { SeededCostBasisTracker } from '@/app/calculators/bitcoin-cost-basis/SeededCostBasisTracker';

// Recomputed once a day against fresh prices.
export const revalidate = 86400;

const BASE_URL = 'https://btcdollarcostaverage.com';
const PAGE_PATH = '/calculators/bitcoin-cost-basis';

export const metadata: Metadata = {
    title: 'Bitcoin Cost Basis Calculator — Average Price Per BTC',
    description:
        'Work out your average cost basis per bitcoin across a DCA plan, and see how FIFO, HIFO and specific ID change the gain on a sale. Entries stay in your browser.',
    keywords: [
        'bitcoin cost basis calculator',
        'average cost basis bitcoin',
        'bitcoin tax lots',
        'fifo vs hifo bitcoin',
        'crypto cost basis method',
        'btc average buy price',
    ],
    alternates: { canonical: PAGE_PATH },
    openGraph: {
        images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
        title: 'Bitcoin Cost Basis Calculator — Average Price Per BTC',
        description:
            'Average cost basis across a DCA schedule, why weekly buying leaves hundreds of purchases to account for, and how FIFO, HIFO and spec-ID differ.',
        url: PAGE_PATH,
        type: 'article',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        images: ['/opengraph-image'],
        card: 'summary_large_image',
        title: 'Bitcoin Cost Basis Calculator — Average Price Per BTC',
        description:
            'Average cost basis across a DCA schedule, why weekly buying leaves hundreds of purchases to account for, and how FIFO, HIFO and spec-ID differ.',
        creator: '@9drix9',
    },
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

function fmtBtc(value: number): string {
    const decimals = value >= 1 ? 4 : 8;
    return `${value.toFixed(decimals).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')} BTC`;
}

function fmtPct(value: number, signed = false): string {
    const digits = Math.abs(value) >= 100 ? 0 : 1;
    const text = value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
    return `${signed && value > 0 ? '+' : ''}${text}%`;
}

// ── Data ───────────────────────────────────────────────────────────────────────

const SAMPLE_AMOUNT = 100;
const SAMPLE_YEARS = 5;
/** How much of the sample stack the FIFO/HIFO illustration disposes of. */
const DISPOSAL_FRACTION = 0.25;

/** "Oct 12, 2026 at 04:50 UTC". Every date on the site is a UTC date. */
function fmtUtcMoment(ts: number): string {
    return `${formatUtc(ts, 'full')} at ${new Date(ts).toISOString().slice(11, 16)} UTC`;
}

interface PageData {
    /** USD per BTC that every valuation on the page uses. */
    price: number;
    /**
     * When that price is from: the instant an exchange quoted it, or, when no
     * quote could be had, the UTC day of the newest row in the daily series.
     * Printed wherever the price is, because this page is rebuilt about once a
     * day and "live" was never true of it.
     */
    priceAsOf: number;
    /** The exchange that quoted `price`; null when it is the newest row of the daily series. */
    quotedBy: PriceProvider | null;
    /** The daily series everything is priced on, as it was actually served. */
    series: {
        provider: PriceProvider;
        /** The copy is one the server fetched earlier; `fetchedAt` says when. */
        stale: boolean;
        fetchedAt: number;
        lastTs: number;
    };
    /** The whole daily history, packed, for the tracker. */
    seed: PackedDailyPrices;
    sample: {
        startIso: string;
        lotCount: number;
        /** Lots priced on a filled-in value, not a close the exchange reported. */
        estimatedLots: number;
        totalInvested: number;
        btcAccumulated: number;
        averageCost: number;
        currentValue: number;
        profit: number;
        roi: number;
        cheapestLot: { date: string; price: number } | null;
        priciestLot: { date: string; price: number } | null;
        disposal: {
            qty: number;
            proceeds: number;
            fifoCost: number;
            hifoCost: number;
            lifoCost: number;
        };
    } | null;
}

/**
 * Whether a failed load should throw instead of rendering the fallback card.
 * Same rule and reasoning as the exchange-fees page: `next build` must never
 * fail on a provider outage, but once deployed a render that completes
 * replaces the cached page for a day, fallback card included, while one that
 * throws leaves the last good page in place and is retried on the next
 * request. That last good page prints the date of its price, so serving it a
 * little longer misleads nobody.
 */
const keepLastGoodPage = (): boolean =>
    process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build';

async function loadData(): Promise<PageData | null> {
    try {
        const now = Date.now();
        const nowTs = utcDayStart(now);
        // The same five-year window the calculator opens on, so the link at the
        // foot of the page reproduces the example.
        const sampleFromTs = Math.max(EARLIEST_PRICE_TS, utcYearsBefore(nowTs, SAMPLE_YEARS));

        // The whole history, not a window: the tracker prices positions of any
        // age from it without asking the server about them. No provider is
        // named, so this follows the price action's default series; the copy
        // describes whichever series came back.
        const [history, spot] = await Promise.all([
            getBitcoinPriceHistoryWithMeta(EARLIEST_PRICE_TS, nowTs + DAY_MS, undefined, DAILY_PRICE_REVALIDATE),
            getBitcoinSpot(undefined, DAILY_PRICE_REVALIDATE),
        ]);
        // The engine carries the last bar forward without limit, so a short or
        // stale series would still produce a full page of wrong numbers.
        if (!priceSeriesCovers(history.data, sampleFromTs, nowTs)) {
            throw new Error('price history does not cover the worked example');
        }
        const series = withPriceKinds(history.data, history.kinds);
        const seed = packDailyPrices(series);
        if (!seed) throw new Error('empty price history');

        const lastRow = history.data[history.data.length - 1];
        const price = spot ? spot.price : lastRow[1];
        const priceAsOf = spot ? spot.asOf : lastRow[0];
        if (!(price > 0)) throw new Error('no usable price');

        const result = calculateDca(
            {
                amount: SAMPLE_AMOUNT,
                frequency: 'weekly',
                startDate: new Date(sampleFromTs),
                endDate: new Date(nowTs),
                feePercentage: 0,
                priceMode: 'api',
                manualPrice: 0,
            },
            series,
            price,
            priceAsOf,
        );

        let sample: PageData['sample'] = null;
        if (result.btcAccumulated > 0 && result.breakdown.length > 1) {
            const lots: Lot[] = result.breakdown.map((item) => ({ price: item.price, btc: item.accumulated }));
            const qty = result.btcAccumulated * DISPOSAL_FRACTION;
            const cost = disposalCostByRule(lots, qty);

            sample = {
                startIso: formatUtc(sampleFromTs, 'isoDay'),
                lotCount: result.breakdown.length,
                estimatedLots: result.stats?.estimatedPrices?.purchases ?? 0,
                totalInvested: result.totalInvested,
                btcAccumulated: result.btcAccumulated,
                averageCost: result.averageCost,
                currentValue: result.currentValue,
                profit: result.profit,
                roi: result.roi,
                cheapestLot: result.stats?.bestBuy ?? null,
                priciestLot: result.stats?.worstBuy ?? null,
                disposal: {
                    qty,
                    proceeds: qty * price,
                    fifoCost: cost.fifo,
                    hifoCost: cost.hifo,
                    lifoCost: cost.lifo,
                },
            };
        }

        return {
            price,
            priceAsOf,
            quotedBy: spot ? spot.provider : null,
            series: {
                provider: history.servedProvider,
                stale: history.stale,
                fetchedAt: history.fetchedAt,
                lastTs: lastRow[0],
            },
            seed,
            sample,
        };
    } catch (error) {
        console.error('[calculators/bitcoin-cost-basis] data load failed:', error);
        if (keepLastGoodPage()) throw error;
        // During `next build` (and in development): an honest fallback, never a failed build.
        return null;
    }
}

// ── Page ───────────────────────────────────────────────────────────────────────

const METHODS: { name: string; body: string }[] = [
    {
        name: 'FIFO: first in, first out',
        body: 'The oldest bitcoin you bought is treated as the bitcoin you sold. It is the default assumption in many jurisdictions. It needs the order of your purchases and, where the order is applied wallet by wallet, which wallet or account each one is in. For a DCA plan running through a rising market, FIFO tends to match your sale against your cheapest, oldest lots. That usually produces the largest reported gain. Some systems apply the order inside each wallet or account, not across everything you hold. The United States has done so since 2025; see the note below this list.',
    },
    {
        name: 'LIFO: last in, first out',
        body: 'The most recent purchase is treated as the one sold. It matches against your newest lots, which after a rally are typically your most expensive. LIFO is not permitted everywhere. Where it is permitted, it usually needs the same record-keeping as specific identification.',
    },
    {
        name: 'HIFO: highest in, first out',
        body: 'The most expensive lots go first, which minimizes the reported gain on this disposal. In most places HIFO is not a separate legal method. It sits inside specific identification as a strategy, so it only holds up if your records actually identify which units you sold.',
    },
    {
        name: 'Specific identification',
        body: 'You nominate exactly which units you are disposing of. This is the mechanism that makes HIFO, or any other selection, possible. The price of admission is documentation: the acquisition date, quantity, cost, and disposal details of each unit. You have to identify them at or before the time of the sale, rather than reconstruct them afterwards. Requirements differ by jurisdiction and are strict where they exist.',
    },
    {
        name: 'Pooling / average cost',
        body: 'Some jurisdictions do not let you choose lots at all. The UK, for example, pools identical assets into a single holding with one averaged cost, plus same-day and 30-day matching rules. Canada uses an averaged adjusted cost base. Under a pooling regime the average cost basis this page calculates is more than a summary statistic. It is close to the number that actually matters.',
    },
];

/**
 * The one place this page states a country's current rules in detail, so it is
 * dated and every line is tied to the IRS document it was read from. All four
 * were re-read on US_NOTE_CHECKED. Re-check them when this file is next touched:
 * the 1099-DA phase-in is still moving. /bitcoin-dca-tax carries a shorter
 * version of the same note with the same four sources; keep the two in step.
 *
 * The order-of-sale line cites the FAQs on digital asset transactions (A86 and
 * A87 for a wallet, A92 for units in a broker's custody), not the older FAQs
 * on virtual currency transactions. That page says its answers "generally
 * apply to transactions involving digital assets completed before Jan. 1,
 * 2025", which is the period this note is not about.
 */
const US_NOTE_CHECKED = '2026-10-12';
const US_SOURCES: { label: string; href: string }[] = [
    { label: 'IRS, Digital assets', href: 'https://www.irs.gov/filing/digital-assets' },
    {
        label: 'IRS, FAQs on digital asset transactions',
        href: 'https://www.irs.gov/individuals/international-taxpayers/frequently-asked-questions-on-digital-asset-transactions',
    },
    { label: 'IRS, Rev. Proc. 2024-28 (PDF)', href: 'https://www.irs.gov/pub/irs-drop/rp-24-28.pdf' },
    { label: 'IRS, Instructions for Form 1099-DA (2026)', href: 'https://www.irs.gov/instructions/i1099da' },
];

const RECORDS: string[] = [
    'Date and time of each purchase, in a consistent timezone',
    'Fiat amount spent and the currency it was spent in',
    'Quantity of bitcoin received, after fees',
    'The fee charged, listed separately from the amount. In most jurisdictions acquisition fees are added to your basis',
    'The exchange or venue, and the account it happened in',
    'For withdrawals: the destination wallet and the on-chain transaction ID',
    'For disposals: date, quantity, proceeds, and which lots you identified',
];

// A breadcrumb link is one or two short words, about 15px tall as text on a
// phone. The padding makes it a 44px touch target, and the negative margins
// hand the same space back so the row sits exactly where it did.
const crumbLink =
    'inline-flex min-h-11 items-center -my-3.5 px-1.5 -mx-1.5 hover:text-amber-700 dark:hover:text-amber-400 transition-colors';

export default async function BitcoinCostBasisPage() {
    const data = await loadData();
    const sample = data?.sample ?? null;
    const spread = sample ? sample.disposal.hifoCost - sample.disposal.fifoCost : 0;

    // Which series answered is read off the result, not assumed: the price action
    // falls back from one exchange to the other when the first cannot be reached.
    // Kraken's public history is weekly, so only its series is straight-line fills.
    const seriesWords = data?.series.provider === 'kraken'
        ? "Kraken's weekly closing prices, with the days in between filled in along a straight line"
        : "Coinbase's daily closing prices";
    // "the Coinbase price on Oct 12, 2026 at 04:50 UTC", or the newest daily row when no quote was available.
    const priceWords = data
        ? data.quotedBy
            ? `the ${PRICE_PROVIDER_LABELS[data.quotedBy].name} price on ${fmtUtcMoment(data.priceAsOf)}`
            : `the newest price in that series, from ${formatUtc(data.priceAsOf, 'full')}`
        : '';
    const priceDay = data ? formatUtc(data.priceAsOf, 'monthDay') : '';

    const faqs: { question: string; answer: string }[] = [
        {
            question: 'What is cost basis for bitcoin?',
            answer:
                'Cost basis is what you paid to buy the bitcoin you hold. In most jurisdictions that includes the fees you paid to acquire it. When you sell, spend or swap bitcoin, that counts as a disposal. Your gain or loss is the proceeds minus the basis of what you disposed of: the specific units where tax is tracked lot by lot, a share of one averaged pool where it is not. Your average cost basis is total spent divided by total bitcoin held. It is a useful summary of your position, and in pooling jurisdictions it is close to the figure the tax calculation itself uses.',
        },
        {
            question: 'How do I calculate my average cost basis?',
            answer: sample
                ? `Divide everything you have spent by all the bitcoin you hold. In the worked example on this page, ${fmtUsd(sample.totalInvested)} across ${sample.lotCount} weekly purchases bought ${fmtBtc(sample.btcAccumulated)}, giving an average cost of ${fmtUsd(sample.averageCost)} per bitcoin. That is not the same as averaging the prices you paid. Each purchase is weighted by how much bitcoin it actually bought, so cheap buys count for more than expensive ones.`
                : 'Divide everything you have spent by all the bitcoin you hold. That is not the same as averaging the prices you paid. Each purchase is weighted by how much bitcoin it actually bought, so your cheaper buys count for more than your expensive ones.',
        },
        {
            question: 'Why does DCA create so many tax lots?',
            answer: sample
                ? `Every purchase is its own record: a date, a price, and a quantity. Where tax is worked out lot by lot, each one is also its own tax lot, and a disposal is matched against those individual purchases. Some countries instead pool identical coins into one holding with an averaged cost. The purchases still have to be recorded there, but they are not matched one by one. A weekly schedule adds 52 purchases a year. The ${SAMPLE_YEARS}-year example on this page has ${sample.lotCount}. None of that is a problem while you are only buying. It becomes work the moment you sell, spend, or move bitcoin between platforms.`
                : 'Every purchase is its own record: a date, a price, and a quantity. Where tax is worked out lot by lot, each one is also its own tax lot, and a disposal is matched against those individual purchases. Some countries instead pool identical coins into one holding with an averaged cost; the purchases still have to be recorded. A weekly schedule adds 52 purchases a year, so a five-year plan has about 260. It only becomes work once you sell or spend.',
        },
        {
            question: 'Does the method I choose change how much tax I owe?',
            answer: sample
                ? `It changes the timing and size of the gain you report on a given sale. In the example above, disposing of the same ${fmtBtc(sample.disposal.qty)} costs ${fmtUsd(sample.disposal.fifoCost)} under FIFO and ${fmtUsd(sample.disposal.hifoCost)} under HIFO. That is a difference of ${fmtUsd(Math.abs(spread))} in reported gain on one transaction. Over your whole holding period the total gain is the same either way. What changes is which year you recognize it in, and in some systems whether it is taxed at long-term or short-term rates. Whether you may choose at all depends on your jurisdiction.`
                : 'It changes the timing and size of the gain you report on a given sale. The total gain across your entire holding period does not change. What method you may use, if any, depends on your jurisdiction. Some require pooling and give you no choice.',
        },
        {
            question: 'Does the data I enter here leave my browser?',
            answer:
                'No. The tracker stores your positions in your browser\'s local storage, under a single key, and every figure is computed on your device. The price history it needs is public and loads with this page, so pricing a position sends nothing. Two requests can follow, and neither carries any of your data. If you use a currency other than US dollars, the page fetches today\'s exchange rates. And if the newest price in the page\'s copy of the history is more than three days behind today while you have a position saved, the tracker downloads a fresh copy of the whole price history from our server. Both requests are identical for every visitor and contain no date, amount or label of yours. There is no account. The flip side: clearing your browser data deletes your positions, and they do not follow you to another device or browser. Keep your own records elsewhere.',
        },
        {
            question: 'Is this tax advice?',
            answer:
                'No. This page explains concepts and does arithmetic. It does not know your jurisdiction, your residency, your other transactions, or the rules that apply to you. Those rules also change. Treat every number here as an estimate for planning and understanding. Before you file anything, use a proper tax tool or an accountant who works with digital assets in your country.',
        },
    ];

    const breadcrumbJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
            { '@type': 'ListItem', position: 2, name: 'Calculators', item: `${BASE_URL}/calculators` },
            { '@type': 'ListItem', position: 3, name: 'Bitcoin Cost Basis', item: `${BASE_URL}${PAGE_PATH}` },
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
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Bitcoin cost basis</li>
                    </ol>
                </nav>

                {/* Header */}
                <header className="space-y-4">
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white text-balance">
                        Bitcoin cost basis calculator
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                        Your cost basis is what you paid for the bitcoin you hold. Average it across a DCA plan and it
                        answers &ldquo;what is my real buy price?&rdquo; Split it back out into individual purchases and
                        you have the records a tax calculation is built from. This page does both. First a worked
                        example on historical prices, then a tracker you can put your own positions into.
                    </p>
                    <p className="inline-flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5">
                        <Lock className="w-4 h-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                        <span>
                            Your positions are stored in this browser&apos;s local storage, and every figure is
                            calculated on your device. There is no account and no database. Nothing you enter is sent
                            to us: not the dates, not the amounts, not the labels. The price history the tracker needs
                            is public and loads with this page. What the page may still fetch is the same for every
                            visitor: today&apos;s exchange rates if you use a currency other than US dollars, and a
                            fresh copy of the whole price history if this page&apos;s copy has fallen more than three
                            days behind while you have a position saved.
                        </span>
                    </p>
                </header>

                {/* What cost basis is */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        Average cost basis, precisely
                    </h2>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            Average cost basis is total fiat spent divided by total bitcoin held. That is the whole formula.
                            People often assume it equals the average of the prices they paid. It does not, because a
                            fixed-dollar purchase buys more bitcoin when the price is low. A $100 buy at $20,000 gets
                            five times the bitcoin of a $100 buy at $100,000. So it pulls the average down five times as
                            hard. That asymmetry is the entire mechanical argument for dollar-cost averaging. It falls
                            out of the arithmetic, not out of any claim about future prices.
                        </p>
                        <p>
                            In most jurisdictions acquisition fees are added to basis. A purchase with a 1% fee therefore
                            has a slightly higher basis per coin than the raw price suggests. The worked example below
                            uses a zero fee to keep things clean. The tracker lets you set a fee per position.
                        </p>
                    </div>
                </section>

                {/* Worked example */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        A worked example on historical prices
                    </h2>
                    {sample && data ? (
                        <>
                            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                                ${SAMPLE_AMOUNT} bought every week since {formatUtc(sample.startIso, 'full')}, priced on{' '}
                                {seriesWords} and valued at {fmtUsd(data.price)}, {priceWords}. This page is recalculated
                                about once a day, so that price is not a live one. No fee is applied.
                            </p>
                            <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                                <Card className="p-4 sm:p-5 space-y-2.5">
                                    <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        Position
                                    </h3>
                                    <StatRow label="Purchases" value={sample.lotCount.toLocaleString('en-US')} />
                                    <StatRow label="Total invested" value={fmtUsd(sample.totalInvested)} />
                                    <StatRow label="Bitcoin held" value={fmtBtc(sample.btcAccumulated)} />
                                    <StatRow
                                        label="Average cost basis"
                                        value={fmtUsd(sample.averageCost)}
                                        valueClassName="text-amber-700 dark:text-amber-400"
                                    />
                                </Card>
                                <Card className="p-4 sm:p-5 space-y-2.5">
                                    <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        At the {priceDay} price
                                    </h3>
                                    <StatRow label={`Price on ${priceDay}`} value={fmtUsd(data.price)} />
                                    <StatRow label="Value at that price" value={fmtUsd(sample.currentValue)} />
                                    <StatRow
                                        label="Unrealized gain"
                                        value={`${sample.profit >= 0 ? '+' : ''}${fmtUsd(sample.profit)} (${fmtPct(sample.roi, true)})`}
                                        valueClassName={sample.profit >= 0 ? 'text-gain' : 'text-loss'}
                                    />
                                    <StatRow
                                        label="Cheapest / priciest lot"
                                        value={
                                            sample.cheapestLot && sample.priciestLot
                                                ? `${fmtUsd(sample.cheapestLot.price)} / ${fmtUsd(sample.priciestLot.price)}`
                                                : '—'
                                        }
                                    />
                                </Card>
                            </div>
                            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                                Note the gap between the cheapest and priciest lot. Both are yours, both are bitcoin, and
                                on-chain they are indistinguishable. Where tax is tracked lot by lot they are very
                                different assets: sell the cheap one and the reported gain is large, sell the expensive
                                one and it is small. That is the whole reason lot accounting exists.
                                {sample.estimatedLots > 0 && (
                                    <>
                                        {' '}
                                        {sample.estimatedLots === sample.lotCount ? 'Every lot price' : `${sample.estimatedLots} of the ${sample.lotCount} lot prices`}{' '}
                                        here {sample.estimatedLots === 1 ? 'is an estimate' : 'are estimates'} filled in
                                        between two reported closes, so read the cheapest and priciest lot as approximate.
                                    </>
                                )}
                            </p>
                            {data.series.stale && (
                                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                    {PRICE_PROVIDER_LABELS[data.series.provider].name} could not be reached when this page
                                    was last rebuilt, so the daily prices are a copy fetched on{' '}
                                    {fmtUtcMoment(data.series.fetchedAt)}.
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
                                        We could not load historical prices to build the worked example. The{' '}
                                        <Link href="/" className="text-amber-700 dark:text-amber-400 hover:underline">main calculator</Link>{' '}
                                        reads the same two exchanges, so it may be affected as well. Try again in a few
                                        minutes.
                                    </p>
                                </div>
                            </div>
                        </Card>
                    )}
                </section>

                {/* Tax lots */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Layers className="w-6 h-6 sm:w-7 sm:h-7 text-amber-700 dark:text-amber-400 shrink-0" />
                        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                            Why DCA creates hundreds of tax lots
                        </h2>
                    </div>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            A single tax lot is one purchase: a date, a quantity, and a cost. That is how a lot-based tax
                            system sees your buying. A pooling system, covered further down, averages the purchases
                            into one holding instead, though each one still has to be recorded. Buying weekly creates 52
                            purchases a year whether you notice or not
                            {sample ? `, which is how the example above ended up with ${sample.lotCount}` : ''}. While you are
                            only accumulating, none of it matters. The moment you sell, spend, or swap any bitcoin, the
                            question becomes: <em>which</em> bitcoin did you dispose of? Your wallet cannot answer that,
                            because one unit of bitcoin is interchangeable with any other. Your records have to.
                        </p>
                        <p>
                            Here is what that choice is worth, using the same schedule as above.
                        </p>
                        {sample ? (
                            <Card className="p-4 sm:p-6">
                                <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white mb-1">
                                    Selling {fmtBtc(sample.disposal.qty)} at the {priceDay} price, for {fmtUsd(sample.disposal.proceeds)}
                                </h3>
                                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-3">
                                    A quarter of the stack, same disposal, three different lot-selection rules.
                                </p>
                                {/* No minimum width under 640px, and the rule's name may wrap
                                    there: at 420px the gain column, the point of the table,
                                    is off a phone's right edge. */}
                                <div className="overflow-x-auto -mx-4 sm:mx-0">
                                    <table className="w-full sm:min-w-[420px] text-xs sm:text-sm tabular-nums">
                                        <thead>
                                            <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                                <th scope="col" className="px-3 sm:px-4 py-2 font-medium whitespace-nowrap">Lots used</th>
                                                <th scope="col" className="px-3 sm:px-4 py-2 font-medium text-right whitespace-nowrap">Cost basis</th>
                                                <th scope="col" className="px-3 sm:px-4 py-2 font-medium text-right whitespace-nowrap">Reported gain</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-slate-700 dark:text-slate-300">
                                            {[
                                                { label: 'Oldest first (FIFO)', cost: sample.disposal.fifoCost },
                                                { label: 'Newest first (LIFO)', cost: sample.disposal.lifoCost },
                                                { label: 'Most expensive first (HIFO)', cost: sample.disposal.hifoCost },
                                            ].map((row) => (
                                                <tr key={row.label} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                                                    <td className="px-3 sm:px-4 py-2 font-medium text-slate-800 dark:text-slate-100 sm:whitespace-nowrap">{row.label}</td>
                                                    <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap">{fmtUsd(row.cost)}</td>
                                                    <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap">
                                                        {fmtUsd(sample.disposal.proceeds - row.cost)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                    Same bitcoin, same sale price, {fmtUsd(Math.abs(spread))} of difference in the gain you
                                    report this year. The totals converge once you eventually dispose of everything.
                                    Lot selection moves gains between tax years. It does not erase them.
                                </p>
                            </Card>
                        ) : null}
                        <p>
                            Two practical consequences. First, if you ever intend to select lots, you need the records in
                            place <em>before</em> the sale, not reconstructed afterwards. Second, moving bitcoin between your
                            own wallets is generally not a disposal, but your basis has to travel with it. Once coins have
                            moved between platforms, no single exchange has the history to work it out for you.
                        </p>
                    </div>
                </section>

                {/* Methods */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        FIFO, HIFO and specific identification, as concepts
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        These are accounting conventions for matching a disposal to the purchases behind it. Which of them
                        you are allowed to use depends entirely on where you are tax resident. So does whether you get a
                        choice at all. And the rules change. What follows is the shape of the ideas, not guidance on
                        which to apply.
                    </p>
                    <div className="space-y-3">
                        {METHODS.map((m) => (
                            <Card key={m.name} className="p-4 sm:p-5">
                                <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white mb-1.5">{m.name}</h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{m.body}</p>
                            </Card>
                        ))}
                    </div>

                    {/* United States */}
                    <Card className="p-4 sm:p-5 border-amber-500/30 dark:border-amber-500/25">
                        <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white mb-1.5">
                            United States: per wallet and per account since 2025
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                            What the IRS has published, as read on {formatUtc(US_NOTE_CHECKED, 'full')}. This describes
                            US federal rules only. It is not advice, and these rules are still being phased in.
                        </p>
                        <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                            {[
                                'Lot rules apply inside each wallet or account, not across everything you hold. The final regulations apply to acquisitions and disposals of digital assets on or after January 1, 2025, and Rev. Proc. 2024-28 describes them as applying the specific identification and first-in, first-out rules to units "held within a single wallet or account".',
                                'If you do not identify specific units, the IRS FAQs on digital asset transactions say they are treated as leaving "in order of time from the earliest date on which units of the same digital asset in this wallet were acquired by you", whatever date they were moved into that wallet. That is first in, first out, counted wallet by wallet. The FAQs give the same order for units held in a broker\'s custody.',
                                'Brokers report sales on Form 1099-DA. The IRS says they must report gross proceeds for transactions on or after January 1, 2025, and basis for "certain transactions" on or after January 1, 2026.',
                                'Under the 2026 instructions for that form, a broker has to report basis only for a covered security: a digital asset acquired after 2025 in an account where that broker provided custody, and held in that account until it was sold. For anything else, including bitcoin bought before 2026 or moved in from elsewhere, basis reporting is voluntary, so the form can arrive with no basis figure for those coins.',
                            ].map((line) => (
                                <li key={line} className="flex gap-2.5 leading-relaxed">
                                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-amber-400 shrink-0" aria-hidden="true" />
                                    <span>{line}</span>
                                </li>
                            ))}
                        </ul>
                        {/* One source per line, each a 44px row on a touch screen. Run
                            together in a sentence they are 15px-tall targets 5px apart. */}
                        <p className="mt-3 text-xs sm:text-sm text-slate-600 dark:text-slate-400">Sources:</p>
                        <ul className="text-xs sm:text-sm">
                            {US_SOURCES.map((source) => (
                                <li key={source.href}>
                                    <a
                                        href={source.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center py-1 max-sm:min-h-11 pointer-coarse:min-h-11 text-amber-700 dark:text-amber-400 hover:underline font-medium"
                                    >
                                        {source.label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </Card>
                </section>

                {/* Records */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        What to record for every purchase
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        Exchanges close, delist users, and lose export history. Keeping your own copy costs a few minutes a
                        month and is the difference between a calculation and a guess.
                    </p>
                    <Card className="p-4 sm:p-6">
                        <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                            {RECORDS.map((r) => (
                                <li key={r} className="flex gap-2.5 leading-relaxed">
                                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-amber-400 shrink-0" aria-hidden="true" />
                                    <span>{r}</span>
                                </li>
                            ))}
                        </ul>
                    </Card>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        Spending bitcoin on goods is a disposal in most jurisdictions, at the market value on the day. So is
                        swapping it for another asset. Sending it to your own hardware wallet usually is not, but you should
                        still record the transfer so your basis stays traceable across wallets.
                    </p>
                </section>

                {/* Tracker */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        Track your own positions
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        Add each DCA schedule you have actually run: a label, the date range, the amount per buy, the
                        cadence and the fee. The tracker backtests each one against historical prices and shows the combined
                        average cost basis across all of them. A plan you are still running can have an end date in the
                        future. It is counted up to today, never beyond. Positions persist in this browser only and
                        there is no account. Nothing about them reaches our server.
                    </p>
                    {data ? (
                        <>
                            {/* The whole history is handed over up front (packed, see
                                priceSeed), so the tracker prices a position of any age
                                without a request shaped by that position. */}
                            <SeededCostBasisTracker
                                seed={data.seed}
                                livePrice={data.price}
                                priceAsOf={data.priceAsOf}
                                priceAsOfIsDay={data.quotedBy === null}
                                provider={DEFAULT_PRICE_PROVIDER}
                            />
                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                The price history loads with this page and runs from{' '}
                                {formatUtc(EARLIEST_PRICE_DATE, 'full')}, the first day we have a price for, to{' '}
                                {formatUtc(data.series.lastTs, 'full')}:{' '}
                                {data.series.provider === 'kraken'
                                    ? `Kraken's weekly closes with the days in between filled in along a straight line from ${formatUtc(FIRST_EXCHANGE_CLOSE_DATE, 'full')}`
                                    : `Coinbase's daily closes from ${formatUtc(FIRST_EXCHANGE_CLOSE_DATE, 'full')}`}
                                , and before that blockchain.info&apos;s daily average market price. Plans are valued
                                at {fmtUsd(data.price)}, {priceWords}. Each plan keeps the amount and currency you
                                typed. Nothing you enter leaves your browser.
                            </p>
                        </>
                    ) : (
                        <Card className="p-6">
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                The tracker needs historical price data, which we could not load right now. It is also
                                in the{' '}
                                <Link href="/" className="text-amber-700 dark:text-amber-400 hover:underline">main calculator</Link>,
                                under the Details tab of any result.
                            </p>
                        </Card>
                    )}
                </section>

                {/* Not tax advice */}
                <Card className="p-5 sm:p-6 border-amber-500/30 dark:border-amber-500/25">
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-2">
                        This is not tax advice
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        Rules for cost basis, permitted accounting methods, record-keeping standards and what counts as a
                        taxable disposal vary by country. They also change from year to year. Nothing here knows your
                        jurisdiction, your residency, or the rest of your transaction history. None of it has been
                        reviewed by a tax professional. Use these figures to understand your position and to plan. Before
                        you file, use a qualified accountant or a dedicated tax tool in your country.
                    </p>
                </Card>

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
                        The full calculator backtests any schedule against historical prices.
                        {sample ? ' The button opens it on the worked example above, same schedule, same price series and no fee, so you can check the figures and then change them.' : ''}{' '}
                        You get your average cost, every individual purchase, fees paid, and a downloadable CSV of the
                        purchase-by-purchase detail.
                    </p>
                    <Link
                        href={
                            sample && data
                                ? `/?amount=${SAMPLE_AMOUNT}&frequency=weekly&startDate=${sample.startIso}&fee=0&provider=${data.series.provider}`
                                : '/'
                        }
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
                            <Link href="/calculators/exchange-fees" className="block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-3 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                What exchange fees really cost
                            </Link>
                        </li>
                        <li>
                            <Link href="/calculators/stack-sats-goal" className="block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-3 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                How long to stack 1 bitcoin
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
                    Not financial advice and not tax advice. Figures are historical simulations for education; past
                    performance does not guarantee future results, bitcoin is volatile, and you can lose money.
                </p>
            </div>
        </>
    );
}
