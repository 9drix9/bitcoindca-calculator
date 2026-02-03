'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';

function getConsentSnapshot() {
    try {
        return localStorage.getItem('cookie-consent');
    } catch {
        return null;
    }
}

function getServerSnapshot() {
    return 'pending';
}

export const CookieConsent = () => {
    const consent = useSyncExternalStore(
        (cb) => {
            window.addEventListener('storage', cb);
            return () => window.removeEventListener('storage', cb);
        },
        getConsentSnapshot,
        getServerSnapshot,
    );
    const visible = consent === null;

    const handleAccept = () => {
        localStorage.setItem('cookie-consent', JSON.stringify({ essential: true }));
        window.dispatchEvent(new StorageEvent('storage', { key: 'cookie-consent' }));
    };

    if (!visible) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
            <div className="max-w-4xl mx-auto">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <p className="flex-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        We use essential cookies for site functionality. Ads are served by AADS and do not track you.{' '}
                        <Link href="/privacy" className="underline text-amber-600 dark:text-amber-400 hover:text-amber-700">Privacy Policy</Link>
                    </p>
                    <button
                        onClick={handleAccept}
                        className="px-4 py-1.5 text-xs sm:text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors self-end sm:self-auto shrink-0"
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
};
