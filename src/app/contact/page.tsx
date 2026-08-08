import type { Metadata } from 'next';
import Link from 'next/link';
import {
    MessageCircle,
    Bug,
    Clock,
    Lock,
    ShieldCheck,
    Ban,
    ArrowRight,
    AlertTriangle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';

const BASE_URL = 'https://btcdollarcostaverage.com';
const X_URL = 'https://x.com/9drix9';
const REPO_URL = 'https://github.com/9drix9/bitcoindca-calculator';
const ISSUES_URL = `${REPO_URL}/issues`;
const NEW_ISSUE_URL = `${REPO_URL}/issues/new`;

export const metadata: Metadata = {
    // Root layout appends "| Bitcoin DCA Calculator" — do not repeat it here.
    title: 'Contact',
    description:
        'How to reach the maintainer of the Bitcoin DCA Calculator: report a wrong number, open a GitHub issue, make a privacy or data request, or ask a question. Response expectations included.',
    keywords: [
        'bitcoin dca calculator contact',
        'report calculation error bitcoin dca',
        'bitcoin dca calculator support',
        'privacy request bitcoin dca calculator',
    ],
    alternates: {
        canonical: '/contact',
    },
    openGraph: {
        title: 'Contact',
        description:
            'Report a wrong number, open a GitHub issue, or make a privacy request. Maintained by one person — response expectations are stated plainly.',
        url: '/contact',
        type: 'website',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Contact the Bitcoin DCA Calculator',
        description:
            'Report a wrong number, open a GitHub issue, or make a privacy request. Response expectations stated plainly.',
        creator: '@9drix9',
    },
};

const contactPageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    '@id': `${BASE_URL}/contact`,
    url: `${BASE_URL}/contact`,
    name: 'Contact the Bitcoin DCA Calculator',
    description:
        'Contact channels for the Bitcoin DCA Calculator: reporting calculation errors, GitHub issues, privacy and data requests, and stated response expectations.',
    inLanguage: 'en',
    isPartOf: {
        '@type': 'WebSite',
        name: 'Bitcoin DCA Calculator',
        url: BASE_URL,
    },
    mainEntity: {
        '@type': 'Organization',
        '@id': `${BASE_URL}#organization`,
        name: 'Bitcoin DCA Calculator',
        url: BASE_URL,
        sameAs: [X_URL, REPO_URL],
        founder: {
            '@type': 'Person',
            '@id': `${BASE_URL}/author#person`,
            name: 'Ricky Thach',
            url: `${BASE_URL}/author`,
        },
        contactPoint: [
            {
                '@type': 'ContactPoint',
                contactType: 'customer support',
                url: X_URL,
                availableLanguage: ['English'],
                description:
                    'Direct message on X. Use this for private questions, privacy and data requests, and security disclosures.',
            },
            {
                '@type': 'ContactPoint',
                contactType: 'technical support',
                url: ISSUES_URL,
                availableLanguage: ['English'],
                description:
                    'Public GitHub issue tracker. Use this for calculation errors, bugs, and feature requests.',
            },
        ],
    },
    // Static dates: updated when the content changes, not on every build.
    dateModified: '2026-08-08',
};

const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
        { '@type': 'ListItem', position: 2, name: 'Contact', item: `${BASE_URL}/contact` },
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

const XMark = () => (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
);

const GithubMark = () => (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
);

export default function ContactPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(contactPageJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10 sm:space-y-16">

                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li>
                            <Link href="/" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                Home
                            </Link>
                        </li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Contact</li>
                    </ol>
                </nav>

                {/* Hero */}
                <header className="text-center max-w-3xl mx-auto space-y-3 sm:space-y-4">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight text-balance">
                        <span className="text-amber-700 dark:text-amber-400">Contact</span>
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
                        This site is built and maintained by one person,{' '}
                        <Link href="/author" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                            Ricky Thach
                        </Link>. There&apos;s no support desk and no ticket queue &mdash; just two channels
                        that reach me directly.
                    </p>
                </header>

                {/* Channels */}
                <section className="space-y-4">
                    <SectionHeading icon={<MessageCircle className="w-6 h-6 sm:w-8 sm:h-8" />}>
                        Two Ways to Reach Me
                    </SectionHeading>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <Card className="p-5 sm:p-6 flex flex-col gap-3">
                            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-white">
                                <span className="text-slate-800 dark:text-slate-100"><XMark /></span>
                                X (Twitter) &mdash; direct
                            </h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed grow">
                                Best for anything you&apos;d rather not post in public: privacy and data requests,
                                security disclosures, or a quick question. Mentions and direct messages both
                                reach me.
                            </p>
                            <a
                                href={X_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white transition-colors"
                            >
                                <XMark />
                                @9drix9
                            </a>
                        </Card>

                        <Card className="p-5 sm:p-6 flex flex-col gap-3">
                            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-white">
                                <span className="text-slate-800 dark:text-slate-100"><GithubMark /></span>
                                GitHub issues &mdash; public
                            </h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed grow">
                                Best for wrong numbers, bugs, and feature requests. Issues are public, which is
                                the point: the report, the discussion, and the eventual fix all stay linked
                                together where anyone can check them.
                            </p>
                            <a
                                href={NEW_ISSUE_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white transition-colors"
                            >
                                <GithubMark />
                                Open an issue
                            </a>
                        </Card>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        There is deliberately no contact form and no published email address. A form would mean
                        collecting and storing your details on a server, and this site doesn&apos;t run one for
                        user data &mdash; see the{' '}
                        <Link href="/privacy" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                            privacy policy
                        </Link>.
                    </p>
                </section>

                {/* Response expectation */}
                <section className="space-y-4">
                    <SectionHeading icon={<Clock className="w-6 h-6 sm:w-8 sm:h-8" />}>
                        What to Expect
                    </SectionHeading>
                    <Card className="p-5 sm:p-6">
                        <ul className="space-y-2 ml-1 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                            <Bullet>
                                <strong className="text-slate-800 dark:text-slate-200">Typical reply: within a few days.</strong>{' '}
                                This is a project maintained outside of a full-time job, so it is not instant and
                                there is no guaranteed response time.
                            </Bullet>
                            <Bullet>
                                <strong className="text-slate-800 dark:text-slate-200">If a week passes, ping again.</strong>{' '}
                                Messages do get missed. A follow-up is welcome, not annoying.
                            </Bullet>
                            <Bullet>
                                <strong className="text-slate-800 dark:text-slate-200">Confirmed calculation errors jump the queue.</strong>{' '}
                                A number that is wrong on a financial page gets fixed before anything cosmetic, and
                                the fix is recorded per the{' '}
                                <Link href="/author#corrections-policy" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                    corrections policy
                                </Link>.
                            </Bullet>
                            <Bullet>
                                <strong className="text-slate-800 dark:text-slate-200">Not everything gets built.</strong>{' '}
                                Feature requests are read and appreciated, but the honest answer is often
                                &quot;maybe, eventually&quot; &mdash; or you can send a pull request, since the
                                code is MIT licensed.
                            </Bullet>
                        </ul>
                    </Card>
                </section>

                {/* Reporting a wrong number */}
                <section className="space-y-4">
                    <SectionHeading icon={<Bug className="w-6 h-6 sm:w-8 sm:h-8" />}>
                        Reporting a Wrong Number
                    </SectionHeading>
                    <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            This is the most useful thing you can send me. To reproduce a result I need the exact
                            inputs, so please include:
                        </p>
                        <ul className="space-y-2 ml-1">
                            <Bullet>The page or tool (for example the main calculator, a <code className="text-xs sm:text-sm bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">/dca/</code> scenario page, or a specific widget).</Bullet>
                            <Bullet>Investment amount, frequency, start date, end date, and fee percentage.</Bullet>
                            <Bullet>The price source you had selected, and the display currency.</Bullet>
                            <Bullet>What the site showed, and what you expected instead &mdash; ideally with the source you checked against.</Bullet>
                            <Bullet>A screenshot, or the calculator URL, which encodes your settings in its query string.</Bullet>
                        </ul>
                        <p>
                            Before reporting, it&apos;s worth checking the{' '}
                            <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                methodology page
                            </Link>. Several common surprises are documented and intentional: the default Kraken
                            series is interpolated from weekly closes, purchases are bucketed on UTC calendar days,
                            non-USD currencies convert at today&apos;s rate rather than historical ones, and taxes
                            and spreads are not modelled at all.
                        </p>
                    </div>
                </section>

                {/* Privacy & data requests */}
                <section id="privacy-requests" className="space-y-4 scroll-mt-20">
                    <SectionHeading icon={<Lock className="w-6 h-6 sm:w-8 sm:h-8" />}>
                        Privacy &amp; Data Requests
                    </SectionHeading>
                    <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            If you want to ask what data this site holds about you, or ask for something to be
                            deleted, message{' '}
                            <a
                                href={X_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-amber-700 dark:text-amber-400 hover:underline font-medium"
                            >
                                @9drix9 on X
                            </a>. Use a direct message rather than a public GitHub issue so you aren&apos;t
                            publishing your own details.
                        </p>
                        <Card className="p-5 sm:p-6 space-y-3">
                            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white">
                                The likely answer, in advance
                            </h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                There are no user accounts, no email list, and no server-side database of user
                                data. Your calculator inputs are processed in your browser and encoded in the URL;
                                preferences such as theme, currency, and saved positions live in your
                                browser&apos;s localStorage. In practice that means there is usually nothing on my
                                side to export or erase, and you can remove everything yourself by clearing site
                                data for this domain in your browser settings.
                            </p>
                            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                Aggregate, cookieless analytics (Vercel Web Analytics and Speed Insights) do not
                                identify individuals or build profiles, so they can&apos;t be traced back to a
                                single visitor on request. The{' '}
                                <Link href="/privacy" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                    privacy policy
                                </Link>{' '}
                                spells all of this out. If you think something there is inaccurate, tell me and
                                I&apos;ll correct it.
                            </p>
                        </Card>
                        <div className="space-y-2">
                            <h3 className="text-base font-bold text-slate-800 dark:text-white">
                                Parents and guardians
                            </h3>
                            <p>
                                This site is not directed at children under 13 and does not knowingly collect
                                personal information from them. If you are a parent or guardian and believe your
                                child has provided personal information through this site, message{' '}
                                <a
                                    href={X_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-amber-700 dark:text-amber-400 hover:underline font-medium"
                                >
                                    @9drix9
                                </a>{' '}
                                and I will look into it and delete anything found.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Security */}
                <section className="space-y-4">
                    <SectionHeading icon={<ShieldCheck className="w-6 h-6 sm:w-8 sm:h-8" />}>
                        Security Disclosures
                    </SectionHeading>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        Found a vulnerability? Please send it privately by direct message on X first, rather than
                        opening a public issue, and give me a reasonable window to ship a fix. The site holds no
                        user accounts or funds, but I&apos;d still rather not have a live problem discussed in
                        public before it&apos;s patched. Credit in the{' '}
                        <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                            changelog
                        </Link>{' '}
                        if you want it.
                    </p>
                </section>

                {/* What I can't help with */}
                <section className="space-y-4">
                    <SectionHeading icon={<Ban className="w-6 h-6 sm:w-8 sm:h-8" />}>
                        What I Can&apos;t Help With
                    </SectionHeading>
                    <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>Saying this plainly saves us both time:</p>
                        <ul className="space-y-2 ml-1">
                            <Bullet>
                                <strong className="text-slate-800 dark:text-slate-200">Personal financial advice.</strong>{' '}
                                I can&apos;t tell you whether to buy Bitcoin, how much, or when. I&apos;m not a
                                licensed adviser and I don&apos;t know your circumstances.
                            </Bullet>
                            <Bullet>
                                <strong className="text-slate-800 dark:text-slate-200">Tax questions.</strong>{' '}
                                The calculator models no taxes at all, on purpose. Cost-basis rules differ by
                                country; ask an accountant in yours.
                            </Bullet>
                            <Bullet>
                                <strong className="text-slate-800 dark:text-slate-200">Exchange or wallet support.</strong>{' '}
                                This site is not an exchange, a broker, or a custodian. It never holds your keys
                                or your coins, so it cannot recover an account, reverse a transaction, or restore
                                a lost seed phrase.
                            </Bullet>
                            <Bullet>
                                <strong className="text-slate-800 dark:text-slate-200">Anyone claiming to be me offering recovery.</strong>{' '}
                                I will never message you first asking for a seed phrase, a private key, a payment,
                                or remote access to your device. Anyone doing that is a scammer, no matter whose
                                name or photo they use.
                            </Bullet>
                            <Bullet>
                                <strong className="text-slate-800 dark:text-slate-200">Paid placements.</strong>{' '}
                                Guest posts, sponsored links, and &quot;partnership&quot; pitches for altcoin or
                                custodial products are declined without reply.
                            </Bullet>
                        </ul>
                    </div>
                </section>

                {/* Related pages */}
                <section className="space-y-4">
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Related pages
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                        {[
                            { href: '/author', label: 'Author', sub: 'Who maintains this and how' },
                            { href: '/methodology', label: 'Methodology', sub: 'Sources, formulas, limits' },
                            { href: '/about', label: 'About', sub: 'Why the project exists' },
                            { href: '/privacy', label: 'Privacy policy', sub: 'What is and is not collected' },
                        ].map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 hover:border-amber-500/50 transition-colors group"
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
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-3">
                        Run your own numbers
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-5 max-w-xl mx-auto">
                        If you came here to check whether a result was right, the fastest path is to rerun it
                        yourself with the settings spelled out.
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
                            <strong>Not financial advice.</strong> Correspondence through the channels above is
                            informational and educational only, and does not create an advisory relationship of any
                            kind. Bitcoin is volatile and you can lose money. Do your own research.
                        </p>
                    </div>
                </section>

            </div>
        </>
    );
}
