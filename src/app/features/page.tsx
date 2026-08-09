import type { Metadata } from 'next';
import Link from 'next/link';
import {
    Calculator,
    TrendingUp,
    PiggyBank,
    BarChart3,
    Calendar,
    DollarSign,
    Repeat,
    Download,
    Share2,
    Target,
    Flame,
    Scale,
    Clock,
    Zap,
    Activity,
    Gauge,
    Database,
    Globe,
    Coins,
    LineChart,
    Table,
    Sparkles,
    ImageIcon,
    Wallet,
    ArrowRight,
    CheckCircle2,
    Boxes,
    Shield,
    Cpu,
} from 'lucide-react';

export const metadata: Metadata = {
    title: 'Features Guide',
    description: 'How every feature of the Bitcoin DCA Calculator works: the backtester, the comparison tools, the goal trackers, and the live network widgets, explained in plain terms.',
    keywords: ['bitcoin calculator guide', 'dca calculator tutorial', 'bitcoin tools explained', 'crypto calculator features'],
    alternates: {
        canonical: '/features',
    },
    openGraph: {
        images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
        title: 'Features Guide',
        description: 'Every tool in the Bitcoin DCA Calculator explained: backtesting, comparisons, goal tracking, fee analysis, and live network widgets.',
        url: '/features',
        type: 'article',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        images: ['/opengraph-image'],
        card: 'summary_large_image',
        title: 'Features Guide',
        description: 'Every tool in the Bitcoin DCA Calculator explained: backtesting, comparisons, goal tracking, fee analysis, and live network widgets.',
        creator: '@9drix9',
    },
};

const FeatureCard = ({
    icon: Icon,
    title,
    description,
    color = 'amber',
}: {
    icon: React.ElementType;
    title: string;
    description: string;
    color?: 'amber' | 'blue' | 'green' | 'purple' | 'red' | 'cyan';
}) => {
    const colorClasses = {
        amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
        blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
        green: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
        purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
        red: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
        cyan: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400',
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5">
            <div className={`w-10 h-10 rounded-lg ${colorClasses[color]} flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-slate-800 dark:text-white mb-2">{title}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{description}</p>
        </div>
    );
};

const SectionHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
    <div className="mb-6 sm:mb-8">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2">{title}</h2>
        <p className="text-slate-600 dark:text-slate-400">{subtitle}</p>
    </div>
);

const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://btcdollarcostaverage.com" },
        { "@type": "ListItem", "position": 2, "name": "Features Guide", "item": "https://btcdollarcostaverage.com/features" },
    ],
};

export default function FeaturesPage() {
    return (
        <>
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
            {/* Hero */}
            <section className="text-center mb-12 sm:mb-16">
                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-4">
                    Features Guide
                </h1>
                <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto mb-6">
                    A plain-English tour of every tool on the site: what each one does,
                    what its numbers mean, and when it&apos;s worth your time.
                </p>
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors"
                >
                    Try the Calculator
                    <ArrowRight className="w-4 h-4" />
                </Link>
            </section>

            {/* Quick Overview */}
            <section className="mb-12 sm:mb-16">
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-2xl border border-amber-200 dark:border-amber-800/50 p-6 sm:p-8">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">What is Dollar Cost Averaging (DCA)?</h2>
                    <p className="text-slate-700 dark:text-slate-300 mb-4 leading-relaxed">
                        Dollar cost averaging means putting a fixed amount into an asset at regular intervals, whatever the
                        price happens to be that day. You give up on trying to &quot;time the market&quot; and buy on a
                        schedule instead, letting the average price work itself out over the long run.
                    </p>
                    <div className="grid sm:grid-cols-3 gap-4 mt-6">
                        <div className="flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                            <div>
                                <div className="font-medium text-slate-800 dark:text-white text-sm">Reduces Risk</div>
                                <div className="text-xs text-slate-600 dark:text-slate-400">Smooths out price volatility</div>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                            <div>
                                <div className="font-medium text-slate-800 dark:text-white text-sm">No Timing Needed</div>
                                <div className="text-xs text-slate-600 dark:text-slate-400">Just invest consistently</div>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                            <div>
                                <div className="font-medium text-slate-800 dark:text-white text-sm">Builds Discipline</div>
                                <div className="text-xs text-slate-600 dark:text-slate-400">Automatic investing habit</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Main Calculator */}
            <section className="mb-12 sm:mb-16">
                <SectionHeader
                    title="The DCA Calculator"
                    subtitle="The core tool: what a given buying schedule would have been worth."
                />
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FeatureCard
                        icon={DollarSign}
                        title="Investment Amount"
                        description="How much goes in each period. Any number works, and $10 or $20 a week adds up faster than most people expect."
                        color="green"
                    />
                    <FeatureCard
                        icon={Repeat}
                        title="Frequency Options"
                        description="Daily, weekly, bi-weekly (every 2 weeks), or monthly. Weekly is the most popular choice among people who buy by hand."
                        color="blue"
                    />
                    <FeatureCard
                        icon={Calendar}
                        title="Date Range"
                        description="Set a start and an end date. Past dates backtest against real prices; an end date in the future switches the tool over to projections."
                        color="purple"
                    />
                    <FeatureCard
                        icon={Calculator}
                        title="Fee Percentage"
                        description="Exchange fees usually land somewhere between 0.1% and 1.5%. Enter yours and every return on the page accounts for the drag."
                        color="amber"
                    />
                    <FeatureCard
                        icon={Globe}
                        title="Currency Support"
                        description="Results display in USD, EUR, GBP, CAD, AUD, or JPY. The math always runs in USD and converts at display time."
                        color="cyan"
                    />
                    <FeatureCard
                        icon={Database}
                        title="Price Sources"
                        description="Kraken or Coinbase historical data, your pick. Both are major exchanges with price history going back years."
                        color="red"
                    />
                </div>

                <div className="mt-6 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700">
                    <h4 className="font-semibold text-slate-800 dark:text-white mb-2 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        Preset Scenarios
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                        Not sure where to start? The preset buttons load a common scenario in one click:
                    </p>
                    <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                        <li>&bull; <strong>$50/week for 5 years</strong>: the classic long-term schedule</li>
                        <li>&bull; <strong>$100/week for 3 years</strong>: shorter window, bigger contributions</li>
                        <li>&bull; <strong>&quot;What if I bought the peak?&quot;</strong>: how DCA recovers when you start at an all-time high</li>
                    </ul>
                </div>
            </section>

            {/* Results & Analysis */}
            <section className="mb-12 sm:mb-16">
                <SectionHeader
                    title="Results & Analysis Tools"
                    subtitle="What the results screen shows you, line by line."
                />
                <div className="grid sm:grid-cols-2 gap-4">
                    <FeatureCard
                        icon={Wallet}
                        title="Portfolio Summary"
                        description="Total invested, BTC accumulated, current value, and profit or loss in a single row. One toggle switches the balance between BTC and satoshis, the smallest Bitcoin unit."
                        color="amber"
                    />
                    <FeatureCard
                        icon={LineChart}
                        title="Performance Chart"
                        description="Portfolio value plotted across the whole period, stepping up with each purchase. There's an optional M2 money supply overlay if you want that comparison."
                        color="blue"
                    />
                    <FeatureCard
                        icon={Table}
                        title="Transaction History"
                        description="Every purchase in a table: date, BTC price, amount invested, BTC bought, fees paid, and running totals."
                        color="green"
                    />
                    <FeatureCard
                        icon={Download}
                        title="CSV Export"
                        description="Pull the whole transaction history down as a spreadsheet. Useful for tax records, your own tracking, or importing somewhere else."
                        color="purple"
                    />
                    <FeatureCard
                        icon={Share2}
                        title="Share Link"
                        description="Generates a URL carrying your exact settings. Handy for showing someone a scenario, or just bookmarking your own."
                        color="cyan"
                    />
                    <FeatureCard
                        icon={Sparkles}
                        title="Future Projections"
                        description="Set an end date in the future and the tool projects forward from three editable annual rates: a loss, no change, and a gain (−20%, 0%, +20% by default). They are assumptions you can change, not forecasts."
                        color="purple"
                    />
                </div>
            </section>

            {/* Comparison Tools */}
            <section className="mb-12 sm:mb-16">
                <SectionHeader
                    title="Comparison Tools"
                    subtitle="How the same money would have fared somewhere else."
                />
                <div className="grid sm:grid-cols-2 gap-4">
                    <FeatureCard
                        icon={Scale}
                        title="DCA vs Lump Sum"
                        description="The same total, dropped in all at once on day one. Sometimes lump sum wins and sometimes DCA does; this tells you which it was for your period."
                        color="blue"
                    />
                    <FeatureCard
                        icon={BarChart3}
                        title="Asset Comparison"
                        description="Bitcoin against the S&P 500 and gold over the same window, using real historical market data."
                        color="green"
                    />
                    <FeatureCard
                        icon={PiggyBank}
                        title="Savings Account Comparison"
                        description="The same schedule parked in a high-yield savings account instead, with compound interest. Rates sit around 4-5% APY (annual percentage yield) and vary by bank, so the rate is fully adjustable."
                        color="amber"
                    />
                    <FeatureCard
                        icon={TrendingUp}
                        title="Inflation-Adjusted Returns"
                        description="Your returns in real terms, deflated by official CPI data from the Federal Reserve. What's left over is the gain in purchasing power."
                        color="red"
                    />
                </div>
            </section>

            {/* Planning Tools */}
            <section className="mb-12 sm:mb-16">
                <SectionHeader
                    title="Planning & Goal Tools"
                    subtitle="Set a target, then find out what it takes to get there."
                />
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FeatureCard
                        icon={Target}
                        title="Stacking Goal Tracker"
                        description="Pick a target: 0.1 BTC, a whole coin, whatever you're after. The tracker shows how far along you are and how long the rest takes at your current pace."
                        color="amber"
                    />
                    <FeatureCard
                        icon={TrendingUp}
                        title="Price Scenarios"
                        description="Type in a price ($100k, $500k, $1M) and see what your stack would be worth there. It's arithmetic, not a forecast."
                        color="green"
                    />
                    <FeatureCard
                        icon={Flame}
                        title="FIRE Calculator"
                        description="Financial Independence, Retire Early. Enter your monthly expenses and it works backward to the Bitcoin price at which your holdings could cover them."
                        color="red"
                    />
                    <FeatureCard
                        icon={Coins}
                        title="Unit Bias Calculator"
                        description="Bitcoin looks expensive until you count in satoshis. One BTC is 100 million sats, and a million sats is a far more reachable target than a whole coin."
                        color="purple"
                    />
                    <FeatureCard
                        icon={Calculator}
                        title="Opportunity Cost Calculator"
                        description="Enter a past date and an amount to see what that money would be worth today had you bought Bitcoin with it. Sometimes reassuring, sometimes not."
                        color="blue"
                    />
                    <FeatureCard
                        icon={ImageIcon}
                        title="Share My Stack"
                        description="Renders your DCA results as an image built for social media: total invested, current value, and return."
                        color="cyan"
                    />
                </div>
            </section>

            {/* Fee & Cost Tools */}
            <section className="mb-12 sm:mb-16">
                <SectionHeader
                    title="Fee & Cost Analysis"
                    subtitle="Where the money leaks out on its way in."
                />
                <div className="grid sm:grid-cols-2 gap-4">
                    <FeatureCard
                        icon={Calculator}
                        title="Exchange Fee Comparison"
                        description="Fees side by side across Coinbase, Kraken, Binance, Cash App, Strike, Swan, and River, totaled for your specific buying pattern."
                        color="amber"
                    />
                    <FeatureCard
                        icon={BarChart3}
                        title="Cost Basis Tracker"
                        description="Your average purchase price as it moves over time. That number is your break-even line, and it's what tax reporting is built on."
                        color="green"
                    />
                </div>
            </section>

            {/* Live Dashboard Widgets */}
            <section className="mb-12 sm:mb-16">
                <SectionHeader
                    title="Live Dashboard Widgets"
                    subtitle="Network and market data, refreshed while you watch."
                />
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FeatureCard
                        icon={Clock}
                        title="Halving Countdown"
                        description="New supply gets cut in half roughly every 4 years. The widget counts down to the next halving, historically a bullish catalyst."
                        color="amber"
                    />
                    <FeatureCard
                        icon={Boxes}
                        title="Live Blocks Feed"
                        description="New blocks as they're mined, with height, time, transaction count, and size. Refreshes every 30 seconds."
                        color="purple"
                    />
                    <FeatureCard
                        icon={Gauge}
                        title="Fear & Greed Index"
                        description="A sentiment gauge running from 0 (Extreme Fear) to 100 (Extreme Greed). When everyone else is fearful, it might be a good time to buy."
                        color="green"
                    />
                    <FeatureCard
                        icon={Activity}
                        title="Mempool Fees"
                        description="What it costs right now to confirm a transaction fast, medium, or slow. Worth a glance before you withdraw from an exchange."
                        color="blue"
                    />
                    <FeatureCard
                        icon={BarChart3}
                        title="Hash Rate & Difficulty"
                        description="The security side of the network: current hash rate, difficulty, and an estimate of the next adjustment. More hash rate means a more expensive chain to attack."
                        color="red"
                    />
                    <FeatureCard
                        icon={Database}
                        title="Supply Scarcity"
                        description="Roughly 95% of the 21 million Bitcoin cap has already been mined. This tracks the exact percentage and how much supply is left."
                        color="amber"
                    />
                    <FeatureCard
                        icon={DollarSign}
                        title="Purchasing Power"
                        description="What $100 has lost since 2015, set against what Bitcoin gained over the same stretch. Inflation on one line, appreciation on the other."
                        color="green"
                    />
                    <FeatureCard
                        icon={Zap}
                        title="Lightning Network Stats"
                        description="Lightning settles Bitcoin payments instantly and for close to nothing. This shows total nodes, channels, and network capacity."
                        color="cyan"
                    />
                    <FeatureCard
                        icon={Globe}
                        title="Bitcoin Dominance"
                        description="Bitcoin's share of the total cryptocurrency market cap. Rising dominance often means Bitcoin is outperforming altcoins."
                        color="purple"
                    />
                    <FeatureCard
                        icon={Coins}
                        title="Sat Converter"
                        description="USD to satoshis at the current price. Type in a dollar amount, get the sat count."
                        color="amber"
                    />
                </div>
            </section>

            {/* Educational Content */}
            <section className="mb-12 sm:mb-16">
                <SectionHeader
                    title="Educational Resources"
                    subtitle="Longer reads, for when the numbers start raising questions."
                />
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Link href="/why-bitcoin" className="group">
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 h-full hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 flex items-center justify-center">
                                    <TrendingUp className="w-5 h-5" />
                                </div>
                                <ArrowRight className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors" />
                            </div>
                            <h3 className="font-semibold text-slate-800 dark:text-white mb-2">Why Bitcoin?</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                Where Bitcoin&apos;s value comes from: user adoption, network effects, mining costs, and the case for exiting fiat currency.
                            </p>
                        </div>
                    </Link>
                    <Link href="/self-custody" className="group">
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 h-full hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 flex items-center justify-center">
                                    <Shield className="w-5 h-5" />
                                </div>
                                <ArrowRight className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors" />
                            </div>
                            <h3 className="font-semibold text-slate-800 dark:text-white mb-2">Self-Custody Guide</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                Why holding your own keys matters, how hardware wallets work, and how to store Bitcoin without losing it.
                            </p>
                        </div>
                    </Link>
                    <Link href="/mining" className="group">
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 h-full hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                                    <Cpu className="w-5 h-5" />
                                </div>
                                <ArrowRight className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors" />
                            </div>
                            <h3 className="font-semibold text-slate-800 dark:text-white mb-2">Mining Guide</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                Proof-of-work, why halvings matter, and how the difficulty adjustment shapes mining economics.
                            </p>
                        </div>
                    </Link>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
                            <BarChart3 className="w-5 h-5" />
                        </div>
                        <h3 className="font-semibold text-slate-800 dark:text-white mb-2">Bitcoin Adoption Tracker</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            An interactive chart laying Bitcoin&apos;s adoption curve over early internet growth, so you can judge how early it still is.
                        </p>
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="text-center">
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-8 sm:p-12">
                    <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
                        Ready to Start?
                    </h2>
                    <p className="text-slate-300 mb-6 max-w-lg mx-auto">
                        Enter your numbers and see what a steady buying schedule would have done.
                        No signup, no email, nothing to install.
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-8 py-4 rounded-xl transition-colors text-lg"
                    >
                        Open the Calculator
                        <ArrowRight className="w-5 h-5" />
                    </Link>
                </div>
            </section>

            {/* Disclaimer */}
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-8">
                This tool is for educational purposes only and does not constitute financial advice.
                Past performance does not guarantee future results. Always do your own research before investing.
            </p>
        </div>
        </>
    );
}
