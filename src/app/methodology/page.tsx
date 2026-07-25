import type { Metadata } from 'next';
import Link from 'next/link';
import { Database, Calculator, SearchCheck, AlertTriangle, History, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Methodology & Data Sources',
    description: 'How the Bitcoin DCA Calculator works: every data source we use, the exact DCA math (fees, average cost, ROI, XIRR, max drawdown), where prices are interpolated, and the known limitations.',
    keywords: ['bitcoin dca calculator methodology', 'dca calculator accuracy', 'bitcoin price data sources', 'xirr bitcoin', 'dca calculation formula'],
    alternates: {
        canonical: '/methodology',
    },
    openGraph: {
        title: 'Methodology & Data Sources',
        description: 'Every data source, every formula, every limitation. No black box: this is exactly how the calculator works.',
        url: '/methodology',
        type: 'article',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
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

const DATA_SOURCES = [
    { source: 'Kraken', provides: 'Weekly OHLC candles (default price series), interpolated to daily', cadence: 'Cached ~1 hour' },
    { source: 'Coinbase', provides: 'Real daily candles from 2015 onward (alternate price source)', cadence: 'Cached ~1 hour' },
    { source: 'mempool.space', provides: 'Block height, transaction fees, hash rate, difficulty, Lightning stats', cadence: '30s - 5 min' },
    { source: 'CoinGecko', provides: 'Global market cap and Bitcoin dominance', cadence: '~5 min' },
    { source: 'FRED (St. Louis Fed)', provides: 'CPI inflation series (inflation-adjusted returns)', cadence: 'Daily' },
    { source: 'Yahoo Finance', provides: 'S&P 500 (^GSPC) and Gold (GC=F) for asset comparisons', cadence: 'Cached ~1 hour' },
    { source: 'alternative.me', provides: 'Fear & Greed Index', cadence: '~5 min' },
    { source: 'blockchain.info', provides: 'Circulating BTC supply; daily market prices 2010-2015 (static snapshot)', cadence: '~5 min / fixed' },
    { source: 'frankfurter.app', provides: 'ECB reference FX rates (EUR, GBP, CAD, AUD, JPY display currencies)', cadence: '~12 hours' },
];

export default function MethodologyPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10 sm:space-y-16">

                {/* Hero */}
                <section className="text-center max-w-3xl mx-auto space-y-3 sm:space-y-4">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight text-balance">
                        Methodology &amp; <span className="text-amber-500">Data Sources</span>
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
                        A calculator you can&apos;t verify is a black box. This page lists every data source, walks
                        through the math behind each number, and is blunt about where the model falls short of reality.
                    </p>
                </section>

                {/* 1. Data Sources */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Database className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Data Sources</h2>
                    </div>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        Every request is proxied through our server so responses can be cached, and no personal data
                        is sent to any provider. The cadences below describe our own cache windows. They are not
                        guarantees from the providers.
                    </p>
                    <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
                        <div className="overflow-x-auto -mx-2 sm:mx-0">
                            <table className="w-full text-xs sm:text-sm min-w-[520px]">
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
                                            <td className="py-2 pr-3 font-medium whitespace-nowrap">{row.source}</td>
                                            <td className="py-2 pr-3">{row.provides}</td>
                                            <td className="py-2 tabular-nums whitespace-nowrap">{row.cadence}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                {/* 2. How the DCA math works */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Calculator className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">How the DCA Math Works</h2>
                    </div>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Purchase schedule.</strong> Purchases land
                            on UTC calendar days: daily, weekly (every 7 days), bi-weekly (every 14 days), or monthly
                            (same day-of-month, anchored to your start date). Exchange candles are UTC-aligned too.
                            Doing the same math in local time shifts the whole schedule by a day for anyone west of
                            Greenwich, which is why we don&apos;t.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Fees.</strong> Your fee percentage comes off
                            every purchase before conversion: <code className="text-xs sm:text-sm bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">btcBought = amount &times; (1 &minus; fee%) / price</code>.
                            The gross amount still counts as invested capital, so fees drag on returns here the same way
                            they do on a real exchange.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                            <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                                <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">Average Cost &amp; ROI</h3>
                                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                    Average cost = total invested &divide; total BTC accumulated.
                                    ROI = (current value &minus; total invested) &divide; total invested. Current value is
                                    total BTC &times; the latest price.
                                </p>
                            </div>
                            <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                                <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">XIRR (Annualized Return)</h3>
                                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                    The money-weighted annualized return: the discount rate at which the net present value of all
                                    your dated purchases plus the final portfolio value equals zero. We solve it numerically,
                                    with Newton&apos;s method and a bisection fallback. Under 90 days it isn&apos;t shown at
                                    all, because annualizing a window that short is meaningless.
                                </p>
                            </div>
                            <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                                <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">Max Drawdown</h3>
                                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                    The largest peak-to-trough decline in your portfolio&apos;s value across the purchase-day
                                    series, stated as a percentage of the preceding peak. It answers one question: how far
                                    underwater did the strategy go at its worst point?
                                </p>
                            </div>
                            <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                                <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">Currency Display</h3>
                                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                    All math runs in USD. The other display currencies (EUR, GBP, CAD, AUD, JPY) convert at
                                    current ECB reference rates from frankfurter.app, applied at display time. Historical FX
                                    rates are not used.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 3. Data honesty */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <SearchCheck className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Data Honesty</h2>
                    </div>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">The default series is interpolated.</strong>{' '}
                            Kraken, the default source, gives us weekly closes, which we linearly interpolate to daily values.
                            That smooths out intra-week volatility: a purchase on a Wednesday uses an estimate between two real
                            weekly closes, not the actual Wednesday price. Switch the source to Coinbase and you get real daily
                            candles from 2015 onward.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Early history uses real market prices.</strong>{' '}
                            For dates before an exchange&apos;s own candles begin, we fall back to actual daily market prices from
                            blockchain.info covering August 2010 through mid-2015. It&apos;s a static snapshot, since that history
                            no longer changes. No prices are fabricated. The earliest supported simulations start in August 2010
                            at around $0.07.
                        </p>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Gaps use the last known price.</strong> If a
                            scheduled purchase lands on a day with no price data, the simulation carries the most recent known
                            price forward rather than skipping the buy.
                        </p>
                    </div>
                </section>

                {/* 4. Limitations */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Known Limitations</h2>
                    </div>
                    <ul className="space-y-2 ml-1 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <li className="flex items-start gap-2">
                            <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span><strong className="text-slate-800 dark:text-slate-200">No taxes.</strong> Capital gains and income tax on rewards are not modeled, and neither are cost-basis accounting methods.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span><strong className="text-slate-800 dark:text-slate-200">No withdrawal fees.</strong> Moving coins to self-custody costs an on-chain network fee, often plus an exchange withdrawal fee. Both are excluded.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span><strong className="text-slate-800 dark:text-slate-200">No spread modeling.</strong> One fee percentage cannot capture bid-ask spreads or the price differences between exchanges, both of which can add a hidden cost on top of quoted fees.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span><strong className="text-slate-800 dark:text-slate-200">One price per day.</strong> Every purchase executes at the day&apos;s series price. Intraday timing is not simulated.</span>
                        </li>
                    </ul>
                </section>

                {/* 5. Changelog */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <History className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Changelog</h2>
                    </div>
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">July 2026</span>
                                <h3 className="font-bold text-sm sm:text-base text-slate-800 dark:text-white">Accuracy &amp; polish overhaul</h3>
                            </div>
                            <ul className="space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                <li className="flex items-start gap-2"><span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span><span>Fixed: future projections double-counted contributions in some scenarios.</span></li>
                                <li className="flex items-start gap-2"><span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span><span>Fixed: currency conversion inconsistencies across the comparison and planning tools.</span></li>
                                <li className="flex items-start gap-2"><span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span><span>Fixed: purchase dates now use UTC calendar days everywhere, eliminating timezone-dependent schedule shifts.</span></li>
                                <li className="flex items-start gap-2"><span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span><span>New: live ECB exchange rates (frankfurter.app) replace hardcoded currency rates.</span></li>
                                <li className="flex items-start gap-2"><span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span><span>New: XIRR (money-weighted annualized return) and max drawdown statistics.</span></li>
                                <li className="flex items-start gap-2"><span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span><span>New: redesigned charts with single-axis tabs, plus this methodology page.</span></li>
                                <li className="flex items-start gap-2"><span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span><span>New: real daily market prices (blockchain.info) for 2010&ndash;2015, replacing the earlier synthetic pre-2015 interpolation.</span></li>
                                <li className="flex items-start gap-2"><span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span><span>New: historical win-rate stat, the share of comparable DCA windows since 2010 that ended in profit.</span></li>
                                <li className="flex items-start gap-2"><span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span><span>New: result-specific share previews, plan-vs-plan comparison, and prerendered DCA scenario pages.</span></li>
                            </ul>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">February 2026</span>
                                <h3 className="font-bold text-sm sm:text-base text-slate-800 dark:text-white">Reliability pass</h3>
                            </div>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                API fetch timeouts, currency-aware labels across all tools, and the beginner-friendly mining guide.
                            </p>
                        </div>
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
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
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
