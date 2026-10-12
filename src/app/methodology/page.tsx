import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Database, Calculator, SearchCheck, AlertTriangle, History, ArrowRight, CalendarRange, ChevronDown } from 'lucide-react';
import { EARLIEST_PRICE_TS, parseUtcDate } from '@/utils/dates';
import { FIRST_EXCHANGE_CLOSE_TS, SNAPSHOT_END_TS } from '@/data/priceSources';
import { FX_FALLBACK_AS_OF } from '@/data/currencies';
import { MAX_OBSERVED_GAP_DAYS, MAX_SERIES_LAG_DAYS } from '@/utils/priceSeries';
import { DEFAULT_PLAN } from '@/data/planDefaults';

/**
 * The day this page was last brought into line with the code it describes.
 * Shown under the title. Move it whenever the engine, the price pipeline or the
 * text below changes, add a changelog entry at the bottom of the page, and keep
 * PAGE_DATES.methodology in sitemap.ts on the same day.
 *
 * What the page describes, so a change to any of these means a change here:
 * utils/dca (the engine), utils/dates (the schedule), utils/priceSeries and
 * app/actions (where prices come from, and the fallbacks), utils/datasets (the
 * start-date comparison), utils/realReturn (the after-inflation figures),
 * data/priceSources (which series is the default; the text below is written
 * for Coinbase being it), data/currencies, context/CurrencyContext and
 * context/currencyRules (FX, and which currency is shown while rates load),
 * and components/DcaCalculator (which panels count only the purchases made so
 * far, and how "your start" is measured).
 *
 * Figures in the text that were measured ("measured on", "checked on") carry
 * their own date in the sentence, so they stay true when this one moves.
 *
 * Other pages link to the section ids below (TOC) and to #sept-2010, so an id
 * that is renamed has to be renamed where it is linked from as well.
 */
const LAST_UPDATED_ISO = '2026-10-12';

export const metadata: Metadata = {
    title: 'Methodology & Data Sources',
    description: 'How the Bitcoin DCA Calculator works: every data source, the DCA math (fees, average cost, ROI, XIRR, max drawdown), which prices are estimates, and the known limitations.',
    keywords: ['bitcoin dca calculator methodology', 'dca calculator accuracy', 'bitcoin price data sources', 'xirr bitcoin', 'dca calculation formula'],
    alternates: {
        canonical: '/methodology',
    },
    openGraph: {
        images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
        title: 'Methodology & Data Sources',
        description: 'Every data source, every formula, every limitation. No black box: this is exactly how the calculator works.',
        url: '/methodology',
        type: 'article',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        images: ['/opengraph-image'],
        card: 'summary_large_image',
        title: 'Methodology & Data Sources',
        description: 'Every data source, every formula, every limitation. No black box: this is exactly how the calculator works.',
        creator: '@9drix9',
    },
};

const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://btcdollarcostaverage.com" },
        { "@type": "ListItem", "position": 2, "name": "Methodology", "item": "https://btcdollarcostaverage.com/methodology" },
    ],
};

const MONTH_NAME = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long' });

/** "20 July 2015", in UTC like every date on the site. */
const dayMonthYear = (ts: number): string => {
    const date = new Date(ts);
    return `${date.getUTCDate()} ${MONTH_NAME.format(date)} ${date.getUTCFullYear()}`;
};

// Read off the constants the code itself uses, so the page cannot keep saying
// "19 July" after the bundled data is extended by a day.
const EARLIEST_DAY = dayMonthYear(EARLIEST_PRICE_TS);
const SNAPSHOT_END_DAY = dayMonthYear(SNAPSHOT_END_TS);
const FIRST_EXCHANGE_DAY = dayMonthYear(FIRST_EXCHANGE_CLOSE_TS);
const FX_FALLBACK_DAY = dayMonthYear(parseUtcDate(FX_FALLBACK_AS_OF));
const LAST_UPDATED = dayMonthYear(parseUtcDate(LAST_UPDATED_ISO));

const DATA_SOURCES = [
    { source: 'Coinbase', provides: `Daily candles from ${FIRST_EXCHANGE_DAY}: one closing price per UTC day. The default price series. Also the live price a result is valued at.`, cadence: '~1 hour; live price ~1 min' },
    { source: 'Kraken', provides: 'Weekly candles: the optional price series, and the fallback when Coinbase cannot be reached. The days between weekly closes are straight-line estimates. Also the price ticker on the home page, with Coinbase standing in when Kraken has no current quote.', cadence: '~1 hour; ticker ~30s' },
    { source: 'blockchain.info', provides: `Daily market prices from ${EARLIEST_DAY} to ${SNAPSHOT_END_DAY} (a stored copy); circulating BTC supply`, cadence: 'Fixed / ~5 min' },
    { source: 'mempool.space', provides: 'Block height, recent blocks, transaction fees, hash rate, difficulty, Lightning stats', cadence: '30s - 10 min' },
    { source: 'CoinGecko', provides: 'Global market cap and Bitcoin dominance', cadence: '~5 min' },
    // The cadence column is how often we re-read a source, not how often it
    // changes: this series gains one reading a month.
    { source: 'FRED (St. Louis Fed)', provides: 'US consumer price index, series CPIAUCSL: one reading a month, for the after-inflation figures and the purchasing-power card', cadence: '~1 day' },
    { source: 'Yahoo Finance', provides: 'S&P 500 total return (^SP500TR, dividends reinvested) and Gold (GC=F) for asset comparisons', cadence: '~1 hour' },
    { source: 'alternative.me', provides: 'Fear & Greed Index', cadence: '~5 min' },
    { source: 'Frankfurter', provides: 'European Central Bank reference FX rates (EUR, GBP, CAD, AUD, JPY display currencies), from api.frankfurter.dev. Requested only when needed; see Currencies below', cadence: '~12 hours' },
];

/**
 * The two publishers' own figures for 14 to 17 September 2010, as raw JSON:
 * the days around the two rows of the bundled data that look wrong (see the
 * header of data/btcHistorical.ts). Both returned the figures quoted in the
 * text when fetched on 2026-10-12.
 */
const SEPT_2010_SOURCES = {
    blockchainInfo: 'https://api.blockchain.info/charts/market-price?start=2010-09-14&timespan=4days&sampled=false&format=json',
    coinMetrics: 'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=PriceUSD&start_time=2010-09-14&end_time=2010-09-17&frequency=1d',
};

const strongClass = 'text-slate-800 dark:text-slate-200';
const cardClass = 'bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700';
const cardTitle = 'text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2';
const cardBody = 'text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed';
const codeClass = 'text-xs sm:text-sm bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded';
const linkClass = 'text-amber-700 dark:text-amber-400 hover:underline';
const sectionClass = 'space-y-4 scroll-mt-24';

const TOC = [
    { href: '#data-sources', label: 'Data sources' },
    { href: '#dca-math', label: 'How the math works' },
    { href: '#data-honesty', label: 'Data honesty' },
    { href: '#every-start-date', label: 'Every start date' },
    { href: '#known-limitations', label: 'Known limitations' },
    { href: '#changelog', label: 'Changelog' },
] as const;

function ChangelogItem({ children }: { children: ReactNode }) {
    return (
        <li className="flex items-start gap-2">
            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
            <span>{children}</span>
        </li>
    );
}

const changelogList = 'space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed';

/** A label over one run of entries, so the longest release can be scanned by area. */
function ChangelogGroup({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</h4>
            <ul className={changelogList}>{children}</ul>
        </div>
    );
}

/**
 * One release. The newest is open, since it is the one that explains a number
 * that has just moved; the older ones are a tap away, so the page does not end
 * in a list of everything that ever changed.
 */
function Release({ month, title, current = false, children }: { month: string; title: string; current?: boolean; children: ReactNode }) {
    return (
        <details open={current} className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
                <span className="flex flex-wrap items-center gap-2">
                    <span
                        className={current
                            ? 'text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                            : 'text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}
                    >
                        {month}
                    </span>
                    <h3 className="font-bold text-sm sm:text-base text-slate-800 dark:text-white">{title}</h3>
                </span>
                <ChevronDown className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="px-4 pb-4 sm:px-5 sm:pb-5 space-y-4">{children}</div>
        </details>
    );
}

export default function MethodologyPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />
            <div className="measure max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10 sm:space-y-16">

                {/* Hero */}
                <section className="text-center max-w-3xl mx-auto space-y-3 sm:space-y-4">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white text-balance">
                        Methodology &amp; <span className="text-amber-700 dark:text-amber-400">Data Sources</span>
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
                        A calculator you can&apos;t verify is a black box. This page lists every data source, walks
                        through the math behind each number, and is blunt about where the model falls short of reality.
                    </p>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
                        Last updated {LAST_UPDATED}. What changed, and when, is in the{' '}
                        <a href="#changelog" className={linkClass}>changelog</a> at the bottom.
                    </p>
                </section>

                {/* On this page */}
                <nav
                    aria-label="On this page"
                    className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800"
                >
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                        On this page
                    </p>
                    {/* Each link fills a 44px row, so the next section is never the nearer tap. */}
                    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 text-xs sm:text-sm">
                        {TOC.map((item) => (
                            <li key={item.href}>
                                <a href={item.href} className={`${linkClass} flex min-h-11 items-center`}>{item.label}</a>
                            </li>
                        ))}
                    </ul>
                </nav>

                {/* 1. Data Sources */}
                <section id="data-sources" className={sectionClass}>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Database className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Data Sources</h2>
                    </div>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        Every request is proxied through our server so responses can be cached, and no personal data
                        is sent to any provider. The cadences below are our own cache windows, not guarantees from the
                        providers. A candle is one period&apos;s price summary: its open, high, low and close.
                    </p>
                    <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                        {/* No minimum width, and the names and cadences wrap below sm: on a
                            phone all three columns are on screen with nothing to scroll to. */}
                        <div className="overflow-x-auto -mx-2 sm:mx-0">
                            <table className="w-full text-xs sm:text-sm">
                                <thead>
                                    <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                        <th className="pb-2 pr-3 font-medium">Source</th>
                                        <th className="pb-2 pr-3 font-medium">What it provides</th>
                                        <th className="pb-2 font-medium">Refresh cadence</th>
                                    </tr>
                                </thead>
                                <tbody className="text-slate-700 dark:text-slate-300">
                                    {DATA_SOURCES.map((row) => (
                                        <tr key={row.source} className="border-t border-slate-200 dark:border-slate-700/50 align-top">
                                            <td className="py-2 pr-3 font-medium sm:whitespace-nowrap">{row.source}</td>
                                            <td className="py-2 pr-3">{row.provides}</td>
                                            <td className="py-2 tabular-nums sm:whitespace-nowrap">{row.cadence}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                            Those cadences are the calculator&apos;s. Pages that are built ahead of time (the{' '}
                            <Link href="/dca" className={linkClass}>DCA scenario pages</Link>, the studies and the
                            worked examples on the calculator pages) are rebuilt about once a day, so their figures can
                            trail the live calculator by a day or more. A scenario page says when the price it uses is
                            from.
                        </p>
                        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                            Two cards on the home page are not feeds. The adoption chart is drawn from published
                            tables, which the card links with the date they were last read. The purchasing-power card
                            sets the FRED consumer price series against the bitcoin price since January 2015, always in
                            US dollars, because US inflation says nothing about other currencies.
                        </p>
                        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                            The same daily series and the backtest engine behind every number here are available as a{' '}
                            <Link href="/developers" className={linkClass}>free, keyless JSON/CSV API</Link>: check our
                            work, or build on it.
                        </p>
                    </div>
                </section>

                {/* 2. How the DCA math works */}
                <section id="dca-math" className={sectionClass}>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Calculator className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">How the DCA Math Works</h2>
                    </div>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            <strong className={strongClass}>Purchase schedule.</strong> Purchases land
                            on UTC calendar days: daily, weekly (every 7 days), bi-weekly (every 14 days), or monthly
                            (same day-of-month as your start date). In a month too short to have that day the buy lands
                            on its last day, so a plan started on the 31st buys on the last day of February and again on
                            31 March.
                            Exchange candles are UTC-aligned too. Doing the same math in local time shifts the whole
                            schedule by a day for anyone west of Greenwich, which is why we don&apos;t.
                        </p>
                        <p>
                            <strong className={strongClass}>Past and future.</strong> A purchase counts as made once
                            its UTC date has arrived. If a plan&apos;s end date is in the future, the calculator runs
                            it to that date and labels the headline figures as projected. The purchases still to come
                            are priced at the live price the stack is valued at, or at the last known price when there
                            is no live one. The chart marks today, and the purchase table lists the later rows marked
                            Planned. Everything that describes what has already happened counts only the purchases
                            dated today or earlier: the statistics under the headline (XIRR, max drawdown, best buy,
                            fees paid), every panel on the Compare tab, the CSV export, the share card, the embed
                            widget and the API. The stacking goal, FIRE and spend-down planners start from that same
                            stack, the coins bought so far.
                        </p>
                        <p>
                            <strong className={strongClass}>Fees.</strong> Each buy pays your percentage fee plus,
                            if you enter one, a flat fee per buy:{' '}
                            <code className={codeClass}>fee = amount &times; fee% + flat fee</code>, and never more than
                            the purchase itself. What is left buys bitcoin:{' '}
                            <code className={codeClass}>btcBought = (amount &minus; fee) / price</code>.
                            The full amount still counts as invested capital, so fees drag on returns here the same way
                            they do on a real exchange. The fee figures we list for named platforms, and what each one
                            leaves out, are on the{' '}
                            <Link href="/calculators/exchange-fees" className={linkClass}>exchange fee page</Link>.
                        </p>
                        <p>
                            <strong className={strongClass}>Currencies.</strong> All math runs in USD. An amount you
                            type in another currency (EUR, GBP, CAD, AUD, JPY) is converted to USD first, and results
                            are converted back for display, both at one rate: the European Central Bank&apos;s latest
                            reference rate, published once per working day and fetched through Frankfurter
                            (api.frankfurter.dev). Past exchange rates are not used, so a result in euros is the dollar
                            result at that one rate, not what each buy cost in euros on its day. The calculator prints
                            the rate&apos;s date beside the result, and the CSV export carries the rate in a column of
                            its own.
                        </p>
                        <p>
                            Today&apos;s rates are requested only when a currency other than US dollars is in use or
                            the calculator&apos;s currency picker is opened. Until they arrive, a currency you have
                            picked stays in US dollars, and the currency a shared link was made in is shown at once, at
                            a fixed table dated {FX_FALLBACK_DAY}. If the rates have not arrived within about two and a
                            half seconds, or cannot be fetched, the site uses the last ECB rates it holds or that
                            table, and says in words that the converted figures are approximate. The Cost Basis Tracker converts each
                            saved plan from the currency it was entered in at the same single rate, so the bitcoin,
                            average cost and ROI of a plan entered in another currency are approximate too.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                            <div className={cardClass}>
                                <h3 className={cardTitle}>Average Cost &amp; ROI</h3>
                                <p className={cardBody}>
                                    Average cost = total invested &divide; total BTC accumulated.
                                    ROI = (current value &minus; total invested) &divide; total invested. Current value is
                                    total BTC &times; the latest price: the most recent trade on the exchange you
                                    selected, or the other exchange&apos;s if that one does not answer. If neither does,
                                    the calculator uses the last daily price it loaded for the plan. For a plan that
                                    ended in the past that is a price from then, so the result names its date and is
                                    not called today&apos;s value. The API uses the newest daily price in that case. At
                                    a manual price, every buy and the final value use the price you typed.
                                </p>
                            </div>
                            <div className={cardClass}>
                                <h3 className={cardTitle}>XIRR (Annualized Return)</h3>
                                <p className={cardBody}>
                                    Your yearly return rate, adjusted for the fact that money went in at different times.
                                    Formally: the money-weighted annualized return, meaning the discount rate at which the
                                    net present value of all your dated purchases plus the final portfolio value equals zero.
                                    We solve it numerically, with Newton&apos;s method and a bisection fallback. The
                                    final value is dated at the moment its price was quoted (the last daily price&apos;s
                                    day when there is no live quote), not at the plan&apos;s end date, and a year is
                                    365.25 days. It isn&apos;t shown until 90 days separate the first purchase from
                                    that final date, because annualizing a shorter stretch is meaningless.
                                </p>
                            </div>
                            <div className={cardClass}>
                                <h3 className={cardTitle}>Max Drawdown</h3>
                                <p className={cardBody}>
                                    It answers one question: how far underwater did the plan go at its worst point?
                                    It is the largest peak-to-trough fall in your stack&apos;s value, as a percentage of
                                    the preceding peak. Your holdings are valued at the series price on every UTC day,
                                    not just the days you buy, from your first holding to your end date or the last
                                    available price, whichever comes first. So a crash that starts and ends between two
                                    purchases counts. A fall after the end date of a plan that has ended does not,
                                    although its value and XIRR run to today. One price a day cannot show a fall inside
                                    a single day, and on the Kraken series a fall inside a single week is hidden too
                                    (see below), so the figure reads too small there. It is not shown at a fixed manual
                                    price.
                                </p>
                            </div>
                            <div className={cardClass}>
                                <h3 className={cardTitle}>After Inflation</h3>
                                <p className={cardBody}>
                                    Each purchase is restated at the price level of the latest US consumer price
                                    reading (FRED series CPIAUCSL, one a month) on or before the day the stack is
                                    valued: amount &times; CPI at that reading &divide; CPI for the month of the
                                    purchase. Real cost is the sum of those amounts, and real ROI = value &divide; real
                                    cost &minus; 1. The value is not adjusted, because it is already at that price
                                    level. Inflation is the index change from the first purchase&apos;s month to that
                                    reading. Money put in later was exposed to less of it, so real ROI is not ROI minus
                                    the inflation figure. A reading comes out a few weeks after its month (on 12
                                    October 2026 the latest was August&apos;s), and purchases newer than the latest one
                                    are not inflated. It measures US prices whatever currency is on display, and it is
                                    not shown at a manual price.
                                </p>
                            </div>
                            <div className={cardClass}>
                                <h3 className={cardTitle}>Starting Stack</h3>
                                <p className={cardBody}>
                                    Bitcoin you already held before the first buy. It is costed at the average cost you
                                    enter, or otherwise at the series price on your start date (your manual price in
                                    manual mode). It is never treated as free. It counts as money invested and as
                                    bitcoin held, so it is part of average cost, ROI, max drawdown and XIRR (as one cash
                                    flow on the start date). It pays no fee, and it is left out of best buy, worst buy
                                    and the purchase count. The lump sum, savings, asset and exchange-fee comparisons
                                    and the start-date comparison below are about the buying schedule alone, so they
                                    leave it out too.
                                </p>
                            </div>
                            <div className={cardClass}>
                                <h3 className={cardTitle}>Yearly Increase</h3>
                                <p className={cardBody}>
                                    Each purchase is the amount &times; (1 + increase%) for every full year since the
                                    start date. It steps up on each 12-month anniversary, not gradually. A plan started on
                                    29 February has its anniversary on 28 February in other years. The percentage fee is
                                    taken from the stepped-up amount; a flat fee does not change.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 3. Data honesty */}
                <section id="data-honesty" className={sectionClass}>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <SearchCheck className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Data Honesty</h2>
                    </div>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            <strong className={strongClass}>The default series is daily closing prices.</strong>{' '}
                            From {FIRST_EXCHANGE_DAY} every day is priced at the close of Coinbase&apos;s BTC-USD daily
                            candle for that UTC day. The calculator, the scenario pages, the studies and the API all use
                            this series unless another is asked for. The current day is the exception: it has not
                            closed, so its price is the latest trade at the time the series was fetched.
                        </p>
                        <p>
                            <strong className={strongClass}>Before then, the prices are a daily average, not an exchange close.</strong>{' '}
                            From {EARLIEST_DAY} to {SNAPSHOT_END_DAY} the series is a stored copy of blockchain.info&apos;s
                            market-price chart, which blockchain.info describes as the average USD market price across
                            major bitcoin exchanges. Each value is stamped 00:00 UTC, and where it can be checked against
                            exchange candles it tracks the close of the day before its date. Measured on 12 October 2026
                            over the 4,101 days since July 2015 for which both exist, blockchain.info&apos;s value sat a
                            median 0.045% from Coinbase&apos;s close of the previous day and 1.47% from its close of the
                            same day. So a purchase before {FIRST_EXCHANGE_DAY} is priced about one day earlier in
                            market time than one after it. The values are whole cents, which is coarse while bitcoin
                            was under $1: at $0.06, one cent is a 17% move. It is a fixed copy, since that history no
                            longer changes, and the same rows are used whichever exchange is selected. Nothing before{' '}
                            {EARLIEST_DAY} is priced, so a plan cannot start earlier.
                        </p>
                        <p id="sept-2010" className="scroll-mt-24">
                            <strong className={strongClass}>Those early rows are used as published, including two that look wrong.</strong>{' '}
                            15 and 16 September 2010 read $0.09 and $0.15, between days at $0.06. Coin Metrics&apos; daily
                            price for the same two days is $0.0604 and $0.0619. A second index disagreeing does not
                            prove a trade did not happen, so the rows stay, and a purchase dated 16 September 2010 is
                            priced at $0.15. Both sources were read on 12 October 2026:{' '}
                            <a href={SEPT_2010_SOURCES.blockchainInfo} target="_blank" rel="noopener noreferrer" className={linkClass}>blockchain.info</a>{' '}
                            and{' '}
                            <a href={SEPT_2010_SOURCES.coinMetrics} target="_blank" rel="noopener noreferrer" className={linkClass}>Coin Metrics</a>.
                        </p>
                        <p>
                            <strong className={strongClass}>The Kraken series is mostly estimates.</strong>{' '}
                            Kraken&apos;s public API returns only the 720 most recent candles of any size. Its daily
                            candles therefore reach back about two years, and weekly candles are the finest that cover
                            the years since 2015. We date each weekly close on the last day of its week, a Wednesday,
                            and fill the six days in between along a straight line. Those days are estimates, not prices
                            that traded. Totals come out close to the Coinbase series, but anything that reads single
                            days does not: a fall inside one week is flattened, so max drawdown reads too small, and a
                            best or worst buy can land on a price that never traded. Measured on 12 October 2026 with
                            the default plan (${DEFAULT_PLAN.amount} a week for {DEFAULT_PLAN.yearsBack} years), bitcoin
                            stacked differed by 0.13% between the two series, while max drawdown read 47.1% on Kraken
                            against 48.8% on Coinbase. For the same weekly plan run from 1 January to 30 June 2020,
                            across the March 2020 crash, it read 27.3% on Kraken against 41.1% on Coinbase.
                        </p>
                        <p>
                            <strong className={strongClass}>Every price says whether it was observed.</strong>{' '}
                            Each day in a series is marked observed (a price the source reported for that day) or
                            estimated (a straight-line value between two reported prices, or an earlier price carried
                            forward to a day that has none). The marker travels with every purchase: it is in the CSV
                            export&apos;s Price Kind column and in the API&apos;s responses, and each result counts how
                            many of its purchases, and how many of the days checked for max drawdown, rest on an
                            estimate. On the Coinbase series that count is normally zero. A file exported at a manual
                            price has no Price Kind column, because none of its prices came from a market.
                        </p>
                        <p>
                            <strong className={strongClass}>When an exchange cannot be reached.</strong>{' '}
                            If the exchange you selected does not answer, the server first reuses the copy of that same
                            series it fetched earlier the same UTC day. Failing that, it serves the other
                            exchange&apos;s series, and if neither answers, the last series it holds, provided that
                            is less than a day old. In every case the result carries whose prices they are and when
                            they were fetched. The calculator and the scenario pages print a notice when the prices
                            on screen are another exchange&apos;s or an earlier copy. A response with a hole in it is
                            rejected, not filled in: more than {MAX_OBSERVED_GAP_DAYS.coinbase} days between two
                            Coinbase candles, more than {MAX_OBSERVED_GAP_DAYS.kraken} between two Kraken ones, or a
                            series that stops more than {MAX_SERIES_LAG_DAYS} days ago.
                        </p>
                        <p>
                            <strong className={strongClass}>Gaps use the last known price.</strong> If a
                            scheduled purchase lands on a day with no price, the simulation carries the most recent
                            earlier price forward rather than skipping the buy, and marks that purchase as estimated.
                            A purchase dated after today is marked the same way, whichever price it is projected at.
                        </p>
                    </div>
                </section>

                {/* 4. Same plan, every start date */}
                <section id="every-start-date" className={sectionClass}>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <CalendarRange className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Same Plan, Every Start Date</h2>
                    </div>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            One backtest is one start date. This comparison asks what the same plan did from all of
                            the others.
                        </p>
                        <p>
                            <strong className={strongClass}>What is run.</strong> Take your plan&apos;s frequency and
                            its length, from its start date to its end date or to today if it ends later, rounded to
                            whole months. The shortest is three months, and the plan has to be shorter than the price
                            history. That plan is replayed from every possible start day in the
                            history, one day apart. Each run buys the same fixed amount on its schedule and is valued at
                            the price on its last day, so the result does not depend on the amount. Daily, weekly and
                            bi-weekly runs buy every 1, 7 or 14 days. Monthly runs buy every 30.44 days, an average
                            month, not on a calendar day-of-month. Your percentage fee is applied to every run. A flat
                            fee, a starting stack and a yearly increase are not.
                        </p>
                        <p>
                            <strong className={strongClass}>Which prices.</strong> Only the default series, whichever
                            price source you have selected, and only up to the last finished day, which is normally
                            yesterday: today has not closed. It can be limited to exchange closes
                            alone (from {FIRST_EXCHANGE_DAY}), which leaves out the years when the price is a
                            cross-exchange average. If Coinbase cannot be reached, a copy of its closes fetched within
                            the last day is used. With none in hand there is no comparison to show. It is never
                            run on Kraken&apos;s estimates, and it is not shown at a manual price.
                        </p>
                        <p>
                            <strong className={strongClass}>What is reported.</strong> The worst, 10th percentile,
                            median, 90th percentile and best total return across the runs, the share of runs that ended
                            below what was paid in, and where your own plan&apos;s return falls among them. With fewer
                            than 20 runs only the worst and the best are shown.
                        </p>
                        <p>
                            <strong className={strongClass}>Your own plan&apos;s return.</strong> The line marked
                            &ldquo;Your start&rdquo; is your schedule measured the way the runs are: the purchases
                            made up to your end date, or up to today if the plan ends later, valued at that last
                            day&apos;s price in the series you have selected. It is not the headline return, which
                            uses the live price and counts a starting stack. A plan with a flat fee or a yearly
                            increase is not ranked, because the runs have neither.
                        </p>
                        <p>
                            <strong className={strongClass}>Independent periods.</strong> The runs overlap almost
                            completely: two five-year runs that start a day apart share 1,825 of their 1,826 days. So
                            the number of runs says how finely the history was sampled, not how much evidence there is.
                            The honest count is how many windows of that length fit end to end in the history, the days
                            of history divided by the plan&apos;s length and rounded down. We report it next to the run
                            count as independent periods. Checked on 12 October 2026, on prices through the day before:
                            a five-year weekly plan had 4,073 runs and 3 independent periods (2 on exchange closes
                            alone). A one-year weekly plan had 5,534 runs and 16 independent periods, and with a 0.5%
                            fee 26% of those runs ended below what was paid in.
                        </p>
                        <p>
                            <strong className={strongClass}>These are past outcomes.</strong> Every figure describes
                            start dates that have already played out. None of it is a forecast or a probability.
                        </p>
                        <p>
                            <strong className={strongClass}>Cost-basis percentile.</strong> The line on a share card
                            that ranks your average cost uses the same replay, over all history and with no fee. It
                            compares your average cost per bitcoin with the average cost of every run and reports the
                            share of start dates that ended with a higher one, rounded down. Your percentage fee is
                            taken back out of your own average cost first, which is why the line says &ldquo;before
                            fees&rdquo;. It needs at least 30 runs, and it is left off for a plan with a flat fee, a
                            starting stack, a yearly increase or a manual price.
                        </p>
                        <p>
                            <strong className={strongClass}>The studies.</strong>{' '}
                            <Link href="/lump-sum-vs-dca" className={linkClass}>Lump sum vs DCA</Link>,{' '}
                            <Link href="/best-day-to-buy-bitcoin" className={linkClass}>best day to buy</Link> and the{' '}
                            <Link href="/dca/start-date-heatmap" className={linkClass}>start-date heatmap</Link> each
                            carry their own method note on the page, next to the numbers it explains.
                        </p>
                    </div>
                </section>

                {/* 5. Limitations */}
                <section id="known-limitations" className={sectionClass}>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Known Limitations</h2>
                    </div>
                    <ul className="space-y-2 ml-1 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span><strong className={strongClass}>No taxes.</strong> Capital gains and income tax on rewards are not modeled, and neither are cost-basis accounting methods.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span><strong className={strongClass}>No withdrawal fees.</strong> Moving coins to self-custody costs an on-chain network fee, often plus an exchange withdrawal fee. Both are excluded.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span><strong className={strongClass}>No spread modeling.</strong> The fee fields take a percentage and a flat amount per buy. A spread built into the price a platform quotes you, and the price differences between exchanges, are not modeled unless you add them to the percentage yourself.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span><strong className={strongClass}>One price per day.</strong> Every purchase executes at the day&apos;s series price. Intraday timing is not simulated, and neither is the price you would actually have been filled at.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span><strong className={strongClass}>One exchange rate.</strong> A result in a currency other than US dollars is the dollar result at one recent rate. What each buy cost in that currency on its own day is not modeled.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span><strong className={strongClass}>A short history.</strong> The price data starts in August 2010. Only three five-year periods fit in it end to end, so a backtest here describes a handful of market cycles, not a long record.</span>
                        </li>
                    </ul>
                </section>

                {/* 6. Changelog */}
                <section id="changelog" className={sectionClass}>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <History className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Changelog</h2>
                    </div>
                    <div className="space-y-3">
                        <Release month="October 2026" title="Daily closes by default, and every estimate labeled" current>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                Several of these change numbers the site had already shown. Where that is so, the entry says by how much.
                            </p>
                            <ChangelogGroup label="Prices">
                                <ChangelogItem>Changed: the default price series is Coinbase&apos;s daily closes. It was Kraken&apos;s weekly closes with the days between filled in. A link or an API call that names no provider now gets Coinbase. Measured on 12 October 2026 with the default plan (${DEFAULT_PLAN.amount} a week for {DEFAULT_PLAN.yearsBack} years), this and the re-dating in the next entry raised bitcoin stacked by 0.16% and ROI by about 0.3 points, and moved max drawdown from 47.1% to 48.8%. What changed in the API is on the <Link href="/developers#changes" className={linkClass}>developers page</Link>.</ChangelogItem>
                                <ChangelogItem>Fixed: Kraken&apos;s weekly closes were dated one day late, on the Thursday the next week opens. Against Coinbase&apos;s daily closes over 586 weeks they were off by a median of about 1.7% as dated and 0.03% one day earlier. Every Kraken-series price after {SNAPSHOT_END_DAY} moved one day earlier.</ChangelogItem>
                                <ChangelogItem>New: every price is marked observed or estimated, in the CSV export and the API, and each result counts the purchases and drawdown days that rest on an estimate.</ChangelogItem>
                                <ChangelogItem>Changed: purchases still to come are priced at the live price the stack is valued at. They were priced at the price history&apos;s newest row, up to an hour older, so a plan that had not started could show a gain or loss that was only the gap between the two.</ChangelogItem>
                                <ChangelogItem>Changed: when a day has more than one price the last is used. This affects the current day on the Kraken series.</ChangelogItem>
                                <ChangelogItem>Fixed: a live price could be served well after its cache lifetime had passed. A quote that old is now fetched again, and the final XIRR cash flow is dated at the moment the price was quoted.</ChangelogItem>
                                <ChangelogItem>Fixed: when the S&amp;P 500 total-return index could not be loaded, the comparison used the price-only index under the total-return label. It now says the data is unavailable.</ChangelogItem>
                            </ChangelogGroup>
                            <ChangelogGroup label="The math">
                                <ChangelogItem>New: a flat fee per buy, alongside the percentage fee.</ChangelogItem>
                                <ChangelogItem>Changed: the &ldquo;share of runs that ended in profit&rdquo; line is gone. It read 100% for the default plan and counted runs that overlap almost entirely as separate evidence. In its place are the range of outcomes across every start date, the share that ended below cost, and the number of independent periods. Start dates step a day at a time (they stepped a week), monthly runs step an average month (they stepped 30 days), and your percentage fee is applied (the runs were fee-free).</ChangelogItem>
                                <ChangelogItem>Fixed: the example at the top of the home page ran the default plan with no fee while the calculator below it used {DEFAULT_PLAN.feePercentage}%. Both now use {DEFAULT_PLAN.feePercentage}%.</ChangelogItem>
                                <ChangelogItem>Changed: a yearly increase on a plan started on 29 February steps on 28 February in other years, so a monthly plan gets its raise on the 13th purchase. It stepped on 1 March, the 14th.</ChangelogItem>
                                <ChangelogItem>Fixed: the after-inflation figures deflated only the final value, and read the price index up to the plan&apos;s end date while valuing the stack at today&apos;s price. Each purchase is now restated from its own month, up to the day the stack is valued. At a flat price with 3% inflation over five years the old method read &minus;13.7% for a weekly plan where the like-for-like figure is &minus;7.3%.</ChangelogItem>
                                <ChangelogItem>Fixed: with no live quote, the savings comparison valued bitcoin at the plan window&apos;s last daily price but compounded the savings balance on to today. Both sides are now valued on the same day.</ChangelogItem>
                                <ChangelogItem>Changed: a plan with an amount of 0 and a starting stack makes no purchases. It had listed a purchase of 0 on every scheduled day.</ChangelogItem>
                            </ChangelogGroup>
                            <ChangelogGroup label="Currencies and fees">
                                <ChangelogItem>New: a result in another currency says, where it is shown, that every buy was converted at one dated exchange rate: in the calculator, the CSV export (in a column of its own), share cards and their images, the embed widget and the Share My Stack card.</ChangelogItem>
                                <ChangelogItem>Changed: a shared link always names its currency, and a link with an amount but no currency is read as US dollars. Before, a visitor with another currency saved read the same number in their own currency.</ChangelogItem>
                                <ChangelogItem>Changed: exchange rates come from Frankfurter&apos;s ECB endpoint at api.frankfurter.dev. The fixed fallback table had drifted 3% to 7% from the market. It now holds the ECB rates of {FX_FALLBACK_DAY}, and figures converted with it are labeled approximate.</ChangelogItem>
                                <ChangelogItem>Changed: the exchange fee figures were re-read from each platform&apos;s own page on 12 October 2026. Swan&apos;s 0.5% promotion ended on 8 September 2026 and it lists 1%. Coinbase publishes no fixed figure, so no cost is modeled for it: it had been priced at $2.99 plus about 0.5% a buy, the fee page&apos;s 6.5% row, which is now a labeled example of a $1 flat fee. A 0.5% to 2% range quoted for Kraken&apos;s spread was removed, because Kraken publishes no figure. Details are on the <Link href="/calculators/exchange-fees" className={linkClass}>exchange fee page</Link>.</ChangelogItem>
                            </ChangelogGroup>
                            <ChangelogGroup label="Planners, tracker and cards">
                                <ChangelogItem>Changed: the spend-down planner opens at a price change of 0% a year. It opened at +15%.</ChangelogItem>
                                <ChangelogItem>Fixed: the planner&apos;s largest withdrawal that lasts 30 years is rounded down. Rounded to the nearest unit it could print an amount that ran out a month early.</ChangelogItem>
                                <ChangelogItem>Fixed: a comma typed as a decimal point in the planner&apos;s stack, withdrawal and floor fields is read as one. &ldquo;0,5&rdquo; BTC had been read as 5.</ChangelogItem>
                                <ChangelogItem>Fixed: the cost-basis tracker refuses a fee outside 0 to 50%. It had saved such a plan at 50% or 0% without saying so.</ChangelogItem>
                                <ChangelogItem>Changed: the equal-split figure divides 21 million BTC by 8.3 billion people and comes to 253,012 sats. It used 8.1 billion and read 259,259.</ChangelogItem>
                                <ChangelogItem>Changed: the supply card&apos;s lost-coin figure is a range from a 2017 study, 2.78 to 3.79 million BTC, with its source. It was a flat 3.7 million with none, and the &ldquo;available&rdquo; figure worked out from it is gone.</ChangelogItem>
                                <ChangelogItem>Changed: the adoption card shows Crypto.com&apos;s estimates of Bitcoin owners for December 2022 to 2025, about 365 million at the latest. It showed 560 million, and a line back to 2010, with no source.</ChangelogItem>
                                <ChangelogItem>New: the price ticker names the exchange it quotes, each network card says when it could not refresh and when its figure was last updated, and the Lightning card prints the day mempool.space dates its figures.</ChangelogItem>
                                <ChangelogItem>Fixed: amounts shortened for a phone are rounded half up from the cent, so 13,050 reads 13.1K in every currency.</ChangelogItem>
                            </ChangelogGroup>
                            <ChangelogGroup label="Scenario pages and studies">
                                <ChangelogItem>Fixed: on the DCA scenario pages, &ldquo;Value at year end&rdquo; was the value at that year&apos;s last purchase, which is 1 December for a monthly plan. It is now the value on 31 December. Those pages also moved to daily closes: measured on 12 October 2026, max drawdown reads deeper on all 112 of them, by as much as 9.1 points, and best buy changed date on 18.</ChangelogItem>
                                <ChangelogItem>Changed: a scenario page values its stack at the newest price it holds: an exchange&apos;s quote, or the latest trade in its price history when that is newer. It used the quote even when it was the older of the two.</ChangelogItem>
                                <ChangelogItem>Changed: the three studies (lump sum vs DCA, best day to buy, the start-date heatmap) are computed on finished Coinbase daily closes only, never the Kraken fallback or today&apos;s unfinished price. When those closes cannot be loaded a study keeps its last published version. The best-day page replaced its rankings over the last 10, 5 and 2 years with a test of each day&apos;s price against the seven days centered on it.</ChangelogItem>
                                <ChangelogItem>Changed: the drawdown table also lists the fall still under way, and says what its counts are without 15 and 16 September 2010 (11 and 8).</ChangelogItem>
                                <ChangelogItem>Changed: the &ldquo;from 2013 peak&rdquo; preset starts on 30 November 2013, the day the scenario page uses. It started on 4 December.</ChangelogItem>
                            </ChangelogGroup>
                        </Release>
                        <Release month="August 2026" title="Accuracy fixes">
                            <ul className={changelogList}>
                                <ChangelogItem>Fixed: XIRR dated its final cash flow at the plan&apos;s end date while valuing the stack at today&apos;s price, which squeezed years of growth into the plan&apos;s window. A 2016 to 2018 plan read +574% a year instead of about +54%.</ChangelogItem>
                                <ChangelogItem>Fixed: max drawdown was sampled only on purchase days, so a monthly plan missed any crash that began and ended between two buys. It now checks every UTC day, and reported drawdowns can be deeper than before.</ChangelogItem>
                                <ChangelogItem>Fixed: a start date before {EARLIEST_DAY} was priced at the first price in the series, $0.07. Earlier dates are no longer accepted.</ChangelogItem>
                                <ChangelogItem>Fixed: Kraken&apos;s weekly closes were paired with the start of their week, which dated them about six days early.</ChangelogItem>
                                <ChangelogItem>Changed: the S&amp;P 500 comparison uses the total-return index, with dividends reinvested. The price-only index it used before understated the S&amp;P by roughly 1.5% to 2% a year.</ChangelogItem>
                                <ChangelogItem>Fixed: blockchain.info&apos;s daily prices now run to {SNAPSHOT_END_DAY} on both series. That closed a 19-day stretch that had been filled in and stopped the Kraken series discarding about 630 days of daily data.</ChangelogItem>
                                <ChangelogItem>Fixed: the asset comparison values every asset at the same moment, XIRR&apos;s final value is dated at the last daily price when there is no live quote, and max drawdown is blank at a manual price.</ChangelogItem>
                                <ChangelogItem>New: starting stack and yearly increase, a free public API, and a cost-basis percentile on share cards.</ChangelogItem>
                                <ChangelogItem>Changed: the best-day-to-buy page stopped naming a winning weekday. Its ranking was measuring start dates, not weekdays.</ChangelogItem>
                            </ul>
                        </Release>
                        <Release month="July 2026" title="Accuracy &amp; polish overhaul">
                            <ul className={changelogList}>
                                <ChangelogItem>Fixed: future projections double-counted contributions in some scenarios.</ChangelogItem>
                                <ChangelogItem>Fixed: currency conversion inconsistencies across the comparison and planning tools.</ChangelogItem>
                                <ChangelogItem>Fixed: purchase dates now use UTC calendar days everywhere, eliminating timezone-dependent schedule shifts.</ChangelogItem>
                                <ChangelogItem>New: live ECB exchange rates (frankfurter.app) replace hardcoded currency rates.</ChangelogItem>
                                <ChangelogItem>New: XIRR (money-weighted annualized return) and max drawdown statistics.</ChangelogItem>
                                <ChangelogItem>New: redesigned charts with single-axis tabs, plus this methodology page.</ChangelogItem>
                                <ChangelogItem>New: real daily market prices (blockchain.info) for 2010&ndash;2015, replacing the earlier synthetic pre-2015 interpolation.</ChangelogItem>
                                <ChangelogItem>New: historical win-rate stat, the share of comparable DCA windows since 2010 that ended in profit. Replaced in October 2026.</ChangelogItem>
                                <ChangelogItem>New: result-specific share previews, plan-vs-plan comparison, and prerendered DCA scenario pages.</ChangelogItem>
                            </ul>
                        </Release>
                        <Release month="February 2026" title="Reliability pass">
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                API fetch timeouts, currency-aware labels across all tools, and the beginner-friendly mining guide.
                            </p>
                        </Release>
                    </div>
                </section>

                {/* CTA */}
                <section className="text-center bg-slate-100 dark:bg-slate-900/50 p-6 sm:p-10 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
                        Now Run Your Own Numbers
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mb-5 max-w-xl mx-auto">
                        You&apos;ve seen how the sausage gets made. Go backtest your own DCA schedule with the calculator.
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                    >
                        Open the Calculator
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </section>

                {/* Disclaimer */}
                <section className="border-t border-slate-200 dark:border-slate-800 pt-6 sm:pt-8">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                            <strong>Disclaimer:</strong> This page describes an educational simulation, not investment advice.
                            Historical and simulated performance does not guarantee future results. Bitcoin is volatile and
                            carries significant risk. Always do your own research before making investment decisions.
                        </p>
                    </div>
                </section>

            </div>
        </>
    );
}
