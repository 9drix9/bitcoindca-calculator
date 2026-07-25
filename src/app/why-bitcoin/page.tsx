import type { Metadata } from 'next';
import Link from 'next/link';
import { Users, Network, Cpu, BadgeDollarSign, AlertTriangle, ArrowRight, KeyRound, Scale, HelpCircle, ShieldQuestion } from 'lucide-react';

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
    // Static date. Update when the content changes, and keep in sync with sitemap.ts.
    "dateModified": "2026-07-25",
};

const misconceptions = [
    {
        q: 'Is Bitcoin anonymous?',
        a: 'No. Bitcoin is pseudonymous, and the ledger is public forever. Every transaction ever made is visible to anyone, and chain-analysis firms are good at linking addresses to identities, especially once coins touch an exchange that verified your ID. Treat it as a permanent public record with a nickname attached, not as cash.',
    },
    {
        q: 'Is Bitcoin "backed by nothing"?',
        a: 'It\'s backed by the same thing every modern currency is backed by: people\'s willingness to accept it, plus the cost of producing and defending it. The unusual part is where the enforcement lives. Bitcoin\'s supply schedule and settlement rules are checked by thousands of independent nodes running software, not by an institution that can change its mind.',
    },
    {
        q: 'Is it too late, or is one bitcoin too expensive?',
        a: 'You never buy a whole bitcoin unless you want to. Each one divides into 100 million satoshis, and every exchange sells fractions. Whether it\'s "too late" is a question about future adoption, and nobody can answer that honestly. What is clear is that the unit price isn\'t the obstacle people assume it is.',
    },
    {
        q: 'Does Bitcoin waste energy?',
        a: 'Bitcoin uses real energy on purpose: that expenditure is what makes rewriting its history expensive. Whether it\'s worthwhile is a value judgment, not a technical fact. As for the numbers, independent estimates put the network in the ballpark of a few tenths of a percent of global electricity use, comparable to a mid-sized country, with an unusually high and rising share of off-peak, stranded, and renewable generation because miners chase the cheapest power.',
    },
    {
        q: 'Is Bitcoin fast and free to use?',
        a: 'Not on its base layer. Blocks arrive roughly every ten minutes and capacity is deliberately limited, so on-chain fees rise when demand spikes. What Bitcoin optimizes for is final settlement that anyone can verify. Speed comes from layers built on top, such as Lightning.',
    },
    {
        q: 'Could a government just ban it?',
        a: 'Governments can and do restrict on-ramps, exchanges, and banking access, and that moves both price and accessibility. Banning the protocol itself is much harder, because it\'s software and a peer-to-peer network with no headquarters. Regulatory risk is real. But "ban" and "kill" are different outcomes.',
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

const claims: { claim: string; verdict: string; tone: 'solid' | 'mixed' | 'weak'; detail: string }[] = [
    {
        claim: 'The supply is capped at 21 million',
        verdict: 'Well established',
        tone: 'solid',
        detail: 'Enforced by every full node independently. Changing it would require nearly every user to adopt new software against their own economic interest. (Slightly fewer than 21M will ever be spendable, since some coins are provably lost or were never claimed.)',
    },
    {
        claim: 'The ledger is extremely hard to rewrite',
        verdict: 'Well established',
        tone: 'solid',
        detail: 'Rewriting recent history means out-hashing the entire network. Note where the guarantee stops: an attacker holding majority hashrate could reverse their own recent transactions, or censor other people\'s. They still could not spend coins they do not hold the keys to.',
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
        detail: 'There have been four halvings. Prices did rise substantially in the year or so after most of them. Four observations cannot separate the halving from the macro cycle, liquidity conditions, or reflexive expectations. Halvings are also perfectly predictable, so an efficient market should have priced them in years ahead.',
    },
    {
        claim: 'Mining costs put a floor under the price',
        verdict: 'Backwards',
        tone: 'weak',
        detail: 'The most common mistake in Bitcoin analysis. The causation runs the other way: difficulty re-targets roughly every two weeks, so when the price falls, unprofitable miners switch off, difficulty drops, and the cost of production falls to meet the price. Mining cost tracks price. It does not support it.',
    },
    {
        claim: 'Bitcoin is an inflation hedge',
        verdict: 'Not supported short-term',
        tone: 'weak',
        detail: 'In 2022, US inflation hit 40-year highs and Bitcoin fell roughly 64%. Over short horizons it trades like a high-beta risk asset, selling off whenever liquidity tightens. The stronger version of the argument is about long-horizon debasement of the money supply, not about tracking monthly CPI prints.',
    },
    {
        claim: 'Stock-to-flow predicts the price',
        verdict: 'Failed',
        tone: 'weak',
        detail: 'S2F was popular for years, and its published forecasts have been badly wrong. It is listed here because it still circulates. Treat any model that outputs a confident future price with deep skepticism.',
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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10 sm:space-y-16">

            {/* Hero */}
            <section className="text-center max-w-3xl mx-auto space-y-3 sm:space-y-4">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight text-balance">
                    Where Does <span className="text-amber-500">Bitcoin&apos;s</span> Value Come From?
                </h1>
                <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
                    Bitcoin has no CEO, no marketing budget, and no physical form. It still settles trillions of dollars a
                    year, and it has outlived every obituary written for it. This page covers the mechanics, what the value
                    rests on, which popular arguments the evidence supports, and what could still go wrong.
                </p>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
                    Written to be useful whether you end up buying any or not.
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
                                ever made, copied across tens of thousands of computers. &ldquo;Owning&rdquo; bitcoin means the
                                ledger records that certain coins can only be moved by whoever holds a specific private key.
                            </p>
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>Keys are the ownership</h3>
                            <p className={cardBody}>
                                A private key is an enormous secret number. It produces a signature proving you authorized a spend,
                                without ever revealing the key itself. Nobody can freeze or seize coins they don&apos;t hold the key
                                for. That cuts both ways: lose your key and the coins are gone permanently.
                            </p>
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>Miners order transactions</h3>
                            <p className={cardBody}>
                                Miners race to find a number that makes a block of transactions hash below a target. Finding it is
                                pure trial and error and burns real electricity. Checking it is instant. The winner appends the next
                                block and collects the newly issued coins plus fees, roughly every ten minutes.
                            </p>
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>Nodes enforce the rules</h3>
                            <p className={cardBody}>
                                Almost everyone misses this part. Miners propose blocks; every full node independently checks them
                                and throws out anything invalid, including a block that pays its own miner too much. The 21 million
                                cap is enforced right here, by users, not by miners and not by any authority.
                            </p>
                        </div>
                    </div>
                    <p>
                        Two automatic adjustments keep the system on schedule. <strong className="text-slate-800 dark:text-slate-200">Difficulty
                        re-targets</strong> about every two weeks, so blocks keep arriving every ten minutes no matter how much
                        mining power joins or leaves. <strong className="text-slate-800 dark:text-slate-200">The block subsidy
                        halves</strong> every 210,000 blocks, stepping issuance down toward zero. Between them, the supply schedule
                        is predictable decades in advance. The{' '}
                        <Link href="/mining" className="text-amber-600 dark:text-amber-400 hover:underline">mining guide</Link>{' '}
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
                                and shrinking.
                            </p>
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>2. Settlement nobody can reverse</h3>
                            <p className={cardBody}>
                                A confirmed transaction is final. No chargeback, no correspondent bank, no business-hours delay,
                                nobody who can decide you aren&apos;t allowed to receive money. If you live somewhere stable, this
                                reads as abstract. Under capital controls, sanctions, or a collapsing currency, it&apos;s the entire
                                point.
                            </p>
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
                        Fiat currencies — government-issued money like the dollar, euro, or yen — are managed to lose purchasing
                        power slowly and deliberately. Most central banks target around 2% annual inflation. That sounds small and
                        compounds into something substantial: the US dollar has lost the large majority of its purchasing power
                        since 1913.
                    </p>

                    <div className="bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-amber-400 px-4 sm:px-6 py-3 sm:py-4 rounded-r-xl">
                        <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
                            <strong className="text-slate-800 dark:text-slate-200">The strongest version of this argument</strong> isn&apos;t
                            that cash is a scam. It&apos;s that cash is designed to be spent rather than saved, so anyone holding
                            savings in it is quietly taxed. And the comparison that matters isn&apos;t Bitcoin versus cash under a
                            mattress. It&apos;s Bitcoin versus the other places people already move savings: index funds, property, gold.
                        </p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className={cardClass}>
                            <h3 className={cardTitle}>The supply argument</h3>
                            <p className={cardBody}>
                                Since 2020 the US M2 money supply expanded by trillions of dollars, and similar expansions happened
                                worldwide. Bitcoin&apos;s issuance schedule didn&apos;t react. It can&apos;t. That indifference to
                                policy is the product being sold, and the calculator&apos;s inflation-adjusted view shows what the
                                expansion did to your purchasing power either way.
                            </p>
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>The volatility counterargument</h3>
                            <p className={cardBody}>
                                A store of value that can fall 60-80% is a hard sell over any horizon shorter than several years, and
                                Bitcoin has had four such drawdowns. Anyone telling you it protects your savings without mentioning
                                that is selling, not explaining. It&apos;s also the specific problem dollar-cost averaging is meant
                                to manage.
                            </p>
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
                        Bitcoin went from a mailing-list experiment in 2009 to hundreds of millions of crypto users worldwide,
                        though estimates vary widely and should be treated as rough. User counts tell you less than the
                        infrastructure that has grown up around it:
                    </p>
                    <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
                        <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
                            <div>
                                <h3 className={cardTitle}>Regulated access</h3>
                                <p className={cardBody}>
                                    US spot ETFs launched in January 2024, letting pensions, advisors, and ordinary brokerage
                                    accounts hold exposure without touching a private key. That pulled in a category of capital
                                    that was structurally unable to participate before. It also parked a lot of coins with a
                                    handful of custodians, which is a real centralization trade-off.
                                </p>
                            </div>
                            <div>
                                <h3 className={cardTitle}>Payments layer</h3>
                                <p className={cardBody}>
                                    The Lightning Network moves payments off-chain between pre-funded channels and settles the
                                    net result on-chain, which makes small payments fast and cheap. It works. It also adds
                                    routing, liquidity, and always-online complexity that is still being smoothed out.
                                </p>
                            </div>
                            <div>
                                <h3 className={cardTitle}>Protocol development</h3>
                                <p className={cardBody}>
                                    Bitcoin changes slowly on purpose. SegWit (2017) and Taproot (2021) each shipped after years
                                    of review and opt-in activation. For money, conservatism is a feature. Anyone promising fast,
                                    dramatic protocol changes is describing a different project.
                                </p>
                            </div>
                            <div>
                                <h3 className={cardTitle}>Sovereign and corporate holdings</h3>
                                <p className={cardBody}>
                                    Public companies hold bitcoin on their balance sheets, and several governments hold it too —
                                    some deliberately, some from seizures. National-level experiments with legal tender status have
                                    been mixed and politically fragile. Treat any single country&apos;s policy as reversible.
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
                                today, and that subsidy halves toward zero. Eventually transaction fees alone have to fund security.
                                Whether fee revenue gets large and stable enough is unknown. It is decades away, and nobody serious
                                hand-waves it.
                            </p>
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
                                treatment, banking access, and custody regulation change quickly and vary by country. Of everything
                                on this list, this is the one most likely to touch an ordinary holder.
                            </p>
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>Self-custody mistakes</h3>
                            <p className={cardBody}>
                                Statistically, the biggest threat to your bitcoin is you. Lost seed phrases, phishing, bad backups,
                                and exchange failures have destroyed far more coins than any protocol flaw ever has. Our{' '}
                                <Link href="/self-custody" className="text-amber-600 dark:text-amber-400 hover:underline">self-custody guide</Link>{' '}
                                exists because this is where people get hurt.
                            </p>
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>Quantum computing</h3>
                            <p className={cardBody}>
                                A sufficiently powerful quantum computer could derive private keys from exposed public keys, putting
                                some coins at risk, particularly old ones whose public keys are already visible on-chain. No such
                                machine exists today, and defenses can ship as a protocol upgrade. The migration itself would be a
                                large coordination problem.
                            </p>
                        </div>
                        <div className={cardClass}>
                            <h3 className={cardTitle}>Concentration</h3>
                            <p className={cardBody}>
                                Mining pools, exchanges, and ETF custodians each concentrate influence in ways the design tried to
                                avoid. None of it breaks the rules a node enforces. Still, a system whose stated virtue is
                                decentralization deserves ongoing scrutiny about how decentralized it remains.
                            </p>
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
                        <details key={item.q} className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 transition-shadow hover:shadow-sm">
                            <summary className="flex items-center justify-between cursor-pointer p-4 list-none [&::-webkit-details-marker]:hidden">
                                <h3 className="font-semibold text-sm sm:text-base text-slate-800 dark:text-slate-200 pr-4">{item.q}</h3>
                                <svg className="w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 group-open:rotate-180 shrink-0" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                            </summary>
                            <div className="px-4 pb-4 -mt-1">
                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.a}</p>
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
                        Nothing here is advice. The practical consensus among long-term holders is boring, and worth stating
                        plainly:
                    </p>
                    <ul className="space-y-2 ml-1">
                        <li className="flex items-start gap-2">
                            <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span><strong className="text-slate-800 dark:text-slate-200">Size it so a 70% drawdown wouldn&apos;t change your life.</strong> That has happened repeatedly and will likely happen again.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span><strong className="text-slate-800 dark:text-slate-200">Buy on a schedule rather than on conviction.</strong> That&apos;s what this site&apos;s <Link href="/" className="text-amber-600 dark:text-amber-400 hover:underline">calculator</Link> models, so you can check how any schedule would have performed.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span><strong className="text-slate-800 dark:text-slate-200">Mind the fees.</strong> A 1.5% fee on every purchase compounds into real money over the years, and the calculator shows the difference between exchanges.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                            <span><strong className="text-slate-800 dark:text-slate-200">Learn custody before you need it.</strong> Start with <Link href="/self-custody" className="text-amber-600 dark:text-amber-400 hover:underline">self-custody basics</Link>. Exchanges have failed before and will again.</span>
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
                    Test any dollar-cost-averaging schedule against real historical prices, with the drawdowns, the fees, and
                    how often comparable strategies ended in profit.
                </p>
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                >
                    Open the Calculator
                    <ArrowRight className="w-4 h-4" />
                </Link>
                <p className="mt-4 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    Curious how we compute all of it?{' '}
                    <Link href="/methodology" className="text-amber-600 dark:text-amber-400 hover:underline">Read the methodology</Link>.
                </p>
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
