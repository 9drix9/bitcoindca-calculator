import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, ClipboardCheck, Eye, Minus, ThumbsUp, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';

/**
 * Every claim about dcabtc.com on this page was observed in a real browser on
 * this date. Re-verify before editing the observations: if dcaBTC has shipped
 * a new price table, the "what we found" section below must be rewritten, not
 * merely re-dated.
 *
 * The $NaN is date-sensitive even if dcaBTC changes nothing. It appears only
 * for plans with a purchase inside the gap in the page's built-in price table
 * (12 September to 12 October 2024), and the "N years ago" presets slide past
 * that gap as time passes: the default 3-year plan stops crossing it in
 * October 2027. Re-run the plans, do not assume.
 */
const LAST_CHECKED = '12 October 2026';
const LAST_CHECKED_ISO = '2026-10-12';
/** The page went live with the 11 August 2026 check. Only dateModified moves. */
const FIRST_PUBLISHED_ISO = '2026-08-11';

const BASE_URL = 'https://btcdollarcostaverage.com';

const TITLE = 'dcaBTC Alternative: a Bitcoin DCA Calculator That Shows Its Work';
const DESCRIPTION =
    'We loaded dcabtc.com in October 2026, wrote down exactly what we saw, and mapped each dcaBTC setting onto this free, open-source calculator.';

export const metadata: Metadata = {
    // TITLE already says "Bitcoin DCA Calculator", so it opts out of the root
    // layout's "%s | Bitcoin DCA Calculator" template instead of repeating it.
    title: { absolute: TITLE },
    description: DESCRIPTION,
    keywords: [
        'dcabtc alternative',
        'dcabtc.com alternative',
        'dcabtc not working',
        'sites like dcabtc',
        'bitcoin dca calculator',
        'dca btc backtest',
    ],
    alternates: {
        canonical: '/alternatives/dcabtc',
    },
    openGraph: {
        images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
        title: TITLE,
        description: DESCRIPTION,
        url: '/alternatives/dcabtc',
        type: 'article',
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
        { '@type': 'ListItem', position: 2, name: 'Alternatives', item: `${BASE_URL}/alternatives` },
        { '@type': 'ListItem', position: 3, name: 'dcaBTC Alternative', item: `${BASE_URL}/alternatives/dcabtc` },
    ],
};

const webPageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${BASE_URL}/alternatives/dcabtc#webpage`,
    url: `${BASE_URL}/alternatives/dcabtc`,
    name: TITLE,
    description: DESCRIPTION,
    isPartOf: { '@id': `${BASE_URL}/#website` },
    datePublished: FIRST_PUBLISHED_ISO,
    dateModified: LAST_CHECKED_ISO,
    inLanguage: 'en-US',
};

// ── Side-by-side table ────────────────────────────────────────────────────────

type MarkKind = 'yes' | 'no' | 'na';

interface CompareRow {
    feature: string;
    /** What we observed on dcabtc.com on LAST_CHECKED. */
    dcabtc: { mark?: MarkKind; text?: string };
    /** What this site does. */
    us: { mark?: MarkKind; text?: string };
}

const COMPARE: CompareRow[] = [
    {
        feature: 'Buy frequencies',
        dcabtc: { text: 'Daily, weekly, every two weeks, monthly' },
        us: { text: 'Daily, weekly, bi-weekly, monthly' },
    },
    {
        feature: 'Date range',
        dcabtc: { text: '6 months to 9 years back, or a specific start date from 17 Jul 2010' },
        us: { text: 'Any start and end date from 18 Aug 2010' },
    },
    {
        feature: 'Price data',
        dcabtc: { text: 'A fixed table inside the page: 17 Jul 2010 to 3 May 2025, with a one-month gap' },
        // Ours is part stored table too: SNAPSHOT_END_DATE in data/priceSources
        // is the last day of the bundled blockchain.info copy.
        us: { text: 'A stored table to 19 Jul 2015, then exchange prices fetched up to today' },
    },
    {
        feature: `Results rendering (checked ${LAST_CHECKED})`,
        dcabtc: { mark: 'na', text: 'Default plan showed $NaN; plans outside the gap showed numbers' },
        us: { mark: 'yes' },
    },
    {
        feature: 'Exchange fees modeled',
        dcabtc: { mark: 'no', text: 'Not that we found' },
        us: { mark: 'yes', text: 'Custom %, plus a flat fee per buy' },
    },
    {
        feature: 'Annualized return (XIRR)',
        dcabtc: { mark: 'no' },
        us: { mark: 'yes' },
    },
    {
        feature: 'Max drawdown',
        dcabtc: { mark: 'no' },
        us: { mark: 'yes' },
    },
    {
        feature: 'DCA vs lump sum',
        dcabtc: { mark: 'no' },
        us: { mark: 'yes' },
    },
    {
        feature: 'Benchmarks',
        // dcaBTC's stylesheet hides the toggle below 768px, which is most phones.
        dcabtc: { mark: 'yes', text: 'Gold and the Dow Jones, via a toggle shown on screens 768px and wider' },
        us: { text: 'S&P 500 total return, gold, CPI, savings' },
    },
    {
        feature: 'Transaction history + CSV export',
        dcabtc: { mark: 'no', text: 'Not that we found' },
        us: { mark: 'yes' },
    },
    {
        feature: 'Sharing',
        dcabtc: { text: 'Direct link + prefilled tweet' },
        us: { text: 'Link + share-card image' },
    },
    {
        feature: 'Embeddable widget',
        dcabtc: { mark: 'no' },
        us: { mark: 'yes', text: 'Free, on any site' },
    },
    {
        feature: 'Open source',
        dcabtc: { mark: 'no', text: 'Not that we found' },
        us: { text: 'MIT, on GitHub' },
    },
    {
        feature: 'Data sources documented',
        dcabtc: { mark: 'no' },
        us: { mark: 'yes', text: 'Methodology page' },
    },
    {
        feature: 'Price / account',
        dcabtc: { text: 'Free, no account' },
        us: { text: 'Free, no account' },
    },
];

/** dcaBTC control → where the same thing lives here. */
const MIGRATION: { theirs: string; ours: string }[] = [
    { theirs: 'Purchase Amount', ours: 'Investment amount — same idea, any number.' },
    { theirs: 'Repeat Purchase (daily / weekly / every two weeks / monthly)', ours: 'Frequency — the same four options, same names give or take "bi-weekly".' },
    { theirs: 'Accumulate For + Starting', ours: 'A start date and an end date. Pick the same window; an end date in the future shows what the plan would add up to at today’s price.' },
    { theirs: 'Compare to other assets?', ours: 'Built into the results: gold, the S&P 500 (total return) where dcaBTC uses the Dow Jones, plus inflation-adjusted and savings-account comparisons.' },
    { theirs: 'Copy Direct Link', ours: 'Share button — the URL carries your exact settings, plus an image card for social.' },
];

// A breadcrumb link is one short word, about 15px tall as text on a phone. The
// padding makes it a 44px touch target, and the negative margins hand the same
// space back so the row sits exactly where it did.
const crumbLink =
    'inline-flex min-h-11 items-center -my-3.5 px-1.5 -mx-1.5 hover:text-amber-700 dark:hover:text-amber-400 transition-colors';
// Links inside a sentence are underlined: colour alone does not mark a link.
const textLink =
    'text-amber-700 dark:text-amber-400 underline underline-offset-2 hover:text-amber-800 dark:hover:text-amber-300 font-medium';

function Mark({ kind }: { kind: MarkKind }) {
    if (kind === 'yes') {
        return (
            <span className="inline-flex items-center justify-center">
                <Check className="w-4 h-4 text-green-600 dark:text-green-400" aria-hidden="true" />
                <span className="sr-only">Yes</span>
            </span>
        );
    }
    if (kind === 'no') {
        return (
            <span className="inline-flex items-center justify-center">
                <X className="w-4 h-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                <span className="sr-only">Not found</span>
            </span>
        );
    }
    return (
        <span className="inline-flex items-center justify-center">
            <Minus className="w-4 h-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <span className="sr-only">Depends on the plan</span>
        </span>
    );
}

function CellContent({ cell }: { cell: { mark?: MarkKind; text?: string } }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            {cell.mark && <Mark kind={cell.mark} />}
            {cell.text && <span>{cell.text}</span>}
        </span>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DcaBtcAlternativePage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
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
                        <li>
                            <Link href="/alternatives" className={crumbLink}>
                                Alternatives
                            </Link>
                        </li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">dcaBTC</li>
                    </ol>
                </nav>

                {/* Hero */}
                <header className="space-y-3 sm:space-y-4">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white text-balance">
                        Looking for a <span className="text-amber-700 dark:text-amber-400">dcaBTC alternative</span>?
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
                        dcaBTC deserves real credit: it is a clean, single-purpose Bitcoin DCA backtester, and its
                        guides are genuinely good. This page is not here to mock it. It exists because when we checked
                        dcabtc.com on {LAST_CHECKED} its default plan showed $NaN where the result should be, and
                        people searching for an alternative deserve a straight, dated account of what we saw and what
                        this site does differently.
                    </p>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                        By{' '}
                        <Link href="/author" className={textLink}>
                            drix
                        </Link>
                        {' '}&middot; Last checked {LAST_CHECKED}
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors"
                    >
                        Try this calculator instead
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </Link>
                </header>

                {/* What we observed */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        What we found when we checked
                    </h2>
                    <Card className="p-5 sm:p-6">
                        <div className="flex items-start gap-3">
                            <Eye className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" aria-hidden="true" />
                            <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                <p>
                                    On <strong className="text-slate-800 dark:text-slate-200">{LAST_CHECKED}</strong> we loaded
                                    dcabtc.com in an ordinary browser. The page and its inputs worked normally. On the default
                                    scenario ($10 weekly for 3 years), &quot;Total Invested&quot; correctly showed $1,570 — but
                                    &quot;Total Value&quot; rendered as <strong className="text-slate-800 dark:text-slate-200">&quot;$NaN&quot;</strong> with
                                    &quot;NaN Satoshis&quot;, and &quot;Percent Change&quot; showed &quot;NaN.undefined%&quot;.
                                    The prefilled tweet read &quot;…would have turned $1,570 into $NaN (-NaN%)&quot;.
                                </p>
                                <p>
                                    That pattern — invested amount fine, value broken — is not a price feed that has gone down.
                                    dcaBTC makes no price request while you use it: its Bitcoin history is a fixed table inside
                                    the page&apos;s own code. On {LAST_CHECKED} that table ran from 17 July 2010 to 3 May 2025
                                    and had no prices for 12 September to 12 October 2024. Every plan we tried with a purchase
                                    inside that month showed $NaN: the default scenario, our five-year test, and a six-month
                                    plan from June 2024 that ends well before the table does.
                                </p>
                                <p>
                                    Plans that avoid the gap do show numbers. $10 a week for two years from 12 October 2021
                                    showed $1,050 invested and $1,062 of value, up 1.22%. But every day after 3 May 2025 is
                                    priced at the 3 May 2025 value, so a plan that starts later than that shows a value equal
                                    to the amount invested and a 0.00% change, whatever Bitcoin actually did. The preset for
                                    one year, starting one year ago, did exactly that.
                                </p>
                                <p>
                                    So this is not an outage that clears on its own: the gap and the cut-off stay until dcaBTC
                                    ships a new table. Which plans hit the gap does change with the date, because
                                    &quot;starting 3 years ago&quot; moves forward every day. We date every observation for
                                    exactly that reason. If dcaBTC is working when you visit it,{' '}
                                    <Link href="/contact" className={textLink}>tell us</Link>{' '}
                                    and we&apos;ll update this page — confirmed corrections jump the queue under our{' '}
                                    <Link href="/author#corrections-policy" className={textLink}>corrections policy</Link>.
                                </p>
                            </div>
                        </div>
                    </Card>
                </section>

                {/* What dcaBTC does well */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        What dcaBTC gets right
                    </h2>
                    <Card className="p-5 sm:p-6">
                        <div className="flex items-start gap-3">
                            <ThumbsUp className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" aria-hidden="true" />
                            <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                <p>
                                    Its interface is one of the cleanest in the niche: a handful of controls, no clutter, and defaults
                                    phrased the way people actually think (&quot;$10 weekly for 3 years&quot;). Its long-form
                                    explanations of what DCA is and why it suits volatile assets are better written than most,
                                    and its one-click direct link carries your exact settings, which makes comparing scenarios
                                    with someone else easy.
                                </p>
                                <p>
                                    If all you want is a quick &quot;what would $X a week have done&quot; for a window its
                                    price table covers, dcaBTC puts an answer on one screen. The comparison below is for
                                    people who want that answer for any dates up to today, plus the parts it leaves out: fees,
                                    risk metrics, more benchmarks, and a way to check the math.
                                </p>
                            </div>
                        </div>
                    </Card>
                </section>

                {/* Side by side */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        Side by side
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        Everything in the dcaBTC column is what we observed on {LAST_CHECKED}. An{' '}
                        <X className="inline w-3.5 h-3.5 text-slate-400 dark:text-slate-500" aria-label="x mark" /> means we
                        could not find the feature, not proof it doesn&apos;t exist; a{' '}
                        <Minus className="inline w-3.5 h-3.5 text-slate-400 dark:text-slate-500" aria-label="dash" /> means it
                        depended on the plan, as described above.
                    </p>
                    <Card className="p-4 sm:p-6">
                        {/* `relative` keeps the sr-only "Yes" / "Not found" marks inside
                            this scroller. They are absolutely positioned, and with no
                            positioned ancestor they hung off the page itself and made
                            the whole document 435px wide on a 390px phone. */}
                        <div className="relative overflow-x-auto -mx-2 sm:mx-0">
                            <table className="w-full text-xs sm:text-sm">
                                <thead>
                                    <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                        <th scope="col" className="pb-2 pr-3 font-medium">Feature</th>
                                        <th scope="col" className="pb-2 px-3 font-medium">dcaBTC</th>
                                        <th scope="col" className="pb-2 px-3 font-semibold text-amber-700 dark:text-amber-400">This site</th>
                                    </tr>
                                </thead>
                                <tbody className="text-slate-700 dark:text-slate-300">
                                    {COMPARE.map((row) => (
                                        <tr key={row.feature} className="border-t border-slate-200 dark:border-slate-700/50 align-top">
                                            <th scope="row" className="py-2.5 pr-3 font-medium text-left text-slate-800 dark:text-slate-200">
                                                {row.feature}
                                            </th>
                                            <td className="py-2.5 px-3"><CellContent cell={row.dcabtc} /></td>
                                            <td className="py-2.5 px-3 bg-amber-50/60 dark:bg-amber-500/5"><CellContent cell={row.us} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            One honest difference in dcaBTC&apos;s favor: it keeps the whole tool on a single screen with
                            fewer choices, and some people prefer exactly that. This site shows more, which also means
                            there is more to look at.
                        </p>
                    </Card>
                </section>

                {/* Migration */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        Switching takes about a minute
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        Every dcaBTC setting has an equivalent here, with one swap: the S&amp;P 500 where dcaBTC
                        compares against the Dow Jones. Nothing to import and no account to create — just set the same
                        schedule.
                    </p>
                    <Card className="p-4 sm:p-6">
                        <div className="relative overflow-x-auto -mx-2 sm:mx-0">
                            <table className="w-full text-xs sm:text-sm">
                                <thead>
                                    <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                        <th scope="col" className="pb-2 pr-3 font-medium">On dcaBTC</th>
                                        <th scope="col" className="pb-2 font-medium">Here</th>
                                    </tr>
                                </thead>
                                <tbody className="text-slate-700 dark:text-slate-300">
                                    {MIGRATION.map((row) => (
                                        <tr key={row.theirs} className="border-t border-slate-200 dark:border-slate-700/50 align-top">
                                            <td className="py-2.5 pr-3 font-medium text-slate-800 dark:text-slate-200">{row.theirs}</td>
                                            <td className="py-2.5">{row.ours}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        What you gain on top: a fee percentage that actually drags on returns the way your exchange
                        does, XIRR and max drawdown so the risk is visible, CSV export of every simulated purchase, and{' '}
                        <Link href="/methodology" className={textLink}>a methodology page</Link>{' '}
                        that writes out every formula and data source. The code is MIT-licensed on{' '}
                        <a
                            href="https://github.com/9drix9/bitcoindca-calculator"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={textLink}
                        >
                            GitHub
                        </a>, and there&apos;s a{' '}
                        <Link href="/developers" className={textLink}>documented API</Link>{' '}
                        if you&apos;d rather pull the numbers into your own tools.
                    </p>
                </section>

                {/* How we compared */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        How we compared
                    </h2>
                    <Card className="p-5 sm:p-6">
                        <div className="flex items-start gap-3">
                            <ClipboardCheck className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" aria-hidden="true" />
                            <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                <p>
                                    We loaded dcabtc.com in an ordinary browser on {LAST_CHECKED}, ran its default scenario
                                    and more than twenty other plans with different start dates, lengths and frequencies,
                                    inspected each control, and recorded exactly what rendered. We also read the price table
                                    in the page&apos;s own JavaScript, which is how we know where it starts, where it stops
                                    and where the gap is. Our standard cross-tool test — $50 a week for five years — showed
                                    $NaN, so there were no numbers to compare, and this page compares features and observed
                                    behavior only.
                                </p>
                                <p>
                                    We are not neutral; this is our calculator. That&apos;s why every claim is dated,
                                    every &quot;not found&quot; is labeled as such rather than as fact, and errors reported via
                                    the <Link href="/contact" className={textLink}>contact page</Link>{' '}
                                    get corrected with priority.
                                </p>
                            </div>
                        </div>
                    </Card>
                </section>

                {/* CTA */}
                <Card celebrated className="p-6 sm:p-10 text-center">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
                        See your schedule with the numbers filled in
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-5 max-w-xl mx-auto leading-relaxed">
                        Same four inputs you know from dcaBTC, plus fees, XIRR, max drawdown, and benchmarks against
                        the S&amp;P 500, gold, inflation, and a savings account. Free, no account, open source.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link
                            href="/"
                            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                        >
                            Open the DCA calculator
                            <ArrowRight className="w-4 h-4" aria-hidden="true" />
                        </Link>
                        <Link
                            href="/alternatives"
                            className="inline-flex items-center gap-2 border border-slate-300 dark:border-slate-700 hover:border-amber-500/50 text-slate-700 dark:text-slate-200 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                        >
                            Compare all alternatives
                        </Link>
                    </div>
                </Card>

                {/* Disclaimer */}
                <p className="border-t border-slate-200 dark:border-slate-800 pt-6 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Not financial advice. Both tools are educational simulations; past performance does not guarantee
                    future results. dcaBTC is an independent product with no affiliation to this site; observations
                    about it reflect what we saw on {LAST_CHECKED} and may no longer be current.
                </p>

            </div>
        </>
    );
}
