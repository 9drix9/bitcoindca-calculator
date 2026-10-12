import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Coins, Flame, Receipt, Scale, TrendingDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { getBitcoinPriceHistoryWithMeta, getBitcoinSpot } from '@/app/actions';
import { DAILY_PRICE_REVALIDATE } from '@/utils/revalidate';
import { expireRenderSoon } from '@/utils/isr';
import { DAY_MS, EARLIEST_PRICE_TS, formatUtc, utcFullYearsBetween } from '@/utils/dates';
import { countPriceKinds } from '@/utils/priceSeries';
import { FIRST_EXCHANGE_CLOSE_DATE, PRICE_PROVIDER_LABELS, type PriceProvider } from '@/data/priceSources';
import { feeExamplePair } from '@/data/exchangeFees';

// The coverage strip recomputes against fresh prices once a day.
export const revalidate = 86400;

const BASE_URL = 'https://btcdollarcostaverage.com';

// ── The tools ─────────────────────────────────────────────────────────────────

interface CalculatorEntry {
    slug: string;
    name: string;
    /** The question a person arrives with, phrased the way they'd ask it. */
    question: string;
    /** A function when the copy quotes a figure that has to be read when the page is rendered. */
    body: string | (() => string);
    /** One honest limitation, stated up front rather than buried. */
    caveat: string;
    icon: LucideIcon;
}

// Used only when the fee registry's example rows cannot be compared (see
// feeExamplePair): the card's arithmetic then runs on a plain round rate.
const FALLBACK_EXAMPLE_FEE_PERCENT = 1;

/**
 * The opening line of the fee-comparison card, on the rate that page builds its
 * own worked sentences on. Read from the fee registry at render time: typed in
 * here by hand, the card went on quoting a rate after the page it describes had
 * stopped listing it. Per $100, so the amount is exact at any rate.
 */
function feeIllustration(): string {
    const percent = feeExamplePair()?.higher.percent ?? FALLBACK_EXAMPLE_FEE_PERCENT;
    return `A ${percent}% fee is $${percent.toFixed(2).replace(/\.00$/, '')} on every $100 you buy.`;
}

const CALCULATORS: CalculatorEntry[] = [
    {
        slug: 'bitcoin-drawdown',
        name: 'Bitcoin Drawdown Calculator',
        question: 'How far did it fall from the top, and how long did getting back take?',
        body:
            'Every Bitcoin holder eventually watches their position drop. This measures the real ones: how deep each fall from a previous high went, and how long the position stayed underwater. It also flags the worst stretch in Bitcoin’s history, and lets you model spending your own stack down.',
        caveat: 'Measured on one price per UTC day, so intraday spikes and wicks are not counted.',
        icon: TrendingDown,
    },
    {
        slug: 'bitcoin-fire',
        name: 'Bitcoin FIRE Calculator',
        question: 'How much Bitcoin would it take to cover what I spend?',
        body:
            'Enter what you spend in a month and this works backwards, at the 4% rule, to the stack that would cover it. It starts from a DCA plan you pick, shows how far that plan’s stack gets toward the number, and explains why applying the rule to Bitcoin is contested.',
        caveat: 'A withdrawal rate is an assumption, not a law. Bitcoin has never had a smooth return path.',
        icon: Flame,
    },
    {
        slug: 'stack-sats-goal',
        name: 'Stack Sats Goal Calculator',
        question: 'At my buy rate, when do I actually hit 0.1 BTC?',
        // Describes the page as it is: a fixed table and a tracker on a sample
        // schedule. It has no target field, no amount field and no price
        // scenarios, and this card used to promise all three.
        body:
            'A table of how long 0.01, 0.1 and 1 BTC take at seven contribution rates, from $10 a week to $1,000 a month, with every future buy priced at the latest price. Below it, a milestone tracker runs a real $50-a-week schedule over the last twelve months of prices. A sat is one hundred-millionth of a bitcoin.',
        caveat: 'Every date assumes the price never moves, so read it as arithmetic, not a forecast. A higher price makes the date later and a lower one earlier. Exchange fees are not deducted.',
        icon: Coins,
    },
    {
        slug: 'exchange-fees',
        name: 'Exchange Fee Comparison',
        question: 'What is my exchange quietly costing me over years of buying?',
        body: () =>
            `${feeIllustration()} Run it across a five-year weekly schedule and it becomes a specific number of dollars, and a specific amount of Bitcoin you never bought. The page runs one schedule at several fee levels, then lists what each major platform says it charges on a recurring buy.`,
        // The rows are not one like-for-like fee, and the old caveat said the
        // opposite ("trading fees only, spread not counted") while most rows were spreads.
        caveat: 'Platforms price differently: some charge a fee, some only a spread, which is the gap between the price you are quoted and the market price. Each row says which. A cost a platform does not publish is not counted.',
        icon: Receipt,
    },
    {
        slug: 'bitcoin-cost-basis',
        name: 'Bitcoin Cost Basis Calculator',
        question: 'What did I actually pay per coin across all my buying?',
        body:
            'Add each period you bought in: a 2021 run, a 2023 restart, a lump sum. You get one blended average cost, the BTC held in each batch, and what the whole position is worth at the latest price.',
        caveat: 'A cost basis estimate, meaning what you paid per coin. This is not tax reporting, and jurisdictions differ on how purchases get matched to sales.',
        icon: Scale,
    },
];

// ── Real coverage figures (never invented; null when providers are down) ──────

interface Coverage {
    firstTs: number;
    lastTs: number;
    points: number;
    /** How many of those daily values are straight-line fills, not prices the source reported. */
    estimatedPoints: number;
    years: number;
    /** The exchange whose series this is. Not assumed: the price action can fall back to the other one. */
    provider: PriceProvider;
    /** The latest quote, with the exchange it came from and when. Null when neither exchange answered. */
    spot: { price: number; asOf: number; provider: PriceProvider } | null;
}

async function loadCoverage(): Promise<Coverage | null> {
    try {
        const now = Date.now();
        // No provider is named: this is the price action's default series, the
        // one the tools below run on unless their own page says otherwise.
        const [history, spot] = await Promise.all([
            getBitcoinPriceHistoryWithMeta(EARLIEST_PRICE_TS, now + DAY_MS, undefined, DAILY_PRICE_REVALIDATE),
            getBitcoinSpot(undefined, DAILY_PRICE_REVALIDATE),
        ]);
        const firstTs = history.data.length > 0 ? history.data[0][0] : NaN;
        const lastTs = history.data.length > 0 ? history.data[history.data.length - 1][0] : NaN;
        if (!Number.isFinite(firstTs) || !Number.isFinite(lastTs) || lastTs <= firstTs) {
            // A series that came back unusable without an error: still a page
            // rendered without its figures, so it must not be kept for 24 hours.
            await expireRenderSoon();
            return null;
        }
        return {
            firstTs,
            lastTs,
            points: history.data.length,
            estimatedPoints: countPriceKinds(history.kinds).estimated,
            years: utcFullYearsBetween(firstTs, lastTs),
            provider: history.servedProvider,
            spot: spot ? { price: spot.price, asOf: spot.asOf, provider: spot.provider } : null,
        };
    } catch (error) {
        // Never build-fail on a provider outage: the strip just doesn't render.
        // A strip-less page is complete in every other way, so it is published,
        // but only for a few minutes (utils/isr), not the usual 24 hours.
        console.error('[calculators] coverage load failed:', error);
        await expireRenderSoon();
        return null;
    }
}

/**
 * How many of the daily prices in the strip a source actually reported, and
 * how many are straight-line fills. Counted from the series' own markers, not
 * inferred from which exchange answered: Kraken's weekly series is mostly
 * fills, and Coinbase's daily one can carry a filled-in day too.
 */
function reportedWords({ points, estimatedPoints }: Pick<Coverage, 'points' | 'estimatedPoints'>): string {
    const total = points.toLocaleString('en-US');
    if (estimatedPoints <= 0) {
        return `All ${total} daily prices counted here are ones those sources reported. None is an estimate.`;
    }
    const estimated = estimatedPoints.toLocaleString('en-US');
    const reported = (points - estimatedPoints).toLocaleString('en-US');
    return `${reported} of the ${total} daily prices counted here are ones those sources reported. The other ${estimated} ${estimatedPoints === 1 ? 'is an estimate' : 'are estimates'}, filled in along a straight line between two reported prices.`;
}

/** "Oct 12, 2026 at 04:50 UTC". Every date on the site is a UTC date. */
function fmtUtcMoment(ts: number): string {
    return `${formatUtc(ts, 'full')} at ${new Date(ts).toISOString().slice(11, 16)} UTC`;
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

const TITLE = 'Bitcoin Calculators: Drawdown, FIRE, Fees, Cost Basis, Sat Goals';
const DESCRIPTION =
    'Five free Bitcoin calculators, each answering one question: how far a stack fell from its peak, how much BTC funds retirement, how long until your sat goal, what exchange fees really cost, and your blended cost basis. Real market history, no signup.';

export const metadata: Metadata = {
    // `absolute` opts out of the root layout's "| Bitcoin DCA Calculator" suffix.
    // With it the title ran to 93 characters and search results cut the list of
    // tools short; on its own the list fits.
    title: { absolute: TITLE },
    description: DESCRIPTION,
    alternates: {
        canonical: '/calculators',
    },
    openGraph: {
        images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
        title: TITLE,
        description: DESCRIPTION,
        type: 'website',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        images: ['/opengraph-image'],
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

// A breadcrumb link is one or two short words, about 15px tall as text on a
// phone. The padding makes it a 44px touch target, and the negative margins
// hand the same space back so the row sits exactly where it did.
const crumbLink =
    'inline-flex min-h-11 items-center -my-3.5 px-1.5 -mx-1.5 hover:text-amber-700 dark:hover:text-amber-400 transition-colors';

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
                            <Link href="/" className={crumbLink}>
                                Home
                            </Link>
                        </li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Calculators</li>
                    </ol>
                </nav>

                {/* Hero */}
                <header className="space-y-3 sm:space-y-4 max-w-3xl">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white text-balance">
                        Bitcoin <span className="text-amber-700 dark:text-amber-400">Calculators</span>
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                        Five tools, each built around a single question people actually ask. Dollar-cost averaging, or
                        DCA, means buying a fixed amount on a fixed schedule. All five run on the same engine as the
                        main DCA calculator, and each page says which price series its figures use. No account, no
                        email, nothing saved on a server.
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
                                <p className="text-xs text-slate-500 dark:text-slate-400">Daily prices</p>
                                <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                                    {coverage.points.toLocaleString('en-US')}
                                    <span className="font-normal text-slate-500 dark:text-slate-400"> · {coverage.years} years</span>
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {coverage.spot ? `Price on ${formatUtc(coverage.spot.asOf, 'monthDay')}` : 'Latest price'}
                                </p>
                                <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                                    {coverage.spot ? fmtUsd(coverage.spot.price) : '—'}
                                </p>
                            </div>
                        </div>
                        <p className="mt-3 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            Each day gets one price, bucketed by the UTC calendar day:{' '}
                            {coverage.provider === 'kraken'
                                ? `Kraken's weekly closes from ${formatUtc(FIRST_EXCHANGE_CLOSE_DATE, 'full')}, with the days in between filled in along a straight line`
                                : `Coinbase's daily close from ${formatUtc(FIRST_EXCHANGE_CLOSE_DATE, 'full')}`}
                            , and blockchain.info&apos;s daily average market price before that.{' '}
                            {reportedWords(coverage)}
                            {coverage.provider === 'kraken'
                                ? ' Coinbase, the usual source, could not be reached when this page was last rebuilt.'
                                : ' When Coinbase cannot be reached, the tools fall back to Kraken, whose public history is weekly, and the page affected says so.'}
                            {coverage.spot
                                ? ` The price shown is the ${PRICE_PROVIDER_LABELS[coverage.spot.provider].name} price on ${fmtUtcMoment(coverage.spot.asOf)}.`
                                : ''}{' '}
                            These figures are recalculated about once a day. The main calculator fetches a current
                            price when you load it. The rest of the assumptions are written out on the{' '}
                            <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                methodology page
                            </Link>.
                        </p>
                    </Card>
                )}

                {/* The grid */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
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
                                        <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                                            {/* The title alone is a 20px-tall target. min-h-11 makes it
                                                44px, and the negative margins give the height back. */}
                                            <Link
                                                href={`/calculators/${slug}`}
                                                className="inline-flex min-h-11 items-center -my-2.5 sm:-my-2 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                                            >
                                                {name}
                                            </Link>
                                        </h3>
                                        <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200 text-balance">
                                            &ldquo;{question}&rdquo;
                                        </p>
                                    </div>
                                </div>
                                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                    {typeof body === 'function' ? body() : body}
                                </p>
                                <p className="mt-3 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                    <span className="font-semibold text-slate-600 dark:text-slate-300">Worth knowing:</span>{' '}
                                    {caveat}
                                </p>
                                <div className="mt-4 pt-1 border-t border-slate-100 dark:border-slate-800">
                                    {/* min-h-11: the link text alone is a 20px-tall target. */}
                                    <Link
                                        href={`/calculators/${slug}`}
                                        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                                    >
                                        Open the {name.replace('Bitcoin ', '')}
                                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                                    </Link>
                                </div>
                            </Card>
                        ))}
                    </div>
                </section>

                {/* Back to the main calculator */}
                <Card celebrated className="p-6 sm:p-10 text-center">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
                        Start with the DCA calculator
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-5 max-w-xl mx-auto leading-relaxed">
                        Most of the tools above are more useful once you have a schedule in mind. Give the main
                        calculator an amount, a cadence, a date range, and a fee. It runs that schedule against the
                        same historical prices and reports the BTC accumulated, your average cost, and the annualized
                        return. Carry those into the rest.
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
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        How to read the output
                    </h2>
                    <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                        <p>
                            Anything backward-looking here is a measurement. The tools simulate your buys on UTC
                            calendar days against real market prices. So &ldquo;what a schedule would have done&rdquo;
                            is arithmetic on history, not a forecast. Run it again with the same inputs and you get the
                            same answer.
                        </p>
                        <p>
                            Anything forward-looking is arithmetic on an assumption you supplied. A growth rate or a
                            withdrawal rate produces a smooth path Bitcoin has never had. Real sequences arrive in the
                            wrong order. A drawdown is a fall from a previous high, and an 80% one early does far more
                            damage than the same fall late. No single number captures that. Change the assumption,
                            watch the answer move, and take the range of answers more seriously than any one result.
                        </p>
                        <p>
                            Fees and spread are modeled only where a tool says so. Taxes are not modeled anywhere.
                            The full list of what is and is not included lives on the{' '}
                            <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                methodology page
                            </Link>.
                        </p>
                    </div>
                </section>

                {/* Related */}
                <section className="space-y-3">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
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
                                className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 hover:border-amber-500/50 transition-colors"
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
