'use client';

import { useState, useMemo } from 'react';
import { Frequency } from '@/types';
import { addDays, addWeeks, addMonths, isAfter, startOfDay } from 'date-fns';
import clsx from 'clsx';

interface SavingsComparisonProps {
    totalInvested: number;
    btcCurrentValue: number;
    btcRoi: number;
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
    const [apy, setApy] = useState<number>(4.5);

    const savingsResult = useMemo(() => {
        if (totalInvested <= 0 || !startDate || !endDate) return null;

        const dailyRate = Math.pow(1 + apy / 100, 1 / 365) - 1;
        let balance = 0;
        let totalDeposited = 0;
        let currentDate = startOfDay(new Date(startDate));
        const end = startOfDay(new Date(endDate));

        while (!isAfter(currentDate, end)) {
            // Deposit
            balance += amount;
            totalDeposited += amount;

            // Calculate days until next deposit
            let nextDate: Date;
            switch (frequency) {
                case 'daily': nextDate = addDays(currentDate, 1); break;
                case 'weekly': nextDate = addWeeks(currentDate, 1); break;
                case 'biweekly': nextDate = addWeeks(currentDate, 2); break;
                case 'monthly': nextDate = addMonths(currentDate, 1); break;
            }

            // Cap compounding to the end date so we don't over-compound past the period
            const compoundEnd = isAfter(nextDate, end) ? end : nextDate;
            const daysUntilNext = Math.max(1, Math.round((compoundEnd.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)));
            balance *= Math.pow(1 + dailyRate, daysUntilNext);

            currentDate = nextDate;
        }

        const profit = balance - totalDeposited;
        const roi = totalDeposited > 0 ? (profit / totalDeposited) * 100 : 0;

        return { balance, totalDeposited, profit, roi };
    }, [apy, amount, frequency, startDate, endDate, totalInvested]);

    if (!savingsResult || totalInvested <= 0) return null;

    const btcWins = btcCurrentValue > savingsResult.balance;
    const difference = Math.abs(btcCurrentValue - savingsResult.balance);

    return (
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
                <h3 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100">BTC vs Savings Account</h3>
                <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 dark:text-slate-400">APY:</label>
                    <input
                        type="number"
                        step="0.1"
                        min={0}
                        max={20}
                        value={apy}
                        onChange={(e) => setApy(Math.min(20, Math.max(0, Number(e.target.value))))}
                        className="w-16 px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-1 focus:ring-amber-500/40 outline-none"
                    />
                    <span className="text-xs text-slate-400">%</span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-6">
                <div className={clsx(
                    "p-3 sm:p-4 rounded-lg border",
                    btcWins
                        ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/50"
                        : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                )}>
                    <div className="text-xs sm:text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">Bitcoin DCA</div>
                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">${btcCurrentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                    <div className={clsx("text-xs sm:text-sm mt-1", btcRoi >= 0 ? "text-green-600" : "text-red-600")}>
                        {btcRoi >= 0 ? '+' : ''}{btcRoi.toFixed(1)}% ROI
                    </div>
                </div>

                <div className={clsx(
                    "p-3 sm:p-4 rounded-lg border",
                    !btcWins
                        ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/50"
                        : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                )}>
                    <div className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">Savings ({apy}% APY)</div>
                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">${savingsResult.balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                    <div className={clsx("text-xs sm:text-sm mt-1", savingsResult.roi >= 0 ? "text-green-600" : "text-red-600")}>
                        {savingsResult.roi >= 0 ? '+' : ''}{savingsResult.roi.toFixed(1)}% ROI
                    </div>
                </div>
            </div>

            <div className="mt-3 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                {btcWins ? (
                    <span>Bitcoin outperforms by <span className="font-semibold text-green-600 dark:text-green-400">${difference.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></span>
                ) : (
                    <span>Savings account outperforms by <span className="font-semibold text-blue-600 dark:text-blue-400">${difference.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></span>
                )}
            </div>
        </div>
    );
};
