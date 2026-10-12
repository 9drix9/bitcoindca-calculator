import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { FIRST_EXCHANGE_CLOSE_TS } from '@/data/priceSources';
import { CURATED_SCENARIOS, SCENARIO_AMOUNTS, SCENARIO_FREQ_SLUGS, SCENARIOS } from './scenarios';

export const revalidate = 86400;

// Root layout template appends "| Bitcoin DCA Calculator".
export const metadata: Metadata = {
    title: 'Bitcoin DCA Scenarios: What Steady Buying Would Be Worth',
    // Both counts are read off the lists so the snippet cannot outlive a change
    // to them, and together they are the number of links on the page.
    description:
        `${SCENARIOS.length} Bitcoin DCA scenarios, $10 to $250 weekly or monthly from 2013 to 2025, and ${CURATED_SCENARIOS.length} hand-picked plans. Total invested, value today, ROI and BTC, refreshed daily.`,
    alternates: {
        canonical: '/dca',
    },
    openGraph: {
        images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
        title: 'Bitcoin DCA Scenarios: What Steady Buying Would Be Worth',
        description:
            'Precomputed Bitcoin DCA outcomes: $10 to $250 every week or month, starting 2013 to 2025. Real historical prices, refreshed daily.',
        type: 'website',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        images: ['/opengraph-image'],
        card: 'summary_large_image',
        title: 'Bitcoin DCA Scenarios: What Steady Buying Would Be Worth',
        description:
            'Precomputed Bitcoin DCA outcomes: $10 to $250 every week or month, starting 2013 to 2025. Real historical prices, refreshed daily.',
        creator: '@9drix9',
    },
};

/** "July 20, 2015", the date style of the scenario pages, read off the day the code switches series. */
const FIRST_EXCHANGE_DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })
    .format(FIRST_EXCHANGE_CLOSE_TS);

const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://btcdollarcostaverage.com' },
        { '@type': 'ListItem', position: 2, name: 'DCA Scenarios', item: 'https://btcdollarcostaverage.com/dca' },
    ],
};

export default function DcaScenariosIndexPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10 sm:space-y-14">

                {/* Hero */}
                <section className="text-center max-w-3xl mx-auto space-y-3 sm:space-y-4">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white text-balance">
                        Bitcoin <span className="text-amber-700 dark:text-amber-400">DCA</span> Scenarios
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                        What would steady buying have done? DCA, or dollar-cost averaging, means buying the same amount
                        on a fixed schedule whatever the price is doing. Each page below takes one such plan and runs
                        it against real historical prices, refreshed daily. Most are a set amount of Bitcoin bought
                        every week or month since January 1 of the year you pick. The hand-picked ones at the top keep
                        their own dates and schedules. Pick a plan to see the total invested, what it&apos;s worth
                        today, and the year-by-year breakdown.
                    </p>
                </section>

                {/* Curated story scenarios — the ones with a hook worth sharing */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        The interesting ones
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">
                        Hand-picked schedules with a story: a plan started on the day of a record high, a daily
                        coffee&apos;s worth, a single calendar year. Real dates, real prices, no cherry-picking
                        beyond what the title says.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                        {CURATED_SCENARIOS.map((s) => (
                            <Link
                                key={s.slug}
                                href={`/dca/${s.slug}`}
                                className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 hover:border-amber-500/50 transition-colors"
                            >
                                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">{s.title}</span>
                                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{s.shortLabel}</span>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* Scenario grid, grouped by amount */}
                {SCENARIO_AMOUNTS.map((amount) => (
                    <section key={amount} className="space-y-4">
                        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                            ${amount} per purchase
                        </h2>
                        {SCENARIO_FREQ_SLUGS.map((freqSlug) => (
                            <div key={freqSlug} className="space-y-2">
                                <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    {freqSlug === 'week' ? 'Weekly buys' : 'Monthly buys'}
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                                    {SCENARIOS
                                        .filter((s) => s.amount === amount && s.freqSlug === freqSlug)
                                        .map((s) => (
                                            <Link
                                                key={s.slug}
                                                href={`/dca/${s.slug}`}
                                                /* py-3 + a 20px line is the 44px touch floor; py-2.5 came to 40. */
                                                className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors tabular-nums"
                                            >
                                                {s.shortLabel}
                                            </Link>
                                        ))}
                                </div>
                            </div>
                        ))}
                    </section>
                ))}

                {/* CTA */}
                <section className="text-center bg-slate-100 dark:bg-slate-900/50 p-6 sm:p-10 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
                        Backtest your own plan
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mb-5 max-w-xl mx-auto">
                        These pages cover the common schedules. For anything else, use the live calculator. It takes any
                        amount, cadence, date range and fee, and prices it from the same daily history these pages
                        use: Coinbase&apos;s daily closes from {FIRST_EXCHANGE_DAY}, and blockchain.info&apos;s daily
                        prices before that.
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                    >
                        Open the calculator
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </section>

                {/* Disclaimer */}
                <p className="border-t border-slate-200 dark:border-slate-800 pt-6 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Not financial advice. Scenario results are historical simulations for educational purposes; past
                    performance does not guarantee future results.
                </p>

            </div>
        </>
    );
}
