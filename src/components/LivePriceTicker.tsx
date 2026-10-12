'use client';

import { useSyncExternalStore } from 'react';
import type { TickerQuote } from '@/app/api/live/contract';
import { TICKER_MAX_AGE_MS, useLiveTicker } from '@/components/live/liveTicker';
import { useCurrency } from '@/context/CurrencyContext';
import { PRICE_PROVIDER_LABELS } from '@/data/priceSources';

interface LivePriceTickerProps {
    /** Optional SSR-fetched price so the first paint shows a real number. */
    initialData?: TickerQuote | null;
}

// Did this document come out of a cache rather than off the network just now?
// True when the browser is offline, or when the page carries a `sw-cache`
// Server-Timing entry: public/sw.js puts one on every saved copy it serves
// (asSavedCopy), so this also catches the site being unreachable while the
// browser still counts itself online. The entry's description is the time the
// copy was saved; the banner the worker draws already shows that, so only its
// presence is read here.
// Read once per page load: the answer describes the HTML, which does not change.
let savedCopy: boolean | null = null;
const readSavedCopy = (): boolean => {
    if (savedCopy === null) {
        try {
            const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
            savedCopy = !navigator.onLine || (navigation?.serverTiming ?? []).some(entry => entry.name === 'sw-cache');
        } catch {
            // This runs during render: a browser without the timing API must
            // not take the page down with it.
            savedCopy = false;
        }
    }
    return savedCopy;
};
const subscribeNever = () => () => {};
const notSavedCopy = () => false;

export const LivePriceTicker = ({ initialData = null }: LivePriceTickerProps) => {
    const { formatCurrency, rateNote } = useCurrency();
    const live = useLiveTicker();
    // False on the server and during hydration, so the markup matches.
    const fromSavedCopy = useSyncExternalStore(subscribeNever, readSavedCopy, notSavedCopy);
    // Whether the price on screen was fetched by this page view. Until then it
    // is whatever the HTML carried.
    const confirmed = live.value !== null;
    const data = live.value ?? initialData;

    if (!data) {
        if (live.failures > 0) {
            return (
                <div className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50">
                    <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500" aria-hidden="true" />
                    <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Live price unavailable</span>
                </div>
            );
        }
        return (
            <div className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800/60 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                <span className="h-5 w-32 rounded bg-slate-200 dark:bg-slate-700" />
            </div>
        );
    }

    // All math in USD; formatCurrency converts to the selected currency.
    const changeUsd = data.price - data.open24h;
    const changePct = data.open24h > 0 ? (changeUsd / data.open24h) * 100 : 0;
    const isPositive = changeUsd >= 0;

    const formattedPrice = formatCurrency(data.price);
    const formattedChange = `${isPositive ? '+' : ''}${formatCurrency(changeUsd)}`;

    const changeColor = isPositive
        ? 'text-gain'
        : 'text-loss';

    // When the price is "last known", not live:
    // - two failed refreshes in a row. One dropped 30s poll should not flicker
    //   the pill, but two mean the price is at least a minute old and climbing;
    // - the browser going offline, at once, until a refresh succeeds again;
    // - a refresh that has finished and left a quote too old to be live, which
    //   is what a failed first refresh leaves on a page served from a cache;
    // - a price out of a saved copy of the page, from the start.
    // The dot is aria-hidden, so staleness also needs the visible "last known"
    // text — a color/animation change alone is invisible to screen readers.
    const tooOld = live.settledAt !== null && live.settledAt - data.asOf > TICKER_MAX_AGE_MS;
    const stale = live.failures >= 2 || live.offline || tooOld || (fromSavedCopy && !confirmed);

    return (
        <>
            {/* flex-wrap + max-w-full: a long value (JPY runs to "¥9,588,000" plus a
                signed change and percent) must wrap onto a second line on a 390px
                phone rather than overflow the pill and get clipped. */}
            <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-2.5 gap-y-1 mt-3 px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50">
                <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                    {stale ? (
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-400 dark:bg-slate-500" />
                    ) : (
                        <>
                            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 animate-pulse-dot" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </>
                    )}
                </span>
                <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                    {formattedPrice}
                </span>
                {stale && (
                    <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        last known
                    </span>
                )}
                <span className={`text-xs sm:text-sm font-medium tabular-nums whitespace-nowrap ${changeColor}`}>
                    {formattedChange} ({isPositive ? '+' : ''}{changePct.toFixed(2)}%)
                </span>
                {/* The label comes from the data (changeSince), since the two
                    exchanges measure from different points. Where that point is
                    the start of the UTC day it says so: a visitor in another
                    time zone would read a bare "today" as their own. It names
                    the exchange too, which is not always the one the calculator
                    below prices with: two exchanges differ by a few dollars at
                    the same moment. One unit, so on a phone it wraps whole. */}
                <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {data.changeSince === '24h-ago' ? 'in 24h' : 'since 00:00 UTC'} on {PRICE_PROVIDER_LABELS[data.provider].name}
                </span>
            </div>
            {rateNote && (
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">{rateNote}</p>
            )}
        </>
    );
};
