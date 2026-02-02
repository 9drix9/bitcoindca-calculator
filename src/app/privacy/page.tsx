import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Privacy Policy | Bitcoin DCA Calculator',
    description: 'Privacy policy for Bitcoin DCA Calculator — how we handle your data, cookies, and advertising.',
};

export default function PrivacyPage() {
    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
            <article className="prose dark:prose-invert prose-sm sm:prose-base max-w-none prose-headings:scroll-mt-20">
                <h1>Privacy Policy</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Last updated: February 1, 2026</p>

                <h2>Data Collection</h2>
                <p>
                    Bitcoin DCA Calculator is a client-side tool. Your calculator inputs (investment amount, frequency, dates) are
                    processed entirely in your browser. We do not collect, store, or transmit your personal financial data to any server.
                </p>
                <p>
                    When you use the &quot;Live API&quot; price mode, your browser makes requests to public cryptocurrency exchange APIs
                    (Kraken, Coinbase) to fetch historical price data. These requests are proxied through our server to enable caching,
                    but no personally identifiable information is included in these requests.
                </p>

                <h2>Cookies &amp; Tracking</h2>
                <p>
                    We use cookies and similar technologies for the following purposes:
                </p>
                <ul>
                    <li><strong>Essential cookies:</strong> Theme preference and cookie consent status are stored in your browser&apos;s localStorage. These are necessary for the site to function properly.</li>
                    <li><strong>Advertising cookies:</strong> We use Google AdSense to display advertisements. Google may use cookies to serve ads based on your prior visits to this and other websites. Google&apos;s use of advertising cookies enables it and its partners to serve ads based on your browsing patterns.</li>
                </ul>

                <h2>Third-Party Advertising</h2>
                <p>
                    We use Google AdSense to serve advertisements on this site. Google AdSense uses cookies to serve ads based on
                    your visits to this site and other sites on the Internet. You may opt out of personalized advertising by visiting{' '}
                    <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">Google Ads Settings</a>.
                </p>
                <p>
                    Third-party vendors, including Google, use cookies to serve ads based on your prior visits. Google&apos;s use of the
                    DoubleClick cookie enables it and its partners to serve ads based on your browsing history. You can opt out of the
                    use of the DoubleClick cookie by visiting the{' '}
                    <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">Ad Settings page</a>.
                </p>

                <h2>Opt-Out</h2>
                <p>
                    You can manage your cookie preferences at any time using the cookie consent banner at the bottom of the page.
                    You may also:
                </p>
                <ul>
                    <li>Opt out of personalized ads at <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">Google Ads Settings</a></li>
                    <li>Use the <a href="https://optout.networkadvertising.org/" target="_blank" rel="noopener noreferrer">NAI opt-out tool</a> to opt out of interest-based advertising</li>
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
