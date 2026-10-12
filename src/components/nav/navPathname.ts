/**
 * The pathname the navigation compares against, made identical on the server
 * and in the browser.
 *
 * `/` is an ISR page. When Vercel regenerates it, the render is invoked with the
 * request path `/index` (the flight payload carries `"c":["","index"]`), so on
 * the server `usePathname()` returns '/index', while the browser builds its
 * router state from `window.location` and gets '/'. A comparison against the
 * raw value therefore comes out differently on each side: the nav markup
 * differs, hydration fails (React error #418) and the whole page is rebuilt on
 * the client, server-rendered ad iframes included. It cannot be reproduced
 * under `next start`, where the regeneration renders with '/'.
 *
 * Exact match only. No route lives at /index (it 404s locally and Vercel serves
 * the home page for it), so mapping it to '/' is right on both sides.
 *
 * `null` is what usePathname returns before a Pages Router is ready. There is no
 * pages directory here, but a string return keeps every caller free of `?.`.
 */
export function normalizeNavPathname(pathname: string | null | undefined): string {
    if (!pathname || pathname === '/index') return '/';
    return pathname;
}

/**
 * The embeddable widget, which renders inside third-party pages with no site
 * chrome. Exact segment match: /embed-guide is a normal page.
 */
export function isEmbedPath(pathname: string): boolean {
    return pathname === '/embed' || pathname.startsWith('/embed/');
}

/**
 * A click that navigates in this tab. Anything else (a middle click, or one
 * with a modifier held) opens the link somewhere else and is the browser's to
 * handle.
 */
export function isPlainClick(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
    return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
