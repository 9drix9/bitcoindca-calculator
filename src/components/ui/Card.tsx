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
                    ? 'border-amber-500/30 dark:border-amber-500/25 bg-gradient-to-br from-amber-50 to-white dark:from-amber-500/[0.07] dark:to-slate-900'
                    : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 shadow-sm dark:shadow-none',
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

/** Muted label / tabular value row used inside widget cards. */
export function StatRow({ label, value, valueClassName }: { label: ReactNode; value: ReactNode; valueClassName?: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-slate-500 dark:text-slate-400">{label}</span>
            <span className={clsx('font-medium text-slate-800 dark:text-slate-100 tabular-nums text-right', valueClassName)}>{value}</span>
        </div>
    );
}
