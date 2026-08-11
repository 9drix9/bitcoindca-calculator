import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

import { LazyAnalytics } from '@/components/LazyAnalytics';
import { CookieConsent } from '@/components/CookieConsent';
import { CookiePreferencesButton } from '@/components/CookiePreferencesButton';
import { ConsentGatedScripts } from '@/components/ConsentGatedScripts';
import { BtcDonationButton } from '@/components/BtcDonationButton';
import { Providers } from '@/components/Providers';
import { ResponsiveNav } from '@/components/nav/ResponsiveNav';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { Logo } from '@/components/brand/Logo';
import clsx from 'clsx';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://btcdollarcostaverage.com'),
  title: {
    default: 'Bitcoin DCA Calculator — Backtest Dollar-Cost Averaging BTC',
    template: '%s | Bitcoin DCA Calculator',
  },
  description: 'Free Bitcoin DCA calculator with real historical price data. See how much $50/week in BTC would be worth today. Compare vs S&P 500, Gold, and savings.',
  keywords: ['bitcoin dca calculator', 'dollar cost averaging bitcoin', 'btc dca', 'bitcoin investment calculator', 'bitcoin returns calculator', 'bitcoin savings calculator', 'crypto dca', 'bitcoin halving countdown', 'stack sats calculator', 'bitcoin portfolio tracker'],
  openGraph: {
    title: 'Bitcoin DCA Calculator | See What $50/Week in BTC Would Be Worth',
    description: 'Free Bitcoin DCA calculator with real historical data from Kraken & Coinbase. Compare BTC vs S&P 500, Gold, and savings. Track halving, hashrate, lightning stats.',
    type: 'website',
    siteName: 'Bitcoin DCA Calculator',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bitcoin DCA Calculator | See What $50/Week in BTC Would Be Worth',
    description: 'Free Bitcoin DCA calculator with real historical data. Compare BTC vs S&P 500, Gold, and savings accounts.',
    creator: '@9drix9',
    site: '@9drix9',
  },
  alternates: {
    canonical: '/',
  },
  manifest: '/manifest.json',
  other: {
    // Chrome deprecated the apple- prefixed name; emit both so Android/desktop
    // Chromium honors it (and stops logging a deprecation warning) while iOS
    // Safari keeps its own.
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'BTC DCA Calc',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
  // `interactive-widget=resizes-content` makes the on-screen keyboard shrink the
  // LAYOUT viewport, not just the visual one. Chrome Android's default
  // (resizes-visual) leaves `position:fixed; bottom:0` pinned to the pre-keyboard
  // bottom, so the tab bar appeared to float halfway up the screen with a gap
  // beneath it whenever a number or date field was focused.
  interactiveWidget: 'resizes-content' as const,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
  ],
};

const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('theme-preference');
    if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches) || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch(e) {}
})();
`;

// Skips /embed: that route runs inside third-party pages, and /embed-guide
// promises publishers it "collects nothing from your readers" — quietly
// installing a service worker on their visitors would contradict that.
const swRegisterScript = `
var p = location.pathname;
if('serviceWorker' in navigator && p !== '/embed' && p.indexOf('/embed/') !== 0){
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('/sw.js');
  });
}
`;

// amber-700 rather than amber-600: amber-600 on white measures 3.1:1, under the
// 4.5:1 AA floor for body text.
const footerLink =
  'text-sm text-slate-500 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-400 transition-colors';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('consent', 'default', {
            'ad_storage': 'denied',
            'ad_user_data': 'denied',
            'ad_personalization': 'denied',
            'analytics_storage': 'denied',
            'wait_for_update': 500
          });
        `}} />
        <script dangerouslySetInnerHTML={{ __html: swRegisterScript }} />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        {/* No manual favicon <link>: src/app/favicon.ico is an App Router metadata
            file, so Next emits the tag itself. Declaring it here as sizes="32x32"
            also mislabelled what is really a 16/32/48 multi-frame ICO. */}
        {/* No preconnect hints: all market-data fetches happen server-side via actions,
            so the browser never contacts those origins directly. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  "@id": "https://btcdollarcostaverage.com/#website",
                  "name": "Bitcoin DCA Calculator",
                  "url": "https://btcdollarcostaverage.com",
                  "description": "Free Bitcoin DCA calculator with real historical price data. Compare BTC vs S&P 500, Gold, and savings.",
                  "inLanguage": "en-US",
                  "publisher": { "@id": "https://btcdollarcostaverage.com/#organization" }
                },
                {
                  // Named founder + contact point: on YMYL financial content an
                  // anonymous publisher is a documented quality-rater negative.
                  "@type": "Organization",
                  "@id": "https://btcdollarcostaverage.com/#organization",
                  "name": "Bitcoin DCA Calculator",
                  "url": "https://btcdollarcostaverage.com",
                  "logo": {
                    "@type": "ImageObject",
                    "url": "https://btcdollarcostaverage.com/icon-512.png",
                    "width": 512,
                    "height": 512
                  },
                  "founder": { "@id": "https://btcdollarcostaverage.com/author#person" },
                  "sameAs": [
                    "https://x.com/9drix9",
                    "https://github.com/9drix9/bitcoindca-calculator"
                  ],
                  "contactPoint": {
                    "@type": "ContactPoint",
                    "contactType": "customer support",
                    "url": "https://btcdollarcostaverage.com/contact",
                    "availableLanguage": ["en"]
                  }
                },
                {
                  "@type": "Person",
                  "@id": "https://btcdollarcostaverage.com/author#person",
                  "name": "Ricky Thach",
                  "url": "https://btcdollarcostaverage.com/author",
                  "sameAs": [
                    "https://x.com/9drix9",
                    "https://github.com/9drix9"
                  ]
                }
              ]
            })
          }}
        />
      </head>
      <body className={clsx(inter.className, "bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 antialiased")}>
        <Providers>
        <div className="app-shell min-h-screen flex flex-col">
          <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-amber-500 focus:text-slate-950 focus:rounded-lg focus:text-sm focus:font-semibold">
            Skip to main content
          </a>
          {/* Navigation */}
          <ResponsiveNav />

          <main id="main-content" className="flex-grow">
            {children}
          </main>

          {/* Footer */}
          {/* Bottom-nav clearance lives in globals.css (#site-footer), which accounts
              for the safe-area inset that a flat pb-20 cannot. */}
          <footer id="site-footer" className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 mt-12">
            {/* Safe-area-aware horizontal padding: viewport-fit=cover otherwise
                lets landscape-notch insets (~47px) eat into a flat px-4. */}
            <div className="max-w-7xl mx-auto pl-[max(env(safe-area-inset-left),1rem)] pr-[max(env(safe-area-inset-right),1rem)] sm:pl-[max(env(safe-area-inset-left),1.5rem)] sm:pr-[max(env(safe-area-inset-right),1.5rem)] lg:pl-[max(env(safe-area-inset-left),2rem)] lg:pr-[max(env(safe-area-inset-right),2rem)] py-8 sm:py-10">
              {/* 5 columns now (brand + Tools + Learn + Site + Support), so the
                  breakpoint moves to lg — at md they were 5-across and cramped. */}
              <nav aria-label="Footer navigation" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 sm:gap-8 mb-8">
                {/* Brand */}
                <div className="col-span-2 md:col-span-3 lg:col-span-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Logo className="w-6 h-6 shrink-0 text-amber-700 dark:text-amber-400" />
                    <span className="font-semibold text-slate-800 dark:text-white text-sm">Bitcoin DCA Calculator</span>
                  </div>
                  {/* Internal link to the author entity from every page — that is
                      what associates a named person with the site for E-E-A-T. */}
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Built by{' '}
                    <Link href="/author" className="text-amber-700 dark:text-amber-400 hover:underline">
                      Ricky Thach
                    </Link>{' '}
                    <a href="https://x.com/9drix9" target="_blank" rel="noopener noreferrer" className="text-slate-500 dark:text-slate-400 hover:underline">
                      (@9drix9)
                    </a>
                  </p>
                </div>

                {/* Tools — the entry point into the calculator and scenario clusters,
                    which previously had no link path from anywhere on the site. */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-800 dark:text-white uppercase tracking-wider">Tools</h4>
                  <div className="flex flex-col gap-1.5">
                    {[
                      { href: '/calculators', label: 'All Calculators' },
                      { href: '/dca', label: 'DCA Scenarios' },
                      { href: '/lump-sum-vs-dca', label: 'Lump Sum vs DCA' },
                      { href: '/best-day-to-buy-bitcoin', label: 'Best Day to Buy' },
                      { href: '/dca/start-date-heatmap', label: 'Start-Date Heatmap' },
                      { href: '/embed-guide', label: 'Embed the Widget' },
                      { href: '/developers', label: 'Free API & Data' },
                      { href: '/alternatives', label: 'Compare Calculators' },
                    ].map(({ href, label }) => (
                      <Link key={href} href={href} className={footerLink}>{label}</Link>
                    ))}
                  </div>
                </div>

                {/* Learn */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-800 dark:text-white uppercase tracking-wider">Learn</h4>
                  <div className="flex flex-col gap-1.5">
                    {[
                      { href: '/why-bitcoin', label: 'Why Bitcoin' },
                      { href: '/self-custody', label: 'Self-Custody' },
                      { href: '/mining', label: 'Mining Guide' },
                      { href: '/bitcoin-dca-tax', label: 'DCA & Taxes' },
                      { href: '/features', label: 'Features Guide' },
                      { href: '/methodology', label: 'Methodology & Data' },
                    ].map(({ href, label }) => (
                      <Link key={href} href={href} className={footerLink}>{label}</Link>
                    ))}
                  </div>
                </div>

                {/* Site — authorship and contact are the E-E-A-T signals Google
                    looks for on financial content, so they get top billing here. */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-800 dark:text-white uppercase tracking-wider">Site</h4>
                  <div className="flex flex-col gap-1.5">
                    {[
                      { href: '/about', label: 'About' },
                      { href: '/author', label: 'Who Built This' },
                      { href: '/contact', label: 'Contact' },
                      { href: '/privacy', label: 'Privacy Policy' },
                      { href: '/terms', label: 'Terms of Service' },
                      { href: '/about#affiliate-disclosure', label: 'Ads & Disclosure' },
                    ].map(({ href, label }) => (
                      <Link key={href} href={href} className={footerLink}>{label}</Link>
                    ))}
                    {/* Withdrawing consent has to be as easy as giving it. */}
                    <CookiePreferencesButton className={`${footerLink} text-left`} />
                  </div>
                </div>

                {/* Donation */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-800 dark:text-white uppercase tracking-wider">Support</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Donate BTC</p>
                  <BtcDonationButton />
                </div>
              </nav>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <p suppressHydrationWarning>&copy; {new Date().getFullYear()} Bitcoin DCA Calculator. Market data from public exchange APIs.</p>
                <p className="text-slate-500 dark:text-slate-400">Not financial advice.</p>
              </div>
            </div>
          </footer>

          <PwaInstallPrompt />
          <CookieConsent />
        </div>
        </Providers>
        <LazyAnalytics />
        <ConsentGatedScripts />
      </body>
    </html>
  );
}
