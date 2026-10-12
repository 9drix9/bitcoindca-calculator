import type { Metadata } from 'next';
import Link from 'next/link';
import { Code2, LayoutTemplate, SlidersHorizontal, ScrollText, ArrowRight } from 'lucide-react';
import { DEFAULT_PLAN } from '@/data/planDefaults';
import {
    DEFAULT_PRICE_PROVIDER,
    FIRST_EXCHANGE_CLOSE_DATE,
    PRICE_PROVIDERS,
    PRICE_PROVIDER_LABELS,
} from '@/data/priceSources';
import { DEFAULT_YEARS_BACK, EARLIEST_PRICE_DATE, formatUtc } from '@/utils/dates';
import { URL_PARAM_LIMITS } from '@/utils/urlParams';

export const metadata: Metadata = {
    // Absolute: the title already ends in the site's name, and the root
    // layout's template would append "| Bitcoin DCA Calculator" to it again.
    title: { absolute: 'Embed the Bitcoin DCA Calculator' },
    description: 'Put a live Bitcoin DCA result card on your own site with one line of HTML. Free, no API key, no tracking. Set the amount, frequency, start date, fees, currency, and theme.',
    keywords: ['bitcoin dca widget', 'embed bitcoin calculator', 'bitcoin dca iframe', 'btc calculator widget', 'embeddable bitcoin dca calculator'],
    alternates: {
        canonical: '/embed-guide',
    },
    openGraph: {
        images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
        title: 'Embed the Bitcoin DCA Calculator',
        description: 'A live, self-updating Bitcoin DCA result card for your site. One iframe, no API key, free to use.',
        url: '/embed-guide',
        type: 'article',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        images: ['/opengraph-image'],
        card: 'summary_large_image',
        title: 'Embed the Bitcoin DCA Calculator',
        description: 'A live, self-updating Bitcoin DCA result card for your site. One iframe, no API key, free to use.',
        creator: '@9drix9',
    },
};

const BASE_URL = 'https://btcdollarcostaverage.com';

const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
        { '@type': 'ListItem', position: 2, name: 'Embed Widget', item: `${BASE_URL}/embed-guide` },
    ],
};

const DEMO_QUERY = 'amount=50&frequency=weekly&startDate=2021-01-01&fee=0';

// "Aug 18, 2010" and "Jul 20, 2015", from the constants the price code uses.
const FIRST_PRICE_DAY = formatUtc(EARLIEST_PRICE_DATE, 'full');
const FIRST_EXCHANGE_DAY = formatUtc(FIRST_EXCHANGE_CLOSE_DATE, 'full');

const SNIPPET = `<iframe
  src="${BASE_URL}/embed?${DEMO_QUERY}"
  title="Bitcoin DCA Calculator"
  width="100%"
  height="300"
  loading="lazy"
  frameborder="0"
  style="border:0;max-width:600px;border-radius:16px"
></iframe>`;

// Defaults and limits are read from the code that applies them (the same
// decodeParams and resolveShareParams the widget runs), so this table cannot
// drift from the widget. It had: it listed kraken as the default provider and
// a start date that could fall before the first day there is a price for.
const PARAMS: { name: string; type: string; def: string; example: string }[] = [
    { name: 'amount', type: 'number > 0', def: String(DEFAULT_PLAN.amount), example: 'amount=100' },
    { name: 'frequency', type: 'daily | weekly | biweekly | monthly', def: DEFAULT_PLAN.frequency, example: 'frequency=monthly' },
    { name: 'startDate', type: 'YYYY-MM-DD', def: `${DEFAULT_YEARS_BACK} years before the end date`, example: 'startDate=2017-12-17' },
    { name: 'endDate', type: 'YYYY-MM-DD', def: 'today (UTC)', example: 'endDate=2024-12-31' },
    { name: 'fee', type: `number, 0-${URL_PARAM_LIMITS.maxFeePct} (percent per buy)`, def: String(DEFAULT_PLAN.feePercentage), example: 'fee=0' },
    { name: 'flat', type: `number, 0-${URL_PARAM_LIMITS.maxFlatFee.toLocaleString('en-US')} (fixed fee per buy, in the display currency)`, def: '0', example: 'flat=0.99' },
    { name: 'provider', type: PRICE_PROVIDERS.join(' | '), def: DEFAULT_PRICE_PROVIDER, example: 'provider=kraken' },
    { name: 'currency', type: 'USD | EUR | GBP | CAD | AUD | JPY', def: 'USD', example: 'currency=EUR' },
    { name: 'theme', type: 'light | dark | auto', def: 'auto', example: 'theme=dark' },
];

const EXAMPLES: { title: string; note: string; query: string }[] = [
    {
        title: '$250 per month since 2018, dark',
        note: 'Forced dark theme for a dark-background site.',
        query: 'amount=250&frequency=monthly&startDate=2018-01-01&fee=0&theme=dark',
    },
    {
        // 2017-12-17 is the day of Coinbase's highest BTC-USD trade of 2017
        // ($19,891.99), read from its own daily candles on 2026-10-12.
        title: '$25 per week since the 2017 top',
        note: 'Starts on December 17, 2017, the day bitcoin set its 2017 high on Coinbase, with a 1% fee on every buy. Priced from Coinbase.',
        query: 'amount=25&frequency=weekly&startDate=2017-12-17&fee=1&provider=coinbase',
    },
    {
        title: '€100 per week since 2020',
        note: 'Amounts and results shown in euros. Every buy is converted at one recent European Central Bank rate, not the rate on its own date. The card gives the date of that rate.',
        query: 'amount=100&frequency=weekly&startDate=2020-01-01&fee=0&currency=EUR',
    },
];

// A breadcrumb link is one short word, about 15px tall as text on a phone. The
// padding makes it a 44px touch target, and the negative margins hand the same
// space back so the row sits exactly where it did. Same string as the study
// pages use (lump-sum-vs-dca and its siblings).
const crumbLink =
    'inline-flex min-h-11 items-center -my-3.5 px-1.5 -mx-1.5 hover:text-amber-700 dark:hover:text-amber-400 transition-colors';

// A code chip inside muted (slate-500) text. It sets its own colour: inherited
// slate-500 on the chip's slate-100 background is 4.35:1, under the AA minimum.
const PARAM_CHIP = 'rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300';

// A box that scrolls sideways is focusable and named: without a tab stop there
// is no way to scroll it from the keyboard in Safari, which, unlike Chrome and
// Firefox, does not make a scroller focusable by itself.
const scrollRegion = (label: string) => ({ tabIndex: 0, role: 'region', 'aria-label': label }) as const;

function CodeBlock({ label, children }: { label: string; children: string }) {
    return (
        <div {...scrollRegion(label)} className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-900 dark:border-slate-800">
            <pre className="select-all p-4 text-[11px] leading-relaxed text-slate-100 sm:text-xs">
                <code>{children}</code>
            </pre>
        </div>
    );
}

export default function EmbedGuidePage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10 sm:space-y-16">

                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li>
                            <Link href="/" className={crumbLink}>Home</Link>
                        </li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Embed Widget</li>
                    </ol>
                </nav>

                {/* Hero */}
                <section className="text-center max-w-3xl mx-auto space-y-3 sm:space-y-4">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white text-balance">
                        Embed the <span className="text-amber-700 dark:text-amber-400">Bitcoin DCA Calculator</span>
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
                        One iframe drops a live Bitcoin dollar-cost-averaging result card into an article, a newsletter
                        archive, or a docs page. It shows what buying a fixed amount on a regular schedule would have
                        come to, worked out each time it loads from daily price history (refreshed hourly) and the
                        latest price. Free, no API key, no accounts, no tracking scripts.
                    </p>
                </section>

                {/* Live demo */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <LayoutTemplate className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">What it looks like</h2>
                    </div>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        What follows is the real widget, not a screenshot: $50 of Bitcoin every week since January 2021,
                        with no exchange fee. By default it follows whichever light or dark preference the reader&apos;s
                        browser reports.
                    </p>
                    <iframe
                        src={`/embed?${DEMO_QUERY}`}
                        title="Bitcoin DCA Calculator widget demo"
                        loading="lazy"
                        className="w-full max-w-[600px] h-[300px] rounded-2xl border-0"
                    />
                </section>

                {/* Snippet */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Code2 className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Copy the code</h2>
                    </div>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        Paste this wherever the card should appear, then swap the query parameters for whatever
                        scenario your piece is about. One click on the block selects all of it.
                    </p>
                    <CodeBlock label="Embed code">{SNIPPET}</CodeBlock>
                    <div className="rounded-2xl border border-slate-200 bg-slate-100 p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900/50">
                        <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">Sizing</h3>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                            The card is responsive and has no fixed pixel width. It&apos;s built for roughly
                            400&ndash;600&nbsp;px wide and 300&ndash;340&nbsp;px tall, and 300&nbsp;px of height is the
                            sweet spot. Below about 320&nbsp;px wide the text stays legible but gets tight. Set the
                            iframe width to <code className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">100%</code>,{' '}
                            cap it with <code className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">max-width</code>,{' '}
                            and it adapts on mobile.
                        </p>
                        <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                            The small line above the figure states the plan and what shaped the number: the
                            fee, an end date in the future, the exchange rate behind a currency other than US
                            dollars and, with <code className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">provider=kraken</code>,{' '}
                            how many buy prices are estimates. In a column narrower than about 500&nbsp;px
                            that line often takes a second row, which 300&nbsp;px of height still fits. A
                            third row, from several of these together on a phone, needs about 310&nbsp;px,
                            and each row after that 15&nbsp;px more.
                        </p>
                    </div>
                </section>

                {/* Parameters */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <SlidersHorizontal className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Parameters</h2>
                    </div>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        Every parameter is optional. One that is missing, or holds a value the widget cannot use,
                        falls back to its default, so even a bare{' '}
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">/embed</code>{' '}
                        URL renders a sensible card. Settings that leave nothing to work out (an amount of zero, a
                        flat fee as large as the amount, a start date after the end date or after today) show a
                        short explanation in place of the figures.
                    </p>
                    <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
                        <div {...scrollRegion('Embed parameters')} className="overflow-x-auto -mx-2 sm:mx-0">
                            <table className="w-full text-xs sm:text-sm min-w-[560px]">
                                <thead>
                                    {/* slate-600, not 500: on this slate-100 panel slate-500 is 4.35:1, under the 4.5:1 AA minimum for text this size. */}
                                    <tr className="text-left text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                        <th className="pb-2 pr-3 font-medium">Parameter</th>
                                        <th className="pb-2 pr-3 font-medium">Accepted values</th>
                                        <th className="pb-2 pr-3 font-medium">Default</th>
                                        <th className="pb-2 font-medium">Example</th>
                                    </tr>
                                </thead>
                                <tbody className="text-slate-700 dark:text-slate-300">
                                    {PARAMS.map((row) => (
                                        <tr key={row.name} className="border-t border-slate-200 dark:border-slate-700/50 align-top">
                                            <td className="py-2 pr-3 whitespace-nowrap">
                                                <code className="font-medium text-amber-700 dark:text-amber-400">{row.name}</code>
                                            </td>
                                            <td className="py-2 pr-3">{row.type}</td>
                                            <td className="py-2 pr-3 whitespace-nowrap">{row.def}</td>
                                            <td className="py-2">
                                                <code className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400">{row.example}</code>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        Dates are UTC calendar days, and amounts are denominated in whichever display currency you pick.
                        A start date before {FIRST_PRICE_DAY}, the first day of our price data, is moved up to that
                        day, and the default start date is never earlier than it. The card counts only purchases
                        that have already happened: give it an end date in the future and it shows the plan up to
                        today and says when the plan ends.
                    </p>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        A card in a currency other than US dollars is the dollar result converted. Every buy uses
                        one recent European Central Bank reference rate, not the rate on its own date, so the
                        bitcoin stacked and the return differ from what a buyer in that currency would have got.
                        The card gives the date of the rate it used.
                    </p>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        With <code className={PARAM_CHIP}>provider=coinbase</code>{' '}
                        the prices from {FIRST_EXCHANGE_DAY} on are {PRICE_PROVIDER_LABELS.coinbase.cadence}. With{' '}
                        <code className={PARAM_CHIP}>provider=kraken</code>{' '}
                        they are {PRICE_PROVIDER_LABELS.kraken.cadence}, and the card says how many of its buy prices are
                        estimates. Earlier dates use the same bundled blockchain.info series either way. Results come
                        from the same engine and data as the main calculator; the{' '}
                        <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline">methodology</Link>{' '}
                        page spells out exactly how each number is computed.
                    </p>
                </section>

                {/* Examples */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <LayoutTemplate className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Examples</h2>
                    </div>
                    <div className="space-y-8">
                        {EXAMPLES.map((example) => (
                            <div key={example.query} className="space-y-3">
                                <div>
                                    <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white">{example.title}</h3>
                                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">{example.note}</p>
                                </div>
                                <iframe
                                    src={`/embed?${example.query}`}
                                    title={`Bitcoin DCA Calculator widget: ${example.title}`}
                                    loading="lazy"
                                    className="w-full max-w-[600px] h-[300px] rounded-2xl border-0"
                                />
                                <CodeBlock label={`Embed code: ${example.title}`}>{`<iframe src="${BASE_URL}/embed?${example.query}" title="Bitcoin DCA Calculator" width="100%" height="300" loading="lazy" frameborder="0" style="border:0;max-width:600px"></iframe>`}</CodeBlock>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Terms */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <ScrollText className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Terms</h2>
                    </div>
                    <ul className="space-y-2 ml-1 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span>Free to embed on any site, personal or commercial. No permission needed, no attribution beyond the widget itself.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span>
                                Please leave the attribution link inside the card intact. It is how your readers reach
                                the full calculator. The widget itself shows no ads; the labeled ads and affiliate links
                                on the site&apos;s own pages are there to help cover hosting, and the price data comes
                                from free public sources.{' '}
                                <Link href="/about#ads-and-analytics" className="text-amber-700 dark:text-amber-400 hover:underline">How the site is funded</Link>.
                            </span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span>
                                The widget loads no third-party scripts, sets no cookies and runs no analytics. As with
                                any iframe, the reader&apos;s browser requests it from our host (Vercel), which receives
                                the usual details of a web request, such as the IP address.
                            </span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span>Results are a historical simulation for education, not financial advice. Past performance does not guarantee future results.</span>
                        </li>
                    </ul>
                </section>

                {/* CTA */}
                <section className="text-center bg-slate-100 dark:bg-slate-900/50 p-6 sm:p-10 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
                        Build the scenario first
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mb-5 max-w-xl mx-auto">
                        Set the amount, schedule, dates, and fees in the full calculator, then copy those same
                        values into your embed URL. Leave out{' '}
                        <code className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">endDate</code>{' '}
                        and the card keeps running to today.
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                    >
                        Open the Calculator
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </section>

            </div>
        </>
    );
}
