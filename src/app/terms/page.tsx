import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Terms of Service',
    description: 'Terms of service for Bitcoin DCA Calculator. Usage conditions, disclaimers, liability limitations, and intellectual property notices. For educational purposes only.',
    alternates: {
        canonical: '/terms',
    },
    openGraph: {
        images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
        title: 'Terms of Service',
        description: 'Usage conditions, disclaimers, and liability limitations for Bitcoin DCA Calculator.',
        url: '/terms',
        type: 'website',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        images: ['/opengraph-image'],
        card: 'summary_large_image',
        title: 'Terms of Service',
        description: 'Usage conditions, disclaimers, and liability limitations for Bitcoin DCA Calculator.',
        creator: '@9drix9',
    },
};

/**
 * The date the text below last changed. The terms promise an updated date with
 * every change, so move it whenever a sentence here does, and move
 * PAGE_DATES.terms in sitemap.ts with it.
 */
const LAST_UPDATED = 'October 12, 2026';

// Typography is set by hand, as on the privacy page: Tailwind's `prose`
// classes need the typography plugin, which is not installed.
const h2 = 'pt-6 text-xl sm:text-2xl font-bold text-slate-900 dark:text-white scroll-mt-20';
const list = 'list-disc pl-5 space-y-2 marker:text-slate-400 dark:marker:text-slate-500';
// Underlined, not colour alone: these sit inside running text.
const linkClass = 'text-amber-700 dark:text-amber-400 underline underline-offset-2 hover:text-amber-800 dark:hover:text-amber-300';
const strong = 'font-semibold text-slate-800 dark:text-slate-200';

export default function TermsPage() {
    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
            <article className="measure space-y-4 text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-400 break-words">
                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">Terms of Service</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Last updated: {LAST_UPDATED}</p>

                <h2 className={h2}>Acceptance of Terms</h2>
                <p>
                    Using Bitcoin DCA Calculator (&quot;btcdollarcostaverage.com&quot;) means you agree to these
                    Terms of Service. If you do not agree to them, please do not use this website.
                </p>

                <h2 className={h2}>Not Financial Advice</h2>
                <p>
                    <strong className={strong}>This tool is for informational and educational purposes only.</strong> Nothing on this
                    website is financial advice, investment advice, trading advice, or any other kind of professional
                    advice. The results are hypothetical projections built from historical data. Do not rely on them
                    to make investment decisions.
                </p>
                <p>
                    Cryptocurrency investments are volatile and carry significant risk. Consult a qualified financial
                    advisor before you make any investment decision. Past performance is not indicative of future results.
                </p>

                <h2 className={h2}>Accuracy Disclaimer</h2>
                <p>
                    We do our best to show accurate historical prices, sourced from exchange APIs (Coinbase and
                    Kraken) and, before July 20, 2015, from blockchain.info. Even so, we make no warranties or
                    representations about the accuracy, completeness, or reliability of any data on this site.
                    Price data may contain gaps, estimates (a day with no reported price is filled in along a
                    straight line between the prices on either side), or inaccuracies.
                </p>
                <p>
                    The calculator uses simplified models. They may not account for every real-world factor:
                    slippage, price differences between exchanges, network fees, tax implications, or the other
                    costs of buying Bitcoin for real.
                </p>

                <h2 className={h2}>Intellectual Property</h2>
                <p>
                    The source code of Bitcoin DCA Calculator is released under the{' '}
                    <a href="https://github.com/9drix9/bitcoindca-calculator/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className={linkClass}>MIT License</a>.
                    You may use, copy, modify, and redistribute the code on those terms, including commercially.
                    The license text governs, not this page.
                </p>
                <p>
                    Written content and the site&apos;s branding are not covered by that license. They remain the
                    property of their creators. You are welcome to quote or cite the site&apos;s published figures
                    with attribution and a link.
                </p>

                <h2 className={h2}>Third-Party Services</h2>
                <p>
                    This website relies on third-party services, including:
                </p>
                <ul className={list}>
                    <li><strong className={strong}>Kraken &amp; Coinbase APIs:</strong> For historical and real-time Bitcoin price data</li>
                    <li><strong className={strong}>mempool.space:</strong> For block height, network fees, hash rate, and Lightning Network data</li>
                    <li><strong className={strong}>CoinGecko:</strong> For market capitalization and Bitcoin dominance data</li>
                    <li><strong className={strong}>FRED API:</strong> For inflation (CPI) data</li>
                    <li><strong className={strong}>Yahoo Finance API:</strong> For S&amp;P 500 and Gold comparison data</li>
                    <li><strong className={strong}>alternative.me:</strong> For the Fear &amp; Greed Index</li>
                    <li><strong className={strong}>blockchain.info:</strong> For circulating supply data, and for the daily price history before July 20, 2015</li>
                    <li><strong className={strong}>Frankfurter (frankfurter.dev):</strong> For ECB foreign exchange rates (currency conversion)</li>
                    <li><strong className={strong}>Vercel:</strong> For hosting, and for the cookieless Web Analytics and Speed Insights that run on every page except the embeddable widget</li>
                    <li><strong className={strong}>A-ADS:</strong> For serving advertisements, in frames loaded from its servers</li>
                    <li><strong className={strong}>Google:</strong> For the Google Ads tag, which loads only if you press Accept All in the cookie banner</li>
                </ul>
                <p>
                    The <Link href="/privacy" className={linkClass}>Privacy Policy</Link> sets out what each of these
                    receives about your visit.
                </p>
                <p>
                    We are not responsible for the availability, accuracy, or practices of these third-party services.
                    Each service is governed by its own terms and privacy policies.
                </p>

                <h2 className={h2}>Limitation of Liability</h2>
                <p>
                    To the maximum extent permitted by law, Bitcoin DCA Calculator and its creators shall not be
                    liable for any damages arising from this website. That covers damages from using it and from
                    being unable to use it, whether direct, indirect, incidental, special, consequential, or
                    punitive. It includes, but is not limited to:
                </p>
                <ul className={list}>
                    <li>Financial losses resulting from investment decisions influenced by this calculator</li>
                    <li>Inaccuracies in price data or calculations</li>
                    <li>Service interruptions or data unavailability</li>
                    <li>Any errors or omissions in the content</li>
                </ul>

                <h2 className={h2}>Changes to Terms</h2>
                <p>
                    We reserve the right to modify these terms at any time. Changes will be posted on this page with an
                    updated date. If you keep using the site after a change, you accept the modified terms.
                </p>

                <h2 className={h2}>Contact</h2>
                <p>
                    If you have questions about these terms, see the{' '}
                    <Link href="/contact" className={linkClass}>contact page</Link>, or reach us on X (Twitter) at{' '}
                    <a href="https://x.com/9drix9" target="_blank" rel="noopener noreferrer" className={linkClass}>@9drix9</a>.
                </p>
            </article>
        </div>
    );
}
