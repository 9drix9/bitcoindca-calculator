'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Publishes the height of a bottom-fixed overlay (the cookie banner, the
 * install prompt) as `--bottom-overlay-h` on <html> for as long as it is shown.
 *
 * globals.css adds that variable to the page's scroll-padding-bottom and to the
 * footer's clearance. Without it the browser believes the strip behind the
 * overlay is visible: a field focused there is not scrolled into view and gets
 * typed into blind, and the last lines of the footer can never be reached.
 *
 * A measured value, not a constant: the banner is a different height at every
 * width, and it is zero wherever CSS hides it (/embed, or while a field is being
 * typed into on a short screen).
 *
 * The two overlays never show at once (the prompt waits for the consent answer),
 * so they can share the one variable.
 */
export function useBottomOverlayHeight(ref: RefObject<HTMLElement | null>, shown: boolean): void {
    useEffect(() => {
        const el = ref.current;
        if (!shown || !el) return;
        const root = document.documentElement;
        const publish = () => root.style.setProperty('--bottom-overlay-h', `${el.offsetHeight}px`);
        publish();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
        // border-box: the safe-area padding changes when the overlay moves
        // between "above the tab bar" and "on the bottom edge", and a
        // content-box observer would not notice.
        observer?.observe(el, { box: 'border-box' });
        return () => {
            observer?.disconnect();
            root.style.removeProperty('--bottom-overlay-h');
        };
    }, [ref, shown]);
}
