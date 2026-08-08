/**
 * Loading placeholders.
 *
 * These must match the DIMENSIONS and the RADIUS of what they replace, or every
 * swap shifts the layout. Both previously used rounded-xl while the Card
 * primitive is rounded-2xl, and SkeletonChart was 40px shorter than the real
 * chart at both breakpoints — a jump that fired on every debounced refetch, not
 * just first paint.
 */

export const SkeletonCard = () => (
    <div className="p-3 sm:p-5 rounded-2xl border border-[var(--hairline)] bg-white dark:bg-slate-900 shadow-[var(--elev-1)] animate-pulse">
        <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded mb-2 sm:mb-3" />
        <div className="h-6 sm:h-8 w-28 sm:w-36 bg-slate-200 dark:bg-slate-700 rounded mb-1.5 sm:mb-2" />
        <div className="h-2.5 w-16 sm:w-20 bg-slate-100 dark:bg-slate-800 rounded" />
    </div>
);

export const SkeletonChart = () => (
    // h-[340px] sm:h-[460px] mirrors DcaChart's Card exactly.
    <div className="w-full h-[340px] sm:h-[460px] bg-white dark:bg-slate-900 rounded-2xl p-3 sm:p-4 shadow-[var(--elev-1)] border border-[var(--hairline)] animate-pulse">
        <div className="h-4 sm:h-5 w-32 sm:w-40 bg-slate-200 dark:bg-slate-700 rounded mb-4 sm:mb-6" />
        <div className="flex items-end gap-0.5 sm:gap-1 h-[calc(100%-3rem)]">
            {Array.from({ length: 24 }).map((_, i) => (
                <div
                    key={i}
                    className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-t"
                    style={{ height: `${20 + Math.sin(i * 0.5) * 30 + 30}%` }}
                />
            ))}
        </div>
    </div>
);
