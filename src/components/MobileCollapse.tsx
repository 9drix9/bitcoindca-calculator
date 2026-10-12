'use client';

import { Children, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

// Must match the `lg:` classes below (Tailwind v4's `lg` is rem-based).
const LG_QUERY = '(min-width: 64rem)';

const subscribeToLg = (callback: () => void) => {
    const mq = window.matchMedia(LG_QUERY);
    mq.addEventListener('change', callback);
    return () => mq.removeEventListener('change', callback);
};
const getIsLg = () => window.matchMedia(LG_QUERY).matches;
// Server snapshot is true: SSR (and therefore the hydration render) always
// includes every child, and phones only unmount the extras after hydration.
const getServerIsLg = () => true;

/**
 * Shows only the first `previewCount` children on phones, with the rest behind
 * a toggle. Above `lg` every child is shown and the toggle disappears — on
 * desktop these live in a sticky sidebar where the length costs nothing.
 *
 * On mobile the sidebar is not a sidebar at all: it becomes ten full-width
 * cards appended after the article, which put the footer roughly a screen and a
 * half further away for anyone scrolling to the end.
 *
 * On phones the collapsed children are unmounted, not just `hidden`: they are
 * live widgets, and a card the user never opened would otherwise keep the
 * poll running at its own rate. Expanding remounts them. Each then shows the
 * newer of the figure the page was rendered with and what the cards' shared
 * poll has fetched since, and asks again when that is due (see
 * components/live/liveSidebar).
 * The `hidden lg:block` class still matters for the one render where the
 * matchMedia snapshot is not yet known (hydration).
 */
export function MobileCollapse({
    children,
    previewCount = 3,
    label,
}: {
    children: ReactNode;
    previewCount?: number;
    label: string;
}) {
    const [expanded, setExpanded] = useState(false);
    const isDesktop = useSyncExternalStore(subscribeToLg, getIsLg, getServerIsLg);
    const items = Children.toArray(children);
    const hiddenCount = Math.max(0, items.length - previewCount);

    // The toggle sits AFTER the items it reveals, so a keyboard or screen-reader
    // user who opens it is left on a button with the new content behind them,
    // and nothing says it has appeared. Focus moves to the first revealed item;
    // preventScroll, because a sighted reader's page should stay where it is.
    const firstRevealedRef = useRef<HTMLDivElement>(null);
    const justExpandedRef = useRef(false);
    useEffect(() => {
        if (!expanded || !justExpandedRef.current) return;
        justExpandedRef.current = false;
        firstRevealedRef.current?.focus({ preventScroll: true });
    }, [expanded]);

    return (
        <>
            {items.map((child, i) => {
                const collapsed = i >= previewCount && !expanded;
                if (collapsed && !isDesktop) return null;
                return (
                    <div
                        key={i}
                        ref={i === previewCount ? firstRevealedRef : undefined}
                        tabIndex={i === previewCount ? -1 : undefined}
                        className={clsx(collapsed && 'hidden lg:block')}
                    >
                        {child}
                    </div>
                );
            })}

            {hiddenCount > 0 && (
                <button
                    type="button"
                    onClick={() => {
                        justExpandedRef.current = !expanded;
                        setExpanded((v) => !v);
                    }}
                    aria-expanded={expanded}
                    className="lg:hidden w-full flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                    {expanded ? `Show fewer ${label}` : `Show ${hiddenCount} more ${label}`}
                    <ChevronDown
                        className={clsx('h-4 w-4 transition-transform', expanded && 'rotate-180')}
                        aria-hidden="true"
                    />
                </button>
            )}
        </>
    );
}
