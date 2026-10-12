import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Users, Network, Cpu, BadgeDollarSign, AlertTriangle, ArrowRight, KeyRound, Scale, HelpCircle, ShieldQuestion, BookOpen } from 'lucide-react';
import { MAX_ISSUED_SATS, formatBtc } from '../mining/halvings';

/**
 * Date the factual claims on this page were last checked against their
 * sources. Move it only after re-checking them: it is the date in the byline
 * and in the Sources box, and it must match the dateModified in the Article
 * JSON-LD below and PAGE_DATES.whyBitcoin in sitemap.ts.
 *
 * One answer also prints it as an as-of date ("still unpublished on …", for
 * Cambridge's next mining report), so moving it forward means checking
 * Cambridge's publications list again. /mining says the same thing the same way.
 */
const LAST_REVIEWED = '12 October 2026';

export const metadata: Metadata = {
    title: 'Why Bitcoin Has Value',
    description: 'How Bitcoin works, where its value comes from, which popular claims the evidence supports, and the open risks. An honest, in-depth explainer.',
    keywords: ['why bitcoin has value', 'bitcoin value proposition', 'how bitcoin works', 'bitcoin fundamentals', 'bitcoin risks', 'bitcoin security budget', 'bitcoin vs fiat', 'bitcoin misconceptions', 'is bitcoin an inflation hedge'],
    alternates: {
        canonical: '/why-bitcoin',
    },
    openGraph: {
        title: 'Where Does Bitcoin\'s Value Come From?',
        description: 'How the network works, what the evidence supports, the common misconceptions, and the open risks. A straight explainer with no hype.',
        type: 'article',
        url: '/why-bitcoin',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Where Does Bitcoin\'s Value Come From?',
        description: 'How the network works, what the evidence supports, the common misconceptions, and the open risks. A straight explainer with no hype.',
        creator: '@9drix9',
    },
};

const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://btcdollarcostaverage.com" },
        { "@type": "ListItem", "position": 2, "name": "Why Bitcoin", "item": "https://btcdollarcostaverage.com/why-bitcoin" },
    ],
};

const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Where Does Bitcoin's Value Come From?",
    "description": "How Bitcoin works, where its value comes from, which popular claims the evidence supports, and the open risks.",
    "author": {
        "@type": "Person",
        "@id": "https://btcdollarcostaverage.com/author#person",
        "name": "drix",
        "url": "https://btcdollarcostaverage.com/author"
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
    // The day the page first went live (the commit that added it). It does not
    // move when the page is revised; dateModified is the one that does.
    "datePublished": "2026-02-02",
    // Static date. Update when the content changes, and keep in sync with
    // LAST_REVIEWED above and sitemap.ts.
    "dateModified": "2026-10-12",
};

/** A single external reference. `label` is what the reader sees inline. */
type Source = { label: string; url: string };

/**
 * Every source cited on this page, keyed for reuse. Each URL was fetched and
 * checked against the claim it supports on the date in LAST_REVIEWED.
 */
const SRC = {
    whitepaper: { label: 'Bitcoin whitepaper', url: 'https://bitcoin.org/bitcoin.pdf' },
    whitepaperHtml: { label: 'whitepaper, §6 and §11', url: 'https://nakamotoinstitute.org/library/bitcoin/' },
    // The unit only. The MAX_MONEY constant in the same file is a sanity limit on
    // amounts, and its own comment says it is not the supply; the subsidy rule
    // that the supply follows from is in validation.cpp.
    amountH: { label: 'Bitcoin Core, amount.h (COIN)', url: 'https://github.com/bitcoin/bitcoin/blob/master/src/consensus/amount.h' },
    validation: { label: 'Bitcoin Core, validation.cpp (GetBlockSubsidy)', url: 'https://github.com/bitcoin/bitcoin/blob/master/src/validation.cpp' },
    pow: { label: 'Bitcoin Core, pow.cpp', url: 'https://github.com/bitcoin/bitcoin/blob/master/src/pow.cpp' },
    controlledSupply: { label: 'Bitcoin Wiki, controlled supply', url: 'https://en.bitcoin.it/wiki/Controlled_supply' },
    privacy: { label: 'bitcoin.org, protect your privacy', url: 'https://bitcoin.org/en/protect-your-privacy' },
    bip141: { label: 'BIP-141 (SegWit)', url: 'https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki' },
    bip341: { label: 'BIP-341 (Taproot)', url: 'https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki' },
    block840k: { label: 'mempool.space, block 840,000', url: 'https://mempool.space/block/840000' },
    pools: { label: 'mempool.space, pool share', url: 'https://mempool.space/graphs/mining/pools' },
    cambridge: { label: 'Cambridge Digital Mining Industry Report (2025)', url: 'https://www.jbs.cam.ac.uk/faculty-research/centres/alternative-finance/publications/cambridge-digital-mining-industry-report/' },
    cbeci: { label: 'Cambridge CBECI', url: 'https://ccaf.io/cbnsi/cbeci' },
    // A write-up of a conference talk, not a Cambridge publication. Its byline is
    // "TheEnergyMag AI" and the outlet is run by the team behind the forum where
    // the talk was given, so the label says both. Replace it with the report
    // itself once Cambridge publishes the next edition.
    cambridgePreview: { label: 'TheEnergyMag, AI-assisted write-up by the forum organiser\'s outlet of Cambridge\'s preliminary figures (25 July 2026)', url: 'https://www.theenergymag.com/news/market-news/bitcoin-energy-consumption-mix-cambridge-eif' },
    fedTarget: { label: 'Federal Reserve, why 2 percent', url: 'https://www.federalreserve.gov/faqs/economy_14400.htm' },
    fedH6: { label: 'Federal Reserve H.6 money stock', url: 'https://www.federalreserve.gov/releases/h6/current/default.htm' },
    fedMpr: { label: 'Federal Reserve, June 2022 Monetary Policy Report', url: 'https://www.federalreserve.gov/monetarypolicy/2022-06-mpr-summary.htm' },
    minnFed: { label: 'Minneapolis Fed inflation calculator', url: 'https://www.minneapolisfed.org/about-us/monetary-policy/inflation-calculator' },
    secEtp: { label: 'SEC order, 89 FR 3008 (10 Jan 2024)', url: 'https://www.federalregister.gov/documents/2024/01/17/2024-00743/self-regulatory-organizations-nyse-arca-inc-the-nasdaq-stock-market-llc-cboe-bzx-exchange-inc-order' },
    lightningPaper: { label: 'Lightning Network paper', url: 'https://lightning.network/lightning-network-paper.pdf' },
    bolts: { label: 'Lightning BOLT specifications', url: 'https://github.com/lightning/bolts' },
    s2f: { label: 'Protos, stock-to-flow invalidated', url: 'https://protos.com/bitcoin-stock-to-flow-planb-invalidated-100k-by-december-womp-womp/' },
    quantum: { label: 'Bitcoin Optech, quantum resistance', url: 'https://bitcoinops.org/en/topics/quantum-resistance/' },
    difficultyDrop: { label: 'CoinDesk, July 2021 difficulty drops', url: 'https://www.coindesk.com/markets/2021/07/19/bitcoin-network-sees-fourth-straight-downward-difficulty-adjustment' },
    // Coinbase's own candle API: [time, low, high, open, close, volume], one row
    // per UTC day. The first covers the October 2025 high and the June 2026 low
    // in one request (it returns at most 300 days); the other two are single
    // days, the closes either side of calendar 2022.
    coinbaseFall: { label: 'Coinbase BTC-USD daily candles, Oct 2025 to Jul 2026 (raw data)', url: 'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400&start=2025-10-01T00:00:00Z&end=2026-07-05T00:00:00Z' },
    coinbase2021Close: { label: 'Coinbase BTC-USD daily candle, 31 Dec 2021 (raw data)', url: 'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400&start=2021-12-31T00:00:00Z&end=2021-12-31T00:00:00Z' },
    coinbase2022Close: { label: 'Coinbase BTC-USD daily candle, 31 Dec 2022 (raw data)', url: 'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400&start=2022-12-31T00:00:00Z&end=2022-12-31T00:00:00Z' },
} as const satisfies Record<string, Source>;

/**
 * Everything the subsidy rule will ever issue, as the page prints it:
 * "20,999,999.9769". Summed from the rule itself, the way /mining does it, so
 * the two pages cannot give different totals.
 */
const SUPPLY_LIMIT_BTC = formatBtc(MAX_ISSUED_SATS);

// Underlined, not colour alone: these links sit inside running text, where amber
// against slate is about 1.5:1 and a hover underline never shows on a phone.
const srcLink = 'text-amber-700 dark:text-amber-400 underline underline-offset-2 hover:text-amber-800 dark:hover:text-amber-300';

/**
 * Unobtrusive inline external link used for citations in prose. `className` is
 * for the one place a citation stands alone as a row, the Sources list, where
 * it has to be a full-height tap target on a touch screen.
 */
function Src({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
    return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={className ? `${srcLink} ${className}` : srcLink}>
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

const misconceptions: { q: string; a: string; sources?: readonly Source[] }[] = [
    {
        q: 'Is Bitcoin anonymous?',
        a: 'No. Bitcoin is pseudonymous, meaning addresses stand in for names, and the ledger is public forever. Every transaction ever made is visible to anyone. Chain-analysis firms are good at linking addresses to identities, especially once coins touch an exchange that verified your ID. Treat it as a permanent public record with a nickname attached, not as cash.',
        sources: [SRC.privacy, SRC.whitepaperHtml],
    },
    {
        q: 'Is Bitcoin "backed by nothing"?',
        a: `It's backed by the same thing every modern currency is backed by: people's willingness to accept it, plus the cost of producing and defending it. The unusual part is where the enforcement lives. Bitcoin's supply schedule and settlement rules are checked by thousands of independent nodes, the computers running the software. They are not set by an institution that can change its mind. The limit on supply is one short rule in that software: a block could create 50 new bitcoin at first, and the amount halves every 210,000 blocks, rounded down to a whole satoshi. That adds up to ${SUPPLY_LIMIT_BTC} BTC, just under 21 million.`,
        sources: [SRC.validation, SRC.controlledSupply],
    },
    {
        q: 'Is it too late, or is one bitcoin too expensive?',
        a: 'You never buy a whole bitcoin unless you want to. One bitcoin is 100,000,000 of the protocol\'s base unit, and every exchange sells fractions. Whether it\'s "too late" is a question about future adoption, and nobody can answer that honestly. What is clear is that the unit price isn\'t the obstacle people assume it is.',
        sources: [SRC.amountH],
    },
    {
        q: 'Does Bitcoin waste energy?',
        a: `Bitcoin uses real energy on purpose: that expenditure is what makes rewriting its history expensive. Whether it's worthwhile is a value judgment, not a technical fact. As for the numbers, Cambridge's most recent full study put the network at 138 TWh a year. That is roughly 0.54% of global electricity, with 52.4% of the mix from renewables and nuclear. Cambridge's live index has run higher since. Preliminary figures from Cambridge's next edition, presented at a conference in July 2026 and still unpublished on ${LAST_REVIEWED}, put the annualized rate at about 190 TWh in December 2025 and the low-carbon share at 59.4%. Nobody meters the network, so every figure is a model.`,
        sources: [SRC.cambridge, SRC.cbeci, SRC.cambridgePreview],
    },
    {
        q: 'Is Bitcoin fast and free to use?',
        a: 'Not on its base layer. Blocks arrive roughly every ten minutes and capacity is deliberately limited, so on-chain fees rise when demand spikes. What Bitcoin optimizes for is final settlement that anyone can verify. Speed comes from layers built on top, such as Lightning.',
        sources: [SRC.whitepaperHtml, SRC.lightningPaper],
    },
    {
        q: 'Could a government just ban it?',
        a: 'Governments can and do restrict on-ramps, meaning the services that turn cash into bitcoin, along with exchanges and banking access. That moves both price and accessibility. Banning the protocol itself is much harder, because it\'s software and a peer-to-peer network with no headquarters. China\'s 2021 mining ban is the clearest test so far. A large share of the network\'s hashrate went offline within weeks: difficulty fell about 28% at the 3 July 2021 re-target, the largest drop on record. The chain kept producing blocks, and the hashrate reappeared elsewhere. Regulatory risk is real. But "ban" and "kill" are different outcomes.',
        sources: [SRC.difficultyDrop],
    },
];

const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": misconceptions.map(item => ({
        "@type": "Question",
        "name": item.q,
        "acceptedAnswer": { "@type": "Answer", "text": item.a },
    })),
};

const claims: { claim: string; verdict: string; tone: 'solid' | 'mixed' | 'weak'; detail: string; sources?: readonly Source[] }[] = [
    {
        claim: 'The supply is capped at 21 million',
        verdict: 'Well established',
        tone: 'solid',
        detail: `Enforced by every full node independently: a block that pays its miner more than that block's subsidy plus its fees is rejected. The subsidy started at 50 BTC and halves every 210,000 blocks, rounded down to a whole satoshi, which adds up to ${SUPPLY_LIMIT_BTC} BTC. Changing the rule would require nearly every user to adopt new software against their own economic interest. (Fewer still will ever be spendable. The genesis block's 50 BTC is unspendable, some miners claimed less than they were owed, and an unknowable number of coins are lost.)`,
        sources: [SRC.validation, SRC.controlledSupply],
    },
    {
        claim: 'The ledger is extremely hard to rewrite',
        verdict: 'Well established',
        tone: 'solid',
        detail: 'Rewriting recent history means out-hashing the entire network. Note where the guarantee stops. The whitepaper is explicit that a majority attacker cannot make "arbitrary changes, such as creating value out of thin air or taking money that never belonged to the attacker". It can reverse its own recent transactions, or censor other people\'s, and that is all.',
        sources: [SRC.whitepaperHtml],
    },
    {
        claim: 'Growing adoption drives value (Metcalfe\'s Law)',
        verdict: 'Directionally sensible, weak as a price model',
        tone: 'mixed',
        detail: 'More users plausibly means more value, and network-size measures do correlate with price over long horizons. The trouble is that correlation on a single asset with a short history is easy to overfit, and "users" is hard to define on a pseudonymous ledger. Useful as intuition, not as a forecast.',
    },
    {
        claim: 'Halvings cause bull markets',
        verdict: 'Unproven: tiny sample',
        tone: 'mixed',
        detail: 'A halving is the moment the reward for mining a block is cut in half. There have been four of them, the most recent at block 840,000 on 20 April 2024. Prices did rise substantially in the year or so after most of them. Four observations cannot separate the halving from the macro cycle, liquidity conditions, or reflexive expectations. Halvings are also perfectly predictable, so an efficient market should have priced them in years ahead.',
        sources: [SRC.block840k, SRC.controlledSupply],
    },
    {
        claim: 'Mining costs put a floor under the price',
        verdict: 'Backwards',
        tone: 'weak',
        detail: 'A common mistake in Bitcoin analysis. The causation runs the other way. Difficulty re-targets every 2,016 blocks (about two weeks) in the node software itself. So when the price falls, unprofitable miners switch off, difficulty drops, and the cost of production falls to meet the price. Mining cost tracks price. It does not support it.',
        sources: [SRC.pow, SRC.controlledSupply],
    },
    {
        claim: 'Bitcoin is an inflation hedge',
        verdict: 'Not supported short-term',
        tone: 'weak',
        detail: 'In 2022 some US inflation measures reached their highest levels in more than 40 years, by the Federal Reserve\'s own description. Bitcoin fell roughly 64% over that same calendar year, from a close of $46,211 on 31 December 2021 to $16,530 a year later. Over short horizons it has traded like a high-beta risk asset, meaning it swings harder than the market does. The stronger version of the argument is about long-horizon debasement of the money supply, not about tracking monthly CPI prints.',
        sources: [SRC.fedMpr, SRC.coinbase2021Close, SRC.coinbase2022Close],
    },
    {
        claim: 'Stock-to-flow predicts the price',
        verdict: 'Failed',
        tone: 'weak',
        detail: 'S2F was popular for years. Its author pledged to treat the model as invalidated if Bitcoin did not reach $100,000 by December 2021. It finished that year at $46,211 (Coinbase daily close, 31 December 2021). It is listed here because it still circulates. Treat any model that outputs a confident future price with deep skepticism.',
        sources: [SRC.s2f, SRC.coinbase2021Close],
    },
];

const toneStyles: Record<'solid' | 'mixed' | 'weak', string> = {
    solid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    mixed: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    weak: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
};

const cardClass = 'bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700';
const cardTitle = 'text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2';
const cardBody = 'text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed';

export default function WhyBitcoinPage() {
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
            <section className="text-center max-w-3xl mx-auto space-y-3 sm:space-y-4">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white text-balance">
                    Where Does <span className="text-amber-700 dark:text-amber-400">Bitcoin&apos;s</span> Value Come From?
                </h1>
                <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
                    Bitcoin has no CEO, no marketing budget, and no physical form. It has produced a block roughly every ten
                    minutes since January 2009, and it has outlived every obituary written for it. This page covers the
                    mechanics, what the value rests on, which popular arguments the evidence supports, and what could still go
                    wrong.
                </p>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
                    Written to be useful whether you end up buying any or not.
                </p>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
                    By{' '}
                    <Link href="/author" className={`${srcLink} font-medium`}>drix</Link>
                    {' '}&middot; Last reviewed {LAST_REVIEWED}
                </p>
            </section>

            {/* Section 1: How it works */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 sm:gap-3">
                    <KeyRound className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                    <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">First, How It Works</h2>
                </div>
                <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                    <p>
                        Most explanations skip the mechanics and jump straight to the price. The mechanics are the argument.
                        They&apos;re worth five minutes.
                    </p>
                    <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className={cardClass}>
                            <h3 className={cardTitle}>It is a shared ledger, not a coin</h3>
                            <p className={cardBody}>
                                There are no bitcoin files sitting anywhere. What exists is one public list of every transaction
                                ever made, copied across thousands of computers. &ldquo;Owning&rdquo; bitcoin means the
                                ledger records that certain coins can only be moved by whoever holds a specific private key.
                            </p>
                            <Cite items={[SRC.whitepaperHtml]} />
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>Keys are the ownership</h3>
                            <p className={cardBody}>
                                A private key is an enormous secret number. It produces a signature proving you authorized a spend,
                                without ever revealing the key itself. Nobody can freeze or seize coins they don&apos;t hold the key
                                for. That cuts both ways: lose your key and the coins are gone permanently.
                            </p>
                            <Cite items={[SRC.whitepaperHtml]} />
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>Miners order transactions</h3>
                            <p className={cardBody}>
                                Miners race to find a number that makes a block of transactions hash below a target. Finding it is
                                pure trial and error and burns real electricity. Checking it is instant. The winner appends the next
                                block and collects the newly issued coins plus fees, roughly every ten minutes.
                            </p>
                            <Cite items={[SRC.whitepaperHtml, SRC.pow]} />
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>Nodes enforce the rules</h3>
                            <p className={cardBody}>
                                Almost everyone misses this part. Miners propose blocks; every full node independently checks them
                                and throws out anything invalid, including a block that pays its own miner too much. The 21 million
                                cap is enforced right here, by users, not by miners and not by any authority.
                            </p>
                            <Cite items={[SRC.validation]} />
                        </div>
                    </div>
                    <p>
                        Two automatic adjustments keep the system on schedule. <strong className="text-slate-800 dark:text-slate-200">Difficulty
                        re-targets</strong> every <Src href={SRC.pow.url}>2,016 blocks</Src>, about two weeks, so blocks keep
                        arriving every ten minutes no matter how much mining power joins or leaves.{' '}
                        <strong className="text-slate-800 dark:text-slate-200">The block subsidy</strong>, the new coins paid
                        to whoever mines a block, <strong className="text-slate-800 dark:text-slate-200">halves</strong> every{' '}
                        <Src href={SRC.controlledSupply.url}>210,000 blocks</Src>, stepping issuance down
                        toward zero. Between them, the supply schedule is predictable decades in advance. The{' '}
                        <Link href="/mining" className={srcLink}>mining guide</Link>{' '}
                        has the full timetable.
                    </p>
                </div>
            </section>

            {/* Section 2: The four pillars */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 sm:gap-3">
                    <Scale className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                    <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">What the Value Rests On</h2>
                </div>
                <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                    <p>
                        Bitcoin&apos;s price is whatever people will pay, like anything else. The interesting question is which
                        properties make people willing to pay. Four of them hold up under scrutiny.
                    </p>
                    <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className={cardClass}>
                            <h3 className={cardTitle}>1. Verifiable scarcity</h3>
                            <p className={cardBody}>
                                Plenty of things are scarce. Bitcoin is scarce in a way you can check yourself: run the software
                                and it audits the entire money supply in minutes, no institution required. No commodity or currency
                                offers that. Just over 20 million of the 21 million exist today, and new issuance is already small
                                and shrinking. The <Link href="/mining" className={srcLink}>mining page</Link> computes the
                                current figure live from the block height.
                            </p>
                            <Cite items={[SRC.controlledSupply]} />
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>2. Settlement nobody can reverse</h3>
                            <p className={cardBody}>
                                Once a transaction is buried under enough blocks, reversing it is impractical. No chargeback,
                                no correspondent bank, no business-hours delay, nobody who can decide you aren&apos;t allowed to
                                receive money. If you live somewhere stable, this reads as abstract. Under capital controls,
                                sanctions, or a collapsing currency, it&apos;s the entire point.
                            </p>
                            <Cite items={[SRC.whitepaperHtml]} />
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>3. Portability without permission</h3>
                            <p className={cardBody}>
                                Value that fits inside a memorized phrase crosses any border. Gold can&apos;t do that, and bank
                                balances only move where a bank allows. There is no obvious substitute for this property, which is
                                why interest in Bitcoin spikes during currency crises rather than during calm markets.
                            </p>
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>4. Network effects</h3>
                            <p className={cardBody}>
                                Money is a coordination game. It&apos;s valuable because other people treat it as valuable. Every
                                exchange listing, custodian, ETF, payment processor, and long-term holder deepens liquidity and
                                raises the cost of switching to a competitor. Bitcoin&apos;s decade-plus head start in security and
                                liquidity is its widest moat.
                            </p>
                        </div>
                    </div>
                    <p>
                        Notice what is <em>not</em> on that list. No expectation of a specific price, no promise of returns, no
                        claim that adoption is guaranteed. Those are forecasts. The four above are properties you can check today.
                    </p>
                </div>
            </section>

            {/* Section 3: Evidence table */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 sm:gap-3">
                    <ShieldQuestion className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                    <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">What the Evidence Supports</h2>
                </div>
                <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                    <p>
                        Bitcoin discussion is full of confident claims of wildly varying quality. Below is a scorecard of the
                        arguments you&apos;ll run into most often. Two of them are claims this site used to repeat, before we
                        checked them properly.
                    </p>
                    <div className="space-y-3">
                        {claims.map((c) => (
                            <div key={c.claim} className={cardClass}>
                                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                    <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white">{c.claim}</h3>
                                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${toneStyles[c.tone]}`}>
                                        {c.verdict}
                                    </span>
                                </div>
                                <p className={cardBody}>{c.detail}</p>
                                {c.sources && <Cite items={c.sources} />}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Section 4: Monetary case */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 sm:gap-3">
                    <BadgeDollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                    <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">The Monetary Case, Stated Carefully</h2>
                </div>
                <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                    <p>
                        Fiat currencies (government-issued money like the dollar, euro, or yen) are managed to lose purchasing
                        power slowly and deliberately. The Federal Reserve, like most central banks, explicitly{' '}
                        <Src href={SRC.fedTarget.url}>targets 2% inflation over the longer run</Src>. That sounds small and
                        compounds into something substantial: run 1913 through the{' '}
                        <Src href={SRC.minnFed.url}>Minneapolis Fed&apos;s CPI calculator</Src> and the dollar has lost the large
                        majority of its purchasing power since.
                    </p>

                    <div className="bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-amber-400 px-4 sm:px-6 py-3 sm:py-4 rounded-r-xl">
                        <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
                            <strong className="text-slate-800 dark:text-slate-200">The strongest version of this argument</strong> isn&apos;t
                            that cash is a scam. It&apos;s that cash is designed to be spent rather than saved, so anyone holding
                            savings in it is quietly taxed. And the comparison that matters isn&apos;t Bitcoin versus cash under a
                            mattress. The real comparison is Bitcoin versus the other places people already move savings: index
                            funds, property, gold.
                        </p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className={cardClass}>
                            <h3 className={cardTitle}>The supply argument</h3>
                            <p className={cardBody}>
                                The Federal Reserve&apos;s own H.6 release puts US M2 above $23 trillion, trillions of dollars
                                higher than before 2020, and similar expansions happened worldwide. Bitcoin&apos;s issuance
                                schedule didn&apos;t react. It can&apos;t. That indifference to policy is the product being sold,
                                and the calculator&apos;s inflation-adjusted view shows what the expansion did to your purchasing
                                power either way.
                            </p>
                            <Cite items={[SRC.fedH6, SRC.controlledSupply]} />
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>The volatility counterargument</h3>
                            <p className={cardBody}>
                                A store of value that can fall by more than half is a hard sell over any horizon shorter than
                                several years. Bitcoin has done it repeatedly. On daily closing prices, the most recent fall
                                ran from $124,720 in October 2025 to $58,524 in June 2026, about 53%, and the price had not
                                regained that high when this page was last reviewed. The one before it ran from $67,555 in
                                November 2021 to $15,760 in November 2022, about 77%. Anyone telling you it protects your
                                savings without mentioning that is selling, not explaining. It&apos;s also the specific
                                problem dollar-cost averaging is meant to manage. A drawdown is just the fall from a peak to
                                the low that follows, and the{' '}
                                <Link href="/calculators/bitcoin-drawdown" className={srcLink}>drawdown calculator</Link>{' '}
                                lists the deepest ones with their dates, the 2021 to 2022 fall among them.
                            </p>
                            <Cite items={[SRC.coinbaseFall]} />
                        </div>
                    </div>
                </div>
            </section>

            {/* Section 5: Adoption & network */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 sm:gap-3">
                    <Network className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                    <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Where Adoption Stands</h2>
                </div>
                <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                    <p>
                        Bitcoin started as a mailing-list experiment. The{' '}
                        <Src href="https://mempool.space/block/0">genesis block was mined on 3 January 2009</Src>. Since then it
                        has reached hundreds of millions of crypto users worldwide, though published user estimates vary widely,
                        are not independently auditable, and should be treated as rough. User counts tell you less than the
                        infrastructure that has grown up around it:
                    </p>
                    <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
                        <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
                            <div>
                                <h3 className={cardTitle}>Regulated access</h3>
                                <p className={cardBody}>
                                    The SEC approved the first US spot bitcoin exchange-traded products on 10 January 2024,
                                    letting pensions, advisors, and ordinary brokerage accounts hold exposure without touching a
                                    private key. That pulled in a category of capital that was structurally unable to participate
                                    before. It also parked a lot of coins with a handful of custodians, which is a real
                                    centralization trade-off.
                                </p>
                                <Cite items={[SRC.secEtp]} />
                            </div>
                            <div>
                                <h3 className={cardTitle}>Payments layer</h3>
                                <p className={cardBody}>
                                    The Lightning Network moves payments off-chain between pre-funded channels and settles the
                                    net result on-chain, which makes small payments fast and cheap. It works. It also adds
                                    routing, liquidity, and always-online complexity that is still being smoothed out.
                                </p>
                                <Cite items={[SRC.lightningPaper, SRC.bolts]} />
                            </div>
                            <div>
                                <h3 className={cardTitle}>Protocol development</h3>
                                <p className={cardBody}>
                                    Bitcoin changes slowly on purpose. SegWit (deployed through 2016-2017) and Taproot (activated
                                    at block 709,632 in November 2021) each shipped after years of review and opt-in activation.
                                    For money, conservatism is a feature. Anyone promising fast, dramatic protocol changes is
                                    describing a different project.
                                </p>
                                <Cite items={[SRC.bip141, SRC.bip341]} />
                            </div>
                            <div>
                                <h3 className={cardTitle}>Sovereign and corporate holdings</h3>
                                <p className={cardBody}>
                                    Public companies hold bitcoin on their balance sheets, and several governments hold it too,
                                    some deliberately and some from seizures. We have not tried to total those holdings here,
                                    because the public trackers disagree and much of it is unaudited. National-level experiments with legal
                                    tender status have been mixed and politically fragile. Treat any single country&apos;s policy
                                    as reversible.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Section 6: Risks */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 sm:gap-3">
                    <AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                    <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Open Questions and Real Risks</h2>
                </div>
                <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                    <p>
                        Any page that lists only reasons to buy is advertising. These are the substantive open problems, roughly
                        in the order informed critics rank them.
                    </p>
                    <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className={cardClass}>
                            <h3 className={cardTitle}>The security budget</h3>
                            <p className={cardBody}>
                                The most interesting unsolved question in Bitcoin. Mining is paid mostly by newly issued coins
                                today. That subsidy halves every 210,000 blocks until integer satoshi arithmetic drives it to
                                zero around 2140. Eventually transaction fees alone have to fund security. Whether fee revenue
                                gets large and stable enough is unknown. It is decades away, and nobody serious hand-waves it.
                            </p>
                            <Cite items={[SRC.controlledSupply]} />
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>Volatility and correlation</h3>
                            <p className={cardBody}>
                                Bitcoin has repeatedly lost more than half its value. In recent cycles it has often moved with risk
                                assets rather than against them. If you need the money within a few years, that combination is the
                                risk that shows up in practice.
                            </p>
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>Regulation and access</h3>
                            <p className={cardBody}>
                                The protocol is hard to stop. Your ability to buy, sell, and hold it is not. Exchange rules, tax
                                treatment, banking access, and custody regulation change quickly and vary by country. A change
                                in any of them reaches you through whatever service you use to buy, sell, or hold.
                            </p>
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>Self-custody mistakes</h3>
                            <p className={cardBody}>
                                Holding your own keys moves the risk onto you. A lost seed phrase, a phishing page, or a bad
                                backup loses the coins for good, and nobody can reverse it. Leaving them with an exchange swaps
                                that for a different risk: you hold a claim on a company, and a company can fail. Our{' '}
                                <Link href="/self-custody" className={srcLink}>self-custody guide</Link>{' '}
                                covers both.
                            </p>
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>Quantum computing</h3>
                            <p className={cardBody}>
                                Bitcoin&apos;s ECDSA and Schnorr public keys are vulnerable to Shor&apos;s algorithm on an
                                idealized quantum computer, meaning one with enough capacity and reliability to run the attack.
                                The working assumption among protocol developers is that capability grows gradually, in a way
                                that can be tracked in public, and that post-quantum cryptography, whose keys and signatures
                                are much larger, can be adopted before it becomes necessary. The migration itself would be a
                                large coordination problem.
                            </p>
                            <Cite items={[SRC.quantum]} />
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>Concentration</h3>
                            <p className={cardBody}>
                                Mining pools, exchanges, and ETF custodians each concentrate influence in ways the design tried to
                                avoid. A small number of pools have often directed a majority of the hashrate, the total computing
                                power aimed at mining, between them. You can watch the current split yourself. None of it breaks
                                the rules a node enforces. Still, a system
                                whose stated virtue is decentralization deserves ongoing scrutiny about how decentralized it
                                remains.
                            </p>
                            <Cite items={[SRC.pools]} />
                        </div>
                    </div>
                </div>
            </section>

            {/* Section 7: Misconceptions */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 sm:gap-3">
                    <HelpCircle className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                    <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Common Misconceptions</h2>
                </div>
                <div className="space-y-2.5">
                    {misconceptions.map((item) => (
                        <details key={item.q} className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 transition-shadow hover:shadow-sm">
                            <summary className="flex items-center justify-between cursor-pointer p-4 list-none [&::-webkit-details-marker]:hidden">
                                <h3 className="font-semibold text-sm sm:text-base text-slate-800 dark:text-slate-200 pr-4">{item.q}</h3>
                                <svg className="w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 group-open:rotate-180 shrink-0" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                            </summary>
                            <div className="px-4 pb-4 -mt-1">
                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.a}</p>
                                {item.sources && <Cite items={item.sources} />}
                            </div>
                        </details>
                    ))}
                </div>
            </section>

            {/* Section 8: Satoshis */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 sm:gap-3">
                    <Users className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                    <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">You Don&apos;t Buy Whole Bitcoin</h2>
                </div>
                <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        Each bitcoin divides into <strong className="text-slate-800 dark:text-slate-200">100,000,000 satoshis</strong> (&ldquo;sats&rdquo;),
                        named after its pseudonymous creator. Think of them as cents to a dollar, except there are a million
                        times more sats per bitcoin than cents per dollar. Buying $20 of bitcoin is ordinary.
                    </p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs sm:text-sm">
                            <thead>
                                <tr className="text-left text-slate-500 dark:text-slate-400">
                                    <th scope="col" className="pb-2 pr-4 font-medium">If 1 BTC reaches</th>
                                    <th scope="col" className="pb-2 font-medium">1 satoshi =</th>
                                </tr>
                            </thead>
                            <tbody className="tabular-nums text-slate-700 dark:text-slate-300">
                                <tr className="border-t border-slate-200 dark:border-slate-700/50">
                                    <td className="py-1.5 pr-4">$100,000</td>
                                    <td className="py-1.5">$0.001</td>
                                </tr>
                                <tr className="border-t border-slate-200 dark:border-slate-700/50">
                                    <td className="py-1.5 pr-4">$1,000,000</td>
                                    <td className="py-1.5">$0.01 <span className="text-slate-500 dark:text-slate-400">(one cent)</span></td>
                                </tr>
                                <tr className="border-t border-slate-200 dark:border-slate-700/50">
                                    <td className="py-1.5 pr-4">$10,000,000</td>
                                    <td className="py-1.5">$0.10 <span className="text-slate-500 dark:text-slate-400">(one dime)</span></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        That table is arithmetic, not a forecast. The only point it makes is that divisibility isn&apos;t a
                        constraint. When someone says they &ldquo;can&apos;t afford a bitcoin,&rdquo; nobody was asking them to buy
                        a whole one.
                    </p>
                </div>
            </section>

            {/* Section 9: If you decide to buy */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 sm:gap-3">
                    <Cpu className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                    <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">If You Decide to Buy Any</h2>
                </div>
                <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                    <p>
                        Nothing here is advice. These are four practical points, each with a place on this site where you
                        can check the numbers yourself:
                    </p>
                    <ul className="space-y-2 ml-1">
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span><strong className="text-slate-800 dark:text-slate-200">Size.</strong> What a fall costs you depends on how much you hold, and Bitcoin has fallen 70% or more from a peak more than once. The <Link href="/calculators/bitcoin-drawdown" className="text-amber-700 dark:text-amber-400 hover:underline">drawdown calculator</Link> counts every fall of 30%, 50% and 70% or more since 2010 and lists the deepest with their dates. A past maximum is not a limit.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span><strong className="text-slate-800 dark:text-slate-200">Schedule.</strong> Buying a fixed amount on a fixed schedule takes the decision about when to buy out of your hands. This site&apos;s <Link href="/" className="text-amber-700 dark:text-amber-400 hover:underline">calculator</Link> shows how any schedule would have performed, and the <Link href="/lump-sum-vs-dca" className="text-amber-700 dark:text-amber-400 hover:underline">lump sum comparison</Link> shows how the same money did when it went in all at once.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span><strong className="text-slate-800 dark:text-slate-200">Fees.</strong> A percentage fee comes off every purchase, so a plan ends with that percentage less bitcoin than the same plan would hold with no fee. The <Link href="/calculators/exchange-fees" className="text-amber-700 dark:text-amber-400 hover:underline">exchange fee calculator</Link> shows what different rates cost over five years of weekly buys.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span><strong className="text-slate-800 dark:text-slate-200">Custody.</strong> Bitcoin left on an exchange is a claim on that company, and bitcoin in your own wallet depends on your own backup. <Link href="/self-custody" className="text-amber-700 dark:text-amber-400 hover:underline">Self-custody basics</Link> covers how the second one works.</span>
                        </li>
                    </ul>
                </div>
            </section>

            {/* CTA */}
            <section className="text-center bg-slate-100 dark:bg-slate-900/50 p-6 sm:p-10 rounded-2xl border border-slate-200 dark:border-slate-800">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
                    See What the Numbers Say
                </h2>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mb-5 max-w-xl mx-auto">
                    Test any dollar-cost-averaging schedule against real historical prices, drawdowns and fees included.
                </p>
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                >
                    Open the Calculator
                    <ArrowRight className="w-4 h-4" />
                </Link>
                <p className="mt-4 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    Curious how we compute all of it?{' '}
                    <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline">Read the methodology</Link>.
                </p>
            </section>

            {/* Sources */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 sm:gap-3">
                    <BookOpen className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                    <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Sources</h2>
                </div>
                <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        Most of the figures, dates and quotations above link to the source they came from, preferring
                        the primary document: the whitepaper, the reference implementation, the BIP, the regulator&apos;s
                        own filing, the exchange&apos;s own price data. One source is second-hand and labeled as such:
                        Cambridge&apos;s preliminary 2026 energy figures so far exist only as an AI-assisted write-up of
                        a conference talk, from the organiser&apos;s own outlet. General statements about how Bitcoin
                        is used do not all carry one. Where no source could be found for a specific claim, it was softened or removed
                        rather than dressed up. If you find something here that a source does not support, tell us and we
                        will fix it.
                    </p>
                    {/* On a phone, and on any touch screen, each source is a 44px row: as bare links
                        they were 16px tall and 24px apart. With a mouse from sm up it is a compact list. */}
                    <ul className="sm:space-y-1.5 pointer-coarse:space-y-0 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                        {Object.values(SRC).map((s) => (
                            <li key={s.url} className="flex items-center sm:items-start pointer-coarse:items-center gap-2">
                                <span className="text-amber-700 dark:text-amber-400 sm:mt-0.5 pointer-coarse:mt-0 shrink-0">&bull;</span>
                                <Src href={s.url} className="flex items-center max-sm:min-h-11 pointer-coarse:min-h-11">{s.label}</Src>
                            </li>
                        ))}
                    </ul>
                    <p className="text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800">
                        <strong className="text-slate-600 dark:text-slate-300">Last reviewed:</strong> {LAST_REVIEWED}. Live
                        figures (energy use, pool share, money supply, the price) move after that date; the links go to
                        the trackers themselves so you can read the current number rather than ours.
                    </p>
                </div>
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
