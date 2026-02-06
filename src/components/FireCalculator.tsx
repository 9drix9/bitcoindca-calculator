'use client';

import { useState, useMemo } from 'react';
import { Frequency, AppreciationScenario } from '@/types';
import { useCurrency } from '@/context/CurrencyContext';
import clsx from 'clsx';

const SCENARIOS: AppreciationScenario[] = [
    { label: 'Conservative', rate: 0.10 },
    { label: 'Moderate', rate: 0.25 },
    { label: 'Aggressive', rate: 0.50 },
];

const WITHDRAWAL_RATE = 0.04; // 4% rule

interface FireCalculatorProps {
    btcAccumulated: number;
    totalInvested: number;
    livePrice: number | null;
    amount: number;
    frequency: Frequency;
}

const getContributionsPerYear = (amount: number, frequency: Frequency): number => {
    switch (frequency) {
        case 'daily': return amount * 365;
        case 'weekly': return amount * 52;
        case 'biweekly': return amount * 26;
        case 'monthly': return amount * 12;
    }
};

export const FireCalculator = ({
    btcAccumulated,
    totalInvested,
    livePrice,
    amount,
    frequency,
}: FireCalculatorProps) => {
    const { currencyConfig, formatCurrency, formatCompact } = useCurrency();
    const [monthlyExpenses, setMonthlyExpenses] = useState<number>(4000);

    const annualExpenses = monthlyExpenses * 12;
    const fireNumber = annualExpenses / WITHDRAWAL_RATE; // Amount needed to retire

    const scenarioResults = useMemo(() => {
        if (!livePrice || btcAccumulated <= 0 || totalInvested <= 0) return null;

        const currentStackValue = btcAccumulated * livePrice;
        const annualContribution = getContributionsPerYear(amount, frequency);

        return SCENARIOS.map(scenario => {
            // Simulate year by year
            let stackValue = currentStackValue;
            let years = 0;
            const maxYears = 100;

            while (years < maxYears) {
                // Check if we can sustain withdrawal
                if (stackValue * WITHDRAWAL_RATE >= annualExpenses) {
                    break;
                }
                // Appreciate + add contributions
                stackValue = stackValue * (1 + scenario.rate) + annualContribution;
                years++;
            }

            const reached = years < maxYears;

            return {
                ...scenario,
                years: reached ? years : null,
                fireNumber,
                projectedValue: stackValue,
                reached,
            };
        });
    }, [btcAccumulated, livePrice, totalInvested, amount, frequency, annualExpenses, fireNumber]);

    if (!scenarioResults || !livePrice) return null;

    const currentStackValue = btcAccumulated * livePrice;
    const progressPercent = Math.min((currentStackValue / fireNumber) * 100, 100);

    return (
        <div className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 text-slate-900 dark:text-white p-4 sm:p-6 rounded-2xl shadow-sm dark:shadow-lg border border-slate-200 dark:border-slate-700">
            {/* Header with explanation */}
            <div className="mb-4">
                <h3 className="text-base sm:text-xl font-bold flex items-center gap-2">
                    <span className="text-green-600 dark:text-green-400 text-lg">&#127793;</span>
                    When Could You Retire?
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                    FIRE = Financial Independence, Retire Early. This shows when your Bitcoin could cover your living expenses forever.
                </p>
            </div>

            {/* Input section */}
            <div className="bg-slate-100 dark:bg-slate-800/50 rounded-xl p-4 mb-4">
                <label className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 block mb-2">
                    What are your monthly living expenses?
                </label>
                <div className="relative mb-3">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">{currencyConfig.symbol}</span>
                    <input
                        type="number"
                        value={monthlyExpenses}
                        onChange={(e) => setMonthlyExpenses(Math.max(0, Number(e.target.value)))}
                        onFocus={(e) => e.target.select()}
                        className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-base font-mono focus:ring-2 focus:ring-green-500 outline-none"
                        placeholder="4000"
                    />
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                    <div>That&apos;s <strong className="text-slate-700 dark:text-slate-300">{formatCurrency(annualExpenses)}/year</strong> in expenses</div>
                    <div>You need <strong className="text-green-600 dark:text-green-400">{formatCurrency(fireNumber)}</strong> to retire (using the 4% rule)</div>
                </div>
            </div>

            {/* What is the 4% rule - collapsible */}
            <details className="mb-4 text-xs sm:text-sm">
                <summary className="text-slate-500 dark:text-slate-400 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300">
                    What is the 4% rule?
                </summary>
                <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-slate-600 dark:text-slate-400 leading-relaxed">
                    The 4% rule says you can withdraw 4% of your savings each year without running out of money.
                    So if you need {formatCurrency(annualExpenses)}/year, you need 25x that amount ({formatCurrency(fireNumber)}) saved up.
                </div>
            </details>

            {/* Progress bar */}
            <div className="mb-4">
                <div className="flex justify-between text-xs sm:text-sm mb-1">
                    <span className="text-slate-600 dark:text-slate-400">Your progress</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{progressPercent.toFixed(1)}%</span>
                </div>
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
                <div className="flex justify-between text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">
                    <span>You have: {formatCurrency(currentStackValue)}</span>
                    <span>Goal: {formatCurrency(fireNumber)}</span>
                </div>
            </div>

            {/* Scenario cards */}
            <div className="mb-3">
                <div className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    If Bitcoin grows each year by...
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {scenarioResults.map((result) => (
                        <div
                            key={result.label}
                            className={clsx(
                                "p-3 sm:p-4 rounded-xl border text-center",
                                result.label === 'Conservative' && "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700/50",
                                result.label === 'Moderate' && "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700/50",
                                result.label === 'Aggressive' && "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/50",
                            )}
                        >
                            <div className={clsx(
                                "text-xs font-bold mb-1",
                                result.label === 'Conservative' && "text-blue-600 dark:text-blue-400",
                                result.label === 'Moderate' && "text-green-600 dark:text-green-400",
                                result.label === 'Aggressive' && "text-amber-600 dark:text-amber-400",
                            )}>
                                {(result.rate * 100).toFixed(0)}% per year
                            </div>
                            <div className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white">
                                {result.reached ? (
                                    result.years === 0 ? (
                                        <span className="text-green-600 dark:text-green-400">Now!</span>
                                    ) : (
                                        <span>{result.years} <span className="text-base">years</span></span>
                                    )
                                ) : (
                                    <span className="text-red-500 dark:text-red-400 text-xl">100+ years</span>
                                )}
                            </div>
                            <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {result.reached
                                    ? result.years === 0
                                        ? "You're already there!"
                                        : "until you can retire"
                                    : "keep stacking!"
                                }
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer note */}
            <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 text-center">
                Assumes you keep investing {formatCurrency(getContributionsPerYear(amount, frequency))}/year
            </div>
        </div>
    );
};
