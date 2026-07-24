'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Frequency } from '@/types';
import { useCurrency } from '@/context/CurrencyContext';
import { parseUtcDate, DAY_MS, addUtcMonths, formatUtc } from '@/utils/dates';
import { Calendar, Sparkles } from 'lucide-react';
import clsx from 'clsx';

interface FutureProjectionProps {
    /** Recurring purchase amount in USD. */
    amount: number;
    frequency: Frequency;
    startDate: string;
    endDate: string;
    feePercentage: number;
    /** Current BTC price in USD. */
    currentPrice: number;
    /** BTC accumulated up to TODAY only (not the full future-inclusive run). */
    currentBtc: number;
    /** Amount invested up to TODAY only, in USD. */
    currentInvested: number;
}

const GROWTH_SCENARIOS = [
    { label: 'Conservative', rate: 0.15, color: 'blue' },
    { label: 'Moderate', rate: 0.30, color: 'emerald' },
    { label: 'Aggressive', rate: 0.50, color: 'amber' },
] as const;

/** Round to 2 significant figures (keeps converted default targets tidy). */
const roundTo2Sig = (n: number): number => {
    if (!Number.isFinite(n) || n <= 0) return 0;
    const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1);
    return Math.round(n / mag) * mag;
};

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
    const { currencyConfig, formatCurrency, formatCompact, formatBtc } = useCurrency();
    const [mode, setMode] = useState<'price' | 'growth'>('growth');
    // Entered in the selected display currency; converted to USD before the math.
    const [targetPrice, setTargetPrice] = useState<number>(() => roundTo2Sig(150_000 * currencyConfig.rate));

    // Re-denominate the entered target when the display currency changes so the
    // same USD scenario is preserved across a currency switch.
    const prevCurrencyRef = useRef({ code: currencyConfig.code, rate: currencyConfig.rate });
    useEffect(() => {
        const prev = prevCurrencyRef.current;
        if (prev.code !== currencyConfig.code && prev.rate > 0) {
            setTargetPrice(p => roundTo2Sig((p / prev.rate) * currencyConfig.rate));
        }
        prevCurrencyRef.current = { code: currencyConfig.code, rate: currencyConfig.rate };
    }, [currencyConfig.code, currencyConfig.rate]);

    const startTs = useMemo(() => parseUtcDate(startDate), [startDate]);
    const endTs = useMemo(() => parseUtcDate(endDate), [endDate]);
    // Today's local calendar date at UTC midnight — matches the engine's UTC day bucketing.
    const now = new Date();
    const todayTs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

    // Mirror the engine's UTC schedule (utils/dca.ts) so the count of future
    // purchases matches exactly what calculateDca schedules past today.
    const futurePurchases = useMemo(() => {
        if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || startTs > endTs) return 0;
        const anchorDay = new Date(startTs).getUTCDate();
        const purchaseTs = (i: number): number => {
            switch (frequency) {
                case 'daily': return startTs + i * DAY_MS;
                case 'weekly': return startTs + i * 7 * DAY_MS;
                case 'biweekly': return startTs + i * 14 * DAY_MS;
                case 'monthly': return addUtcMonths(startTs, i, anchorDay);
            }
        };
        let count = 0;
        for (let i = 0; i <= 40_000; i++) {
            const ts = purchaseTs(i);
            if (ts > endTs) break;
            if (ts > todayTs) count++;
        }
        return count;
    }, [startTs, endTs, todayTs, frequency]);

    // Only show if end date is in the future
    const isFutureProjection = Number.isFinite(endTs) && endTs > todayTs;

    if (!isFutureProjection || currentPrice <= 0) return null;

    const daysIntoFuture = Math.round((endTs - todayTs) / DAY_MS);
    const futureInvestment = futurePurchases * amount;
    const totalProjectedInvestment = currentInvested + futureInvestment;

    // For growth mode, calculate projected price at end date
    const calculateProjectedPrice = (annualRate: number) => {
        const years = daysIntoFuture / 365;
        return currentPrice * Math.pow(1 + annualRate, years);
    };

    // Simulate each future purchase along a linear price path from today's price
    // to the scenario end price. Summing amount/price_i gives the harmonic-mean
    // pricing DCA actually achieves — an arithmetic midpoint understates BTC bought.
    const calculateFutureBtc = (endPrice: number) => {
        if (futurePurchases <= 0 || endPrice <= 0) return 0;
        const netPerPurchase = amount * (1 - feePercentage / 100);
        let btc = 0;
        for (let i = 1; i <= futurePurchases; i++) {
            const price = currentPrice + (endPrice - currentPrice) * (i / futurePurchases);
            if (price > 0) btc += netPerPurchase / price;
        }
        return btc;
    };

    const targetPriceUsd = currencyConfig.rate > 0 ? targetPrice / currencyConfig.rate : targetPrice;

    const scenarios = mode === 'growth'
        ? GROWTH_SCENARIOS.map(s => {
            const projectedPrice = calculateProjectedPrice(s.rate);
            const futureBtc = calculateFutureBtc(projectedPrice);
            const totalBtc = currentBtc + futureBtc;
            const projectedValue = totalBtc * projectedPrice;
            const projectedProfit = projectedValue - totalProjectedInvestment;
            const projectedRoi = totalProjectedInvestment > 0 ? (projectedProfit / totalProjectedInvestment) * 100 : 0;
            return {
                label: s.label as string,
                rate: s.rate as number,
                color: s.color as string,
                projectedPrice,
                totalBtc,
                projectedValue,
                projectedProfit,
                projectedRoi,
            };
        })
        : (() => {
            const futureBtc = calculateFutureBtc(targetPriceUsd);
            const totalBtc = currentBtc + futureBtc;
            const projectedValue = totalBtc * targetPriceUsd;
            const projectedProfit = projectedValue - totalProjectedInvestment;
            return [{
                label: 'Target Price',
                rate: 0,
                color: 'amber',
                projectedPrice: targetPriceUsd,
                totalBtc,
                projectedValue,
                projectedProfit,
                projectedRoi: totalProjectedInvestment > 0 ? (projectedProfit / totalProjectedInvestment) * 100 : 0,
            }];
        })();

    return (
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 p-4 sm:p-6 rounded-2xl border border-purple-200 dark:border-purple-800/50">
            <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-purple-500" aria-hidden="true" />
                <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white">Future Projection</h3>
                <span className="ml-auto text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" aria-hidden="true" />
                    {daysIntoFuture} days ahead
                </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-4">
                Your end date is <span className="font-medium text-purple-600 dark:text-purple-400">{formatUtc(endTs, 'full')}</span>.
                {futurePurchases > 0 && (
                    <> You&apos;ll make <span className="font-medium">{futurePurchases} more purchases</span> totaling <span className="font-medium">{formatCurrency(futureInvestment)}</span>.</>
                )}
            </p>

            {/* Mode Toggle */}
            <div role="group" aria-label="Projection mode" className="flex bg-white dark:bg-slate-800 rounded-lg p-0.5 mb-4">
                <button
                    type="button"
                    onClick={() => setMode('growth')}
                    aria-pressed={mode === 'growth'}
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
                    type="button"
                    onClick={() => setMode('price')}
                    aria-pressed={mode === 'price'}
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
                    <label htmlFor="fp-target-price" className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">If BTC reaches... ({currencyConfig.code})</label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">{currencyConfig.symbol}</span>
                        <input
                            id="fp-target-price"
                            type="number"
                            inputMode="decimal"
                            value={targetPrice}
                            onChange={(e) => setTargetPrice(Math.max(0, Number(e.target.value)))}
                            onFocus={(e) => e.target.select()}
                            className="w-full pl-7 pr-3 py-2 rounded-lg border border-purple-200 dark:border-purple-700 bg-white dark:bg-slate-800 text-base sm:text-sm tabular-nums focus:ring-2 focus:ring-purple-500 outline-none"
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
                            scenario.color === 'emerald' && "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50",
                            scenario.color === 'amber' && "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50"
                        )}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                {scenario.label}
                                {mode === 'growth' && <span className="text-slate-400 ml-1">({(scenario.rate * 100).toFixed(0)}%/yr)</span>}
                            </span>
                        </div>

                        <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-1 truncate">
                            <span className="sm:hidden">{formatCompact(scenario.projectedValue)}</span>
                            <span className="hidden sm:inline">{formatCurrency(scenario.projectedValue)}</span>
                        </div>

                        <div className="space-y-0.5 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                            <div className="flex justify-between">
                                <span>Projected BTC Price</span>
                                <span className="tabular-nums truncate ml-1">
                                    <span className="sm:hidden">{formatCompact(scenario.projectedPrice)}</span>
                                    <span className="hidden sm:inline">{formatCurrency(scenario.projectedPrice)}</span>
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span>Total BTC</span>
                                <span className="tabular-nums">{formatBtc(scenario.totalBtc)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Total Invested</span>
                                <span className="tabular-nums truncate ml-1">
                                    <span className="sm:hidden">{formatCompact(totalProjectedInvestment)}</span>
                                    <span className="hidden sm:inline">{formatCurrency(totalProjectedInvestment)}</span>
                                </span>
                            </div>
                            <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-700 mt-1">
                                <span>Projected ROI</span>
                                <span className={clsx("font-semibold tabular-nums", scenario.projectedRoi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                                    {scenario.projectedRoi >= 0 ? '+' : ''}{scenario.projectedRoi.toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-3 text-center italic">
                Projections assume continued DCA at the current rate along a linear price path. Future prices are speculative &mdash; not financial advice.
            </p>
        </div>
    );
};
