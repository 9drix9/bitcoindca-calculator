'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';

interface ConsentData {
    essential?: boolean;
    analytics?: boolean;
}

function getStoredConsent(): ConsentData | null {
    try {
        const raw = localStorage.getItem('cookie-consent');
        if (!raw) return null;
        return JSON.parse(raw) as ConsentData;
    } catch {
        return null;
    }
}

function needsReconsent(consent: ConsentData): boolean {
    return typeof consent.analytics !== 'boolean';
}

// Consent lives in localStorage (an external store): subscribe to storage
// events and derive visibility from a snapshot instead of setState-in-effect.
function subscribe(callback: () => void) {
    window.addEventListener('storage', callback);
    return () => window.removeEventListener('storage', callback);
}

function getSnapshot(): boolean {
    const consent = getStoredConsent();
    return consent === null || needsReconsent(consent);
}

export const CookieConsent = () => {
    // Server snapshot is false so SSR/hydration render nothing; the banner
    // appears right after hydration when consent is missing or stale.
    const visible = useSyncExternalStore(subscribe, getSnapshot, () => false);

    const saveConsent = (consent: ConsentData) => {
        localStorage.setItem('cookie-consent', JSON.stringify(consent));
        window.dispatchEvent(
            new StorageEvent('storage', { key: 'cookie-consent' }),
        );
    };

    const handleAcceptAll = () => {
        saveConsent({ essential: true, analytics: true });
    };

    const handleEssentialOnly = () => {
        saveConsent({ essential: true, analytics: false });
    };

    if (!visible) return null;

    return (
        <div
            role="dialog"
            aria-label="Cookie preferences"
            className="fixed left-0 right-0 z-50 bottom-[calc(var(--bottom-nav-h)_+_max(env(safe-area-inset-bottom),12px))] md:bottom-0 p-3 sm:p-4 md:pb-[max(env(safe-area-inset-bottom),1rem)] pl-[max(env(safe-area-inset-left),0.75rem)] pr-[max(env(safe-area-inset-right),0.75rem)] sm:pl-[max(env(safe-area-inset-left),1rem)] sm:pr-[max(env(safe-area-inset-right),1rem)] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]"
        >
            <div className="max-w-4xl mx-auto">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <p className="flex-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        We use essential cookies for site functionality and optional cookies for analytics and ads.{' '}
                        <Link href="/privacy" className="underline text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300">
                            Privacy Policy
                        </Link>
                    </p>
                    {/* h-11, not min-h-[44px]: globals.css sets an unlayered
                        `button { min-height: 36px }` under 640px that outranks
                        Tailwind's layered min-h-* utilities. */}
                    <div className="flex gap-2 self-end sm:self-auto shrink-0">
                        <button
                            onClick={handleEssentialOnly}
                            className="h-11 px-4 py-2 text-xs sm:text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            Essential Only
                        </button>
                        <button
                            onClick={handleAcceptAll}
                            className="h-11 px-4 py-2 text-xs sm:text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors"
                        >
                            Accept All
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
