'use client';

import { useState, useMemo, useId, useEffect, useRef } from 'react';
import { getBitcoinPriceHistoryWithMeta } from '@/app/actions';
import { calculateDca, priceSeriesCovers, withPriceKinds } from '@/utils/dca';
import { DAY_MS, utcDayStart, utcYearsBefore, formatUtc } from '@/utils/dates';
import { btcToSats, useCurrency } from '@/context/CurrencyContext';
import { Card, CardHeader, EmptyState } from '@/components/ui/Card';
import { limitMessage } from '@/utils/numericInput';
import { useNumericInput } from './useNumericInput';
import type { PricePoint } from '@/types';
import type { PriceProvider } from '@/data/priceSources';

interface OpportunityCostCalculatorProps {
    /**
     * Prices already on the page: the calculator's own window. Used only when
     * they cover the five years this card simulates. Any other window is never
     * used to price it: the engine carries a series' last close forward without
     * limit, so a 2017-2019 window handed to "the last five years" would buy
     * five years of bitcoin at the December 2019 price.
     */
    priceData: PricePoint[];
    livePrice: number | null;
    /** The calculator's price source, for the card's own fetch. */
    provider: PriceProvider;
    /** UTC midnight (ms) of today, from the calculator, so every panel agrees on "today". */
    todayUtcTs: number;
}

const YEARS = 5;

// The card sits far down the Compare tab. Its own five years of prices are a
// request of about 48 KB, queued ahead of the comparison data that is on
// screen first, so it waits until the card is this close to the viewport.
const NEAR_VIEWPORT = '800px 0px';

/** What the custom daily amount may be, in the display currency. */
const CUSTOM_LIMITS = { min: 0.01, max: 1_000_000_000 };

// dailyCost is USD; displayAmount is the USD figure the pill label converts for display.
type Habit = { label: string; dailyCost: number; descriptionKey: 'day' | 'mo' | 'week'; displayAmount: number };

const HABITS: Habit[] = [
    { label: 'Coffee', dailyCost: 5, descriptionKey: 'day', displayAmount: 5 },
    { label: 'Streaming', dailyCost: 0.5, descriptionKey: 'mo', displayAmount: 15 },
    { label: 'Eating Out', dailyCost: 5.71, descriptionKey: 'week', displayAmount: 40 },
    { label: 'Smoking', dailyCost: 10, descriptionKey: 'day', displayAmount: 10 },
];

export const OpportunityCostCalculator = ({ priceData, livePrice, provider, todayUtcTs }: OpportunityCostCalculatorProps) => {
    const { currencyConfig, formatCurrency, formatCompact, denomination, formatBtc } = useCurrency();
    const [selected, setSelected] = useState<string>('Coffee');
    // Entered in the selected display currency; converted to USD before any math.
    const [customAmount, setCustomAmount] = useState<number>(5);
    // The field holds its own text while it is edited (see useNumericInput),
    // so it can be cleared and retyped.
    const customField = useNumericInput(customAmount, setCustomAmount, CUSTOM_LIMITS);
    const customInputId = useId();
    const customLimitId = `${customInputId}-limit`;

    const dailyCostUsd = useMemo(() => {
        if (selected === 'Custom') return customAmount / currencyConfig.rate;
        return HABITS.find(h => h.label === selected)?.dailyCost ?? 5;
    }, [selected, customAmount, currencyConfig.rate]);

    const fiveYearsAgoTs = utcYearsBefore(todayUtcTs, YEARS);
    const pageSeriesCovers = priceSeriesCovers(priceData, fiveYearsAgoTs, todayUtcTs);

    // The card's own five years, fetched only when the page's series is for a
    // different window. `data: null` is a fetch that failed or came back short.
    const fetchKey = `${provider}|${fiveYearsAgoTs}|${todayUtcTs}`;
    const [fetched, setFetched] = useState<{ key: string; data: PricePoint[] | null } | null>(null);
    const habitRow = useRef<HTMLDivElement>(null);
    const [near, setNear] = useState(false);
    // The card renders nothing without a live price, so there is no row to
    // watch until one arrives.
    const shown = !!livePrice;

    useEffect(() => {
        const element = habitRow.current;
        if (pageSeriesCovers || near || !element || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;
                observer.disconnect();
                setNear(true);
            },
            { rootMargin: NEAR_VIEWPORT },
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, [pageSeriesCovers, near, shown]);

    useEffect(() => {
        if (pageSeriesCovers) return;
        // No IntersectionObserver means no way to tell: load straight away.
        if (!near && typeof IntersectionObserver !== 'undefined') return;
        let cancelled = false;
        getBitcoinPriceHistoryWithMeta(fiveYearsAgoTs, todayUtcTs + DAY_MS, provider)
            .then((history) => {
                if (cancelled) return;
                const series = withPriceKinds(history.data, history.kinds);
                setFetched({
                    key: fetchKey,
                    data: priceSeriesCovers(series, Math.max(fiveYearsAgoTs, history.seriesStart), todayUtcTs) ? series : null,
                });
            })
            .catch(() => {
                if (!cancelled) setFetched({ key: fetchKey, data: null });
            });
        return () => {
            cancelled = true;
        };
    }, [pageSeriesCovers, near, fetchKey, fiveYearsAgoTs, todayUtcTs, provider]);

    // undefined while the card's own series is on its way.
    const series: PricePoint[] | null | undefined = pageSeriesCovers
        ? priceData
        : fetched?.key === fetchKey ? fetched.data : undefined;

    const results = useMemo(() => {
        if (!series || series.length === 0 || !livePrice) return null;

        // Only simulate over dates the series actually covers; anything
        // earlier would be priced on fabricated/interpolated data.
        const firstDataTs = utcDayStart(series[0][0]);
        const startTs = Math.max(fiveYearsAgoTs, firstDataTs);
        const truncated = startTs > fiveYearsAgoTs;

        const dcaResult = calculateDca(
            {
                amount: dailyCostUsd,
                frequency: 'daily',
                startDate: new Date(startTs),
                endDate: new Date(todayUtcTs),
                feePercentage: 0,
                priceMode: 'api',
                manualPrice: 0,
            },
            series,
            livePrice,
            todayUtcTs,
        );

        const totalSpent = dcaResult.totalInvested;
        const btcValue = dcaResult.currentValue;
        const multiplier = totalSpent > 0 ? btcValue / totalSpent : 0;
        const sats = btcToSats(dcaResult.btcAccumulated);

        return { totalSpent, btcValue, multiplier, btcAccumulated: dcaResult.btcAccumulated, sats, truncated, startTs };
    }, [dailyCostUsd, series, livePrice, fiveYearsAgoTs, todayUtcTs]);

    if (!livePrice) return null;

    return (
        <Card celebrated className="p-4 sm:p-6">
            <CardHeader
                title="What If You Skipped It?"
                // "Five years" only when the simulation really covers five.
                subtitle={results?.truncated
                    ? `Putting this daily habit into Bitcoin instead, since ${formatUtc(results.startTs, 'full')}:`
                    : 'Five years of putting this daily habit into Bitcoin instead:'}
                className="mb-4"
            />

            {/* Pill buttons */}
            <div ref={habitRow} role="group" aria-label="Daily habit" className="flex flex-wrap gap-1.5 sm:gap-2 mb-4">
                {HABITS.map(h => (
                    <button
                        key={h.label}
                        type="button"
                        onClick={() => setSelected(h.label)}
                        aria-pressed={selected === h.label}
                        className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-full border transition-colors ${
                            selected === h.label
                                ? 'bg-amber-500 text-slate-950 border-amber-500'
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-400'
                        }`}
                    >
                        {/* Full strength: at 75% opacity the amount is 4.06:1 on the white pill. */}
                        {h.label} <span className="text-[11px] tabular-nums">({currencyConfig.symbol}{Math.round(h.displayAmount * currencyConfig.rate).toLocaleString('en-US')}/{h.descriptionKey})</span>
                    </button>
                ))}
                <button
                    type="button"
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
                <div className="mb-4 fade-in">
                    <div className="flex items-center gap-2">
                        <label htmlFor={customInputId} className="sr-only">Custom daily amount ({currencyConfig.code})</label>
                        <span className="text-sm text-slate-500 dark:text-slate-400" aria-hidden="true">{currencyConfig.symbol}</span>
                        <input
                            id={customInputId}
                            type="number"
                            inputMode="decimal"
                            min={CUSTOM_LIMITS.min}
                            step={0.01}
                            aria-describedby={customField.limitHit ? customLimitId : undefined}
                            {...customField.inputProps}
                            className="w-28 h-11 sm:h-10 pointer-coarse:h-11 px-3 text-base sm:text-sm pointer-coarse:text-base tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-shadow"
                        />
                        <span className="text-sm text-slate-500 dark:text-slate-400">/day</span>
                    </div>
                    {/* Always mounted: a live region that arrives with its message is often not read out. */}
                    <p
                        id={customLimitId}
                        role="status"
                        className={customField.limitHit ? 'mt-1 text-[11px] sm:text-xs text-slate-600 dark:text-slate-300' : 'sr-only'}
                    >
                        {customField.limitHit
                            ? limitMessage('The daily amount', customField.limitHit, (n) => `${currencyConfig.symbol}${n.toLocaleString('en-US')}`)
                            : ''}
                    </p>
                </div>
            )}

            {/* Results */}
            {results && (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-3 text-center">
                            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mb-0.5">Total Spent</div>
                            <div className="text-sm sm:text-lg font-bold text-slate-800 dark:text-white tabular-nums">
                                <span className="sm:hidden">{formatCompact(results.totalSpent)}</span>
                                <span className="hidden sm:inline">{formatCurrency(results.totalSpent)}</span>
                            </div>
                        </div>
                        <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-3 text-center">
                            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mb-0.5">BTC Value Today</div>
                            <div className="text-sm sm:text-lg font-bold text-gain tabular-nums">
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
                        {/* Follows the Units switch above the results, like every other bitcoin figure. */}
                        <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-3 text-center">
                            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mb-0.5">
                                {denomination === 'SATS' ? 'Sats Stacked' : 'BTC Stacked'}
                            </div>
                            <div className="text-sm sm:text-lg font-bold text-slate-800 dark:text-white tabular-nums">
                                {denomination === 'SATS'
                                    ? results.sats.toLocaleString('en-US')
                                    : formatBtc(results.btcAccumulated).replace(/ BTC$/, '')}
                            </div>
                        </div>
                    </div>
                    <p className="mt-3 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                        One buy every day from {formatUtc(results.startTs, 'full')} to today, with no fee, valued at
                        the live price.
                        {results.truncated && ' The price history only reaches back that far, so that is where this starts.'}
                    </p>
                </>
            )}

            {/* The card's own series is still loading: hold the tiles' space so
                nothing below jumps when the figures arrive. */}
            {series === undefined && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-hidden="true">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-[62px] sm:h-[70px] rounded-xl bg-slate-100 dark:bg-slate-800/60 animate-pulse" />
                    ))}
                </div>
            )}

            {/* No figure is better than one priced on the wrong window. */}
            {series === null && (
                <EmptyState hint="This card needs the last five years of prices and they could not be loaded.">
                    Price history unavailable
                </EmptyState>
            )}
        </Card>
    );
};
