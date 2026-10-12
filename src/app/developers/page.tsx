import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Terminal, HeartHandshake, SearchCheck, Scale, Github, AlertTriangle, ArrowRight, History } from 'lucide-react';
import { API_CACHE_SECONDS, BREAKDOWN_CAP } from '@/app/api/v1/contract';
import { DEFAULT_PLAN } from '@/data/planDefaults';
import { DEFAULT_PRICE_PROVIDER, FIRST_EXCHANGE_CLOSE_DATE, SNAPSHOT_END_DATE } from '@/data/priceSources';
import { EARLIEST_PRICE_DATE } from '@/utils/dates';
import { URL_PARAM_LIMITS } from '@/utils/urlParams';

export const metadata: Metadata = {
    title: 'Developer API',
    description: 'Free, open Bitcoin data API: daily BTC/USD price history (JSON and CSV) and full DCA backtests. No API keys, no accounts, no rate-limit hoops. CORS enabled.',
    keywords: ['bitcoin price api free', 'btc usd historical data api', 'bitcoin dca api', 'bitcoin price history csv', 'free bitcoin api no key'],
    alternates: {
        canonical: '/developers',
    },
    openGraph: {
        images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
        title: 'Free Bitcoin Data API',
        description: 'Daily BTC/USD history and full DCA backtests as JSON or CSV. No keys, no accounts, no tricks.',
        url: '/developers',
        type: 'article',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        images: ['/opengraph-image'],
        card: 'summary_large_image',
        title: 'Free Bitcoin Data API',
        description: 'Daily BTC/USD history and full DCA backtests as JSON or CSV. No keys, no accounts, no tricks.',
        creator: '@9drix9',
    },
};

const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://btcdollarcostaverage.com" },
        { "@type": "ListItem", "position": 2, "name": "Developers", "item": "https://btcdollarcostaverage.com/developers" },
    ],
};

const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": "https://btcdollarcostaverage.com/developers",
    "name": "Developer API",
    "description": "Free, open Bitcoin data API: daily BTC/USD price history and full DCA backtests. No API keys, no accounts.",
    "url": "https://btcdollarcostaverage.com/developers",
    "isPartOf": {
        "@type": "WebSite",
        "name": "Bitcoin DCA Calculator",
        "url": "https://btcdollarcostaverage.com",
    },
    "author": {
        "@type": "Person",
        "@id": "https://btcdollarcostaverage.com/author#person",
        "name": "drix",
        "url": "https://btcdollarcostaverage.com/author",
    },
    "datePublished": "2026-08-11",
    // Static date: update when the content itself changes. Keep in sync with sitemap.ts.
    "dateModified": "2026-10-12",
};

const REPO_URL = 'https://github.com/9drix9/bitcoindca-calculator';

// Every bound, default and lifetime on this page is read from the code that
// enforces it, so the docs cannot drift from the API. The explicit locale
// keeps the grouping identical wherever this is rendered.
const grouped = (n: number): string => n.toLocaleString('en-US');
const LIMITS = URL_PARAM_LIMITS;
const MAX_AMOUNT = grouped(LIMITS.maxAmount);
const MAX_STARTING_BTC = grouped(LIMITS.maxStartingBtc);
const MAX_FLAT_FEE = grouped(LIMITS.maxFlatFee);
const PRICES_CACHE = `${API_CACHE_SECONDS.prices / 60} minutes`;
const DCA_CACHE = `${API_CACHE_SECONDS.dca / 60} minutes`;
const DEGRADED_CACHE = `${API_CACHE_SECONDS.degraded / 60} minutes`;
const STALE_WINDOW = `${API_CACHE_SECONDS.staleWhileRevalidate / 60} minutes`;

/** In-page navigation. Each href must match a section or card id below. */
const TOC = [
    { href: '#prices', label: '/api/v1/prices' },
    { href: '#prices-csv', label: '/api/v1/prices.csv' },
    { href: '#dca', label: '/api/v1/dca' },
    { href: '#honest-bits', label: 'The honest bits' },
    { href: '#changes', label: 'What changed' },
    { href: '#fair-use', label: 'Fair use' },
] as const;

/**
 * Dark terminal block in both themes — it is a developer page, after all.
 * A long line scrolls sideways inside the block, so the block takes keyboard
 * focus: not every browser lets a scroll box be scrolled from the keyboard
 * otherwise.
 */
function CodeBlock({ children }: { children: string }) {
    return (
        <pre
            tabIndex={0}
            role="group"
            aria-label="Code sample"
            className="bg-slate-900 dark:bg-slate-950 text-slate-100 rounded-xl border border-slate-800 p-4 text-xs sm:text-sm leading-relaxed overflow-x-auto"
        >
            <code>{children}</code>
        </pre>
    );
}

/** Inline code. Sized relative to its sentence, and allowed to wrap so a long header name cannot push a phone screen sideways. */
function C({ children }: { children: ReactNode }) {
    return <code className="text-[0.92em] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded break-words">{children}</code>;
}

// Both tables are real tables from 640px. Below that a three-column table
// cannot fit a phone without hiding the column that explains each row, so each
// row runs on as one entry instead: its name, then the rest, nothing to scroll
// to. The roles restate what the elements are, because a browser may stop
// treating them as a table once they are no longer displayed as one.
const tableClass = 'w-full text-xs sm:text-sm max-sm:block';
const headRowClass = 'text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700';
const bodyClass = 'text-slate-700 dark:text-slate-300 max-sm:block';
const rowClass = 'border-t border-slate-200 dark:border-slate-700/50 align-top max-sm:block max-sm:py-2';
const nameCell = 'font-mono font-medium whitespace-nowrap sm:py-2 sm:pr-3 max-sm:inline';
const mutedOnPhones = 'max-sm:text-slate-500 dark:max-sm:text-slate-400';

function ParamsTable({ rows }: { rows: { name: string; values: string; fallback: string }[] }) {
    return (
        <table role="table" className={tableClass}>
            <thead role="rowgroup" className="max-sm:sr-only">
                <tr role="row" className={headRowClass}>
                    <th role="columnheader" className="pb-2 pr-3 font-medium">Param</th>
                    <th role="columnheader" className="pb-2 pr-3 font-medium">Accepts</th>
                    <th role="columnheader" className="pb-2 font-medium">Default</th>
                </tr>
            </thead>
            <tbody role="rowgroup" className={bodyClass}>
                {rows.map((row) => (
                    <tr role="row" key={row.name} className={rowClass}>
                        <td role="cell" className={nameCell}>{row.name}{' '}</td>
                        <td role="cell" className="sm:py-2 sm:pr-3 max-sm:inline">
                            {row.values}
                            <span className="sm:hidden">. </span>
                        </td>
                        <td role="cell" className="sm:py-2 max-sm:inline">
                            <span className="sm:hidden">Default: </span>
                            {row.fallback}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function FieldsTable({ caption, rows }: { caption: string; rows: { name: string; type: string; meaning: string }[] }) {
    return (
        <table role="table" className={tableClass}>
            <caption className="text-left text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 pb-2 max-sm:block">{caption}</caption>
            <thead role="rowgroup" className="max-sm:sr-only">
                <tr role="row" className={headRowClass}>
                    <th role="columnheader" className="pb-2 pr-3 font-medium">Field</th>
                    <th role="columnheader" className="pb-2 pr-3 font-medium">Type</th>
                    <th role="columnheader" className="pb-2 font-medium">Meaning</th>
                </tr>
            </thead>
            <tbody role="rowgroup" className={bodyClass}>
                {rows.map((row) => (
                    <tr role="row" key={row.name} className={rowClass}>
                        <td role="cell" className={nameCell}>{row.name}{' '}</td>
                        <td role="cell" className={`sm:py-2 sm:pr-3 max-sm:inline max-sm:pr-1 ${mutedOnPhones}`}>{row.type}{' '}</td>
                        <td role="cell" className="sm:py-2 max-sm:inline">{row.meaning}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function EndpointCard({
    id,
    path,
    summary,
    children,
}: {
    id: string;
    path: string;
    summary: string;
    children: ReactNode;
}) {
    return (
        <div id={id} className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 scroll-mt-24">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">GET</span>
                <h3 className="font-bold font-mono text-sm sm:text-base text-slate-800 dark:text-white break-all">{path}</h3>
            </div>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">{summary}</p>
            {children}
        </div>
    );
}

// Links inside a sentence are underlined: colour alone does not mark a link.
const textLink = 'text-amber-700 dark:text-amber-400 underline underline-offset-2 hover:text-amber-800 dark:hover:text-amber-300';
// Each "Try it live" link is the one action on its line, so it gets a full 44px row.
const apiLink = `inline-flex min-h-11 items-center break-all ${textLink}`;
const finePrint = 'text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed';

export default function DevelopersPage() {
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
            <div className="measure max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10 sm:space-y-16">

                {/* Hero */}
                <section className="text-center max-w-3xl mx-auto space-y-3 sm:space-y-4">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white text-balance">
                        Free &amp; Open <span className="text-amber-700 dark:text-amber-400">Data API</span>
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
                        The same data and math behind this calculator, as plain HTTP endpoints.
                        Daily BTC/USD history back to 2010 and full DCA backtests, in JSON or CSV.
                        No API keys, no accounts, no signup wall.
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
                    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 text-xs sm:text-sm">
                        {TOC.map((item) => (
                            <li key={item.href}>
                                <a href={item.href} className="flex min-h-11 items-center text-amber-700 dark:text-amber-400 hover:underline">{item.label}</a>
                            </li>
                        ))}
                    </ul>
                </nav>

                {/* 1. Why free */}
                <section id="why-free" className="space-y-4 scroll-mt-24">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <HeartHandshake className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Why This Is Free</h2>
                    </div>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            Getting clean Bitcoin price history usually means an API key, a credit card
                            on file, and a rate-limit table. That&apos;s a strange gatekeeping ritual for numbers that
                            were public the moment they happened. This site already assembles the series for its own
                            calculator, so republishing it costs almost nothing — and the whole project is open source,
                            so hiding the data behind a key would be theater anyway.
                        </p>
                        <p>
                            There is deliberately <strong className="text-slate-800 dark:text-slate-200">no auth and no
                            rate-limit code</strong>. Responses carry CDN cache headers ({PRICES_CACHE} for prices, {DCA_CACHE}{' '}
                            for backtests), so a repeat of the exact same URL is normally answered from the cache. A URL
                            that differs in any way, even by a parameter the API ignores, is a separate cache entry and is
                            computed on the server. Nothing throttles that, so please don&apos;t script loops of unique
                            URLs.
                        </p>
                    </div>
                </section>

                {/* 2. Endpoints */}
                <section id="endpoints" className="space-y-4 scroll-mt-24">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Terminal className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Endpoints</h2>
                    </div>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        All endpoints answer <C>GET</C> and <C>OPTIONS</C>, send <C>Access-Control-Allow-Origin: *</C>{' '}
                        so browser <C>fetch()</C> works from any origin, and return errors as JSON with a
                        plain-English <C>error</C> message. Errors are never cached. Every parameter is optional, and
                        parameters the API does not know are ignored.
                    </p>
                    <div className="space-y-4 sm:space-y-6">

                        <EndpointCard
                            id="prices"
                            path="/api/v1/prices"
                            summary={`Daily BTC/USD prices as JSON: one [utcMidnightMs, usd] pair per UTC day, with a marker for each saying whether it was observed or estimated. Defaults to the full history, ${EARLIEST_PRICE_DATE} to today.`}
                        >
                            <ParamsTable rows={[
                                { name: 'from', values: `ISO date (yyyy-MM-dd). Earlier than ${EARLIEST_PRICE_DATE} is raised to it. Later than today, or later than to, is a 400`, fallback: EARLIEST_PRICE_DATE },
                                { name: 'to', values: `ISO date. Later than today is cut back to today. Earlier than ${EARLIEST_PRICE_DATE} is a 400`, fallback: 'today (UTC)' },
                                { name: 'provider', values: 'coinbase or kraken', fallback: DEFAULT_PRICE_PROVIDER },
                            ]} />
                            <CodeBlock>{`curl 'https://btcdollarcostaverage.com/api/v1/prices?from=2020-01-01&to=2020-12-31'`}</CodeBlock>
                            <p className={finePrint}>
                                Try it live:{' '}
                                <a href="/api/v1/prices?from=2024-01-01&to=2024-06-30" className={apiLink}>/api/v1/prices?from=2024-01-01&amp;to=2024-06-30</a>
                            </p>
                            <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                                The response to that curl on 2026-10-12, with kinds, note and series shortened:
                            </p>
                            <CodeBlock>{`{
  "source": "coinbase",
  "served": "coinbase",
  "fallback": false,
  "stale": false,
  "asOf": "2026-10-12T05:16:19.151Z",
  "seriesFetchedAt": "2026-10-12T05:16:19.000Z",
  "from": "2020-01-01",
  "to": "2020-12-31",
  "count": 366,
  "estimatedCount": 0,
  "kinds": "oooooooooo...",
  "note": "All prices are USD, one value per UTC day, ...",
  "series": [
    [1577836800000, 7174.33],
    [1577923200000, 6945.02]
  ]
}`}</CodeBlock>
                            <FieldsTable
                                caption="Response fields"
                                rows={[
                                    { name: 'source', type: 'string', meaning: 'The provider you asked for, or the default. It does not change when another exchange answers; served does.' },
                                    { name: 'served', type: 'string', meaning: 'The exchange whose series this actually is: coinbase or kraken. Differs from the provider you asked for only when fallback is true.' },
                                    { name: 'fallback', type: 'boolean', meaning: 'true when the exchange you asked for could not be reached and the other one answered.' },
                                    { name: 'stale', type: 'boolean', meaning: 'true when the exchange could not be reached just now and this is a copy of its series the server fetched earlier.' },
                                    { name: 'asOf', type: 'ISO timestamp', meaning: 'When this response was generated.' },
                                    { name: 'seriesFetchedAt', type: 'ISO timestamp', meaning: 'When the series was fetched from the exchange. A price dated that same UTC day is the latest trade at that moment, not a close.' },
                                    { name: 'from, to', type: 'ISO date', meaning: 'The range that was answered, after the clamping described above.' },
                                    { name: 'count', type: 'number', meaning: 'Rows in series. Rows are consecutive UTC days. The last one can be a day before to, in the first moments of a UTC day or while stale is true.' },
                                    { name: 'estimatedCount', type: 'number', meaning: 'How many of those rows are straight-line estimates.' },
                                    { name: 'kinds', type: 'string', meaning: 'One character per row of series, in the same order: o for an observed price, e for a straight-line estimate between two observed prices. A - would mean unknown; the server does not currently send it.' },
                                    { name: 'note', type: 'string', meaning: 'What the prices in this response are, in plain English. If the response is a fallback or stale, the note starts by saying so.' },
                                    { name: 'series', type: 'array', meaning: '[utcMidnightMs, usd] pairs, oldest first, unrounded.' },
                                ]}
                            />
                            <p className={finePrint}>
                                Errors: a 400 for a date or provider that can&apos;t be read, or a range that lies wholly
                                in the future or before {EARLIEST_PRICE_DATE}. A 503 when neither exchange can be reached
                                and the server holds no recent copy, or when the range has no price yet, which happens
                                for today&apos;s date in the first moments of a UTC day. The CSV endpoint answers the same
                                way, in JSON.
                            </p>
                        </EndpointCard>

                        <EndpointCard
                            id="prices-csv"
                            path="/api/v1/prices.csv"
                            summary="The same series as a downloadable CSV with date,usd rows, one row per UTC day, ready for a spreadsheet or pandas. Same parameters as /api/v1/prices, plus kinds."
                        >
                            <ParamsTable rows={[
                                { name: 'kinds', values: '1 or true adds a third column, kind, holding observed or estimated. 0, false or nothing leaves the body as date,usd. Anything else is a 400', fallback: 'off' },
                            ]} />
                            <CodeBlock>{`curl -o btc-usd-daily.csv 'https://btcdollarcostaverage.com/api/v1/prices.csv?provider=coinbase'`}</CodeBlock>
                            <p className={finePrint}>
                                Try it live:{' '}
                                <a href="/api/v1/prices.csv?from=2024-01-01&to=2024-06-30" className={apiLink}>/api/v1/prices.csv?from=2024-01-01&amp;to=2024-06-30</a>
                            </p>
                            <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                                The first rows of that file (Coinbase daily closes):
                            </p>
                            <CodeBlock>{`date,usd
2024-01-01,44220.78
2024-01-02,44972.80
2024-01-03,42862.44`}</CodeBlock>
                            <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                                The same days with <C>provider=kraken&amp;kinds=1</C>:
                            </p>
                            <CodeBlock>{`date,usd,kind
2024-01-01,43026.24,estimated
2024-01-02,42937.87,estimated
2024-01-03,42849.50,observed`}</CodeBlock>
                            <p className={finePrint}>
                                Prices are rounded to cents (four decimals below $1, so the 2010&ndash;2011 era doesn&apos;t
                                flatten to zero). The JSON endpoint returns unrounded values. The body is pure data with no
                                comment rows, so the provenance travels in response headers: <C>X-Data-Note</C> (the same
                                text as the JSON <C>note</C>), <C>X-Data-Served</C> (the exchange whose prices are in the
                                file), <C>X-Data-Fetched-At</C> (when that series was fetched) and{' '}
                                <C>X-Data-Estimated-Rows</C> (how many rows are estimates). All four, and{' '}
                                <C>Content-Disposition</C>, are listed in <C>Access-Control-Expose-Headers</C>, so a
                                cross-origin <C>fetch()</C> can read them. The suggested file name is{' '}
                                <C>btc-usd-daily-&lt;served&gt;-&lt;from&gt;-&lt;to&gt;.csv</C>.
                            </p>
                        </EndpointCard>

                        <EndpointCard
                            id="dca"
                            path="/api/v1/dca"
                            summary={`A full DCA backtest on the same engine, price pipeline and defaults as the on-site calculator: $${DEFAULT_PLAN.amount} every week for the last ${DEFAULT_PLAN.yearsBack} years at a ${DEFAULT_PLAN.feePercentage}% fee. It reports history only. A purchase dated after today (UTC) is never counted.`}
                        >
                            <ParamsTable rows={[
                                { name: 'amount', values: `USD per purchase. 0 or less is a 400. Above ${MAX_AMOUNT} is clamped to it`, fallback: String(DEFAULT_PLAN.amount) },
                                { name: 'frequency', values: 'daily, weekly, biweekly, monthly', fallback: DEFAULT_PLAN.frequency },
                                { name: 'startDate', values: `ISO date. Earlier than ${EARLIEST_PRICE_DATE} is raised to it. Later than today, or later than endDate, is a 400`, fallback: `${DEFAULT_PLAN.yearsBack} years before endDate, never earlier than ${EARLIEST_PRICE_DATE}` },
                                { name: 'endDate', values: `ISO date. Later than today is cut back to today. Earlier than ${EARLIEST_PRICE_DATE} is a 400`, fallback: 'today (UTC)' },
                                { name: 'fee', values: `exchange fee as a % of each purchase, 0 to ${LIMITS.maxFeePct}. Outside that range is a 400`, fallback: String(DEFAULT_PLAN.feePercentage) },
                                { name: 'flat', values: `flat fee per purchase in USD, 0 to ${MAX_FLAT_FEE}, charged on top of fee. Outside that range is a 400`, fallback: '0' },
                                { name: 'provider', values: 'coinbase or kraken', fallback: DEFAULT_PRICE_PROVIDER },
                                { name: 'startingBtc', values: `BTC already held at the start date, 0 or more. Above ${MAX_STARTING_BTC} is clamped to it`, fallback: 'none' },
                                { name: 'startingCost', values: `USD cost per BTC of the starting stack, 0 or more, only together with a positive startingBtc. Above ${MAX_AMOUNT} is clamped to it. Left out or 0, the stack is costed at the start date’s price`, fallback: 'start-date price' },
                                { name: 'esc', values: `yearly purchase increase in %, 0 or more. The amount steps up on each 12-month anniversary. Above ${LIMITS.maxEscalationPct} is clamped to it`, fallback: '0' },
                                { name: 'currency', values: 'USD only. Anything else is a 400', fallback: 'USD' },
                                { name: 'mode', values: 'api only. Anything else, such as the calculator’s manual, is a 400', fallback: 'api' },
                            ]} />
                            <p className={finePrint}>
                                A value that is clamped is echoed in <C>inputs</C>, so you can see what was run. A negative
                                number, a blank or text where a number belongs, or a date that does not exist is a 400.
                                A calculator link&apos;s query string can be sent as it is and is held to the same
                                rules, so a link in another currency or at a manual price is a 400.
                            </p>
                            <CodeBlock>{`curl 'https://btcdollarcostaverage.com/api/v1/dca?amount=100&frequency=weekly&startDate=2020-01-01&endDate=2024-12-31&fee=0.5'`}</CodeBlock>
                            <p className={finePrint}>
                                Try it live:{' '}
                                <a href="/api/v1/dca?amount=100&frequency=weekly&startDate=2020-01-01&endDate=2024-12-31" className={apiLink}>/api/v1/dca?amount=100&amp;frequency=weekly&amp;startDate=2020-01-01&amp;endDate=2024-12-31</a>
                            </p>
                            <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                                The response to that curl on 2026-10-12, with breakdown cut to its first row and note
                                shortened. Everything valued at today&apos;s price moves with the market:
                            </p>
                            <CodeBlock>{`{
  "inputs": {
    "amountUsd": 100, "frequency": "weekly",
    "startDate": "2020-01-01", "endDate": "2024-12-31",
    "feePercent": 0.5, "provider": "coinbase"
  },
  "asOf": "2026-10-12T05:16:20.049Z",
  "currency": "USD",
  "totalInvested": 26100,
  "btcAccumulated": 1.114657706280992,
  "averageCost": 23415.259996794477,
  "currentValue": 93761.04921749973,
  "profit": 67661.04921749973,
  "roiPercent": 259.23773646551626,
  "xirrPercent": 32.25073739818596,
  "maxDrawdownPercent": 69.63294618721186,
  "feesPaid": 130.5,
  "feePercentOfBuy": 0.5,
  "purchaseCount": 261,
  "estimatedPrices": {
    "purchases": 0, "drawdownDays": 0, "drawdownDaysWalked": 1827
  },
  "spotPriceUsd": 84116.45,
  "spotSource": "coinbase",
  "spotAsOf": "2026-10-12T05:16:20.000Z",
  "served": "coinbase",
  "fallback": false,
  "stale": false,
  "seriesFetchedAt": "2026-10-12T05:16:19.000Z",
  "breakdownSampled": false,
  "breakdown": [
    {
      "date": "2020-01-01T00:00:00.000Z",
      "price": 7174.33,
      "invested": 100,
      "totalInvested": 100,
      "accumulated": 0.013868890892947495,
      "totalAccumulated": 0.013868890892947495,
      "portfolioValue": 99.5,
      "fee": 0.5,
      "priceKind": "observed"
    }
  ],
  "note": "All figures are USD. ..."
}`}</CodeBlock>
                            <FieldsTable
                                caption="Response fields"
                                rows={[
                                    { name: 'inputs', type: 'object', meaning: 'The plan that was run: amountUsd, frequency, startDate, endDate, feePercent and provider (the one you asked for). These appear only when they apply: startDateClamped with requestedStartDate, endDateClamped with requestedEndDate, flatFeeUsd, startingBtc, startingCostUsd, annualEscalationPercent.' },
                                    { name: 'asOf', type: 'ISO timestamp', meaning: 'When this response was generated. Its UTC date is the “today” that decides which purchases have happened.' },
                                    { name: 'currency', type: 'string', meaning: 'Always USD.' },
                                    { name: 'totalInvested', type: 'number', meaning: 'Dollars put in: every purchase in full, fees included, plus the cost of a starting stack.' },
                                    { name: 'btcAccumulated', type: 'number', meaning: 'BTC bought, plus the starting stack.' },
                                    { name: 'averageCost', type: 'number', meaning: 'totalInvested divided by btcAccumulated.' },
                                    { name: 'currentValue', type: 'number', meaning: 'btcAccumulated at spotPriceUsd, or at the newest daily price when spotPriceUsd is null. Valued today, also for a window that ended years ago.' },
                                    { name: 'profit', type: 'number', meaning: 'currentValue minus totalInvested.' },
                                    { name: 'roiPercent', type: 'number', meaning: 'profit as a % of totalInvested.' },
                                    { name: 'xirrPercent', type: 'number or null', meaning: 'Money-weighted annualized return from each purchase date to now. null when the first purchase is less than 90 days old, or when no bitcoin was bought.' },
                                    { name: 'maxDrawdownPercent', type: 'number', meaning: 'Largest peak-to-trough fall in the value of the stack, checked on every UTC day from the first purchase to the end of the window.' },
                                    { name: 'feesPaid', type: 'number', meaning: 'Dollars taken as fees across all purchases, percentage and flat together.' },
                                    { name: 'feePercentOfBuy', type: 'number', meaning: 'feesPaid as a % of the money put into purchases. Equal to fee when there is no flat fee.' },
                                    { name: 'purchaseCount', type: 'number', meaning: 'Scheduled purchases made. The true total even when breakdown is thinned. A starting stack is not a purchase.' },
                                    { name: 'estimatedPrices', type: 'object or null', meaning: 'How much of the result rests on estimated prices: purchases (buys priced on an estimate), drawdownDays (days of the drawdown check priced on an estimate) and drawdownDaysWalked (days it covered). null only if the series reached the engine without its markers, in which case rows carry no priceKind either.' },
                                    { name: 'spotPriceUsd', type: 'number or null', meaning: 'The live price used for currentValue. null when neither exchange had a current quote.' },
                                    { name: 'spotSource', type: 'string or null', meaning: 'The exchange that quoted it. It is the other exchange when the one you asked for had no current quote.' },
                                    { name: 'spotAsOf', type: 'ISO timestamp or null', meaning: 'When it was quoted.' },
                                    { name: 'served', type: 'string', meaning: 'Same as on /api/v1/prices: the exchange whose series priced the purchases.' },
                                    { name: 'fallback', type: 'boolean', meaning: 'Same as on /api/v1/prices.' },
                                    { name: 'stale', type: 'boolean', meaning: 'Same as on /api/v1/prices.' },
                                    { name: 'seriesFetchedAt', type: 'ISO timestamp', meaning: 'Same as on /api/v1/prices.' },
                                    { name: 'breakdownSampled', type: 'boolean', meaning: `true when there are more than ${grouped(BREAKDOWN_CAP)} rows and breakdown was thinned.` },
                                    { name: 'breakdown', type: 'array', meaning: 'One row per purchase, oldest first. See the next table.' },
                                    { name: 'note', type: 'string', meaning: 'These rules and the provenance of the prices, in plain English, for this response. If the response is a fallback or stale, the note starts by saying so.' },
                                ]}
                            />
                            <FieldsTable
                                caption="Each breakdown row"
                                rows={[
                                    { name: 'date', type: 'ISO timestamp', meaning: 'The purchase day, at 00:00 UTC.' },
                                    { name: 'price', type: 'number', meaning: 'The USD price the purchase was made at: the series value for that UTC day, or the newest earlier value when the day has none yet (priceKind is then estimated).' },
                                    { name: 'invested', type: 'number', meaning: 'Dollars that left the bank for this purchase, fee included.' },
                                    { name: 'totalInvested', type: 'number', meaning: 'Running total of invested.' },
                                    { name: 'accumulated', type: 'number', meaning: 'BTC bought: invested minus fee, divided by price.' },
                                    { name: 'totalAccumulated', type: 'number', meaning: 'Running total of BTC.' },
                                    { name: 'portfolioValue', type: 'number', meaning: 'totalAccumulated at the market price for this row’s date. On a purchase row that is this row’s price.' },
                                    { name: 'fee', type: 'number', meaning: 'Dollars of invested taken as fees: fee % of the purchase plus flat, never more than the purchase itself. 0 on a starting-stack row.' },
                                    { name: 'priceKind', type: 'string', meaning: 'observed or estimated. Left out on a starting-stack row whose cost you supplied, because that price is yours.' },
                                    { name: 'isStartingStack', type: 'boolean', meaning: 'Present, and true, only on the first row when startingBtc was sent. That row is a position, not a purchase: its price is the stack’s cost per BTC, invested its total cost, and accumulated the BTC held. Its portfolioValue is the stack at the start date’s market price, not at a cost you stated.' },
                                ]}
                            />
                            <p className={finePrint}>
                                <C>breakdown</C> is capped at about {grouped(BREAKDOWN_CAP)} rows. A longer schedule is thinned
                                evenly (<C>breakdownSampled: true</C>), the final purchase is always kept, and the running
                                totals are exact at every row that remains. A <C>flat</C> fee at or above the purchase amount
                                buys no bitcoin: the response reports the money spent and a stack of zero. A 503 means
                                neither exchange could be reached, or the price series does not yet reach the end of the
                                window; every date or value the API cannot use is a 400 that says what to change. The
                                math itself is documented on the{' '}
                                <Link href="/methodology" className={textLink}>methodology page</Link>.
                            </p>
                        </EndpointCard>

                    </div>
                </section>

                {/* 3. The honest bits */}
                <section id="honest-bits" className="space-y-4 scroll-mt-24">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <SearchCheck className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">The Honest Bits</h2>
                    </div>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Where the prices come from.</strong>{' '}
                            {EARLIEST_PRICE_DATE} through {SNAPSHOT_END_DATE} are a bundled copy of blockchain.info&apos;s
                            market-price series, which blockchain.info describes as an average across major bitcoin
                            exchanges. They are not exchange closes. From {FIRST_EXCHANGE_CLOSE_DATE} the series comes
                            from the exchange you pick. Coinbase gives a close for every UTC day; a day it had no candle
                            for would be a straight-line estimate, marked as one. Kraken gives one observed close a
                            week, dated on a Wednesday, and every day in between is a straight-line estimate, not a
                            price that traded. On 2026-10-12 the full history was 5,900 days: none of them an estimate
                            on Coinbase, 3,516 of them on Kraken. <C>kinds</C> and <C>priceKind</C> mark which is which,
                            and every response repeats this in its <C>note</C>.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Dates before {FIRST_EXCHANGE_CLOSE_DATE} sit a day early.</strong>{' '}
                            Each blockchain.info value is stamped 00:00 UTC, and where it can be checked against exchange
                            candles it tracks the close of the day <em>before</em> its date. The exchange values that
                            follow are closes of their own date. If you join this data to another set of daily closes,
                            shift the rows up to {SNAPSHOT_END_DATE} back one day first. The{' '}
                            <Link href="/methodology" className={textLink}>methodology page</Link>{' '}
                            has the measurement, and the reason Kraken&apos;s series is weekly.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Today&apos;s price is not a close.</strong>{' '}
                            A value dated the current UTC day is the latest trade when the server fetched the series,
                            which it does roughly once an hour; <C>seriesFetchedAt</C> gives the exact time. On
                            Coinbase the day gets its close when it ends. On Kraken the whole week in progress moves:
                            every value dated after the newest completed weekly close lies on a straight line to that
                            latest trade, so it changes at each refetch and once more when the week closes. There,
                            today&apos;s value is marked observed, and estimated from tomorrow on unless today is a
                            Wednesday. Kraken values up to the newest completed weekly close do not change.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Outages are flagged, not hidden.</strong>{' '}
                            If the exchange you asked for can&apos;t be reached, you get the copy of its series the
                            server fetched earlier the same UTC day (<C>stale</C>), or failing that the other
                            exchange&apos;s series (<C>fallback</C>). With both exchanges down you get the last series
                            the server holds if it is under a day old, and otherwise a 503. A response with either
                            flag set, or a backtest valued without a live quote, is cached for {DEGRADED_CACHE}, not
                            the usual lifetime.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">USD only.</strong> Every number in
                            every endpoint is US dollars. The site&apos;s other display currencies are a display-time
                            conversion, and pretending the API had native EUR or JPY series would be dishonest.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Freshness.</strong> Price responses are
                            edge-cached for up to {PRICES_CACHE} and backtests for up to {DCA_CACHE}. For{' '}
                            {STALE_WINDOW} after that, the next request still gets the cached copy while a new one is
                            built. <C>asOf</C> says when a JSON response was built; <C>seriesFetchedAt</C> and{' '}
                            <C>X-Data-Fetched-At</C> say when its prices were fetched. Don&apos;t use these endpoints
                            as a live ticker.
                        </p>
                    </div>
                </section>

                {/* 4. Changes. The methodology changelog links to this anchor. */}
                <section id="changes" className="space-y-4 scroll-mt-24">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <History className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">What Changed in October 2026</h2>
                    </div>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            No field was removed or renamed, and every documented parameter still works. Some numbers
                            moved, and some requests that used to be answered are now refused. If you stored earlier
                            responses you should know which:
                        </p>
                        <ul className="list-disc pl-5 space-y-2">
                            <li>
                                <strong className="text-slate-800 dark:text-slate-200">The default provider is now coinbase.</strong>{' '}
                                It was kraken. A request with no <C>provider</C> now gets a close for every day where it
                                used to get weekly closes joined by straight lines. Send <C>provider=kraken</C> for the
                                Kraken series.
                            </li>
                            <li>
                                <strong className="text-slate-800 dark:text-slate-200">Kraken&apos;s weekly closes moved one day earlier.</strong>{' '}
                                Each was dated on the Thursday its week ended at 00:00 UTC. It is now dated on the
                                Wednesday before, the day whose last trade it is. Every <C>provider=kraken</C> value
                                after {SNAPSHOT_END_DATE} changed with it.
                            </li>
                            <li>
                                <strong className="text-slate-800 dark:text-slate-200">More requests to /api/v1/dca are a 400.</strong>{' '}
                                A window that starts after today used to get a 503 &ldquo;try again&rdquo;, or a 200 in
                                which every figure was zero. A <C>currency</C> other than USD and <C>mode=manual</C>{' '}
                                used to be ignored, so a calculator link for &yen;5,000 a week was answered as $5,000 a
                                week. A number sent as a blank, such as <C>fee=%20</C>, used to be read as 0.
                            </li>
                            <li>
                                <strong className="text-slate-800 dark:text-slate-200">The default startDate changed at two edges.</strong>{' '}
                                It no longer falls before {EARLIEST_PRICE_DATE}, and {DEFAULT_PLAN.yearsBack} years back
                                from Feb 29 is Feb 28 (it was Mar 1).
                            </li>
                            <li>
                                <strong className="text-slate-800 dark:text-slate-200">With no live quote, currentValue uses the newest daily price.</strong>{' '}
                                It used to use the last price inside the window, which for a window that ended in the past
                                was not a current value.
                            </li>
                            <li>
                                <strong className="text-slate-800 dark:text-slate-200">A response past its cache lifetime is re-served for at most {STALE_WINDOW}.</strong>{' '}
                                It was 24 hours, so a caller that asked once a day could be handed the previous
                                day&apos;s answer.
                            </li>
                            <li>
                                <strong className="text-slate-800 dark:text-slate-200">New fields and parameters.</strong>{' '}
                                Prices: <C>served</C>, <C>fallback</C>, <C>stale</C>, <C>seriesFetchedAt</C>,{' '}
                                <C>estimatedCount</C>, <C>kinds</C>. Backtests: the <C>flat</C> parameter, those four
                                provenance fields, <C>feesPaid</C>, <C>feePercentOfBuy</C>, <C>estimatedPrices</C>,{' '}
                                <C>spotSource</C>, <C>spotAsOf</C>, <C>fee</C> and <C>priceKind</C> on each row, and{' '}
                                <C>startDateClamped</C> with <C>requestedStartDate</C> in <C>inputs</C>. CSV: the{' '}
                                <C>kinds</C> parameter and three more <C>X-Data-</C> headers, all readable from a browser.
                            </li>
                        </ul>
                    </div>
                </section>

                {/* 5. Fair use */}
                <section id="fair-use" className="space-y-4 scroll-mt-24">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Scale className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Fair Use</h2>
                    </div>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            No keys and no quotas means this runs on good faith. Cache responses on your side, fetch the
                            full history once instead of a thousand slices, and don&apos;t poll faster than the cache
                            windows above — you&apos;d only be re-downloading identical bytes. If you build something on
                            top of this, a link back to{' '}
                            <Link href="/" className={textLink}>btcdollarcostaverage.com</Link>{' '}
                            is appreciated but not required. If your use case needs more than this (bulk, streaming,
                            something odd), <Link href="/contact" className={textLink}>get in touch</Link> —
                            the answer is probably yes.
                        </p>
                    </div>
                </section>

                {/* 6. Open source */}
                <section id="open-source" className="space-y-4 scroll-mt-24">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Github className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Open Source</h2>
                    </div>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            The entire site, these endpoints included, is MIT-licensed. Don&apos;t trust the numbers?
                            Read the code that produced them, or run your own copy:
                        </p>
                        <p>
                            <a
                                href={REPO_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-11 items-center gap-2 text-amber-700 dark:text-amber-400 hover:underline font-medium"
                            >
                                <Github className="w-4 h-4" />
                                github.com/9drix9/bitcoindca-calculator
                            </a>
                        </p>
                    </div>
                </section>

                {/* CTA */}
                <section className="text-center bg-slate-100 dark:bg-slate-900/50 p-6 sm:p-10 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
                        Prefer Buttons to curl?
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mb-5 max-w-xl mx-auto">
                        Everything the API computes, the calculator shows with charts. Same data, same math.
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
                            <strong>Disclaimer:</strong> This API serves an educational simulation and historical market
                            data, not investment advice. Historical and simulated performance does not guarantee future
                            results. The data is provided as-is, with no uptime or accuracy guarantees. Bitcoin is
                            volatile and carries significant risk.
                        </p>
                    </div>
                </section>

            </div>
        </>
    );
}
