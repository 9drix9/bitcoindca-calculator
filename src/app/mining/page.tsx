import type { Metadata } from 'next';
import Link from 'next/link';
import { Pickaxe, Zap, Clock, TrendingUp, BarChart3, Cpu, AlertTriangle, ArrowRight, CheckCircle2, ExternalLink } from 'lucide-react';
import { WalletImage } from '@/components/WalletImage';
import { getBlockHeight } from '@/app/actions';

export const metadata: Metadata = {
    title: 'How Bitcoin Mining Works (Simple Explanation) | Bitcoin DCA Calculator',
    description: 'A beginner-friendly guide to Bitcoin mining. Learn what miners do, why halvings matter, and how mining keeps Bitcoin secure and valuable.',
    keywords: ['bitcoin mining explained', 'bitcoin halving', 'what is bitcoin mining', 'bitcoin for beginners', 'how bitcoin works', 'bitcoin mining simple'],
    alternates: {
        canonical: '/mining',
    },
    openGraph: {
        title: 'How Bitcoin Mining Works (Simple Explanation)',
        description: 'A beginner-friendly guide to Bitcoin mining, halvings, and why it all matters for Bitcoin\'s value.',
        type: 'article',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'How Bitcoin Mining Works (Simple Explanation)',
        description: 'A beginner-friendly guide to Bitcoin mining, halvings, and why it all matters for Bitcoin\'s value.',
        creator: '@9drix9',
    },
};

const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "How Bitcoin Mining Works (Simple Explanation)",
    "description": "A beginner-friendly guide to Bitcoin mining. Learn what miners do, why halvings matter, and how mining keeps Bitcoin secure and valuable.",
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
        "@id": "https://btcdollarcostaverage.com/mining"
    },
    "datePublished": "2026-02-05",
    "dateModified": new Date().toISOString().split('T')[0],
};

const HALVING_DATA = [
    { halving: 'Start', block: 0, date: 'Jan 3, 2009', reward: '50 BTC', supplyAfter: '0' },
    { halving: '1st', block: 210000, date: 'Nov 28, 2012', reward: '25 BTC', supplyAfter: '10.5M' },
    { halving: '2nd', block: 420000, date: 'Jul 9, 2016', reward: '12.5 BTC', supplyAfter: '15.75M' },
    { halving: '3rd', block: 630000, date: 'May 11, 2020', reward: '6.25 BTC', supplyAfter: '18.375M' },
    { halving: '4th', block: 840000, date: 'Apr 20, 2024', reward: '3.125 BTC', supplyAfter: '19.6875M' },
    { halving: '5th', block: 1050000, date: '~2028', reward: '1.5625 BTC', supplyAfter: '20.34M' },
    { halving: '6th', block: 1260000, date: '~2032', reward: '0.78125 BTC', supplyAfter: '20.67M' },
    { halving: '7th', block: 1470000, date: '~2036', reward: '0.390625 BTC', supplyAfter: '20.84M' },
    { halving: '8th', block: 1680000, date: '~2040', reward: '0.1953125 BTC', supplyAfter: '20.92M' },
    { halving: '9th', block: 1890000, date: '~2044', reward: '0.09765625 BTC', supplyAfter: '20.96M' },
    { halving: '10th', block: 2100000, date: '~2048', reward: '0.04882812 BTC', supplyAfter: '20.98M' },
    { halving: '11th', block: 2310000, date: '~2052', reward: '0.02441406 BTC', supplyAfter: '20.99M' },
    { halving: '12th', block: 2520000, date: '~2056', reward: '0.01220703 BTC', supplyAfter: '20.995M' },
    { halving: '13th', block: 2730000, date: '~2060', reward: '0.00610351 BTC', supplyAfter: '20.9975M' },
    { halving: '14th', block: 2940000, date: '~2064', reward: '0.00305175 BTC', supplyAfter: '20.99875M' },
    { halving: '15th', block: 3150000, date: '~2068', reward: '0.00152587 BTC', supplyAfter: '20.999375M' },
    { halving: '16th', block: 3360000, date: '~2072', reward: '0.00076293 BTC', supplyAfter: '20.9996875M' },
    { halving: '17th', block: 3570000, date: '~2076', reward: '0.00038146 BTC', supplyAfter: '20.9998437M' },
    { halving: '18th', block: 3780000, date: '~2080', reward: '0.00019073 BTC', supplyAfter: '20.9999218M' },
    { halving: '19th', block: 3990000, date: '~2084', reward: '0.00009536 BTC', supplyAfter: '20.9999609M' },
    { halving: '20th', block: 4200000, date: '~2088', reward: '0.00004768 BTC', supplyAfter: '20.9999804M' },
    { halving: '21st', block: 4410000, date: '~2092', reward: '0.00002384 BTC', supplyAfter: '20.9999902M' },
    { halving: '22nd', block: 4620000, date: '~2096', reward: '0.00001192 BTC', supplyAfter: '20.9999951M' },
    { halving: '23rd', block: 4830000, date: '~2100', reward: '596 sats', supplyAfter: '20.9999975M' },
    { halving: '24th', block: 5040000, date: '~2104', reward: '298 sats', supplyAfter: '20.9999987M' },
    { halving: '25th', block: 5250000, date: '~2108', reward: '149 sats', supplyAfter: '20.9999993M' },
    { halving: '26th', block: 5460000, date: '~2112', reward: '74 sats', supplyAfter: '20.9999996M' },
    { halving: '27th', block: 5670000, date: '~2116', reward: '37 sats', supplyAfter: '20.9999998M' },
    { halving: '28th', block: 5880000, date: '~2120', reward: '18 sats', supplyAfter: '20.9999999M' },
    { halving: '29th', block: 6090000, date: '~2124', reward: '9 sats', supplyAfter: '20.99999995M' },
    { halving: '30th', block: 6300000, date: '~2128', reward: '4 sats', supplyAfter: '20.99999997M' },
    { halving: '31st', block: 6510000, date: '~2132', reward: '2 sats', supplyAfter: '20.99999998M' },
    { halving: '32nd', block: 6720000, date: '~2136', reward: '1 sat', supplyAfter: '20.99999999M' },
    { halving: '33rd (Final)', block: 6930000, date: '~2140', reward: '0', supplyAfter: '21M' },
];

const GOMINING_DATA = {
    name: 'GoMining',
    tagline: 'Earn Bitcoin without the hardware',
    description: 'GoMining lets you earn Bitcoin mining rewards without buying or managing mining equipment. You buy digital shares backed by real mining facilities, and receive daily Bitcoin payouts based on your share.',
    features: ['No equipment to buy or maintain', 'Get paid in Bitcoin daily', 'Start with as little as ~$30', 'Backed by real data centers'],
    price: 'From ~$30',
    href: 'https://gomining.com/?ref=v56m_',
    image: '/wallets/gomining.png',
};

const orangeColorClasses = {
    bg: 'bg-orange-50 dark:bg-orange-950/20',
    border: 'border-orange-200 dark:border-orange-800/50',
    badge: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400',
    button: 'bg-orange-600 hover:bg-orange-700',
    accent: 'text-orange-600 dark:text-orange-400',
    check: 'text-orange-500',
};

export default async function MiningPage() {
    // Fetch current block height to determine which halvings have occurred
    const currentBlockHeight = await getBlockHeight() ?? 0;

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
            />
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10 sm:space-y-16">

                {/* Hero */}
                <section className="text-center space-y-4 sm:space-y-5">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs sm:text-sm font-medium">
                        <Pickaxe className="w-4 h-4" />
                        Beginner-Friendly Guide
                    </div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight text-balance">
                        How Bitcoin <span className="text-orange-500">Mining</span> Works
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
                        Mining is how Bitcoin stays secure and how new bitcoin enters the world.
                        Don&apos;t worry&mdash;we&apos;ll explain it simply, no tech background needed.
                    </p>
                </section>

                {/* What is Bitcoin Mining - Simplified */}
                <section className="space-y-6">
                    <div className="flex items-center gap-3">
                        <Cpu className="w-7 h-7 text-orange-500 shrink-0" />
                        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">What Is Mining?</h2>
                    </div>

                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Think of miners as Bitcoin&apos;s accountants.</strong> When you send Bitcoin to someone, miners are the ones who check that you actually have the Bitcoin you&apos;re sending, then write it down in Bitcoin&apos;s permanent record book (called the blockchain).
                        </p>
                        <p>
                            Every 10 minutes or so, one miner &ldquo;wins&rdquo; the right to add the latest page of transactions. As a reward, they get newly created bitcoin. That&apos;s the <strong className="text-slate-800 dark:text-slate-200">only</strong> way new bitcoin comes into existence.
                        </p>
                    </div>

                    {/* Simple analogy box */}
                    <div className="bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-amber-400 px-4 sm:px-6 py-4 sm:py-5 rounded-r-xl">
                        <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
                            <strong className="text-amber-700 dark:text-amber-400">Simple analogy:</strong> Imagine a lottery where you win by being first to solve a puzzle. The puzzle is hard, so you need powerful computers. Winners get paid in fresh bitcoin. This makes cheating extremely expensive&mdash;you&apos;d have to outspend everyone else combined.
                        </p>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-4">
                        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-2">
                            <div className="w-12 h-12 mx-auto rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                                <Zap className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                            </div>
                            <h3 className="font-semibold text-sm sm:text-base text-slate-800 dark:text-white">Uses Real Energy</h3>
                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Miners spend real electricity, so cheating costs real money. This keeps Bitcoin honest.</p>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-2">
                            <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                <BarChart3 className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                            </div>
                            <h3 className="font-semibold text-sm sm:text-base text-slate-800 dark:text-white">No Boss</h3>
                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Anyone can become a miner. No company or government controls who participates.</p>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-2">
                            <div className="w-12 h-12 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
                            </div>
                            <h3 className="font-semibold text-sm sm:text-base text-slate-800 dark:text-white">Can&apos;t Be Undone</h3>
                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Once a transaction is recorded, it&apos;s there forever. No one can erase or change it.</p>
                        </div>
                    </div>
                </section>

                {/* The Halving Cycle - Simplified */}
                <section className="space-y-6">
                    <div className="flex items-center gap-3">
                        <Clock className="w-7 h-7 text-orange-500 shrink-0" />
                        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">The Halving (Why It Matters)</h2>
                    </div>

                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Every 4 years, the reward for mining gets cut in half.</strong> This is called the &ldquo;halving.&rdquo;
                        </p>
                        <p>
                            When Bitcoin started in 2009, miners earned 50 bitcoin per block. After the first halving in 2012, it dropped to 25. Then 12.5 in 2016. Then 6.25 in 2020. After the April 2024 halving, it&apos;s just 3.125 bitcoin.
                        </p>
                    </div>

                    {/* Why it matters - simple explanation */}
                    <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white p-6 sm:p-8 rounded-2xl">
                        <div className="text-xl sm:text-2xl md:text-3xl font-extrabold mb-3">
                            Why does this matter?
                        </div>
                        <p className="text-sm sm:text-base text-white/90 leading-relaxed">
                            <strong>Less new bitcoin = more scarcity.</strong> Think of it like a gold mine that produces less gold each year. If people still want gold but there&apos;s less of it, the price tends to go up. Historically, Bitcoin&apos;s price has risen significantly after each halving.
                        </p>
                    </div>

                    {/* Halving table */}
                    <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                        <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white">The Complete Halving Schedule</h3>
                        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                            This schedule is locked in Bitcoin&apos;s code. It can&apos;t be changed by anyone.
                        </p>
                        <div className="overflow-x-auto -mx-2 sm:mx-0">
                            <table className="w-full text-xs sm:text-sm min-w-[480px]">
                                <thead>
                                    <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                        <th className="pb-2 pr-3 font-medium">Halving</th>
                                        <th className="pb-2 pr-3 font-medium">When</th>
                                        <th className="pb-2 pr-3 font-medium">Miner Reward</th>
                                        <th className="pb-2 font-medium">Total BTC After</th>
                                    </tr>
                                </thead>
                                <tbody className="text-slate-700 dark:text-slate-300">
                                    {HALVING_DATA.map((row, idx) => {
                                        const isPast = currentBlockHeight >= row.block;
                                        return (
                                            <tr
                                                key={row.halving}
                                                className={`border-t border-slate-200 dark:border-slate-700/50 ${isPast ? '' : 'text-slate-400 dark:text-slate-500'}`}
                                            >
                                                <td className="py-2 pr-3 font-medium">
                                                    {row.halving}
                                                    {isPast && idx > 0 && <span className="ml-1 text-green-500">&#10003;</span>}
                                                </td>
                                                <td className="py-2 pr-3">{row.date}</td>
                                                <td className="py-2 pr-3 font-mono text-xs">{row.reward}</td>
                                                <td className="py-2 font-mono text-xs">{row.supplyAfter}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            By around 2140, all 21 million bitcoin will exist. No more will ever be created.
                        </p>
                    </div>
                </section>

                {/* Difficulty Adjustment - Simplified */}
                <section className="space-y-6">
                    <div className="flex items-center gap-3">
                        <BarChart3 className="w-7 h-7 text-orange-500 shrink-0" />
                        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">How Bitcoin Stays Stable</h2>
                    </div>

                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Bitcoin is designed to create one new block every 10 minutes, no matter what.</strong>
                        </p>
                        <p>
                            If lots of new miners join and blocks start coming faster, Bitcoin automatically makes the puzzle harder. If miners leave and blocks slow down, the puzzle gets easier. This adjustment happens every 2 weeks.
                        </p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="bg-green-50 dark:bg-green-950/20 p-4 sm:p-5 rounded-xl border border-green-200 dark:border-green-800/50">
                            <h3 className="text-sm sm:text-base font-bold text-green-800 dark:text-green-300 mb-2">More Miners?</h3>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                Puzzle gets harder. Blocks still come every ~10 minutes.
                            </p>
                        </div>
                        <div className="bg-red-50 dark:bg-red-950/20 p-4 sm:p-5 rounded-xl border border-red-200 dark:border-red-800/50">
                            <h3 className="text-sm sm:text-base font-bold text-red-800 dark:text-red-300 mb-2">Fewer Miners?</h3>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                Puzzle gets easier. Blocks still come every ~10 minutes.
                            </p>
                        </div>
                    </div>

                    <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
                        <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
                            <strong className="text-slate-800 dark:text-slate-200">Why this is brilliant:</strong> No one controls this. It&apos;s automatic, based on math. The network self-regulates without any central authority making decisions.
                        </p>
                    </div>
                </section>

                {/* Transaction Fees - Simplified */}
                <section className="space-y-6">
                    <div className="flex items-center gap-3">
                        <Zap className="w-7 h-7 text-orange-500 shrink-0" />
                        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Transaction Fees</h2>
                    </div>

                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Each block can only fit so many transactions.</strong> When lots of people want to send Bitcoin at once, they compete by offering higher fees. Miners pick the highest-paying transactions first.
                        </p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">Busy Times = Higher Fees</h3>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                During bull markets or big events, everyone wants to transact. Fees spike because people bid against each other for space.
                            </p>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">Quiet Times = Low Fees</h3>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                On weekends or slow periods, fees can drop to just a few cents. Patient users wait for these windows.
                            </p>
                        </div>
                    </div>

                    <div className="bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-amber-400 px-4 sm:px-6 py-4 sm:py-5 rounded-r-xl">
                        <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
                            <strong className="text-amber-700 dark:text-amber-400">Important for the future:</strong> As mining rewards shrink to zero by 2140, fees will become the only payment miners get. A healthy fee market means Bitcoin stays secure forever.
                        </p>
                    </div>
                </section>

                {/* Mining Economics - Simplified */}
                <section className="space-y-6">
                    <div className="flex items-center gap-3">
                        <TrendingUp className="w-7 h-7 text-orange-500 shrink-0" />
                        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Why Mining Affects Bitcoin&apos;s Price</h2>
                    </div>

                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">Mining costs real money.</strong> Miners pay for expensive computers and electricity. If Bitcoin&apos;s price drops too low, they can&apos;t cover their costs and have to shut down.
                        </p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">The &ldquo;Price Floor&rdquo;</h3>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                If Bitcoin drops below what it costs to mine, miners stop. Less mining = less new bitcoin being sold = price tends to recover. This creates a natural support level.
                            </p>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2">More Mining = More Security</h3>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                The more miners there are, the harder (more expensive) it is to attack Bitcoin. Right now, Bitcoin has more mining power than ever&mdash;it&apos;s extremely secure.
                            </p>
                        </div>
                    </div>

                    <div className="bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-700 text-white p-6 sm:p-8 rounded-2xl">
                        <h3 className="text-lg sm:text-xl font-bold mb-3">The Bottom Line</h3>
                        <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                            Unlike dollars (which the government can print whenever it wants), new bitcoin requires real work and real energy. You can&apos;t fake it or create it from nothing. That&apos;s part of why people trust it.
                        </p>
                    </div>
                </section>

                {/* GoMining Section */}
                <section className="space-y-6" id="gomining">
                    <div className="text-center space-y-2">
                        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Can I Earn Mining Rewards?</h2>
                        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">
                            You don&apos;t need to buy expensive equipment or understand the technical details.
                        </p>
                    </div>

                    <div className={`${orangeColorClasses.bg} border ${orangeColorClasses.border} rounded-2xl overflow-hidden`}>
                        <div className="p-5 sm:p-8">
                            <div className="flex flex-col sm:flex-row gap-5 sm:gap-8">
                                {/* Product image */}
                                <div className="shrink-0 flex justify-center sm:justify-start">
                                    <div className="w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden">
                                        <WalletImage
                                            src={GOMINING_DATA.image}
                                            alt={GOMINING_DATA.name}
                                            fallbackEmoji={'\u26CF\uFE0F'}
                                        />
                                    </div>
                                </div>

                                {/* Info */}
                                <div className="flex-1 space-y-3">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{GOMINING_DATA.name}</h3>
                                            <span className={`text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-full ${orangeColorClasses.badge}`}>{GOMINING_DATA.price}</span>
                                        </div>
                                        <p className={`text-sm font-medium ${orangeColorClasses.accent}`}>{GOMINING_DATA.tagline}</p>
                                    </div>

                                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                        {GOMINING_DATA.description}
                                    </p>

                                    <div className="space-y-1.5">
                                        {GOMINING_DATA.features.map((feature) => (
                                            <div key={feature} className="flex items-start gap-2">
                                                <CheckCircle2 className={`w-4 h-4 ${orangeColorClasses.check} shrink-0 mt-0.5`} />
                                                <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">{feature}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <a
                                        href={GOMINING_DATA.href}
                                        target="_blank"
                                        rel="noopener noreferrer sponsored"
                                        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm sm:text-base font-semibold text-white ${orangeColorClasses.button} transition-colors shadow-sm`}
                                    >
                                        Learn More About GoMining
                                        <ExternalLink className="w-4 h-4" />
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>

                    <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 text-center italic">
                        Affiliate disclosure: The GoMining link above is an affiliate link. We may earn a commission at no extra cost to you. This helps support this free calculator.
                    </p>
                </section>

                {/* Common Questions - Simplified */}
                <section className="space-y-6">
                    <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white text-center">Common Questions</h2>
                    <div className="space-y-3">
                        {[
                            {
                                q: 'Is Bitcoin mining bad for the environment?',
                                a: 'It\'s more nuanced than headlines suggest. Miners seek cheap electricity, which often means renewable energy (solar, hydro, wind) or energy that would otherwise be wasted (like natural gas that\'s burned off at oil wells). Over 50% of mining now uses renewable energy. Some miners even help stabilize power grids by using excess energy during off-peak hours.',
                            },
                            {
                                q: 'What happens when all bitcoin is mined?',
                                a: 'By around 2140, miners will earn only transaction fees, not new bitcoin. But that\'s okay—if Bitcoin is widely used by then, the fees alone will be enough to keep miners profitable and the network secure.',
                            },
                            {
                                q: 'Can\'t someone just change the rules?',
                                a: 'No. Bitcoin\'s rules are enforced by thousands of computers around the world. To change something, nearly everyone would have to agree. If someone tried to create more than 21 million bitcoin, everyone else would simply ignore them. This is what makes Bitcoin\'s rules essentially permanent.',
                            },
                            {
                                q: 'What if a country bans mining?',
                                a: 'Mining moves. When China banned mining in 2021, miners relocated to the US, Kazakhstan, and elsewhere within months. Bitcoin kept working perfectly. No single country can stop it.',
                            },
                            {
                                q: 'Should I mine bitcoin myself?',
                                a: 'For most people, no. Home mining rarely makes sense because you\'re competing against massive industrial operations with cheap electricity. Most beginners are better off just buying bitcoin through an exchange or using a service like GoMining.',
                            },
                        ].map((item) => (
                            <details key={item.q} className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 transition-shadow hover:shadow-sm">
                                <summary className="flex items-center justify-between cursor-pointer p-4 sm:p-5 list-none [&::-webkit-details-marker]:hidden">
                                    <h3 className="font-semibold text-sm sm:text-base text-slate-800 dark:text-slate-200 pr-4">{item.q}</h3>
                                    <ArrowRight className="w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 group-open:rotate-90 shrink-0" />
                                </summary>
                                <div className="px-4 sm:px-5 pb-4 sm:pb-5 -mt-1">
                                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.a}</p>
                                </div>
                            </details>
                        ))}
                    </div>
                </section>

                {/* CTA */}
                <section className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-700 text-white p-6 sm:p-10 rounded-2xl text-center space-y-4">
                    <h2 className="text-xl sm:text-3xl font-bold">Ready to Start Investing?</h2>
                    <p className="text-sm sm:text-base text-slate-300 max-w-lg mx-auto">
                        Use our calculator to see how regular Bitcoin purchases would have grown over time. We also have a live halving countdown widget.
                    </p>
                    <div className="flex flex-wrap justify-center gap-3">
                        <Link href="/" className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl text-sm sm:text-base transition-colors">
                            Open the Calculator
                        </Link>
                        <Link href="/features" className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl text-sm sm:text-base transition-colors">
                            See All Features
                        </Link>
                    </div>
                </section>

                {/* Disclaimer */}
                <section className="border-t border-slate-200 dark:border-slate-800 pt-6">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                            <strong>Disclaimer:</strong> The GoMining link on this page is an affiliate link. If you purchase through that link, we may earn a commission at no extra cost to you. This page is for educational purposes only and is not financial advice. Bitcoin and mining investments carry risk. Always do your own research.
                        </p>
                    </div>
                </section>

            </div>
        </>
    );
}
