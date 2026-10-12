import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Privacy Policy',
    description: 'What Bitcoin DCA Calculator sends and to whom: settings kept in the page address, cookieless Vercel analytics, A-ADS ad frames, and a Google Ads tag only if you accept it.',
    alternates: {
        canonical: '/privacy',
    },
    openGraph: {
        images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
        title: 'Privacy Policy',
        description: 'What this site sends, who receives it, and what it keeps in your browser. No accounts, no email list, no database of visitors.',
        url: '/privacy',
        type: 'website',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        images: ['/opengraph-image'],
        card: 'summary_large_image',
        title: 'Privacy Policy',
        description: 'What this site sends, who receives it, and what it keeps in your browser. No accounts, no email list, no database of visitors.',
        creator: '@9drix9',
    },
};

/**
 * The date the text below last changed. The policy promises a new date with
 * every change, so move it whenever a sentence here does, and move
 * PAGE_DATES.privacy in sitemap.ts with it.
 */
const LAST_UPDATED = 'October 12, 2026';

/**
 * The day the third-party behaviour described here was last checked: the A-ADS
 * frame's response, when Chrome requests the ad frames, the Google tag's
 * cookies and requests, and the Vercel, Google and A-ADS documents quoted.
 * Every "we checked" sentence carries this date, so a reader can tell an
 * observation from a promise. Re-run the checks before moving it.
 */
const CHECKED_ON = 'October 12, 2026';

// Typography is set by hand: Tailwind's `prose` classes need the typography
// plugin, which is not installed.
const h2 = 'pt-6 text-xl sm:text-2xl font-bold text-slate-900 dark:text-white scroll-mt-20';
const h3 = 'pt-2 text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100 scroll-mt-20';
const list = 'list-disc pl-5 space-y-2 marker:text-slate-400 dark:marker:text-slate-500';
// Underlined, not colour alone: these sit inside running text.
const linkClass = 'text-amber-700 dark:text-amber-400 underline underline-offset-2 hover:text-amber-800 dark:hover:text-amber-300';
// The "On this page" rows stand alone in a labelled nav, so position marks
// them. Each fills a 44px row.
const navLink = 'flex min-h-11 items-center text-amber-700 dark:text-amber-400 hover:underline';
const strong = 'font-semibold text-slate-800 dark:text-slate-200';

const TOC = [
    { href: '#data-collection', label: 'Data collection' },
    { href: '#analytics', label: 'Analytics' },
    { href: '#storage', label: 'Cookies and storage' },
    { href: '#accept-all', label: 'If you press Accept All' },
    { href: '#advertising', label: 'Advertising' },
    { href: '#affiliate-links', label: 'Affiliate links' },
    { href: '#opt-out', label: 'Opt-out' },
    { href: '#data-retention', label: 'Data retention' },
    { href: '#children', label: 'Children\'s privacy' },
    { href: '#contact', label: 'Contact' },
] as const;

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {children}
        </a>
    );
}

/** A cookie, a storage key or a piece of a page address, exactly as it appears in the browser. */
function Key({ children }: { children: React.ReactNode }) {
    return (
        <code className="text-[0.92em] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded break-words">
            {children}
        </code>
    );
}

export default function PrivacyPage() {
    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
            <article className="measure space-y-4 text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-400 break-words">
                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">Privacy Policy</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Last updated: {LAST_UPDATED}</p>
                <p>
                    This page says what the site sends, who receives it, and what it keeps in your browser. Where a
                    statement rests on another company&apos;s documentation, or on a check we ran ourselves, it says so
                    and gives the date.
                </p>

                <nav
                    aria-label="On this page"
                    className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800"
                >
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                        On this page
                    </p>
                    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 text-xs sm:text-sm">
                        {TOC.map((item) => (
                            <li key={item.href}>
                                <a href={item.href} className={navLink}>{item.label}</a>
                            </li>
                        ))}
                    </ul>
                </nav>

                <h2 id="data-collection" className={h2}>Data Collection</h2>
                <p>
                    There are no accounts, no sign-up and no email list, and we keep no database of visitors or of what
                    they type. The calculator does its arithmetic in your browser, but some of what you enter still
                    leaves it. Our code writes none of it to a database and logs only errors. This is where it goes.
                </p>
                <ul className={list}>
                    <li>
                        <strong className={strong}>Your settings are kept in the page address.</strong> Once you
                        change the plan or pick a currency, the calculator writes your settings into the address bar,
                        so that a link reproduces the plan: the amount, frequency, dates, fees, price source and
                        display currency, plus a Manual-mode price, a starting stack, its cost and a yearly increase
                        if you entered them. A shared or bookmarked link carries them from the start. Your browser
                        sends that address to this site when it loads the page. The price lookups, comparisons and
                        exchange-rate requests below are sent to the address of the page you are on as well, so what
                        those points say a request sends is in addition to this address. Our host, Vercel, receives
                        these requests with your IP address and browser details, as any web host does, and keeps
                        request logs. Its{' '}
                        <Ext href="https://vercel.com/docs/logs/runtime">documentation</Ext> (read {CHECKED_ON}) lists
                        the path, the part of the address after the &quot;?&quot;, the time and the browser&apos;s
                        user agent among the details of a logged request, with a retention of one hour to 30 days
                        depending on the hosting plan.
                    </li>
                    <li>
                        <strong className={strong}>Price lookups go to our server.</strong> To price a plan, the
                        calculator sends our server your start date, your end date and the price source you picked,
                        and asks for that source&apos;s latest price. The S&amp;P 500, gold and inflation comparisons,
                        a plan you add under Compare Plans and the &quot;What If You Skipped It?&quot; card each send
                        two dates as well: dates from your plans, today&apos;s date, or the date five years before
                        it. Our server answers from its copy of each provider&apos;s full public history. The
                        providers are not sent your dates, or anything else about you.
                    </li>
                    <li>
                        <strong className={strong}>Two comparisons are worked out on our server.</strong> The range of
                        outcomes for the same plan from every past start date sends how often you buy, how long the
                        plan runs (rounded to whole months), your fee percentage and the stretch of price history to
                        compare against. The share card&apos;s line about how your average cost ranks against other
                        start dates sends how often you buy, how long the plan runs in days, and your average cost per
                        bitcoin before fees. The answer for a given frequency, plan length and stretch of history
                        stays in our server&apos;s memory for up to an hour, so the same schedule is answered faster
                        next time.
                    </li>
                    <li>
                        <strong className={strong}>Exchange rates.</strong> Amounts in a currency other than US
                        dollars are converted at the day&apos;s European Central Bank rates. Your browser asks our
                        server for them when your display currency is not US dollars, when you press or focus the
                        calculator&apos;s currency picker, and when a saved Cost Basis Tracker position is in another
                        currency. The exchange-rate request does not ask for a currency: the answer holds every rate.
                        Like the lookups above, though, it goes to the address of the page you are on, and that
                        address can hold your settings, the display currency among them.
                    </li>
                    <li>
                        <strong className={strong}>The live price and the network widgets.</strong> On the home page
                        the price ticker and the network widgets ask two fixed addresses on this site,{' '}
                        <Key>/api/live/ticker</Key> and <Key>/api/live/sidebar</Key>, for their latest figures, about
                        every 30 seconds while the tab is visible. These requests do not go to the page address: they
                        carry no page address, no cookies and nothing about your plan. Vercel still receives your IP
                        address and browser details with them.
                    </li>
                    <li>
                        <strong className={strong}>Shared links, preview images, the widget and the API.</strong> A
                        link made with the share buttons carries the plan in its address in the same way. When someone
                        opens it, or a chat app or social network fetches it to build a preview, our server reads
                        those settings to draw the page and its preview image. The embeddable widget and the public API
                        work the same way, and so do the FIRE and drawdown calculators&apos; own pages: the FIRE form
                        sends an amount, a frequency and a start year, the drawdown form a stack size in bitcoin, and
                        each reloads its page with those values in the address. The finished image or API response can
                        be cached under its address by our host&apos;s network for up to about an hour, like other web
                        responses.
                    </li>
                    <li>
                        <strong className={strong}>Share buttons.</strong> The buttons that post to X, or to Nostr
                        through Primal, open that service with the text and link you chose to share in the address of
                        the new window. Nothing goes to either of them unless you press the button. Saving the share
                        card as an image happens in your browser.
                    </li>
                    <li>
                        <strong className={strong}>Cost Basis Tracker positions stay on your device.</strong> Their
                        dates, amounts and labels are saved in your browser and are not sent to our server. The tracker
                        prices them on your device from the public price history, which it downloads in full once a
                        position is saved, unless the page already holds all of it up to date. That request names the
                        price source and no date, amount or label of yours. Beyond the page address it goes to, it
                        shows our server one thing about your positions: that at least one is saved. A position in a
                        currency other than US dollars also leads to the exchange-rate request above.
                    </li>
                </ul>
                <p>
                    Prices and network data come from public sources: Kraken, Coinbase, mempool.space, CoinGecko, FRED,
                    Yahoo Finance, alternative.me, blockchain.info, and Frankfurter (frankfurter.dev) for European
                    Central Bank exchange rates. Our server makes every one of those requests. Your browser never
                    contacts them, and none of the requests contains anything about you or your plan.
                </p>

                <h2 id="analytics" className={h2}>Analytics</h2>
                <p>
                    We use <strong className={strong}>Vercel Web Analytics</strong> and{' '}
                    <strong className={strong}>Vercel Speed Insights</strong> to count page views and to measure how
                    fast pages load. They load for every visitor, whatever you answer in the cookie banner, on every
                    page except the embeddable widget. Neither sets a cookie. Their reports go to Vercel through this
                    site&apos;s own domain.
                </p>
                <p>
                    {/* This paragraph must describe what stripQueryAndHash in
                        components/LazyAnalytics.tsx does: the address is cut to its path.
                        The tests in disclosure.test.ts run that function against these
                        sentences. If it ever keeps anything, name it here. */}
                    Before either script sends a report, this site cuts the page address down to its path. Everything
                    after a &quot;?&quot; or a &quot;#&quot; is removed, campaign tags included.
                    Calculator settings live after the &quot;?&quot;, so your amounts and dates are not in these
                    reports. The path is still sent (for example <Key>/calculators/bitcoin-fire</Key>), and so is the
                    address of the page that sent you here when that page is on another site.
                </p>
                <p>
                    The rest of what the reports hold, according to Vercel&apos;s documentation for{' '}
                    <Ext href="https://vercel.com/docs/analytics/privacy-policy">Web Analytics</Ext> and{' '}
                    <Ext href="https://vercel.com/docs/speed-insights/privacy-policy">Speed Insights</Ext> (read{' '}
                    {CHECKED_ON}): the time, your approximate location (country, region and city; for Speed Insights
                    the country only), your browser, operating system and device type, and, for Speed Insights, the
                    loading-speed measurements, the part of the page each one relates to, and your connection speed.
                    To count visitors without a cookie, Vercel makes a hash from each incoming request and discards it
                    after 24 hours. Vercel says it collects no identifier that follows you across other sites. That is
                    Vercel&apos;s description of its own systems, which we cannot inspect. See{' '}
                    <Ext href="https://vercel.com/legal/privacy-notice">Vercel&apos;s privacy notice</Ext> for the
                    rest.
                </p>

                <h2 id="storage" className={h2}>Cookies &amp; Browser Storage</h2>
                <p>
                    Until you press Accept All in the cookie banner, this site sets no cookies. It does keep a few
                    things in your browser&apos;s own storage. The names are given so you can check them in your
                    browser&apos;s developer tools.
                </p>
                <ul className={list}>
                    <li>
                        <strong className={strong}>Preferences</strong>, in localStorage until you clear them:{' '}
                        <Key>theme-preference</Key> (light or dark), <Key>cookie-consent</Key> (your answer to the
                        banner), <Key>currency-preference</Key> (display currency) and{' '}
                        <Key>denomination-preference</Key> (BTC or sats).
                    </li>
                    <li>
                        <strong className={strong}>Install prompt</strong>: <Key>pwa-install-dismissed</Key> in
                        localStorage records when you last answered the &quot;install this app&quot; prompt, whether
                        you installed, declined or closed it, so it is not offered again for 30 days.{' '}
                        <Key>pwa-visit-count</Key> in sessionStorage counts page loads in the current tab to decide
                        when to offer it, and is gone when the tab closes.
                    </li>
                    <li>
                        <strong className={strong}>Cost Basis Tracker positions</strong>:{' '}
                        <Key>btc-dca-cost-basis-positions</Key> in localStorage holds the positions you enter, so they
                        survive a reload.
                    </li>
                    <li>
                        <strong className={strong}>Offline copies</strong>: outside the embeddable widget, the site
                        installs a service worker so that it can still show you something when it cannot be reached.
                        In your browser&apos;s Cache Storage it keeps the offline page and the files that page needs,
                        the most recent pages you opened (up to 60), and static files such as scripts and images (up
                        to 120). Only a page loaded in full is copied (from its address, a bookmark, another site or
                        a reload), not one reached by a link inside the site. Most pages are stored under their path
                        alone, with nothing after the &quot;?&quot;, so the home page&apos;s copy is not filed under
                        your calculator settings. The FIRE and drawdown calculators&apos; pages are built by our
                        server from the settings in their address, and each is stored under its full address,
                        settings included. A shared link is never stored. The copies stay on your device.
                    </li>
                </ul>

                <h3 id="accept-all" className={h3}>If you press Accept All</h3>
                <p>
                    Accept All loads Google&apos;s ads tag for our Google Ads account. We use it to see whether people
                    who arrive from this site&apos;s own Google ads go on to use the site. From then until you
                    withdraw consent, Google is a recipient of data about your visit. What follows is what we observed
                    in a test on {CHECKED_ON}.
                </p>
                <ul className={list}>
                    <li>
                        <strong className={strong}>What Google receives.</strong> The tag sent requests to
                        googletagmanager.com, google.com, doubleclick.net and googleadservices.com. Google&apos;s
                        script decides which of Google&apos;s servers it calls, so that list can change. Between them
                        the requests carry the full address of the page you are on, including any calculator settings
                        in it, the page title, the ID held in the <Key>_gcl_au</Key> cookie described below, and the
                        ad-click ID if you arrived from a Google ad. They also carry your screen size and device
                        details the tag reads from your browser: processor type, operating system and its version,
                        full browser version and, where the browser reports one, device model. Google receives your
                        IP address too, as with any request.
                    </li>
                    <li>
                        <strong className={strong}>Ad personalisation.</strong> The consent passed to the tag covers ad
                        personalisation as well as measurement, and the tag calls Google&apos;s remarketing endpoint.
                        So Google can use your visit to personalise ads, not only to count conversions.
                    </li>
                    <li>
                        <strong className={strong}>Cookies on this site&apos;s domain.</strong> <Key>_gcl_au</Key>{' '}
                        holds an ID that Google&apos;s tag generates and sends with its requests, and is kept for 90
                        days. <Key>_gcl_aw</Key> is set only if you arrived by clicking a Google ad, and holds that
                        click&apos;s ID for 90 days. As with any cookie, your browser also sends these to this site
                        with its other requests. Our code does not read them.
                    </li>
                    <li>
                        <strong className={strong}>Storage on this site&apos;s domain.</strong> <Key>_gcl_ls</Key> in
                        localStorage, written by Google&apos;s tag to hold the same kind of identifiers, and{' '}
                        <Key>ads-conversion-fired</Key> in sessionStorage, written by this site so that a visit is
                        counted once per browsing session.
                    </li>
                    <li>
                        <strong className={strong}>Cookies on Google&apos;s own domains.</strong> Google can also set
                        cookies on its own domains, which this site cannot read or delete. Examples from{' '}
                        <Ext href="https://business.safety.google/adscookies/">Google&apos;s published list</Ext>{' '}
                        (read {CHECKED_ON}): <Key>test_cookie</Key> on doubleclick.net for 15 minutes, and{' '}
                        <Key>IDE</Key> on doubleclick.net for 13 months in the EEA and UK and 24 months elsewhere. A
                        browser that blocks third-party cookies will not store Google&apos;s own.
                    </li>
                </ul>

                <h2 id="advertising" className={h2}>Third-Party Advertising</h2>
                <p>
                    Display ads are served by <Ext href="https://aads.com">A-ADS</Ext> (AADS), an advertising network
                    that says it is headquartered in Hong Kong. Each ad slot is a frame loaded from A-ADS&apos;s
                    servers. The frames are not tied to the cookie banner, and they do not wait for you to scroll to
                    them: your browser can request every one as soon as the home page opens, whatever you answered.
                    In our check on {CHECKED_ON}, Chrome did on a direct visit. As of {LAST_UPDATED} the slots are
                    on the home page only.
                </p>
                <p>
                    When a slot loads, your browser contacts A-ADS directly. A-ADS receives your IP address, your
                    browser details, and the fact that the request came from this site. It is not sent the page
                    address or your calculator settings. The frame also loads a font from Google Fonts, so
                    Google&apos;s font servers receive your IP address and browser details too. That request comes
                    from A-ADS&apos;s frame, not from this site&apos;s page.
                </p>
                <p>
                    We checked the frame on {CHECKED_ON}. Its response set no cookies and contained no scripts. That
                    is one check of the ad shown that day, not a promise about every ad. A-ADS, not this site,
                    chooses the ad, and we cannot see inside its frame. A-ADS&apos;s own{' '}
                    <Ext href="https://aads.com/privacy_policy/">privacy policy</Ext> (read the same day) says it
                    &quot;may use cookies, JavaScript, web beacons, and similar technologies, such as tracking
                    URLs&quot;, and that information may be transferred to and processed in Hong Kong and other
                    countries. An ad&apos;s link points at A-ADS&apos;s own click address, so clicking one takes you
                    off this site, and the policies of A-ADS and of the advertiser apply from there.
                </p>
                <p>
                    Google&apos;s ads tag, described above, shows no ads here. This site has not run Google AdSense
                    since July 2026.
                </p>

                <h2 id="affiliate-links" className={h2}>Affiliate Links</h2>
                <p>
                    Some links to other companies are affiliate links, labeled where they appear. Nothing is sent to
                    those companies until you click one. When you do, the link tells the company that the visit came
                    from this site, and its own privacy policy applies from then on.
                </p>

                <h2 id="opt-out" className={h2}>Opt-Out</h2>
                <p>
                    The cookie banner appears until you answer it. Choose &quot;Essential Only&quot; and Google&apos;s
                    ads tag never loads. That choice does not stop the A-ADS frames or the Vercel analytics described
                    above. This site has no switch for those; a content blocker in your browser can block them.
                </p>
                <p>
                    Your answer is saved in your browser under <Key>cookie-consent</Key>. If your browser blocks this
                    site&apos;s storage, the answer cannot be saved. It then holds until the site is next loaded
                    afresh, for example by a reload, and the banner asks again.
                </p>
                <p>
                    To change your answer later, use the <strong className={strong}>Cookie preferences</strong> link
                    in the footer of any page. It brings the banner back and withdraws your consent straight away:
                    the tag is told that consent is denied, and this site deletes the <Key>_gcl_</Key> cookies and
                    the <Key>_gcl_ls</Key> entry from its own domain. Cookies on Google&apos;s domains stay until
                    they expire or you clear them. Google&apos;s script stays loaded in that tab, with consent
                    denied, until you reload or close it. In our test on {CHECKED_ON} it sent nothing further after
                    consent was withdrawn. You can also:
                </p>
                <ul className={list}>
                    <li>Turn off personalized ads in <Ext href="https://adssettings.google.com/">Google&apos;s ad settings</Ext></li>
                    <li>Set your browser to block third-party cookies</li>
                    <li>Use a content blocker. The site works without the ad frames and the analytics.</li>
                </ul>

                <h2 id="data-retention" className={h2}>Data Retention</h2>
                <p>
                    What this site keeps is in your browser: your preferences and any Cost Basis Tracker positions in
                    its storage, and your calculator settings in the page address. Clearing this site&apos;s data in
                    your browser removes everything the site has stored there, including the offline copies and the
                    cookies on this site&apos;s domain.
                </p>
                <p>
                    What other parties hold is kept on their terms: Vercel&apos;s request logs and analytics, Google
                    if you accepted its tag, and A-ADS. The sections above link to each one&apos;s own policy.
                </p>

                <h2 id="children" className={h2}>Children&apos;s Privacy</h2>
                <p>
                    This website is not directed at children under 13 years of age. We do not knowingly collect personal information
                    from children. If you are a parent or guardian and believe your child has given us personal information, please{' '}
                    <Link href="/contact" className={linkClass}>contact us</Link> so we can take appropriate action.
                </p>

                <h2 className={h2}>Changes to This Policy</h2>
                <p>
                    We may update this privacy policy from time to time. Changes are posted on this page with a new &quot;Last
                    updated&quot; date. Continuing to use the site after a change means you accept the updated policy.
                </p>

                <h2 id="contact" className={h2}>Contact</h2>
                <p>
                    Questions about this policy? See the{' '}
                    <Link href="/contact" className={linkClass}>contact page</Link>, or reach us on X (Twitter) at{' '}
                    <Ext href="https://x.com/9drix9">@9drix9</Ext>. If something here is wrong, tell us and we will
                    correct it.
                </p>
            </article>
        </div>
    );
}
