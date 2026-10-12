'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { isEmbedPath } from '@/components/nav/navPathname';
import { readStorage, writeStorage } from '@/hooks/safeStorage';
import { clearGoogleAdsStorage, hasAnalyticsConsent, useAnalyticsConsent } from '@/hooks/useConsent';

declare global {
    interface Window {
        dataLayer: unknown[];
        gtag: (...args: unknown[]) => void;
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
    const isEmbed = isEmbedPath(usePathname() ?? '');
    const analyticsGranted = useAnalyticsConsent();
    // The consent state last sent to Google from this page. null = none yet.
    const lastSent = useRef<boolean | null>(null);

    useEffect(() => {
        // Nothing here belongs inside the embed: it is someone else's page, the
        // Google tag never loads there, and its storage is not ours to tidy.
        if (isEmbed) return;

        // Read the store, not the render value: the first commit after
        // hydration still carries the server snapshot (false) for a visitor who
        // has consented, and acting on that would tell Google "denied" and
        // delete a consenting visitor's ad-click ID on every page load.
        const granted = hasAnalyticsConsent();
        const before = lastSent.current;
        lastSent.current = granted;

        // layout.tsx defines gtag() and a default of "denied" for every visitor
        // before anything else runs, so there is nothing to tell Google until
        // the answer is yes, or stops being yes.
        //
        // Withdrawal has to push a denied update, not just unmount the <Script>.
        // Once gtag.js has executed it stays resident on the page, so dropping
        // the tag from the tree leaves it running with whatever consent state it
        // last saw. Only this call revokes it.
        if (granted !== before && (granted || before === true) && typeof window.gtag === 'function') {
            const state = granted ? 'granted' : 'denied';
            window.gtag('consent', 'update', {
                ad_storage: state,
                ad_user_data: state,
                ad_personalization: state,
                analytics_storage: state,
            });
        }

        // "Denied" only stops Google writing anything new. What its tag already
        // wrote on this origin is ours to remove — after the update above, so
        // the tag does not put it back. This also runs when a page loads with no
        // consent on file, which clears what an earlier withdrawal left behind
        // (one made before this cleanup existed, or in another tab). With
        // nothing stored it does nothing.
        if (!granted) clearGoogleAdsStorage();
    }, [analyticsGranted, isEmbed]);

    useEffect(() => {
        if (isEmbed || !analyticsGranted) return;
        if (readStorage('session', CONVERSION_SESSION_KEY)) return;

        let dwelled = false;
        let interacted = false;

        const fire = () => {
            if (!dwelled || !interacted) return;
            cleanup();
            // No sessionStorage means no way to dedupe, so never fire.
            if (!writeStorage('session', CONVERSION_SESSION_KEY, '1')) return;
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
            {/* This tag shows no ads; it measures the site's own Google Ads
                campaigns, and the consent passed above lets Google personalise
                ads from the visit as well. The display ads are A-ADS frames
                (AdSlot.tsx), which are not behind this gate and load whatever
                the answer was. What a frame loads and what A-ADS receives is
                set out on /privacy ("Third-Party Advertising") from a dated
                check; nothing about it is claimed here. */}
        </>
    );
};
