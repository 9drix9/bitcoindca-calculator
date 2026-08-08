import { ReactNode } from 'react';
import clsx from 'clsx';

// The single card language for the whole site (see DESIGN_SPEC §1).
// Widgets and panels compose these instead of restating utility soups.

export function Card({
    children,
    className,
    celebrated = false,
}: {
    children: ReactNode;
    className?: string;
    celebrated?: boolean;
}) {
    return (
        <div
            className={clsx(
                'rounded-2xl border transition-shadow',
                celebrated
                    // The accent is an EDGE, not a wash. This was a gradient from
                    // amber-50 to white — a 1.04:1 tint that read as banding rather
                    // than emphasis, and vanished entirely on dark. A 3px inset rule
                    // at amber-600/amber-500 clears the 3:1 graphic floor in both
                    // themes and says "this is the answer" without tinting the
                    // surface the numbers sit on.
                    ? 'bg-white dark:bg-slate-900 border-[var(--hairline)] shadow-[var(--accent-rule),var(--elev-2)]'
                    // dark:shadow-none is deliberately GONE: a slate-900 card on a
                    // slate-950 page is 1.13:1, so with no shadow the ten stacked
                    // sidebar widgets read as one undifferentiated wireframe column.
                    : 'bg-white dark:bg-slate-900 border-[var(--hairline)] shadow-[var(--elev-1)]',
                className,
            )}
        >
            {children}
        </div>
    );
}

export function CardHeader({
    icon,
    title,
    subtitle,
    action,
    className,
}: {
    icon?: ReactNode;
    title: ReactNode;
    subtitle?: ReactNode;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div className={clsx('flex items-start justify-between gap-3', className)}>
            <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-100">
                    {icon && <span className="text-amber-500 shrink-0" aria-hidden="true">{icon}</span>}
                    <span className="truncate">{title}</span>
                </h3>
                {subtitle && <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}

/**
 * One chip language for the whole site.
 *
 * There were three incompatible pill styles, and one collision actively misled:
 * the fee chip's SELECTED state was byte-for-byte the preset chip's RESTING
 * state, so a user who had learned "amber-tinted pill = not selected" from the
 * preset row read the selected exchange as unselected 200px lower.
 *
 * The rule now: SOLID amber means selected. Everything else is a neutral
 * outline. No tinted middle ground.
 */
export const chipBase =
    'inline-flex items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 ' +
    'text-2xs font-medium transition-colors min-h-[28px] whitespace-nowrap';

export const chipRest =
    'bg-white text-slate-700 border-[var(--hairline-strong)] hover:bg-slate-50 ' +
    'dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';

/** slate-950 on amber-500 = 9.39:1. Never white on amber (2.15:1). */
export const chipSelected = 'bg-amber-500 text-slate-950 border-amber-500 hover:bg-amber-400';

export const chip = (selected: boolean): string =>
    `${chipBase} ${selected ? chipSelected : chipRest}`;

/**
 * The absence of a value, rendered as such.
 *
 * Thirteen widgets each rendered a bare `<p>Data unavailable</p>` inside a card
 * otherwise full of figures, with no boundary — so it read as a value rather
 * than as the lack of one. A dashed rule and a muted, centred block says "there
 * is nothing here" at a glance, which is what the calculator's own failure state
 * already did well.
 */
export function EmptyState({
    children = 'Data unavailable',
    hint,
    className,
}: {
    children?: ReactNode;
    /** Optional second line: why, or what to try. */
    hint?: ReactNode;
    className?: string;
}) {
    return (
        <div
            role="status"
            className={clsx(
                'flex flex-col items-center justify-center gap-0.5 rounded-[var(--r-nested,0.75rem)]',
                'border border-dashed border-[var(--hairline-strong)] px-3 py-4 text-center',
                className,
            )}
        >
            <span className="text-2xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {children}
            </span>
            {hint && <span className="text-2xs text-slate-400 dark:text-slate-500">{hint}</span>}
        </div>
    );
}

/** Muted label / tabular value row used inside widget cards. */
export function StatRow({ label, value, valueClassName }: { label: ReactNode; value: ReactNode; valueClassName?: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-slate-500 dark:text-slate-400">{label}</span>
            <span className={clsx('font-medium text-slate-800 dark:text-slate-100 tabular-nums text-right', valueClassName)}>{value}</span>
        </div>
    );
}
