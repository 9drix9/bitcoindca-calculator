'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { useConsentStatus } from '@/hooks/useConsent';

interface DockedResultProps {
    /** The form card. The bar is only offered while part of it is on screen. */
    formRef: RefObject<HTMLElement | null>;
    /** The headline figure in the results. The bar steps aside once it is on screen. */
    figureRef: RefObject<HTMLElement | null>;
    /** False when there is no headline figure to repeat, or none that the form as it stands will keep (see the call site). */
    available: boolean;
    /** What the figure is: "Worth today", "Projected". */
    label: string;
    /** The headline figure, formatted. */
    value: string;
    /** The return beside it: "+94.9%". */
    change: string;
    changeClassName?: string;
    /** The assumption a bare figure would hide: "after 0.5% fee". */
    note: string;
    /** True while the figure is for an earlier set of inputs and its replacement is on the way. */
    dimmed?: boolean;
}

/**
 * Fixed chrome at the bottom of the screen: the mobile tab bar, which the bar
 * sits above, and an overlay (the cookie banner, the install prompt), which it
 * gives way to. Measured, not assumed: the tab bar is unmounted for the
 * on-screen keyboard and hidden in phone landscape, and an overlay is hidden
 * while a field is typed into on a short screen.
 */
const BOTTOM_CHROME = 'nav[aria-label="Main navigation"], [data-bottom-overlay]';
/** The bar's own height and the gap under it, in px (h-11 + mb-2). */
const BAR_SPACE = 52;
/** The sticky header covers this much of the top of the screen. */
const TOP_CLEARANCE = 64;

/**
 * The headline answer, docked above the tab bar on phones.
 *
 * On a phone the form and its result do not fit on one screen: changing the
 * amount means scrolling down to see what it did, then back up to change it
 * again. While any of the form is on screen and the headline figure is not,
 * this repeats the figure in one row; tapping it goes to the full result.
 *
 * It is never on screen together with the figure it repeats, and so never over
 * an ad either: both ad slots in the results sit below that figure.
 *
 * It also waits for the cookie banner to be answered, and steps aside for the
 * install prompt. Either one (70 to 120px) and the tab bar (76px) are already
 * fixed to the bottom of the screen, and this bar on top of them leaves a
 * phone about 250px of chrome. Until the banner is answered the sentence
 * under the page title states the answer, for as long as the form holds the
 * plan the page opens on (see HeroProofLine).
 *
 * Not a live region. The calculator already announces every result once, and
 * a second announcement of the same number on each keystroke would bury it.
 */
export function DockedResult({ formRef, figureRef, available, label, value, change, changeClassName, note, dimmed }: DockedResultProps) {
    const dockRef = useRef<HTMLDivElement>(null);
    const edgeRef = useRef<HTMLSpanElement>(null);
    const remeasureRef = useRef<(() => void) | null>(null);
    const [inPlace, setInPlace] = useState(false);
    // The same store the banner reads, so "the banner is gone" and "the bar may
    // show" are one fact. 'unknown' (the server render and hydration) counts as
    // not answered: the banner may be about to appear.
    const consentAnswered = useConsentStatus() === 'resolved';

    useEffect(() => {
        const form = formRef.current;
        const dock = dockRef.current;
        const edge = edgeRef.current;
        if (!form || !dock || !edge) return;

        let frame = 0;
        const measure = () => {
            frame = 0;
            // md and up the bar is display:none, and there is nothing to place.
            if (dock.getClientRects().length === 0) {
                setInPlace(false);
                return;
            }
            // The bottom of the layout viewport, which is what `position: fixed`
            // is placed against. Read off an element pinned there rather than
            // window.innerHeight, which browsers disagree about under a keyboard.
            const layoutBottom = edge.getBoundingClientRect().bottom;
            let floor = layoutBottom;
            let viewTop = 0;
            const viewport = window.visualViewport;
            // An on-screen keyboard that does not resize the page (iOS Safari)
            // shrinks only the visual viewport: without this the bar would sit
            // behind the keyboard exactly when a number is being typed. Left
            // alone under pinch-zoom, where the two differ for another reason.
            if (viewport && viewport.scale <= 1.05) {
                floor = Math.min(floor, viewport.offsetTop + viewport.height);
                viewTop = viewport.offsetTop;
            }
            const lowerHalf = viewTop + (floor - viewTop) / 2;
            let overlayShowing = false;
            document.querySelectorAll<HTMLElement>(BOTTOM_CHROME).forEach((chrome) => {
                const rect = chrome.getBoundingClientRect();
                if (!(rect.height > 0 && rect.top > lowerHalf)) return;
                floor = Math.min(floor, rect.top);
                if (chrome.hasAttribute('data-bottom-overlay')) overlayShowing = true;
            });

            const lift = Math.max(0, layoutBottom - floor);
            dock.style.bottom = `${lift}px`;
            // Resting on the screen edge itself (phone landscape): clear the home indicator.
            dock.style.paddingBottom = lift === 0 ? 'env(safe-area-inset-bottom)' : '0px';

            // Judged against fixed lines, whether or not the bar is showing, so
            // showing it cannot change the answer and make it flicker. The
            // figure counts as on screen once half of it has cleared the tab
            // bar: from there on the bar would only be covering the number it
            // repeats.
            const formRect = form.getBoundingClientRect();
            const formOnScreen = formRect.bottom > viewTop + TOP_CLEARANCE && formRect.top < floor - BAR_SPACE;
            const figureRect = figureRef.current?.getBoundingClientRect();
            const figureOnScreen = figureRect !== undefined
                && figureRect.height > 0
                && figureRect.bottom > viewTop + TOP_CLEARANCE
                && figureRect.top + figureRect.height / 2 <= floor;
            setInPlace(formOnScreen && !figureOnScreen && !overlayShowing);
        };
        const schedule = () => {
            if (frame === 0) frame = requestAnimationFrame(measure);
        };
        remeasureRef.current = schedule;

        const viewport = window.visualViewport;
        let listening = false;
        const listen = () => {
            if (listening) return;
            listening = true;
            window.addEventListener('scroll', schedule, { passive: true });
            window.addEventListener('resize', schedule);
            viewport?.addEventListener('resize', schedule);
            viewport?.addEventListener('scroll', schedule);
        };
        const unlisten = () => {
            if (!listening) return;
            listening = false;
            window.removeEventListener('scroll', schedule);
            window.removeEventListener('resize', schedule);
            viewport?.removeEventListener('resize', schedule);
            viewport?.removeEventListener('scroll', schedule);
        };

        // Scrolling is only watched while the form is on screen. Anywhere else
        // on this long page the bar is hidden whatever the scroll position is.
        const formWatcher = typeof IntersectionObserver === 'undefined'
            ? null
            : new IntersectionObserver(([entry]) => {
                if (entry.isIntersecting) {
                    listen();
                    schedule();
                } else {
                    unlisten();
                    setInPlace(false);
                }
            });
        if (formWatcher) formWatcher.observe(form);
        else listen();

        // The form changes height without a scroll (the folded fields open),
        // and an overlay comes or goes without one: each sets or clears a
        // style on <html> as it does (useBottomOverlayHeight).
        const sizeWatcher = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
        sizeWatcher?.observe(form);
        const chromeWatcher = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule);
        chromeWatcher?.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

        schedule();
        return () => {
            remeasureRef.current = null;
            if (frame !== 0) cancelAnimationFrame(frame);
            unlisten();
            formWatcher?.disconnect();
            sizeWatcher?.disconnect();
            chromeWatcher?.disconnect();
        };
    }, [formRef, figureRef]);

    // The results mount, unmount and reflow as the calculator renders, none of
    // which scrolls the page. Checking again after each render costs one frame.
    useEffect(() => {
        remeasureRef.current?.();
    });

    const goToResult = () => {
        const figure = figureRef.current;
        if (!figure) return;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        figure.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
        // Focus follows: this button is removed once the figure is on screen,
        // and leaving focus on a removed element drops it to the top of the
        // page. Moving it off the field also closes the on-screen keyboard.
        figure.focus({ preventScroll: true });
    };

    return (
        <>
            <span ref={edgeRef} aria-hidden="true" className="pointer-events-none fixed bottom-0 left-0 m-0 h-0 w-0" />
            {/* m-0: the calculator spaces its sections with margins, and a margin
                on a fixed element moves it off the edge it is pinned to. */}
            <div
                ref={dockRef}
                className="pointer-events-none fixed inset-x-0 z-40 m-0 md:hidden"
                style={{ bottom: 'calc(var(--bottom-nav-h, 64px) + max(env(safe-area-inset-bottom), 12px))' }}
            >
                {available && inPlace && consentAnswered && (
                    <button
                        type="button"
                        onClick={goToResult}
                        aria-label={`${label}: ${value}, ${change}, ${note}. Go to the full result.`}
                        className="fade-in pointer-events-auto mx-3 mb-2 flex h-11 w-[calc(100%-1.5rem)] items-center gap-2 rounded-xl border border-[var(--hairline-strong)] bg-white px-3 text-left shadow-[var(--elev-2)] dark:bg-slate-800"
                    >
                        <span className={clsx('min-w-0 flex-1 transition-opacity', dimmed && 'opacity-60')}>
                            <span className="block truncate text-[11px] leading-4 text-slate-600 dark:text-slate-300">
                                <span className="font-medium uppercase tracking-wider">{label}</span>
                                {' · '}
                                {note}
                            </span>
                            {/* leading-5 on each span: text-base and text-sm bring
                                their own line height, and the row has 44px to fit in. */}
                            <span className="flex items-baseline gap-2 tabular-nums">
                                <span className="text-base leading-5 font-bold text-slate-900 dark:text-[var(--text-strong)]">{value}</span>
                                <span className={clsx('text-sm leading-5 font-semibold', changeClassName)}>{change}</span>
                            </span>
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                    </button>
                )}
            </div>
        </>
    );
}
