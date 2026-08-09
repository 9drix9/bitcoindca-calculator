'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';

declare global {
    interface Window {
        dataLayer: unknown[];
        gtag: (...args: unknown[]) => void;
    }
}

interface ConsentData {
    essential?: boolean;
    analytics?: boolean;
}

function getConsent(): ConsentData | null {
    try {
        const raw = localStorage.getItem('cookie-consent');
        if (!raw) return null;
        return JSON.parse(raw) as ConsentData;
    } catch {
        return null;
    }
}

export const ConsentGatedScripts = () => {
    const pathname = usePathname();
    const isEmbed = pathname === '/embed' || pathname?.startsWith('/embed/');
    const [analyticsGranted, setAnalyticsGranted] = useState(false);

    useEffect(() => {
        const check = () => {
            const consent = getConsent();
            setAnalyticsGranted(consent?.analytics === true);
        };

        check();

        const onStorage = (e: StorageEvent) => {
            if (e.key === 'cookie-consent' || e.key === null) check();
        };

        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    useEffect(() => {
        // Withdrawal has to push a denied update, not just unmount the <Script>.
        // Once gtag.js has executed it stays resident on the page, so dropping the
        // tag from the tree leaves it running with whatever consent state it last
        // saw. Only this call actually revokes it. Guarded because gtag is absent
        // until the script has loaded at least once — i.e. for anyone who has
        // never granted consent, which is the common case.
        if (typeof window.gtag !== 'function') return;

        const state = analyticsGranted ? 'granted' : 'denied';
        window.gtag('consent', 'update', {
            ad_storage: state,
            ad_user_data: state,
            ad_personalization: state,
            analytics_storage: state,
        });
    }, [analyticsGranted]);

    // Never inside the embeddable widget — /embed-guide promises publishers it
    // loads no third-party scripts and sets no cookies. Consent given on this
    // site is also not consent from a third party's readers.
    if (isEmbed || !analyticsGranted) return null;

    return (
        <>
            <Script
                src="https://www.googletagmanager.com/gtag/js?id=AW-17927251983"
                strategy="afterInteractive"
            />
            <Script id="google-ads" strategy="afterInteractive">
                {`
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    gtag('js', new Date());
                    gtag('config', 'AW-17927251983');
                `}
            </Script>
            <Script id="google-ads-conversion" strategy="afterInteractive">
                {`gtag('event', 'ads_conversion_Sign_up_1', {});`}
            </Script>
            <Script id="google-ads-pageview" strategy="afterInteractive">
                {`gtag('event', 'conversion', {'send_to': 'AW-17927251983/1XdmCPrtgfIbEI_QsORC'});`}
            </Script>
            {/* Google AdSense was removed deliberately: surveillance display advertising
                contradicts this site's stated privacy position. Ad revenue comes from
                A-ADS, which is Bitcoin-native and does not track visitors. */}
        </>
    );
};
