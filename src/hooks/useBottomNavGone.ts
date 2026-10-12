'use client';

import { useSyncExternalStore } from 'react';
import { useKeyboardOpen } from './useKeyboardOpen';

/**
 * Must stay identical to the media query in globals.css that hides the fixed
 * bottom nav in phone landscape (a test compares the two). Anything that parks
 * itself on top of the nav needs to know when the nav is not there.
 */
export const NAV_HIDDEN_QUERY = '(max-width: 926px) and (max-height: 450px) and (orientation: landscape)';

function subscribe(onChange: () => void) {
    const mq = window.matchMedia(NAV_HIDDEN_QUERY);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
}

const getSnapshot = () => window.matchMedia(NAV_HIDDEN_QUERY).matches;
const getServerSnapshot = () => false;

/**
 * True while the mobile tab bar is not on screen: unmounted for the on-screen
 * keyboard, or hidden by CSS in phone landscape.
 *
 * The cookie banner and the install prompt both sit above the bar with a 76px
 * offset. When the bar is gone that offset is a hole with the page showing
 * through underneath, so both switch to the bottom edge instead.
 */
export function useBottomNavGone(): boolean {
    const keyboardOpen = useKeyboardOpen();
    const navHidden = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    return keyboardOpen || navHidden;
}
