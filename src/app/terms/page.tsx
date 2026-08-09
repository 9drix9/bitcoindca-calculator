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

export default function TermsPage() {
    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
            <article className="prose dark:prose-invert prose-sm sm:prose-base max-w-none prose-headings:scroll-mt-20">
                <h1>Terms of Service</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Last updated: July 24, 2026</p>

                <h2>Acceptance of Terms</h2>
                <p>
                    Using Bitcoin DCA Calculator (&quot;btcdollarcostaverage.com&quot;) means you agree to these
                    Terms of Service. If you do not agree to them, please do not use this website.
                </p>

                <h2>Not Financial Advice</h2>
                <p>
                    <strong>This tool is for informational and educational purposes only.</strong> Nothing on this
                    website is financial advice, investment advice, trading advice, or any other kind of professional
                    advice. The results are hypothetical projections built from historical data. Do not rely on them
                    to make investment decisions.
                </p>
                <p>
                    Cryptocurrency investments are volatile and carry significant risk. Consult a qualified financial
                    advisor before you make any investment decision. Past performance is not indicative of future results.
                </p>

                <h2>Accuracy Disclaimer</h2>
                <p>
                    We do our best to show accurate historical prices, sourced from reputable exchange APIs
                    (Kraken, Coinbase). Even so, we make no warranties or representations about the accuracy,
                    completeness, or reliability of any data on this site. Price data may contain gaps,
                    interpolations, or inaccuracies.
                </p>
                <p>
                    The calculator uses simplified models. They may not account for every real-world factor:
                    slippage, price differences between exchanges, network fees, tax implications, or the other
                    costs of buying Bitcoin for real.
                </p>

                <h2>Intellectual Property</h2>
                <p>
                    The source code of Bitcoin DCA Calculator is released under the{' '}
                    <a href="https://github.com/9drix9/bitcoindca-calculator/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT License</a>.
                    You may use, copy, modify, and redistribute the code on those terms, including commercially.
                    The license text governs, not this page.
                </p>
                <p>
                    Written content and the site&apos;s branding are not covered by that license. They remain the
                    property of their creators. You are welcome to quote or cite the site&apos;s published figures
                    with attribution and a link.
                </p>

                <h2>Third-Party Services</h2>
                <p>
                    This website relies on third-party services, including:
                </p>
                <ul>
                    <li><strong>Kraken &amp; Coinbase APIs:</strong> For historical and real-time Bitcoin price data</li>
                    <li><strong>mempool.space:</strong> For block height, network fees, hash rate, and Lightning Network data</li>
                    <li><strong>CoinGecko:</strong> For market capitalization and Bitcoin dominance data</li>
                    <li><strong>FRED API:</strong> For inflation (CPI) and money supply (M2) data</li>
                    <li><strong>Yahoo Finance API:</strong> For S&amp;P 500 and Gold comparison data</li>
                    <li><strong>alternative.me:</strong> For the Fear &amp; Greed Index</li>
                    <li><strong>blockchain.info:</strong> For circulating supply data</li>
                    <li><strong>frankfurter.app:</strong> For ECB foreign exchange rates (currency conversion)</li>
                    <li><strong>A-ADS:</strong> For serving advertisements (Bitcoin-native, cookieless)</li>
                </ul>
                <p>
                    We are not responsible for the availability, accuracy, or practices of these third-party services.
                    Each service is governed by its own terms and privacy policies.
                </p>

                <h2>Limitation of Liability</h2>
                <p>
                    To the maximum extent permitted by law, Bitcoin DCA Calculator and its creators shall not be
                    liable for any damages arising from this website. That covers damages from using it and from
                    being unable to use it, whether direct, indirect, incidental, special, consequential, or
                    punitive. It includes, but is not limited to:
                </p>
                <ul>
                    <li>Financial losses resulting from investment decisions influenced by this calculator</li>
                    <li>Inaccuracies in price data or calculations</li>
                    <li>Service interruptions or data unavailability</li>
                    <li>Any errors or omissions in the content</li>
                </ul>

                <h2>Changes to Terms</h2>
                <p>
                    We reserve the right to modify these terms at any time. Changes will be posted on this page with an
                    updated date. If you keep using the site after a change, you accept the modified terms.
                </p>

                <h2>Contact</h2>
                <p>
                    If you have questions about these terms, see the{' '}
                    <Link href="/contact">contact page</Link>, or reach us on X (Twitter) at{' '}
                    <a href="https://x.com/9drix9" target="_blank" rel="noopener noreferrer">@9drix9</a>.
                </p>
            </article>
        </div>
    );
}
