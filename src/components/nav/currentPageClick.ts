import type { MouseEvent } from 'react';
import { isPlainClick } from './navPathname';

/**
 * onClick for a nav link that points at the page already on screen: scroll to
 * the top and leave the address alone.
 *
 * Navigating would replace the address with the bare path. On the home page
 * the query string is the calculator's plan, so the address bar would read "/"
 * under a plan that had not changed, with a second history entry for the same
 * page.
 */
export function scrollToTopInstead(e: MouseEvent<HTMLAnchorElement>): void {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    window.scrollTo({ top: 0 });
}
