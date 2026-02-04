'use client';

import { useState, useMemo } from 'react';
import { addDays, addWeeks, addMonths, isAfter, startOfDay, format, differenceInDays } from 'date-fns';
import { Frequency } from '@/types';
import { useCurrency } from '@/context/CurrencyContext';
import { Calendar, Sparkles } from 'lucide-react';
import clsx from 'clsx';

interface FutureProjectionProps {
    amount: number;
    frequency: Frequency;
    startDate: string;
    endDate: string;
    feePercentage: number;
    currentPrice: number;
    currentBtc: number;
    currentInvested: number;
}

const GROWTH_SCENARIOS = [
    { label: 'Conservative', rate: 0.15, color: 'blue' },
    { label: 'Moderate', rate: 0.30, color: 'green' },
    { label: 'Aggressive', rate: 0.50, color: 'amber' },
];

export const FutureProjection = ({
    amount,
    frequency,
    startDate,
    endDate,
    feePercentage,
    currentPrice,
    currentBtc,
    currentInvested,
}: FutureProjectionProps) => {
    const { currencyConfig, formatCurrency } = useCurrency();
    const [mode, setMode] = useState<'price' | 'growth'>('growth');
    const [targetPrice, setTargetPrice] = useState<number>(150000);

    const today = useMemo(() => startOfDay(new Date()), []);
    const end = useMemo(() => startOfDay(new Date(endDate)), [endDate]);
    const start = useMemo(() => startOfDay(new Date(startDate)), [startDate]);

    // Only show if end date is in the future
    const isFutureProjection = isAfter(end, today);

    if (!isFutureProjection || currentPrice <= 0) return null;

    const daysIntoFuture = differenceInDays(end, today);

    // Calculate how many more purchases will happen from today to end date
    const calculateFuturePurchases = () => {
        let purchaseCount = 0;
        let currentDate = isAfter(start, today) ? start : today;

        // Align to next purchase date based on frequency from start
        if (!isAfter(start, today)) {
            // Find next purchase date after today
            let checkDate = start;
            while (!isAfter(checkDate, today)) {
                switch (frequency) {
                    case 'daily': checkDate = addDays(checkDate, 1); break;
                    case 'weekly': checkDate = addWeeks(checkDate, 1); break;
                    case 'biweekly': checkDate = addWeeks(checkDate, 2); break;
                    case 'monthly': checkDate = addMonths(checkDate, 1); break;
                }
            }
            currentDate = checkDate;
        }

        while (!isAfter(currentDate, end)) {
            purchaseCount++;
            switch (frequency) {
                case 'daily': currentDate = addDays(currentDate, 1); break;
                case 'weekly': currentDate = addWeeks(currentDate, 1); break;
                case 'biweekly': currentDate = addWeeks(currentDate, 2); break;
                case 'monthly': currentDate = addMonths(currentDate, 1); break;
            }
        }
        return purchaseCount;
    };

    const futurePurchases = calculateFuturePurchases();
    const futureInvestment = futurePurchases * amount;
    const totalProjectedInvestment = currentInvested + futureInvestment;

    // For growth mode, calculate projected price at end date
    const calculateProjectedPrice = (annualRate: number) => {
        const years = daysIntoFuture / 365;
        return currentPrice * Math.pow(1 + annualRate, years);
    };

    // Calculate future BTC accumulation (average price during accumulation period)
    const calculateFutureBtc = (endPrice: number) => {
        // Assume linear price growth, so average buy price is midpoint
        const avgFuturePrice = (currentPrice + endPrice) / 2;
        const netPerPurchase = amount * (1 - feePercentage / 100);
        return (netPerPurchase * futurePurchases) / avgFuturePrice;
    };

    const scenarios = mode === 'growth'
        ? GROWTH_SCENARIOS.map(s => {
            const projectedPrice = calculateProjectedPrice(s.rate);
            const futureBtc = calculateFutureBtc(projectedPrice);
            const totalBtc = currentBtc + futureBtc;
            const projectedValue = totalBtc * projectedPrice;
            const projectedProfit = projectedValue - totalProjectedInvestment;
            const projectedRoi = totalProjectedInvestment > 0 ? (projectedProfit / totalProjectedInvestment) * 100 : 0;
            return {
                ...s,
                projectedPrice,
                totalBtc,
                projectedValue,
                projectedProfit,
                projectedRoi,
            };
        })
        : [{
            label: 'Target Price',
            rate: 0,
            color: 'amber',
            projectedPrice: targetPrice,
            totalBtc: currentBtc + calculateFutureBtc(targetPrice),
            projectedValue: (currentBtc + calculateFutureBtc(targetPrice)) * targetPrice,
            projectedProfit: ((currentBtc + calculateFutureBtc(targetPrice)) * targetPrice) - totalProjectedInvestment,
            projectedRoi: totalProjectedInvestment > 0
                ? ((((currentBtc + calculateFutureBtc(targetPrice)) * targetPrice) - totalProjectedInvestment) / totalProjectedInvestment) * 100
                : 0,
        }];

    const formatBtc = (n: number) => n < 1 ? n.toFixed(6) : n.toFixed(4);

    return (
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 p-4 sm:p-6 rounded-2xl border border-purple-200 dark:border-purple-800/50">
            <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-purple-500" />
                <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white">Future Projection</h3>
                <span className="ml-auto text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {daysIntoFuture} days ahead
                </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-4">
                Your end date is <span className="font-medium text-purple-600 dark:text-purple-400">{format(end, 'MMM d, yyyy')}</span>.
                {futurePurchases > 0 && (
                    <> You&apos;ll make <span className="font-medium">{futurePurchases} more purchases</span> totaling <span className="font-medium">{formatCurrency(futureInvestment)}</span>.</>
                )}
            </p>

            {/* Mode Toggle */}
            <div className="flex bg-white dark:bg-slate-800 rounded-lg p-0.5 mb-4">
                <button
                    onClick={() => setMode('growth')}
                    className={clsx(
                        "flex-1 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all",
                        mode === 'growth'
                            ? "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300"
                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    )}
                >
                    Growth Scenarios
                </button>
                <button
                    onClick={() => setMode('price')}
                    className={clsx(
                        "flex-1 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all",
                        mode === 'price'
                            ? "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300"
                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    )}
                >
                    Target Price
                </button>
            </div>

            {/* Target Price Input */}
            {mode === 'price' && (
                <div className="mb-4">
                    <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">If BTC reaches...</label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">{currencyConfig.symbol}</span>
                        <input
                            type="number"
                            value={targetPrice}
                            onChange={(e) => setTargetPrice(Math.max(0, Number(e.target.value)))}
                            className="w-full pl-7 pr-3 py-2 rounded-lg border border-purple-200 dark:border-purple-700 bg-white dark:bg-slate-800 text-sm font-mono focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                    </div>
                </div>
            )}

            {/* Scenario Cards */}
            <div className={clsx("grid gap-3", mode === 'growth' ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1")}>
                {scenarios.map((scenario) => (
                    <div
                        key={scenario.label}
                        className={clsx(
                            "p-3 sm:p-4 rounded-xl border",
                            scenario.color === 'blue' && "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/50",
                            scenario.color === 'green' && "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800/50",
                            scenario.color === 'amber' && "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50"
                        )}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                {scenario.label}
                                {mode === 'growth' && <span className="text-slate-400 ml-1">({(scenario.rate * 100).toFixed(0)}%/yr)</span>}
                            </span>
                        </div>

                        <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-1">
                            {formatCurrency(scenario.projectedValue)}
                        </div>

                        <div className="space-y-0.5 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                            <div className="flex justify-between">
                                <span>Projected BTC Price</span>
                                <span className="font-mono">{formatCurrency(scenario.projectedPrice)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Total BTC</span>
                                <span className="font-mono">{formatBtc(scenario.totalBtc)} ₿</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Total Invested</span>
                                <span className="font-mono">{formatCurrency(totalProjectedInvestment)}</span>
                            </div>
                            <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-700 mt-1">
                                <span>Projected ROI</span>
                                <span className={clsx("font-semibold", scenario.projectedRoi >= 0 ? "text-green-600" : "text-red-500")}>
                                    {scenario.projectedRoi >= 0 ? '+' : ''}{scenario.projectedRoi.toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-3 text-center italic">
                Projections assume continued DCA at current rate. Future prices are speculative — not financial advice.
            </p>
        </div>
    );
};
