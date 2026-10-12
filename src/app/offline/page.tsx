import type { Metadata } from 'next';
import { OfflineActions } from './OfflineActions';
import { Logo } from '@/components/brand/Logo';

// The service worker serves this page for any address it cannot fetch and has
// no copy of. That happens with the device offline, and just as much with the
// device online and the site unreachable, so nothing here says which it is.
export const metadata: Metadata = {
  title: 'Can’t reach the site',
  description: 'Shown when a page cannot be loaded: the device is offline or the site cannot be reached.',
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Can&apos;t reach the site
          </h1>
          <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
            Your device is offline, or the site is not answering right now.
            This page reloads by itself when your device comes back online. If
            it stays here, use Try Again.
          </p>
        </div>

        <OfflineActions />

        <div className="text-left bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm dark:shadow-none p-4 sm:p-5 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            In the meantime
          </p>
          <ul className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-1.5 list-disc pl-4">
            {/* The first three bullets describe public/sw.js and change with
                it. It stores a page when the document itself is fetched under
                an active worker, so not on the load that installs it and not
                on a client-side navigation; it never stores /share; and it
                dates a copy with the response's Date header. */}
            <li>
              When the site can&apos;t be reached, a page opens only from a copy
              saved on this device. One is saved each time a page loads in
              full: opened from its address, a bookmark or another site, or
              reloaded.
            </li>
            <li>
              A page reached by a link inside the site, and the first page you
              ever load here, may have no copy until it is reloaded. Shared
              result links are never saved.
            </li>
            <li>
              Each copy is labelled with the date and time the page is from;
              its prices and results are from that time or earlier.
            </li>
            <li>
              The calculator works in Manual price mode if it&apos;s already
              loaded. Historical results need a connection to fetch price data.
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
