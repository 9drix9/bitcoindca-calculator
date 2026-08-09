import type { Metadata } from 'next';
import Link from 'next/link';
import { Code2, LayoutTemplate, SlidersHorizontal, ScrollText, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
    // Root layout template appends "| Bitcoin DCA Calculator", so no suffix here.
    title: 'Embed the Bitcoin DCA Calculator',
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

const SNIPPET = `<iframe
  src="${BASE_URL}/embed?${DEMO_QUERY}"
  title="Bitcoin DCA Calculator"
  width="100%"
  height="300"
  loading="lazy"
  frameborder="0"
  style="border:0;max-width:600px;border-radius:16px"
></iframe>`;

const PARAMS: { name: string; type: string; def: string; example: string }[] = [
    { name: 'amount', type: 'number > 0', def: '50', example: 'amount=100' },
    { name: 'frequency', type: 'daily | weekly | biweekly | monthly', def: 'weekly', example: 'frequency=monthly' },
    { name: 'startDate', type: 'YYYY-MM-DD', def: '5 years before the end date', example: 'startDate=2017-12-17' },
    { name: 'endDate', type: 'YYYY-MM-DD', def: 'today (UTC)', example: 'endDate=2024-12-31' },
    { name: 'fee', type: 'number, 0-50 (percent per buy)', def: '0.5', example: 'fee=0' },
    { name: 'provider', type: 'kraken | coinbase', def: 'kraken', example: 'provider=coinbase' },
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
        title: '$25 per week since the 2017 top',
        note: 'A worst-possible-entry scenario with a 1% exchange fee, priced from Coinbase.',
        query: 'amount=25&frequency=weekly&startDate=2017-12-17&fee=1&provider=coinbase',
    },
    {
        title: '€100 per week since 2020',
        note: 'Amounts and results shown in euros.',
        query: 'amount=100&frequency=weekly&startDate=2020-01-01&fee=0&currency=EUR',
    },
];

function CodeBlock({ children }: { children: string }) {
    return (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-900 dark:border-slate-800">
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
                            <Link href="/" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">Home</Link>
                        </li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Embed Widget</li>
                    </ol>
                </nav>

                {/* Hero */}
                <section className="text-center max-w-3xl mx-auto space-y-3 sm:space-y-4">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white text-balance">
                        Embed the <span className="text-amber-500">Bitcoin DCA Calculator</span>
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
                        One iframe drops a live Bitcoin dollar-cost-averaging result card into an article, a newsletter
                        archive, or a docs page. It recomputes against real market prices every hour.
                        Free, no API key, no accounts, no tracking scripts.
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
                    <CodeBlock>{SNIPPET}</CodeBlock>
                    <div className="rounded-2xl border border-slate-200 bg-slate-100 p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900/50">
                        <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">Sizing</h3>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                            The card is responsive and has no fixed pixel width. It&apos;s built for roughly
                            400&ndash;600&nbsp;px wide and 250&ndash;340&nbsp;px tall, and 300&nbsp;px of height is the
                            sweet spot. Below about 320&nbsp;px wide the text stays legible but gets tight. Set the
                            iframe width to <code className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">100%</code>,{' '}
                            cap it with <code className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">max-width</code>,{' '}
                            and it adapts on mobile.
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
                        Every parameter is optional. Anything missing or invalid falls back to its default, so even a bare{' '}
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">/embed</code>{' '}
                        URL renders a sensible card.
                    </p>
                    <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
                        <div className="overflow-x-auto -mx-2 sm:mx-0">
                            <table className="w-full text-xs sm:text-sm min-w-[560px]">
                                <thead>
                                    <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
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
                        Results come from the same engine and data as the main calculator; the{' '}
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
                                <CodeBlock>{`<iframe src="${BASE_URL}/embed?${example.query}" title="Bitcoin DCA Calculator" width="100%" height="300" loading="lazy" frameborder="0" style="border:0;max-width:600px"></iframe>`}</CodeBlock>
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
                            <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span>Free to embed on any site, personal or commercial. No permission needed, no attribution beyond the widget itself.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span>Please leave the attribution link inside the card intact. That link is what pays for the data and the hosting.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span>The widget loads no third-party scripts, sets no cookies, and collects nothing from your readers.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
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
                        Dial in the amount, cadence, dates, and fees in the full calculator, then copy those same
                        values into your embed URL.
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
