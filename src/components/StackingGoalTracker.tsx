'use client';

import { useMemo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { btcToSats, useCurrency } from '@/context/CurrencyContext';
import { Card, CardHeader } from '@/components/ui/Card';
import clsx from 'clsx';

interface StackingGoalTrackerProps {
    btcAccumulated: number;
    purchaseCount: number;
    /**
     * Not read: the time-to-goal estimate is priced at `currentPrice`, so the
     * backtest window does not enter into it. Accepted so the call sites that
     * still pass them need not change.
     */
    totalInvested?: number;
    startDate?: string;
    endDate?: string;
    /** Contribution amount per purchase, in USD (parent passes amountUsd) */
    amount: number;
    frequency: string;
    unit: 'BTC' | 'SATS';
    /**
     * BTC price in USD that every future buy is assumed to pay: the live quote
     * on the home page (see `priceLabel` for the callers where it is not). The
     * time-to-goal estimate is priced at this, not at the average price of the
     * backtest window — extrapolating the historical accumulation rate assumes
     * future sats keep costing what past sats cost, which flatters every window
     * in which the price rose. Without a price there is no honest rate to
     * project at, so the estimate is simply not shown.
     */
    currentPrice?: number;
    /**
     * What `currentPrice` is, in words that fit after "at": "the Oct 12, 2026
     * price", "the price you typed". Left out, the card says "today's price",
     * which is only true where the price is a live quote. A page that is
     * rebuilt once a day, or a calculator running on a typed price, passes
     * what it really is.
     */
    priceLabel?: string;
}

const MILESTONES = [0.001, 0.01, 0.1, 0.21, 0.5, 1];

const FREQUENCY_LABELS: Record<string, string> = {
    daily: 'day',
    weekly: 'week',
    biweekly: '2 weeks',
    monthly: 'month',
};

/** Purchases per year for each supported cadence. */
const PERIODS_PER_YEAR: Record<string, number> = {
    daily: 365,
    weekly: 52,
    biweekly: 26,
    monthly: 12,
};

const formatBtcLabel = (btc: number, unit: 'BTC' | 'SATS') => {
    if (unit === 'SATS') {
        // 'en-US' explicitly, so the server's HTML and the browser's first
        // render are the same text whatever the visitor's locale.
        return `${btcToSats(btc).toLocaleString('en-US')} sats`;
    }
    return `${btc} BTC`;
};

const formatMonths = (months: number): string => {
    if (months <= 12) return `${months}mo`;
    const years = Math.floor(months / 12);
    const rest = months % 12;
    return rest === 0 ? `${years}y` : `${years}y ${rest}mo`;
};

export const StackingGoalTracker = ({
    btcAccumulated,
    purchaseCount,
    amount,
    frequency,
    unit,
    currentPrice,
    priceLabel = "today's price",
}: StackingGoalTrackerProps) => {
    const { formatCurrency } = useCurrency();

    const projection = useMemo(() => {
        if (purchaseCount < 1 || btcAccumulated <= 0) return null;
        if (!currentPrice || !Number.isFinite(currentPrice) || currentPrice <= 0) return null;
        if (!Number.isFinite(amount) || amount <= 0) return null;

        const periodsPerYear = PERIODS_PER_YEAR[frequency];
        if (!periodsPerYear) return null;

        const nextMilestone = MILESTONES.find(m => btcAccumulated < m);
        if (!nextMilestone) return null;

        // Every future purchase buys amount/currentPrice worth of BTC — i.e. the
        // price is held flat at the one passed in. That is an assumption, not a
        // forecast, and the card prints the figure so the reader can check it.
        const btcPerPeriod = amount / currentPrice;
        if (btcPerPeriod <= 0) return null;

        const btcNeeded = nextMilestone - btcAccumulated;
        const periodsNeeded = btcNeeded / btcPerPeriod;
        const monthsNeeded = Math.ceil((periodsNeeded / periodsPerYear) * 12);
        if (!Number.isFinite(monthsNeeded) || monthsNeeded <= 0) return null;

        return { target: nextMilestone, monthsNeeded, btcPerPeriod };
    }, [btcAccumulated, purchaseCount, amount, frequency, currentPrice]);

    if (purchaseCount === 0 || btcAccumulated <= 0) return null;

    const amountLabel = formatCurrency(amount);
    const frequencyLabel = FREQUENCY_LABELS[frequency] ?? frequency;

    return (
        <Card className="p-4 sm:p-6">
            <CardHeader title="Stacking Goals" className="mb-3 sm:mb-4" />

            <div className="space-y-2.5">
                {MILESTONES.map((milestone) => {
                    const progress = Math.min((btcAccumulated / milestone) * 100, 100);
                    const completed = btcAccumulated >= milestone;

                    return (
                        <div key={milestone} className="space-y-1">
                            <div className="flex items-center justify-between text-xs sm:text-sm">
                                <div className="flex items-center gap-1.5">
                                    {completed ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gain shrink-0" />
                                    ) : (
                                        <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 shrink-0" />
                                    )}
                                    <span className={clsx(
                                        "font-medium tabular-nums",
                                        completed ? "text-gain" : "text-slate-700 dark:text-slate-300"
                                    )}>
                                        {formatBtcLabel(milestone, unit)}
                                    </span>
                                </div>
                                <span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                    {completed ? 'Reached' : `${progress.toFixed(1)}%`}
                                </span>
                            </div>
                            <div className="h-1.5 sm:h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className={clsx(
                                        "h-full rounded-full transition-colors duration-500",
                                        completed ? "bg-emerald-500" : "bg-amber-500"
                                    )}
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {projection && currentPrice && (
                <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        Keep buying <span className="font-medium text-amber-700 dark:text-amber-400 tabular-nums">{amountLabel} every {frequencyLabel}</span>{' '}
                        and, at {priceLabel} of <span className="font-medium text-amber-700 dark:text-amber-400 tabular-nums">{formatCurrency(currentPrice)}</span>,
                        each buy adds about{' '}
                        <span className="font-medium tabular-nums text-slate-700 dark:text-slate-300">
                            {btcToSats(projection.btcPerPeriod).toLocaleString('en-US')} sats
                        </span>. Reaching{' '}
                        <span className="font-medium text-amber-700 dark:text-amber-400 tabular-nums">{formatBtcLabel(projection.target, unit)}</span>
                        {' '}would take{' '}
                        {projection.monthsNeeded > 1200 ? (
                            <span className="font-medium text-amber-700 dark:text-amber-400">over 100 years</span>
                        ) : (
                            <span className="font-medium text-amber-700 dark:text-amber-400 tabular-nums">
                                about {formatMonths(projection.monthsNeeded)}
                            </span>
                        )}.
                    </p>
                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        That figure holds the price flat at {formatCurrency(currentPrice)}. It is arithmetic, not a forecast. If bitcoin gets
                        more expensive, the same contribution buys fewer sats and the goal takes longer. If it gets
                        cheaper, the goal arrives sooner. Exchange fees are not deducted, so treat the estimate as a
                        floor on the time required.
                    </p>
                </div>
            )}
        </Card>
    );
};
