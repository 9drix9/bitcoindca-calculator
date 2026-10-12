'use client';

import { useState, useMemo, useEffect, useRef, useId } from 'react';
import { Frequency } from '@/types';
import { useCurrency } from '@/context/CurrencyContext';
import { parseUtcDate, DAY_MS, addUtcMonths, formatUtc, utcFullYearsBetween } from '@/utils/dates';
import { calculateXirr, MAX_SCHEDULE_PURCHASES } from '@/utils/dca';
import { carryPriceAcrossRate, limitMessage, roundTo2Sig } from '@/utils/numericInput';
import { useNumericInput } from './useNumericInput';
import { Calendar, Sparkles, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

interface FutureProjectionProps {
    /** Recurring purchase amount in USD. */
    amount: number;
    frequency: Frequency;
    startDate: string;
    endDate: string;
    feePercentage: number;
    /** Flat fee per buy in USD, on top of the percentage (0 when there is none). */
    flatFee?: number;
    /**
     * UTC midnight (ms) of today, owned by the calculator. It is the same value
     * that cut off the past-only run behind `currentBtc` and `currentInvested`,
     * so a purchase dated today is in exactly one of "already made" and "still
     * to come". The browser's local date would be a day off for part of every
     * day outside UTC.
     */
    todayUtcTs: number;
    /**
     * The BTC price the projection starts from, in USD: the price `currentBtc`
     * is valued at. The live quote, or the typed price in Manual mode.
     */
    currentPrice: number;
    /**
     * What `currentPrice` is, in words that fit before "of $X". Left out,
     * "today's price", which is only true of a live quote.
     */
    priceLabel?: string;
    /**
     * False when `currentBtc` was not bought at market prices (Manual mode):
     * the card then leaves out the return the plan has had so far, because a
     * run at one fixed price is not history.
     */
    showRealizedRate?: boolean;
    /** BTC accumulated up to TODAY only (not the full future-inclusive run). */
    currentBtc: number;
    /** Amount invested up to TODAY only, in USD. */
    currentInvested: number;
    /** Yearly purchase increase %, stepping on start-date anniversaries — must
     *  mirror the engine or this card contradicts the hero on the same page. */
    annualEscalationPct?: number;
}

/**
 * Starting rates for the three scenario cards, in percent per year.
 *
 * These are round numbers picked to bracket a loss, no change, and a gain. They are
 * not derived from a model, a forecast, or any published estimate, and the UI says so.
 * Every card is editable, so the number on screen is always an assumption the reader
 * can see and change.
 */
const DEFAULT_RATES = [-20, 0, 20] as const;

const RATE_MIN = -95;
const RATE_MAX = 500;
const RATE_LIMITS = { min: RATE_MIN, max: RATE_MAX };
/** The target price field, in the display currency. */
const TARGET_LIMITS = { min: 0, max: 1_000_000_000 };
/** The target the field opens on, in US dollars. A placeholder, as the note under the field says. */
const DEFAULT_TARGET_USD = 150_000;

const scenarioLabel = (rate: number): string => {
    if (rate < 0) return 'Price falls';
    if (rate > 0) return 'Price rises';
    return 'Price flat';
};

/**
 * One scenario's assumed rate, in percent per year.
 *
 * The field keeps its own text while it is edited (see useNumericInput), so
 * it can be emptied and "-30" typed into it.
 *
 * The +/- button is the way to a negative rate that does not depend on the
 * keyboard. iOS's decimal keypad has no minus key (WebKit bug 193825), which is
 * also why this field does not ask for that keypad.
 */
function RateField({ id, index, rate, onRate }: { id: string; index: number; rate: number; onRate: (rate: number) => void }) {
    const field = useNumericInput(rate, onRate, RATE_LIMITS);
    const limitId = `${id}-limit`;
    return (
        <span className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="flex items-center gap-1">
                <button
                    type="button"
                    onClick={() => onRate(-rate)}
                    aria-label={`Switch scenario ${index + 1} between a rise and a fall`}
                    className="flex min-w-11 items-center justify-center rounded-md border border-slate-300 bg-white px-1.5 py-1 text-sm font-semibold leading-none text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:min-w-7 pointer-coarse:min-w-11"
                >
                    <span aria-hidden="true">+/−</span>
                </button>
                <label htmlFor={id} className="sr-only">
                    Assumed annual price change for scenario {index + 1}, in percent
                </label>
                <input
                    id={id}
                    type="number"
                    step={5}
                    min={RATE_MIN}
                    max={RATE_MAX}
                    aria-describedby={field.limitHit ? limitId : undefined}
                    {...field.inputProps}
                    className="w-16 min-h-11 sm:min-h-0 pointer-coarse:min-h-11 px-1.5 py-1 text-base sm:text-xs pointer-coarse:text-base text-right tabular-nums rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 outline-none"
                />
                <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">%/yr</span>
            </span>
            {/* Always mounted: a live region that arrives with its message is often not read out. */}
            <span
                id={limitId}
                role="status"
                className={field.limitHit ? 'text-[11px] text-slate-600 dark:text-slate-300' : 'sr-only'}
            >
                {field.limitHit ? limitMessage('The rate', field.limitHit, (n) => `${n}%`) : ''}
            </span>
        </span>
    );
}

export const FutureProjection = ({
    amount,
    frequency,
    startDate,
    endDate,
    feePercentage,
    flatFee = 0,
    todayUtcTs,
    currentPrice,
    currentBtc,
    currentInvested,
    annualEscalationPct = 0,
    priceLabel = "today's price",
    showRealizedRate = true,
}: FutureProjectionProps) => {
    const { currencyConfig, formatCurrency, formatCompact, formatBtcAmount } = useCurrency();
    const [mode, setMode] = useState<'price' | 'growth'>('growth');
    const [rates, setRates] = useState<number[]>([...DEFAULT_RATES]);
    const rateFieldId = useId();
    // Entered in the selected display currency; converted to USD before the math.
    const [targetPrice, setTargetPrice] = useState<number>(() => roundTo2Sig(DEFAULT_TARGET_USD * currencyConfig.rate));
    // Up here with the other hooks, above the early return below.
    const targetField = useNumericInput(targetPrice, setTargetPrice, TARGET_LIMITS);

    // Re-denominate the target when the display currency changes, so the same
    // USD scenario is preserved across a currency switch. The rate can also
    // change under the same currency (today's rates arriving after the dated
    // ones were shown): the untouched default follows it, a typed target is
    // left as typed. See carryPriceAcrossRate.
    const prevCurrencyRef = useRef({ code: currencyConfig.code, rate: currencyConfig.rate });
    useEffect(() => {
        const prev = prevCurrencyRef.current;
        const next = { code: currencyConfig.code, rate: currencyConfig.rate };
        if (prev.code !== next.code || prev.rate !== next.rate) {
            setTargetPrice(p => carryPriceAcrossRate(p, prev, next, [DEFAULT_TARGET_USD]));
        }
        prevCurrencyRef.current = next;
    }, [currencyConfig.code, currencyConfig.rate]);

    const startTs = useMemo(() => parseUtcDate(startDate), [startDate]);
    const endTs = useMemo(() => parseUtcDate(endDate), [endDate]);

    // Mirror the engine's UTC schedule (utils/dca.ts) so the count of future
    // purchases matches exactly what calculateDca schedules past today, and so the
    // past leg can be replayed as a cash-flow series for the realized-return figure.
    const schedule = useMemo(() => {
        if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || startTs > endTs) {
            return { futureAmounts: [] as number[], pastPurchases: [] as { ts: number; amount: number }[] };
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
        // Per-purchase amounts step up on anniversaries exactly like the engine,
        // or this card's totals would differ from the hero's by the raises.
        const escalation = Math.max(0, annualEscalationPct) / 100;
        const amountAt = (ts: number): number =>
            escalation > 0 ? amount * Math.pow(1 + escalation, utcFullYearsBetween(startTs, ts)) : amount;
        const futureAmounts: number[] = [];
        const pastPurchases: { ts: number; amount: number }[] = [];
        for (let i = 0; i < MAX_SCHEDULE_PURCHASES; i++) {
            const ts = purchaseTs(i);
            if (ts > endTs) break;
            if (ts > todayUtcTs) futureAmounts.push(amountAt(ts));
            else pastPurchases.push({ ts, amount: amountAt(ts) });
        }
        return { futureAmounts, pastPurchases };
    }, [startTs, endTs, todayUtcTs, frequency, amount, annualEscalationPct]);

    const futurePurchases = schedule.futureAmounts.length;

    /**
     * What this exact plan actually returned, money-weighted, from its first purchase
     * to today — the only forward-looking reference point this component can build
     * from real data rather than assert. Shown as context, never used as a default:
     * a realized rate is a fact about a window that already happened.
     */
    const realizedRatePercent = useMemo(() => {
        const past = schedule.pastPurchases;
        if (!showRealizedRate || past.length === 0 || currentPrice <= 0 || currentBtc <= 0) return null;
        // The engine skips scheduled dates it has no price for, so only trust the
        // replayed cash flows when they reconcile with what the engine actually spent.
        const replayed = past.reduce((sum, p) => sum + p.amount, 0);
        if (!(currentInvested > 0) || Math.abs(replayed - currentInvested) > amount * 0.5) return null;
        const xirr = calculateXirr(past, currentBtc * currentPrice, todayUtcTs);
        return xirr === null || !Number.isFinite(xirr) ? null : xirr * 100;
    }, [showRealizedRate, schedule.pastPurchases, amount, currentInvested, currentBtc, currentPrice, todayUtcTs]);

    // Only show if end date is in the future
    const isFutureProjection = Number.isFinite(endTs) && endTs > todayUtcTs;

    if (!isFutureProjection || currentPrice <= 0) return null;

    const daysIntoFuture = Math.round((endTs - todayUtcTs) / DAY_MS);
    const yearsIntoFuture = daysIntoFuture / 365;
    const futureInvestment = schedule.futureAmounts.reduce((sum, a) => sum + a, 0);
    const totalProjectedInvestment = currentInvested + futureInvestment;

    // For growth mode, calculate projected price at end date
    const calculateProjectedPrice = (annualRate: number) => currentPrice * Math.pow(1 + annualRate, yearsIntoFuture);

    // Simulate each future purchase along a linear price path from today's price
    // to the scenario end price. Summing amount/price_i gives the harmonic-mean
    // pricing DCA actually achieves — an arithmetic midpoint understates BTC bought.
    const calculateFutureBtc = (endPrice: number) => {
        if (futurePurchases <= 0 || endPrice <= 0) return 0;
        // Same fee as the engine charges on a past buy (utils/dca): the
        // percentage plus the flat fee, never more than the buy itself.
        const feePct = Math.min(100, Math.max(0, feePercentage)) / 100;
        const flat = Math.max(0, flatFee);
        let btc = 0;
        for (let i = 1; i <= futurePurchases; i++) {
            const price = currentPrice + (endPrice - currentPrice) * (i / futurePurchases);
            const paid = schedule.futureAmounts[i - 1];
            const net = paid - Math.min(paid, paid * feePct + flat);
            if (price > 0) btc += net / price;
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
                    {daysIntoFuture} {daysIntoFuture === 1 ? 'day' : 'days'} ahead
                </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-4">
                Your end date is <span className="font-medium text-purple-600 dark:text-purple-400">{formatUtc(endTs, 'full')}</span>.
                {futureInvestment > 0 && (
                    <> You&apos;ll make <span className="font-medium">{futurePurchases} more {futurePurchases === 1 ? 'purchase' : 'purchases'}</span> totaling <span className="font-medium">{formatCurrency(futureInvestment)}</span>.</>
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
                            : "text-slate-600 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
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
                            : "text-slate-600 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                    )}
                >
                    Target Price
                </button>
            </div>

            {mode === 'growth' && (
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-3">
                    Each card is an annual rate <em>you</em> choose, compounded from {priceLabel} of{' '}
                    <span className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">{formatCurrency(currentPrice)}</span>{' '}
                    over the next {yearsIntoFuture < 1 ? `${daysIntoFuture} ${daysIntoFuture === 1 ? 'day' : 'days'}` : `${yearsIntoFuture.toFixed(1)} years`}.
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
                            min={TARGET_LIMITS.min}
                            aria-describedby="fp-target-note"
                            {...targetField.inputProps}
                            className="w-full min-h-11 sm:min-h-0 pointer-coarse:min-h-11 pl-7 pr-3 py-2 rounded-lg border border-purple-200 dark:border-purple-700 bg-white dark:bg-slate-800 text-base sm:text-sm pointer-coarse:text-base tabular-nums focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                    </div>
                    <p id="fp-target-note" className="mt-1 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                        {targetField.limitHit && (
                            <span className="font-medium text-slate-700 dark:text-slate-200">
                                {limitMessage('The target price', targetField.limitHit, (n) => `${currencyConfig.symbol}${n.toLocaleString('en-US')}`)}{' '}
                            </span>
                        )}
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
                                <RateField
                                    id={`${rateFieldId}-${scenario.index}`}
                                    index={scenario.index}
                                    rate={rates[scenario.index]}
                                    onRate={(rate) => setRateAt(scenario.index, rate)}
                                />
                            )}
                        </div>

                        <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-1">
                            <span className="sm:hidden">{formatCompact(scenario.projectedValue)}</span>
                            <span className="hidden sm:inline">{formatCurrency(scenario.projectedValue)}</span>
                        </div>

                        <div className="space-y-0.5 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                            {/* The figure keeps its width; a label that does not fit beside it wraps. */}
                            <div className="flex justify-between">
                                <span>BTC price on that date</span>
                                <span className="tabular-nums whitespace-nowrap shrink-0 ml-1">
                                    <span className="sm:hidden">{formatCompact(scenario.projectedPrice)}</span>
                                    <span className="hidden sm:inline">{formatCurrency(scenario.projectedPrice)}</span>
                                </span>
                            </div>
                            {/* "Total stack", not "Total BTC": the figure follows
                                the Units switch, and may be in sats. */}
                            <div className="flex justify-between gap-2">
                                <span>Total stack</span>
                                <span className="tabular-nums text-right">{formatBtcAmount(scenario.totalBtc)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Total Invested</span>
                                <span className="tabular-nums whitespace-nowrap shrink-0 ml-1">
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

            {/* Where the numbers come from — deliberately not a one-line disclaimer.
                "Several times", not a count: on this site's own daily series a fall of
                more than 70% from a peak shows up five times (2011, April 2013,
                2013-15, 2017-18, 2021-22), and the other pages that make this point
                do not count either. */}
            <div className="mt-4 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50/80 dark:bg-amber-950/25 p-3 sm:p-4">
                <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                    <div className="space-y-2 text-[11px] sm:text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                        <p className="font-semibold text-amber-700 dark:text-amber-400 text-xs sm:text-sm">
                            These are assumptions you set, not forecasts.
                        </p>
                        <p>
                            There is no model behind the rate on each card and no source it was taken from. The card
                            compounds {priceLabel} forward at whatever number you type, walks a straight line to that end
                            price, and buys along it. Bitcoin has never moved in a straight line. It has lost more than 70% of its
                            value from a peak several times. And any of these cards can be made to say anything
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
