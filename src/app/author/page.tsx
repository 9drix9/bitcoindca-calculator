import type { Metadata } from 'next';
import Link from 'next/link';
import {
    User,
    Wrench,
    PenLine,
    Bug,
    Coins,
    ShieldQuestion,
    ArrowRight,
    AlertTriangle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';

const BASE_URL = 'https://btcdollarcostaverage.com';
const X_URL = 'https://x.com/9drix9';
const REPO_URL = 'https://github.com/9drix9/bitcoindca-calculator';
const ISSUES_URL = `${REPO_URL}/issues`;

export const metadata: Metadata = {
    // Root layout appends "| Bitcoin DCA Calculator" — do not repeat it here.
    title: 'Ricky Thach — Who Builds and Maintains This Site',
    description:
        'Ricky Thach builds and maintains the Bitcoin DCA Calculator. What he works on, what the tool does and does not claim, how it is funded, and the corrections policy for fixing errors.',
    keywords: [
        'ricky thach',
        '9drix9',
        'bitcoin dca calculator author',
        'who made bitcoin dca calculator',
        'bitcoin dca calculator editorial policy',
    ],
    alternates: {
        canonical: '/author',
    },
    openGraph: {
        title: 'Ricky Thach — Who Builds and Maintains This Site',
        description:
            'The person behind the Bitcoin DCA Calculator: what he works on, how the site is funded, and how errors get reported and fixed.',
        url: '/author',
        type: 'profile',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Ricky Thach — Who Builds and Maintains This Site',
        description:
            'The person behind the Bitcoin DCA Calculator: what he works on, how the site is funded, and how errors get reported and fixed.',
        creator: '@9drix9',
    },
};

const PERSON_ID = `${BASE_URL}/author#person`;
const ORG_ID = `${BASE_URL}#organization`;

const personJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': PERSON_ID,
    name: 'Ricky Thach',
    alternateName: '9drix9',
    url: `${BASE_URL}/author`,
    description:
        'Independent software developer who built and maintains the Bitcoin DCA Calculator, an open-source tool that backtests dollar-cost-averaging schedules against real historical Bitcoin prices.',
    jobTitle: 'Builder and maintainer, Bitcoin DCA Calculator',
    knowsAbout: [
        'Bitcoin',
        'Dollar-cost averaging',
        'Backtesting investment strategies',
        'Money-weighted return (XIRR)',
        'Maximum drawdown',
        'Bitcoin self-custody',
        'Bitcoin mining and network data',
        'Web development',
    ],
    sameAs: [X_URL, REPO_URL],
    worksFor: {
        '@type': 'Organization',
        '@id': ORG_ID,
        name: 'Bitcoin DCA Calculator',
        url: BASE_URL,
        sameAs: [X_URL, REPO_URL],
    },
};

const profilePageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': `${BASE_URL}/author`,
    url: `${BASE_URL}/author`,
    name: 'Ricky Thach — Who Builds and Maintains This Site',
    description:
        'Author and editorial policy page for the Bitcoin DCA Calculator, maintained by Ricky Thach.',
    mainEntity: { '@id': PERSON_ID },
    isPartOf: {
        '@type': 'WebSite',
        name: 'Bitcoin DCA Calculator',
        url: BASE_URL,
    },
    // Static dates: the page is updated when its content changes, not on every build.
    dateCreated: '2026-08-08',
    dateModified: '2026-08-08',
};

const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
        { '@type': 'ListItem', position: 2, name: 'Author', item: `${BASE_URL}/author` },
    ],
};

function SectionHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-amber-500 shrink-0" aria-hidden="true">{icon}</span>
            <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">{children}</h2>
        </div>
    );
}

function Bullet({ children }: { children: React.ReactNode }) {
    return (
        <li className="flex items-start gap-2">
            <span className="text-amber-500 font-bold mt-0.5 shrink-0" aria-hidden="true">&bull;</span>
            <span>{children}</span>
        </li>
    );
}

const GithubMark = () => (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
);

export default function AuthorPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(profilePageJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />

            <div className="measure max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10 sm:space-y-16">

                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li>
                            <Link href="/" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                Home
                            </Link>
                        </li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Author</li>
                    </ol>
                </nav>

                {/* Hero */}
                <header className="text-center max-w-3xl mx-auto space-y-3 sm:space-y-4">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white text-balance">
                        Ricky <span className="text-amber-700 dark:text-amber-400">Thach</span>
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
                        I built the Bitcoin DCA Calculator and I maintain it. One person, no company,
                        no team. Everything on this page is something you can verify from the source
                        code or from the site itself.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 pt-1">
                        <a
                            href={X_URL}
                            target="_blank"
                            rel="noopener noreferrer me"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white transition-colors"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                            </svg>
                            @9drix9 on X
                        </a>
                        <a
                            href={REPO_URL}
                            target="_blank"
                            rel="noopener noreferrer me"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white transition-colors"
                        >
                            <GithubMark />
                            Source on GitHub
                        </a>
                    </div>
                </header>

                {/* Bio */}
                <section className="space-y-4">
                    <SectionHeading icon={<User className="w-6 h-6 sm:w-8 sm:h-8" />}>
                        Who I Am
                    </SectionHeading>
                    <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            I&apos;m Ricky Thach, an independent developer. I write the code, the copy, and the
                            methodology on this site. There is no editorial team behind me and no company
                            paying for the output, so when something here is wrong, it&apos;s mine to fix.
                        </p>
                        <p>
                            I started this because the honest answer to &quot;what would consistent Bitcoin buying
                            have done for me?&quot; was buried under sites that wanted an email address first,
                            invented their own price history, or quietly showed a number that flattered the
                            strategy. I wanted a calculator where every input, every formula, and every data
                            source was visible, and where the uncomfortable numbers &mdash; maximum drawdown,
                            the worst buy, the fee drag &mdash; were shown next to the flattering ones.
                        </p>
                        <p>
                            The project is MIT licensed and the repository is public. If you want to check my
                            work rather than trust it, that is the intended way to use this site.
                        </p>
                    </div>
                </section>

                {/* What I work on */}
                <section className="space-y-4">
                    <SectionHeading icon={<Wrench className="w-6 h-6 sm:w-8 sm:h-8" />}>
                        What I Work On
                    </SectionHeading>
                    <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <ul className="space-y-2 ml-1">
                            <Bullet>
                                <strong className="text-slate-800 dark:text-slate-200">The DCA engine.</strong>{' '}
                                Purchase scheduling on UTC calendar days, average cost, ROI, money-weighted
                                annualized return (XIRR, solved numerically), maximum drawdown, best and worst
                                buy, and fee drag. The formulas are written out on the{' '}
                                <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                    methodology page
                                </Link>.
                            </Bullet>
                            <Bullet>
                                <strong className="text-slate-800 dark:text-slate-200">Price and market data plumbing.</strong>{' '}
                                Server-side fetching and caching from Kraken, Coinbase, mempool.space, CoinGecko,
                                FRED, Yahoo Finance, blockchain.info and others, with provider fallback so one
                                outage doesn&apos;t take a page down.
                            </Bullet>
                            <Bullet>
                                <strong className="text-slate-800 dark:text-slate-200">The education pages.</strong>{' '}
                                Self-custody, mining, and &quot;why Bitcoin&quot; &mdash; including an evidence
                                scorecard that grades common Bitcoin claims, some of which this project itself
                                used to repeat uncritically.
                            </Bullet>
                            <Bullet>
                                <strong className="text-slate-800 dark:text-slate-200">Everything else.</strong>{' '}
                                Design, accessibility, performance, the live network widgets, and the writing.
                                It&apos;s one person, which is the honest explanation for both the site&apos;s
                                consistency and its blind spots.
                            </Bullet>
                        </ul>
                    </div>
                </section>

                {/* What I don't claim */}
                <section className="space-y-4">
                    <SectionHeading icon={<ShieldQuestion className="w-6 h-6 sm:w-8 sm:h-8" />}>
                        What I Don&apos;t Claim
                    </SectionHeading>
                    <Card className="p-5 sm:p-6">
                        <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                            <p>
                                This matters more than a résumé would, so it goes near the top rather than in
                                the footnotes:
                            </p>
                            <ul className="space-y-2 ml-1">
                                <Bullet>
                                    I am <strong className="text-slate-800 dark:text-slate-200">not a financial adviser</strong>,
                                    broker, accountant, or tax professional, and I hold no licence or certification
                                    in any of those fields. Nothing on this site is personalised advice.
                                </Bullet>
                                <Bullet>
                                    I have <strong className="text-slate-800 dark:text-slate-200">no way of knowing your situation</strong>{' '}
                                    &mdash; your income, debts, tax residency, or risk tolerance &mdash; and the
                                    calculator doesn&apos;t ask. It backtests a schedule; it does not evaluate whether
                                    that schedule is sensible for you.
                                </Bullet>
                                <Bullet>
                                    I <strong className="text-slate-800 dark:text-slate-200">don&apos;t predict prices</strong>.
                                    Where the site projects forward, it does so from explicit assumptions you choose,
                                    labelled as scenarios, not forecasts.
                                </Bullet>
                                <Bullet>
                                    I hold Bitcoin. That&apos;s a real bias, and you should read everything here with
                                    it in mind. It&apos;s also why the{' '}
                                    <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                        limitations section
                                    </Link>{' '}
                                    exists and is kept blunt.
                                </Bullet>
                            </ul>
                        </div>
                    </Card>
                </section>

                {/* Editorial and corrections policy */}
                <section id="corrections-policy" className="space-y-4 scroll-mt-20">
                    <SectionHeading icon={<PenLine className="w-6 h-6 sm:w-8 sm:h-8" />}>
                        Editorial &amp; Corrections Policy
                    </SectionHeading>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            A financial calculator is only worth as much as its willingness to be wrong in public.
                            These are the rules I hold this site to.
                        </p>

                        <Card className="p-5 sm:p-6 space-y-4">
                            <div className="space-y-1.5">
                                <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white">
                                    1. Every number traces back to a source
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                    Figures on this site are computed from live or historical market data, never
                                    typed in by hand to make a point. Each source is listed on the{' '}
                                    <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                        methodology page
                                    </Link>{' '}
                                    with what it provides and how long it is cached. Where a series is interpolated
                                    rather than measured, the page says so.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white">
                                    2. Missing data is shown as missing
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                    When a provider is down, widgets and pages render an explicit
                                    &quot;unavailable&quot; state. They do not fall back to a zero, a placeholder,
                                    or a stale number presented as current.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white">
                                    3. Corrections are made openly, not quietly
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                    When a calculation error is found, the fix goes into the public commit history
                                    and, if it changed any displayed result, into the{' '}
                                    <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                        methodology changelog
                                    </Link>{' '}
                                    describing what was wrong and what changed. Past entries include double-counted
                                    future contributions, currency conversion inconsistencies, and timezone-dependent
                                    purchase schedules. I&apos;d rather list those than pretend they never happened.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white">
                                    4. Methodology changes are documented
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                    If the way a number is calculated changes &mdash; a different data source, a
                                    different formula, a different default &mdash; that change is written into the
                                    changelog rather than silently shipped. Results that move should be explainable.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white">
                                    5. Claims get downgraded when the evidence doesn&apos;t hold
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                    The{' '}
                                    <Link href="/why-bitcoin" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                        Why Bitcoin
                                    </Link>{' '}
                                    page grades common claims by how well they survive scrutiny, including ones this
                                    project previously stated too confidently, and it names open risks such as the
                                    long-run mining security budget. Nothing on this site promises a return.
                                </p>
                            </div>
                        </Card>

                        <div className="space-y-3">
                            <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Bug className="w-5 h-5 text-amber-500 shrink-0" aria-hidden="true" />
                                How to report an error
                            </h3>
                            <p>
                                If a number looks wrong, please tell me. A screenshot plus the exact inputs
                                (amount, frequency, start date, end date, fee, price source) is usually enough
                                for me to reproduce it.
                            </p>
                            <ul className="space-y-2 ml-1">
                                <Bullet>
                                    <strong className="text-slate-800 dark:text-slate-200">Public and tracked:</strong>{' '}
                                    <a
                                        href={ISSUES_URL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-amber-700 dark:text-amber-400 hover:underline font-medium"
                                    >
                                        open a GitHub issue
                                    </a>. Best for anything reproducible, since the discussion and the fix stay
                                    linked together.
                                </Bullet>
                                <Bullet>
                                    <strong className="text-slate-800 dark:text-slate-200">Direct:</strong>{' '}
                                    <a
                                        href={X_URL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-amber-700 dark:text-amber-400 hover:underline font-medium"
                                    >
                                        message @9drix9 on X
                                    </a>. Best if you&apos;d rather not post publicly.
                                </Bullet>
                                <Bullet>
                                    <strong className="text-slate-800 dark:text-slate-200">Fix it yourself:</strong>{' '}
                                    the code is MIT licensed. Pull requests are welcome, particularly ones that come
                                    with a case the old code got wrong.
                                </Bullet>
                            </ul>
                            <p>
                                Full details, including response expectations and privacy requests, are on the{' '}
                                <Link href="/contact" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                    contact page
                                </Link>.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Funding */}
                <section className="space-y-4">
                    <SectionHeading icon={<Coins className="w-6 h-6 sm:w-8 sm:h-8" />}>
                        How This Is Funded
                    </SectionHeading>
                    <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            Knowing who pays for a financial tool tells you a lot about whose interests it serves.
                            Here it is in full:
                        </p>
                        <ul className="space-y-2 ml-1">
                            <Bullet>
                                <strong className="text-slate-800 dark:text-slate-200">Bitcoin donations.</strong>{' '}
                                On-chain and Lightning addresses are in the site footer. Voluntary, and nothing on
                                the site is gated behind them.
                            </Bullet>
                            <Bullet>
                                <strong className="text-slate-800 dark:text-slate-200">Cookieless ads.</strong>{' '}
                                Two small A-ADS slots. Google AdSense was deliberately removed in July 2026 because
                                surveillance advertising contradicts what this site says about privacy, and I
                                accepted the lower revenue for it.
                            </Bullet>
                            <Bullet>
                                <strong className="text-slate-800 dark:text-slate-200">Affiliate links,</strong>{' '}
                                labelled &quot;(affiliate)&quot; wherever they appear. Clicking one is optional and
                                changes nothing about how the site behaves.
                            </Bullet>
                            <Bullet>
                                <strong className="text-slate-800 dark:text-slate-200">No accounts, no email list, no paid tier,</strong>{' '}
                                no sponsored calculator results, and no exchange paying for placement in the fee
                                comparison. The{' '}
                                <Link href="/about" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                    about page
                                </Link>{' '}
                                covers the disclosure in more depth.
                            </Bullet>
                        </ul>
                    </div>
                </section>

                {/* Where to go next */}
                <section className="space-y-4">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                        Related pages
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                        {[
                            { href: '/methodology', label: 'Methodology & data sources', sub: 'Every source, formula, and limitation' },
                            { href: '/about', label: 'About this project', sub: 'Why it exists and what it will never do' },
                            { href: '/contact', label: 'Contact', sub: 'Report an error or a privacy request' },
                        ].map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 hover:border-amber-500/50 transition-colors group"
                            >
                                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
                                    {item.label}
                                </span>
                                <span className="block mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.sub}</span>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* CTA */}
                <Card celebrated className="p-6 sm:p-10 text-center">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
                        Run your own numbers
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-5 max-w-xl mx-auto">
                        Don&apos;t take my word for any of it. Put in your own amount, cadence, and dates,
                        then check the maths against the methodology page.
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                    >
                        Open the calculator
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </Link>
                </Card>

                {/* Disclaimer */}
                <section className="border-t border-slate-200 dark:border-slate-800 pt-6 sm:pt-8">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                        <p className="text-[11px] sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                            <strong>Not financial advice.</strong> This site is educational. Its author is not a
                            licensed financial professional and nothing here is a recommendation to buy or sell
                            anything. Historical and simulated performance does not guarantee future results.
                            Bitcoin is volatile and you can lose money. Do your own research.
                        </p>
                    </div>
                </section>

            </div>
        </>
    );
}
