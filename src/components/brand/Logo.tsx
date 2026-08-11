import clsx from 'clsx';

/**
 * The Ð — the site's single brand mark.
 *
 * A heavy geometric D (for DCA) wearing the ₿'s crown-and-tail stubs: the
 * monogram initials the product while the stubs carry the Bitcoin association
 * without borrowing the currency glyph itself.
 *
 * Three deliberate constraints, carried over from the previous mark:
 *
 * 1. It is DRAWN, never typed. A "Ð" text node would fall outside the Inter
 *    latin subset on some platforms and silently swap fonts per OS.
 * 2. It is one path using DEFAULT (nonzero) winding — the counter subpath winds
 *    opposite to the outer, so the hole needs no `fill-rule="evenodd"`. That
 *    matters because Satori (next/og) has patchy evenodd support; this geometry
 *    renders identically in browsers, sharp rasterisation, and OG images.
 * 3. It is containerless — bare geometry on transparent, coloured by
 *    `currentColor`. An amber disc is what every token logo on CoinGecko looks
 *    like and is indistinguishable in a tab strip.
 */

// Outer D: clockwise. Counter: counter-clockwise (punches the hole under the
// nonzero rule). Stubs: the ₿ crown (top) and tail (bottom).
const PATH_D = [
    'M4 3.5 A1.5 1.5 0 0 1 5.5 2 H11 A10 10 0 0 1 11 22 H5.5 A1.5 1.5 0 0 1 4 20.5 Z',
    'M8.6 6.6 V17.4 H11 A5.4 5.4 0 0 0 11 6.6 Z',
    'M9.2 0 H11.7 V2 H9.2 Z',
    'M9.2 22 H11.7 V24 H9.2 Z',
].join(' ');

/**
 * OG-image path. Same geometry — the mark deliberately needs no evenodd, so
 * the one path serves every renderer.
 */
export const BRAND_OG_PATH = PATH_D;

export function Logo({
    className,
    compact = false,
    title,
}: {
    className?: string;
    /** Kept for call-site compatibility — the monogram scales without variants. */
    compact?: boolean;
    /** Accessible name. Omit when a sibling wordmark already names the link. */
    title?: string;
}) {
    void compact;
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className={className}
            role={title ? 'img' : undefined}
            aria-hidden={title ? undefined : true}
            focusable="false"
        >
            {title && <title>{title}</title>}
            <path d={PATH_D} />
        </svg>
    );
}

/**
 * Mark + wordmark, as used in the header and footer.
 *
 * The wordmark is solid rather than gradient-clipped: `bg-clip-text` on a
 * gradient drops the text's real colour, so it fails contrast checks and
 * disappears entirely in forced-colors mode. The mark carries the brand colour.
 */
export function LogoLockup({
    className,
    markClassName,
    textClassName,
}: {
    className?: string;
    markClassName?: string;
    textClassName?: string;
}) {
    return (
        <span className={clsx('flex items-center gap-2', className)}>
            <Logo
                className={clsx(
                    'shrink-0 text-amber-700 dark:text-amber-400 transition-transform group-hover:scale-105',
                    markClassName ?? 'w-7 h-7',
                )}
            />
            <span
                className={clsx(
                    'font-bold text-slate-900 dark:text-white',
                    textClassName ?? 'text-xl',
                )}
            >
                Bitcoin DCA
            </span>
        </span>
    );
}
