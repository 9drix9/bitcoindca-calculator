import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Pickaxe, Hash, Clock, BarChart3, Users, Cpu, TrendingUp, Coins, ShieldAlert, Leaf, HelpCircle, AlertTriangle, ArrowRight, CheckCircle2, ExternalLink, BookOpen } from 'lucide-react';
import { WalletImage } from '@/components/WalletImage';
import { getBlockHeight } from '@/app/actions';

/** Date the factual claims on this page were last checked against their sources. */
const LAST_REVIEWED = '8 August 2026';

/** A single external reference. `label` is what the reader sees inline. */
type Source = { label: string; url: string };

/**
 * Every source cited on this page. Each URL was fetched and checked against the
 * claim it supports on the date in LAST_REVIEWED.
 */
const SRC = {
    whitepaper: { label: 'Bitcoin whitepaper (§6, §11)', url: 'https://nakamotoinstitute.org/library/bitcoin/' },
    blockChainRef: { label: 'Bitcoin developer reference, block headers', url: 'https://developer.bitcoin.org/reference/block_chain.html' },
    pow: { label: 'Bitcoin Core, pow.cpp', url: 'https://github.com/bitcoin/bitcoin/blob/master/src/pow.cpp' },
    consensusH: { label: 'Bitcoin Core, consensus.h (COINBASE_MATURITY)', url: 'https://github.com/bitcoin/bitcoin/blob/master/src/consensus/consensus.h' },
    amountH: { label: 'Bitcoin Core, amount.h (MAX_MONEY)', url: 'https://github.com/bitcoin/bitcoin/blob/master/src/consensus/amount.h' },
    controlledSupply: { label: 'Bitcoin Wiki, controlled supply', url: 'https://en.bitcoin.it/wiki/Controlled_supply' },
    genesis: { label: 'Bitcoin Wiki, genesis block', url: 'https://en.bitcoin.it/wiki/Genesis_block' },
    block840k: { label: 'mempool.space, block 840,000', url: 'https://mempool.space/block/840000' },
    hashrate: { label: 'mempool.space, hashrate and difficulty', url: 'https://mempool.space/graphs/mining/hashrate-difficulty' },
    pools: { label: 'mempool.space, mining pool share', url: 'https://mempool.space/graphs/mining/pools' },
    difficultyDrop: { label: 'CoinDesk, July 2021 difficulty adjustments', url: 'https://www.coindesk.com/markets/2021/07/19/bitcoin-network-sees-fourth-straight-downward-difficulty-adjustment' },
    cambridge: { label: 'Cambridge Digital Mining Industry Report (April 2025)', url: 'https://www.jbs.cam.ac.uk/faculty-research/centres/alternative-finance/publications/cambridge-digital-mining-industry-report/' },
    cambridgeNews: { label: 'Cambridge Judge Business School summary', url: 'https://www.jbs.cam.ac.uk/2025/cambridge-study-sustainable-energy-rising-in-bitcoin-mining/' },
    cbeci: { label: 'Cambridge CBECI live index', url: 'https://ccaf.io/cbnsi/cbeci' },
    miningMap: { label: 'Cambridge mining map', url: 'https://ccaf.io/cbnsi/cbeci/mining_map' },
    eia: { label: 'EIA Electric Power Monthly, Table 5.6.A', url: 'https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a' },
    asicValue: { label: 'ASIC Miner Value, S9 vs S21 XP', url: 'https://www.asicminervalue.com/miners/compare/bitmain--antminer-s9-13-5th,bitmain--antmine-s21-xp-270th' },
    sv2: { label: 'Stratum V2 specification', url: 'https://github.com/stratum-mining/sv2-spec' },
    etcAttack: { label: 'CoinDesk, Ethereum Classic 51% attacks (2020)', url: 'https://www.coindesk.com/markets/2020/08/29/ethereum-classic-hit-by-third-51-attack-in-a-month' },
    btgAttack: { label: 'Cointelegraph, Bitcoin Gold 51% attack (2020)', url: 'https://cointelegraph.com/news/bitcoin-gold-blockchain-hit-by-51-attack-leading-to-70k-double-spend' },
} as const satisfies Record<string, Source>;

export const metadata: Metadata = {
    title: 'How Bitcoin Mining Works',
    description: 'What miners compute, how difficulty and halvings hold issuance to schedule, what a 51% attack can and cannot do, and the honest numbers on mining energy use.',
    keywords: [
        'bitcoin mining explained',
        'how bitcoin mining works',
        'bitcoin halving',
        'bitcoin difficulty adjustment',
        'bitcoin mining pools',
        '51% attack bitcoin',
        'bitcoin security budget',
        'bitcoin mining energy use',
        'hashprice',
        'is bitcoin mining profitable',
    ],
    alternates: {
        canonical: '/mining',
    },
    openGraph: {
        images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
        title: 'How Bitcoin Mining Works',
        description: 'Hashing, difficulty, pools, ASIC economics, the security budget, the energy debate. Explained straight, with the common myths corrected.',
        type: 'article',
        url: '/mining',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        images: ['/opengraph-image'],
        card: 'summary_large_image',
        title: 'How Bitcoin Mining Works',
        description: 'Hashing, difficulty, pools, ASIC economics, the security budget, the energy debate. Explained straight, with the common myths corrected.',
        creator: '@9drix9',
    },
};

const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://btcdollarcostaverage.com" },
        { "@type": "ListItem", "position": 2, "name": "Mining Guide", "item": "https://btcdollarcostaverage.com/mining" },
    ],
};

const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "How Bitcoin Mining Works",
    "description": "What miners compute, how difficulty and halvings hold issuance to schedule, what a 51% attack can and cannot do, and the honest numbers on mining energy use.",
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
    // Static date. Update when the content changes, and keep in sync with sitemap.ts.
    "dateModified": "2026-08-08",
};

const faqs: { q: string; a: string; sources?: readonly Source[] }[] = [
    {
        q: 'Is Bitcoin mining still profitable at home?',
        a: 'Almost never, at residential electricity prices. A current-generation machine such as the Antminer S21 XP draws about 3.6 kW, or roughly 2,600 kWh a month. At the US residential average of 18.4 cents per kWh that is about $480 of electricity. Industrial miners buy the same power for $0.03 to $0.05 per kWh, so their cost per bitcoin is roughly four to six times lower. And network difficulty is set by their economics, not yours. Home mining can still make sense as a hobby, as a heat source, or where power is unusually cheap. Treated purely as an investment, it is normally beaten by buying bitcoin outright.',
        sources: [SRC.asicValue, SRC.eia],
    },
    {
        q: 'What is hashprice?',
        a: 'Hashprice is mining revenue per unit of hashrate per day, usually quoted in dollars per petahash per day. It compresses bitcoin\'s price, network difficulty and transaction fees into one number. It is the figure miners underwrite hardware purchases and power contracts against. It falls whenever difficulty grows faster than price, and it spikes when fees surge. Each halving cuts it roughly in half overnight, because it halves the subsidy component of that revenue.',
        sources: [SRC.controlledSupply],
    },
    {
        q: 'Do mining costs put a floor under Bitcoin\'s price?',
        a: 'No. The causation runs the other way. Difficulty re-targets every 2,016 blocks, about two weeks. So when the price falls, unprofitable miners switch off, difficulty drops, and the cost of producing a bitcoin falls to meet the price. Mining cost tracks price rather than supporting it. What you can observe instead is miner capitulation: stressed miners sell production and reserves, which adds supply during weakness rather than removing it.',
        sources: [SRC.pow],
    },
    {
        q: 'What happens when all 21 million bitcoin are mined?',
        a: 'After roughly 33 halvings the subsidy rounds to zero in integer satoshis, which lands around the year 2140. From then on, miners earn only transaction fees. Whether fees alone can fund enough security is the most interesting open question in Bitcoin. It depends on how much demand there is for on-chain settlement decades from now. Anyone who tells you it is definitely fine, or definitely fatal, is claiming to know something nobody knows.',
        sources: [SRC.controlledSupply, SRC.amountH],
    },
    {
        q: 'Does Bitcoin mining waste energy?',
        a: 'Mining uses real energy on purpose. That expenditure is what makes rewriting history expensive. Cambridge\'s most recent full study put annual consumption at 138 TWh, about 0.54% of global electricity, using data through mid-2024. The live Cambridge index has run higher since. Nobody meters the network, so every figure is a model built from observed hashrate and an assumed hardware mix. The same study found 52.4% of the energy mix came from renewables and nuclear. Whether that use is justified is a value judgment about what you think the network is for. The numbers do not settle it.',
        sources: [SRC.cambridge, SRC.cambridgeNews, SRC.cbeci],
    },
    {
        q: 'Can a government ban Bitcoin mining?',
        a: 'Within its own borders, yes, and several have. China cracked down on mining in mid-2021 and a large share of the network\'s hashrate went offline within weeks. Difficulty adjusted downward by about 28% on 3 July 2021, the largest single drop on record. It was one of four consecutive negative adjustments. Blocks kept being produced throughout, and the hashrate reappeared elsewhere over the following year. A national ban relocates mining rather than stopping it, because mining needs only cheap power and an internet connection.',
        sources: [SRC.difficultyDrop, SRC.miningMap],
    },
    {
        q: 'Could someone with 51% of the hashrate steal my bitcoin?',
        a: 'No. A majority attacker can reverse its own recent transactions, censor transactions and reorganize recent blocks. The whitepaper says so directly: an attacker cannot make "arbitrary changes, such as creating value out of thin air or taking money that never belonged to the attacker". Every full node checks those rules independently and rejects invalid blocks no matter how much work sits behind them. Coins in a wallet you control are not at risk from hashrate.',
        sources: [SRC.whitepaper, SRC.amountH],
    },
    {
        q: 'Why can\'t newly mined bitcoin be spent right away?',
        a: 'Newly issued coins are subject to a 100-block maturity rule, roughly 16 to 17 hours. It is a single constant in the reference implementation: COINBASE_MATURITY = 100. If a competing chain later orphans that block, the reward disappears with it. The rule stops anyone from spending coins that a chain reorganization might erase.',
        sources: [SRC.consensusH],
    },
    {
        q: 'Can I mine bitcoin with a normal computer or a gaming GPU?',
        a: 'Not usefully, and not for well over a decade. Mining is done by ASICs: chips that do nothing but SHA-256 hashing. A 2024-era machine delivers 270 TH/s at 13.5 joules per terahash; general-purpose CPUs and GPUs are behind by many orders of magnitude. Software offering to mine bitcoin on an ordinary computer is either mining a different coin or is malware.',
        sources: [SRC.asicValue],
    },
];

const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(item => ({
        "@type": "Question",
        "name": item.q,
        "acceptedAnswer": { "@type": "Answer", "text": item.a },
    })),
};

const HALVING_DATA = [
    { halving: 'Start', block: 0, date: 'Jan 3, 2009', reward: '50 BTC', supplyAfter: '0' },
    { halving: '1st', block: 210000, date: 'Nov 28, 2012', reward: '25 BTC', supplyAfter: '10.5M' },
    { halving: '2nd', block: 420000, date: 'Jul 9, 2016', reward: '12.5 BTC', supplyAfter: '15.75M' },
    { halving: '3rd', block: 630000, date: 'May 11, 2020', reward: '6.25 BTC', supplyAfter: '18.375M' },
    { halving: '4th', block: 840000, date: 'Apr 20, 2024', reward: '3.125 BTC', supplyAfter: '19.6875M' },
    { halving: '5th', block: 1050000, date: '~Apr 2028', reward: '1.5625 BTC', supplyAfter: '20.34M' },
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
    tagline: 'Hashrate exposure without owning hardware',
    description: 'GoMining sells tokenized shares of hashrate hosted in its own facilities, paying holders a share of mining output in bitcoin. What you buy is exposure to mining revenue, not bitcoin itself, so your return depends on difficulty, on price, and on the operator staying solvent.',
    claims: ['No equipment to buy or maintain', 'Payouts made in bitcoin', 'Entry from roughly $30', 'Hashrate hosted in operator-run data centers'],
    price: 'From ~$30',
    href: 'https://gomining.com/?ref=v56m_',
    image: '/wallets/gomining.png',
};

const affiliateClasses = {
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    border: 'border-amber-200 dark:border-amber-800/50',
    badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
    button: 'bg-amber-500 hover:bg-amber-600',
    accent: 'text-amber-700 dark:text-amber-400',
    check: 'text-amber-500',
};

const cardClass = 'bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700';
const cardTitle = 'text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2';
const cardBody = 'text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed';
const sectionHead = 'text-xl sm:text-3xl font-bold text-slate-900 dark:text-white';
const sectionIcon = 'w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0';
const prose = 'space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed';
const linkClass = 'text-amber-700 dark:text-amber-400 hover:underline';

/** Unobtrusive inline external link used for citations in prose. */
function Src({ href, children }: { href: string; children: ReactNode }) {
    return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {children}
        </a>
    );
}

/** Compact "Source: …" footer attached to a card or FAQ answer. */
function Cite({ items }: { items: readonly Source[] }) {
    return (
        <p className="mt-2 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            <span className="font-semibold">{items.length > 1 ? 'Sources' : 'Source'}:</span>{' '}
            {items.map((s, i) => (
                <span key={s.url}>
                    {i > 0 && ' · '}
                    <Src href={s.url}>{s.label}</Src>
                </span>
            ))}
        </p>
    );
}

const HALVING_INTERVAL = 210_000;
const INITIAL_SUBSIDY = 50;
const TOTAL_ERAS = 33; // After 33 halvings integer arithmetic drives the subsidy to zero.

// Fallback height used when the mempool.space API is unavailable.
//
// This was a hardcoded constant, which silently rotted: it read 958,000 while
// the chain was at 961,685, ~3,700 blocks (about 25 days) low after two months,
// and it would keep drifting for as long as nobody re-checked it. Bitcoin's
// difficulty adjustment pins issuance to roughly one block per ten minutes, so
// the height is predictable from any known anchor — extrapolating stays accurate
// on its own instead of decaying between manual edits.
//
// Anchor verified against mempool.space on the date shown.
const BLOCK_HEIGHT_ANCHOR = { height: 961_685, ts: Date.UTC(2026, 7, 9) };
const BLOCKS_PER_DAY = 144; // 6 per hour at the 10-minute target.

function estimateBlockHeight(): number {
    const elapsedDays = Math.max(0, (Date.now() - BLOCK_HEIGHT_ANCHOR.ts) / 86_400_000);
    // Must stay >= 840,000 so the four past halvings still render as past. The
    // anchor is far above that and the estimate only grows, so that holds.
    return BLOCK_HEIGHT_ANCHOR.height + Math.floor(elapsedDays * BLOCKS_PER_DAY);
}

/** Block subsidy in BTC at a given height, straight from the halving schedule. */
function subsidyAtHeight(height: number): number {
    const era = Math.floor(height / HALVING_INTERVAL);
    if (era >= TOTAL_ERAS) return 0;
    return INITIAL_SUBSIDY / 2 ** era;
}

/**
 * Total BTC issued by a given height. Includes the genesis block's 50 BTC,
 * which is famously unspendable, so the spendable supply is slightly lower.
 */
function issuedSupply(height: number): number {
    let total = 0;
    for (let era = 0; era < TOTAL_ERAS; era++) {
        const eraStart = era * HALVING_INTERVAL;
        if (height < eraStart) break;
        const blocksInEra = Math.min(height - eraStart + 1, HALVING_INTERVAL);
        total += blocksInEra * (INITIAL_SUBSIDY / 2 ** era);
    }
    return total;
}

export default async function MiningPage() {
    // Fetch current block height to determine which halvings have occurred.
    // || (not ??) so a null OR zero height falls back. Height 0 would wrongly
    // mark every past halving as future.
    const currentBlockHeight = (await getBlockHeight()) || estimateBlockHeight();

    const currentEra = Math.floor(currentBlockHeight / HALVING_INTERVAL);
    const currentSubsidy = subsidyAtHeight(currentBlockHeight);
    const issued = issuedSupply(currentBlockHeight);
    const issuedMillions = (issued / 1_000_000).toFixed(2);
    const issuedPercent = ((issued / 21_000_000) * 100).toFixed(1);
    const nextHalvingHeight = (currentEra + 1) * HALVING_INTERVAL;
    const blocksToHalving = Math.max(nextHalvingHeight - currentBlockHeight, 0);
    const nextHalvingRow = HALVING_DATA.find((row) => row.block === nextHalvingHeight);

    const stats = [
        { label: 'Block height', value: currentBlockHeight.toLocaleString(), sub: 'blocks mined so far' },
        { label: 'Block subsidy', value: `${currentSubsidy} BTC`, sub: `subsidy era ${currentEra + 1} of ${TOTAL_ERAS}` },
        { label: 'BTC issued', value: `${issuedMillions}M`, sub: `${issuedPercent}% of the 21M cap` },
        { label: 'Next halving', value: blocksToHalving.toLocaleString(), sub: `blocks away · ${nextHalvingRow?.date ?? 'scheduled'}` },
    ];

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
            />
            <div className="measure max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10 sm:space-y-16">

                {/* Hero */}
                <section className="text-center max-w-3xl mx-auto space-y-4 sm:space-y-5">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs sm:text-sm font-medium">
                        <Pickaxe className="w-4 h-4" />
                        Plain English, no hand-waving
                    </div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white text-balance">
                        How Bitcoin <span className="text-amber-700 dark:text-amber-400">Mining</span> Works
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
                        Mining is how new bitcoin gets issued, and how the transaction history is made expensive to rewrite.
                        This page covers what miners literally compute, and how difficulty and halvings hold issuance to
                        schedule. It covers what an attacker with most of the network&apos;s hashrate can and cannot do.
                        Hashrate just means the total computing power pointed at mining. And it covers what is and is not
                        known about the energy use.
                    </p>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
                        It also corrects the most repeated myth in mining commentary: that production cost puts a floor under the price.
                    </p>
                </section>

                {/* Live stats strip */}
                <section aria-label="Current network figures" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {stats.map((stat) => (
                        <div key={stat.label} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                            <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{stat.label}</div>
                            <div className="mt-1 text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{stat.value}</div>
                            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{stat.sub}</div>
                        </div>
                    ))}
                </section>

                {/* 1. What miners compute */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Hash className={sectionIcon} />
                        <h2 className={sectionHead}>What Miners Are Computing</h2>
                    </div>
                    <div className={prose}>
                        <p>
                            Mining gets described as &ldquo;solving complex math problems.&rdquo; That&apos;s misleading. Nothing is
                            being solved. Miners are guessing, very fast, at enormous scale.
                        </p>
                        <p>
                            Every candidate block starts with an 80-byte <strong className="text-slate-800 dark:text-slate-200">block
                            header</strong>. It holds six fields: the previous block&apos;s hash, a Merkle root summarizing every
                            transaction in the block, a timestamp, the current target, a version field, and a 32-bit nonce. The
                            nonce is just a counter the miner can set to anything. Those six fields, and their sizes, are{' '}
                            <Src href={SRC.blockChainRef.url}>specified exactly</Src>. The miner runs SHA-256 over
                            that header twice, producing a 256-bit number, and checks one thing: is that number below the target?
                        </p>
                        <p>
                            Almost always it isn&apos;t. So the miner changes something and hashes again. The nonce alone gives about
                            4.3 billion attempts, which a modern machine burns through in a fraction of a second. So miners also vary
                            the <strong className="text-slate-800 dark:text-slate-200">extranonce</strong> inside the coinbase
                            transaction, which changes the Merkle root and with it the entire header. They roll the timestamp too,
                            and use spare bits in the version field. No strategy helps. SHA-256 output is unpredictable by design, so
                            the only method is to try.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                            <div className={cardClass}>
                                <h3 className={cardTitle}>Finding a block: astronomically hard</h3>
                                <p className={cardBody}>
                                    Across the whole network, miners run on the order of a sextillion (10<sup>21</sup>) hashes every
                                    second. It still takes about ten minutes for one of them to get lucky. Every failed guess burned
                                    real electricity that nobody gets back.
                                </p>
                                <Cite items={[SRC.hashrate]} />
                            </div>
                            <div className={cardClass}>
                                <h3 className={cardTitle}>Nobody has to trust the result</h3>
                                <p className={cardBody}>
                                    Verification is two SHA-256 operations and one numeric comparison. A phone does it in microseconds.
                                    You never have to trust the miner, replay the search, or take anyone&apos;s word for anything.
                                </p>
                            </div>
                        </div>
                        <div className="bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-amber-400 px-4 sm:px-6 py-3 sm:py-4 rounded-r-xl">
                            <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
                                <strong className="text-slate-800 dark:text-slate-200">That asymmetry is the security model.</strong> Each
                                block header commits to the one before it, so changing an old transaction invalidates every block built on
                                top of it. Rewriting history means redoing all that work faster than the rest of the network extends the
                                chain. Meanwhile anyone in the world can detect the fraud for free.
                            </p>
                        </div>
                    </div>
                </section>

                {/* 2. Difficulty */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <BarChart3 className={sectionIcon} />
                        <h2 className={sectionHead}>Difficulty: The Thermostat</h2>
                    </div>
                    <div className={prose}>
                        <p>
                            Bitcoin targets one block roughly every ten minutes, no matter how much computing power is pointed at it.
                            One automatic rule does all the work.{' '}
                            <strong className="text-slate-800 dark:text-slate-200">Every 2,016 blocks (about two weeks) every node
                            independently recalculates the target</strong> from how long those 2,016 blocks took. Faster than two
                            weeks, and the target tightens. Slower, and it loosens. That rule is the difficulty adjustment, and how
                            tight the target is set is what people mean by difficulty. It is about forty lines of code in{' '}
                            <Src href={SRC.pow.url}>Bitcoin Core&apos;s pow.cpp</Src>, and every node runs its own copy.
                        </p>
                        <div className="grid sm:grid-cols-3 gap-3 sm:gap-4">
                            <div className="bg-emerald-50 dark:bg-emerald-950/20 p-4 sm:p-5 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
                                <h3 className="text-sm sm:text-base font-bold text-emerald-800 dark:text-emerald-300 mb-2">Hashrate joins</h3>
                                <p className={cardBody}>
                                    Blocks arrive early, difficulty rises at the next re-target, and block times settle back to ten
                                    minutes. The new machines earn a smaller share of the same issuance, not extra coins.
                                </p>
                            </div>
                            <div className="bg-rose-50 dark:bg-rose-950/20 p-4 sm:p-5 rounded-xl border border-rose-200 dark:border-rose-800/50">
                                <h3 className="text-sm sm:text-base font-bold text-rose-800 dark:text-rose-300 mb-2">Hashrate leaves</h3>
                                <p className={cardBody}>
                                    Blocks come slower until the next re-target, which lowers difficulty and pulls block times back to
                                    ten minutes. The chain never stalls. It just gets cheaper to mine.
                                </p>
                            </div>
                            <div className={cardClass}>
                                <h3 className={cardTitle}>Clamped at 4x</h3>
                                <p className={cardBody}>
                                    A single adjustment can never move difficulty by more than a factor of four in either direction.
                                    Before any recalculation, the measured timespan is clamped to a quarter of the target at one end
                                    and four times it at the other. That caps the damage from timestamp manipulation and smooths out
                                    real shocks.
                                </p>
                                <Cite items={[SRC.pow]} />
                            </div>
                        </div>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">This is what makes issuance predictable decades
                            ahead.</strong> The supply schedule is denominated in blocks, not calendar time: the subsidy halves every
                            210,000 blocks, full stop. Difficulty is the mechanism that keeps 210,000 blocks landing close to four
                            years, no matter how much hashrate arrives. A hundredfold increase in mining power produces no extra
                            bitcoin at all. It only makes each block harder to find.
                        </p>
                        <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                            <h3 className={cardTitle}>It has been stress-tested</h3>
                            <p className={cardBody}>
                                In mid-2021 China cracked down on mining and a large share of the network&apos;s hashrate went dark within
                                weeks. Blocks slowed noticeably. The 3 July re-target cut difficulty by about 28%, the largest single
                                drop in Bitcoin&apos;s history, and one of four consecutive downward adjustments. No committee met. No
                                emergency patch shipped. The chain kept producing blocks the entire time, and the hashrate reappeared
                                elsewhere over the following year. Cambridge notes that no country-level data has been available for China
                                since that crackdown. Treat any precise &ldquo;share that left&rdquo; figure with caution.
                            </p>
                            <Cite items={[SRC.difficultyDrop, SRC.miningMap]} />
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                A detail for the pedants: the retarget code walks back{' '}
                                <Src href={SRC.pow.url}>DifficultyAdjustmentInterval() &minus; 1</Src> blocks, so it measures the elapsed
                                time across 2,015 block intervals rather than 2,016. The network runs a hair fast as a result. It&apos;s
                                one of the oldest known quirks in Bitcoin, left alone because fixing it would change consensus rules for
                                no practical gain.
                            </p>
                        </div>
                    </div>
                </section>

                {/* 3. Halving + schedule */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Clock className={sectionIcon} />
                        <h2 className={sectionHead}>The Halving and the Issuance Schedule</h2>
                    </div>
                    <div className={prose}>
                        <p>
                            Every 210,000 blocks the block subsidy, the new coins paid to whoever mines the block, is cut in half. It
                            started at 50 BTC in 2009, then 25 in 2012, 12.5 in 2016, 6.25 in 2020, and{' '}
                            <strong className="text-slate-800 dark:text-slate-200">3.125 BTC since{' '}
                            <Src href={SRC.block840k.url}>block 840,000, mined on 20 April 2024</Src></strong>.
                            The next halving takes it to 1.5625 BTC at block 1,050,000, expected around April 2028. That date is an
                            estimate, because the schedule counts blocks, not days.
                        </p>

                        <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 p-6 sm:p-8 rounded-2xl">
                            <div className="text-xl sm:text-2xl md:text-3xl font-extrabold mb-3">
                                What the halving buys you
                            </div>
                            <p className="text-sm sm:text-base text-slate-900 leading-relaxed">
                                Predictability, not a price trigger. Every full node enforces the schedule independently, so issuance
                                cannot be accelerated by demand, lobbied for, or voted on. You can check that property today. The popular
                                claim, that halvings cause bull markets, is much weaker. There have been four of them, prices rose in the
                                year or so after most, and four observations cannot separate the halving from the macro cycle. Halvings
                                are also perfectly foreseeable, so markets have years to price each one in.
                            </p>
                        </div>

                        {/* Halving table */}
                        <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white">The Complete Halving Schedule</h3>
                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                                Subsidy shown is the reward <em>after</em> that halving. Dates past the next one are estimates, since
                                block times drift slightly around the ten-minute target.
                            </p>
                            <div className="overflow-x-auto -mx-2 sm:mx-0">
                                <table className="w-full text-xs sm:text-sm min-w-[480px]">
                                    <thead>
                                        <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                            <th scope="col" className="pb-2 pr-3 font-medium">Halving</th>
                                            <th scope="col" className="pb-2 pr-3 font-medium">When</th>
                                            <th scope="col" className="pb-2 pr-3 font-medium">Block Subsidy</th>
                                            <th scope="col" className="pb-2 font-medium">Total BTC After</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-700 dark:text-slate-300 tabular-nums">
                                        {HALVING_DATA.map((row, idx) => {
                                            const isPast = currentBlockHeight >= row.block;
                                            return (
                                                <tr
                                                    key={row.halving}
                                                    className={`border-t border-slate-200 dark:border-slate-700/50 ${isPast ? '' : 'text-slate-500 dark:text-slate-400'}`}
                                                >
                                                    <td className="py-2 pr-3 font-medium">
                                                        {row.halving}
                                                        {isPast && idx > 0 && <span className="ml-1 text-emerald-700 dark:text-emerald-400">&#10003;</span>}
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
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                After 33 halvings the subsidy rounds to zero in integer satoshis, which happens around 2140. Slightly{' '}
                                <em>fewer</em> than 21 million will ever be spendable, though. The genesis block&apos;s 50 BTC can never
                                be moved, because of a quirk in the original code. A handful of miners have claimed less than the full
                                subsidy they were owed. And an unknowable number of coins are permanently lost.
                            </p>
                            <Cite items={[SRC.controlledSupply, SRC.genesis, SRC.amountH]} />
                        </div>

                        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                            <div className={cardClass}>
                                <h3 className={cardTitle}>The coinbase transaction</h3>
                                <p className={cardBody}>
                                    Every block&apos;s first transaction is the coinbase. It has no inputs: it creates the subsidy out of
                                    nothing and sweeps up the fees from every other transaction in the block. It also carries an arbitrary
                                    data field. That is where Satoshi wrote <em>&ldquo;The Times 03/Jan/2009 Chancellor on brink of
                                    second bailout for banks&rdquo;</em> into the genesis block. (The exchange named itself after the
                                    term, not the other way around.)
                                </p>
                                <Cite items={[SRC.genesis]} />
                            </div>
                            <div className={cardClass}>
                                <h3 className={cardTitle}>100-block maturity</h3>
                                <p className={cardBody}>
                                    Newly mined coins cannot be spent for 100 blocks, about 16 to 17 hours. It is a single constant,
                                    COINBASE_MATURITY, in the reference implementation. If a competing chain later orphans that block,
                                    meaning that chain wins and the block drops out of history, the reward vanishes with it. The rule
                                    stops anyone from spending coins that a reorganization might erase. A small detail, and a sign of
                                    how carefully the reorg case was thought through.
                                </p>
                                <Cite items={[SRC.consensusH]} />
                            </div>
                        </div>
                    </div>
                </section>

                {/* 4. Mining pools */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Users className={sectionIcon} />
                        <h2 className={sectionHead}>Mining Pools: Selling Certainty</h2>
                    </div>
                    <div className={prose}>
                        <p>
                            Solo mining is a lottery with brutal odds. A single top-end machine at roughly 250 TH/s is about one part in
                            four million of a network running near a{' '}
                            <Src href={SRC.hashrate.url}>zettahash per second</Src>. On average it finds a block once every seventy
                            years or so. And &ldquo;on average&rdquo; hides the real problem: the process is memoryless. Your block is
                            equally likely to arrive tomorrow or in year 200.
                        </p>
                        <p>
                            Pools exist to sell you out of that variance. Miners submit <strong className="text-slate-800 dark:text-slate-200">shares</strong>:
                            near-miss hashes that clear a much easier target and statistically prove how much work was done. The pool
                            aggregates everyone&apos;s hashrate, finds blocks at a steady rate, and pays members in proportion to shares
                            submitted. A century-scale lottery becomes a predictable daily trickle. That, and nothing else, is the product.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                            <div className={cardClass}>
                                <h3 className={cardTitle}>PPS and FPPS</h3>
                                <p className={cardBody}>
                                    Pay-per-share: the pool pays a fixed rate for every valid share, whether or not the pool finds any
                                    blocks that day. FPPS adds an average share of transaction fees on top. The pool absorbs all the
                                    variance and charges a higher fee for carrying that risk. Revenue comes out smooth and boring, which
                                    is exactly what a miner with a power bill wants.
                                </p>
                            </div>
                            <div className={cardClass}>
                                <h3 className={cardTitle}>PPLNS</h3>
                                <p className={cardBody}>
                                    Pay-per-last-N-shares: payouts come only out of blocks the pool actually finds, split across the most
                                    recent N shares. Fees are lower and income is lumpier. Loyalty gets rewarded, since hopping between
                                    pools forfeits your position in the share window. Over the long run PPLNS and PPS converge; they
                                    differ in who holds the risk in the meantime.
                                </p>
                            </div>
                        </div>
                        <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                            <h3 className={cardTitle}>The centralization concern, stated fairly</h3>
                            <p className={cardBody}>
                                A small number of pools have often directed a majority of the network&apos;s hashrate between them, and{' '}
                                <Src href={SRC.pools.url}>the current split is public</Src>. That is a real problem worth naming. Pools
                                build the block templates, so they decide which transactions get included, which makes them the most
                                plausible censorship chokepoint in the system.
                            </p>
                            <p className={cardBody}>
                                Two things bound it. First, <strong className="text-slate-800 dark:text-slate-200">pools do not own the
                                hashrate</strong>. Thousands of independent operators do, and they can repoint their machines at a
                                different pool in minutes; that has happened when pools have behaved badly. Second,{' '}
                                <strong className="text-slate-800 dark:text-slate-200">pools cannot break consensus rules</strong>. A pool
                                that mined a block paying itself extra coins, or spending someone else&apos;s coins, would have that block
                                rejected by every full node. It would have burned the electricity for nothing. Nodes enforce the rules;
                                miners only order transactions. The{' '}
                                <Link href="/why-bitcoin" className={linkClass}>why Bitcoin has value</Link> page covers that division of
                                power in more depth.
                            </p>
                            <p className={cardBody}>
                                Newer pooling protocols (Stratum V2) let individual miners construct their own block templates while still
                                sharing payouts, moving transaction selection back to the machine owner. Its Job Declaration Protocol is
                                the part that does this, and it defines both a coinbase-only and a full-template mode. Adoption is partial
                                and ongoing.
                            </p>
                            <Cite items={[SRC.sv2]} />
                        </div>
                    </div>
                </section>

                {/* 5. ASIC economics */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Cpu className={sectionIcon} />
                        <h2 className={sectionHead}>ASICs and the Economics of Hardware</h2>
                    </div>
                    <div className={prose}>
                        <p>
                            Mining ran on CPUs in 2009, moved to GPUs in 2010, and passed briefly through FPGAs. From 2013 onward it
                            went to <strong className="text-slate-800 dark:text-slate-200">ASICs</strong>: application-specific chips
                            that do nothing but SHA-256, wired straight into silicon. The gap is not a matter of degree. A
                            general-purpose processor is behind by many orders of magnitude. That is why hobbyist CPU and GPU mining of
                            bitcoin died well over a decade ago. Anything advertising bitcoin mining on a normal computer today is
                            mining a different coin or is malware.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                            <div className={cardClass}>
                                <h3 className={cardTitle}>Joules per terahash is the whole game</h3>
                                <p className={cardBody}>
                                    Efficiency is measured in J/TH, energy burned per trillion hashes. The S9 generation ran at about
                                    98 J/TH; the 2024 S21 XP does 13.5 J/TH, roughly seven times better. Every generation lowers the
                                    electricity price at which the previous one breaks even, and eventually strands it entirely.
                                </p>
                                <Cite items={[SRC.asicValue]} />
                            </div>
                            <div className={cardClass}>
                                <h3 className={cardTitle}>Hardware depreciates in two directions</h3>
                                <p className={cardBody}>
                                    A miner is a wasting asset. As newer machines come online, difficulty rises and your machine earns
                                    fewer bitcoin per month even if nothing else changes. Its resale value falls at the same time, for
                                    the same reason. Operators underwrite purchases against forecasts of difficulty growth, and they are
                                    frequently wrong.
                                </p>
                            </div>
                            <div className={cardClass}>
                                <h3 className={cardTitle}>Hashprice: the one number that matters</h3>
                                <p className={cardBody}>
                                    Hashprice is revenue per unit of hashrate per day, usually quoted in dollars per petahash per day. It
                                    folds price, difficulty and fees into one figure, and power contracts and hosting deals get
                                    underwritten against it. It falls whenever difficulty outruns price, and spikes when fees do. Every
                                    halving cuts it roughly in half overnight.
                                </p>
                            </div>
                            <div className={cardClass}>
                                <h3 className={cardTitle}>The honest home-mining math</h3>
                                <p className={cardBody}>
                                    An S21 XP draws 3,645 W. Run continuously that is roughly 2,600 kWh a month, about $480 at the US
                                    residential average of 18.4 cents per kWh. An industrial operator on a $0.04/kWh contract pays around
                                    $105 for identical work. Same bitcoin out, roughly four to five times the cost in, and difficulty is
                                    set by their economics. Then add a few thousand dollars of hardware, serious fan noise, and 3.6 kW of
                                    heat you have to move somewhere.
                                </p>
                                <Cite items={[SRC.asicValue, SRC.eia]} />
                            </div>
                        </div>
                        <div className="bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-amber-400 px-4 sm:px-6 py-3 sm:py-4 rounded-r-xl">
                            <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
                                <strong className="text-slate-800 dark:text-slate-200">The blunt version:</strong> if your goal is exposure
                                to bitcoin, buying bitcoin is the cheaper trade. Home mining can be worth it as a hobby, as space heating
                                you were paying for anyway, or where power is unusually cheap. As an investment, buying and holding almost
                                always beats it. You can test what a schedule of ordinary purchases would have done with the{' '}
                                <Link href="/" className={linkClass}>calculator</Link>.
                            </p>
                        </div>
                    </div>
                </section>

                {/* 6. Mining and price: the correction */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <TrendingUp className={sectionIcon} />
                        <h2 className={sectionHead}>Does Mining Cost Put a Floor Under the Price?</h2>
                    </div>
                    <div className={prose}>
                        <p>
                            <strong className="text-slate-800 dark:text-slate-200">No. The causation runs the other way, and this is the
                            single most repeated mistake in Bitcoin analysis.</strong>
                        </p>
                        <p>
                            The claim goes like this: it costs roughly $X of electricity and hardware to produce one bitcoin, so the
                            price cannot stay below $X for long. That sounds like a standard commodity argument. It fails for a specific
                            reason. With an ordinary commodity, production cost is set outside the market; the ore is however deep it is.
                            In Bitcoin, production cost is set <em>by</em> the market, through difficulty.
                        </p>
                        <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                            <h3 className={cardTitle}>The feedback loop, step by step</h3>
                            <ol className="space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                <li className="flex gap-2.5">
                                    <span className="font-bold text-amber-700 dark:text-amber-400 shrink-0 tabular-nums">1.</span>
                                    <span>The price falls.</span>
                                </li>
                                <li className="flex gap-2.5">
                                    <span className="font-bold text-amber-700 dark:text-amber-400 shrink-0 tabular-nums">2.</span>
                                    <span>The least efficient miners, the ones on the worst power contracts and the oldest machines, stop covering their electricity bill and switch off.</span>
                                </li>
                                <li className="flex gap-2.5">
                                    <span className="font-bold text-amber-700 dark:text-amber-400 shrink-0 tabular-nums">3.</span>
                                    <span>Hashrate drops and blocks come more slowly.</span>
                                </li>
                                <li className="flex gap-2.5">
                                    <span className="font-bold text-amber-700 dark:text-amber-400 shrink-0 tabular-nums">4.</span>
                                    <span>At the next re-target, within about two weeks, difficulty falls.</span>
                                </li>
                                <li className="flex gap-2.5">
                                    <span className="font-bold text-amber-700 dark:text-amber-400 shrink-0 tabular-nums">5.</span>
                                    <span>The miners still running now produce the same {currentSubsidy} BTC per block for less total energy. Average production cost has fallen to meet the price.</span>
                                </li>
                            </ol>
                            <p className={cardBody}>
                                Run it in reverse and it works the same way: a rally pulls hashrate in, difficulty climbs, and production
                                cost rises to meet the higher price. In both directions, cost chases price. Mining cost is an{' '}
                                <strong className="text-slate-800 dark:text-slate-200">output</strong> of the price, not an input to it.
                            </p>
                        </div>
                        <p>
                            The claim has a second problem too: there is no such thing as <em>the</em> cost of production. A miner on
                            flared gas at $0.02/kWh and one paying $0.09 in Europe differ by more than a factor of four. Any single global
                            figure is an average across a very wide distribution. And it is the marginal miner, the most expensive one
                            still running, who sets the shutdown point, not the average one.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                            <div className={cardClass}>
                                <h3 className={cardTitle}>The kernel of truth: capitulation is real</h3>
                                <p className={cardBody}>
                                    Deep drawdowns, meaning long slides from a price peak, do produce visible hashrate declines and
                                    negative difficulty adjustments, and analysts watch them closely. That is a real, observable market
                                    dynamic. But it marks miner{' '}
                                    <em>stress</em>, not a price level anyone is defending. The largest drop on record, about 28% on
                                    3 July 2021, followed China&apos;s crackdown: a regulatory event, not a price floor.
                                </p>
                                <Cite items={[SRC.difficultyDrop, SRC.hashrate]} />
                            </div>
                            <div className={cardClass}>
                                <h3 className={cardTitle}>Miners sell into weakness, not out of it</h3>
                                <p className={cardBody}>
                                    Miners have fiat-denominated power bills and bitcoin-denominated revenue, so they must sell a portion
                                    of production continuously. Under stress they sell treasury reserves too, and distressed operators
                                    liquidate outright. So miner behavior adds supply during downturns rather than removing it. That is
                                    the opposite of a floor.
                                </p>
                            </div>
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>What hashrate does tell you</h3>
                            <p className={cardBody}>
                                More hashrate raises the cost of rewriting recent history. That is a security statement, not a price
                                statement, and the two get conflated constantly. Bitcoin is far more expensive to attack than it was a
                                decade ago. That fact says nothing about what a coin should be worth. We keep a scorecard of claims like
                                this one on the <Link href="/why-bitcoin" className={linkClass}>why Bitcoin has value</Link> page.
                            </p>
                        </div>
                    </div>
                </section>

                {/* 7. Fees and the security budget */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Coins className={sectionIcon} />
                        <h2 className={sectionHead}>Fees and the Security Budget</h2>
                    </div>
                    <div className={prose}>
                        <p>
                            Miner revenue has two parts: the block subsidy and transaction fees. Blocks hold a limited amount of data by
                            design. When more people want to transact than there is space, they bid against each other, and the miner
                            takes the highest bidders. Fees are usually a small fraction of block revenue, often a few percent. During
                            congestion episodes they have briefly exceeded the subsidy itself: the halving block 840,000 collected{' '}
                            <Src href={SRC.block840k.url}>37.6 BTC in fees against a 3.125 BTC subsidy</Src>.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                            <div className={cardClass}>
                                <h3 className={cardTitle}>When the mempool backs up</h3>
                                <p className={cardBody}>
                                    During rallies and novel on-chain activity, the mempool (the queue of transactions waiting to be
                                    confirmed) fills and fees spike hard. Two things are worth real money in those windows: a wallet
                                    that lets you set your own fee rate, and patience.
                                </p>
                            </div>
                            <div className={cardClass}>
                                <h3 className={cardTitle}>Quiet blockspace, cheap fees</h3>
                                <p className={cardBody}>
                                    In slow periods a transaction can confirm for a few cents. Fee markets are volatile, and nothing in
                                    the protocol smooths them.
                                </p>
                            </div>
                        </div>
                        <div className="bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-amber-400 px-4 sm:px-6 py-4 sm:py-5 rounded-r-xl space-y-3">
                            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-200">
                                The security budget is Bitcoin&apos;s most interesting open question
                            </h3>
                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                                Today the subsidy pays for the overwhelming majority of mining. It halves every 210,000 blocks: under
                                1 BTC per block by the mid-2030s, and zero by around 2140. At some point, fees alone have to fund the
                                entire cost of making the chain expensive to rewrite.{' '}
                                <Src href={SRC.controlledSupply.url}>The full issuance schedule is public arithmetic</Src>.
                            </p>
                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                                Nobody knows whether that works. The optimistic case is that as more value settles on Bitcoin, fee revenue
                                in dollar terms grows to fill the gap. Pessimists counter that layers built on top batch activity
                                off-chain. On-chain fee demand then does not scale with the value being protected, and the security budget
                                shrinks relative to what is at stake. This is decades away, and it is unresolved. Treat anyone who says it
                                is obviously fine, or obviously fatal, as overstating what is known. The{' '}
                                <Link href="/why-bitcoin" className={linkClass}>risks section on the why Bitcoin page</Link> covers it
                                alongside the other open problems.
                            </p>
                        </div>
                    </div>
                </section>

                {/* 8. 51% attack */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <ShieldAlert className={sectionIcon} />
                        <h2 className={sectionHead}>What a 51% Attack Can and Cannot Do</h2>
                    </div>
                    <div className={prose}>
                        <p>
                            This is one of the most widely misunderstood topics in Bitcoin. A majority of hashrate is dangerous. Its
                            powers are also much narrower than the headlines suggest. The whitepaper drew the line itself, in
                            section 11: an attacker cannot make{' '}
                            <Src href={SRC.whitepaper.url}>&ldquo;arbitrary changes, such as creating value out of thin air or taking
                            money that never belonged to the attacker&rdquo;</Src>.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                            <div className="bg-rose-50 dark:bg-rose-950/20 p-4 sm:p-5 rounded-xl border border-rose-200 dark:border-rose-800/50 space-y-2">
                                <h3 className="text-sm sm:text-base font-bold text-rose-800 dark:text-rose-300">It CAN</h3>
                                <ul className="space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                    <li className="flex gap-2"><span className="text-rose-700 dark:text-rose-400 shrink-0">&bull;</span><span><strong className="text-slate-700 dark:text-slate-300">Reverse its own recent transactions.</strong> Deposit coins somewhere, spend them, then publish a longer chain in which the deposit never happened. This is the double spend, and it only ever works on the attacker&apos;s own coins.</span></li>
                                    <li className="flex gap-2"><span className="text-rose-700 dark:text-rose-400 shrink-0">&bull;</span><span><strong className="text-slate-700 dark:text-slate-300">Censor transactions.</strong> Refuse to include specific transactions and orphan the blocks of miners who do include them. Sustained censorship requires a sustained majority.</span></li>
                                    <li className="flex gap-2"><span className="text-rose-700 dark:text-rose-400 shrink-0">&bull;</span><span><strong className="text-slate-700 dark:text-slate-300">Reorganize recent blocks</strong> and stall confirmations. Hugely disruptive even without any theft.</span></li>
                                </ul>
                            </div>
                            <div className="bg-emerald-50 dark:bg-emerald-950/20 p-4 sm:p-5 rounded-xl border border-emerald-200 dark:border-emerald-800/50 space-y-2">
                                <h3 className="text-sm sm:text-base font-bold text-emerald-800 dark:text-emerald-300">It CANNOT</h3>
                                <ul className="space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                    <li className="flex gap-2"><span className="text-emerald-700 dark:text-emerald-400 shrink-0">&bull;</span><span><strong className="text-slate-700 dark:text-slate-300">Steal coins it lacks the keys for.</strong> Every node verifies signatures. Hashrate does not forge them.</span></li>
                                    <li className="flex gap-2"><span className="text-emerald-700 dark:text-emerald-400 shrink-0">&bull;</span><span><strong className="text-slate-700 dark:text-slate-300">Create coins out of thin air.</strong> A block whose coinbase pays more than the schedule allows is invalid, and every full node rejects it. A majority of hashrate cannot make an invalid block valid.</span></li>
                                    <li className="flex gap-2"><span className="text-emerald-700 dark:text-emerald-400 shrink-0">&bull;</span><span><strong className="text-slate-700 dark:text-slate-300">Change the 21 million cap.</strong> Same reason. The cap lives in the software users run, not in miner behavior.</span></li>
                                    <li className="flex gap-2"><span className="text-emerald-700 dark:text-emerald-400 shrink-0">&bull;</span><span><strong className="text-slate-700 dark:text-slate-300">Rewrite deep history.</strong> Undoing a year-old block means redoing a year of accumulated work while simultaneously outrunning the entire network.</span></li>
                                </ul>
                            </div>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                            <div className={cardClass}>
                                <h3 className={cardTitle}>Depth is the defense</h3>
                                <p className={cardBody}>
                                    A transaction one block deep is far cheaper to reverse than one six blocks deep, because each
                                    additional block multiplies the work an attacker must redo. That is exactly why exchanges and
                                    custodians set confirmation thresholds, and why large settlements wait for more of them.
                                </p>
                            </div>
                            <div className={cardClass}>
                                <h3 className={cardTitle}>Not hypothetical for small chains</h3>
                                <p className={cardBody}>
                                    Smaller proof-of-work chains with thin hashrate have been 51%-attacked repeatedly. Ethereum Classic
                                    was hit three times in August 2020 alone, one attack reorganizing over 7,000 blocks. Bitcoin Gold was
                                    attacked in 2018 and again in 2020. Bitcoin&apos;s defense is that it is by far the most expensive
                                    chain to out-hash. Anyone spending that much would be destroying the value of the asset they get paid
                                    in, while holding a warehouse of purpose-built hardware good for nothing else.
                                </p>
                                <Cite items={[SRC.etcAttack, SRC.btgAttack]} />
                            </div>
                        </div>
                    </div>
                </section>

                {/* 9. Energy */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Leaf className={sectionIcon} />
                        <h2 className={sectionHead}>Energy, Without the Spin</h2>
                    </div>
                    <div className={prose}>
                        <p>
                            Start with the numbers, and with how weak they are. Nobody meters the Bitcoin network. Every published figure
                            is a model built from observed hashrate plus an assumed mix of hardware. The leading estimates
                            (Cambridge&apos;s CBECI is the most cited) disagree with each other by wide margins. Cambridge&apos;s most
                            recent full study, published April 2025 on data through mid-2024, put consumption at{' '}
                            <strong className="text-slate-800 dark:text-slate-200">138 TWh per year</strong>. That is{' '}
                            <strong className="text-slate-800 dark:text-slate-200">about 0.54% of global electricity</strong>, comparable
                            to a mid-sized country. The <Src href={SRC.cbeci.url}>live index</Src> has run higher since. Treat precise
                            figures with suspicion, including the flattering ones.
                        </p>
                        <Cite items={[SRC.cambridge, SRC.cambridgeNews, SRC.cbeci]} />
                        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                            <div className={cardClass}>
                                <h3 className={cardTitle}>The strongest case for</h3>
                                <p className={cardBody}>
                                    Miners are unusually mobile and interruptible buyers of electricity. They don&apos;t need to sit near
                                    customers, they run at any hour, and they can shut down within seconds. That pushes them toward power
                                    nobody else wants: stranded hydro, curtailed wind and solar, off-peak baseload, gas that would
                                    otherwise be flared at the wellhead. Grid operators in Texas and elsewhere pay miners to curtail during
                                    demand peaks, which turns the load into a controllable, sheddable buyer. Cambridge&apos;s survey of
                                    firms covering roughly 48% of global mining put the sustainable share at 52.4%: 42.6% renewables
                                    plus 9.8% nuclear. That is up from 37.6% in 2022. It is self-reported survey data, so read it as an
                                    estimate with an obvious incentive attached.
                                </p>
                                <Cite items={[SRC.cambridgeNews, SRC.cambridge]} />
                            </div>
                            <div className={cardClass}>
                                <h3 className={cardTitle}>The strongest case against</h3>
                                <p className={cardBody}>
                                    The best version of the criticism isn&apos;t about the number at all. It is that energy spent here is
                                    energy not spent elsewhere. And &ldquo;it uses power others did not want&rdquo; does not establish
                                    that the activity is worth doing. Local costs are real too: noise complaints near facilities recur, and
                                    rapid hardware turnover produces electronic waste. Cambridge&apos;s own figures also put network
                                    emissions at 39.8 million tonnes of CO<sub>2</sub> equivalent, which is not a small number however you
                                    feel about the trade.
                                </p>
                                <Cite items={[SRC.cambridgeNews]} />
                            </div>
                        </div>
                        <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
                            <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
                                <strong className="text-slate-800 dark:text-slate-200">Where this lands:</strong> the energy use is
                                deliberate, not a bug. It is the thing that makes rewriting history expensive. Whether a settlement system
                                nobody controls is worth that cost is a value judgment, and the data does not settle it in either direction.
                                Anyone claiming the numbers alone prove mining is wasteful, or prove it is virtuous, has quietly skipped a
                                step. They have not told you what they think it is for.
                            </p>
                        </div>
                    </div>
                </section>

                {/* 10. Affiliate / hashrate exposure */}
                <section className="space-y-5" id="gomining">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Pickaxe className={sectionIcon} />
                        <h2 className={sectionHead}>Buying Mining Exposure Without Hardware</h2>
                    </div>

                    <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                        <h3 className={cardTitle}>Read this before you read the offer</h3>
                        <p className={cardBody}>
                            Buying hashrate instead of running it is a real product category. It is also a category with a long history of
                            fraud. Cloud-mining and hosted-mining operators have repeatedly taken deposits and vanished, and plenty of
                            contracts that were not outright scams still never returned their principal. Even a fully honest operator is
                            selling you a return driven by difficulty and price, two variables neither you nor they control.
                        </p>
                        <p className={cardBody}>
                            For most people, <strong className="text-slate-800 dark:text-slate-200">buying and holding bitcoin gives the
                            same directional exposure with fewer moving parts and no counterparty</strong>. A hashrate product layers
                            hashprice risk and operator risk on top of the price risk you already wanted. If you go ahead anyway, check
                            four things at minimum. How are fees deducted? Usually daily, in bitcoin, so a flat market quietly erodes
                            your position. Are advertised returns quoted before or after electricity? Is facility data independently
                            verifiable? And what happens to your position if the operator fails?
                        </p>
                    </div>

                    <div className={`${affiliateClasses.bg} border ${affiliateClasses.border} rounded-2xl overflow-hidden`}>
                        <div className="p-5 sm:p-8">
                            <div className="flex flex-col sm:flex-row gap-5 sm:gap-8">
                                {/* Product image */}
                                <div className="shrink-0 flex justify-center sm:justify-start">
                                    <div className="w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden">
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
                                            <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                                                Affiliate / sponsored
                                            </span>
                                            <span className={`text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-full ${affiliateClasses.badge}`}>{GOMINING_DATA.price}</span>
                                        </div>
                                        <p className={`text-sm font-medium ${affiliateClasses.accent}`}>{GOMINING_DATA.tagline}</p>
                                    </div>

                                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                        {GOMINING_DATA.description}
                                    </p>

                                    <div className="space-y-1.5">
                                        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">What GoMining advertises</p>
                                        {GOMINING_DATA.claims.map((claim) => (
                                            <div key={claim} className="flex items-start gap-2">
                                                <CheckCircle2 className={`w-4 h-4 ${affiliateClasses.check} shrink-0 mt-0.5`} />
                                                <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">{claim}</span>
                                            </div>
                                        ))}
                                        <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                                            These are the operator&apos;s own claims, not our findings. We have not audited their facilities.
                                        </p>
                                    </div>

                                    <a
                                        href={GOMINING_DATA.href}
                                        target="_blank"
                                        rel="noopener noreferrer sponsored"
                                        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm sm:text-base font-semibold text-slate-950 ${affiliateClasses.button} transition-colors shadow-sm`}
                                    >
                                        Visit GoMining (affiliate link)
                                        <ExternalLink className="w-4 h-4" />
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>

                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 text-center max-w-2xl mx-auto leading-relaxed">
                        Affiliate disclosure: we earn a commission if you sign up through the link above, at no extra cost to you. That is
                        part of how this free calculator is funded, which is exactly why the caveats above are stated as bluntly as they
                        are. We would rather you skip it than get hurt by it.
                    </p>
                </section>

                {/* 11. FAQ */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <HelpCircle className={sectionIcon} />
                        <h2 className={sectionHead}>Common Questions</h2>
                    </div>
                    <div className="space-y-2.5">
                        {faqs.map((item) => (
                            <details key={item.q} className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 transition-shadow hover:shadow-sm">
                                <summary className="flex items-center justify-between cursor-pointer p-4 list-none [&::-webkit-details-marker]:hidden">
                                    <h3 className="font-semibold text-sm sm:text-base text-slate-800 dark:text-slate-200 pr-4">{item.q}</h3>
                                    <ArrowRight className="w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 group-open:rotate-90 shrink-0" />
                                </summary>
                                <div className="px-4 pb-4 -mt-1">
                                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.a}</p>
                                    {item.sources && <Cite items={item.sources} />}
                                </div>
                            </details>
                        ))}
                    </div>
                </section>

                {/* CTA */}
                <section className="text-center bg-slate-100 dark:bg-slate-900/50 p-6 sm:p-10 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
                        See What the Numbers Say
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mb-5 max-w-xl mx-auto">
                        Test any dollar-cost-averaging schedule against real historical prices, with the halving dates marked on the
                        chart and the fees included.
                    </p>
                    <div className="flex flex-wrap justify-center gap-3">
                        <Link
                            href="/"
                            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                        >
                            Open the Calculator
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                        <Link
                            href="/why-bitcoin"
                            className="inline-flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold px-6 py-3 rounded-2xl transition-colors text-sm sm:text-base hover:bg-slate-50 dark:hover:bg-slate-700"
                        >
                            Why Bitcoin Has Value
                        </Link>
                    </div>
                    <p className="mt-4 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                        Curious how we source and compute all of it?{' '}
                        <Link href="/methodology" className={linkClass}>Read the methodology</Link>.
                    </p>
                </section>

                {/* Sources */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <BookOpen className={sectionIcon} />
                        <h2 className={sectionHead}>Sources</h2>
                    </div>
                    <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                            Protocol claims on this page are cited to the reference implementation or the specification, not to
                            secondary explainers. Energy and hardware figures are cited to the body that produced them. Where a
                            number could not be traced to a source, it was softened or dropped rather than repeated.
                        </p>
                        <ul className="space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                            {Object.values(SRC).map((s) => (
                                <li key={s.url} className="flex items-start gap-2">
                                    <span className="text-amber-700 dark:text-amber-400 mt-0.5 shrink-0">&bull;</span>
                                    <Src href={s.url}>{s.label}</Src>
                                </li>
                            ))}
                        </ul>
                        <p className="text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800">
                            <strong className="text-slate-600 dark:text-slate-300">Last reviewed:</strong> {LAST_REVIEWED}. Network
                            figures move constantly. The block height, subsidy and issued supply at the top of this page are fetched
                            live, and the links above go to the trackers rather than to a snapshot of them.
                        </p>
                    </div>
                </section>

                {/* Disclaimer */}
                <section className="border-t border-slate-200 dark:border-slate-800 pt-6 sm:pt-8">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                            <strong>Disclaimer:</strong> The GoMining link on this page is a paid affiliate link; if you sign up through it
                            we may earn a commission at no extra cost to you. Nothing here is financial advice. Mining hardware, hosted
                            hashrate products, and bitcoin itself all carry the risk of total loss, and network figures quoted on this page
                            are estimates that change over time. Always do your own research. This site also displays ads; see{' '}
                            <a href="/about#ads-and-analytics" className={linkClass}>/about</a> for the full disclosure.
                        </p>
                    </div>
                </section>

            </div>
        </>
    );
}
