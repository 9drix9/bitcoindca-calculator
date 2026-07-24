'use client';

import { useState, useMemo, useId } from 'react';
import { Frequency } from '@/types';
import { DAY_MS, parseUtcDate, addUtcMonths } from '@/utils/dates';
import { useCurrency } from '@/context/CurrencyContext';
import { Card } from '@/components/ui/Card';
import clsx from 'clsx';

interface SavingsComparisonProps {
    totalInvested: number;
    btcCurrentValue: number;
    btcRoi: number;
    /** Contribution amount in USD (parent passes amountUsd) */
    amount: number;
    frequency: Frequency;
    startDate: string;
    endDate: string;
}

export const SavingsComparison = ({
    totalInvested,
    btcCurrentValue,
    btcRoi,
    amount,
    frequency,
    startDate,
    endDate,
}: SavingsComparisonProps) => {
    const { formatCurrency, formatCompact } = useCurrency();
    // APY is a rate, not a money amount — no currency conversion needed.
    const [apy, setApy] = useState<number>(4.5);
    const apyInputId = useId();

    const savingsResult = useMemo(() => {
        if (totalInvested <= 0 || !startDate || !endDate) return null;

        const startTs = parseUtcDate(startDate);
        const endTs = parseUtcDate(endDate);
        if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs < startTs) return null;

        const anchorDay = new Date(startTs).getUTCDate();
        const depositTs = (i: number): number => {
            switch (frequency) {
                case 'daily': return startTs + i * DAY_MS;
                case 'weekly': return startTs + i * 7 * DAY_MS;
                case 'biweekly': return startTs + i * 14 * DAY_MS;
                case 'monthly': return addUtcMonths(startTs, i, anchorDay);
            }
        };

        const dailyRate = Math.pow(1 + apy / 100, 1 / 365) - 1;
        let balance = 0;
        let totalDeposited = 0;

        for (let i = 0; ; i++) {
            const ts = depositTs(i);
            if (ts > endTs || i > 40_000) break;

            // Deposit
            balance += amount;
            totalDeposited += amount;

            // Compound until the next deposit, capped at the end date. A deposit
            // landing exactly on the end date earns zero days of interest.
            const compoundEnd = Math.min(depositTs(i + 1), endTs);
            const daysUntilNext = Math.max(0, Math.round((compoundEnd - ts) / DAY_MS));
            balance *= Math.pow(1 + dailyRate, daysUntilNext);
        }

        const profit = balance - totalDeposited;
        const roi = totalDeposited > 0 ? (profit / totalDeposited) * 100 : 0;

        return { balance, totalDeposited, profit, roi };
    }, [apy, amount, frequency, startDate, endDate, totalInvested]);

    if (!savingsResult || totalInvested <= 0) return null;

    const btcWins = btcCurrentValue > savingsResult.balance;
    const difference = Math.abs(btcCurrentValue - savingsResult.balance);

    return (
        <Card className="p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
                <h3 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-100">BTC vs Savings Account</h3>
                <div className="flex items-center gap-2">
                    <label htmlFor={apyInputId} className="text-xs text-slate-500 dark:text-slate-400">APY:</label>
                    <input
                        id={apyInputId}
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min={0}
                        max={20}
                        value={apy}
                        onChange={(e) => setApy(Math.min(20, Math.max(0, Number(e.target.value))))}
                        onFocus={(e) => e.target.select()}
                        className="w-20 px-2 py-1.5 text-base sm:text-xs tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-shadow"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400">%</span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-6">
                <div className={clsx(
                    "p-3 sm:p-4 rounded-xl border",
                    btcWins
                        ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/50"
                        : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                )}>
                    <div className="text-xs sm:text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">Bitcoin DCA</div>
                    <div className="text-lg sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
                        <span className="sm:hidden">{formatCompact(btcCurrentValue)}</span>
                        <span className="hidden sm:inline">{formatCurrency(btcCurrentValue)}</span>
                    </div>
                    <div className={clsx("text-xs sm:text-sm mt-1 tabular-nums", btcRoi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                        {btcRoi >= 0 ? '+' : ''}{btcRoi.toFixed(1)}% ROI
                    </div>
                </div>

                <div className={clsx(
                    "p-3 sm:p-4 rounded-xl border",
                    !btcWins
                        ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/50"
                        : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                )}>
                    <div className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">Savings ({apy}% APY)</div>
                    <div className="text-lg sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
                        <span className="sm:hidden">{formatCompact(savingsResult.balance)}</span>
                        <span className="hidden sm:inline">{formatCurrency(savingsResult.balance)}</span>
                    </div>
                    <div className={clsx("text-xs sm:text-sm mt-1 tabular-nums", savingsResult.roi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                        {savingsResult.roi >= 0 ? '+' : ''}{savingsResult.roi.toFixed(1)}% ROI
                    </div>
                </div>
            </div>

            <div className="mt-3 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                {btcWins ? (
                    <span>Bitcoin outperforms by <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(difference)}</span></span>
                ) : (
                    <span>Savings account outperforms by <span className="font-semibold text-blue-600 dark:text-blue-400 tabular-nums">{formatCurrency(difference)}</span></span>
                )}
            </div>
        </Card>
    );
};
