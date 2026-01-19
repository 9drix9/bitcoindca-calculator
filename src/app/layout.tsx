import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { GoogleAdSense } from '@/components/GoogleAdSense';
import clsx from 'clsx';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Bitcoin DCA Calculator | Calculate Your BTC Returns',
  description: 'Free Bitcoin Dollar Cost Averaging (DCA) calculator. Visualize your portfolio growth with real historical data and compare investment strategies.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <GoogleAdSense />
        <meta name="google-adsense-account" content="ca-pub-7196704678615727" />
      </head>
      <body className={clsx(inter.className, "bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 antialiased")}>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center text-white font-bold">₿</div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">Bitcoin DCA</h1>
              </div>
            </div>
          </header>

          <main className="flex-grow">
            {children}
          </main>

          <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-8 mt-12">
            <div className="max-w-7xl mx-auto px-4 text-center text-slate-500 text-sm">
              <p>© {new Date().getFullYear()} Bitcoin DCA Calculator. Data provided by Kraken.</p>
              <p className="mt-2 text-xs opacity-60">This website is for informational purposes only and does not constitute financial advice.</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
