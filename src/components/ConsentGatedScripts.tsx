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

// Engagement conversion: at most once per browsing session, and only after a
// short dwell PLUS the visitor's first real interaction. It used to fire on
// every consented page load, which recorded plain pageviews as "conversions"
// and trained Smart Bidding on noise. (The Ads-side conversion action for this
// label is still named "Sign_up" — rename it there; the site has no sign-up.)
const CONVERSION_SESSION_KEY = 'ads-conversion-fired';
const CONVERSION_DWELL_MS = 10_000;
const CONVERSION_SEND_TO = 'AW-17927251983/1XdmCPrtgfIbEI_QsORC';

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

    useEffect(() => {
        if (isEmbed || !analyticsGranted) return;
        try {
            if (sessionStorage.getItem(CONVERSION_SESSION_KEY)) return;
        } catch {
            // No sessionStorage means no way to dedupe, so never fire.
            return;
        }

        let dwelled = false;
        let interacted = false;

        const fire = () => {
            if (!dwelled || !interacted) return;
            cleanup();
            try {
                sessionStorage.setItem(CONVERSION_SESSION_KEY, '1');
            } catch {
                return;
            }
            // Standard shim: if gtag.js hasn't finished loading yet, the event
            // queues on the dataLayer and is replayed when it does.
            window.dataLayer = window.dataLayer || [];
            if (typeof window.gtag !== 'function') {
                window.gtag = function gtag() {
                    // eslint-disable-next-line prefer-rest-params -- gtag.js only replays IArguments entries, not arrays
                    window.dataLayer.push(arguments);
                };
            }
            window.gtag('event', 'conversion', { send_to: CONVERSION_SEND_TO });
        };

        const onInteract = () => {
            interacted = true;
            fire();
        };
        const timer = window.setTimeout(() => {
            dwelled = true;
            fire();
        }, CONVERSION_DWELL_MS);

        const cleanup = () => {
            window.clearTimeout(timer);
            window.removeEventListener('pointerdown', onInteract);
            window.removeEventListener('keydown', onInteract);
        };

        window.addEventListener('pointerdown', onInteract, { once: true, passive: true });
        window.addEventListener('keydown', onInteract, { once: true });
        return cleanup;
    }, [isEmbed, analyticsGranted]);

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
            {/* Google AdSense was removed deliberately: surveillance display advertising
                contradicts this site's stated privacy position. Ad revenue comes from
                A-ADS, which is Bitcoin-native and does not track visitors. */}
        </>
    );
};
