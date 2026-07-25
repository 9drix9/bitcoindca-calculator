'use client';

import { useState, useEffect, useRef } from 'react';
import { getCurrentBitcoinPriceWithChange } from '@/app/actions';
import { useCurrency } from '@/context/CurrencyContext';

interface PriceData {
    price: number;
    open24h: number; // Kraken's open is the UTC-midnight session open, so the change is "today", not rolling 24h
}

interface LivePriceTickerProps {
    /** Optional SSR-fetched price so the first paint shows a real number. */
    initialData?: PriceData | null;
}

const POLL_MS = 30_000;

export const LivePriceTicker = ({ initialData = null }: LivePriceTickerProps) => {
    const { formatCurrency } = useCurrency();
    const [data, setData] = useState<PriceData | null>(initialData);
    const [failed, setFailed] = useState(false);
    const hadInitialData = useRef(initialData !== null);

    useEffect(() => {
        let mounted = true;
        // SSR data is seconds old at hydration; only fetch immediately when it is missing.
        let lastFetched = hadInitialData.current ? Date.now() : 0;

        const refresh = async () => {
            lastFetched = Date.now();
            try {
                const fresh = await getCurrentBitcoinPriceWithChange();
                if (mounted && Number.isFinite(fresh?.price) && fresh.price > 0) {
                    setData(fresh);
                    setFailed(false);
                }
            } catch {
                if (mounted) setFailed(true); // keep last known price if we have one
            }
        };

        if (!hadInitialData.current) refresh();

        const interval = setInterval(() => {
            if (!document.hidden) refresh();
        }, POLL_MS);
        const onVisibilityChange = () => {
            if (!document.hidden && Date.now() - lastFetched >= POLL_MS) refresh();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            mounted = false;
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, []);

    if (!data) {
        if (failed) {
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
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-rose-600 dark:text-rose-400';

    return (
        // flex-wrap + max-w-full: a long value (JPY runs to "¥9,588,000" plus a
        // signed change and percent) must wrap onto a second line on a 390px
        // phone rather than overflow the pill and get clipped.
        <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-2.5 gap-y-1 mt-3 px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50">
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 animate-pulse-dot" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                {formattedPrice}
            </span>
            {/* Kraken's open resets at UTC midnight, so this is a "today" change, not rolling 24h */}
            <span className={`text-xs sm:text-sm font-medium tabular-nums whitespace-nowrap ${changeColor}`}>
                {formattedChange} ({isPositive ? '+' : ''}{changePct.toFixed(2)}%) today
            </span>
        </div>
    );
};
