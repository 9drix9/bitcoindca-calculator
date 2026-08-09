import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Lock, Layers } from 'lucide-react';
import { Card, StatRow } from '@/components/ui/Card';
import { CostBasisTracker } from '@/components/CostBasisTracker';
import { getBitcoinPriceHistory, getCurrentBitcoinPrice } from '@/app/actions';
import { DAILY_PRICE_REVALIDATE } from '@/utils/revalidate';
import { calculateDca } from '@/utils/dca';
import { DAY_MS, EARLIEST_PRICE_DATE, EARLIEST_PRICE_TS, formatUtc, utcDayStart } from '@/utils/dates';

// Recomputed once a day against fresh prices.
export const revalidate = 86400;

const BASE_URL = 'https://btcdollarcostaverage.com';
const PAGE_PATH = '/calculators/bitcoin-cost-basis';

export const metadata: Metadata = {
    title: 'Bitcoin Cost Basis Calculator — Average Price Per BTC',
    description:
        'Work out your average cost basis per bitcoin across a DCA schedule, see why hundreds of small buys create hundreds of separate tax lots, and compare FIFO, HIFO and specific identification as concepts. Positions you enter stay in your browser.',
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
            'Average cost basis across a DCA schedule, why DCA creates hundreds of tax lots, and how FIFO, HIFO and spec-ID differ.',
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
            'Average cost basis across a DCA schedule, why DCA creates hundreds of tax lots, and how FIFO, HIFO and spec-ID differ.',
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
/** Years of daily history handed to the client-side tracker. */
const TRACKER_YEARS = 10;

interface Lot {
    price: number;
    btc: number;
}

/** Cost of disposing `qty` BTC by consuming lots in the given order. */
function disposalCost(lots: Lot[], qty: number): number {
    let remaining = qty;
    let cost = 0;
    for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(lot.btc, remaining);
        cost += take * lot.price;
        remaining -= take;
    }
    return cost;
}

interface PageData {
    price: number;
    trackerData: [number, number][];
    trackerFromIso: string;
    sample: {
        startIso: string;
        lotCount: number;
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

async function loadData(): Promise<PageData | null> {
    try {
        const nowTs = utcDayStart(Date.now());
        const anchor = new Date(nowTs);
        const trackerFromTs = Math.max(
            EARLIEST_PRICE_TS,
            Date.UTC(anchor.getUTCFullYear() - TRACKER_YEARS, anchor.getUTCMonth(), anchor.getUTCDate()),
        );
        const sampleFromTs = Math.max(
            EARLIEST_PRICE_TS,
            Date.UTC(anchor.getUTCFullYear() - SAMPLE_YEARS, anchor.getUTCMonth(), anchor.getUTCDate()),
        );

        const [history, livePrice] = await Promise.all([
            getBitcoinPriceHistory(trackerFromTs, nowTs + DAY_MS, 'kraken', DAILY_PRICE_REVALIDATE),
            getCurrentBitcoinPrice('kraken', DAILY_PRICE_REVALIDATE).catch(() => null),
        ]);
        if (!history || history.length === 0) return null;

        const price = livePrice && livePrice > 0 ? livePrice : history[history.length - 1][1];
        if (!price || price <= 0) return null;

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
            history,
            price,
        );

        let sample: PageData['sample'] = null;
        if (result.btcAccumulated > 0 && result.breakdown.length > 1) {
            const lots: Lot[] = result.breakdown.map((item) => ({ price: item.price, btc: item.accumulated }));
            const qty = result.btcAccumulated * DISPOSAL_FRACTION;
            const byPriceDesc = [...lots].sort((a, b) => b.price - a.price);
            const reverseChrono = [...lots].reverse();

            sample = {
                startIso: formatUtc(sampleFromTs, 'isoDay'),
                lotCount: result.breakdown.length,
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
                    fifoCost: disposalCost(lots, qty),
                    hifoCost: disposalCost(byPriceDesc, qty),
                    lifoCost: disposalCost(reverseChrono, qty),
                },
            };
        }

        return {
            price,
            trackerData: history,
            trackerFromIso: formatUtc(history[0][0], 'isoDay'),
            sample,
        };
    } catch (error) {
        // Never build-fail on a provider outage: the page renders an honest fallback.
        console.error('[calculators/bitcoin-cost-basis] data load failed:', error);
        return null;
    }
}

// ── Page ───────────────────────────────────────────────────────────────────────

const METHODS: { name: string; body: string }[] = [
    {
        name: 'FIFO: first in, first out',
        body: 'The oldest bitcoin you bought is treated as the bitcoin you sold. It is the default assumption in many jurisdictions and the easiest to defend. All it needs is the order of your purchases, with no extra record-keeping. For a DCA plan running through a rising market, FIFO tends to match your sale against your cheapest, oldest lots. That usually produces the largest reported gain.',
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

const RECORDS: string[] = [
    'Date and time of each purchase, in a consistent timezone',
    'Fiat amount spent and the currency it was spent in',
    'Quantity of bitcoin received, after fees',
    'The fee charged, listed separately from the amount. In most jurisdictions acquisition fees are added to your basis',
    'The exchange or venue, and the account it happened in',
    'For withdrawals: the destination wallet and the on-chain transaction ID',
    'For disposals: date, quantity, proceeds, and which lots you identified',
];

export default async function BitcoinCostBasisPage() {
    const data = await loadData();
    const sample = data?.sample ?? null;
    const spread = sample ? sample.disposal.hifoCost - sample.disposal.fifoCost : 0;

    const faqs: { question: string; answer: string }[] = [
        {
            question: 'What is cost basis for bitcoin?',
            answer:
                'Cost basis is what you paid to buy the bitcoin you hold. In most jurisdictions that includes the fees you paid to acquire it. When you sell, spend or swap bitcoin, that counts as a disposal. Your gain or loss is the proceeds minus the basis of the specific units you disposed of. Your average cost basis is total spent divided by total bitcoin held. It is a useful summary of your position, and in pooling jurisdictions it is close to the figure the tax calculation itself uses.',
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
                ? `Every purchase is its own tax lot: a date, a price, and a quantity. Tax rules generally track disposals against those individual purchases rather than against a single blended pile. A weekly schedule creates 52 lots a year. The ${SAMPLE_YEARS}-year example on this page has ${sample.lotCount}. None of that is a problem while you are only buying. It becomes work the moment you sell, spend, or move bitcoin between platforms.`
                : 'Every purchase is its own tax lot: a date, a price, and a quantity. Tax rules generally track disposals against those individual purchases. A weekly schedule creates 52 lots a year, so a five-year plan has more than 250. It only becomes work once you sell or spend.',
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
                'No. The tracker stores your positions in your browser\'s local storage, under a single key. Every figure is computed on your device from price data already loaded with the page. Nothing is sent to a server, there is no account, and we never see it. The flip side: clearing your browser data deletes your positions, and they do not follow you to another device or browser. Keep your own records elsewhere.',
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
                        <li><Link href="/" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">Home</Link></li>
                        <li aria-hidden="true">/</li>
                        <li><Link href="/calculators" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">Calculators</Link></li>
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
                        it becomes the thing every tax authority actually cares about. This page does both. First a
                        worked example on real prices, then a tracker you can put your own positions into.
                    </p>
                    <p className="inline-flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5">
                        <Lock className="w-4 h-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                        <span>
                            Your positions are stored in this browser&apos;s local storage, and every figure is
                            calculated on your device. There is no account and no database. One honest caveat. To price
                            buys that fall outside the window this page loads, the tracker asks our server for prices
                            covering the date range your positions span. Those dates do leave your browser. The amounts,
                            labels and results never do.
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
                        A worked example on real prices
                    </h2>
                    {sample && data ? (
                        <>
                            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                                ${SAMPLE_AMOUNT} bought every week since {formatUtc(sample.startIso, 'full')}, priced against
                                real Kraken history and valued at the live price of {fmtUsd(data.price)}.
                            </p>
                            <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                                <Card className="p-4 sm:p-5 space-y-2.5">
                                    <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        Position
                                    </h3>
                                    <StatRow label="Purchases (tax lots)" value={sample.lotCount.toLocaleString('en-US')} />
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
                                        Against today&apos;s market
                                    </h3>
                                    <StatRow label="Price now" value={fmtUsd(data.price)} />
                                    <StatRow label="Value now" value={fmtUsd(sample.currentValue)} />
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
                                on-chain they are indistinguishable. For tax purposes they are very different assets.
                                That is the whole reason lot accounting exists.
                            </p>
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
                                        falls back across several providers, so it will usually still work.
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
                            A single tax lot is one purchase: a date, a quantity, and a cost. Buying weekly creates 52 of
                            them a year whether you notice or not
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
                                    Selling {fmtBtc(sample.disposal.qty)} today for {fmtUsd(sample.disposal.proceeds)}
                                </h3>
                                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-3">
                                    A quarter of the stack, same disposal, three different lot-selection rules.
                                </p>
                                <div className="overflow-x-auto -mx-4 sm:mx-0">
                                    <table className="w-full min-w-[420px] text-xs sm:text-sm tabular-nums">
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
                                                    <td className="px-3 sm:px-4 py-2 font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">{row.label}</td>
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
                        average cost basis across all of them. Positions persist in this browser only and there is no
                        account. The only thing that reaches our server is the date range they span, which is what the
                        price lookup needs. The amounts and the results stay on your device.
                    </p>
                    {data ? (
                        <>
                            {/* The tracker now fetches a series spanning the user's own
                                saved positions, so positions predating this page's
                                seeded window are priced correctly too. */}
                            <CostBasisTracker priceData={data.trackerData} livePrice={data.price} priceMode="api" provider="kraken" />
                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                This page opens on prices from {formatUtc(data.trackerFromIso, 'full')} onward. Once you
                                add a position, the tracker loads whatever range your own positions actually span, back to{' '}
                                {formatUtc(EARLIEST_PRICE_DATE, 'full')}. That is the first day with real market data.
                                Amounts are stored in USD and displayed in whichever currency you have selected. Nothing
                                you enter leaves your browser.
                            </p>
                        </>
                    ) : (
                        <Card className="p-6">
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                The tracker needs historical price data, which we could not load right now. It is also
                                available at the bottom of every result in the{' '}
                                <Link href="/" className="text-amber-700 dark:text-amber-400 hover:underline">main calculator</Link>.
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
                        The full calculator backtests any schedule against real historical prices. You get your average
                        cost, every individual purchase, fees paid, and a downloadable CSV of the lot-by-lot detail.
                    </p>
                    <Link
                        href={`/?amount=${SAMPLE_AMOUNT}&frequency=weekly&fee=0.5`}
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
                            <Link href="/calculators" className="block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                All calculators
                            </Link>
                        </li>
                        <li>
                            <Link href="/calculators/exchange-fees" className="block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                What exchange fees really cost
                            </Link>
                        </li>
                        <li>
                            <Link href="/calculators/stack-sats-goal" className="block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                How long to stack 1 bitcoin
                            </Link>
                        </li>
                        <li>
                            <Link href="/methodology" className="block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
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
