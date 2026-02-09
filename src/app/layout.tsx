import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import Script from 'next/script';
import './globals.css';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { CookieConsent } from '@/components/CookieConsent';
import { BtcDonationButton } from '@/components/BtcDonationButton';
import { Providers } from '@/components/Providers';
import { ResponsiveNav } from '@/components/nav/ResponsiveNav';
import clsx from 'clsx';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://btcdollarcostaverage.com'),
  title: 'Bitcoin DCA Calculator | Dollar Cost Averaging BTC Returns Calculator',
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
  },
  alternates: {
    canonical: '/',
  },
  manifest: '/manifest.json',
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'BTC DCA Calc',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
  themeColor: '#f59e0b',
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.ico" />
        <link rel="preconnect" href="https://mempool.space" />
        <link rel="preconnect" href="https://api.alternative.me" />
        <link rel="dns-prefetch" href="https://api.coingecko.com" />
        <link rel="dns-prefetch" href="https://blockchain.info" />
        <link rel="dns-prefetch" href="https://api.kraken.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "name": "Bitcoin DCA Calculator",
              "url": "https://btcdollarcostaverage.com",
              "description": "Free Bitcoin DCA calculator with real historical price data. Compare BTC vs S&P 500, Gold, and savings.",
              "publisher": {
                "@type": "Organization",
                "name": "Bitcoin DCA Calculator",
                "url": "https://btcdollarcostaverage.com"
              }
            })
          }}
        />
      </head>
      <body className={clsx(inter.className, "bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 antialiased")}>
        <Providers>
        <div className="min-h-screen flex flex-col">
          <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-amber-500 focus:text-white focus:rounded-lg focus:text-sm focus:font-semibold">
            Skip to main content
          </a>
          {/* Navigation */}
          <ResponsiveNav />

          <main id="main-content" className="flex-grow">
            {children}
          </main>

          {/* Footer */}
          <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 mt-12 pb-20 md:pb-0">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
              <nav aria-label="Footer navigation" className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-8">
                {/* Brand */}
                <div className="col-span-2 md:col-span-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" aria-hidden="true">₿</div>
                    <span className="font-semibold text-slate-800 dark:text-white text-sm">Bitcoin DCA Calculator</span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Built by{' '}
                    <a href="https://x.com/9drix9" target="_blank" rel="noopener noreferrer" className="text-amber-600 dark:text-amber-400 hover:underline">
                      @9drix9
                    </a>
                  </p>
                </div>

                {/* Learn */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-800 dark:text-white uppercase tracking-wider">Learn</h4>
                  <div className="flex flex-col gap-1.5">
                    <Link href="/features" className="text-sm text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                      Features Guide
                    </Link>
                    <Link href="/why-bitcoin" className="text-sm text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                      Why Bitcoin
                    </Link>
                    <Link href="/self-custody" className="text-sm text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                      Self-Custody
                    </Link>
                    <Link href="/mining" className="text-sm text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                      Mining Guide
                    </Link>
                  </div>
                </div>

                {/* Links */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-800 dark:text-white uppercase tracking-wider">Legal</h4>
                  <div className="flex flex-col gap-1.5">
                    <Link href="/privacy" className="text-sm text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                      Privacy Policy
                    </Link>
                    <Link href="/terms" className="text-sm text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                      Terms of Service
                    </Link>
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
                <p>&copy; {new Date().getFullYear()} Bitcoin DCA Calculator. Market data from public exchange APIs.</p>
                <p className="text-slate-500 dark:text-slate-500">Not financial advice.</p>
              </div>
            </div>
          </footer>

          <CookieConsent />
        </div>
        </Providers>
        <Analytics />
        <SpeedInsights />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=AW-17927251983"
          strategy="afterInteractive"
        />
        <Script id="google-ads" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-17927251983');
          `}
        </Script>
        <Script id="google-ads-conversion" strategy="afterInteractive">
          {`
            gtag('event', 'ads_conversion_Sign_up_1', {});
          `}
        </Script>
      </body>
    </html>
  );
}
