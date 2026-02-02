'use client';

import Script from 'next/script';
import { useSyncExternalStore } from 'react';

function getConsentSnapshot(): boolean {
    try {
        const raw = localStorage.getItem('cookie-consent');
        if (!raw) return false; // No consent yet — don't load ads
        const parsed = JSON.parse(raw);
        return parsed?.advertising === true;
    } catch {
        return false;
    }
}

function subscribe(cb: () => void) {
    window.addEventListener('storage', cb);
    return () => window.removeEventListener('storage', cb);
}

export const GoogleAdSense = () => {
    const adsAllowed = useSyncExternalStore(subscribe, getConsentSnapshot, () => false);

    if (!adsAllowed) return null;

    return (
        <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7196704678615727`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
        />
    );
};
