'use client';

import { useState, useMemo, useId } from 'react';
import { Frequency } from '@/types';
import { DAY_MS, parseUtcDate, addUtcMonths, utcDayStart, utcFullYearsBetween, formatUtc } from '@/utils/dates';
import { MAX_SCHEDULE_PURCHASES } from '@/utils/dca';
import { useCurrency } from '@/context/CurrencyContext';
import { Card } from '@/components/ui/Card';
import { limitMessage } from '@/utils/numericInput';
import { useNumericInput } from './useNumericInput';
import clsx from 'clsx';

interface SavingsComparisonProps {
    totalInvested: number;
    btcCurrentValue: number;
    btcRoi: number;
    /** Contribution amount in USD (parent passes amountUsd) */
    amount: number;
    frequency: Frequency;
    startDate: string;
    endDate: string;
    /**
     * The date both legs are marked to, as 'yyyy-MM-dd' UTC.
     *
     * The bitcoin figure this compares against is `DcaResult.currentValue`, which the
     * engine computes as `totalBtc * livePrice` — the whole stack marked to TODAY's
     * market, not to the backtest's end date. Stopping the savings balance at the end
     * date measured the two legs at different instants: a 2015–2018 backtest showed
     * bitcoin's 2026 value against a savings balance frozen in 2018, handing bitcoin
     * eight free years of compounding. Defaults to today, which matches the engine.
     *
     * The calculator always passes it (its own UTC "today"). This card is part
     * of the server-rendered markup, and a clock read here would put a different
     * balance and date in the browser's first render than in a cached page.
     */
    valuationDate?: string;
    /**
     * The price `btcCurrentValue` was struck at, in words that fit after "at":
     * "the Jan 1, 2020 price", "$40,000 per BTC". Left out, the footnote says
     * "its live price". The calculator passes it whenever that is not what was
     * used: with no live quote in hand, or in Manual mode.
     */
    btcPriceWords?: string;
    /** Mirror of the DCA plan's anniversary raise — the deposit streams must match. */
    annualEscalationPct?: number;
    /**
     * True when the plan's own end date is after `endDate`: the calculator
     * cuts a plan that is still running off at today. The footnote then says
     * the deposits are the ones made so far, not that the schedule has ended.
     */
    stopsAtToday?: boolean;
}

const APY_LIMITS = { min: 0, max: 20 };

export const SavingsComparison = ({
    totalInvested,
    btcCurrentValue,
    btcRoi,
    amount,
    frequency,
    startDate,
    endDate,
    valuationDate,
    btcPriceWords = 'its live price',
    annualEscalationPct = 0,
    stopsAtToday = false,
}: SavingsComparisonProps) => {
    const { formatCurrency, formatCompact } = useCurrency();
    // APY is a rate, not a money amount — no currency conversion needed.
    // The field keeps its own text while it is being edited, and the rate in
    // use stays the last one typed in full, so clearing the field to retype it
    // does not run the comparison at 0% in between.
    const [apy, setApy] = useState(4.5);
    const apyField = useNumericInput(apy, setApy, APY_LIMITS);
    const apyInputId = useId();
    const apyLimitId = `${apyInputId}-limit`;

    const savingsResult = useMemo(() => {
        if (totalInvested <= 0 || !startDate || !endDate) return null;

        const startTs = parseUtcDate(startDate);
        const endTs = parseUtcDate(endDate);
        if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs < startTs) return null;

        const requested = valuationDate ? parseUtcDate(valuationDate) : NaN;
        const markTs = Number.isFinite(requested) ? requested : utcDayStart(Date.now());

        const anchorDay = new Date(startTs).getUTCDate();
        const depositTs = (i: number): number => {
            switch (frequency) {
                case 'daily': return startTs + i * DAY_MS;
                case 'weekly': return startTs + i * 7 * DAY_MS;
                case 'biweekly': return startTs + i * 14 * DAY_MS;
                case 'monthly': return addUtcMonths(startTs, i, anchorDay);
            }
        };

        const dailyRate = Math.pow(1 + apy / 100, 1 / 365) - 1;
        const grow = (from: number, to: number) =>
            Math.pow(1 + dailyRate, Math.max(0, Math.round((to - from) / DAY_MS)));

        let balance = 0;
        let totalDeposited = 0;
        let lastDepositTs = -1;

        // Deposits run on the same schedule as the DCA purchases and stop at the
        // end date, stepping up on the same anniversaries when the plan escalates.
        const escalation = Math.max(0, annualEscalationPct) / 100;
        for (let i = 0; ; i++) {
            const ts = depositTs(i);
            if (ts > endTs || i >= MAX_SCHEDULE_PURCHASES) break;
            const deposit = escalation > 0
                ? amount * Math.pow(1 + escalation, utcFullYearsBetween(startTs, ts))
                : amount;
            if (lastDepositTs >= 0) balance *= grow(lastDepositTs, ts);
            balance += deposit;
            totalDeposited += deposit;
            lastDepositTs = ts;
        }

        if (lastDepositTs < 0 || totalDeposited <= 0) return null;

        // Then the balance keeps earning to the valuation date, exactly as the bitcoin
        // stack keeps being marked to the live price. A schedule that runs into the
        // future is already past the mark date, so this is a no-op there — mirroring
        // the engine's `max(now, lastPurchase)` terminal date.
        const valuedAtTs = Math.max(markTs, lastDepositTs);
        balance *= grow(lastDepositTs, valuedAtTs);

        const profit = balance - totalDeposited;
        const roi = totalDeposited > 0 ? (profit / totalDeposited) * 100 : 0;
        const idleDays = Math.max(0, Math.round((valuedAtTs - lastDepositTs) / DAY_MS));

        return {
            balance,
            totalDeposited,
            profit,
            roi,
            valuedAtTs,
            lastDepositTs,
            idleDays,
            // A schedule running past today means the two legs are NOT valued at the
            // same instant: the bitcoin is marked at today's live price (future buys
            // priced at the last known price by the engine's forward fill), while the
            // savings deposits keep earning APY through the end date. The footnote
            // must say so instead of claiming a same-day valuation.
            endsInFuture: lastDepositTs > markTs,
        };
    }, [apy, amount, frequency, startDate, endDate, totalInvested, valuationDate, annualEscalationPct]);

    if (!savingsResult || totalInvested <= 0) return null;

    const btcWins = btcCurrentValue > savingsResult.balance;
    const difference = Math.abs(btcCurrentValue - savingsResult.balance);

    return (
        <Card className="p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
                <h3 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-100">BTC vs Savings Account</h3>
                <div className="flex items-center gap-2">
                    {/* Spelled out in the label: a title attribute never shows on a touch screen. */}
                    <label htmlFor={apyInputId} className="text-xs text-slate-500 dark:text-slate-400">Assumed yearly interest (APY):</label>
                    <input
                        id={apyInputId}
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min={APY_LIMITS.min}
                        max={APY_LIMITS.max}
                        aria-describedby={apyField.limitHit ? apyLimitId : undefined}
                        {...apyField.inputProps}
                        className="w-20 min-h-11 sm:min-h-0 pointer-coarse:min-h-11 px-2 py-1.5 text-base sm:text-xs pointer-coarse:text-base tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-shadow"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400">%</span>
                </div>
                {/* Said, not done silently: 25 typed here is 20 in the sums below.
                    Always mounted, because a live region that arrives together
                    with its message is often not read out. */}
                <p
                    id={apyLimitId}
                    role="status"
                    className={apyField.limitHit ? 'w-full text-right text-[11px] sm:text-xs text-slate-600 dark:text-slate-300' : 'sr-only'}
                >
                    {apyField.limitHit ? limitMessage('The assumed interest rate', apyField.limitHit, (n) => `${n}%`) : ''}
                </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-6">
                <div className={clsx(
                    "p-3 sm:p-4 rounded-xl border",
                    btcWins
                        ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/50"
                        : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                )}>
                    <div className="text-xs sm:text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">Bitcoin DCA</div>
                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">
                        <span className="sm:hidden">{formatCompact(btcCurrentValue)}</span>
                        <span className="hidden sm:inline">{formatCurrency(btcCurrentValue)}</span>
                    </div>
                    <div className={clsx("text-xs sm:text-sm mt-1 tabular-nums", btcRoi >= 0 ? "text-gain" : "text-loss")}>
                        {btcRoi >= 0 ? '+' : ''}{btcRoi.toFixed(1)}% ROI
                    </div>
                </div>

                <div className={clsx(
                    "p-3 sm:p-4 rounded-xl border",
                    !btcWins
                        ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/50"
                        : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                )}>
                    <div className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">Savings ({apy}% APY)</div>
                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">
                        <span className="sm:hidden">{formatCompact(savingsResult.balance)}</span>
                        <span className="hidden sm:inline">{formatCurrency(savingsResult.balance)}</span>
                    </div>
                    <div className={clsx("text-xs sm:text-sm mt-1 tabular-nums", savingsResult.roi >= 0 ? "text-gain" : "text-loss")}>
                        {savingsResult.roi >= 0 ? '+' : ''}{savingsResult.roi.toFixed(1)}% ROI
                    </div>
                </div>
            </div>

            <div className="mt-3 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                {btcWins ? (
                    <span>Bitcoin is ahead by <span className="font-semibold text-gain tabular-nums">{formatCurrency(difference)}</span></span>
                ) : (
                    <span>The savings account is ahead by <span className="font-semibold text-blue-600 dark:text-blue-400 tabular-nums">{formatCurrency(difference)}</span></span>
                )}
            </div>

            <p className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {savingsResult.endsInFuture ? (
                    <>
                        Your schedule runs into the future, so the two sides are priced differently. The bitcoin
                        is valued at {btcPriceWords}, with buys after today assumed at the last known
                        price. The savings deposits are projected forward at the assumed APY through{' '}
                        <span className="font-medium text-slate-700 dark:text-slate-300">{formatUtc(savingsResult.lastDepositTs, 'full')}</span>,
                        your last scheduled deposit.
                    </>
                ) : (
                    <>
                        Both sides are valued on{' '}
                        <span className="font-medium text-slate-700 dark:text-slate-300">{formatUtc(savingsResult.valuedAtTs, 'full')}</span>:
                        the bitcoin at {btcPriceWords}, the deposits compounded daily to the same day.
                        {stopsAtToday ? (
                            <>
                                {' '}Your plan runs past today, so this counts the deposits made so far.
                                {savingsResult.idleDays > 0 && (
                                    <>
                                        {' '}The last one was on{' '}
                                        <span className="font-medium text-slate-700 dark:text-slate-300">{formatUtc(savingsResult.lastDepositTs, 'full')}</span>.
                                    </>
                                )}
                            </>
                        ) : savingsResult.idleDays > 0 && (
                            <>
                                {' '}Deposits stop on <span className="font-medium text-slate-700 dark:text-slate-300">{formatUtc(savingsResult.lastDepositTs, 'full')}</span>,
                                when your schedule ends. The balance then sits and earns for another{' '}
                                <span className="tabular-nums">{savingsResult.idleDays.toLocaleString('en-US')}</span>{' '}
                                {savingsResult.idleDays === 1 ? 'day' : 'days'}, so both sides
                                are measured at the same moment.
                            </>
                        )}
                    </>
                )}{' '}
                The interest rate is a flat assumption you set. Real accounts move their rate, and interest is usually
                taxable, neither of which this models.
            </p>
        </Card>
    );
};
