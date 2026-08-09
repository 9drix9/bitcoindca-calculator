'use client';

import { useState, useMemo, useEffect, useRef, useId } from 'react';
import { Frequency } from '@/types';
import { useCurrency } from '@/context/CurrencyContext';
import { parseUtcDate, DAY_MS, addUtcMonths, formatUtc } from '@/utils/dates';
import { calculateXirr } from '@/utils/dca';
import { Calendar, Sparkles, AlertTriangle } from 'lucide-react';
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

/**
 * Starting rates for the three scenario cards, in percent per year.
 *
 * These are round numbers picked to bracket a loss, no change, and a gain. They are
 * not derived from a model, a forecast, or any published estimate, and the UI says so
 * — the previous 15/30/50%/yr triple was presented as "Conservative / Moderate /
 * Aggressive" with no stated basis and no scenario in which the user lost money, which
 * is not something this site should be asserting. Every card is editable, so the
 * number on screen is always an assumption the reader can see and change.
 */
const DEFAULT_RATES = [-20, 0, 20] as const;

const RATE_MIN = -95;
const RATE_MAX = 500;

const scenarioLabel = (rate: number): string => {
    if (rate < 0) return 'Price falls';
    if (rate > 0) return 'Price rises';
    return 'Price flat';
};

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
    const [rates, setRates] = useState<number[]>([...DEFAULT_RATES]);
    const rateFieldId = useId();
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
    // purchases matches exactly what calculateDca schedules past today, and so the
    // past leg can be replayed as a cash-flow series for the realized-return figure.
    const schedule = useMemo(() => {
        if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || startTs > endTs) {
            return { futureCount: 0, pastPurchases: [] as { ts: number; amount: number }[] };
        }
        const anchorDay = new Date(startTs).getUTCDate();
        const purchaseTs = (i: number): number => {
            switch (frequency) {
                case 'daily': return startTs + i * DAY_MS;
                case 'weekly': return startTs + i * 7 * DAY_MS;
                case 'biweekly': return startTs + i * 14 * DAY_MS;
                case 'monthly': return addUtcMonths(startTs, i, anchorDay);
            }
        };
        let futureCount = 0;
        const pastPurchases: { ts: number; amount: number }[] = [];
        for (let i = 0; i <= 40_000; i++) {
            const ts = purchaseTs(i);
            if (ts > endTs) break;
            if (ts > todayTs) futureCount++;
            else pastPurchases.push({ ts, amount });
        }
        return { futureCount, pastPurchases };
    }, [startTs, endTs, todayTs, frequency, amount]);

    const futurePurchases = schedule.futureCount;

    /**
     * What this exact plan actually returned, money-weighted, from its first purchase
     * to today — the only forward-looking reference point this component can build
     * from real data rather than assert. Shown as context, never used as a default:
     * a realized rate is a fact about a window that already happened.
     */
    const realizedRatePercent = useMemo(() => {
        const past = schedule.pastPurchases;
        if (past.length === 0 || currentPrice <= 0 || currentBtc <= 0) return null;
        // The engine skips scheduled dates it has no price for, so only trust the
        // replayed cash flows when they reconcile with what the engine actually spent.
        const replayed = past.length * amount;
        if (!(currentInvested > 0) || Math.abs(replayed - currentInvested) > amount * 0.5) return null;
        const xirr = calculateXirr(past, currentBtc * currentPrice, todayTs);
        return xirr === null || !Number.isFinite(xirr) ? null : xirr * 100;
    }, [schedule.pastPurchases, amount, currentInvested, currentBtc, currentPrice, todayTs]);

    // Only show if end date is in the future
    const isFutureProjection = Number.isFinite(endTs) && endTs > todayTs;

    if (!isFutureProjection || currentPrice <= 0) return null;

    const daysIntoFuture = Math.round((endTs - todayTs) / DAY_MS);
    const yearsIntoFuture = daysIntoFuture / 365;
    const futureInvestment = futurePurchases * amount;
    const totalProjectedInvestment = currentInvested + futureInvestment;

    // For growth mode, calculate projected price at end date
    const calculateProjectedPrice = (annualRate: number) => currentPrice * Math.pow(1 + annualRate, yearsIntoFuture);

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

    const buildScenario = (label: string, endPrice: number, index: number) => {
        const futureBtc = calculateFutureBtc(endPrice);
        const totalBtc = currentBtc + futureBtc;
        const projectedValue = totalBtc * endPrice;
        const projectedProfit = projectedValue - totalProjectedInvestment;
        return {
            index,
            label,
            projectedPrice: endPrice,
            totalBtc,
            projectedValue,
            projectedProfit,
            projectedRoi: totalProjectedInvestment > 0 ? (projectedProfit / totalProjectedInvestment) * 100 : 0,
        };
    };

    const targetPriceUsd = currencyConfig.rate > 0 ? targetPrice / currencyConfig.rate : targetPrice;

    const scenarios = mode === 'growth'
        ? rates.map((rate, i) => buildScenario(scenarioLabel(rate), calculateProjectedPrice(rate / 100), i))
        : [buildScenario('Target price', targetPriceUsd, 0)];

    const setRateAt = (index: number, value: number) => {
        const clamped = Math.min(RATE_MAX, Math.max(RATE_MIN, Number.isFinite(value) ? value : 0));
        setRates(prev => prev.map((r, i) => (i === index ? clamped : r)));
    };

    const toneClasses = (rate: number) =>
        rate < 0
            ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/50'
            : rate > 0
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50'
                : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700';

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
                        "flex-1 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors",
                        mode === 'growth'
                            ? "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300"
                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    )}
                >
                    Rate Scenarios
                </button>
                <button
                    type="button"
                    onClick={() => setMode('price')}
                    aria-pressed={mode === 'price'}
                    className={clsx(
                        "flex-1 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors",
                        mode === 'price'
                            ? "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300"
                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    )}
                >
                    Target Price
                </button>
            </div>

            {mode === 'growth' && (
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-3">
                    Each card is an annual rate <em>you</em> choose, compounded from today&apos;s price of{' '}
                    <span className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">{formatCurrency(currentPrice)}</span>{' '}
                    over the next {yearsIntoFuture < 1 ? `${daysIntoFuture} days` : `${yearsIntoFuture.toFixed(1)} years`}.
                    The starting −20 / 0 / +20 are round numbers chosen to show a loss, no change, and a gain. Edit them.
                </p>
            )}

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
                    <p className="mt-1 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                        A price you nominate. The default is a placeholder, not a target anyone is predicting.
                    </p>
                </div>
            )}

            {/* Scenario Cards */}
            <div className={clsx("grid gap-3", mode === 'growth' ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1")}>
                {scenarios.map((scenario) => (
                    <div
                        key={scenario.index}
                        className={clsx(
                            "p-3 sm:p-4 rounded-xl border",
                            mode === 'growth'
                                ? toneClasses(rates[scenario.index])
                                : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50"
                        )}
                    >
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                {scenario.label}
                            </span>
                            {mode === 'growth' && (
                                <span className="flex items-center gap-1 shrink-0">
                                    <label htmlFor={`${rateFieldId}-${scenario.index}`} className="sr-only">
                                        Assumed annual price change for scenario {scenario.index + 1}
                                    </label>
                                    <input
                                        id={`${rateFieldId}-${scenario.index}`}
                                        type="number"
                                        inputMode="decimal"
                                        step={5}
                                        min={RATE_MIN}
                                        max={RATE_MAX}
                                        value={rates[scenario.index]}
                                        onChange={(e) => setRateAt(scenario.index, Number(e.target.value))}
                                        onFocus={(e) => e.target.select()}
                                        className="w-16 px-1.5 py-1 text-base sm:text-xs text-right tabular-nums rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 outline-none"
                                    />
                                    <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">%/yr</span>
                                </span>
                            )}
                        </div>

                        <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-1 truncate">
                            <span className="sm:hidden">{formatCompact(scenario.projectedValue)}</span>
                            <span className="hidden sm:inline">{formatCurrency(scenario.projectedValue)}</span>
                        </div>

                        <div className="space-y-0.5 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                            <div className="flex justify-between">
                                <span>BTC price on that date</span>
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
                                <span>Return under this assumption</span>
                                <span className={clsx("font-semibold tabular-nums", scenario.projectedRoi >= 0 ? "text-gain" : "text-loss")}>
                                    {scenario.projectedRoi >= 0 ? '+' : ''}{scenario.projectedRoi.toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Where the numbers come from — deliberately not a one-line disclaimer. */}
            <div className="mt-4 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50/80 dark:bg-amber-950/25 p-3 sm:p-4">
                <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                    <div className="space-y-2 text-[11px] sm:text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                        <p className="font-semibold text-amber-700 dark:text-amber-400 text-xs sm:text-sm">
                            These are assumptions you set, not forecasts.
                        </p>
                        <p>
                            There is no model behind the rate on each card and no source it was taken from. The card compounds
                            today&apos;s price forward at whatever number you type, walks a straight line to that end price,
                            and buys along it. Bitcoin has never moved in a straight line. It has lost more than 70% of its
                            value from a peak on four separate occasions. And any of these cards can be made to say anything
                            by changing one field.
                        </p>
                        {realizedRatePercent !== null && (
                            <p>
                                For scale, here is history rather than evidence about the future. Run from{' '}
                                <span className="font-medium">{formatUtc(startTs, 'full')}</span> to today, this same plan returned{' '}
                                <span className={clsx(
                                    "font-semibold tabular-nums",
                                    realizedRatePercent >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
                                )}>
                                    {realizedRatePercent >= 0 ? '+' : ''}{realizedRatePercent.toFixed(1)}%/yr
                                </span>{' '}
                                money-weighted, meaning it accounts for when each purchase happened. A rate from one
                                window is not a rate you can expect to repeat.
                            </p>
                        )}
                        <p>
                            Nothing here is financial advice. Nobody knows what bitcoin will be worth on your end date,
                            and that includes us.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
