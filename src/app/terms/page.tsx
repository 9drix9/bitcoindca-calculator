import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Terms of Service | Bitcoin DCA Calculator',
    description: 'Terms of service for Bitcoin DCA Calculator — usage conditions, disclaimers, and liability limitations.',
};

export default function TermsPage() {
    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
            <article className="prose dark:prose-invert prose-sm sm:prose-base max-w-none prose-headings:scroll-mt-20">
                <h1>Terms of Service</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Last updated: February 1, 2026</p>

                <h2>Acceptance of Terms</h2>
                <p>
                    By accessing and using Bitcoin DCA Calculator (&quot;btcdollarcostaverage.com&quot;), you agree to be bound by these
                    Terms of Service. If you do not agree to these terms, please do not use this website.
                </p>

                <h2>Not Financial Advice</h2>
                <p>
                    <strong>This tool is for informational and educational purposes only.</strong> Nothing on this website constitutes
                    financial advice, investment advice, trading advice, or any other form of professional advice. The calculator
                    results are hypothetical projections based on historical data and should not be relied upon for making
                    investment decisions.
                </p>
                <p>
                    Cryptocurrency investments are volatile and carry significant risk. You should consult a qualified financial
                    advisor before making any investment decisions. Past performance is not indicative of future results.
                </p>

                <h2>Accuracy Disclaimer</h2>
                <p>
                    While we strive to provide accurate historical price data through reputable exchange APIs (Kraken, Coinbase),
                    we make no warranties or representations regarding the accuracy, completeness, or reliability of any data
                    displayed on this site. Price data may contain gaps, interpolations, or inaccuracies.
                </p>
                <p>
                    The calculator uses simplified models that may not account for all real-world factors such as slippage,
                    exchange-specific pricing differences, network fees, tax implications, or other costs associated with
                    actual Bitcoin purchases.
                </p>

                <h2>Intellectual Property</h2>
                <p>
                    The content, design, and code of Bitcoin DCA Calculator are the property of its creators. You may use
                    the calculator freely for personal, educational, or informational purposes. You may not reproduce, distribute,
                    or create derivative works from this site without permission.
                </p>

                <h2>Third-Party Services</h2>
                <p>
                    This website integrates with third-party services including:
                </p>
                <ul>
                    <li><strong>Kraken &amp; Coinbase APIs:</strong> For historical and real-time Bitcoin price data</li>
                    <li><strong>Yahoo Finance API:</strong> For S&amp;P 500 and Gold comparison data</li>
                    <li><strong>FRED API:</strong> For inflation (CPI) data</li>
                    <li><strong>Google AdSense:</strong> For serving advertisements</li>
                </ul>
                <p>
                    We are not responsible for the availability, accuracy, or practices of these third-party services.
                    Each service is governed by its own terms and privacy policies.
                </p>

                <h2>Limitation of Liability</h2>
                <p>
                    To the maximum extent permitted by law, Bitcoin DCA Calculator and its creators shall not be liable for any
                    direct, indirect, incidental, special, consequential, or punitive damages arising from your use of, or
                    inability to use, this website. This includes but is not limited to:
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
                    updated date. Your continued use of the site after changes constitutes acceptance of the modified terms.
                </p>

                <h2>Contact</h2>
                <p>
                    If you have questions about these terms, you can reach us on X (Twitter) at{' '}
                    <a href="https://x.com/9drix9" target="_blank" rel="noopener noreferrer">@9drix9</a>.
                </p>
            </article>
        </div>
    );
}
