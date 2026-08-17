import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Target } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { StackingGoalTracker } from '@/components/StackingGoalTracker';
import { getBitcoinPriceHistory, getCurrentBitcoinPrice } from '@/app/actions';
import { DAILY_PRICE_REVALIDATE } from '@/utils/revalidate';
import { calculateDca } from '@/utils/dca';
import { DAY_MS, EARLIEST_PRICE_TS, formatUtc, utcDayStart } from '@/utils/dates';

// Recomputed once a day against fresh prices.
export const revalidate = 86400;

const BASE_URL = 'https://btcdollarcostaverage.com';
const PAGE_PATH = '/calculators/stack-sats-goal';

export const metadata: Metadata = {
    title: 'How Long to Stack 1 Bitcoin — Stack Sats Calculator',
    description:
        'A stack sats calculator: how long it takes to stack 0.01, 0.1 or 1 whole bitcoin at your contribution rate, projected at today’s price rather than an assumed future one. Includes a live milestone tracker and a plain explanation of sats.',
    keywords: [
        'how long to stack 1 bitcoin',
        'stack sats calculator',
        'sats goal calculator',
        'how many sats can i buy',
        'time to 1 bitcoin',
        'bitcoin accumulation calculator',
    ],
    alternates: { canonical: PAGE_PATH },
    openGraph: {
        images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
        title: 'How Long to Stack 1 Bitcoin — Stack Sats Calculator',
        description:
            'How long 0.01, 0.1 and 1 BTC take at your contribution rate, projected honestly at today’s price.',
        url: PAGE_PATH,
        type: 'article',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        images: ['/opengraph-image'],
        card: 'summary_large_image',
        title: 'How Long to Stack 1 Bitcoin — Stack Sats Calculator',
        description:
            'How long 0.01, 0.1 and 1 BTC take at your contribution rate, projected honestly at today’s price.',
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

const fmtInt = (value: number): string => Math.round(value).toLocaleString('en-US');

function fmtBtc(value: number): string {
    const decimals = value >= 1 ? 4 : 8;
    return `${value.toFixed(decimals).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')} BTC`;
}

/** Months → "3 yr 4 mo". Used for straight-line milestone estimates. */
function fmtDuration(months: number): string {
    if (!Number.isFinite(months) || months <= 0) return '—';
    if (months < 1) return 'under a month';
    const total = Math.round(months);
    const years = Math.floor(total / 12);
    const rest = total % 12;
    if (years === 0) return `${rest} mo`;
    if (years >= 100) return `${years} yr`;
    if (rest === 0) return `${years} yr`;
    return `${years} yr ${rest} mo`;
}

// ── Data ───────────────────────────────────────────────────────────────────────

interface PageData {
    price: number;
    /** A real trailing-12-month $50/week schedule, used to seed the milestone tracker. */
    sample: {
        btcAccumulated: number;
        totalInvested: number;
        purchaseCount: number;
        startDate: string;
        endDate: string;
    } | null;
}

const CONTRIBUTIONS: { label: string; amount: number; perMonth: number }[] = [
    { label: '$10 / week', amount: 10, perMonth: (10 * 52) / 12 },
    { label: '$25 / week', amount: 25, perMonth: (25 * 52) / 12 },
    { label: '$50 / week', amount: 50, perMonth: (50 * 52) / 12 },
    { label: '$100 / week', amount: 100, perMonth: (100 * 52) / 12 },
    { label: '$200 / month', amount: 200, perMonth: 200 },
    { label: '$500 / month', amount: 500, perMonth: 500 },
    { label: '$1,000 / month', amount: 1000, perMonth: 1000 },
];

const MILESTONES = [0.01, 0.1, 1];

async function loadData(): Promise<PageData | null> {
    try {
        const nowTs = utcDayStart(Date.now());
        const start = new Date(nowTs);
        const startTs = Math.max(
            EARLIEST_PRICE_TS,
            Date.UTC(start.getUTCFullYear() - 1, start.getUTCMonth(), start.getUTCDate()),
        );

        const [history, livePrice] = await Promise.all([
            getBitcoinPriceHistory(startTs, nowTs + DAY_MS, 'kraken', DAILY_PRICE_REVALIDATE),
            getCurrentBitcoinPrice('kraken', DAILY_PRICE_REVALIDATE).catch(() => null),
        ]);

        const fallbackPrice = history && history.length > 0 ? history[history.length - 1][1] : 0;
        const price = livePrice && livePrice > 0 ? livePrice : fallbackPrice;
        if (!price || price <= 0) return null;

        let sample: PageData['sample'] = null;
        if (history && history.length > 0) {
            const result = calculateDca(
                {
                    amount: 50,
                    frequency: 'weekly',
                    startDate: new Date(startTs),
                    endDate: new Date(nowTs),
                    feePercentage: 0,
                    priceMode: 'api',
                    manualPrice: 0,
                },
                history,
                price,
            );
            if (result.btcAccumulated > 0 && result.breakdown.length > 1) {
                sample = {
                    btcAccumulated: result.btcAccumulated,
                    totalInvested: result.totalInvested,
                    purchaseCount: result.breakdown.length,
                    startDate: formatUtc(startTs, 'isoDay'),
                    endDate: formatUtc(nowTs, 'isoDay'),
                };
            }
        }

        return { price, sample };
    } catch (error) {
        // Never build-fail on a provider outage: the page renders an honest fallback.
        console.error('[calculators/stack-sats-goal] data load failed:', error);
        return null;
    }
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function StackSatsGoalPage() {
    const data = await loadData();
    const price = data?.price ?? null;

    const rows = price
        ? CONTRIBUTIONS.map((c) => {
            const btcPerMonth = c.perMonth / price;
            return {
                ...c,
                satsPerBuy: (c.amount / price) * 1e8,
                months: MILESTONES.map((m) => m / btcPerMonth),
            };
        })
        : [];

    const satsPer100 = price ? (100 / price) * 1e8 : 0;
    const monthsTo1BtcAt500 = price ? 1 / (500 / price) : 0;

    const faqs: { question: string; answer: string }[] = [
        {
            question: 'How long does it take to stack 1 bitcoin?',
            answer: price
                ? `At today's price of ${fmtUsd(price)}, $500 a month buys roughly ${fmtInt((500 / price) * 1e8)} sats a month. A whole bitcoin then takes about ${fmtDuration(monthsTo1BtcAt500)}, if the price never moves. Double the contribution and you roughly halve the time. This is a straight-line estimate at a constant price, not a forecast. The real answer depends entirely on what the price does while you are buying.`
                : 'It depends on how much you contribute and what the price does. At a constant price, the estimate is simply 1 BTC divided by the bitcoin your monthly contribution buys at that price. This page shows the calculation once live price data is available.',
        },
        {
            question: 'What is a sat?',
            answer: price
                ? `A satoshi, or sat, is one hundred-millionth of a bitcoin: 1 BTC = 100,000,000 sats. It is the smallest unit the Bitcoin protocol can record, which is why you never need to buy a whole coin. At ${fmtUsd(price)}, $100 buys about ${fmtInt(satsPer100)} sats.`
                : 'A satoshi, or sat, is one hundred-millionth of a bitcoin: 1 BTC = 100,000,000 sats. It is the smallest unit the Bitcoin protocol can record, which is why you never need to buy a whole coin.',
        },
        {
            question: 'What does “stack sats” mean?',
            answer: 'Stacking sats means buying or earning small amounts of bitcoin on a regular basis and holding them. A sat is one hundred-millionth of a bitcoin, so the phrase just describes accumulating bitcoin a little at a time rather than in one purchase. Dollar-cost averaging, a fixed buy on a fixed schedule, is the most common way to do it. This stack sats calculator turns that rate into a timeline: how long 0.01, 0.1 and 1 BTC take at today’s price.',
        },
        {
            question: 'Do I need to buy a whole bitcoin?',
            answer: 'No. Bitcoin is divisible to eight decimal places, and every major exchange sells fractions. The instinct that you must own a whole unit is called unit bias. It makes a $3 token feel cheaper than a $100,000 one, even though what you own is a percentage of a supply rather than a number of units. What matters is the fraction of total supply you hold, not whether it rounds to a whole coin.',
        },
        {
            question: 'Why does this page project at today’s price instead of assuming growth?',
            answer: 'Because a projection that assumes appreciation mostly tells you what you assumed. Take bitcoin\'s past annualized return, apply it forward, then use the result to argue that stacking is worthwhile. The conclusion was baked into the input. Holding the price constant is the one assumption that adds no opinion. It isolates the part you actually control: how much you contribute and how often.',
        },
        {
            question: 'What happens to my timeline if the price doubles?',
            answer: 'The sats each dollar buys are halved, so every sat you have not bought yet takes about twice as long to accumulate. At the same time the sats you already own double in fiat value. Goals measured in bitcoin get further away when the price rises. Goals measured in dollars get closer. A falling price does the reverse: faster accumulation, lower value on what you already hold.',
        },
        {
            question: 'Is stacking to a round number like 1 BTC a sensible goal?',
            answer: 'Round numbers are motivational, not financial. Nothing changes at 1.0 BTC that does not change at 0.9. Three things actually matter. Whether the contribution fits your budget without forcing you to sell at a bad time. Whether you are paying reasonable fees. And whether you can hold through a drawdown of 70% or more, meaning a fall of that size from a previous high, which has happened repeatedly. Treat a milestone as a progress marker, not a target that justifies stretching your finances.',
        },
    ];

    const breadcrumbJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
            { '@type': 'ListItem', position: 2, name: 'Calculators', item: `${BASE_URL}/calculators` },
            { '@type': 'ListItem', position: 3, name: 'Stack Sats Goal', item: `${BASE_URL}${PAGE_PATH}` },
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
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Stack sats goal</li>
                    </ol>
                </nav>

                {/* Header */}
                <header className="space-y-4">
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white text-balance">
                        How long does it take to stack 1 bitcoin?
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                        {price ? (
                            <>
                                Bitcoin is trading at <strong className="font-semibold text-slate-900 dark:text-white">{fmtUsd(price)}</strong>,
                                so $100 buys about <strong className="font-semibold text-slate-900 dark:text-white">{fmtInt(satsPer100)} sats</strong>.
                                A sat is one hundred-millionth of a bitcoin, which is why you never need to buy a whole
                                coin. The table below turns that into a timeline. It shows how long 0.01, 0.1 and a full
                                bitcoin take at seven common contribution rates, held at today&apos;s price. No assumed
                                growth rate, because assuming one would answer the question before you asked it.
                            </>
                        ) : (
                            <>
                                This page turns a contribution rate into a timeline. It shows how long 0.01, 0.1 and a
                                full bitcoin take at today&apos;s price, with no assumed growth rate. Live price data is
                                temporarily unavailable, so the figures below are not showing right now.
                            </>
                        )}
                    </p>
                </header>

                {/* Milestone table */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        Time to each milestone at today&apos;s price
                    </h2>
                    {price ? (
                        <>
                            <Card className="p-4 sm:p-6">
                                <div className="overflow-x-auto -mx-4 sm:mx-0">
                                    <table className="w-full min-w-[520px] text-xs sm:text-sm tabular-nums">
                                        <thead>
                                            <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                                <th scope="col" className="px-3 sm:px-4 py-2 font-medium whitespace-nowrap">Contribution</th>
                                                <th scope="col" className="px-3 sm:px-4 py-2 font-medium text-right whitespace-nowrap">Sats per buy</th>
                                                <th scope="col" className="px-3 sm:px-4 py-2 font-medium text-right whitespace-nowrap">To 0.01 BTC</th>
                                                <th scope="col" className="px-3 sm:px-4 py-2 font-medium text-right whitespace-nowrap">To 0.1 BTC</th>
                                                <th scope="col" className="px-3 sm:px-4 py-2 font-medium text-right whitespace-nowrap">To 1 BTC</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-slate-700 dark:text-slate-300">
                                            {rows.map((row) => (
                                                <tr key={row.label} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                                                    <td className="px-3 sm:px-4 py-2 font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">{row.label}</td>
                                                    <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap">{fmtInt(row.satsPerBuy)}</td>
                                                    {row.months.map((m, i) => (
                                                        <td key={i} className="px-3 sm:px-4 py-2 text-right whitespace-nowrap">{fmtDuration(m)}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                    Calculated at the live price of {fmtUsd(price)} and held constant. Weekly rates are
                                    converted at 52 weeks per year. Exchange fees are excluded. At a 1% fee every row gets
                                    about 1% longer.
                                </p>
                            </Card>

                            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                                The arithmetic is deliberately boring: divide your monthly contribution by the price to get
                                bitcoin per month, then divide the milestone by that. Everything interesting about bitcoin
                                happens in the price, and the price is exactly the part nobody can project.
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
                                        We could not reach a price provider for this page. The live{' '}
                                        <Link href="/" className="text-amber-700 dark:text-amber-400 hover:underline">calculator</Link>{' '}
                                        falls back across several providers, so it will usually still work.
                                    </p>
                                </div>
                            </div>
                        </Card>
                    )}
                </section>

                {/* Why no growth assumption */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        Why this does not project the price forward
                    </h2>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            Most &ldquo;time to 1 BTC&rdquo; tools quietly do one of two things. Either they project forward
                            the rate at which you accumulated bitcoin in the past, or they apply bitcoin&apos;s historical
                            annualized return to the future. Both look like analysis. Neither is.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Projecting a past accumulation rate</strong>{' '}
                            says: you bought X sats per day over the last five years, so you will keep buying X sats per day.
                            But sats per dollar is just the price in reverse. When the price doubles, your sats per dollar
                            halve. A schedule that ran through 2019 accumulated sats at prices near $8,000. Projecting that
                            rate forward silently assumes bitcoin returns to $8,000 and stays there. It is a price forecast
                            wearing a costume.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Applying a historical growth rate</strong> is
                            worse, because it is circular. You take the fact that bitcoin went up, feed it in as an
                            assumption, and get back the conclusion that stacking will make you money. The output contains no
                            information the input did not. Bitcoin&apos;s early returns came off a base of a few cents, in a
                            market with almost no liquidity. Nothing entitles the next decade to repeat it.
                        </p>
                        <p>
                            Holding the price flat is not a prediction that the price will stay flat. It is simply the one
                            assumption that adds nothing of its own. That makes the result a clean statement about the
                            variables you actually control: how much you put in and how often.
                        </p>
                    </div>
                </section>

                {/* Sats and unit bias */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        Sats, and why the sticker price misleads people
                    </h2>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            One bitcoin is 100,000,000 satoshis. The satoshi is named after the pseudonymous author of the
                            Bitcoin white paper. It is the smallest amount the protocol records: internally, every balance
                            and every transaction on the network is counted in whole sats. &ldquo;BTC&rdquo; is a display
                            convention layered on top.
                        </p>
                        <p>
                            That matters because of <strong className="text-slate-800 dark:text-slate-200">unit bias</strong>:
                            the tendency to judge an asset by its price per unit rather than by what a unit represents. A
                            token priced at $0.02 feels cheap, and a bitcoin priced in six figures feels expensive. But price
                            per unit says nothing at all without the supply attached to it. What you own is a share of a
                            fixed 21 million supply. Buying $50 of bitcoin gets you the same fraction of that supply whether
                            the interface shows it as 0.00045 BTC or 45,000 sats.
                        </p>
                        <p>
                            Counting in sats mostly removes the illusion. It replaces a number with six leading zeros with an
                            ordinary five- or six-digit one. It also reframes the goal from &ldquo;buy a coin&rdquo; to
                            &ldquo;accumulate units,&rdquo; which is what a DCA schedule actually does. The calculator can
                            display either. The BTC/sats toggle sits next to the currency selector.
                        </p>
                    </div>
                </section>

                {/* Live milestone tracker */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Target className="w-6 h-6 sm:w-7 sm:h-7 text-amber-700 dark:text-amber-400 shrink-0" />
                        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                            Milestone progress on a real schedule
                        </h2>
                    </div>
                    {data?.sample ? (
                        <>
                            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                                These are real numbers, not a mock-up: $50 a week bought every week for the last twelve
                                months against real Kraken prices. That is {data.sample.purchaseCount} purchases,{' '}
                                {fmtUsd(data.sample.totalInvested)} invested, and{' '}
                                {fmtBtc(data.sample.btcAccumulated)} accumulated
                                ({fmtInt(data.sample.btcAccumulated * 1e8)} sats).
                            </p>
                            <StackingGoalTracker
                                btcAccumulated={data.sample.btcAccumulated}
                                totalInvested={data.sample.totalInvested}
                                purchaseCount={data.sample.purchaseCount}
                                startDate={data.sample.startDate}
                                endDate={data.sample.endDate}
                                amount={50}
                                frequency="weekly"
                                unit="BTC"
                                /* Without this the component's own guard returns null
                                   and the time-to-goal projection — the entire reason
                                   this page exists, and the thing the paragraph below
                                   goes on to caveat — never renders at all. */
                                currentPrice={data.price}
                            />
                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                The time-to-goal estimate at the bottom of that card prices every future buy at
                                today&apos;s market, the same assumption as the table at the top of this page, so the
                                two agree. The fragile part is the assumption itself: holding the price flat makes the
                                date pure arithmetic, and the price will not stay flat. The card states that, along
                                with the fees it leaves out.
                            </p>
                        </>
                    ) : (
                        <Card className="p-6">
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                The live milestone tracker needs historical price data, which we could not load right now.
                                It is available on every result in the{' '}
                                <Link href="/" className="text-amber-700 dark:text-amber-400 hover:underline">main calculator</Link>.
                            </p>
                        </Card>
                    )}
                </section>

                {/* What actually changes the timeline */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        What actually moves the date
                    </h2>
                    <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Contribution size dominates everything.</strong>{' '}
                            Doubling the amount roughly halves the time. No frequency tweak, exchange choice or entry-timing
                            trick comes close to that effect.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Frequency barely matters.</strong> Over
                            multi-year periods, daily and weekly buying land within a rounding error of each other. Pick the
                            cadence that minimizes fees and admin for you.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Fees push the date out proportionally.</strong>{' '}
                            A 1.49% fee means 1.49% fewer sats on every buy, forever. On a ten-year plan that is roughly two
                            extra months.{' '}
                            <Link href="/calculators/exchange-fees" className="text-amber-700 dark:text-amber-400 hover:underline">
                                The fee comparison
                            </Link>{' '}
                            puts real numbers on it.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">The price path decides the rest,</strong> and
                            it cuts both ways. A long flat or falling market accumulates sats quickly and feels terrible,
                            because the stack you already hold is worth less while you do it. A fast rally does the opposite.
                            Anyone selling you certainty about which one is coming is selling something.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Only invest what you can leave alone.</strong>{' '}
                            Bitcoin has fallen more than 70% from its high on several occasions. A plan that survives that is
                            worth more than one that reaches a milestone faster on paper.
                        </p>
                    </div>
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
                        Put in your own amount, cadence and start date. The calculator backtests it against real historical
                        prices and shows the milestone tracker alongside fees, drawdowns and a full purchase table.
                    </p>
                    <Link
                        href="/?amount=50&frequency=weekly&fee=0"
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
                            <Link href="/calculators/bitcoin-cost-basis" className="block rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                Bitcoin cost basis calculator
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
                    Not financial advice. Every figure on this page is a straight-line estimate at the current market price,
                    provided for education. Past performance does not guarantee future results, bitcoin is volatile, and you
                    can lose money.
                </p>
            </div>
        </>
    );
}
