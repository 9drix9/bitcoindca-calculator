'use client';

import { useEffect } from 'react';

const SCROLL_BOX = '.overflow-x-auto';
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
const OURS = 'data-scroll-tabstop';

/**
 * Makes a box that scrolls sideways reachable from the keyboard.
 *
 * Once focused, the arrow keys scroll it; without a tab stop a keyboard user
 * cannot read the columns that are off screen. Chrome and Firefox give such a
 * box a tab stop themselves when nothing inside it takes focus. Safari does
 * not, so this does the same thing by hand.
 *
 * Checked on each Tab press, not kept up to date: whether a box overflows
 * changes with the window and with what the calculator has rendered, and the
 * only moment the answer matters is just before focus moves.
 */
export function ScrollBoxTabStops() {
    useEffect(() => {
        const sync = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;
            for (const box of document.querySelectorAll<HTMLElement>(SCROLL_BOX)) {
                const ours = box.hasAttribute(OURS);
                const needsStop = box.scrollWidth > box.clientWidth && !box.querySelector(TABBABLE);
                if (needsStop && !box.hasAttribute('tabindex')) {
                    box.tabIndex = 0;
                    box.setAttribute(OURS, '');
                } else if (!needsStop && ours && document.activeElement !== box) {
                    // Not while it holds focus: Tab would then start again
                    // from the top of the page.
                    box.removeAttribute('tabindex');
                    box.removeAttribute(OURS);
                }
            }
        };
        // Capture, so it runs before the browser works out where Tab goes.
        document.addEventListener('keydown', sync, true);
        return () => document.removeEventListener('keydown', sync, true);
    }, []);

    return null;
}
