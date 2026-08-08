'use client';

import { Children, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

/**
 * Shows only the first `previewCount` children on phones, with the rest behind
 * a toggle. Above `lg` every child is shown and the toggle disappears — on
 * desktop these live in a sticky sidebar where the length costs nothing.
 *
 * On mobile the sidebar is not a sidebar at all: it becomes ten full-width
 * cards appended after the article, which put the footer roughly a screen and a
 * half further away for anyone scrolling to the end.
 *
 * The hidden children are still rendered, just `hidden` — they are server-
 * rendered widgets with live data, and unmounting them would throw that away
 * and re-request it on expand.
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
    const items = Children.toArray(children);
    const hiddenCount = Math.max(0, items.length - previewCount);

    return (
        <>
            {items.map((child, i) => (
                <div
                    key={i}
                    className={clsx(i >= previewCount && !expanded && 'hidden lg:block')}
                >
                    {child}
                </div>
            ))}

            {hiddenCount > 0 && (
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    className="lg:hidden w-full flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
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
