'use client';

import { useSyncExternalStore, useState } from 'react';
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
    const [showPreferences, setShowPreferences] = useState(false);
    const [advertisingEnabled, setAdvertisingEnabled] = useState(true);

    const saveConsent = (advertising: boolean) => {
        localStorage.setItem('cookie-consent', JSON.stringify({ essential: true, advertising }));
        window.dispatchEvent(new StorageEvent('storage', { key: 'cookie-consent' }));
    };

    const handleAccept = () => saveConsent(advertisingEnabled);
    const handleSavePreferences = () => saveConsent(advertisingEnabled);

    if (!visible) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
            <div className="max-w-4xl mx-auto">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <p className="flex-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        We use cookies to improve your experience and serve personalized ads.{' '}
                        <Link href="/privacy" className="underline text-amber-600 dark:text-amber-400 hover:text-amber-700">Learn more</Link>
                    </p>
                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        <button
                            onClick={() => setShowPreferences(!showPreferences)}
                            className="px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            Preferences
                        </button>
                        <button
                            onClick={handleAccept}
                            className="px-4 py-1.5 text-xs sm:text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors"
                        >
                            Accept
                        </button>
                    </div>
                </div>

                {showPreferences && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2.5 fade-in">
                        <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <span className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200">Essential</span>
                                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">Required for site functionality</p>
                            </div>
                            <div className="relative inline-flex items-center shrink-0">
                                <div className="w-9 h-5 bg-amber-500 rounded-full opacity-60 cursor-not-allowed" />
                                <div className="absolute left-[19px] w-3.5 h-3.5 bg-white rounded-full shadow" />
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <span className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200">Advertising</span>
                                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">Google AdSense personalized ads</p>
                            </div>
                            <button
                                onClick={() => setAdvertisingEnabled(!advertisingEnabled)}
                                className="relative inline-flex items-center shrink-0"
                                role="switch"
                                aria-checked={advertisingEnabled}
                            >
                                <div className={`w-9 h-5 rounded-full transition-colors ${advertisingEnabled ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                                <div className={`absolute w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${advertisingEnabled ? 'translate-x-[19px]' : 'translate-x-[3px]'}`} />
                            </button>
                        </div>
                        <div className="flex justify-end pt-1">
                            <button
                                onClick={handleSavePreferences}
                                className="px-4 py-1.5 text-xs sm:text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
