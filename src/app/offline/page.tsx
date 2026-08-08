import type { Metadata } from 'next';
import { OfflineActions } from './OfflineActions';
import { Logo } from '@/components/brand/Logo';

export const metadata: Metadata = {
  title: 'Offline',
  description: 'You are currently offline.',
  robots: { index: false, follow: false },
  // Override the root layout's canonical '/' — a service-worker fallback
  // page must not declare itself a duplicate of the homepage.
  alternates: { canonical: null },
};

export default function OfflinePage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="text-center max-w-md space-y-6">
        <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto">
          <Logo className="w-8 h-8 text-amber-700 dark:text-amber-400" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            You&apos;re Offline
          </h1>
          <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
            It looks like you&apos;ve lost your internet connection. This page
            will retry automatically as soon as you&apos;re back online.
          </p>
        </div>

        <OfflineActions />

        <div className="text-left bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm dark:shadow-none p-4 sm:p-5 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            While you&apos;re offline
          </p>
          <ul className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-1.5 list-disc pl-4">
            <li>Pages you&apos;ve visited before are still available from the cache.</li>
            <li>
              The calculator works in Manual price mode if it&apos;s already
              loaded — historical results need a connection to fetch price data.
            </li>
            <li>
              Live BTC price, network stats, and the Fear &amp; Greed index
              require connectivity and will resume when you reconnect.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
