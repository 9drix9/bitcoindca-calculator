'use client';

import { reopenCookiePreferences } from './CookieConsent';

/**
 * Footer control that reopens the cookie banner so a visitor can change or
 * withdraw their choice. Without it there is no route back to the banner once a
 * choice is stored — see reopenCookiePreferences for why that matters.
 *
 * A button, not a Link: it changes state on this page rather than navigating.
 */
export function CookiePreferencesButton({ className }: { className?: string }) {
    return (
        <button type="button" onClick={reopenCookiePreferences} className={className}>
            Cookie preferences
        </button>
    );
}
