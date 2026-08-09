import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Privacy Policy',
    description: 'How Bitcoin DCA Calculator handles your data: cookies, cookieless A-ADS advertising, and analytics. No personal financial data is collected or stored.',
    alternates: {
        canonical: '/privacy',
    },
    openGraph: {
        images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
        title: 'Privacy Policy',
        description: 'Learn how Bitcoin DCA Calculator handles your data. No personal financial data is collected or stored.',
        url: '/privacy',
        type: 'website',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        images: ['/opengraph-image'],
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
                    Bitcoin DCA Calculator runs in your browser. Your inputs (investment amount, frequency, dates) are processed
                    there and nowhere else. We do not collect, store, or transmit your personal financial data to any server.
                </p>
                <p>
                    In &quot;Live API&quot; price mode, the site fetches historical prices from public exchange APIs (Kraken and
                    Coinbase). Those calls are made by our server so the results can be cached. They carry nothing that identifies you.
                </p>
                <p>
                    The same goes for the other public data sources: mempool.space, CoinGecko, FRED, Yahoo Finance, alternative.me,
                    blockchain.info, and frankfurter.app for exchange rates. Every request is server-side and contains no personal data.
                </p>

                <h2>Analytics</h2>
                <p>
                    We use <strong>Vercel Web Analytics</strong> and <strong>Vercel Speed Insights</strong> to see how the site is
                    used and how fast it loads. Both are cookieless. They do not track you across other websites and do not build a
                    profile of you.
                </p>
                <p>
                    What they collect is aggregated and anonymized: page views, referrers, device type, and coarse geography. They set
                    no cookies and identify nobody, so they run for every visitor. See{' '}
                    <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Vercel&apos;s privacy policy</a>{' '}
                    for details.
                </p>

                <h2>Cookies &amp; Tracking</h2>
                <p>
                    The site stores very little, and only for two reasons:
                </p>
                <ul>
                    <li><strong>Essential:</strong> your theme preference and your cookie consent answer are kept in your browser&apos;s localStorage. They are needed for the site to work properly.</li>
                    <li><strong>Marketing measurement:</strong> if you consent to analytics, Google Ads conversion tracking loads so we can measure whether our own advertising reaches people. It is not loaded at all unless you accept.</li>
                </ul>

                <h2>Third-Party Advertising</h2>
                <p>
                    Display ads on this site are served by <a href="https://a-ads.com" target="_blank" rel="noopener noreferrer">A-ADS</a>,
                    a Bitcoin-native ad network. A-ADS does not need cookies, does not build a profile of you, and does not track you
                    across other websites. Ads are chosen by the page they appear on, not by your browsing history.
                </p>
                <p>
                    We deliberately do not run Google AdSense or any other surveillance-based ad network. On a site about financial
                    self-sovereignty that would be a contradiction. We removed AdSense in July 2026 and accepted the lower revenue.
                </p>

                <h2>Opt-Out</h2>
                <p>
                    The cookie banner appears until you answer it. Choose &quot;Essential Only&quot; and no Google tag ever loads. To
                    change your answer later, use the <strong>Cookie preferences</strong> link in the footer of any page. That
                    brings the banner back and withdraws your previous consent straight away. You can also:
                </p>
                <ul>
                    <li>Opt out of personalized ads at <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">Google Ads Settings</a></li>
                    <li>Configure your browser to block third-party cookies</li>
                </ul>

                <h2>Data Retention</h2>
                <p>
                    Your preferences live in your browser, not on our servers. Theme and cookie consent sit in localStorage, and
                    calculator settings travel in the URL. We do not maintain any server-side database of user data. Clearing your
                    browser&apos;s local storage removes every stored preference.
                </p>

                <h2>Children&apos;s Privacy</h2>
                <p>
                    This website is not directed at children under 13 years of age. We do not knowingly collect personal information
                    from children. If you are a parent or guardian and believe your child has given us personal information, please{' '}
                    <Link href="/contact">contact us</Link> so we can take appropriate action.
                </p>

                <h2>Changes to This Policy</h2>
                <p>
                    We may update this privacy policy from time to time. Changes are posted on this page with a new &quot;Last
                    updated&quot; date. Continuing to use the site after a change means you accept the updated policy.
                </p>

                <h2>Contact</h2>
                <p>
                    Questions about this policy? See the{' '}
                    <Link href="/contact">contact page</Link>, or reach us on X (Twitter) at{' '}
                    <a href="https://x.com/9drix9" target="_blank" rel="noopener noreferrer">@9drix9</a>.
                </p>
            </article>
        </div>
    );
}
