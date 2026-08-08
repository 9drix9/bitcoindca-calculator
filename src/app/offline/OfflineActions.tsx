'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RotateCw, Home } from 'lucide-react';

export function OfflineActions() {
  // Auto-retry the attempted URL the moment connectivity returns. The
  // service worker serves this page as a fallback while keeping the
  // original URL, so a reload retries exactly the page the user wanted.
  useEffect(() => {
    const onOnline = () => window.location.reload();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <button
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-medium rounded-lg transition-colors"
      >
        <RotateCw size={16} aria-hidden="true" />
        Try Again
      </button>
      <Link
        href="/"
        className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium rounded-lg transition-colors"
      >
        <Home size={16} aria-hidden="true" />
        Go to Calculator
      </Link>
    </div>
  );
}
