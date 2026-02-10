import type { Metadata } from 'next';
import Link from 'next/link';
import { Target, Eye, Link as LinkIcon, BarChart3, ShieldX, Code, User } from 'lucide-react';

export const metadata: Metadata = {
    title: 'About | Bitcoin DCA Calculator',
    description: 'Who built this Bitcoin DCA calculator, why it exists, and what it stands for. Free, open-source, Bitcoin-only education with full transparency on affiliate links and ads.',
    keywords: ['bitcoin dca calculator about', 'bitcoin education', 'open source bitcoin', 'bitcoin dca tool'],
    alternates: {
        canonical: '/about',
    },
    openGraph: {
        title: 'About This Project | Bitcoin DCA Calculator',
        description: 'A free, open-source Bitcoin DCA calculator. No accounts, no email capture, no shitcoins. Learn who built it and why.',
        type: 'article',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'About This Project | Bitcoin DCA Calculator',
        description: 'A free, open-source Bitcoin DCA calculator. No accounts, no email capture, no shitcoins.',
        creator: '@9drix9',
    },
};

const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://btcdollarcostaverage.com" },
        { "@type": "ListItem", "position": 2, "name": "About", "item": "https://btcdollarcostaverage.com/about" },
    ],
};

const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "About This Project",
    "description": "Who built this Bitcoin DCA calculator, why it exists, and what it stands for.",
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
        "@id": "https://btcdollarcostaverage.com/about"
    },
    "datePublished": "2025-01-01",
    "dateModified": new Date().toISOString().split('T')[0],
};

export default function AboutPage() {
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
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10 sm:space-y-16">

                {/* Hero */}
                <section className="text-center max-w-3xl mx-auto space-y-3 sm:space-y-4">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight text-balance">
                        About This <span className="text-amber-500">Project</span>
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
                        A free, open-source Bitcoin DCA calculator built for long-term thinkers.
                        No accounts, no email capture, no shitcoins.
                    </p>
                </section>

                {/* Why This Exists */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Target className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Why This Exists</h2>
                    </div>
                    <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            Most Bitcoin education online is either fragmented across dozens of sites, buried in ads,
                            or trying to sell you something. This tool was built to fix that.
                        </p>
                        <ul className="space-y-2 ml-1">
                            <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span><strong className="text-slate-800 dark:text-slate-200">Reduce fragmented education.</strong> One place for DCA simulation, self-custody guides, mining info, and real-time Bitcoin data.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span><strong className="text-slate-800 dark:text-slate-200">Make long-term thinking easier.</strong> Help beginners understand self-custody, dollar-cost averaging, and the halving cycle without jargon.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span><strong className="text-slate-800 dark:text-slate-200">Stay neutral and non-custodial.</strong> This site never holds your keys, never asks for personal info, and never pushes a specific exchange or product.</span>
                            </li>
                        </ul>
                    </div>
                </section>

                {/* Purpose & Transparency */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Eye className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Purpose &amp; Transparency</h2>
                    </div>
                    <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>This site exists to provide free, Bitcoin-only education. Here is exactly how it works:</p>
                        <ul className="space-y-2 ml-1">
                            <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>No user accounts. No email collection. No data harvesting.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>No paid products, no token, no newsletter upsell.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>Some links are affiliate links (clearly labeled). They help cover hosting and development so the education can stay free.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>The site also runs ads to support ongoing costs. We keep them minimal and avoid misleading or low-quality placements.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>If monetization ever changes, it will be optional, transparent, and aligned with Bitcoin values.</span>
                            </li>
                        </ul>
                    </div>
                </section>

                {/* Affiliate Disclosure */}
                <section id="affiliate-disclosure" className="space-y-4 scroll-mt-20">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <LinkIcon className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Affiliate Disclosure</h2>
                    </div>
                    <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <ul className="space-y-2 ml-1">
                            <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>Some outbound links on this site are affiliate links. They are labeled <strong className="text-slate-800 dark:text-slate-200">&quot;(affiliate)&quot;</strong> wherever they appear.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>Clicking is optional. The site works the same either way.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>No paywalls. No accounts. No email capture.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>We never recommend custodial or shitcoin products. Only Bitcoin-aligned tools and resources.</span>
                            </li>
                        </ul>
                    </div>
                </section>

                {/* Ads & Analytics */}
                <section id="ads-and-analytics" className="space-y-4 scroll-mt-20">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <BarChart3 className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Ads &amp; Analytics</h2>
                    </div>
                    <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <ul className="space-y-2 ml-1">
                            <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>The site displays ads to help cover hosting and development costs.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>Ads may set cookies or use standard ad measurement, depending on your browser settings.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>We do not sell personal data ourselves.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>You can use an ad blocker. The site still works.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>We keep ads minimal and avoid misleading or low-quality placements.</span>
                            </li>
                        </ul>
                    </div>
                </section>

                {/* What This Site Will Never Do */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <ShieldX className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">What This Site Will Never Do</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                        {[
                            'Require KYC or identity verification',
                            'Create user accounts or profiles',
                            'Collect email addresses',
                            'Promote altcoins or tokens',
                            'Gate features behind paywalls',
                            'Use hidden tracking or fingerprinting',
                            'Make misleading claims about future performance',
                        ].map((item) => (
                            <div key={item} className="flex items-start gap-2 text-sm sm:text-base text-slate-600 dark:text-slate-400">
                                <span className="text-red-400 dark:text-red-500 font-bold mt-0.5 shrink-0">&times;</span>
                                <span>{item}</span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Open Source */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Code className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Open Source</h2>
                    </div>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            This project is open source. Verify the code. Fork it if you want.
                        </p>
                        <a
                            href="https://github.com/9drix9/bitcoindca-calculator"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm sm:text-base font-semibold bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white transition-colors"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>
                            View on GitHub
                        </a>
                    </div>
                </section>

                {/* Who Built This */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <User className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                        <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Who Built This</h2>
                    </div>
                    <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        <p>
                            This site was built by an independent Bitcoiner. No company, no VC funding, no team of marketers.
                            Just someone who got tired of scattered, ad-ridden Bitcoin tools and decided to build something better.
                        </p>
                        <p>
                            The goal is simple: give people a clean, honest calculator that helps them understand
                            what consistent Bitcoin accumulation actually looks like over time.
                        </p>
                        <p>
                            You can find the builder on X (Twitter) at{' '}
                            <a
                                href="https://x.com/9drix9"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-amber-600 dark:text-amber-400 hover:underline font-medium"
                            >
                                @9drix9
                            </a>.
                        </p>
                    </div>
                </section>

                {/* CTA */}
                <section className="text-center space-y-4 pt-4">
                    <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-6 sm:p-10 text-white">
                        <h2 className="text-xl sm:text-2xl font-bold mb-2">Ready to run the numbers?</h2>
                        <p className="text-sm sm:text-base text-white/80 mb-4">
                            See what consistent Bitcoin accumulation would look like for you.
                        </p>
                        <Link
                            href="/"
                            className="inline-block px-6 py-3 bg-white text-amber-600 font-semibold rounded-xl text-sm sm:text-base hover:bg-amber-50 transition-colors"
                        >
                            Open the Calculator
                        </Link>
                    </div>
                </section>

                {/* Disclaimer */}
                <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 text-center leading-relaxed max-w-2xl mx-auto">
                    <strong>Disclaimer:</strong> This site is for educational purposes only and does not constitute financial advice.
                    Bitcoin is volatile and carries risk. Always do your own research before making any decisions.
                    Some links on this site are affiliate links. The site also displays ads. See the sections above for full details.
                </p>

            </div>
        </>
    );
}
