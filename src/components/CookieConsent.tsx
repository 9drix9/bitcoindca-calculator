'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useKeyboardOpen } from '@/hooks/useKeyboardOpen';

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

// Must match the globals.css media query that hides the fixed bottom nav in
// phone landscape — the banner's clearance assumes the nav is actually there.
const NAV_HIDDEN_QUERY = '(max-width: 926px) and (max-height: 450px) and (orientation: landscape)';

function subscribeNavHidden(callback: () => void) {
    const mq = window.matchMedia(NAV_HIDDEN_QUERY);
    mq.addEventListener('change', callback);
    return () => mq.removeEventListener('change', callback);
}

const getNavHiddenSnapshot = () => window.matchMedia(NAV_HIDDEN_QUERY).matches;

// Distinguishes the user-initiated reopen (which should receive focus) from
// the automatic first-visit appearance (which must not steal focus).
let reopenRequested = false;

/**
 * Withdraw consent and bring the banner back.
 *
 * GDPR Art. 7(3) requires withdrawing consent to be as easy as giving it. The
 * banner only rendered when consent was absent or stale, and nothing anywhere
 * cleared the key — so once a visitor chose, the choice was permanent and the
 * "manage your preferences at any time" line on /privacy was not true.
 *
 * Clearing the key makes getSnapshot() report "no consent on file", and the
 * dispatched event is what tells both this banner and ConsentGatedScripts to
 * re-read it in the same tick.
 */
export function reopenCookiePreferences() {
    try {
        localStorage.removeItem('cookie-consent');
    } catch {
        // Private mode / storage disabled: nothing was stored, nothing to clear.
    }
    reopenRequested = true;
    window.dispatchEvent(new StorageEvent('storage', { key: 'cookie-consent' }));
}

export const CookieConsent = () => {
    // Server snapshot is false so SSR/hydration render nothing; the banner
    // appears right after hydration when consent is missing or stale.
    const visible = useSyncExternalStore(subscribe, getSnapshot, () => false);
    // Both states unmount/hide the bottom nav, so its 76px clearance would
    // become a dead gap under the banner.
    const keyboardOpen = useKeyboardOpen();
    const navHidden = useSyncExternalStore(subscribeNavHidden, getNavHiddenSnapshot, () => false);
    const bottomNavGone = keyboardOpen || navHidden;
    const bannerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (visible && reopenRequested) {
            reopenRequested = false;
            bannerRef.current?.focus();
        }
    }, [visible]);

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

    return (
        <>
            {/* Always mounted: live regions only announce content that changes
                after they already exist in the DOM. data-site-overlay keeps it
                silent on /embed, where CSS hides the banner itself. */}
            <div aria-live="polite" data-site-overlay className="sr-only">
                {visible ? 'Cookie preferences banner opened. Choose Accept All or Essential Only.' : ''}
            </div>
            {visible && (
                <div
                    ref={bannerRef}
                    tabIndex={-1}
                    role="region"
                    aria-label="Cookie preferences"
                    data-site-overlay
                    className={clsx(
                        'fixed left-0 right-0 z-50 outline-none p-3 sm:p-4 pl-[max(env(safe-area-inset-left),0.75rem)] pr-[max(env(safe-area-inset-right),0.75rem)] sm:pl-[max(env(safe-area-inset-left),1rem)] sm:pr-[max(env(safe-area-inset-right),1rem)] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]',
                        bottomNavGone
                            ? 'bottom-0 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:pb-[max(env(safe-area-inset-bottom),1rem)]'
                            : 'bottom-[calc(var(--bottom-nav-h)_+_max(env(safe-area-inset-bottom),12px))] md:bottom-0 md:pb-[max(env(safe-area-inset-bottom),1rem)]',
                    )}
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
            )}
        </>
    );
};
