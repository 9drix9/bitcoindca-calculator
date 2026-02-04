'use client';

import { useState, useMemo } from 'react';
import { calculateDca } from '@/utils/dca';
import { subYears, startOfToday } from 'date-fns';
import { useCurrency } from '@/context/CurrencyContext';

interface OpportunityCostCalculatorProps {
    priceData: [number, number][];
    livePrice: number | null;
}

type Habit = { label: string; dailyCost: number; description: string };

const HABITS: Habit[] = [
    { label: 'Coffee', dailyCost: 5, description: '$5/day' },
    { label: 'Streaming', dailyCost: 0.5, description: '$15/mo' },
    { label: 'Eating Out', dailyCost: 5.71, description: '$40/week' },
    { label: 'Smoking', dailyCost: 10, description: '$10/day' },
];

export const OpportunityCostCalculator = ({ priceData, livePrice }: OpportunityCostCalculatorProps) => {
    const { currencyConfig, formatCurrency } = useCurrency();
    const [selected, setSelected] = useState<string>('Coffee');
    const [customAmount, setCustomAmount] = useState<number>(5);

    const dailyCost = useMemo(() => {
        if (selected === 'Custom') return customAmount;
        return HABITS.find(h => h.label === selected)?.dailyCost ?? 5;
    }, [selected, customAmount]);

    const results = useMemo(() => {
        if (!priceData.length || !livePrice) return null;

        const endDate = startOfToday();
        const startDate = subYears(endDate, 5);

        const dcaResult = calculateDca(
            {
                amount: dailyCost,
                frequency: 'daily',
                startDate,
                endDate,
                feePercentage: 0,
                priceMode: 'api',
                manualPrice: 0,
            },
            priceData,
            livePrice,
        );

        const totalSpent = dcaResult.totalInvested;
        const btcValue = dcaResult.currentValue;
        const multiplier = totalSpent > 0 ? btcValue / totalSpent : 0;
        const sats = Math.floor(dcaResult.btcAccumulated * 100_000_000);

        return { totalSpent, btcValue, multiplier, btcAccumulated: dcaResult.btcAccumulated, sats };
    }, [dailyCost, priceData, livePrice]);

    if (!priceData.length || !livePrice) return null;

    return (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 p-4 sm:p-6 rounded-2xl border border-amber-200/60 dark:border-amber-800/40">
            <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white mb-1">
                What If You Skipped...?
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-4">
                If you had invested this daily habit into Bitcoin over the past 5 years:
            </p>

            {/* Pill buttons */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4">
                {HABITS.map(h => (
                    <button
                        key={h.label}
                        onClick={() => setSelected(h.label)}
                        className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-full border transition-colors ${
                            selected === h.label
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-400'
                        }`}
                    >
                        {h.label} <span className="text-[10px] opacity-75">({h.description})</span>
                    </button>
                ))}
                <button
                    onClick={() => setSelected('Custom')}
                    className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-full border transition-colors ${
                        selected === 'Custom'
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-400'
                    }`}
                >
                    Custom
                </button>
            </div>

            {/* Custom input */}
            {selected === 'Custom' && (
                <div className="flex items-center gap-2 mb-4 fade-in">
                    <span className="text-sm text-slate-500">{currencyConfig.symbol}</span>
                    <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={customAmount}
                        onChange={e => setCustomAmount(Math.max(0.01, Number(e.target.value)))}
                        className="w-24 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none"
                    />
                    <span className="text-sm text-slate-500">/day</span>
                </div>
            )}

            {/* Results */}
            {results && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-3 text-center">
                        <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mb-0.5">Total Spent</div>
                        <div className="text-sm sm:text-lg font-bold text-slate-800 dark:text-white">
                            {formatCurrency(results.totalSpent)}
                        </div>
                    </div>
                    <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-3 text-center">
                        <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mb-0.5">BTC Value Today</div>
                        <div className="text-sm sm:text-lg font-bold text-green-600 dark:text-green-400">
                            {formatCurrency(results.btcValue)}
                        </div>
                    </div>
                    <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-3 text-center">
                        <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mb-0.5">Multiplier</div>
                        <div className="text-sm sm:text-lg font-bold text-amber-600 dark:text-amber-400">
                            {results.multiplier.toFixed(1)}x
                        </div>
                    </div>
                    <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-3 text-center">
                        <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mb-0.5">Sats Stacked</div>
                        <div className="text-sm sm:text-lg font-bold text-slate-800 dark:text-white">
                            {results.sats.toLocaleString()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
