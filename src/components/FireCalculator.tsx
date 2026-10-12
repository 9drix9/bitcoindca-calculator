'use client';

import { useState, useMemo, useId } from 'react';
import Link from 'next/link';
import { Flame } from 'lucide-react';
import { Frequency } from '@/types';
import { useCurrency } from '@/context/CurrencyContext';
import { Card, CardHeader } from '@/components/ui/Card';
import {
    SPENDING_INFLATION_RATE,
    WITHDRAWAL_RATE,
    contributionsPerYear,
    defaultMonthlySpend,
    flipSign,
    formatCompactAmount,
    impliedPrice,
    priceScenarioLabel,
    projectFire,
    type FireProjection,
} from '@/app/calculators/bitcoin-fire/projection';
import { readTypedAmount } from '@/app/calculators/bitcoin-drawdown/typedAmount';
import clsx from 'clsx';

/**
 * Starting rates for the three scenario cards, in percent per year.
 *
 * Round numbers bracketing a loss, no change, and a gain — same reasoning as
 * FutureProjection, which replaced an all-positive "Conservative / Moderate /
 * Aggressive" trio because a scenario set with no losing path is not something
 * this site should be asserting. Every card is editable.
 */
const DEFAULT_RATES = [-20, 0, 20] as const;
const RATE_MIN = -95;
const RATE_MAX = 500;
const MAX_YEARS = 100;

const clampRate = (v: number): number => Math.min(RATE_MAX, Math.max(RATE_MIN, v));

interface FireCalculatorProps {
    /**
     * BTC held as of today. Never the end-of-plan total of a schedule that runs
     * into the future: this card adds the plan's contributions from today on
     * itself, so buys that have not happened yet would be counted twice.
     */
    btcAccumulated: number;
    /** USD put in so far, on the same "as of today" basis. */
    totalInvested: number;
    livePrice: number | null;
    /** Contribution amount in USD (parent passes amountUsd) */
    amount: number;
    frequency: Frequency;
    /**
     * Where the 4% explainer links for the long version. Left out on the FIRE
     * page itself, which is that long version and sits directly above the card.
     */
    learnMoreHref?: string;
}

export const FireCalculator = ({
    btcAccumulated,
    totalInvested,
    livePrice,
    amount,
    frequency,
    learnMoreHref,
}: FireCalculatorProps) => {
    const { currencyConfig, formatCurrency, convertFromUsd, rateNote } = useCurrency();
    // Entered in the selected display currency; converted to USD once for all math.
    // null means "not typed yet": the field then shows the default for whichever
    // currency is active, so it follows a currency switch (and the stored
    // preference arriving after hydration) until the visitor types a figure.
    const [typedExpenses, setTypedExpenses] = useState<string | null>(null);
    const [rateInputs, setRateInputs] = useState<string[]>(DEFAULT_RATES.map(String));
    const expensesInputId = useId();
    const rateFieldId = useId();

    const defaultExpenses = String(defaultMonthlySpend(currencyConfig.rate));
    const monthlyExpensesInput = typedExpenses ?? defaultExpenses;
    const monthlyExpenses = Math.max(0, readTypedAmount(monthlyExpensesInput) ?? 0);
    const monthlyExpensesUsd = monthlyExpenses / currencyConfig.rate;
    const annualExpensesUsd = monthlyExpensesUsd * 12;
    const fireNumberUsd = annualExpensesUsd / WITHDRAWAL_RATE; // USD needed to retire, today's dollars

    const setRateAt = (index: number, value: string) => {
        setRateInputs(prev => prev.map((r, i) => (i === index ? value : r)));
    };
    const snapRateAt = (index: number) => {
        setRateInputs(prev => prev.map((r, i) => {
            if (i !== index) return r;
            return String(clampRate(readTypedAmount(r) ?? 0));
        }));
    };
    const flipRateAt = (index: number) => {
        setRateInputs(prev => prev.map((r, i) => {
            if (i !== index) return r;
            const flipped = readTypedAmount(flipSign(r));
            // Clamped here because no blur follows a button press.
            return flipped === null ? r : String(clampRate(flipped));
        }));
    };

    const hasStack = !!livePrice && btcAccumulated > 0 && totalInvested > 0;
    const currentStackValue = hasStack ? btcAccumulated * livePrice : 0; // USD
    const annualContribution = contributionsPerYear(amount, frequency); // USD

    const scenarioResults = useMemo(() => {
        if (!hasStack) return null;
        const results = rateInputs.map(input => projectFire({
            stackValueUsd: currentStackValue,
            annualContributionUsd: annualContribution,
            annualExpensesUsd,
            annualRate: clampRate(readTypedAmount(input) ?? 0) / 100,
            maxYears: MAX_YEARS,
        }));
        // projectFire returns null only when there is no spending to cover,
        // which is the same for every scenario.
        return results.every((r): r is FireProjection => r !== null) ? results : null;
    }, [hasStack, currentStackValue, annualContribution, annualExpensesUsd, rateInputs]);

    if (!hasStack || !livePrice) return null;

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
                <div className={clsx('relative', scenarioResults && 'mb-3')}>
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" aria-hidden="true">{currencyConfig.symbol}</span>
                    <input
                        id={expensesInputId}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={monthlyExpensesInput}
                        onChange={(e) => setTypedExpenses(e.target.value)}
                        // Tidies what was typed. An untouched field stays untouched, or
                        // the default would freeze at the currency it was first shown in;
                        // a cleared or zero field goes back to being untouched.
                        onBlur={() => {
                            if (typedExpenses !== null) setTypedExpenses(monthlyExpenses > 0 ? String(monthlyExpenses) : null);
                        }}
                        onFocus={(e) => e.target.select()}
                        // 44px and 16px text on a touch screen: under 640px, and on a coarse
                        // pointer at any width. A mouse keeps the denser 40px row.
                        className="w-full h-10 max-sm:h-11 pointer-coarse:h-11 pl-8 pr-3 text-sm max-sm:text-base pointer-coarse:text-base tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-shadow"
                        placeholder={defaultExpenses}
                    />
                </div>
                {scenarioResults && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                        <div>That&apos;s <strong className="text-slate-700 dark:text-slate-300 tabular-nums">{formatCurrency(annualExpensesUsd)}/year</strong> in expenses</div>
                        <div>You&apos;d need <strong className="text-gain tabular-nums">{formatCurrency(fireNumberUsd)}</strong> to retire on the 4% rule</div>
                    </div>
                )}
            </div>

            {scenarioResults === null ? (
                // No spending means no target. Every stack "covers" zero, so the cards
                // used to say "Now" while the bar beside them said 0%.
                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
                    Enter what you spend each month to see the result.
                </p>
            ) : (
                <>
                    {/* What is the 4% rule - collapsible */}
                    <details className="mb-4 text-xs sm:text-sm">
                        <summary className="text-slate-500 dark:text-slate-400 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 py-1">
                            What is the 4% rule, and does it apply to Bitcoin?
                        </summary>
                        <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-slate-600 dark:text-slate-400 leading-relaxed space-y-2">
                            <p>
                                A rule of thumb from retirement planning: withdraw 4% of your savings in the first
                                year, raise that amount with inflation each year after, and the pot is meant to last
                                30 years. So {formatCurrency(annualExpensesUsd)}/year in spending means 25x that saved
                                up, or {formatCurrency(fireNumberUsd)}.
                            </p>
                            <p>
                                The figure comes from studies of 30-year retirements funded by US stock-and-bond
                                portfolios. It has not been tested on a single volatile asset like Bitcoin, whose
                                whole price history is shorter than one 30-year retirement.
                            </p>
                            {learnMoreHref && (
                                <Link
                                    href={learnMoreHref}
                                    className="inline-flex min-h-11 items-center font-medium text-amber-700 dark:text-amber-400 hover:underline"
                                >
                                    Why applying it to Bitcoin is contested
                                </Link>
                            )}
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
                        {/* The price behind "You have", named as the spend-down planner names its own. */}
                        <p className="mt-0.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            Your stack is valued at {formatCurrency(livePrice)} per BTC.
                        </p>
                    </div>

                    {/* Scenario cards */}
                    <div className="mb-3">
                        <div className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            If Bitcoin&apos;s price changes each year by...
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {scenarioResults.map((result, index) => (
                                <div
                                    key={index}
                                    className={clsx(
                                        "p-3 sm:p-4 rounded-xl border text-center",
                                        result.rate < 0 && "bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800/50",
                                        result.rate === 0 && "bg-slate-50 border-slate-200 dark:bg-slate-800/40 dark:border-slate-700",
                                        result.rate > 0 && "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/50",
                                    )}
                                >
                                    {/* Three cards across on a tablet are too narrow for the label,
                                        a 44px button and the field in one line, so on a coarse
                                        pointer the label takes a line of its own there. */}
                                    <div className="flex items-center justify-center gap-1.5 mb-1 pointer-coarse:sm:flex-wrap pointer-coarse:sm:gap-x-1">
                                        <span className={clsx(
                                            "text-xs font-bold pointer-coarse:sm:basis-full",
                                            result.rate < 0 && "text-loss",
                                            result.rate === 0 && "text-slate-600 dark:text-slate-300",
                                            result.rate > 0 && "text-gain",
                                        )}>
                                            {priceScenarioLabel(result.rate)}
                                        </span>
                                        <label htmlFor={`${rateFieldId}-${index}`} className="sr-only">
                                            Assumed annual price change for scenario {index + 1}
                                        </label>
                                        {/* Touch screens only: a number pad is not guaranteed a minus
                                            key, and a falling price has to be reachable on any keyboard. */}
                                        <button
                                            type="button"
                                            onClick={() => flipRateAt(index)}
                                            aria-label={`Switch scenario ${index + 1} between a rising and a falling price`}
                                            className="hidden max-sm:inline-flex pointer-coarse:inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-base font-semibold text-slate-700 dark:text-slate-200"
                                        >
                                            <span aria-hidden="true">&plusmn;</span>
                                        </button>
                                        {/* No inputMode here: "decimal" gives iOS a keypad with no
                                            minus key, so a negative rate could not be typed at all.
                                            No select-on-focus either, or the first digit typed would
                                            replace "-20" with a positive number. */}
                                        <input
                                            id={`${rateFieldId}-${index}`}
                                            type="number"
                                            step={5}
                                            min={RATE_MIN}
                                            max={RATE_MAX}
                                            value={rateInputs[index]}
                                            onChange={(e) => setRateAt(index, e.target.value)}
                                            onBlur={() => snapRateAt(index)}
                                            // Compact for a mouse. 44px tall with 16px text on a touch
                                            // screen, and wider under 640px, where each card has a full row.
                                            className="w-14 px-1 py-0.5 text-xs max-sm:w-20 max-sm:px-2 max-sm:h-11 max-sm:text-base pointer-coarse:h-11 pointer-coarse:text-base text-right tabular-nums rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none"
                                        />
                                        {/* slate-600 for the small print in these cards: Tailwind's stock
                                            slate-500 measures 4.34:1 on the rose one, under the 4.5:1 floor. */}
                                        <span className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400">%/yr</span>
                                    </div>
                                    <div className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white">
                                        {result.reached ? (
                                            result.years === 0 ? (
                                                <span className="text-gain">Now</span>
                                            ) : (
                                                <span>{result.years} <span className="text-base">{result.years === 1 ? 'year' : 'years'}</span></span>
                                            )
                                        ) : (
                                            <span className="text-loss text-xl">{MAX_YEARS}+ years</span>
                                        )}
                                    </div>
                                    <div className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 mt-1">
                                        {result.reached
                                            ? result.years === 0
                                                ? "you're already there"
                                                : 'until you can retire'
                                            : 'not on this schedule'
                                        }
                                    </div>
                                    {/* The price this path needs. A rate hides its own size:
                                        +20% a year for 22 years is a 55-fold rise. */}
                                    {result.rate !== 0 && result.years !== 0 && (
                                        <div className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 mt-0.5 tabular-nums">
                                            BTC at{' '}
                                            {formatCompactAmount(
                                                convertFromUsd(impliedPrice(livePrice, result.rate, result.years ?? MAX_YEARS)),
                                                currencyConfig.symbol,
                                            )}{' '}
                                            {result.reached ? 'by then' : `after ${MAX_YEARS} years`}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <p className="mt-2 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                            The starting &minus;20 / 0 / +20 are round numbers chosen to show a loss, no change, and a
                            gain — not forecasts. Edit them. The price under each card is what that rate works out to,
                            starting from {formatCurrency(livePrice)}.
                        </p>
                    </div>

                    {/* Footer note */}
                    <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 text-center">
                        Assumes you keep investing {formatCurrency(annualContribution)}/year,
                        while your spending target rises {(SPENDING_INFLATION_RATE * 100).toFixed(0)}%/year with inflation
                    </div>
                    {/* Set when the display currency's rate is a dated fallback, not today's. */}
                    {rateNote && (
                        <p className="mt-2 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 text-center">{rateNote}</p>
                    )}
                </>
            )}
        </Card>
    );
};
