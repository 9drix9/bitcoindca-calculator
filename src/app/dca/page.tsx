import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SCENARIO_AMOUNTS, SCENARIO_FREQ_SLUGS, SCENARIOS } from './scenarios';

export const revalidate = 86400;

// Root layout template appends "| Bitcoin DCA Calculator".
export const metadata: Metadata = {
    title: 'Bitcoin DCA Scenarios: What Steady Buying Would Be Worth',
    description:
        'Browse 104 precomputed Bitcoin dollar-cost averaging scenarios: $10 to $250 every week or month, starting any year from 2013 to 2025. Each one is refreshed daily with total invested, value today, ROI, and BTC accumulated.',
    alternates: {
        canonical: '/dca',
    },
    openGraph: {
        title: 'Bitcoin DCA Scenarios: What Steady Buying Would Be Worth',
        description:
            'Precomputed Bitcoin DCA outcomes: $10 to $250 every week or month, starting 2013 to 2025. Real historical prices, refreshed daily.',
        type: 'website',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Bitcoin DCA Scenarios: What Steady Buying Would Be Worth',
        description:
            'Precomputed Bitcoin DCA outcomes: $10 to $250 every week or month, starting 2013 to 2025. Real historical prices, refreshed daily.',
        creator: '@9drix9',
    },
};

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
                        Bitcoin <span className="text-amber-500">DCA</span> Scenarios
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                        What would steady buying have done? Each page below takes one fixed schedule (a set amount of
                        Bitcoin bought every week or month since January 1 of the chosen year) and runs it against real
                        historical prices. Results refresh daily. Pick a plan to see the total invested, what it&apos;s
                        worth today, and the year-by-year breakdown.
                    </p>
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
                                                className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors tabular-nums"
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
                        These pages cover the common schedules. For anything else, the live calculator takes any
                        amount, cadence, date range, and fee, running on the same historical data from Kraken
                        and Coinbase.
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
