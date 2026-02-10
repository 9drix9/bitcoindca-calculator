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
    title: 'Features Guide | Bitcoin DCA Calculator',
    description: 'Learn how to use every feature of the Bitcoin DCA Calculator. Comprehensive guide to all tools, widgets, and calculators explained in simple terms.',
    keywords: ['bitcoin calculator guide', 'dca calculator tutorial', 'bitcoin tools explained', 'crypto calculator features'],
    alternates: {
        canonical: '/features',
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
        amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
        blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
        green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
        purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
        red: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
        cyan: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400',
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5">
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
                    Everything you need to know about the Bitcoin DCA Calculator.
                    Learn how each tool works and how it can help you make smarter investment decisions.
                </p>
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
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
                        Dollar Cost Averaging is an investment strategy where you invest a fixed amount of money at regular intervals,
                        regardless of the asset&apos;s price. Instead of trying to &quot;time the market,&quot; you buy consistently over time.
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
                    subtitle="The core tool that shows you what your Bitcoin investment would be worth."
                />
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FeatureCard
                        icon={DollarSign}
                        title="Investment Amount"
                        description="Enter how much you want to invest each period. Can be any amount — even $10 or $20 per week adds up over time."
                        color="green"
                    />
                    <FeatureCard
                        icon={Repeat}
                        title="Frequency Options"
                        description="Choose how often to invest: Daily, Weekly, Bi-weekly (every 2 weeks), or Monthly. Weekly is most popular for manual investors."
                        color="blue"
                    />
                    <FeatureCard
                        icon={Calendar}
                        title="Date Range"
                        description="Pick your start and end dates. Use historical dates to see past performance, or future dates to project potential growth."
                        color="purple"
                    />
                    <FeatureCard
                        icon={Calculator}
                        title="Fee Percentage"
                        description="Account for exchange fees (typically 0.1% to 1.5%). This gives you a more accurate picture of your real returns."
                        color="amber"
                    />
                    <FeatureCard
                        icon={Globe}
                        title="Currency Support"
                        description="View results in USD, EUR, GBP, CAD, AUD, or JPY. All calculations are done in USD and converted for display."
                        color="cyan"
                    />
                    <FeatureCard
                        icon={Database}
                        title="Price Sources"
                        description="Choose between Kraken or Coinbase historical data. Both are major exchanges with reliable price history going back years."
                        color="red"
                    />
                </div>

                <div className="mt-6 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700">
                    <h4 className="font-semibold text-slate-800 dark:text-white mb-2 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        Preset Scenarios
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                        Not sure where to start? Click any preset button to instantly see common scenarios:
                    </p>
                    <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                        <li>&bull; <strong>$50/week for 5 years</strong> — A popular long-term strategy</li>
                        <li>&bull; <strong>$100/week for 3 years</strong> — Medium-term with higher contributions</li>
                        <li>&bull; <strong>&quot;What if I bought the peak?&quot;</strong> — See how DCA recovers from buying at all-time highs</li>
                    </ul>
                </div>
            </section>

            {/* Results & Analysis */}
            <section className="mb-12 sm:mb-16">
                <SectionHeader
                    title="Results & Analysis Tools"
                    subtitle="Understand your investment performance with detailed breakdowns."
                />
                <div className="grid sm:grid-cols-2 gap-4">
                    <FeatureCard
                        icon={Wallet}
                        title="Portfolio Summary"
                        description="See your total invested, BTC accumulated, current value, and profit/loss at a glance. Toggle between BTC and Satoshis (sats) display."
                        color="amber"
                    />
                    <FeatureCard
                        icon={LineChart}
                        title="Performance Chart"
                        description="Visual chart showing your portfolio value over time. Watch how your investment grows with each purchase. Includes M2 money supply overlay option."
                        color="blue"
                    />
                    <FeatureCard
                        icon={Table}
                        title="Transaction History"
                        description="Detailed table of every single purchase: date, BTC price, amount invested, BTC bought, fees paid, and running totals."
                        color="green"
                    />
                    <FeatureCard
                        icon={Download}
                        title="CSV Export"
                        description="Download your complete transaction history as a spreadsheet. Perfect for tax records, personal tracking, or importing into other tools."
                        color="purple"
                    />
                    <FeatureCard
                        icon={Share2}
                        title="Share Link"
                        description="Generate a shareable link with your exact calculator settings. Great for showing friends or saving your configuration."
                        color="cyan"
                    />
                    <FeatureCard
                        icon={Sparkles}
                        title="Future Projections"
                        description="When your end date is in the future, see projected returns based on conservative (15%), moderate (30%), or aggressive (50%) annual growth scenarios."
                        color="purple"
                    />
                </div>
            </section>

            {/* Comparison Tools */}
            <section className="mb-12 sm:mb-16">
                <SectionHeader
                    title="Comparison Tools"
                    subtitle="See how Bitcoin stacks up against other investment options."
                />
                <div className="grid sm:grid-cols-2 gap-4">
                    <FeatureCard
                        icon={Scale}
                        title="DCA vs Lump Sum"
                        description="Compare your DCA strategy to investing the same total amount all at once on day one. See which approach would have performed better."
                        color="blue"
                    />
                    <FeatureCard
                        icon={BarChart3}
                        title="Asset Comparison"
                        description="Compare Bitcoin returns against S&P 500 index and Gold over the same period. Uses real historical data from financial markets."
                        color="green"
                    />
                    <FeatureCard
                        icon={PiggyBank}
                        title="Savings Account Comparison"
                        description="See how Bitcoin compares to keeping your money in a high-yield savings account (currently ~4.5% APY). Includes compound interest calculations."
                        color="amber"
                    />
                    <FeatureCard
                        icon={TrendingUp}
                        title="Inflation-Adjusted Returns"
                        description="See your 'real' returns after accounting for inflation using official CPI data from the Federal Reserve. This shows your actual purchasing power gain."
                        color="red"
                    />
                </div>
            </section>

            {/* Planning Tools */}
            <section className="mb-12 sm:mb-16">
                <SectionHeader
                    title="Planning & Goal Tools"
                    subtitle="Plan your Bitcoin journey and track progress toward your goals."
                />
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FeatureCard
                        icon={Target}
                        title="Stacking Goal Tracker"
                        description="Set a target amount of Bitcoin (like 0.1 BTC or 1 whole coin) and track your progress. See how long until you reach your goal at your current pace."
                        color="amber"
                    />
                    <FeatureCard
                        icon={TrendingUp}
                        title="Price Prediction Scenarios"
                        description="Enter a target Bitcoin price ($100k, $500k, $1M) and instantly see what your current stack would be worth. Great for visualizing long-term potential."
                        color="green"
                    />
                    <FeatureCard
                        icon={Flame}
                        title="FIRE Calculator"
                        description="Financial Independence, Retire Early calculator. Enter your monthly expenses and see at what Bitcoin price you could live off your holdings."
                        color="red"
                    />
                    <FeatureCard
                        icon={Coins}
                        title="Unit Bias Calculator"
                        description="Bitcoin seems expensive? This shows how many Satoshis (sats) you own. 1 BTC = 100 million sats. Owning 1 million sats is easier than it sounds!"
                        color="purple"
                    />
                    <FeatureCard
                        icon={Calculator}
                        title="Opportunity Cost Calculator"
                        description="Curious what you missed? Enter a past date and amount to see what that money would be worth today if you had bought Bitcoin instead."
                        color="blue"
                    />
                    <FeatureCard
                        icon={ImageIcon}
                        title="Share My Stack"
                        description="Generate a beautiful shareable image of your DCA results. Perfect for social media — shows your total invested, current value, and returns."
                        color="cyan"
                    />
                </div>
            </section>

            {/* Fee & Cost Tools */}
            <section className="mb-12 sm:mb-16">
                <SectionHeader
                    title="Fee & Cost Analysis"
                    subtitle="Understand and minimize the costs of your Bitcoin purchases."
                />
                <div className="grid sm:grid-cols-2 gap-4">
                    <FeatureCard
                        icon={Calculator}
                        title="Exchange Fee Comparison"
                        description="Compare fees across major exchanges: Coinbase, Kraken, Binance, Cash App, Strike, Swan, and River. See total fees for your specific investment pattern."
                        color="amber"
                    />
                    <FeatureCard
                        icon={BarChart3}
                        title="Cost Basis Tracker"
                        description="Track your average purchase price (cost basis) over time. Essential for understanding your break-even point and for tax purposes."
                        color="green"
                    />
                </div>
            </section>

            {/* Live Dashboard Widgets */}
            <section className="mb-12 sm:mb-16">
                <SectionHeader
                    title="Live Dashboard Widgets"
                    subtitle="Real-time Bitcoin network and market data updated automatically."
                />
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FeatureCard
                        icon={Clock}
                        title="Halving Countdown"
                        description="Bitcoin's supply is cut in half roughly every 4 years. This shows the countdown to the next halving event — historically a bullish catalyst."
                        color="amber"
                    />
                    <FeatureCard
                        icon={Boxes}
                        title="Live Blocks Feed"
                        description="Watch new Bitcoin blocks being mined in real-time. Shows block height, time, transaction count, and size. Updates every 30 seconds."
                        color="purple"
                    />
                    <FeatureCard
                        icon={Gauge}
                        title="Fear & Greed Index"
                        description="Market sentiment indicator from 0 (Extreme Fear) to 100 (Extreme Greed). When others are fearful, it might be a good time to buy."
                        color="green"
                    />
                    <FeatureCard
                        icon={Activity}
                        title="Mempool Fees"
                        description="Current Bitcoin transaction fees for fast, medium, and slow confirmation times. Useful for timing your withdrawals from exchanges."
                        color="blue"
                    />
                    <FeatureCard
                        icon={BarChart3}
                        title="Hash Rate & Difficulty"
                        description="Network security metrics. Higher hash rate = more secure network. Shows current hash rate, difficulty, and next adjustment estimate."
                        color="red"
                    />
                    <FeatureCard
                        icon={Database}
                        title="Supply Scarcity"
                        description="Track how much of the 21 million Bitcoin cap has been mined. Currently ~19.5M exist. Shows percentage mined and remaining supply."
                        color="amber"
                    />
                    <FeatureCard
                        icon={DollarSign}
                        title="Purchasing Power"
                        description="Compare how $100 has lost value since 2015 while Bitcoin has gained. Visual demonstration of inflation vs Bitcoin appreciation."
                        color="green"
                    />
                    <FeatureCard
                        icon={Zap}
                        title="Lightning Network Stats"
                        description="The Lightning Network enables instant, nearly-free Bitcoin payments. See total nodes, channels, and network capacity."
                        color="cyan"
                    />
                    <FeatureCard
                        icon={Globe}
                        title="Bitcoin Dominance"
                        description="Bitcoin's share of the total cryptocurrency market cap. Higher dominance often indicates Bitcoin is outperforming altcoins."
                        color="purple"
                    />
                    <FeatureCard
                        icon={Coins}
                        title="Sat Converter"
                        description="Quick converter between USD and Satoshis at current prices. Enter any dollar amount to see how many sats you can buy."
                        color="amber"
                    />
                </div>
            </section>

            {/* Educational Content */}
            <section className="mb-12 sm:mb-16">
                <SectionHeader
                    title="Educational Resources"
                    subtitle="Learn more about Bitcoin and why people are investing."
                />
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Link href="/why-bitcoin" className="group">
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 h-full hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                                    <TrendingUp className="w-5 h-5" />
                                </div>
                                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-amber-500 transition-colors" />
                            </div>
                            <h3 className="font-semibold text-slate-800 dark:text-white mb-2">Why Bitcoin?</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                Understand where Bitcoin&apos;s value comes from: user adoption, network effects, mining costs, and the case for exiting fiat currency.
                            </p>
                        </div>
                    </Link>
                    <Link href="/self-custody" className="group">
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 h-full hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center">
                                    <Shield className="w-5 h-5" />
                                </div>
                                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-amber-500 transition-colors" />
                            </div>
                            <h3 className="font-semibold text-slate-800 dark:text-white mb-2">Self-Custody Guide</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                Learn why holding your own keys matters, how hardware wallets work, and how to secure your Bitcoin the right way.
                            </p>
                        </div>
                    </Link>
                    <Link href="/mining" className="group">
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 h-full hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                                    <Cpu className="w-5 h-5" />
                                </div>
                                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-amber-500 transition-colors" />
                            </div>
                            <h3 className="font-semibold text-slate-800 dark:text-white mb-2">Mining Guide</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                How proof-of-work secures Bitcoin, why halvings matter, and how mining economics create a price floor.
                            </p>
                        </div>
                    </Link>
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
                            <BarChart3 className="w-5 h-5" />
                        </div>
                        <h3 className="font-semibold text-slate-800 dark:text-white mb-2">Bitcoin Adoption Tracker</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Interactive chart comparing Bitcoin&apos;s adoption curve to early internet growth. See where we are in the adoption cycle.
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
                        See what consistent Bitcoin investing could do for your financial future.
                        No signup required — just enter your numbers and explore.
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold px-8 py-4 rounded-xl transition-colors text-lg"
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
