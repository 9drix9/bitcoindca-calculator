import type { Metadata } from 'next';
import Link from 'next/link';
import { Users, Network, Cpu, BadgeDollarSign, AlertTriangle, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Why Bitcoin Has Value | Bitcoin DCA Calculator',
    description: 'Where does Bitcoin\'s value come from? Explore user adoption, network effects, mining costs, and the case for exiting fiat currency.',
    keywords: ['why bitcoin has value', 'bitcoin value proposition', 'bitcoin fundamentals', 'bitcoin adoption', 'bitcoin mining cost', 'bitcoin vs fiat', 'bitcoin network effect', 'metcalfe law bitcoin'],
    alternates: {
        canonical: '/why-bitcoin',
    },
    openGraph: {
        title: 'Where Does Bitcoin\'s Value Come From?',
        description: 'User adoption, network effects, cost of mining, and the case for exiting fiat. A data-driven look at Bitcoin\'s fundamentals.',
        type: 'article',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Where Does Bitcoin\'s Value Come From?',
        description: 'User adoption, network effects, cost of mining, and the case for exiting fiat. A data-driven look at Bitcoin\'s fundamentals.',
        creator: '@9drix9',
    },
};

const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Where Does Bitcoin's Value Come From?",
    "description": "Where does Bitcoin's value come from? Explore user adoption, network effects, mining costs, and the case for exiting fiat currency.",
    "author": {
        "@type": "Organization",
        "name": "Bitcoin DCA Calculator",
        "url": "https://btcdollarcostaverage.com"
    },
    "publisher": {
        "@type": "Organization",
        "name": "Bitcoin DCA Calculator",
        "url": "https://btcdollarcostaverage.com"
    },
    "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": "https://btcdollarcostaverage.com/why-bitcoin"
    },
    "datePublished": "2025-01-01",
    "dateModified": new Date().toISOString().split('T')[0],
};

export default function WhyBitcoinPage() {
    return (
        <>
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
        />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10 sm:space-y-16">

            {/* Hero */}
            <section className="text-center max-w-3xl mx-auto space-y-3 sm:space-y-4">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight text-balance">
                    Where Does <span className="text-amber-500">Bitcoin&apos;s</span> Value Come From?
                </h1>
                <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
                    Bitcoin has no CEO, no marketing team, and no physical form&mdash;yet it commands a trillion-dollar market cap.
                    Its value emerges from four reinforcing pillars: the people who use it, the network they create, the energy that
                    secures it, and the fiat (government-issued) currency system it offers an alternative to.
                </p>
            </section>

            {/* Section 1: User Adoption */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 sm:gap-3">
                    <Users className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                    <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">User Adoption</h2>
                </div>
                <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                    <p>
                        A network is only as valuable as the people who use it. Bitcoin has grown from a small group of
                        privacy-focused developers in 2009 to an estimated <strong className="text-slate-800 dark:text-slate-200">560 million+ owners worldwide</strong> and
                        counting. Each new participant adds demand to a mathematically fixed supply.
                    </p>
                    <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">Metcalfe&apos;s Law</h3>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                The value of a communications network grows proportional to the square of its connected
                                users (n&sup2;). As adoption doubles, the potential value quadruples. Bitcoin&apos;s price
                                history has tracked this relationship closely.
                            </p>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">Supply Absorption</h3>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                Every new long-term holder removes coins from the available trading supply. With only 21 million
                                BTC that will ever exist, growing adoption reduces the amount available for purchase and amplifies scarcity.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Section 2: Network Effect */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 sm:gap-3">
                    <Network className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                    <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Network Effect</h2>
                </div>
                <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                    <p>
                        More users attract more merchants, which attracts more infrastructure, which attracts more users.
                        This self-reinforcing flywheel is the engine behind Bitcoin&apos;s growth&mdash;and it&apos;s accelerating.
                    </p>
                    <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
                        <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
                            <div>
                                <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">Lightning Network</h3>
                                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                    The Lightning Network is a payment layer built on top of Bitcoin that enables near-instant,
                                    near-free transactions. Thousands of nodes and growing capacity are making BTC viable
                                    for everyday payments, from coffee to cross-border transfers.
                                </p>
                            </div>
                            <div>
                                <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">Institutional Adoption</h3>
                                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                    Bitcoin ETFs (exchange-traded funds that let people invest through traditional brokerages),
                                    corporate treasury allocations (Strategy, Tesla, Block), and sovereign wealth fund interest
                                    have brought regulated, large-scale capital into the network. This institutional infrastructure
                                    wasn&apos;t available even a few years ago.
                                </p>
                            </div>
                            <div>
                                <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">Developer Ecosystem</h3>
                                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                    Bitcoin is open-source software with hundreds of active contributors. Upgrades like Taproot
                                    (which improved privacy and smart contract flexibility) continue to strengthen the
                                    network&apos;s capabilities over time.
                                </p>
                            </div>
                            <div>
                                <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">Global Reach</h3>
                                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                    Bitcoin operates 24/7 across every country. No bank holidays, no wire transfer delays, no
                                    capital controls. For billions of unbanked or underbanked people, it&apos;s the first
                                    accessible savings technology.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Section 3: Cost of Mining */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 sm:gap-3">
                    <Cpu className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                    <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Cost of Mining</h2>
                </div>
                <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                    <p>
                        Bitcoin uses a system called Proof of Work: miners (specialized computers around the world)
                        compete to solve mathematical puzzles, and the winner gets to add the next batch of transactions
                        (a &ldquo;block&rdquo;) to Bitcoin&apos;s permanent record. This requires real-world energy expenditure,
                        which is what makes Bitcoin&apos;s ledger tamper-proof and establishes a production cost floor.
                    </p>
                    <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">Halving Cycles</h3>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                Every ~210,000 blocks (~4 years), the mining reward is cut in half. This programmatic supply
                                reduction has historically preceded major price appreciation as new issuance drops while
                                demand grows. The most recent halving occurred in April 2024.
                            </p>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">Price Floor Dynamics</h3>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                Miners have real costs: hardware, electricity, cooling, facilities. They generally won&apos;t
                                sell below their cost of production for long. This creates a soft price floor that rises over
                                time as difficulty increases and halvings reduce block rewards.
                            </p>
                        </div>
                    </div>
                    <p>
                        The global hashrate&mdash;a measure of the total computational power securing the network&mdash;has
                        reached all-time highs, meaning more energy than ever is being committed to Bitcoin&apos;s security.
                        This makes it prohibitively expensive for any bad actor to gain enough computing power to tamper
                        with the network, reinforcing trust in the system.
                    </p>
                </div>
            </section>

            {/* Section 4: Exiting Fiat */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 sm:gap-3">
                    <BadgeDollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                    <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Exiting Fiat</h2>
                </div>
                <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                    <p>
                        Fiat currencies&mdash;government-issued money like the US dollar, euro, or yen&mdash;are designed
                        to slowly lose purchasing power over time. The US dollar has lost over 96% of its value since the
                        Federal Reserve was established in 1913. Central banks target roughly 2% annual inflation as a
                        matter of policy.
                    </p>

                    <div className="bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-amber-400 px-4 sm:px-6 py-3 sm:py-4 rounded-r-xl">
                        <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
                            <strong className="text-slate-800 dark:text-slate-200">$100 in January 2015</strong> buys roughly the
                            same goods that require <strong className="text-slate-800 dark:text-slate-200">~$130+ today</strong>,
                            according to Consumer Price Index (CPI) data. That same $100, held in cash, lost about 30% of its
                            purchasing power. In the same period, Bitcoin went from ~$314 to five- and six-figure prices.
                        </p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">Fixed Supply</h3>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                There will only ever be 21 million bitcoin. No central bank can print more. No committee
                                can vote to change the issuance schedule. This hard cap is enforced by code and consensus,
                                not by policy makers.
                            </p>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">Monetary Debasement</h3>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                Since 2020, the US M2 money supply (a broad measure of all cash, checking deposits, and
                                easily convertible savings) expanded by trillions of dollars. When more units of currency
                                chase the same goods, each unit buys less. Bitcoin offers an alternative to this cycle
                                of debasement.
                            </p>
                        </div>
                    </div>

                    <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                        <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white">What Is a Satoshi?</h3>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                            You don&apos;t need to buy a whole bitcoin. Each bitcoin is divisible
                            into <strong className="text-slate-800 dark:text-slate-200">100,000,000 (100 million) satoshis</strong> (or
                            &ldquo;sats&rdquo;), named after Bitcoin&apos;s creator Satoshi Nakamoto. Think of them like cents
                            to a dollar&mdash;except there are a million times more sats per bitcoin than cents per dollar.
                        </p>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs sm:text-sm">
                                <thead>
                                    <tr className="text-left text-slate-500 dark:text-slate-400">
                                        <th className="pb-2 pr-4 font-medium">If 1 BTC reaches</th>
                                        <th className="pb-2 font-medium">1 satoshi =</th>
                                    </tr>
                                </thead>
                                <tbody className="font-mono text-slate-700 dark:text-slate-300">
                                    <tr className="border-t border-slate-200 dark:border-slate-700/50">
                                        <td className="py-1.5 pr-4">$100,000</td>
                                        <td className="py-1.5">$0.001</td>
                                    </tr>
                                    <tr className="border-t border-slate-200 dark:border-slate-700/50">
                                        <td className="py-1.5 pr-4">$1,000,000</td>
                                        <td className="py-1.5">$0.01 <span className="text-slate-500 dark:text-slate-400 font-sans">(one cent)</span></td>
                                    </tr>
                                    <tr className="border-t border-slate-200 dark:border-slate-700/50">
                                        <td className="py-1.5 pr-4">$10,000,000</td>
                                        <td className="py-1.5">$0.10 <span className="text-slate-500 dark:text-slate-400 font-sans">(one dime)</span></td>
                                    </tr>
                                    <tr className="border-t border-slate-200 dark:border-slate-700/50">
                                        <td className="py-1.5 pr-4">$100,000,000</td>
                                        <td className="py-1.5">$1.00 <span className="text-slate-500 dark:text-slate-400 font-sans">(one dollar)</span></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                            Some Bitcoiners envision a future where the world prices goods in satoshis rather than
                            dollars&mdash;where a sat <em>becomes</em> the everyday unit of money. Whether or not that
                            happens, the math shows that Bitcoin is divisible enough to serve as a global medium of exchange
                            at virtually any price level. When people say they &ldquo;can&apos;t afford a bitcoin,&rdquo;
                            the answer is simple: you&apos;re not meant to buy a whole one. You stack sats.
                        </p>
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="text-center bg-slate-100 dark:bg-slate-900/50 p-6 sm:p-10 rounded-2xl border border-slate-200 dark:border-slate-800">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
                    See How DCA Would Have Grown Your Bitcoin
                </h2>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mb-5 max-w-xl mx-auto">
                    Use the calculator to simulate dollar-cost averaging into Bitcoin with real historical price data from
                    Kraken and Coinbase.
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
                        <strong>Disclaimer:</strong> This page is for educational and informational purposes only. It does not constitute
                        financial advice. Bitcoin and cryptocurrency investments carry significant risk, including the possibility of total
                        loss. Historical performance does not guarantee future results. Always conduct your own research (DYOR) and consult
                        with a qualified financial advisor before making investment decisions.
                    </p>
                </div>
            </section>

        </div>
        </>
    );
}
