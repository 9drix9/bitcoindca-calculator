import { formatUtc } from '@/utils/dates';

/**
 * For a source link that is the only thing on its line: a 44px touch target on
 * a phone or any touch screen, without a taller card. The negative margin
 * gives back what the height adds, so the text stays where it was. With a
 * mouse the link keeps the height of its text, so a click on the line above
 * it is not a click on the link.
 */
export const LONE_LINK_HIT_AREA =
    'inline-flex items-center max-sm:min-h-11 max-sm:-my-3.5 pointer-coarse:min-h-11 pointer-coarse:-my-3.5';

/**
 * The line a card shows when its figure is too old to pass as current (see
 * FigureView.old). `since` is when the figure was fetched, as a ms epoch; null
 * when the page did not say. The time is UTC, like every date on the site.
 */
export function StaleNote({ since }: { since: number | null }) {
    return (
        <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
            {since === null
                ? 'Could not refresh. This may be out of date.'
                : `Could not refresh. Last updated ${formatUtc(since, 'monthDay')}, ${new Date(since).toISOString().slice(11, 16)} UTC.`}
        </p>
    );
}
