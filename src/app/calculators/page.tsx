import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Coins, Flame, Receipt, Scale, TrendingDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { getBitcoinPriceHistory, getCurrentBitcoinPrice } from '@/app/actions';
import { DAY_MS, EARLIEST_PRICE_TS, formatUtc } from '@/utils/dates';

// The coverage strip recomputes against fresh prices once a day.
export const revalidate = 86400;

const BASE_URL = 'https://btcdollarcostaverage.com';

// ── The tools ─────────────────────────────────────────────────────────────────

interface CalculatorEntry {
    slug: string;
    name: string;
    /** The question a person arrives with, phrased the way they'd ask it. */
    question: string;
    body: string;
    /** One honest limitation, stated up front rather than buried. */
    caveat: string;
    icon: LucideIcon;
}

const CALCULATORS: CalculatorEntry[] = [
    {
        slug: 'bitcoin-drawdown',
        name: 'Bitcoin Drawdown Calculator',
        question: 'How far did it fall from the top, and how long did getting back take?',
        body:
            'Every Bitcoin holder eventually watches their position drop. This measures the real ones: how deep each fall from a previous high went, how long the position stayed underwater, and what the worst stretch in your date range looked like.',
        caveat: 'Measured on one price per UTC day, so intraday spikes and wicks are not counted.',
        icon: TrendingDown,
    },
    {
        slug: 'bitcoin-fire',
        name: 'Bitcoin FIRE Calculator',
        question: 'How much Bitcoin would it take to cover what I spend?',
        body:
            'Pick your annual spending and the withdrawal rate you would trust, and this works backwards to the stack that supports it — plus how far the BTC you already hold gets you toward that number.',
        caveat: 'A withdrawal rate is an assumption, not a law. Bitcoin has never had a smooth return path.',
        icon: Flame,
    },
    {
        slug: 'stack-sats-goal',
        name: 'Stack Sats Goal Tracker',
        question: 'At my buy rate, when do I actually hit 0.1 BTC?',
        body:
            'Set a target in BTC or sats and how much you buy each week or month. You get a date, the total it costs to get there, and how the answer moves if the price runs or stalls along the way.',
        caveat: 'Future dates assume a price path. Nobody has one, so treat the date as a range.',
        icon: Coins,
    },
    {
        slug: 'exchange-fees',
        name: 'Exchange Fee Comparison',
        question: 'What is my exchange quietly costing me over years of buying?',
        body:
            'A 1.5% fee sounds small on a single $50 buy. Run it across a full DCA schedule and it becomes a specific number of dollars, and a specific amount of Bitcoin you never bought. This puts each major exchange side by side on the same schedule.',
        caveat: 'Trading fees only. Price spread, which is where several "zero fee" services earn, is not included.',
        icon: Receipt,
    },
    {
        slug: 'bitcoin-cost-basis',
        name: 'Bitcoin Cost Basis Calculator',
        question: 'What did I actually pay per coin across all my buying?',
        body:
            'Add each period you bought in — a 2021 run, a 2023 restart, a lump sum — and get one blended average cost, the BTC each lot holds, and where the whole position stands today.',
        caveat: 'A cost basis estimate, not tax reporting. Jurisdictions differ on lot accounting.',
        icon: Scale,
    },
];

// ── Real coverage figures (never invented; null when providers are down) ──────

interface Coverage {
    firstTs: number;
    lastTs: number;
    points: number;
    years: number;
    price: number | null;
}

async function loadCoverage(): Promise<Coverage | null> {
    try {
        const now = Date.now();
        const [history, price] = await Promise.all([
            getBitcoinPriceHistory(EARLIEST_PRICE_TS, now + DAY_MS, 'kraken'),
            getCurrentBitcoinPrice('kraken').catch(() => null),
        ]);
        if (!history || history.length === 0) return null;
        const firstTs = history[0][0];
        const lastTs = history[history.length - 1][0];
        if (!Number.isFinite(firstTs) || !Number.isFinite(lastTs) || lastTs <= firstTs) return null;
        return {
            firstTs,
            lastTs,
            points: history.length,
            years: Math.floor((lastTs - firstTs) / (DAY_MS * 365.25)),
            price: price !== null && Number.isFinite(price) && price > 0 ? price : null,
        };
    } catch (error) {
        // Never build-fail on a provider outage: the strip just doesn't render.
        console.error('[calculators] coverage load failed:', error);
        return null;
    }
}

// Server-rendered pages are USD-only by design; the live calculator handles currency.
function fmtUsd(value: number): string {
    return value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
}

// ── Metadata ──────────────────────────────────────────────────────────────────

const TITLE = 'Bitcoin Calculators: Drawdown, FIRE, Fees, Cost Basis, and Sat Goals';
const DESCRIPTION =
    'Five free Bitcoin calculators, each answering one question: how far a stack fell from its peak, how much BTC funds retirement, how long until your sat goal, what exchange fees really cost, and your blended cost basis. Real market history, no signup.';

export const metadata: Metadata = {
    // Root layout template appends "| Bitcoin DCA Calculator".
    title: TITLE,
    description: DESCRIPTION,
    alternates: {
        canonical: '/calculators',
    },
    openGraph: {
        title: TITLE,
        description: DESCRIPTION,
        type: 'website',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: TITLE,
        description: DESCRIPTION,
        creator: '@9drix9',
    },
};

// ── JSON-LD ───────────────────────────────────────────────────────────────────

const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
        { '@type': 'ListItem', position: 2, name: 'Calculators', item: `${BASE_URL}/calculators` },
    ],
};

const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Bitcoin calculators',
    description: 'Free Bitcoin calculators for drawdown, retirement, stacking goals, exchange fees, and cost basis.',
    numberOfItems: CALCULATORS.length,
    itemListElement: CALCULATORS.map((calc, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: calc.name,
        description: calc.question,
        url: `${BASE_URL}/calculators/${calc.slug}`,
    })),
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CalculatorsHubPage() {
    const coverage = await loadCoverage();

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
            />
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8 sm:space-y-12">

                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li>
                            <Link href="/" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                Home
                            </Link>
                        </li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Calculators</li>
                    </ol>
                </nav>

                {/* Hero */}
                <header className="space-y-3 sm:space-y-4 max-w-3xl">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white text-balance">
                        Bitcoin <span className="text-amber-700 dark:text-amber-400">Calculators</span>
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                        Five tools, each built around a single question people actually ask. They all run on the same
                        engine as the main DCA calculator and the same historical price data, so a number you see here
                        lines up with a number you see there. No account, no email, nothing saved on a server.
                    </p>
                </header>

                {/* Shared data footing — real figures only */}
                {coverage && (
                    <Card className="p-4 sm:p-5">
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            What they all run on
                        </p>
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Price history from</p>
                                <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                                    {formatUtc(coverage.firstTs, 'full')}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Through</p>
                                <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                                    {formatUtc(coverage.lastTs, 'full')}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Daily price points</p>
                                <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                                    {coverage.points.toLocaleString('en-US')}
                                    <span className="font-normal text-slate-500 dark:text-slate-400"> · {coverage.years} years</span>
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Latest price used</p>
                                <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                                    {coverage.price !== null ? fmtUsd(coverage.price) : '—'}
                                </p>
                            </div>
                        </div>
                        <p className="mt-3 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            Prices come from Kraken with Coinbase as a fallback, bucketed by UTC calendar day. These
                            figures refresh once a day; the live calculator uses the current price at the moment you
                            load it. Pre-2015 history and the rest of the assumptions are written out on the{' '}
                            <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                methodology page
                            </Link>.
                        </p>
                    </Card>
                )}

                {/* The grid */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Pick the question you came with
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                        {CALCULATORS.map(({ slug, name, question, body, caveat, icon: Icon }) => (
                            <Card key={slug} className="p-5 sm:p-6 flex flex-col hover:border-amber-500/50 transition-colors">
                                <div className="flex items-start gap-3">
                                    <span
                                        className="shrink-0 rounded-xl bg-amber-100 dark:bg-amber-500/15 p-2 text-amber-700 dark:text-amber-400"
                                        aria-hidden="true"
                                    >
                                        <Icon className="w-5 h-5" />
                                    </span>
                                    <div className="min-w-0">
                                        <h3 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                                            <Link href={`/calculators/${slug}`} className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                                {name}
                                            </Link>
                                        </h3>
                                        <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200 text-balance">
                                            &ldquo;{question}&rdquo;
                                        </p>
                                    </div>
                                </div>
                                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                    {body}
                                </p>
                                <p className="mt-3 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                    <span className="font-semibold text-slate-600 dark:text-slate-300">Worth knowing:</span>{' '}
                                    {caveat}
                                </p>
                                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                                    <Link
                                        href={`/calculators/${slug}`}
                                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                                    >
                                        Open {name.replace('Bitcoin ', '').toLowerCase()}
                                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                                    </Link>
                                </div>
                            </Card>
                        ))}
                    </div>
                </section>

                {/* Back to the main calculator */}
                <Card celebrated className="p-6 sm:p-10 text-center">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-3">
                        Start with the DCA calculator
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-5 max-w-xl mx-auto leading-relaxed">
                        Most of the tools above are more useful once you have a schedule in mind. The main calculator
                        takes any amount, cadence, date range, and fee, backtests it against the same historical prices,
                        and gives you the BTC accumulated, average cost, and annualized return to carry into the rest.
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                    >
                        Open the DCA calculator
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </Link>
                </Card>

                {/* How to read any of these */}
                <section className="space-y-3">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                        How to read the output
                    </h2>
                    <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                        <p>
                            Anything backward-looking here is a measurement. Buys are simulated on UTC calendar days
                            against real market prices, so &ldquo;what a schedule would have done&rdquo; is arithmetic
                            on history, not a forecast, and it is reproducible from the same inputs.
                        </p>
                        <p>
                            Anything forward-looking is arithmetic on an assumption you supplied. A growth rate or a
                            withdrawal rate produces a smooth path Bitcoin has never had. Real sequences arrive in the
                            wrong order: an 80% drawdown early does far more damage than the same drawdown late, and
                            no single number captures that. Change the assumption, watch the answer move, and take the
                            spread more seriously than any one result.
                        </p>
                        <p>
                            Fees and spread are modelled only where a tool says so, and taxes are not modelled anywhere.
                            The full list of what is and is not included lives on the{' '}
                            <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                methodology page
                            </Link>.
                        </p>
                    </div>
                </section>

                {/* Related */}
                <section className="space-y-3">
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Elsewhere on the site
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                        {[
                            { href: '/dca', label: 'Precomputed DCA scenarios', sub: '$10–$250 a week or month, since 2013' },
                            { href: '/methodology', label: 'Methodology', sub: 'Data sources, bucketing, known limits' },
                            { href: '/self-custody', label: 'Self-custody guide', sub: 'What to do with the BTC once you hold it' },
                        ].map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 hover:border-amber-500/50 transition-colors"
                            >
                                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">{link.label}</span>
                                <span className="block mt-0.5 text-xs text-slate-500 dark:text-slate-400">{link.sub}</span>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* Disclaimer */}
                <p className="border-t border-slate-200 dark:border-slate-800 pt-6 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Not financial advice. These calculators are educational simulations; past performance does not
                    guarantee future results. Bitcoin is volatile and you can lose money.
                </p>

            </div>
        </>
    );
}
