import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Terminal, HeartHandshake, SearchCheck, Scale, Github, AlertTriangle, ArrowRight } from 'lucide-react';

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
    "dateModified": "2026-08-11",
};

const REPO_URL = 'https://github.com/9drix9/bitcoindca-calculator';

/** Dark terminal block in both themes — it is a developer page, after all. */
function CodeBlock({ children }: { children: string }) {
    return (
        <pre className="bg-slate-900 dark:bg-slate-950 text-slate-100 rounded-xl border border-slate-800 p-4 text-xs sm:text-sm leading-relaxed overflow-x-auto">
            <code>{children}</code>
        </pre>
    );
}

function ParamsTable({ rows }: { rows: { name: string; values: string; fallback: string }[] }) {
    return (
        <div className="overflow-x-auto -mx-2 sm:mx-0">
            <table className="w-full text-xs sm:text-sm min-w-[480px]">
                <thead>
                    <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                        <th className="pb-2 pr-3 font-medium">Param</th>
                        <th className="pb-2 pr-3 font-medium">Accepts</th>
                        <th className="pb-2 font-medium">Default</th>
                    </tr>
                </thead>
                <tbody className="text-slate-700 dark:text-slate-300">
                    {rows.map((row) => (
                        <tr key={row.name} className="border-t border-slate-200 dark:border-slate-700/50 align-top">
                            <td className="py-2 pr-3 font-mono font-medium whitespace-nowrap">{row.name}</td>
                            <td className="py-2 pr-3">{row.values}</td>
                            <td className="py-2">{row.fallback}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function EndpointCard({
    path,
    summary,
    children,
}: {
    path: string;
    summary: string;
    children: ReactNode;
}) {
    return (
        <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">GET</span>
                <h3 className="font-bold font-mono text-sm sm:text-base text-slate-800 dark:text-white break-all">{path}</h3>
            </div>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">{summary}</p>
            {children}
        </div>
    );
}

const apiLink = 'text-amber-700 dark:text-amber-400 hover:underline break-all';

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

                {/* 1. Why free */}
                <section className="space-y-4">
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
                            rate-limit code</strong>. Responses are cached at the CDN edge (an hour for prices, 30 minutes
                            for backtests), so repeated identical requests never even reach the server. The cache is the
                            protection. Hammering an endpoint mostly means hammering a cache.
                        </p>
                    </div>
                </section>

                {/* 2. Endpoints */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Terminal className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Endpoints</h2>
                    </div>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        All endpoints answer <code className="text-xs sm:text-sm bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">GET</code> and{' '}
                        <code className="text-xs sm:text-sm bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">OPTIONS</code>, send{' '}
                        <code className="text-xs sm:text-sm bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">Access-Control-Allow-Origin: *</code>{' '}
                        so browser <code className="text-xs sm:text-sm bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">fetch()</code> works
                        from any origin, and return errors as JSON with a plain-English{' '}
                        <code className="text-xs sm:text-sm bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">error</code> message.
                        Every parameter is optional.
                    </p>
                    <div className="space-y-4 sm:space-y-6">

                        <EndpointCard
                            path="/api/v1/prices"
                            summary="Daily BTC/USD closes as JSON: one [utcMidnightMs, close] pair per UTC day. Defaults to the full history, 2010-08-18 to today."
                        >
                            <ParamsTable rows={[
                                { name: 'from', values: 'ISO date (yyyy-MM-dd), clamped to 2010-08-18 at the early end', fallback: '2010-08-18' },
                                { name: 'to', values: 'ISO date, clamped to today at the late end', fallback: 'today' },
                                { name: 'provider', values: 'kraken or coinbase', fallback: 'kraken' },
                            ]} />
                            <CodeBlock>{`curl 'https://btcdollarcostaverage.com/api/v1/prices?from=2020-01-01&to=2020-12-31'`}</CodeBlock>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                Try it live:{' '}
                                <a href="/api/v1/prices?from=2024-01-01&to=2024-06-30" className={apiLink}>/api/v1/prices?from=2024-01-01&amp;to=2024-06-30</a>
                            </p>
                            <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">Response shape (values illustrative):</p>
                            <CodeBlock>{`{
  "source": "kraken",
  "asOf": "2026-08-11T09:00:00.000Z",
  "from": "2020-01-01",
  "to": "2020-12-31",
  "count": 366,
  "note": "All prices are USD, one close per UTC day. ...",
  "series": [
    [1577836800000, 7174.33],
    [1577923200000, 6965.71]
  ]
}`}</CodeBlock>
                        </EndpointCard>

                        <EndpointCard
                            path="/api/v1/prices.csv"
                            summary="The exact same series as a downloadable CSV with date,usd rows — one row per UTC day, ready for a spreadsheet or pandas. Same parameters as /api/v1/prices."
                        >
                            <CodeBlock>{`curl -o btc-usd-daily.csv 'https://btcdollarcostaverage.com/api/v1/prices.csv?provider=coinbase'`}</CodeBlock>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                Try it live:{' '}
                                <a href="/api/v1/prices.csv?from=2024-01-01&to=2024-06-30" className={apiLink}>/api/v1/prices.csv?from=2024-01-01&amp;to=2024-06-30</a>
                            </p>
                            <CodeBlock>{`date,usd
2024-01-01,44187.14
2024-01-02,44946.91
2024-01-03,42845.23`}</CodeBlock>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                Prices are rounded to cents (four decimals below $1, so the 2010&ndash;2011 era doesn&apos;t
                                flatten to zero). The JSON endpoint returns unrounded values. The body is pure data —
                                the provenance note travels in an <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">X-Data-Note</code> response header instead of comment rows.
                            </p>
                        </EndpointCard>

                        <EndpointCard
                            path="/api/v1/dca"
                            summary="A full DCA backtest — the same engine, same price pipeline, and same defaults as the on-site calculator ($50 every week for the last 5 years at a 0.5% fee)."
                        >
                            <ParamsTable rows={[
                                { name: 'amount', values: 'USD per purchase, > 0', fallback: '50' },
                                { name: 'frequency', values: 'daily, weekly, biweekly, monthly', fallback: 'weekly' },
                                { name: 'startDate', values: 'ISO date, clamped to 2010-08-18 at the early end', fallback: '5 years before endDate' },
                                { name: 'endDate', values: 'ISO date — future dates are clamped to today (this endpoint reports history only; the response flags the clamp)', fallback: 'today' },
                                { name: 'fee', values: 'exchange fee %, 0 to 50', fallback: '0.5' },
                                { name: 'provider', values: 'kraken or coinbase', fallback: 'kraken' },
                                { name: 'startingBtc', values: 'BTC already held at the start date, > 0', fallback: 'none' },
                                { name: 'startingCost', values: 'USD cost per BTC for the starting stack; omitted, the stack is costed at the start date’s price', fallback: 'start-date price' },
                                { name: 'esc', values: 'yearly purchase increase %, 0 to 200 — steps up on each 12-month anniversary. Out-of-range numeric params are clamped to their documented bounds', fallback: '0' },
                            ]} />
                            <CodeBlock>{`curl 'https://btcdollarcostaverage.com/api/v1/dca?amount=100&frequency=weekly&startDate=2020-01-01&endDate=2024-12-31&fee=0.5'`}</CodeBlock>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                Try it live:{' '}
                                <a href="/api/v1/dca?amount=100&frequency=weekly&startDate=2020-01-01&endDate=2024-12-31" className={apiLink}>/api/v1/dca?amount=100&amp;frequency=weekly&amp;startDate=2020-01-01&amp;endDate=2024-12-31</a>
                            </p>
                            <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">Response shape (values illustrative):</p>
                            <CodeBlock>{`{
  "inputs": {
    "amountUsd": 100, "frequency": "weekly",
    "startDate": "2020-01-01", "endDate": "2024-12-31",
    "feePercent": 0.5, "provider": "kraken"
  },
  "asOf": "2026-08-11T09:00:00.000Z",
  "currency": "USD",
  "totalInvested": 26100,
  "btcAccumulated": 0.9273,
  "averageCost": 28146.02,
  "currentValue": 86518.44,
  "profit": 60418.44,
  "roiPercent": 231.49,
  "xirrPercent": 48.7,
  "maxDrawdownPercent": 62.4,
  "purchaseCount": 261,
  "spotPriceUsd": 93301.5,
  "breakdownSampled": false,
  "breakdown": [
    {
      "date": "2020-01-01T00:00:00.000Z",
      "price": 7174.33,
      "invested": 100,
      "totalInvested": 100,
      "accumulated": 0.01387,
      "totalAccumulated": 0.01387,
      "portfolioValue": 99.5
    }
  ],
  "note": "All figures are USD. ..."
}`}</CodeBlock>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">xirrPercent</code> is
                                the money-weighted annualized return, null for windows under 90 days.{' '}
                                <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">breakdown</code> lists
                                one row per purchase, capped at ~2,000 rows: longer schedules are evenly thinned
                                (<code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">breakdownSampled: true</code>,
                                final purchase always kept, cumulative columns exact at every kept row), while{' '}
                                <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">purchaseCount</code> stays
                                the true total. The math itself is documented on the{' '}
                                <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline">methodology page</Link>.
                            </p>
                        </EndpointCard>

                    </div>
                </section>

                {/* 3. The honest bits */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <SearchCheck className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">The Honest Bits</h2>
                    </div>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Where the prices come from.</strong>{' '}
                            2010-08-18 through 2015-07-19 are real daily closes from a bundled blockchain.info snapshot —
                            that history no longer changes, so it ships with the site. From 2015-07-20 onward the series
                            comes from the exchange you pick: Coinbase gives real daily candles; Kraken gives weekly
                            closes that we linearly interpolate to daily, which smooths intra-week moves. If you need
                            genuine day-by-day prices for the modern era, use{' '}
                            <code className="text-xs sm:text-sm bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">provider=coinbase</code>.
                            Every response repeats this in its <code className="text-xs sm:text-sm bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">note</code> field,
                            so a downloaded series can&apos;t be mistaken for something it isn&apos;t.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Outages fall back silently.</strong>{' '}
                            If the exchange you asked for is unreachable, the server serves the other exchange&apos;s
                            series — or an up-to-an-hour-stale cache — rather than failing. That&apos;s the right trade
                            for availability, but it means the response cannot guarantee which exchange actually
                            produced it during an outage.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">USD only.</strong> Every number in
                            every endpoint is US dollars. The site&apos;s other display currencies are a display-time
                            conversion, and pretending the API had native EUR or JPY series would be dishonest.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Freshness.</strong> Price responses are
                            edge-cached for up to an hour, backtests for up to 30 minutes, and both may be served stale for
                            up to a day while revalidating. The series gains one candle per day, so this costs you almost
                            nothing — but don&apos;t use these endpoints as a live ticker.
                        </p>
                    </div>
                </section>

                {/* 4. Fair use */}
                <section className="space-y-4">
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
                            <Link href="/" className="text-amber-700 dark:text-amber-400 hover:underline">btcdollarcostaverage.com</Link>{' '}
                            is appreciated but not required. If your use case needs more than this (bulk, streaming,
                            something odd), <Link href="/contact" className="text-amber-700 dark:text-amber-400 hover:underline">get in touch</Link> —
                            the answer is probably yes.
                        </p>
                    </div>
                </section>

                {/* 5. Open source */}
                <section className="space-y-4">
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
                                className="inline-flex items-center gap-2 text-amber-700 dark:text-amber-400 hover:underline font-medium"
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
