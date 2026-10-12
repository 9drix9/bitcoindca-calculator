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

/** The sizes the answer is read from. `viewport` is `window.visualViewport`. */
export interface ViewportReading {
    innerWidth: number;
    innerHeight: number;
    viewport: { width: number; height: number; scale: number } | null | undefined;
}

/** The decision itself, with no `window` in it, so it can be tested with numbers measured on a real page. */
export function keyboardLooksOpen({ innerWidth, innerHeight, viewport: vv }: ViewportReading): boolean {
    if (!vv) return false;

    // Pinch-zoom is NOT a keyboard. On Chromium `innerHeight` tracks the layout
    // viewport and ignores zoom, while `visualViewport.height` is divided by the
    // scale — so at ~1.22x zoom the height delta alone crosses the threshold and
    // the entire bottom bar unmounts, taking the only way to open the More drawer
    // with it. Bail out whenever the user is zoomed.
    if (vv.scale > 1.05) return false;

    // Neither is a page that is wider than the screen. A keyboard takes height
    // and leaves width alone; when the layout viewport is also WIDER than the
    // visual one, a mobile browser has stretched it to fit some overflowing
    // element, and `innerHeight` is stretched by the same factor. A 390x844
    // phone on a page 623px across reports innerHeight 1347: a 503px
    // "keyboard" on every load, and no tab bar. Taking the factor back out
    // leaves the real difference. On a page that fits, the factor is exactly 1.
    const stretch = vv.width > 0 ? Math.max(1, innerWidth / vv.width) : 1;

    // On iOS the visual viewport also shrinks as the toolbar expands, which is
    // only ~60-80px — well under this threshold.
    return innerHeight / stretch - vv.height > KEYBOARD_MIN_PX;
}

const isOpen = (): boolean =>
    keyboardLooksOpen({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        viewport: window.visualViewport,
    });

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
