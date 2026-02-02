import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

import { ThemeToggle } from '@/components/ThemeToggle';
import { CookieConsent } from '@/components/CookieConsent';
import { BtcDonationButton } from '@/components/BtcDonationButton';
import clsx from 'clsx';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://btcdollarcostaverage.com'),
  title: 'Bitcoin DCA Calculator | Dollar Cost Averaging BTC Returns Calculator',
  description: 'Free Bitcoin DCA calculator with real historical price data. See how much $50/week in BTC would be worth today. Compare vs S&P 500, Gold, and savings accounts. Track halving countdown, hashrate, lightning network stats, and more.',
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
      </head>
      <body className={clsx(inter.className, "bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 antialiased")}>
        <div className="min-h-screen flex flex-col">
          {/* Header */}
          <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between">
              <div className="flex items-center gap-4 sm:gap-6">
                <Link href="/" className="flex items-center gap-2 group">
                  <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 group-hover:scale-105 transition-transform">₿</div>
                  <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">Bitcoin DCA</h1>
                </Link>
                <Link href="/why-bitcoin" className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                  Why Bitcoin
                </Link>
              </div>
              <ThemeToggle />
            </div>
          </header>

          {/* Main */}
          <main className="flex-grow">
            {children}
          </main>

          {/* Footer */}
          <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 mt-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-8">
                {/* Brand */}
                <div className="col-span-2 md:col-span-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">₿</div>
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
                    <Link href="/why-bitcoin" className="text-sm text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                      Why Bitcoin
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
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
                <p>&copy; {new Date().getFullYear()} Bitcoin DCA Calculator. Market data from public exchange APIs.</p>
                <p className="opacity-60">Not financial advice.</p>
              </div>
            </div>
          </footer>

          <CookieConsent />
        </div>
      </body>
    </html>
  );
}
