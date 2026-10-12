'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useBottomNavGone } from '@/hooks/useBottomNavGone';
import { useBottomOverlayHeight } from '@/hooks/useBottomOverlayHeight';
import { saveConsent, useConsentStatus, withdrawConsent } from '@/hooks/useConsent';

// Distinguishes the user-initiated reopen (which should receive focus) from
// the automatic first-visit appearance (which must not steal focus).
let reopenRequested = false;

// Where focus returns once a choice is made. The banner unmounts with focus
// inside it, and without a destination focus falls to <body>: a keyboard or
// screen-reader user is dropped out of the page they were in the middle of.
//
// reopenTrigger is the footer control that brought the banner back. It is taken
// from the click event rather than document.activeElement, because not every
// browser focuses a button when it is clicked. focusOrigin is whatever held
// focus before the keyboard walked into a banner nobody asked for (the
// first-visit case).
let reopenTrigger: HTMLElement | null = null;
let focusOrigin: HTMLElement | null = null;

/**
 * Withdraw consent and bring the banner back.
 *
 * GDPR Art. 7(3) requires withdrawing consent to be as easy as giving it. The
 * banner only rendered when consent was absent or stale, and nothing anywhere
 * cleared the key — so once a visitor chose, the choice was permanent and the
 * "manage your preferences at any time" line on /privacy was not true.
 *
 * withdrawConsent() puts the store back to "no answer on file" and announces it,
 * which is what makes this banner reappear and ConsentGatedScripts revoke the
 * Google tag and delete what it stored.
 */
export function reopenCookiePreferences(e?: { currentTarget: EventTarget | null }) {
    reopenTrigger = e?.currentTarget instanceof HTMLElement ? e.currentTarget : null;
    reopenRequested = true;
    withdrawConsent();
    // No answer was on file, so the banner is already on screen and nothing will
    // re-render to move focus. Do it here, or the control appears to do nothing.
    const banner = document.querySelector<HTMLElement>('[data-cookie-banner]');
    if (banner) {
        reopenRequested = false;
        banner.focus();
    }
}

function restoreFocus(banner: HTMLElement | null, viaKeyboard: boolean) {
    // A pointer never had a "place" in the page to return to, and focusOrigin
    // may be a text field: refocusing that on a phone would pop the keyboard.
    const target = reopenTrigger ?? (viaKeyboard ? focusOrigin : null);
    reopenTrigger = null;
    focusOrigin = null;
    if (!target?.isConnected) return;
    // Only when focus is about to be lost with the banner. If the visitor has
    // since moved somewhere else, leave them there.
    const active = document.activeElement;
    if (active && active !== document.body && !banner?.contains(active)) return;
    // A pointer user may have scrolled away from the footer link after reopening
    // the banner; focusing it without preventScroll yanks the page back down to
    // the footer. A keyboard user came from there and should see where focus went.
    target.focus({ preventScroll: !viaKeyboard });
}

export const CookieConsent = () => {
    // 'unknown' on the server and during hydration, so SSR renders nothing; the
    // banner appears right after hydration when there is no answer on file.
    const visible = useConsentStatus() === 'pending';
    // Without the tab bar its 76px clearance would be a dead gap under the banner.
    const bottomNavGone = useBottomNavGone();
    const bannerRef = useRef<HTMLDivElement>(null);
    // The banner has no dismiss control and stays until answered, so the page
    // has to scroll around it: see useBottomOverlayHeight.
    useBottomOverlayHeight(bannerRef, visible);

    useEffect(() => {
        if (visible && reopenRequested) {
            reopenRequested = false;
            bannerRef.current?.focus();
        }
    }, [visible]);

    const answer = (analytics: boolean, e: React.MouseEvent<HTMLButtonElement>) => {
        // Before saving: the save unmounts the banner, and by then it is too
        // late to tell whether focus was inside it. event.detail is 0 when the
        // click came from Enter or Space rather than a pointer.
        restoreFocus(bannerRef.current, e.detail === 0);
        saveConsent({ essential: true, analytics });
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
                    // data-bottom-overlay: globals.css takes the banner off screen
                    // while a field is being typed into on a short viewport, and
                    // DockedResult measures whatever carries it to sit above it.
                    data-bottom-overlay
                    data-cookie-banner
                    onFocus={(e) => {
                        const from = e.relatedTarget;
                        if (from instanceof HTMLElement && !e.currentTarget.contains(from)) focusOrigin = from;
                    }}
                    className={clsx(
                        'fixed left-0 right-0 z-50 outline-none p-3 sm:p-4 pl-[max(env(safe-area-inset-left),0.75rem)] pr-[max(env(safe-area-inset-right),0.75rem)] sm:pl-[max(env(safe-area-inset-left),1rem)] sm:pr-[max(env(safe-area-inset-right),1rem)] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]',
                        bottomNavGone
                            ? 'bottom-0 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:pb-[max(env(safe-area-inset-bottom),1rem)]'
                            : 'bottom-[calc(var(--bottom-nav-h)_+_max(env(safe-area-inset-bottom),12px))] md:bottom-0 md:pb-[max(env(safe-area-inset-bottom),1rem)]',
                    )}
                >
                    <div className="max-w-4xl mx-auto">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                            {/* Says what each button does, because the names do not.
                                The only thing the answer gates is the Google Ads
                                tag: the A-ADS slots and Vercel's cookieless stats
                                are not behind it, and no cookie exists before
                                "Accept All". The consent it passes covers ad
                                personalisation as well as measurement
                                (ConsentGatedScripts), so the sentence says so.

                                Length is deliberate: this wording is three lines
                                from 346px up and four on a 320px phone, which with
                                the tighter line height keeps the banner at 127px
                                on a 360px screen. Measure before adding a word. */}
                            <p className="flex-1 text-xs leading-snug sm:text-sm sm:leading-relaxed text-slate-600 dark:text-slate-300">
                                Accept All lets Google&apos;s ads tag set cookies, see pages you view and
                                personalise ads. Essential Only doesn&apos;t. Ads and cookieless stats load
                                either way.{' '}
                                {/* The ::after is the tap target: 46px tall around a
                                    15px line of text. It reaches up over the sentence
                                    (nothing there to tap) and stops inside the gap
                                    above the buttons, so it takes nothing from them.
                                    nowrap keeps the link one box for it to sit on. */}
                                <Link
                                    href="/privacy"
                                    className="relative whitespace-nowrap underline text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 after:absolute after:inset-x-0 after:-top-6 after:-bottom-1.5 after:content-['']"
                                >
                                    Privacy Policy
                                </Link>
                            </p>
                            {/* Equal halves of the row on a phone, so neither answer
                                is the bigger target (the transparent border on the
                                filled one is what makes the halves exact). h-11 at
                                every width, a mouse included: the globals.css button
                                floor only covers narrow screens and coarse pointers. */}
                            <div className="flex gap-2 sm:shrink-0">
                                <button
                                    onClick={(e) => answer(false, e)}
                                    className="flex-1 sm:flex-none h-11 px-4 py-2 text-xs sm:text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                    Essential Only
                                </button>
                                <button
                                    onClick={(e) => answer(true, e)}
                                    className="flex-1 sm:flex-none h-11 px-4 py-2 text-xs sm:text-sm font-medium rounded-lg border border-transparent bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors"
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
