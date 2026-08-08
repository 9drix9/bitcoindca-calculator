'use client';

import { useSyncExternalStore } from 'react';

/**
 * Dark-mode detection for anything that cannot express its colours in CSS —
 * chiefly Recharts, which takes stroke/fill as JS values rather than classes.
 *
 * Dark mode is class-based (`.dark` on <html>), so this observes that attribute
 * instead of `prefers-color-scheme`: the site's own theme toggle has to win over
 * the OS setting.
 *
 * The server snapshot is `false` on purpose. The theme class is applied by an
 * inline script before paint, and the server has no way to know it, so every
 * consumer must render its light-mode colours during SSR and let the first
 * client render correct them. Changing this would trip a hydration mismatch.
 */
const subscribe = (onChange: () => void): (() => void) => {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
};

const getSnapshot = (): boolean => document.documentElement.classList.contains('dark');

const getServerSnapshot = (): boolean => false;

export function useIsDark(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
