import clsx from 'clsx';

/**
 * The Sat Ladder — the site's single brand mark.
 *
 * Four rounded columns on a shared baseline, ascending left to right, with two
 * horizontal rails knocked through the tall ones. The columns are the repeated
 * fixed buy, the rising heights are accumulation, and the two rails give it the
 * ₿'s double-bar silhouette without borrowing the currency's logo outright.
 *
 * Three deliberate constraints:
 *
 * 1. It is DRAWN, never typed. The old mark was a "₿" text node, and U+20BF is
 *    outside the Inter latin subset the site loads, so it silently fell back to
 *    a system font on every surface — different shape per OS, missing glyph on
 *    some Android builds.
 * 2. It is ONE `fill-rule="evenodd"` path, not a <mask>. Masks need an id, and
 *    this renders twice per page (nav + footer); a single path also survives
 *    rasterisation to .ico/.png without a masking step.
 * 3. It is containerless — bare geometry on transparent, coloured by
 *    `currentColor`. An amber disc is what every token logo on CoinGecko looks
 *    like and is indistinguishable in a tab strip.
 */

type Rect = { x: number; y: number; w: number; h: number };

/** Rounded-rect subpath. */
function bar({ x, y, w, h }: Rect, r: number): string {
    return [
        `M${x + r} ${y}`,
        `H${x + w - r}`,
        `A${r} ${r} 0 0 1 ${x + w} ${y + r}`,
        `V${y + h - r}`,
        `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
        `H${x + r}`,
        `A${r} ${r} 0 0 1 ${x} ${y + h - r}`,
        `V${y + r}`,
        `A${r} ${r} 0 0 1 ${x + r} ${y}`,
        'Z',
    ].join(' ');
}

/** Square subpath — punched out of the bars by the evenodd fill rule. */
const slot = ({ x, y, w, h }: Rect): string =>
    `M${x} ${y} H${x + w} V${y + h} H${x} Z`;

// Baseline y=23, 1 unit of margin inside a 24x24 box. Column tops are chosen so
// no rail ever clips a column at a grazing angle and leaves a sub-pixel sliver.
const COLUMNS: Rect[] = [
    { x: 1, y: 17, w: 4, h: 6 },
    { x: 7, y: 12, w: 4, h: 11 },
    { x: 13, y: 6, w: 4, h: 17 },
    { x: 19, y: 1, w: 4, h: 22 },
];

// Rails are cut only where a column actually stands, so the gaps between
// columns stay empty and the mark never reads as a grid.
const SLOTS: Rect[] = [
    { x: 13, y: 9, w: 4, h: 2 },
    { x: 19, y: 9, w: 4, h: 2 },
    { x: 7, y: 15, w: 4, h: 2 },
    { x: 13, y: 15, w: 4, h: 2 },
    { x: 19, y: 15, w: 4, h: 2 },
];

const RADIUS = 1.6;

/** Full mark: columns with the ₿ rails knocked through. */
const PATH_FULL = [...COLUMNS.map((c) => bar(c, RADIUS)), ...SLOTS.map(slot)].join(' ');

/**
 * Small-size mark: rails dropped. At 16-32px a 2-unit rail renders around one
 * physical pixel and aliases into grey mush, taking the whole silhouette with
 * it. Four clean columns still read unmistakably as a rising stack.
 */
const PATH_COMPACT = COLUMNS.map((c) => bar(c, RADIUS)).join(' ');

/**
 * Rail-free mark for OG image generation. Satori (next/og) has patchy
 * `fill-rule="evenodd"` support, and a silently-ignored evenodd would fill the
 * knocked-out rails and ship a solid blob to every social unfurl. The compact
 * geometry needs no fill rule at all, so it renders identically everywhere.
 */
export const SAT_LADDER_OG_PATH = PATH_COMPACT;

export function Logo({
    className,
    compact = false,
    title,
}: {
    className?: string;
    /** Drop the rails. Use at 32px and below. */
    compact?: boolean;
    /** Accessible name. Omit when a sibling wordmark already names the link. */
    title?: string;
}) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            fillRule="evenodd"
            className={className}
            role={title ? 'img' : undefined}
            aria-hidden={title ? undefined : true}
            focusable="false"
        >
            {title && <title>{title}</title>}
            <path d={compact ? PATH_COMPACT : PATH_FULL} />
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
