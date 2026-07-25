import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Privacy Policy',
    description: 'Privacy policy for Bitcoin DCA Calculator. Learn how we handle your data, cookies, third-party advertising, and analytics. No personal financial data is collected or stored.',
    alternates: {
        canonical: '/privacy',
    },
    openGraph: {
        title: 'Privacy Policy',
        description: 'Learn how Bitcoin DCA Calculator handles your data. No personal financial data is collected or stored.',
        url: '/privacy',
        type: 'website',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Privacy Policy',
        description: 'Learn how Bitcoin DCA Calculator handles your data. No personal financial data is collected or stored.',
        creator: '@9drix9',
    },
};

export default function PrivacyPage() {
    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
            <article className="prose dark:prose-invert prose-sm sm:prose-base max-w-none prose-headings:scroll-mt-20">
                <h1>Privacy Policy</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Last updated: July 24, 2026</p>

                <h2>Data Collection</h2>
                <p>
                    Bitcoin DCA Calculator is a client-side tool. Your calculator inputs (investment amount, frequency, dates) are
                    processed entirely in your browser. We do not collect, store, or transmit your personal financial data to any server.
                </p>
                <p>
                    When you use the &quot;Live API&quot; price mode, your browser makes requests to public cryptocurrency exchange APIs
                    (Kraken, Coinbase) to fetch historical price data. These requests are proxied through our server to enable caching,
                    but no personally identifiable information is included in these requests. The same applies to the other public data
                    APIs the site uses (mempool.space, CoinGecko, FRED, Yahoo Finance, alternative.me, blockchain.info, and
                    frankfurter.app for exchange rates) — all requests are server-proxied and contain no personal data.
                </p>

                <h2>Analytics</h2>
                <p>
                    We use <strong>Vercel Web Analytics</strong> and <strong>Vercel Speed Insights</strong> to understand aggregate site
                    usage and performance. These tools are privacy-friendly: they are cookieless, do not track you across other
                    websites, and do not build individual profiles. They collect aggregated, anonymized data such as page views,
                    referrers, device type, and coarse geography. See{' '}
                    <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Vercel&apos;s privacy policy</a>{' '}
                    for details.
                </p>

                <h2>Cookies &amp; Tracking</h2>
                <p>
                    We use cookies and similar technologies for the following purposes:
                </p>
                <ul>
                    <li><strong>Essential cookies:</strong> Theme preference and cookie consent status are stored in your browser&apos;s localStorage. These are necessary for the site to function properly.</li>
                    <li><strong>Marketing measurement:</strong> If you consent to analytics, Google Ads conversion tracking loads so we can measure whether our own advertising reaches people. It is not loaded at all unless you accept.</li>
                </ul>

                <h2>Third-Party Advertising</h2>
                <p>
                    We deliberately do not run Google AdSense or any other surveillance-based ad network. Display advertising on this
                    site is served by <a href="https://a-ads.com" target="_blank" rel="noopener noreferrer">A-ADS</a>, a Bitcoin-native
                    ad network that does not require cookies, does not build a profile of you, and does not track you across other
                    websites. Ads are chosen by the page they appear on, not by your browsing history.
                </p>
                <p>
                    We think running behavioural ad networks on a site about financial self-sovereignty would be a contradiction, so
                    we removed AdSense in July 2026 and accepted the lower revenue.
                </p>

                <h2>Opt-Out</h2>
                <p>
                    You can manage your cookie preferences at any time using the cookie consent banner at the bottom of the page.
                    Declining analytics prevents any Google script from loading. You may also:
                </p>
                <ul>
                    <li>Opt out of personalized ads at <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">Google Ads Settings</a></li>
                    <li>Configure your browser to block third-party cookies</li>
                </ul>

                <h2>Data Retention</h2>
                <p>
                    All user preferences (theme, cookie consent, calculator settings via URL parameters) are stored exclusively in
                    your browser&apos;s localStorage or URL. We do not maintain any server-side database of user data. Clearing your
                    browser&apos;s local storage will remove all stored preferences.
                </p>

                <h2>Children&apos;s Privacy</h2>
                <p>
                    This website is not directed at children under 13 years of age. We do not knowingly collect personal information
                    from children. If you are a parent or guardian and believe your child has provided us with personal information,
                    please contact us so we can take appropriate action.
                </p>

                <h2>Changes to This Policy</h2>
                <p>
                    We may update this privacy policy from time to time. Changes will be posted on this page with an updated
                    &quot;Last updated&quot; date. Your continued use of the site after changes constitutes acceptance of the updated policy.
                </p>

                <h2>Contact</h2>
                <p>
                    If you have questions about this privacy policy, you can reach us on X (Twitter) at{' '}
                    <a href="https://x.com/9drix9" target="_blank" rel="noopener noreferrer">@9drix9</a>.
                </p>
            </article>
        </div>
    );
}
