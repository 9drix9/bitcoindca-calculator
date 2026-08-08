'use client';

import { useState, useMemo, useId } from 'react';
import { Flame } from 'lucide-react';
import { Frequency, AppreciationScenario } from '@/types';
import { useCurrency } from '@/context/CurrencyContext';
import { Card, CardHeader } from '@/components/ui/Card';
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
    /** Contribution amount in USD (parent passes amountUsd) */
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
    const { currencyConfig, formatCurrency } = useCurrency();
    // Entered in the selected display currency; converted to USD once for all math.
    const [monthlyExpenses, setMonthlyExpenses] = useState<number>(4000);
    const expensesInputId = useId();

    const monthlyExpensesUsd = monthlyExpenses / currencyConfig.rate;
    const annualExpensesUsd = monthlyExpensesUsd * 12;
    const fireNumberUsd = annualExpensesUsd / WITHDRAWAL_RATE; // USD needed to retire

    const scenarioResults = useMemo(() => {
        if (!livePrice || btcAccumulated <= 0 || totalInvested <= 0) return null;

        const currentStackValue = btcAccumulated * livePrice; // USD
        const annualContribution = getContributionsPerYear(amount, frequency); // USD

        return SCENARIOS.map(scenario => {
            // Simulate year by year (all values USD)
            let stackValue = currentStackValue;
            let years = 0;
            const maxYears = 100;

            while (years < maxYears) {
                // Check if we can sustain withdrawal
                if (stackValue * WITHDRAWAL_RATE >= annualExpensesUsd) {
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
                projectedValue: stackValue,
                reached,
            };
        });
    }, [btcAccumulated, livePrice, totalInvested, amount, frequency, annualExpensesUsd]);

    if (!scenarioResults || !livePrice) return null;

    const currentStackValue = btcAccumulated * livePrice;
    const progressPercent = fireNumberUsd > 0 ? Math.min((currentStackValue / fireNumberUsd) * 100, 100) : 0;

    return (
        <Card className="p-4 sm:p-6">
            <CardHeader
                icon={<Flame className="w-4 h-4" />}
                title="When Could You Retire?"
                subtitle="FIRE stands for Financial Independence, Retire Early. This is how long until your Bitcoin could cover your living costs."
                className="mb-4"
            />

            {/* Input section */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 mb-4">
                <label htmlFor={expensesInputId} className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 block mb-2">
                    What do you spend in a month?
                </label>
                <div className="relative mb-3">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" aria-hidden="true">{currencyConfig.symbol}</span>
                    <input
                        id={expensesInputId}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={monthlyExpenses}
                        onChange={(e) => setMonthlyExpenses(Math.max(0, Number(e.target.value)))}
                        onFocus={(e) => e.target.select()}
                        className="w-full h-10 pl-8 pr-3 text-base sm:text-sm tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-shadow"
                        placeholder="4000"
                    />
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                    <div>That&apos;s <strong className="text-slate-700 dark:text-slate-300 tabular-nums">{formatCurrency(annualExpensesUsd)}/year</strong> in expenses</div>
                    <div>You&apos;d need <strong className="text-gain tabular-nums">{formatCurrency(fireNumberUsd)}</strong> to retire on the 4% rule</div>
                </div>
            </div>

            {/* What is the 4% rule - collapsible */}
            <details className="mb-4 text-xs sm:text-sm">
                <summary className="text-slate-500 dark:text-slate-400 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 py-1">
                    What is the 4% rule?
                </summary>
                <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-slate-600 dark:text-slate-400 leading-relaxed">
                    A rule of thumb from retirement planning: withdraw 4% of your savings a year and the pot
                    shouldn&apos;t run dry. So {formatCurrency(annualExpensesUsd)}/year in spending means 25x that
                    saved up, or {formatCurrency(fireNumberUsd)}.
                </div>
            </details>

            {/* Progress bar */}
            <div className="mb-4">
                <div className="flex justify-between text-xs sm:text-sm mb-1">
                    <span className="text-slate-600 dark:text-slate-400">Your progress</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200 tabular-nums">{progressPercent.toFixed(1)}%</span>
                </div>
                <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-emerald-500 rounded-full transition-colors duration-500"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
                <div className="flex justify-between text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                    <span>You have: {formatCurrency(currentStackValue)}</span>
                    <span>Goal: {formatCurrency(fireNumberUsd)}</span>
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
                                result.label === 'Moderate' && "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700/50",
                                result.label === 'Aggressive' && "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/50",
                            )}
                        >
                            <div className={clsx(
                                "text-xs font-bold mb-1",
                                result.label === 'Conservative' && "text-blue-600 dark:text-blue-400",
                                result.label === 'Moderate' && "text-gain",
                                result.label === 'Aggressive' && "text-amber-700 dark:text-amber-400",
                            )}>
                                {(result.rate * 100).toFixed(0)}% per year
                            </div>
                            <div className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white">
                                {result.reached ? (
                                    result.years === 0 ? (
                                        <span className="text-gain">Now</span>
                                    ) : (
                                        <span>{result.years} <span className="text-base">{result.years === 1 ? 'year' : 'years'}</span></span>
                                    )
                                ) : (
                                    <span className="text-loss text-xl">100+ years</span>
                                )}
                            </div>
                            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {result.reached
                                    ? result.years === 0
                                        ? "you're already there"
                                        : 'until you can retire'
                                    : 'not on this schedule'
                                }
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer note */}
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 text-center">
                Assumes you keep investing {formatCurrency(getContributionsPerYear(amount, frequency))}/year
            </div>
        </Card>
    );
};
