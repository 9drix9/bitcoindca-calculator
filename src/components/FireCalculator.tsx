'use client';

import { useState, useMemo } from 'react';
import { Frequency, AppreciationScenario } from '@/types';
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
    const [targetWithdrawal, setTargetWithdrawal] = useState<number>(50000);

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
                if (stackValue * WITHDRAWAL_RATE >= targetWithdrawal) {
                    break;
                }
                // Appreciate + add contributions
                stackValue = stackValue * (1 + scenario.rate) + annualContribution;
                years++;
            }

            const fireNumber = targetWithdrawal / WITHDRAWAL_RATE; // 4% rule target
            const reached = years < maxYears;

            return {
                ...scenario,
                years: reached ? years : null,
                fireNumber,
                projectedValue: stackValue,
                reached,
            };
        });
    }, [btcAccumulated, livePrice, totalInvested, amount, frequency, targetWithdrawal]);

    if (!scenarioResults || !livePrice) return null;

    const currentStackValue = btcAccumulated * livePrice;

    return (
        <div className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 text-slate-900 dark:text-white p-4 sm:p-6 rounded-2xl shadow-sm dark:shadow-lg border border-slate-200 dark:border-slate-700">
            <h3 className="text-base sm:text-xl font-bold mb-3 sm:mb-4 flex items-center gap-2">
                <span className="text-green-600 dark:text-green-400 text-lg">&#127793;</span>
                FIRE Calculator
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="space-y-2">
                    <label className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Annual Withdrawal Target</label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">$</span>
                        <input
                            type="number"
                            value={targetWithdrawal}
                            onChange={(e) => setTargetWithdrawal(Math.max(0, Number(e.target.value)))}
                            className="w-full pl-7 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-sm font-mono focus:ring-2 focus:ring-green-500 outline-none"
                        />
                    </div>
                    <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                        FIRE Number: ${(targetWithdrawal / WITHDRAWAL_RATE).toLocaleString(undefined, { maximumFractionDigits: 0 })} (4% rule)
                    </div>
                </div>
                <div className="space-y-2">
                    <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Current Stack Value</div>
                    <div className="text-lg sm:text-2xl font-bold text-amber-600 dark:text-amber-400">
                        ${currentStackValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                        {btcAccumulated.toFixed(8)} BTC @ ${livePrice.toLocaleString()}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {scenarioResults.map((result) => (
                    <div
                        key={result.label}
                        className={clsx(
                            "p-3 sm:p-4 rounded-xl border",
                            result.label === 'Conservative' && "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700/50",
                            result.label === 'Moderate' && "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700/50",
                            result.label === 'Aggressive' && "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/50",
                        )}
                    >
                        <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">{result.label} ({(result.rate * 100).toFixed(0)}%/yr)</div>
                        <div className="text-xl sm:text-2xl font-bold">
                            {result.reached ? (
                                <span className="text-green-600 dark:text-green-400">{result.years === 0 ? 'Now' : `${result.years}y`}</span>
                            ) : (
                                <span className="text-red-500 dark:text-red-400">100y+</span>
                            )}
                        </div>
                        <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {result.reached ? 'until FIRE' : 'not achievable'}
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-3 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 text-center">
                Assumes continued DCA of ${getContributionsPerYear(amount, frequency).toLocaleString()}/yr and 4% safe withdrawal rate
            </div>
        </div>
    );
};
