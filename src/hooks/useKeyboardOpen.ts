'use client';

import { useSyncExternalStore } from 'react';

/**
 * True while an on-screen keyboard is (probably) covering the viewport.
 *
 * `interactive-widget=resizes-content` in the viewport meta fixes the layout on
 * modern Chrome, but it is not honoured everywhere — notably older Android
 * WebViews, Firefox Android, and iOS Safari, where the keyboard never resizes
 * the layout viewport at all. On those the fixed bottom bar floats up over the
 * page with a gap beneath it.
 *
 * Detection is a viewport-height delta rather than a focus check: focus alone
 * does not tell you whether a keyboard actually appeared (a Bluetooth keyboard,
 * a date picker, or a desktop browser at phone width all focus without one).
 */
const KEYBOARD_MIN_PX = 150;

const isOpen = (): boolean => {
    const vv = window.visualViewport;
    if (!vv) return false;

    // Pinch-zoom is NOT a keyboard. On Chromium `innerHeight` tracks the layout
    // viewport and ignores zoom, while `visualViewport.height` is divided by the
    // scale — so at ~1.22x zoom the height delta alone crosses the threshold and
    // the entire bottom bar unmounts, taking the only way to open the More drawer
    // with it. Bail out whenever the user is zoomed.
    if (vv.scale > 1.05) return false;

    // On iOS the visual viewport also shrinks as the toolbar expands, which is
    // only ~60-80px — well under this threshold.
    return window.innerHeight - vv.height > KEYBOARD_MIN_PX;
};

const subscribe = (onChange: () => void) => {
    const vv = window.visualViewport;
    if (!vv) return () => {};
    vv.addEventListener('resize', onChange);
    vv.addEventListener('scroll', onChange);
    return () => {
        vv.removeEventListener('resize', onChange);
        vv.removeEventListener('scroll', onChange);
    };
};

export const useKeyboardOpen = (): boolean =>
    useSyncExternalStore(subscribe, isOpen, () => false);
