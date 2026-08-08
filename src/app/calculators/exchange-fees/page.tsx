import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Receipt } from 'lucide-react';
import clsx from 'clsx';
import { Card } from '@/components/ui/Card';
import { ExchangeFeeComparison } from '@/components/ExchangeFeeComparison';
import { getBitcoinPriceHistory, getCurrentBitcoinPrice } from '@/app/actions';
import { calculateDca } from '@/utils/dca';
import { DAY_MS, EARLIEST_PRICE_TS, formatUtc, utcDayStart } from '@/utils/dates';

// Recomputed once a day against fresh prices.
export const revalidate = 86400;

const BASE_URL = 'https://btcdollarcostaverage.com';
const PAGE_PATH = '/calculators/exchange-fees';

export const metadata: Metadata = {
    title: 'Bitcoin Exchange Fee Calculator — What DCA Fees Really Cost',
    description:
        'Compare Bitcoin exchange fees across a real five-year DCA schedule: how much bitcoin a 0.1%, 0.26%, 0.99%, 1.49% or 2.2% fee costs you, the difference between a fee and a spread, and what to check before you commit to an exchange.',
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
        title: 'Bitcoin Exchange Fee Calculator — What DCA Fees Really Cost',
        description:
            'What a 0.1% vs 1.49% fee costs across a real five-year DCA schedule, plus the spread nobody itemises.',
        url: PAGE_PATH,
        type: 'article',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Bitcoin Exchange Fee Calculator — What DCA Fees Really Cost',
        description:
            'What a 0.1% vs 1.49% fee costs across a real five-year DCA schedule, plus the spread nobody itemises.',
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

// ── Data ───────────────────────────────────────────────────────────────────────

// The rates modelled on the site, quoted as percentages only. Rate tiers are
// deliberately unlabelled here: exchanges change published fees and we do not
// rank them. The comparison widget lower down names which exchange sits where.
const FEE_RATES = [0, 0.1, 0.26, 0.99, 1.49, 2.2];

const SAMPLE_AMOUNT = 50;
const SAMPLE_YEARS = 5;

interface FeeRow {
    rate: number;
    feesPaid: number;
    btcAccumulated: number;
    currentValue: number;
    /** Value shortfall against the same schedule paying no fee at all. */
    valueVsZero: number;
    satsVsZero: number;
}

interface PageData {
    price: number;
    startDateIso: string;
    purchaseCount: number;
    totalInvested: number;
    rows: FeeRow[];
}

async function loadData(): Promise<PageData | null> {
    try {
        const nowTs = utcDayStart(Date.now());
        const anchor = new Date(nowTs);
        const startTs = Math.max(
            EARLIEST_PRICE_TS,
            Date.UTC(anchor.getUTCFullYear() - SAMPLE_YEARS, anchor.getUTCMonth(), anchor.getUTCDate()),
        );

        const [history, livePrice] = await Promise.all([
            getBitcoinPriceHistory(startTs, nowTs + DAY_MS, 'kraken'),
            getCurrentBitcoinPrice('kraken').catch(() => null),
        ]);
        if (!history || history.length === 0) return null;

        const price = livePrice && livePrice > 0 ? livePrice : history[history.length - 1][1];
        if (!price || price <= 0) return null;

        const results = FEE_RATES.map((rate) =>
            calculateDca(
                {
                    amount: SAMPLE_AMOUNT,
                    frequency: 'weekly',
                    startDate: new Date(startTs),
                    endDate: new Date(nowTs),
                    feePercentage: rate,
                    priceMode: 'api',
                    manualPrice: 0,
                },
                history,
                price,
            ),
        );

        const zero = results[0];
        if (!zero || zero.totalInvested <= 0 || !Number.isFinite(zero.currentValue)) return null;

        const rows: FeeRow[] = results.map((result, i) => ({
            rate: FEE_RATES[i],
            feesPaid: result.stats?.feesPaid ?? 0,
            btcAccumulated: result.btcAccumulated,
            currentValue: result.currentValue,
            valueVsZero: zero.currentValue - result.currentValue,
            satsVsZero: (zero.btcAccumulated - result.btcAccumulated) * 1e8,
        }));

        return {
            price,
            startDateIso: formatUtc(startTs, 'isoDay'),
            purchaseCount: zero.breakdown.length,
            totalInvested: zero.totalInvested,
            rows,
        };
    } catch (error) {
        // Never build-fail on a provider outage: the page renders an honest fallback.
        console.error('[calculators/exchange-fees] data load failed:', error);
        return null;
    }
}

// ── Page ───────────────────────────────────────────────────────────────────────

const CHECKLIST: { title: string; body: string }[] = [
    {
        title: 'Trading fee vs. instant-buy fee',
        body: 'Many exchanges run two products on one platform: a spot order book with maker/taker fees measured in basis points, and a one-click "buy" or "convert" button that charges several times more. The cheap number on the fee page is usually the order book. Placing a limit order on the order book is often the single biggest saving available to a retail buyer.',
    },
    {
        title: 'The spread on the quoted price',
        body: 'Compare the price you are quoted against the mid price on a large spot market at the same moment. The gap is a fee whether or not anyone calls it one. Zero-fee brokers have to earn revenue somewhere, and the spread is the usual place.',
    },
    {
        title: 'Deposit and funding costs',
        body: 'Bank transfers (ACH, SEPA, Faster Payments) are commonly free or close to it. Debit and credit card funding is frequently 3-4% and is charged before the trading fee. If your fiat rail costs more than your trade, optimising the trade is beside the point.',
    },
    {
        title: 'Withdrawal fee for moving to self-custody',
        body: 'On-chain withdrawal is normally a flat fee in bitcoin, not a percentage, so it punishes small frequent withdrawals and is nearly irrelevant on large ones. Some platforms pass through the network fee at cost; others charge a fixed amount well above it. Check whether the platform lets you withdraw to your own address at all.',
    },
    {
        title: 'Recurring-buy terms specifically',
        body: 'Recurring buys sometimes get a different fee schedule than manual ones, in either direction. Since the whole point of DCA is that the recurring buy is the only order you ever place, that is the number that matters to you.',
    },
    {
        title: 'Currency conversion',
        body: 'If you fund in one currency and the pair is quoted in another, there is an FX conversion in the middle with its own margin. Buying a BTC pair quoted in your own currency avoids paying two spreads.',
    },
];

export default async function ExchangeFeesPage() {
    const data = await loadData();

    const highRow = data?.rows.find((r) => r.rate === 1.49);
    const lowRow = data?.rows.find((r) => r.rate === 0.26);
    const worstRow = data?.rows[data.rows.length - 1];

    const faqs: { question: string; answer: string }[] = [
        {
            question: 'How much do Bitcoin exchange fees actually cost over a DCA plan?',
            answer:
                data && highRow
                    ? `On a real schedule of $${SAMPLE_AMOUNT} a week for ${SAMPLE_YEARS} years — ${data.purchaseCount} purchases and ${fmtUsd(data.totalInvested)} invested — a 1.49% fee costs ${fmtUsd(highRow.feesPaid)} in fees and leaves you ${fmtInt(highRow.satsVsZero)} sats short of the same schedule with no fee, worth ${fmtUsd(highRow.valueVsZero)} at today's price. A 0.26% fee costs ${lowRow ? fmtUsd(lowRow.feesPaid) : 'roughly a sixth of that'}.`
                    : `A percentage fee removes that percentage of bitcoin from every single purchase, so after hundreds of buys you own that same percentage less bitcoin than you otherwise would. On a five-year weekly schedule the difference between a 0.26% fee and a 1.49% fee is normally a few hundred dollars of missing bitcoin.`,
        },
        {
            question: 'What is the difference between a fee and a spread?',
            answer:
                'A fee is an explicit charge that appears on your receipt: 1.49% of the order, itemised. A spread is the gap between the price the exchange quotes you and the real mid-market price at that moment. It is never itemised, it is not reported as a fee, and it can easily exceed the fee it replaces. "Zero fee" almost always means "the cost has been moved into the spread", because a business that quotes a price and takes the other side has to make money somewhere. The only way to measure it is to compare the quote you were given against a large spot market at the same second.',
        },
        {
            question: 'Does a 1.49% fee compound?',
            answer:
                'Not against itself — the fee is a flat percentage of each buy, so after 260 buys you still hold about 1.49% less bitcoin, not 1.49% compounded 260 times. What compounds is the value of the bitcoin you did not get. That missing bitcoin rides the same price as the rest of your stack, so the shortfall grows in fiat terms exactly as fast as your portfolio does. A fee is best understood as permanently owning a slightly smaller slice, not as a one-off cost.',
        },
        {
            question: 'Is the cheapest exchange always the right choice?',
            answer:
                'No, and this page does not recommend one. Fees are one input among several: whether you can withdraw to your own wallet, how the platform is regulated in your jurisdiction, its custody and security record, whether it publishes reserve attestations, its history of outages during volatile periods, and whether it supports your bank. A platform charging 0.1% that you cannot withdraw from is more expensive than one charging 1% that you can.',
        },
        {
            question: 'Should I buy less often to save on fees?',
            answer:
                'Only if your exchange charges a flat fee per order rather than a percentage. Percentage fees are scale-invariant: twelve monthly buys of $200 and fifty-two weekly buys of about $46 pay the same total. Where flat minimums apply, batching into larger, less frequent purchases genuinely helps. Historically the return difference between daily, weekly and monthly cadences over multi-year periods is very small, so fee structure is a more sensible reason to pick a cadence than market timing.',
        },
        {
            question: 'Are the rates on this page current?',
            answer:
                'The comparison table quotes published rates last verified in July 2026, and exchanges change them without much notice. Treat them as a starting point and check the exchange\'s own fee page before committing. Tiered maker/taker schedules also mean your actual rate depends on your 30-day volume, so a headline rate may not be the one you pay.',
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
                        <li><Link href="/" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">Home</Link></li>
                        <li aria-hidden="true">/</li>
                        <li><Link href="/calculators" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">Calculators</Link></li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Exchange fees</li>
                    </ol>
                </nav>

                {/* Header */}
                <header className="space-y-4">
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white text-balance">
                        What Bitcoin exchange fees really cost a DCA plan
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                        {data && highRow ? (
                            <>
                                A single 1.49% fee is easy to ignore. Paid {data.purchaseCount} times it is not. The table
                                below runs the same schedule &mdash; ${SAMPLE_AMOUNT} a week since {formatUtc(data.startDateIso, 'full')},{' '}
                                {fmtUsd(data.totalInvested)} invested &mdash; against real Kraken prices at six different fee
                                rates. At 1.49% you end up {fmtInt(highRow.satsVsZero)} sats short of the zero-fee version,
                                worth <strong className="font-semibold text-slate-900 dark:text-white">{fmtUsd(highRow.valueVsZero)}</strong> today.
                            </>
                        ) : (
                            <>
                                A single 1.49% fee is easy to ignore. Paid a few hundred times it is not. This page compares
                                fee rates across a real five-year DCA schedule, explains the difference between an explicit
                                fee and a spread, and lists what to check before committing to an exchange.
                            </>
                        )}
                    </p>
                </header>

                {/* Fee impact table */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                        The same schedule at six fee rates
                    </h2>
                    {data ? (
                        <>
                            <Card className="p-4 sm:p-6">
                                <div className="overflow-x-auto -mx-4 sm:mx-0">
                                    <table className="w-full min-w-[560px] text-xs sm:text-sm tabular-nums">
                                        <thead>
                                            <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                                <th scope="col" className="px-3 sm:px-4 py-2 font-medium whitespace-nowrap">Fee rate</th>
                                                <th scope="col" className="px-3 sm:px-4 py-2 font-medium text-right whitespace-nowrap">Fees paid</th>
                                                <th scope="col" className="px-3 sm:px-4 py-2 font-medium text-right whitespace-nowrap">BTC ended with</th>
                                                <th scope="col" className="px-3 sm:px-4 py-2 font-medium text-right whitespace-nowrap">Value today</th>
                                                <th scope="col" className="px-3 sm:px-4 py-2 font-medium text-right whitespace-nowrap">Sats given up</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-slate-700 dark:text-slate-300">
                                            {data.rows.map((row) => (
                                                <tr key={row.rate} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                                                    <td className={clsx(
                                                        'px-3 sm:px-4 py-2 font-medium whitespace-nowrap',
                                                        row.rate === 0
                                                            ? 'text-emerald-700 dark:text-emerald-400'
                                                            : 'text-slate-800 dark:text-slate-100',
                                                    )}>
                                                        {row.rate}%
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap">{fmtUsd(row.feesPaid)}</td>
                                                    <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap">{fmtBtc(row.btcAccumulated)}</td>
                                                    <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap">{fmtUsd(row.currentValue)}</td>
                                                    <td className={clsx(
                                                        'px-3 sm:px-4 py-2 text-right whitespace-nowrap',
                                                        row.rate === 0 ? 'text-slate-400 dark:text-slate-500' : 'text-rose-600 dark:text-rose-400',
                                                    )}>
                                                        {row.rate === 0 ? '—' : `${fmtInt(row.satsVsZero)} (${fmtUsd(row.valueVsZero)})`}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                    ${SAMPLE_AMOUNT} bought every week from {formatUtc(data.startDateIso, 'full')} to today,
                                    priced against Kraken history and valued at the live price of {fmtUsd(data.price)}. The
                                    fee is taken off each purchase before conversion, which is how exchanges charge it. Every
                                    row invests the identical {fmtUsd(data.totalInvested)}; only the bitcoin that reaches your
                                    account differs.
                                </p>
                            </Card>

                            {highRow && lowRow && (
                                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                                    Read the last column as the real price of the fee. Choosing a 1.49% platform over a 0.26%
                                    one across this window cost{' '}
                                    <strong className="font-semibold text-slate-900 dark:text-white">
                                        {fmtUsd(highRow.valueVsZero - lowRow.valueVsZero)}
                                    </strong>{' '}
                                    of bitcoin &mdash; on a plan where you never had to time anything or take on extra risk to
                                    save it.{worstRow && worstRow.rate > 1.49 ? ` At the top rate modelled here, ${worstRow.rate}%, the gap against zero widens to ${fmtUsd(worstRow.valueVsZero)}.` : ''}
                                </p>
                            )}
                        </>
                    ) : (
                        <Card className="p-6 sm:p-8">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                                <div className="space-y-2">
                                    <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                                        Price data is temporarily unavailable
                                    </h3>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                        We could not load historical prices to run the fee comparison. The{' '}
                                        <Link href="/" className="text-amber-700 dark:text-amber-400 hover:underline">main calculator</Link>{' '}
                                        has a fee input and falls back across several providers, so it will usually still work.
                                    </p>
                                </div>
                            </div>
                        </Card>
                    )}
                </section>

                {/* Fee vs spread */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                        A fee and a spread are not the same thing
                    </h2>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">An explicit fee</strong> is a line item.
                            You send $50, the platform takes 1.49%, and $49.26 buys bitcoin at the market price. It shows up
                            on your receipt, in your tax records, and in every comparison table on the internet.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">A spread</strong> is the difference between
                            the price the platform quotes you and the price the market is actually trading at. If the mid
                            price is $100,000 and the app offers to sell you bitcoin at $100,900, you paid 0.9% &mdash; and
                            nothing anywhere will call it a fee. Your receipt will say $50 in, $50 of bitcoin out, zero fees,
                            and it will be technically accurate.
                        </p>
                        <p>
                            This is why &ldquo;0% fees&rdquo; deserves a follow-up question rather than applause. A platform
                            that quotes you a price and takes the other side of your trade needs revenue; if it is not in the
                            fee, it is in the spread. Some genuinely low-spread services do exist, and some zero-fee
                            offerings are real promotions with a stated end date. The point is not that zero-fee is a lie, it
                            is that the fee number alone cannot tell you which situation you are in.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">How to measure it yourself:</strong> at the
                            moment you buy, note the price you were quoted, then check the BTC/USD price on a large spot
                            exchange. The percentage gap is your spread. Do it two or three times, at different times of day,
                            and you will have a better estimate of your true all-in cost than any comparison table can give
                            you &mdash; including this one.
                        </p>
                    </div>
                </section>

                {/* Why it hurts over hundreds of buys */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Why a small percentage matters across hundreds of buys
                    </h2>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            Be precise about the mechanism, because the loose version of this claim is wrong. A percentage
                            fee does <em>not</em> compound against itself: paying 1.49% on 260 separate purchases leaves you
                            with about 1.49% less bitcoin, not 1.49% raised to the 260th power. Anyone telling you the fee
                            eats a third of your stack is selling something.
                        </p>
                        <p>
                            What compounds is the <em>value</em> of the bitcoin you never received. That missing slice tracks
                            the same price as everything else you own, so if your stack goes up tenfold, so does the shortfall.
                            A fee is not a one-time cost you absorb and move past; it is a permanent reduction in the fraction
                            of the supply you hold, and it is priced by the market forever after.
                        </p>
                        <p>
                            There is a second, blunter way to frame it. A 1.49% fee is roughly one and a half months of
                            contributions out of every hundred months of the plan. Over a decade of weekly buying, that is
                            about two months of your money buying nothing.
                        </p>
                        <p>
                            The reason this is worth a page of your attention is that fees are one of the very few inputs to a
                            DCA plan you fully control. You cannot control the price, the drawdowns, or the timing. You can
                            control the rate you pay to convert, and it costs you nothing but an afternoon of reading fee
                            schedules.
                        </p>
                    </div>
                </section>

                {/* Live comparison widget */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Receipt className="w-6 h-6 sm:w-7 sm:h-7 text-amber-700 dark:text-amber-400 shrink-0" />
                        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                            Published rates by exchange
                        </h2>
                    </div>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        Applied to the same {data ? fmtUsd(data.totalInvested) : 'total'} across{' '}
                        {data ? data.purchaseCount : 'several hundred'} purchases. This is a factual list of published
                        rates, not a ranking or a recommendation, and it deliberately excludes spread &mdash; which, per the
                        section above, is where the 0% rows earn their money.
                    </p>
                    {data ? (
                        <ExchangeFeeComparison totalInvested={data.totalInvested} purchaseCount={data.purchaseCount} />
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
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                        What to check on any exchange
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        The headline trading fee is usually the smallest of the numbers below. Work through all six before
                        you decide anything.
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
                        Exchange names appear here only because their published rates are the ones the calculator models.
                    </p>
                </section>

                {/* FAQ */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
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
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-3">
                        Run your own numbers
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-5 max-w-xl mx-auto">
                        Put your own amount, cadence, dates and fee percentage into the calculator. It backtests the whole
                        schedule against real historical prices and itemises exactly what the fee cost you.
                    </p>
                    <Link
                        href={`/?amount=${SAMPLE_AMOUNT}&frequency=weekly&fee=1.49`}
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                    >
                        Open the calculator
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </Card>

                {/* Related */}
                <section className="space-y-3">
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Related
                    </h2>
                    <ul className="grid sm:grid-cols-2 gap-2 text-sm">
                        <li>
                            <Link href="/calculators" className="block rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                All calculators
                            </Link>
                        </li>
                        <li>
                            <Link href="/calculators/stack-sats-goal" className="block rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                How long to stack 1 bitcoin
                            </Link>
                        </li>
                        <li>
                            <Link href="/calculators/bitcoin-cost-basis" className="block rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                Bitcoin cost basis calculator
                            </Link>
                        </li>
                        <li>
                            <Link href="/methodology" className="block rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                Methodology &amp; data sources
                            </Link>
                        </li>
                    </ul>
                </section>

                {/* Disclaimer */}
                <p className="border-t border-slate-200 dark:border-slate-800 pt-6 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Not financial advice, and not a recommendation of any exchange. Fee rates change; verify them on the
                    provider&apos;s own fee page before you act. The figures above are a historical simulation for education
                    &mdash; past performance does not guarantee future results, bitcoin is volatile, and you can lose money.
                </p>
            </div>
        </>
    );
}
