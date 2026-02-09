'use client';

import { useState, useEffect } from 'react';
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

export const CookieConsent = () => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const consent = getStoredConsent();
        if (consent === null || needsReconsent(consent)) {
            setVisible(true);
        }
    }, []);

    const saveConsent = (consent: ConsentData) => {
        localStorage.setItem('cookie-consent', JSON.stringify(consent));
        window.dispatchEvent(
            new StorageEvent('storage', { key: 'cookie-consent' }),
        );
        setVisible(false);
    };

    const handleAcceptAll = () => {
        saveConsent({ essential: true, analytics: true });
    };

    const handleEssentialOnly = () => {
        saveConsent({ essential: true, analytics: false });
    };

    if (!visible) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
            <div className="max-w-4xl mx-auto">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <p className="flex-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        We use essential cookies for site functionality and optional cookies for analytics and ads.{' '}
                        <Link href="/privacy" className="underline text-amber-600 dark:text-amber-400 hover:text-amber-700">
                            Privacy Policy
                        </Link>
                    </p>
                    <div className="flex gap-2 self-end sm:self-auto shrink-0">
                        <button
                            onClick={handleEssentialOnly}
                            className="px-4 py-1.5 text-xs sm:text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            Essential Only
                        </button>
                        <button
                            onClick={handleAcceptAll}
                            className="px-4 py-1.5 text-xs sm:text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors"
                        >
                            Accept All
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
