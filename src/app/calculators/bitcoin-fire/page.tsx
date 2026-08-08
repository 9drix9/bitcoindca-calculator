import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { Card } from '@/components/ui/Card';
import { FireCalculator } from '@/components/FireCalculator';
import { getBitcoinPriceHistory, getCurrentBitcoinPrice } from '@/app/actions';
import { calculateDca } from '@/utils/dca';
import { DAY_MS, EARLIEST_PRICE_TS, formatUtc } from '@/utils/dates';
import type { Frequency } from '@/types';

const BASE_URL = 'https://btcdollarcostaverage.com';
const PATH = '/calculators/bitcoin-fire';

// Reads the DCA plan out of the query string so a visitor can model their own
// schedule without JavaScript, which makes the route dynamic. Price fetches are
// server-cached, so each render hits a warm cache and uses fresh prices.

type PageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const WITHDRAWAL_RATE = 0.04; // the 4% rule, matching the widget below
const BASELINE_MONTHLY_SPEND = 4000; // USD, matching the widget's default

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

// ── Plan parsing (everything sanitised, nothing trusted) ───────────────────────

const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'biweekly', 'monthly'];
const FREQUENCY_LABEL: Record<Frequency, string> = {
    daily: 'every day',
    weekly: 'every week',
    biweekly: 'every two weeks',
    monthly: 'every month',
};
const BUYS_PER_YEAR: Record<Frequency, number> = {
    daily: 365,
    weekly: 52,
    biweekly: 26,
    monthly: 12,
};

const FIRST_YEAR = 2013;
const CURRENT_YEAR = new Date().getUTCFullYear();
const YEARS: number[] = Array.from(
    { length: Math.max(1, CURRENT_YEAR - FIRST_YEAR + 1) },
    (_, i) => FIRST_YEAR + i,
);

interface Plan {
    amount: number;
    frequency: Frequency;
    year: number;
    startTs: number;
}

const firstParam = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;

function parsePlan(params: Record<string, string | string[] | undefined>): Plan {
    const rawAmount = Number((firstParam(params.amount) ?? '').replace(/[,\s$]/g, ''));
    const amount = Number.isFinite(rawAmount) && rawAmount > 0
        ? Math.round(Math.min(rawAmount, 100_000) * 100) / 100
        : 100;

    const rawFreq = firstParam(params.frequency);
    const frequency: Frequency = FREQUENCIES.includes(rawFreq as Frequency)
        ? (rawFreq as Frequency)
        : 'weekly';

    const rawYear = Number(firstParam(params.start));
    const year = Number.isInteger(rawYear) && YEARS.includes(rawYear) ? rawYear : 2020;

    return {
        amount,
        frequency,
        year,
        startTs: Math.max(Date.UTC(year, 0, 1), EARLIEST_PRICE_TS),
    };
}

// ── Server data ───────────────────────────────────────────────────────────────

interface Cagr {
    years: number;
    percent: number;
    fromPrice: number;
    fromTs: number;
}

interface PageData {
    currentPrice: number;
    totalInvested: number;
    btcAccumulated: number;
    currentValue: number;
    roi: number;
    xirrPercent: number | null;
    maxDrawdownPercent: number;
    purchases: number;
    annualContribution: number;
    fireNumber: number;
    progressPercent: number;
    btcNeeded: number;
    cagrs: Cagr[];
}

/** Last known close at or before `ts`. */
function priceAtOrBefore(series: [number, number][], ts: number): number | null {
    let found: number | null = null;
    for (const [t, p] of series) {
        if (t > ts) break;
        if (Number.isFinite(p) && p > 0) found = p;
    }
    return found;
}

async function loadData(plan: Plan): Promise<PageData | null> {
    try {
        const now = Date.now();
        const [history, livePrice] = await Promise.all([
            getBitcoinPriceHistory(EARLIEST_PRICE_TS, now + DAY_MS, 'kraken'),
            getCurrentBitcoinPrice('kraken').catch(() => null),
        ]);
        if (!history || history.length < 100) return null;

        const currentPrice = livePrice ?? history[history.length - 1][1];
        if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

        const result = calculateDca(
            {
                amount: plan.amount,
                frequency: plan.frequency,
                startDate: new Date(plan.startTs),
                endDate: new Date(now),
                feePercentage: 0,
                priceMode: 'api',
                manualPrice: 0,
            },
            history,
            currentPrice,
        );
        if (result.totalInvested <= 0 || result.btcAccumulated <= 0 || !Number.isFinite(result.currentValue)) {
            return null;
        }

        const fireNumber = (BASELINE_MONTHLY_SPEND * 12) / WITHDRAWAL_RATE;

        // Trailing compound annual growth rates of the BTC price itself. Descriptive,
        // not predictive — the caveat is stated next to the table.
        const cagrs: Cagr[] = [];
        for (const years of [3, 5, 10]) {
            const fromTs = now - years * 365.25 * DAY_MS;
            if (fromTs < history[0][0]) continue;
            const fromPrice = priceAtOrBefore(history, fromTs);
            if (fromPrice === null || fromPrice <= 0) continue;
            const percent = (Math.pow(currentPrice / fromPrice, 1 / years) - 1) * 100;
            if (!Number.isFinite(percent)) continue;
            cagrs.push({ years, percent, fromPrice, fromTs });
        }

        return {
            currentPrice,
            totalInvested: result.totalInvested,
            btcAccumulated: result.btcAccumulated,
            currentValue: result.currentValue,
            roi: result.roi,
            xirrPercent: result.stats?.xirrPercent ?? null,
            maxDrawdownPercent: result.stats?.maxDrawdownPercent ?? 0,
            purchases: result.breakdown.length,
            annualContribution: plan.amount * BUYS_PER_YEAR[plan.frequency],
            fireNumber,
            progressPercent: fireNumber > 0 ? (result.currentValue / fireNumber) * 100 : 0,
            btcNeeded: fireNumber / currentPrice,
            cagrs,
        };
    } catch (error) {
        // Never build-fail or 500 on a provider outage.
        console.error('[calculators/bitcoin-fire] data load failed:', error);
        return null;
    }
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
    const plan = parsePlan(await searchParams);
    const title = 'Bitcoin FIRE Calculator';
    let description =
        'Work out how far a Bitcoin DCA plan is from financial independence: your FIRE number on the 4% rule, ' +
        'how long the stack takes to get there under different growth assumptions, and why applying an equities rule to Bitcoin is contested.';

    try {
        const data = await loadData(plan);
        if (data) {
            description =
                `Buying $${plan.amount} of Bitcoin ${FREQUENCY_LABEL[plan.frequency]} since ${plan.year} totals ` +
                `${fmtUsd(data.totalInvested)} invested and ${fmtBtc(data.btcAccumulated)}, worth ${fmtUsd(data.currentValue)} today. ` +
                `See how that compares to a ${fmtUsd(data.fireNumber)} FIRE number on the 4% rule, and why that rule is contested for Bitcoin.`;
        }
    } catch {
        // Keep the generic description.
    }

    return {
        title,
        description,
        keywords: [
            'bitcoin fire calculator',
            'bitcoin retirement calculator',
            'how much bitcoin to retire',
            'bitcoin safe withdrawal rate',
            '4% rule bitcoin',
            'financial independence bitcoin',
        ],
        alternates: { canonical: PATH },
        openGraph: {
            title,
            description,
            url: PATH,
            type: 'article',
            siteName: 'Bitcoin DCA Calculator',
            locale: 'en_US',
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            creator: '@9drix9',
        },
    };
}

// ── Small presentational helpers ──────────────────────────────────────────────

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
        <Card celebrated={celebrated} className="p-4 sm:p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
            <p className={clsx('mt-1 text-2xl sm:text-3xl font-bold tracking-tight', valueClassName ?? 'text-slate-900 dark:text-white')}>
                {value}
            </p>
            {sub && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
        </Card>
    );
}

const proseLink = 'text-amber-700 dark:text-amber-400 hover:underline font-medium';
const selectClass =
    'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-base tabular-nums text-slate-800 outline-none ' +
    'transition-shadow focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40 ' +
    'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:text-sm';
const fieldLabelClass = 'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400';

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BitcoinFirePage({ searchParams }: PageProps) {
    const params = await searchParams;
    const plan = parsePlan(params);
    const data = await loadData(plan);

    const pageUrl = `${BASE_URL}${PATH}`;
    const planLabel = `$${plan.amount} ${FREQUENCY_LABEL[plan.frequency]} since ${plan.year}`;

    const breadcrumbJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
            { '@type': 'ListItem', position: 2, name: 'Calculators', item: `${BASE_URL}/calculators` },
            { '@type': 'ListItem', position: 3, name: 'Bitcoin FIRE Calculator', item: pageUrl },
        ],
    };

    const faqs: { q: string; a: string }[] = [
        {
            q: 'What is a safe withdrawal rate, and where does the 4% rule come from?',
            a:
                'A safe withdrawal rate is the share of a portfolio you can take in the first year of retirement, then adjust for inflation each year after, ' +
                'without running out over some planning horizon. The 4% figure comes from William Bengen\'s 1994 study and the 1998 Trinity Study, both of which ' +
                'tested rolling 30-year retirements against US stock and bond returns from 1926 onward. A portfolio holding roughly half to three quarters equities ' +
                'survived every historical 30-year window at a 4% initial withdrawal. That is the entire basis of the number: one country, one century, a diversified ' +
                'portfolio, a 30-year horizon, and no taxes or fees in the model.',
        },
        {
            q: 'Does the 4% rule work for Bitcoin?',
            a:
                'There is no evidence that it does, and good reason to think it does not transfer. The rule was calibrated on a diversified portfolio whose worst ' +
                'historical drawdown was roughly half, and it still failed in stress tests outside the US. Bitcoin is a single asset with no cash flows, roughly fifteen ' +
                'years of price history, and repeated declines of 70% or more. Withdrawal-rate research depends on having enough independent historical windows to say ' +
                'anything about failure probability, and Bitcoin does not have them. This calculator uses 4% because it is the yardstick everyone recognises, not because ' +
                'it has been validated for a volatile single asset. Many people planning around Bitcoin use a materially lower rate, or hold several years of spending ' +
                'in something that is not Bitcoin.',
        },
        {
            q: 'How much Bitcoin do I need to retire?',
            a: data
                ? `On the 4% rule the target is 25 times your annual spending. At today's price of ${fmtUsd(data.currentPrice)}, spending $40,000 a year implies a ` +
                  `$1,000,000 target, or about ${fmtBtc(1_000_000 / data.currentPrice)}. Spending $80,000 a year implies $2,000,000, or about ` +
                  `${fmtBtc(2_000_000 / data.currentPrice)}. Those coin counts move every time the price does, which is precisely the problem with denominating a ` +
                  'retirement target in a volatile asset: the same stack can look sufficient and insufficient within the same year.'
                : 'On the 4% rule the target is 25 times your annual spending, converted to BTC at whatever the price is. Because the price moves so much, the same ' +
                  'stack can look sufficient and insufficient within the same year, which is the core difficulty with denominating a retirement target in Bitcoin.',
        },
        {
            q: 'What is sequence-of-returns risk?',
            a:
                'It is the risk that the order of returns ruins you even when the average is fine. Two retirees can experience identical average annual returns over ' +
                'thirty years and end up in completely different places: the one who meets a deep decline in the first few years is forced to sell far more units to ' +
                'fund the same spending, and those units are gone before any recovery. Accumulating investors get the mirror image, where an early decline is a gift. ' +
                'This is the single largest reason a smooth constant-growth projection like the one on this page is optimistic, because a constant growth rate has no ' +
                'sequence at all.',
        },
        {
            q: 'What growth rate should I assume for Bitcoin?',
            a: data && data.cagrs.length > 0
                ? 'Nobody knows, and any single number you pick will dominate the result. For reference, the trailing compound annual growth rate of the Bitcoin price ' +
                  `on this page's data is ${data.cagrs.map((c) => `${fmtPct(c.percent, true)} over ${c.years} years`).join(', ')}. Trailing CAGR is extremely sensitive ` +
                  'to the start date and is a description of the past, not a forecast. Growth rates for an asset this young also have no reason to stay stable: a return ' +
                  'that compounds at a high rate indefinitely implies a market capitalisation that eventually exceeds everything else in existence, which is why the ' +
                  'sensible use of this tool is to compare scenarios rather than to trust one.'
                : 'Nobody knows, and the assumption dominates the result. Trailing growth rates describe the past and are extremely sensitive to the start date. ' +
                  'Use the tool to compare scenarios rather than to trust any single one.',
        },
        {
            q: 'Is this projection a prediction of when I will retire?',
            a:
                'No. It is arithmetic on assumptions you supply. It compounds a constant growth rate, assumes you keep contributing at the same rate without ' +
                'interruption, ignores taxes, exchange fees and spreads, ignores the possibility of a permanent loss, and reports a single path rather than a ' +
                'probability. Read the gap between the conservative and aggressive columns as the honest message: the answer is not a date, it is a very wide range ' +
                'that depends on something unknowable.',
        },
    ];

    const faqJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
            />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8 sm:space-y-10">

                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li><Link href="/" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">Home</Link></li>
                        <li aria-hidden="true">/</li>
                        <li><Link href="/calculators" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">Calculators</Link></li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Bitcoin FIRE</li>
                    </ol>
                </nav>

                {/* Heading + lead */}
                <header className="space-y-3">
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white text-balance">
                        Bitcoin FIRE calculator
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                        FIRE stands for financial independence, retire early: the point where a portfolio can fund your
                        living costs without a salary. This page starts from a real Bitcoin DCA plan, computes what it
                        would have accumulated at historical prices, and projects how far it is from covering your
                        spending. It also explains, at length, why that projection deserves more scepticism than most
                        retirement maths.
                    </p>
                </header>

                {/* Plan picker */}
                <Card className="p-4 sm:p-5">
                    <form method="get" action={PATH} className="space-y-3">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                            Start from a real DCA plan
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label htmlFor="fire-amount" className={fieldLabelClass}>Amount per buy (USD)</label>
                                <input
                                    id="fire-amount"
                                    name="amount"
                                    type="number"
                                    inputMode="decimal"
                                    min={1}
                                    max={100000}
                                    step={1}
                                    defaultValue={plan.amount}
                                    className={selectClass}
                                />
                            </div>
                            <div>
                                <label htmlFor="fire-frequency" className={fieldLabelClass}>How often</label>
                                <select id="fire-frequency" name="frequency" defaultValue={plan.frequency} className={selectClass}>
                                    {FREQUENCIES.map((f) => (
                                        <option key={f} value={f}>
                                            {f.charAt(0).toUpperCase() + f.slice(1)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="fire-start" className={fieldLabelClass}>Started buying in</label>
                                <select id="fire-start" name="start" defaultValue={plan.year} className={selectClass}>
                                    {YEARS.map((y) => (
                                        <option key={y} value={y}>January {y}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <button
                            type="submit"
                            className="h-10 rounded-lg bg-amber-600 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-700"
                        >
                            Recalculate the plan
                        </button>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            The stack below is backtested against real historical prices from January 1 of the year you pick
                            through today, with no fees applied. Nothing here is a made-up starting balance.
                        </p>
                    </form>
                </Card>

                {data ? (
                    <>
                        {/* Where the plan stands */}
                        <section className="space-y-4">
                            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                                What {planLabel} built
                            </h2>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                                <StatCard
                                    label="Total invested"
                                    value={fmtUsd(data.totalInvested)}
                                    sub={`${data.purchases} purchases`}
                                />
                                <StatCard
                                    label="Stack today"
                                    value={fmtUsd(data.currentValue)}
                                    sub={fmtBtc(data.btcAccumulated)}
                                    celebrated
                                />
                                <StatCard
                                    label="Return"
                                    value={fmtPct(data.roi, true)}
                                    sub={data.xirrPercent != null ? `${fmtPct(data.xirrPercent, true)} annualized` : 'Period too short to annualize'}
                                    valueClassName={
                                        data.roi >= 0
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : 'text-rose-600 dark:text-rose-400'
                                    }
                                />
                                <StatCard
                                    label="Worst drawdown"
                                    value={`−${fmtPct(data.maxDrawdownPercent)}`}
                                    sub="Peak-to-trough, portfolio value"
                                />
                            </div>
                            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                At a spending baseline of {fmtUsd(BASELINE_MONTHLY_SPEND)} a month, the 4% rule puts the
                                target at <strong className="font-semibold text-slate-900 dark:text-white">{fmtUsd(data.fireNumber)}</strong>{' '}
                                &mdash; about {fmtBtc(data.btcNeeded)} at today&apos;s price of {fmtUsd(data.currentPrice)}. This plan is{' '}
                                <strong className="font-semibold text-slate-900 dark:text-white">{fmtPct(Math.min(data.progressPercent, 100))}</strong>{' '}
                                of the way there, while contributing {fmtUsd(data.annualContribution)} a year. Change the
                                spending figure in the tool below and every number moves with it.
                            </p>
                        </section>

                        {/* Safe withdrawal rate explainer */}
                        <section className="space-y-3">
                            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                                What a safe withdrawal rate is, and where 4% came from
                            </h2>
                            <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                <p>
                                    A safe withdrawal rate answers one question: what percentage of a portfolio can you spend
                                    in year one, raising it with inflation every year after, without the portfolio running dry
                                    before you do? Multiply the reciprocal by your annual spending and you get a FIRE number.
                                    At 4%, that reciprocal is 25, which is why the shorthand is &ldquo;25 times your annual
                                    expenses&rdquo;.
                                </p>
                                <p>
                                    The 4% figure is not a law of finance. It is an empirical result from William
                                    Bengen&apos;s 1994 paper and the 1998 Trinity Study, both of which ran rolling 30-year
                                    retirements over US stock and bond returns going back to 1926. A portfolio holding
                                    roughly 50&ndash;75% equities survived every one of those historical windows at a 4%
                                    initial withdrawal. Everything about that sentence is a constraint: one country, one
                                    century, a diversified portfolio, a 30-year horizon, no taxes, and no fees.
                                </p>
                                <p>
                                    Those constraints matter even for the asset class it was derived from. Apply the same
                                    method to non-US markets and the safe rate drops. Extend the horizon past 30 years and it
                                    drops again. The 4% rule is best understood as a planning heuristic that happened to work
                                    on a specific, unusually fortunate slice of history.
                                </p>
                            </div>
                        </section>

                        {/* Why Bitcoin breaks it */}
                        <section className="space-y-3">
                            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                                Why applying it to Bitcoin is contested
                            </h2>
                            <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                <p>
                                    Withdrawal-rate research works by counting failures across many independent historical
                                    windows. That requires a long record. Bitcoin has traded for roughly fifteen years, which
                                    does not contain a single complete 30-year retirement, let alone enough of them to
                                    estimate a failure rate. Any confidence interval you have seen attached to a Bitcoin
                                    withdrawal rate was produced by a model, not by history.
                                </p>
                                <p>
                                    The asset also behaves nothing like the portfolio the rule was fitted to. A 50/75 equity
                                    portfolio&apos;s worst historical drawdown was roughly half. Bitcoin has fallen more than
                                    70% from a high several times, and those declines are the ordinary behaviour of the asset
                                    rather than a crisis exception. Bitcoin produces no earnings, dividends or coupons, so
                                    there is no cash flow to fund withdrawals: every withdrawal is a sale of principal.
                                    See the{' '}
                                    <Link href="/calculators/bitcoin-drawdown" className={proseLink}>drawdown history</Link>{' '}
                                    for the full record.
                                </p>
                                <p>
                                    Concentration compounds the problem. The 4% rule assumes diversification is doing work in
                                    the background: when equities fall, bonds and rebalancing cushion the withdrawals. A
                                    single-asset portfolio has no cushion, so a withdrawal during a decline sells the only
                                    thing you own at the worst possible price. This is why people planning around Bitcoin
                                    commonly use a lower rate than 4%, hold several years of spending outside Bitcoin, or
                                    stay flexible about how much they withdraw in bad years. None of those is advice; they
                                    are simply the adjustments the underlying maths points at.
                                </p>
                            </div>
                        </section>

                        {/* Sequence risk */}
                        <section className="space-y-3">
                            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                                Sequence-of-returns risk, in plain terms
                            </h2>
                            <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                <p>
                                    While you are accumulating, the order of returns barely matters and a crash is arguably
                                    good news: your contributions buy more. The moment you start withdrawing, order becomes
                                    the dominant variable. Two people can retire with the same amount and experience the same
                                    average annual return over thirty years, and one runs out while the other dies rich. The
                                    only difference is when the bad years arrived.
                                </p>
                                <p>
                                    The mechanism is simple. If you need a fixed amount of money each month and the price has
                                    fallen 70%, you must sell more than three times as many coins to raise it. Those coins are
                                    permanently gone, so they are not there for the recovery. A decline in the first five years
                                    of withdrawals does structural damage that a decline in the last five years does not.
                                </p>
                                <p>
                                    The projection below has no sequence risk at all, because a constant growth rate has no
                                    sequence. That is the single biggest reason to treat its answer as a best case rather than
                                    an expectation. If you want to see the same problem from the spending side, the{' '}
                                    <Link href="/calculators/bitcoin-drawdown" className={proseLink}>stack drawdown planner</Link>{' '}
                                    shows how quickly a withdrawal schedule eats a stack under bear assumptions.
                                </p>
                            </div>
                        </section>

                        {/* The tool */}
                        <section className="space-y-4">
                            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                                Project the years to financial independence
                            </h2>
                            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                Enter what you actually spend in a month. The tool converts that to a FIRE number at 4%, shows
                                how much of it the stack above already covers, and projects how many years of continued
                                contributions it takes to close the gap under three growth assumptions.
                            </p>
                            <FireCalculator
                                btcAccumulated={data.btcAccumulated}
                                totalInvested={data.totalInvested}
                                livePrice={data.currentPrice}
                                amount={plan.amount}
                                frequency={plan.frequency}
                            />
                        </section>

                        {/* Trailing CAGR */}
                        {data.cagrs.length > 0 && (
                            <section className="space-y-3">
                                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                                    What growth rate is even plausible?
                                </h2>
                                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                    The growth assumption dominates the answer, so it is worth seeing what the price has
                                    actually done. These are trailing compound annual growth rates computed from the same
                                    price series the calculator uses.
                                </p>
                                <Card className="p-4 sm:p-6">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs sm:text-sm tabular-nums">
                                            <thead>
                                                <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                                    <th scope="col" className="py-2 pr-4 font-medium">Window</th>
                                                    <th scope="col" className="py-2 pr-4 font-medium text-right">Price then</th>
                                                    <th scope="col" className="py-2 pr-4 font-medium text-right">Price now</th>
                                                    <th scope="col" className="py-2 font-medium text-right">Annualized</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-slate-700 dark:text-slate-300">
                                                {data.cagrs.map((c) => (
                                                    <tr key={c.years} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                                                        <td className="py-2 pr-4 font-medium text-slate-800 dark:text-slate-100">
                                                            Last {c.years} years
                                                            <span className="block text-slate-500 dark:text-slate-400 font-normal">
                                                                from {formatUtc(c.fromTs, 'monthYear')}
                                                            </span>
                                                        </td>
                                                        <td className="py-2 pr-4 text-right">{fmtUsd(c.fromPrice)}</td>
                                                        <td className="py-2 pr-4 text-right">{fmtUsd(data.currentPrice)}</td>
                                                        <td className={clsx(
                                                            'py-2 text-right font-semibold',
                                                            c.percent >= 0
                                                                ? 'text-emerald-600 dark:text-emerald-400'
                                                                : 'text-rose-600 dark:text-rose-400',
                                                        )}>
                                                            {fmtPct(c.percent, true)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                        Trailing CAGR is a description of the past and swings wildly with the start date: a
                                        window that begins near a cycle bottom looks spectacular and one that begins near a
                                        top looks dismal, for the same asset. It is not a forecast, and it is not what the
                                        next decade will do.
                                    </p>
                                </Card>
                                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                    There is also an arithmetic ceiling worth keeping in mind. A rate that compounds at 50% a
                                    year for long enough implies a market value larger than every asset on earth combined, so
                                    the aggressive scenario cannot persist indefinitely no matter what you believe about
                                    Bitcoin. The realistic use of this tool is comparison: see how many years separate the
                                    conservative and aggressive answers, and treat that spread as the real output.
                                </p>
                            </section>
                        )}

                        {/* What it leaves out */}
                        <section className="space-y-3">
                            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                                What this projection is not
                            </h2>
                            <ul className="space-y-2 ml-1 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                <li className="flex items-start gap-2">
                                    <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                    <span><strong className="text-slate-800 dark:text-slate-100">Not a probability.</strong> It returns one number per assumption, with no failure rate attached. Real withdrawal research reports success percentages precisely because a single path tells you nothing about risk.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                    <span><strong className="text-slate-800 dark:text-slate-100">No volatility path.</strong> Growth is applied smoothly once a year. There are no drawdowns in the projection, so there is no sequence risk in it either.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                    <span><strong className="text-slate-800 dark:text-slate-100">No taxes or fees.</strong> Capital gains on every sale, exchange fees, spreads and withdrawal costs are all excluded, and in a real drawdown phase they are not small.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                    <span><strong className="text-slate-800 dark:text-slate-100">Assumes you never stop.</strong> Contributions continue at the same rate every year until the target is hit, through every job loss and every 70% decline.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                    <span><strong className="text-slate-800 dark:text-slate-100">Assumes the asset survives.</strong> The model has no term for permanent loss, custody failure, or a regime where Bitcoin simply does not recover.</span>
                                </li>
                            </ul>
                            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                The <Link href="/methodology" className={proseLink}>methodology page</Link> documents the data
                                sources, the exact DCA maths behind the backtested stack, and every limitation we know about.
                            </p>
                        </section>
                    </>
                ) : (
                    <Card className="p-6 sm:p-8">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                            <div className="space-y-2">
                                <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                                    Price data is temporarily unavailable
                                </h2>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                    We could not load Bitcoin prices to backtest this plan right now, and this page will not
                                    show a projection built on an invented starting balance. Try the{' '}
                                    <Link href="/" className={proseLink}>main calculator</Link>, which falls back across
                                    several providers, or reload in a minute.
                                </p>
                            </div>
                        </div>
                    </Card>
                )}

                {/* FAQ */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Common questions about Bitcoin and FIRE
                    </h2>
                    <div className="space-y-3">
                        {faqs.map((f) => (
                            <Card key={f.q} className="p-4 sm:p-5">
                                <h3 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-100">{f.q}</h3>
                                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{f.a}</p>
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
                        The full calculator backtests any schedule, cadence, fee level and date range you like, and carries
                        the same FIRE projection alongside the rest of the results.
                    </p>
                    <Link
                        href={`/?amount=${plan.amount}&frequency=${plan.frequency}&startDate=${plan.year}-01-01&fee=0`}
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                    >
                        Open the calculator with this plan
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </Card>

                {/* Related */}
                <section className="space-y-3">
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Keep going
                    </h2>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm">
                        <li>
                            <Link href="/calculators" className="block rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                All Bitcoin calculators
                            </Link>
                        </li>
                        <li>
                            <Link href="/calculators/bitcoin-drawdown" className="block rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                Bitcoin drawdown calculator
                            </Link>
                        </li>
                        <li>
                            <Link href="/dca" className="block rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                Historical DCA scenarios
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
                    Not financial advice. This page is an educational projection built on assumptions you choose, not a
                    retirement plan and not a promise of returns. Past performance does not guarantee future results,
                    Bitcoin is volatile, and you can lose money.
                </p>

            </div>
        </>
    );
}
