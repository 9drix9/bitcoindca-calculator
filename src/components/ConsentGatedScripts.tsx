'use client';

import { useState, useEffect } from 'react';
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
        if (!analyticsGranted) return;

        window.gtag('consent', 'update', {
            ad_storage: 'granted',
            ad_user_data: 'granted',
            ad_personalization: 'granted',
            analytics_storage: 'granted',
        });
    }, [analyticsGranted]);

    if (!analyticsGranted) return null;

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
            <Script
                src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7196704678615727"
                crossOrigin="anonymous"
                strategy="afterInteractive"
            />
        </>
    );
};
