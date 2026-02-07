'use client';

import { useState, useEffect } from 'react';
import { getCurrentBitcoinPriceWithChange } from '@/app/actions';
import { useCurrency } from '@/context/CurrencyContext';

interface PriceData {
    price: number;
    open24h: number;
}

export const LivePriceTicker = () => {
    const { currencyConfig } = useCurrency();
    const [data, setData] = useState<PriceData | null>(null);

    useEffect(() => {
        let mounted = true;

        const refresh = async () => {
            try {
                const fresh = await getCurrentBitcoinPriceWithChange();
                if (mounted) setData(fresh);
            } catch { /* keep last known */ }
        };

        refresh();
        const interval = setInterval(refresh, 30_000);
        return () => { mounted = false; clearInterval(interval); };
    }, []);

    if (!data) {
        return (
            <div className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800/60 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                <span className="h-5 w-32 rounded bg-slate-200 dark:bg-slate-700" />
            </div>
        );
    }

    const priceConverted = data.price * currencyConfig.rate;
    const openConverted = data.open24h * currencyConfig.rate;
    const change = priceConverted - openConverted;
    const changePct = openConverted > 0 ? (change / openConverted) * 100 : 0;
    const isPositive = change >= 0;

    const formattedPrice = currencyConfig.code === 'JPY'
        ? `${currencyConfig.symbol}${Math.round(priceConverted).toLocaleString()}`
        : `${currencyConfig.symbol}${priceConverted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const formattedChange = currencyConfig.code === 'JPY'
        ? `${isPositive ? '+' : ''}${currencyConfig.symbol}${Math.round(change).toLocaleString()}`
        : `${isPositive ? '+' : ''}${currencyConfig.symbol}${change.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const changeColor = isPositive
        ? 'text-green-600 dark:text-green-400'
        : 'text-red-600 dark:text-red-400';

    return (
        <div className="inline-flex items-center gap-2.5 mt-3 px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50">
            <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tabular-nums">
                {formattedPrice}
            </span>
            <span className={`text-xs sm:text-sm font-medium tabular-nums ${changeColor}`}>
                {formattedChange} ({isPositive ? '+' : ''}{changePct.toFixed(2)}%)
            </span>
        </div>
    );
};
