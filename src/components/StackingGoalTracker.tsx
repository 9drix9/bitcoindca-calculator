'use client';

import { useMemo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';

interface StackingGoalTrackerProps {
    btcAccumulated: number;
    totalInvested: number;
    purchaseCount: number;
    startDate: string;
    endDate: string;
    amount: number;
    frequency: string;
    unit: 'BTC' | 'SATS';
}

const MILESTONES = [0.001, 0.01, 0.1, 0.21, 0.5, 1];

const formatBtcLabel = (btc: number, unit: 'BTC' | 'SATS') => {
    if (unit === 'SATS') {
        return `${(btc * 100_000_000).toLocaleString()} sats`;
    }
    return `${btc} BTC`;
};

export const StackingGoalTracker = ({
    btcAccumulated,
    totalInvested,
    purchaseCount,
    startDate,
    endDate,
    amount,
    frequency,
    unit,
}: StackingGoalTrackerProps) => {
    const projection = useMemo(() => {
        if (purchaseCount < 2 || btcAccumulated <= 0 || totalInvested <= 0) return null;

        const start = new Date(startDate).getTime();
        const end = new Date(endDate).getTime();
        const daysElapsed = (end - start) / (1000 * 60 * 60 * 24);
        if (daysElapsed <= 0) return null;

        const btcPerDay = btcAccumulated / daysElapsed;
        if (btcPerDay <= 0) return null;

        const nextMilestone = MILESTONES.find(m => btcAccumulated < m);
        if (!nextMilestone) return null;

        const btcNeeded = nextMilestone - btcAccumulated;
        const daysNeeded = btcNeeded / btcPerDay;
        const monthsNeeded = Math.ceil(daysNeeded / 30);

        return { target: nextMilestone, monthsNeeded };
    }, [btcAccumulated, totalInvested, purchaseCount, startDate, endDate]);

    if (purchaseCount === 0 || btcAccumulated <= 0) return null;

    return (
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3 sm:mb-4">Stacking Goals</h3>

            <div className="space-y-2.5">
                {MILESTONES.map((milestone) => {
                    const progress = Math.min((btcAccumulated / milestone) * 100, 100);
                    const completed = btcAccumulated >= milestone;

                    return (
                        <div key={milestone} className="space-y-1">
                            <div className="flex items-center justify-between text-xs sm:text-sm">
                                <div className="flex items-center gap-1.5">
                                    {completed ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500 shrink-0" />
                                    ) : (
                                        <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 shrink-0" />
                                    )}
                                    <span className={clsx(
                                        "font-medium",
                                        completed ? "text-green-600 dark:text-green-400" : "text-slate-700 dark:text-slate-300"
                                    )}>
                                        {formatBtcLabel(milestone, unit)}
                                    </span>
                                </div>
                                <span className="text-[10px] sm:text-xs text-slate-400 tabular-nums">
                                    {completed ? 'Reached' : `${progress.toFixed(1)}%`}
                                </span>
                            </div>
                            <div className="h-1.5 sm:h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className={clsx(
                                        "h-full rounded-full transition-all duration-500",
                                        completed ? "bg-green-500" : "bg-amber-500"
                                    )}
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {projection && (
                <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        At <span className="font-medium text-amber-600 dark:text-amber-400">${amount}/{frequency}</span>,
                        you&apos;ll reach{' '}
                        <span className="font-medium text-amber-600 dark:text-amber-400">{formatBtcLabel(projection.target, unit)}</span>
                        {' '}in ~<span className="font-medium text-amber-600 dark:text-amber-400">
                            {projection.monthsNeeded > 12
                                ? `${Math.floor(projection.monthsNeeded / 12)}y ${projection.monthsNeeded % 12}mo`
                                : `${projection.monthsNeeded}mo`
                            }
                        </span>
                    </p>
                </div>
            )}
        </div>
    );
};
