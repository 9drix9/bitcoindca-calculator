'use client';

import { useSyncExternalStore } from 'react';
import { readStorage, removeStorage, storageKeys, writeStorage } from './safeStorage';

/**
 * The one place the cookie-consent answer is read, written and withdrawn.
 *
 * The banner, the Google tag gate and the install prompt all read it from
 * here, so the banner being gone, the tag being allowed and the prompt being
 * free to appear are always the same fact, including for a choice that could
 * not be stored.
 */
export interface ConsentChoice {
    essential?: boolean;
    analytics?: boolean;
}

/**
 * 'unknown' is the server render and the hydration pass, where storage cannot be
 * read: nothing consent-dependent may render yet. 'pending' means the visitor has
 * not answered (or the stored answer predates the analytics flag) and the banner
 * is owed. 'resolved' means there is an answer either way.
 */
export type ConsentStatus = 'unknown' | 'pending' | 'resolved';

export const CONSENT_KEY = 'cookie-consent';

// A choice that could not be written (storage blocked, quota full) is kept for
// the life of the page instead of being dropped. Without it the banner has no
// way to go away: the key never appears, and a fixed bar sits over the page for
// good. It is honoured exactly like a stored choice — the visitor did answer —
// and asked again on the next full page load, because nothing remembers it.
let memoryConsent: ConsentChoice | null = null;

export function readConsent(): ConsentChoice | null {
    if (memoryConsent) return memoryConsent;
    const raw = readStorage('local', CONSENT_KEY);
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object') return null;
        // Only a boolean is an answer. Whatever else sits under these names is
        // left out, so the type is true of the value.
        const { essential, analytics } = parsed as Record<string, unknown>;
        const choice: ConsentChoice = {};
        if (typeof essential === 'boolean') choice.essential = essential;
        if (typeof analytics === 'boolean') choice.analytics = analytics;
        return choice;
    } catch {
        return null;
    }
}

// The same event a write in another tab produces, so one listener covers a
// choice made here and one made elsewhere.
function announce() {
    window.dispatchEvent(new StorageEvent('storage', { key: CONSENT_KEY }));
}

export function saveConsent(choice: ConsentChoice): void {
    memoryConsent = writeStorage('local', CONSENT_KEY, JSON.stringify(choice)) ? null : choice;
    announce();
}

/** Back to "no answer on file". Clears the in-memory copy too, or a blocked-storage visitor could never withdraw. */
export function withdrawConsent(): void {
    memoryConsent = null;
    removeStorage('local', CONSENT_KEY);
    announce();
}

export function subscribeConsent(onChange: () => void): () => void {
    // key === null is storage.clear(), which removes the answer as well.
    const onStorage = (e: StorageEvent) => {
        if (e.key === CONSENT_KEY || e.key === null) onChange();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
}

const getStatus = (): ConsentStatus =>
    typeof readConsent()?.analytics === 'boolean' ? 'resolved' : 'pending';
const getServerStatus = (): ConsentStatus => 'unknown';

export function useConsentStatus(): ConsentStatus {
    return useSyncExternalStore(subscribeConsent, getStatus, getServerStatus);
}

/** True only for an explicit "Accept All". Read from the store, so it is right on the first client render. */
export const hasAnalyticsConsent = (): boolean => readConsent()?.analytics === true;
const noAnalyticsConsent = (): boolean => false;

export function useAnalyticsConsent(): boolean {
    return useSyncExternalStore(subscribeConsent, hasAnalyticsConsent, noAnalyticsConsent);
}

// ── What Google's tag leaves behind ──────────────────────────────────────────

// Google's own cookie list (business.safety.google/adscookies, read 2026-10-12)
// names the first-party cookies its ads tags set "from partner domain": the
// _gcl_* family and _gac_*. On this site a consenting visit was observed to
// write _gcl_au, plus _gcl_aw after an ad click, and a localStorage entry
// _gcl_ls. The same prefixes cover all of them.
const GOOGLE_ADS_NAME = /^_g(?:cl|ac)_/;

/** Names of Google Ads first-party cookies present in a `document.cookie` string. */
export function googleAdsCookieNames(cookieHeader: string): string[] {
    return cookieHeader
        .split(';')
        .map((pair) => pair.split('=')[0].trim())
        .filter((name) => GOOGLE_ADS_NAME.test(name));
}

/**
 * `Domain` values a cookie on this host may have been written with.
 *
 * A cookie can only be expired with the same Domain it was set with. gtag writes
 * to the registrable domain (.btcdollarcostaverage.com) in production but
 * host-only on localhost, and it cannot be asked which it used — so every
 * candidate is tried, alongside the host-only form the caller adds. A browser
 * ignores an attempt on a public suffix, so over-trying is harmless.
 */
export function cookieDomainCandidates(hostname: string): string[] {
    // No Domain attribute is valid for an IP address or a single-label host.
    if (!hostname || hostname.includes(':') || /^[\d.]+$/.test(hostname)) return [];
    const labels = hostname.split('.').filter(Boolean);
    const candidates: string[] = [];
    for (let i = 0; i + 2 <= labels.length; i++) {
        candidates.push(labels.slice(i).join('.'));
    }
    return candidates;
}

/**
 * Remove what the Google tag stored on this origin.
 *
 * Denying consent only stops Google's tag writing anything NEW; the identifier
 * it already wrote stays for up to 90 days unless the site deletes it. So
 * withdrawing has to clear it too.
 *
 * Only first-party storage can be reached from here. Google's own cookies on
 * google.com and doubleclick.net are out of this page's reach and stay until
 * they expire or the visitor clears them — /privacy has to say so.
 */
export function clearGoogleAdsStorage(): void {
    try {
        const expired = 'expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; path=/';
        const domains = cookieDomainCandidates(window.location.hostname);
        for (const name of googleAdsCookieNames(document.cookie)) {
            document.cookie = `${name}=; ${expired}`;
            for (const domain of domains) {
                document.cookie = `${name}=; ${expired}; domain=${domain}`;
            }
        }
    } catch {
        // document.cookie throws in sandboxed frames: there is nothing to reach.
    }
    for (const key of storageKeys('local')) {
        if (GOOGLE_ADS_NAME.test(key)) removeStorage('local', key);
    }
}
