'use client';

import { useState, useMemo, useId } from 'react';
import { calculateDca } from '@/utils/dca';
import { utcDayStart, formatUtc } from '@/utils/dates';
import { useCurrency } from '@/context/CurrencyContext';
import { Card, CardHeader } from '@/components/ui/Card';

interface OpportunityCostCalculatorProps {
    priceData: [number, number][];
    livePrice: number | null;
}

// dailyCost is USD; displayAmount is the USD figure the pill label converts for display.
type Habit = { label: string; dailyCost: number; descriptionKey: 'day' | 'mo' | 'week'; displayAmount: number };

const HABITS: Habit[] = [
    { label: 'Coffee', dailyCost: 5, descriptionKey: 'day', displayAmount: 5 },
    { label: 'Streaming', dailyCost: 0.5, descriptionKey: 'mo', displayAmount: 15 },
    { label: 'Eating Out', dailyCost: 5.71, descriptionKey: 'week', displayAmount: 40 },
    { label: 'Smoking', dailyCost: 10, descriptionKey: 'day', displayAmount: 10 },
];

export const OpportunityCostCalculator = ({ priceData, livePrice }: OpportunityCostCalculatorProps) => {
    const { currencyConfig, formatCurrency, formatCompact } = useCurrency();
    const [selected, setSelected] = useState<string>('Coffee');
    // Entered in the selected display currency; converted to USD before any math.
    const [customAmount, setCustomAmount] = useState<number>(5);
    const customInputId = useId();

    const dailyCostUsd = useMemo(() => {
        if (selected === 'Custom') return customAmount / currencyConfig.rate;
        return HABITS.find(h => h.label === selected)?.dailyCost ?? 5;
    }, [selected, customAmount, currencyConfig.rate]);

    const results = useMemo(() => {
        if (!priceData.length || !livePrice) return null;

        const endTs = utcDayStart(Date.now());
        const end = new Date(endTs);
        const fiveYearsAgoTs = Date.UTC(end.getUTCFullYear() - 5, end.getUTCMonth(), end.getUTCDate());

        // Only simulate over dates the fetched series actually covers; anything
        // earlier would be priced on fabricated/interpolated data.
        const firstDataTs = utcDayStart(priceData[0][0]);
        const startTs = Math.max(fiveYearsAgoTs, firstDataTs);
        const truncated = startTs > fiveYearsAgoTs;

        const dcaResult = calculateDca(
            {
                amount: dailyCostUsd,
                frequency: 'daily',
                startDate: new Date(startTs),
                endDate: new Date(endTs),
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

        return { totalSpent, btcValue, multiplier, btcAccumulated: dcaResult.btcAccumulated, sats, truncated, startTs };
    }, [dailyCostUsd, priceData, livePrice]);

    if (!priceData.length || !livePrice) return null;

    return (
        <Card celebrated className="p-4 sm:p-6">
            <CardHeader
                title="What If You Skipped It?"
                subtitle="Five years of putting this daily habit into Bitcoin instead:"
                className="mb-4"
            />

            {/* Pill buttons */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4">
                {HABITS.map(h => (
                    <button
                        key={h.label}
                        onClick={() => setSelected(h.label)}
                        aria-pressed={selected === h.label}
                        className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-full border transition-colors ${
                            selected === h.label
                                ? 'bg-amber-500 text-slate-950 border-amber-500'
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-400'
                        }`}
                    >
                        {h.label} <span className="text-[11px] opacity-75 tabular-nums">({currencyConfig.symbol}{Math.round(h.displayAmount * currencyConfig.rate)}/{h.descriptionKey})</span>
                    </button>
                ))}
                <button
                    onClick={() => setSelected('Custom')}
                    aria-pressed={selected === 'Custom'}
                    className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-full border transition-colors ${
                        selected === 'Custom'
                            ? 'bg-amber-500 text-slate-950 border-amber-500'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-400'
                    }`}
                >
                    Custom
                </button>
            </div>

            {/* Custom input */}
            {selected === 'Custom' && (
                <div className="flex items-center gap-2 mb-4 fade-in">
                    <label htmlFor={customInputId} className="sr-only">Custom daily amount ({currencyConfig.code})</label>
                    <span className="text-sm text-slate-500 dark:text-slate-400" aria-hidden="true">{currencyConfig.symbol}</span>
                    <input
                        id={customInputId}
                        type="number"
                        inputMode="decimal"
                        min={0.01}
                        step={0.01}
                        value={customAmount}
                        onChange={e => setCustomAmount(Math.max(0.01, Number(e.target.value)))}
                        onFocus={e => e.target.select()}
                        className="w-28 h-10 px-3 text-base sm:text-sm tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-shadow"
                    />
                    <span className="text-sm text-slate-500 dark:text-slate-400">/day</span>
                </div>
            )}

            {/* Results */}
            {results && (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-3 text-center">
                            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mb-0.5">Total Spent</div>
                            <div className="text-sm sm:text-lg font-bold text-slate-800 dark:text-white truncate tabular-nums">
                                <span className="sm:hidden">{formatCompact(results.totalSpent)}</span>
                                <span className="hidden sm:inline">{formatCurrency(results.totalSpent)}</span>
                            </div>
                        </div>
                        <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-3 text-center">
                            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mb-0.5">BTC Value Today</div>
                            <div className="text-sm sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 truncate tabular-nums">
                                <span className="sm:hidden">{formatCompact(results.btcValue)}</span>
                                <span className="hidden sm:inline">{formatCurrency(results.btcValue)}</span>
                            </div>
                        </div>
                        <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-3 text-center">
                            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mb-0.5">Multiplier</div>
                            <div className="text-sm sm:text-lg font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                                {results.multiplier.toFixed(1)}x
                            </div>
                        </div>
                        <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-3 text-center">
                            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mb-0.5">Sats Stacked</div>
                            <div className="text-sm sm:text-lg font-bold text-slate-800 dark:text-white truncate tabular-nums">
                                {results.sats.toLocaleString()}
                            </div>
                        </div>
                    </div>
                    {results.truncated && (
                        <p className="mt-3 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                            Price history only reaches back to {formatUtc(results.startTs, 'full')}, so that&apos;s where this starts.
                        </p>
                    )}
                </>
            )}
        </Card>
    );
};
